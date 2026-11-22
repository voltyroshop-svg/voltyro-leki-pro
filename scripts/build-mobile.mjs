import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';

const output=new URL('../mobile-web/',import.meta.url);
await rm(output,{recursive:true,force:true});
await mkdir(output);
const files=['app.js','data.js','measurements.js','measurements-data.js','style.css',
  'favicon.svg','apple-touch-icon.png','icon-192.png','icon-512.png','manifest.webmanifest'];
await Promise.all(files.map(name=>cp(new URL('../'+name,import.meta.url),new URL(name,output))));
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
await writeFile(new URL('index.html',output),html.replace('</body>',
  '<link rel="stylesheet" href="native.css">\n<script type="module" src="native-reminders.js"></script>\n</body>'));
await cp(new URL('../native/native.css',import.meta.url),new URL('native.css',output));
await build({entryPoints:[new URL('../native/native-reminders.js',import.meta.url).pathname],
  outfile:new URL('native-reminders.js',output).pathname,bundle:true,format:'esm',target:['safari15','chrome100']});
