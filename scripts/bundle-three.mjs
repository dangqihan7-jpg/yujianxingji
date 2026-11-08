// Bundle three.js (CommonJS build, single file, no dependencies) for lazy
// loading: the output only DEFINES window.__loadTHREE and runs nothing at
// page load, so the 2 MB library is parsed only when the user first opens
// the spots view (and so existing vm-based tests never execute it).
// three r180 splits the ESM build into three.core.js + three.module.js and
// keeps WebGLRenderer out of the core file, so the CJS build is the complete
// one-file source. No CDN, no build-chain change: build.sh runs this before
// assemble.py, which inlines the result via /*THREE_CODE*/.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version=JSON.parse(await readFile(path.join(root,'node_modules/three/package.json'),'utf8')).version;
const license=await readFile(path.join(root,'node_modules/three/LICENSE'),'utf8');

const source=await readFile(path.join(root,'node_modules/three/build/three.cjs'),'utf8');
if((source.match(/require\(/g)||[]).length)throw Error('Unexpected require in three CJS build');
if((source.match(/module\.exports\s*=/g)||[]).length)throw Error('Unexpected module.exports assignment in three CJS build');
if(!source.includes('exports.WebGLRenderer'))throw Error('three CJS build has no WebGLRenderer export');
const body=source.replace(/<\/script/gi,'<\\/script');
const result='/*! three.js '+version+' (MIT)\\n'+license+'\\nBundled locally from node_modules/three/build/three.cjs; no CDN. Loaded lazily via globalThis.__loadTHREE(). */\n'+
 'globalThis.__loadTHREE=function(){if(globalThis.THREE)return globalThis.THREE;var module={exports:{}};var exports=module.exports;\n'+body+'\nglobalThis.THREE=module.exports;\nreturn module.exports;\n};\n';
new Function(result);
const cache=path.join(root,'node_modules/.cache/yujianxingji');
await mkdir(cache,{recursive:true});
await writeFile(path.join(cache,'three-browser.js'),result);
console.log('Built local three.js browser bundle: three.cjs ('+Buffer.byteLength(result)+' bytes, lazy); no CDN.');
