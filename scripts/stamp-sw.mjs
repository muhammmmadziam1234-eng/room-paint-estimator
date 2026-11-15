// Writes the cache version into sw.js: a short hash of every precached file.
// Usage: npm run stamp   (the unit tests fail if this has not been run after a change)
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
export const shellFiles=source=>[...(/const SHELL=\[([^\]]*)\]/.exec(source)?.[1]??'').matchAll(/'([^']+)'/g)].map(match=>match[1]);
export function contentHash(){
  const hash=createHash('sha256');
  for(const file of shellFiles(readFileSync(new URL('sw.js',root),'utf8')).filter(file=>file!=='./').sort())
    hash.update(file+'\0').update(readFileSync(new URL(file,root))).update('\0');
  return hash.digest('hex').slice(0,10);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const path=new URL('sw.js',root), source=readFileSync(path,'utf8'), version=contentHash();
  writeFileSync(path,source.replace(/const VERSION='[^']*';/,`const VERSION='${version}';`));
  console.log('sw.js cache version:',version);
}
