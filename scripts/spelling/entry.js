import nspell from 'nspell';
import aff from './node_modules/dictionary-en/index.aff';
import dic from './node_modules/dictionary-en/index.dic';
globalThis.quillCreateSpeller=()=>nspell(aff,dic);
