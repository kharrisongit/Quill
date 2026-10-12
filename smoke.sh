#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bash build.sh simulator
DEVICE=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(v["udid"] for devices in d["devices"].values() for v in devices if v["name"].startswith("iPhone")))')
xcrun simctl boot "$DEVICE" || true
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" build/simulator/Quill.app
xcrun simctl launch "$DEVICE" com.kharrison.quill --smoke-test
DATA=$(xcrun simctl get_app_container "$DEVICE" com.kharrison.quill data)
for attempt in {1..30}; do
  if [ -f "$DATA/Library/Application Support/quill-ready.txt" ]; then break; fi
  sleep 2
done
test -f "$DATA/Library/Application Support/quill-ready.txt"
python3 - "$DATA" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])/'Library/Application Support/QuillRevisions'
records=[json.loads(p.read_text()) for p in root.glob('*.json')]
assert len(records)>=6,'Bundled JavaScript failed to save sample records through the native bridge'
assert any(r['body']['type']=='chapter' for r in records)
print(f'Native editor ready: {len(records)} revisions persisted successfully.')
PY
xcrun simctl io "$DEVICE" screenshot build/quill-screenshot.png
xcrun simctl terminate "$DEVICE" com.kharrison.quill
rm "$DATA/Library/Application Support/quill-ready.txt"
xcrun simctl launch "$DEVICE" com.kharrison.quill --smoke-test
for attempt in {1..20}; do
  if [ -f "$DATA/Library/Application Support/quill-ready.txt" ]; then break; fi
  sleep 2
done
test -f "$DATA/Library/Application Support/quill-ready.txt"
xcrun simctl terminate "$DEVICE" com.kharrison.quill
