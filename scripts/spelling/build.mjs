import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
await build({entryPoints:[root+'entry.js'],bundle:true,minify:true,format:'iife',target:'es2020',loader:{'.aff':'text','.dic':'text'},outfile:root+'../../docs/vendor/spelling.js',banner:{js:'/*! Offline English spelling: nspell 2.1.5 + dictionary-en 4.0.0. See SPELLING-NOTICES.txt. */'}});
let notices='Quill offline English spelling\nBuilt with: npm ci --prefix scripts/spelling && npm run build --prefix scripts/spelling\n\n';
for(const [name,path,url] of [['nspell 2.1.5','nspell/license','https://github.com/wooorm/nspell'],['dictionary-en 4.0.0','dictionary-en/license','https://github.com/wooorm/dictionaries/tree/main/dictionaries/en'],['is-buffer 2.0.5','is-buffer/LICENSE','https://github.com/feross/is-buffer']])notices+=name+'\n'+url+'\n'+await readFile(root+'node_modules/'+path,'utf8')+'\n\n';
await writeFile(root+'../../docs/vendor/SPELLING-NOTICES.txt',notices);
