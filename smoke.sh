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
python3 - "$DATA" <<'PYTEST'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])/'Library/Application Support/QuillRevisions'
body=dict(type='card',book='sample-book',category='Generated draft',chapter='sample-chapter-1',sourceRevision='sample-chapter-1-initial',title='Discarded draft',deleted=False,html='<p>Remove this saved text.</p>')
old=dict(schema=1,id='smoke-draft-old',entity='smoke-draft',parents=[],time=1790000000000,body=body)
marker=dict(schema=1,id='smoke-draft-purge',entity='smoke-draft',parents=[],time=1790000000001,body={k:v for k,v in body.items() if k not in ['html']})
marker['body'].update(title='Deleted draft',deleted=True,purged=True)
for r in [old,marker]:(root/(r['id']+'.json')).write_text(json.dumps(r))
PYTEST
rm "$DATA/Library/Application Support/quill-ready.txt"
xcrun simctl launch "$DEVICE" com.kharrison.quill --smoke-test
for attempt in {1..20}; do
  if [ -f "$DATA/Library/Application Support/quill-ready.txt" ]; then break; fi
  sleep 2
done
test -f "$DATA/Library/Application Support/quill-ready.txt"
xcrun simctl terminate "$DEVICE" com.kharrison.quill
python3 - "$DATA" <<'PYTEST'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])/'Library/Application Support/QuillRevisions'
assert not (root/'smoke-draft-old.json').exists(), 'Native cleanup retained the deleted draft text'
assert (root/'smoke-draft-purge.json').exists(), 'Native cleanup lost its sync deletion marker'
assert (root/'sample-chapter-1-initial.json').exists(), 'Native cleanup touched the manuscript'
print('Native draft cleanup: old text removed; deletion marker and manuscript preserved.')
PYTEST
