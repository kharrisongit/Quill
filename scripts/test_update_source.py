"""Check first publication, repeat publication, and mismatched IPA rejection."""
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).with_name("update_source.py")


class UpdateSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.feed = self.root / "apps.json"
        self.template = self.root / "app.json"
        self.ipa = self.root / "Quill.ipa"
        self.feed.write_text(json.dumps({"name": "Test source", "apps": [], "news": []}))
        self.template.write_text(json.dumps({
            "name": "Quill", "bundleIdentifier": "com.kharrison.quill",
            "developerName": "Test", "iconURL": "https://example.com/icon.png",
        }))
        self.write_ipa()

    def write_ipa(self, bundle="com.kharrison.quill", version="1.12.1"):
        with zipfile.ZipFile(self.ipa, "w") as archive:
            archive.writestr("Payload/Quill.app/Info.plist", plistlib.dumps({
                "CFBundleIdentifier": bundle,
                "CFBundleShortVersionString": version,
                "CFBundleVersion": "123", "MinimumOSVersion": "12.0",
            }))

    def publish(self, size=None, extra=()):
        return subprocess.run([
            sys.executable, str(SCRIPT), "--file", str(self.feed),
            "--app-template", str(self.template), "--ipa", str(self.ipa),
            "--version", "1.12.1", "--size", str(size or self.ipa.stat().st_size),
            "--date", "2026-10-12T06:30:00Z", "--download-url",
            "https://github.com/kharrisongit/Quill/releases/download/1.12.1/Quill.ipa",
        ] + list(extra), capture_output=True, text=True, check=False)

    def test_first_release_populates_empty_source(self):
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(self.feed.read_text())
        app = data["apps"][0]
        latest = app["versions"][0]
        self.assertEqual(latest["buildVersion"], "123")
        self.assertEqual(latest["version"], "1.12.1")
        self.assertEqual(latest["size"], self.ipa.stat().st_size)
        self.assertEqual(latest["downloadURL"], app["downloadURL"])
        self.assertEqual(data["news"][0]["appID"], app["bundleIdentifier"])
        self.assertEqual(data["news"][0]["url"],
                         "https://github.com/kharrisongit/Quill/releases/tag/1.12.1")

    def test_fork_name_and_icon_are_preserved(self):
        template = json.loads(self.template.read_text())
        template["name"] = "Quill"
        template["iconURL"] = "https://example.com/Quill-icon.png"
        self.template.write_text(json.dumps(template))
        self.assertEqual(self.publish().returncode, 0)
        data = json.loads(self.feed.read_text())
        self.assertEqual(data["news"][0]["title"], "Quill 1.12.1")
        self.assertEqual(data["apps"][0]["iconURL"], template["iconURL"])

    def test_updating_Quill_keeps_other_apps_and_news(self):
        other = {"name": "Dragonrider", "bundleIdentifier": "com.kharrison.lastdragonrider",
                 "versions": [{"version": "1.12.1", "size": 99}]}
        data = {"apps": [other], "news": [{"identifier": "com.kharrison.lastdragonrider.release-1.12.1",
                "appID": "com.kharrison.lastdragonrider", "title": "Game update"}]}
        self.feed.write_text(json.dumps(data))
        self.assertEqual(self.publish().returncode, 0)
        result = json.loads(self.feed.read_text())
        self.assertEqual(result["apps"][0], other)
        self.assertEqual(len(result["apps"]), 2)
        self.assertEqual(result["news"][1], data["news"][0])
        self.assertEqual(self.publish().returncode, 0)
        self.assertEqual(len(json.loads(self.feed.read_text())["apps"]), 2)

    def test_repeated_publication_has_one_version_and_news_item(self):
        self.assertEqual(self.publish().returncode, 0)
        self.assertEqual(self.publish().returncode, 0)
        data = json.loads(self.feed.read_text())
        self.assertEqual(len(data["apps"][0]["versions"]), 1)
        self.assertEqual(len(data["news"]), 1)

    def legacy_source(self):
        legacy = {"name": "Quill", "bundleIdentifier": "com.verback.YTLite",
                  "versions": [{"version": "1.12.0", "downloadURL": "https://example.com/old.ipa"}]}
        other = {"name": "Dragonrider", "bundleIdentifier": "com.kharrison.lastdragonrider",
                 "versions": [{"version": "1.0.1", "size": 99}]}
        game_news = {"identifier": "game-update", "appID": other["bundleIdentifier"]}
        self.feed.write_text(json.dumps({"name": "kharrison Apps", "apps": [legacy, other],
                             "news": [{"identifier": "old", "appID": legacy["bundleIdentifier"]}, game_news]}))
        return other, game_news

    def test_new_identity_retires_old_binaries_and_preserves_game(self):
        other, game_news = self.legacy_source()
        extra = ["--replace-bundle-id", "com.verback.YTLite"]
        result = self.publish(extra=extra)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(self.feed.read_text())
        self.assertEqual(data["name"], "kharrison Apps")
        self.assertEqual(len(data["apps"]), 2)
        self.assertEqual(data["apps"][1], other)
        self.assertEqual(data["apps"][0]["bundleIdentifier"], "com.kharrison.quill")
        self.assertEqual([v["version"] for v in data["apps"][0]["versions"]], ["1.12.1"])
        self.assertEqual(data["news"][1:], [game_news])
        self.assertEqual(self.publish(extra=extra).returncode, 0)
        self.assertEqual(json.loads(self.feed.read_text()), data)

    def test_old_identity_is_not_retired_if_new_binary_is_wrong(self):
        self.legacy_source()
        original = self.feed.read_bytes()
        self.write_ipa(bundle="com.verback.YTLite")
        result = self.publish(extra=["--replace-bundle-id", "com.verback.YTLite"])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.feed.read_bytes(), original)

    def test_rejects_wrong_app_without_changing_source(self):
        original = self.feed.read_bytes()
        self.write_ipa(bundle="com.example.wrong")
        self.assertNotEqual(self.publish().returncode, 0)
        self.assertEqual(self.feed.read_bytes(), original)

    def test_rejects_wrong_version_without_changing_source(self):
        original = self.feed.read_bytes()
        self.write_ipa(version="1.12.0")
        self.assertNotEqual(self.publish().returncode, 0)
        self.assertEqual(self.feed.read_bytes(), original)

    def test_rejects_wrong_size_without_changing_source(self):
        original = self.feed.read_bytes()
        self.assertNotEqual(self.publish(size=1).returncode, 0)
        self.assertEqual(self.feed.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
