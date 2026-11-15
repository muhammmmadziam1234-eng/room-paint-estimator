// Renders the PNG icons from the SVG mark with the installed Chrome. Usage: CHROME_PATH=... npm run icons
import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync} from 'node:fs';

const out=name=>new URL('../icons/'+name,import.meta.url);
const any=readFileSync(out('icon.svg'),'utf8');
// Maskable and Apple icons are full-bleed squares with the mark kept inside the central safe zone.
const bleed=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f6bf48"/><rect x="146" y="146" width="220" height="220" rx="28" fill="#222119"/><path d="M178 334V178h156Z" fill="#f7f4e7"/></svg>`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
for(const [name,svg,size] of [['icon-180.png',bleed,180],['icon-192.png',any,192],['icon-512.png',any,512],['icon-maskable-512.png',bleed,512]]){
  const page=await browser.newPage({viewport:{width:size,height:size}});
  await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:100vw;height:100vh}</style><img alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
  await page.waitForFunction(()=>document.images[0].complete);
  writeFileSync(out(name),await page.screenshot({omitBackground:true}));
  await page.close();
  console.log('wrote icons/'+name);
}
await browser.close();
