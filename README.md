# Quill

A calm, offline novel-writing workspace for **iPhone, iPad, and the browser**. This is Quill's own repository: the app, website, release workflow, and AltStore feed all live here.

**[Open Quill in your browser](https://kharrisongit.github.io/Quill/)** · **[Download the iPhone app](https://github.com/kharrisongit/Quill/releases/latest)**

Inspired by the book-centered workflow of Reedsy Studio, with an original interface and no affiliation with Reedsy.

## Writing tools

- Multiple books, author names, cover colors, manuscript goals, and session goals.
- Chapter sidebar, reordering, outline, status, and synopsis.
- Rich-text prose with headings, bold, italic, underline, lists, quotations, scene breaks, undo/redo, focus mode, and platform spell checking.
- Character, place, idea, and research cards.
- Manuscript search and word counts.
- Automatic local saving, saved revision history, explicit parallel-draft resolution, and recoverable deleted books/chapters/notes.
- DOCX, EPUB 3, HTML, TXT, print/PDF, and full JSON backups. Export uses the current draft of each chapter; review any parallel drafts before exporting.
- Light/dark appearance, responsive iPhone layout, and offline browser caching after the first successful online visit.

A small sample novel is included so the workspace can be explored immediately. Create **New book** to start your own.

## iPhone installation

Download `Quill.ipa` from this repository's latest release and open it in **AltStore Classic**. AltStore signs it with your account. The app requires iOS 16 or later; installation/refresh restrictions depend on your AltStore setup.

Dedicated AltStore source: `https://raw.githubusercontent.com/kharrisongit/Quill/main/source/apps.json`

The app bundles the complete browser workspace inside a native WKWebView shell. It opens offline, persists revisions as atomic files in Application Support, and adds native Files selection, sharing, importing, and printing. It has its own bundle ID: `com.kharrison.quill`.

## Saving and sync

Writing stays on your device by default. The browser uses IndexedDB. The iPhone app uses native files. The public GitHub repository and Pages hosting receive **no manuscripts**. There is no account, analytics, external editor library, AI service, or backend.

1. Open **Backup & sync → Connect folder** in the iPhone app and select a folder in **iCloud Drive**, not On My iPhone.
2. On a Mac or PC with that folder locally synced, open the web app in desktop **Chrome or Edge**, choose **Connect folder**, and select the same folder.
3. Connect other iPhones/iPads to the same folder. Use **Sync now** after opening another device, and let its cloud provider download files.

Quill creates a `Quill-revisions` subfolder with immutable JSON files. Different chapter edits merge independently. Concurrent edits to the same document remain as parallel drafts in **Version history**. Restoring a version creates a new revision; older writing stays available. Sync runs once a minute while the app is open and connected. Browser folders must be selected again after reopening. An iPhone folder bookmark is remembered.

Safari and mobile browsers do not expose the required live directory access; use **Export backup / Import backup** there. This is folder-based exchange through your provider, not a direct iCloud web API. “Saved to sync folder” confirms a local provider write, not delivery to another device. A disconnected or unavailable provider leaves local writing available.

**Keep periodic backups.** Clearing browser data or uninstalling the app removes local drafts. Files are not end-to-end encrypted by Quill; use your provider's normal privacy controls. History is retained rather than pruned. Split extremely large chapters; a revision has a 4 MB limit. Imports above 100 MB are rejected by the interface. If a save fails, keep the app open and copy/export writing before closing it.

## Development

No npm dependencies or Xcode project are required.

```sh
node --test Tests/*.test.mjs
python3 -m unittest discover -s scripts -p 'test_update_source.py'
python3 scripts/bundle.py
python3 -m http.server --directory docs 8080
```

Edit `docs/app.js`, `core.js`, `storage.js`, `export.js`, and `style.css`. The deterministic bundler generates `docs/app.bundle.js`, a classic script compatible with the native local-file webview. Commit the generated bundle with source changes. Increment the service-worker cache name when shipping web assets; close all open Quill tabs and reopen to activate an installed update.

On macOS with Xcode selected:

```sh
QUILL_VERSION=1.0.0 QUILL_BUILD=1 bash build.sh
bash smoke.sh
```

The device build produces `build/Quill.ipa` for AltStore re-signing. CI validates revision merging and publisher behavior, builds device and simulator binaries, and checks that the bundled web app can save through its native bridge and reload from disk before publishing a release. GitHub Pages serves the `docs` directory from `main`.

## Boundaries of this first release

No live co-author cursors/comments, editorial marketplace, imported DOCX/EPUB parsing, or professional print typesetting service. Notes are plain text; the chapter editor preserves its supported formatting. PDF uses the platform print sheet. Physical-device AltStore installation, iCloud propagation, and third-party ebook reader rendering require device checks beyond the automated build and simulator gate.
