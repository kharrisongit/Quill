# Quill

**Your story, one beat at a time.**

Quill is a novel-writing workspace for **iPhone, iPad, and the browser**. Build a bookshelf, keep your story's world in its Codex, and move between writing by hand and AI assistance whenever you need it. Your manuscript stays on your device by default.

**[Open Quill in your browser](https://kharrisongit.github.io/Quill/)** · **[Download the iPhone app](https://github.com/kharrisongit/Quill/releases/latest)** · **[kharrison Apps AltStore source](https://raw.githubusercontent.com/kharrisongit/utube/main/source/apps.json)**

## A bookshelf of your own

- An illustrated home screen with **BOOKSHELF** and **SETTINGS**.
- Every book appears on an animated shelf with its own title, cover color, and optional uploaded cover.
- Open a book to reach **CODEX**, **WRITE!**, and that book's **DRAFTS**.
- Custom artwork, book-opening transitions, recognizable action icons, light and dark appearance, and reduced-motion support.
- Settings covers shared preferences, model management, API connections, and backup/sync. Drafts belong to individual books.

The open book shows **CODEX** and **WRITE!** on its page. Codex flips toward the front; Write flips toward the last edited section and restores your saved position. In the editor, Codex sits above the writing page. The sidebar contains book sections and practical book options.

A small sample novel is included so you can explore immediately. Choose **New book** to start your own.

## Write at your own pace

The normal manuscript editor is the default. Write freely with headings, bold, italic, underline, lists, quotations, scene breaks, undo/redo, focus mode, and automatic offline English spell checking with red underlines, tap-to-fix suggestions, and a personal dictionary. Text size is adjustable from **Text size** in the writing tools and saved on your device. Organize sections with titles, synopses, status, reordering, Find & Replace for a section or the whole book, word counts, and writing goals.

**Page break** inserts a visible divider at the cursor and creates a new page in Word, EPUB, and print/HTML exports (a form-feed in plain text). Find & Replace opens above the manuscript: type a word or phrase, use the previous/next arrows to visit highlighted matches across sections, then replace them one at a time. **Replace all** is an optional checkbox. Matching supports case and whole-word options and preserves formatting, beat boundaries, and earlier versions. Automatic spelling works without an AI model or internet connection; tap an underlined word for corrections or remember it. Turn live checking off in writer preferences to review later with the manual **Spell Check** button.

When you want help:

1. Choose **Generate** to open the chapter beat planner. Write a map yourself or ask your selected model for a suggestion, then edit the plan.
2. Save the plan to add empty beats after your existing prose. Generate each beat individually when you're ready.
3. Use **Show beats** to reveal editable blocks with their own directions, generation controls, and **Revise with AI** actions. **Hide beats** returns to continuous writing.
4. Press **Generate next beat** below the manuscript to continue from the story and Codex. Add an optional description to steer it, or start a blank beat and write it yourself.
5. Select a word, sentence, or paragraph and choose the **Revise** pop-up above the selection for a focused change.

Review generated text before applying it. Quill keeps saved drafts and revisions, preserves partial output when generation is stopped, and prevents stale suggestions from replacing writing that changed during a request. A prose request generates one beat at a time; it does not automatically continue through the chapter. Word targets are approximate.

## The Codex: your story's reference

Each book has its own **Story summary**, **Plot beats**, **Writing style**, **Characters**, and **Plot holes**. Writing tools draw on the Codex and relevant manuscript context, with long material condensed to fit the chosen model.

- **Characters:** build profiles yourself or generate editable suggestions. Record appearance, personality, backstory, motivation, relationships, and character arcs.
- **Portraits:** upload a character image anywhere, or use **Generate portrait** with Apple Image Playground on supported iPhones and iPads. Manually created characters can use the same portrait tool.
- **Generate next beat:** ask for a proposed story development, edit it, and add it to your plot when ready.
- **Update from manuscript:** read the manuscript for missing context, developments, and character details. Review and edit proposed additions before saving. Existing character details are retained; ambiguous name matches need review.
- **Plot-hole review:** scan for possible contradictions and missing causal links, review the evidence and suggested fixes, and mark findings **Open**, **Resolved**, or **Dismissed**. Findings stay separate from established story facts.

Scans read every nonempty manuscript section in bounded passages. Longer books can take many model requests. AI can misread deliberate mysteries or miss inconsistencies, so findings remain suggestions for the author to assess.

## The whole book, from first page to last

Add and reorder **title page, copyright, dedication, epigraph, contents, foreword, preface, introduction, prologue, chapters, interludes, epilogue, afterword, acknowledgments, appendix, glossary, bibliography, about the author**, and custom sections.

Editable templates help with the title page, copyright page, and contents. The contents template is a snapshot of the current section titles. All sections export together; an explicit title page replaces the automatically generated export title page.

Export **Word (.docx), EPUB, formatted HTML, plain text**, or use **print/PDF**. Full JSON backups preserve your workspace, including notes, images, and revision history. Exports use each section's current draft; review any parallel versions before exporting.

## Drafts and storage

Open **DRAFTS** inside a book to review saved beat maps, AI writing attempts, and Codex suggestions. Search, filter, export, and select drafts for permanent deletion when you no longer need them.

Draft cleanup removes the selected text and its saved checkpoints while preserving manuscript text and Codex details already applied. Compact deletion records prevent older backups or late synced edits from restoring discarded drafts. Previously exported backups retain their own copies. Keep all synced devices updated for consistent cleanup.

Normal manuscript revision history and recoverable deleted books, sections, and notes remain available separately.

## Choose your writing model

**Manage Models** lets you select, download, update, or remove models. Downloads show a percentage beside the model name and a progress bar. Storage information helps you decide what to keep; deletion removes the model's installed files, older copies, and partial downloads without deleting your books.

| Platform | Built-in choices |
| --- | --- |
| iPhone / iPad | Apple Intelligence; Qwen 3 0.6B and 1.7B; Llama 3.2 1B and 3B; Gemma 3 1B |
| Compatible WebGPU browser | Qwen 3 0.6B and 1.7B; Llama 3.2 1B and 3B; SmolLM2 1.7B |

Apple Intelligence requires a supported device with iOS 26 or later and the feature enabled. Its downloads are managed by iOS. Other local models need an initial download and sufficient storage and memory; larger models need more memory. Native installed models run locally without AI usage fees. Browser offline availability depends on retained caches. Apple controls Image Playground availability and usage limits.

**Connect a model API** supports OpenAI-compatible Chat Completions and Anthropic Messages. Supply a display name, HTTPS base URL, model ID, and optional API key, then save and test the connection. Compatible local servers can also be used. Other API formats require an adapter; browser connections require CORS support and may use HTTP localhost. Provider charges may apply.

API connections are device settings, excluded from book backups and sync. iPhone keys use device-only Keychain storage; browser keys last for the tab session. API generation sends relevant story text to the server you choose. Keep Quill open during generation; backgrounding stops the workflow and retains saved partial text.

Model updates install separately and become active only after loading successfully. A failed or cancelled update preserves the working version. New model architectures require app support. Built with Llama; models retain their respective [Llama](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE.txt), [Gemma](https://ai.google.dev/gemma/terms), [Qwen](https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE), and [SmolLM2](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/blob/main/LICENSE) terms.

## Install on iPhone or iPad

Add the shared **kharrison Apps** source in AltStore Classic:

```text
https://raw.githubusercontent.com/kharrisongit/utube/main/source/apps.json
```

Find **Quill** there, or download `Quill.ipa` from [the latest release](https://github.com/kharrisongit/Quill/releases/latest) and open it in AltStore Classic. Requires iOS 16 or later; AI features have additional device requirements. AltStore signs the app with your account, and installation/refresh restrictions depend on your setup.

Quill's [component feed](https://raw.githubusercontent.com/kharrisongit/Quill/main/source/apps.json) is maintained in this repository and imported into the shared source. You only need the shared source to receive updates.

## Saving, privacy, and sync

Quill saves automatically to native files on iPhone/iPad or IndexedDB in the browser. The app bundles the writing workspace for offline use; the browser caches it after a successful online visit. There is no Quill account or analytics. Public GitHub hosting receives no manuscripts.

Local models process text on your device. Model downloads/update metadata come from Hugging Face; browsers also fetch the pinned WebLLM runtime. Those downloads do not send manuscript text. Optional model APIs receive relevant story text, and Apple's portrait interface receives the character description.

For optional folder sync:

1. In the iPhone app, open **Backup & sync → Connect folder** and choose a folder in iCloud Drive.
2. On a Mac or PC with that folder locally synced, open Quill in desktop Chrome or Edge and connect the same folder.
3. Connect other devices to that folder and use **Sync now** after switching devices.

Sync runs while Quill is open. Different document edits merge independently; concurrent edits to the same document remain as parallel drafts in **Version history**. Restoring an older version creates a new revision. Safari and mobile browsers use backup import/export instead of live folder access. Saving to a sync folder confirms the local write; delivery depends on your cloud provider.

Keep periodic backups. Clearing browser data or uninstalling the app removes local writing. Quill does not add end-to-end encryption to sync files. A revision has a 4 MB limit, and the interface rejects imports above 100 MB. If saving fails, keep the app open and copy or export your writing before closing it.

## Development and releases

The app, browser workspace, release workflow, and component feed live in this repository. The editor has no npm build dependencies. Native builds use Xcode 26, XcodeGen, and pinned Swift packages. Native inference uses MLX; browser inference uses WebLLM in a worker.

```sh
node --test Tests/*.test.mjs
python3 -m unittest discover -s scripts -p 'test_update_source.py'
python3 scripts/bundle.py
python3 -m http.server --directory docs 8080
```

Edit the source modules and styles in `docs/`, then commit the regenerated `docs/app.bundle.js`. Increment the service-worker cache name when shipping web assets. Close all Quill tabs and reopen to activate an installed browser update. GitHub Pages serves `docs/` from `main`.

On macOS with Xcode selected:

```sh
QUILL_VERSION=1.0.9 QUILL_BUILD=19 bash build.sh
# Optional simulator smoke check, only when explicitly wanted:
bash smoke.sh
```

Normal release CI runs the data/publisher tests, phone-sized browser workflows, and the device build, then publishes the IPA and refreshes the AltStore source. **Simulator checks are skipped by default** so device testing can happen sooner. A manually dispatched workflow can enable `run_simulator`; the optional check covers native launch, saved revisions, and draft-file cleanup. Default releases use a screenshot from the browser checks; a requested simulator run replaces it with a simulator screenshot.

`source/app.json` supplies the current listing copy. The publisher refreshes that copy while preserving published assets and older versions. Metadata-only updates can edit the current feeds without rebuilding or changing the installed app version.

The app does not currently provide live co-author cursors/comments, DOCX/EPUB import, or professional print typesetting. Notes are plain text; PDF uses the platform print sheet. Physical-device model performance, AltStore installation, iCloud delivery, and ebook reader rendering need device testing.

Select writing to see **Revise** above it. A sentence or passage also offers **Rephrase**, while a single word offers **Synonyms**. These use your selected writing model to propose alternatives in a pop-up; tap one to replace only that selection. Generated-beat suggestions have a larger, resizable editing area, and highlighted beat blocks provide more space for writing.

In **Settings → Beat generation**, customize the default prompt sent with every story beat, or restore Quill’s default. It calls for clear prose, varied phrasing, fewer clichés, concrete action and consequences, and continuity of location and completed actions. Generation includes the exact recent ending alongside condensed earlier context and marks written versus upcoming beats. Preferences are device-wide; the Codex retains each book’s voice and facts. Model quality still affects the result.
