// Package only qrcode's browser CommonJS graph; no CLI, Node polyfills or CDN.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(import.meta.url);
const qrRoot=path.dirname(require.resolve('qrcode/package.json'));
const dijkstraRoot=path.dirname(require.resolve('dijkstrajs/package.json'));
const ids=new Map(),modules=[];
async function collect(filename){
 if(ids.has(filename))return ids.get(filename);
 const allowed=[qrRoot,dijkstraRoot].some(dir=>filename.startsWith(dir+path.sep));
 if(!allowed)throw Error('Unexpected QR dependency: '+filename);
 const id=modules.length;ids.set(filename,id);modules.push(null);
 const source=await readFile(filename,'utf8'),matches=[...source.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)];
 let content='',offset=0;
 for(const match of matches){
  const dependency=createRequire(filename).resolve(match[2]);
  const dependencyId=await collect(dependency);
  content+=source.slice(offset,match.index)+'load('+dependencyId+')';offset=match.index+match[0].length;
 }
 content+=source.slice(offset);
 if(/\brequire\s*\(/.test(content))throw Error('Dynamic require is not supported in the QR browser graph');
 modules[id]='function(module,exports,load){\n'+content+'\n}';return id;
}
const entry=await collect(path.join(qrRoot,'lib/browser.js'));
const license=await readFile(path.join(qrRoot,'license'),'utf8');
const dijkstraLicense=await readFile(path.join(dijkstraRoot,'LICENSE.md'),'utf8');
const result='/*! qrcode 1.5.4 (MIT) and dijkstrajs (MIT)\n'+license+'\n'+dijkstraLicense+'\n*/\n'+
 'var QRCode=(function(){"use strict";const factories=['+modules.join(',\n')+'];const cache={};function load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;factories[id](module,module.exports,load);return module.exports}return load('+entry+');})();\n';
const cache=path.join(root,'node_modules/.cache/yujianxingji');await mkdir(cache,{recursive:true});
await writeFile(path.join(cache,'qrcode-browser.js'),result);
console.log('Built local qrcode browser graph: '+modules.length+' modules, '+Buffer.byteLength(result)+' bytes; no external QR service.');
