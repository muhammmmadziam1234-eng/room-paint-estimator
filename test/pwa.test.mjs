import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {shellFiles,contentHash} from '../scripts/stamp-sw.mjs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const sw=read('sw.js'), html=read('index.html'), manifest=JSON.parse(read('manifest.webmanifest'));
const shell=shellFiles(sw);
const isRelative=address=>!/^([a-z][a-z0-9+.-]*:|\/)/i.test(address);

test('the manifest is relative so it works from a sub-path, and every icon is real and the size it claims',()=>{
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
  assert.ok(manifest.name&&manifest.short_name&&manifest.short_name.length<=12);
  assert.match(html,new RegExp(`<meta name="theme-color" content="${manifest.theme_color}">`));
  assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'),'a maskable icon');
  assert.ok(manifest.icons.some(icon=>icon.type==='image/svg+xml'),'an SVG icon');
  for(const icon of manifest.icons){
    assert.ok(isRelative(icon.src),icon.src+' is relative');
    assert.ok(existsSync(new URL(icon.src,root)),icon.src+' exists');
    if(icon.type==='image/png'){
      const bytes=readFileSync(new URL(icon.src,root));
      assert.equal(bytes.subarray(1,4).toString(),'PNG');
      assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes,icon.src);
    }
  }
  const apple=readFileSync(new URL('icons/icon-180.png',root));
  assert.equal(apple.readUInt32BE(16),180);
});

test('the page links its manifest and icons with relative addresses and asks for nothing outside itself',()=>{
  for(const link of ['rel="manifest" href="./manifest.webmanifest"','rel="apple-touch-icon" href="./icons/icon-180.png"','rel="icon" href="./icons/icon.svg"'])
    assert.ok(html.includes(link),link);
  for(const [,address] of html.matchAll(/(?:href|src)="([^"]*)"/g))
    assert.ok(address.startsWith('#')||isRelative(address),'relative or in-page: '+address);
  const text=['index.html','style.css','print.css','app.mjs','quote.mjs','units.mjs','state.mjs','format.mjs','store.mjs','pwa.mjs','sw.js','manifest.webmanifest']
    .map(file=>[file,read(file)]);
  for(const [file,source] of text)assert.doesNotMatch(source,/https?:\/\//,file+' makes no external request');
  assert.match(read('icons/icon.svg').replaceAll('http://www.w3.org/2000/svg',''),/^(?!.*https?:\/\/)/s,'the icon references nothing external');
  assert.doesNotMatch(html,/\sstyle=|<style|<script(?![^>]*\bsrc=)|\son[a-z]+=/i,'no inline styles, scripts or handlers');
  assert.match(html,/Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'/);
});

test('the service worker precaches every file the page needs, relative to itself',()=>{
  assert.ok(shell.length>10);
  for(const file of shell)assert.ok(file==='./'||existsSync(new URL(file,root)),file+' exists');
  assert.ok(shell.every(isRelative),'no absolute paths');
  assert.equal(new Set(shell).size,shell.length,'no duplicates');
  // Everything linked from the page, and every module the app imports, is in the shell.
  const wanted=new Set(['index.html']);
  for(const [,address] of html.matchAll(/(?:href|src)="\.\/([^"#]+)"/g))wanted.add(address);
  const visit=file=>{
    wanted.add(file);
    for(const [,imported] of read(file).matchAll(/from '\.\/([^']+\.mjs)'/g))if(!wanted.has(imported))visit(imported);
  };
  visit('app.mjs');
  wanted.add('fonts/gelasio-bold.woff2');
  for(const file of wanted)assert.ok(shell.includes(file),file+' is precached');
  assert.match(sw,/name\.startsWith\(PREFIX\)&&name!==CACHE/,'only its own old caches are removed');
  assert.match(sw,/cache\.addAll\(/);
  assert.match(sw,/ignoreSearch:true/);
  assert.match(sw,/request\.method!=='GET'/);
});

test('every precached file is served by the local server',()=>{
  const served=new Set([...read('serve.mjs').matchAll(/\['(\/[^']*)',\[/g)].map(match=>match[1]));
  for(const file of shell)assert.ok(served.has(file==='./'?'/':'/'+file),file+' is on the allowlist');
  assert.ok(served.has('/sw.js'));
});

test('the cache version is the hash of the precached files (run `npm run stamp` after changing one)',()=>{
  const version=/const VERSION='([^']+)'/.exec(sw)?.[1];
  assert.match(version,/^[0-9a-f]{10}$/);
  assert.equal(version,contentHash(),'sw.js has a stale VERSION; run npm run stamp');
});
