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

## Codex and characters

Every book has a **Codex** with **Story summary**, **Plot beats**, **Writing style**, and **Characters**. Existing book summaries, plot beats, and Character cards are reused without destructive migration. Character profiles support manual creation, AI suggestions, editable structured details, revision history, and portraits. Images are resized to 512 px and included in revisions/backups/sync; they are never sent to the text model.

**Generate next beat** proposes one beat for review; **Add beat to plot** appends the edited suggestion. Character suggestions also require **Apply character details**. Chapter outlines, chapter prose, characters, and next beats share the Codex context builder. Long material is condensed without changing originals.

On supported iPhones/iPads, **Generate portrait** opens Apple Image Playground with the character’s appearance. The user previews and accepts an image; manual characters use the same button. Apple controls availability and usage limits. No separate API key or Quill backend is required. Image upload remains available everywhere. This uses the Image Playground UI API, not the deprecated non-UI ImageCreator API.

## Models and connections

Open **Manage Models** from a book’s sidebar or Settings. Download, update, select or delete individual models. Deletion releases loaded weights and removes that model’s current, older and partial downloads without removing manuscripts. iPhone storage reports allocated bytes; browsers measure available cache headers and label unreported sizes. Apple Intelligence storage is managed in iOS Settings.

- Native: Apple Intelligence, Qwen 3 0.6B/1.7B, Llama 3.2 1B/3B, Gemma 3 1B.
- Browser with WebGPU: Qwen 3 0.6B/1.7B, Llama 3.2 1B/3B, SmolLM2 1.7B.
- Model architectures and conversions must be supported by the pinned runtime. SmolLM2’s verified small browser conversion is offered on the web; Gemma’s integration is native-only. Larger models require more device memory. Built with Llama; models retain their respective [Llama](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE.txt), [Gemma](https://ai.google.dev/gemma/terms), [Qwen](https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE), and [SmolLM2](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/blob/main/LICENSE) terms.

**Connect a model API** supports OpenAI-compatible chat completions (including compatible local servers) and Anthropic Messages. Supply a display name, HTTPS base URL including the version path, model ID, and optional API key. Save & test sends a short test without book data. Other HTTP formats need an adapter. Provider charges may apply. The browser requires provider CORS support and also accepts HTTP localhost; the iPhone app uses HTTPS URLSession requests.

API profiles are device settings, excluded from book backups and sync. iPhone keys are stored in device-only Keychain items. Browser keys use sessionStorage, so must be entered again in a new tab session. Changing an endpoint clears its old key unless a new one is supplied. Requests reject redirects; keys and provider error bodies are not logged. Using an API model sends prompts and relevant Codex context to the chosen server, unlike local models.

## Chapter writing

Open a book’s **Codex → Plot beats** section to save its complete plot and optional writing preferences. These autosave with the book and are included in backup, sync and version history. In a chapter, choose **Write chapter**, select a model, enter the events for that chapter and choose an approximate length (500–3,000 words). The writer opens as a full-screen workspace. Choose **Generate outline**, edit the proposed beats and ending, then choose **Approve outline & write chapter**. No chapter prose is generated before that explicit approval; you can also type your own outline.

- **Apple Intelligence**: iPhone/iPad with iOS 26+, a supported device, and Apple Intelligence enabled and ready. No separate Quill model download.
- **Qwen 3 1.7B / 0.6B**: selectable in the native app and supported WebGPU browsers. Native inference uses MLX; browsers use WebLLM in a worker. First use downloads approximately 1 GB / 400 MB on iPhone, or 1.2 GB / 0.5 GB in the browser. Runtime GPU memory requirements are larger than the downloads. Older or low-memory devices may only handle the smaller model.

All built-in local text models have no AI API or per-chapter fees. Qwen downloads require internet; native installed models load locally thereafter. Browser caches may be cleared by the browser, so offline availability is not guaranteed. Keep the app/tab open while writing. Backgrounding pauses the workflow by stopping it and keeping saved partial text.

The writer reads the full plot, story notes, earlier chapter synopses and the preceding chapter’s ending. Long planning material is condensed, with all chunks read, before the chapter is generated in connected parts. The full original plot is never replaced by the model’s summary. A word target is approximate, and small local models can still make continuity and prose mistakes.

Outlines autosave as you edit and survive reopening. Keep an approved outline within the visible 2,400-character limit so it can be sent unchanged with each prose request. Overlong generated outlines are shown in full for you to shorten; Quill never silently summarizes an approved outline. Editing the inputs of a finished draft creates a separate attempt.

Outlines and generated drafts are saved separately from manuscript chapters, including partial results after stopping or an error. **Use draft & edit** creates a manuscript revision only after review. If the chapter changed while the draft was being written, Quill adds a separate chapter instead of replacing it. Older generated drafts remain selectable in the writing panel.

**Check model updates** checks the selected model’s repository revision. **Download update** installs a separate pinned revision and advances the active version only after it loads successfully; a failed or cancelled update preserves the installed pointer. New architectures/model families require an app integration update. Models are not included in manuscript exports or backups.

Tapping outside a sidebar or dialog dismisses it. The full-screen writer remains open during outline/chapter generation or model downloads; **Stop & keep draft** ends the operation deliberately. Ordinary dialog close buttons and Escape follow the same rule.

## iPhone installation

Download `Quill.ipa` from this repository's latest release and open it in **AltStore Classic**. AltStore signs it with your account. The app requires iOS 16 or later; installation/refresh restrictions depend on your AltStore setup.

Quill’s component feed (also imported by the shared **kharrison Apps** source): `https://raw.githubusercontent.com/kharrisongit/Quill/main/source/apps.json`

The app bundles the complete browser workspace inside a native WKWebView shell. It opens offline, persists revisions as atomic files in Application Support, and adds native Files selection, sharing, importing, and printing. It has its own bundle ID: `com.kharrison.quill`.

## Saving and sync

Writing stays on your device by default. The browser uses IndexedDB. The iPhone app uses native files. The public GitHub repository and Pages hosting receive **no manuscripts**. There is no Quill account or analytics. Local models process writing on the device and fetch weights/update metadata from Hugging Face; browsers also fetch the pinned WebLLM runtime. Manuscript text is not sent to these download services. Optional user-configured model APIs receive relevant story text. Apple Image Playground receives the portrait description through Apple’s system interface.

1. Open **Backup & sync → Connect folder** in the iPhone app and select a folder in **iCloud Drive**, not On My iPhone.
2. On a Mac or PC with that folder locally synced, open the web app in desktop **Chrome or Edge**, choose **Connect folder**, and select the same folder.
3. Connect other iPhones/iPads to the same folder. Use **Sync now** after opening another device, and let its cloud provider download files.

Quill creates a `Quill-revisions` subfolder with immutable JSON files. Different chapter edits merge independently. Concurrent edits to the same document remain as parallel drafts in **Version history**. Restoring a version creates a new revision; older writing stays available. Sync runs once a minute while the app is open and connected. Browser folders must be selected again after reopening. An iPhone folder bookmark is remembered.

Safari and mobile browsers do not expose the required live directory access; use **Export backup / Import backup** there. This is folder-based exchange through your provider, not a direct iCloud web API. “Saved to sync folder” confirms a local provider write, not delivery to another device. A disconnected or unavailable provider leaves local writing available.

**Keep periodic backups.** Clearing browser data or uninstalling the app removes local drafts. Files are not end-to-end encrypted by Quill; use your provider's normal privacy controls. History is retained rather than pruned. Split extremely large chapters; a revision has a 4 MB limit. Imports above 100 MB are rejected by the interface. If a save fails, keep the app open and copy/export writing before closing it.

## Development

The editor has no npm build dependencies. Native builds use Xcode 26, XcodeGen and pinned Swift packages for MLX/Qwen. `project.yml` generates the Xcode project. The browser lazily imports WebLLM 0.2.85 only when Qwen is requested.

```sh
node --test Tests/*.test.mjs
python3 -m unittest discover -s scripts -p 'test_update_source.py'
python3 scripts/bundle.py
python3 -m http.server --directory docs 8080
```

Edit the source modules in `docs/` (including `ai.js` and `ai-runtime.js`) and `style.css`. The deterministic bundler generates `docs/app.bundle.js`, a classic script compatible with the native local-file webview. Commit the generated bundle with source changes. Increment the service-worker cache name when shipping web assets; close all open Quill tabs and reopen to activate an installed update.

On macOS with Xcode selected:

```sh
QUILL_VERSION=1.0.0 QUILL_BUILD=1 bash build.sh
bash smoke.sh
```

The device build produces `build/Quill.ipa` for AltStore re-signing. CI validates revision merging and publisher behavior, builds device and simulator binaries, and checks that the bundled web app can save through its native bridge and reload from disk before publishing a release. GitHub Pages serves the `docs` directory from `main`.

## Boundaries of this first release

No live co-author cursors/comments, editorial marketplace, imported DOCX/EPUB parsing, or professional print typesetting service. Notes are plain text; the chapter editor preserves its supported formatting. PDF uses the platform print sheet. Physical-device AltStore installation, iCloud propagation, and third-party ebook reader rendering require device checks beyond the automated build and simulator gate.
