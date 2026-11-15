// Regenerates the README images and docs/evidence/print.json. Usage: CHROME_PATH=/path/to/chrome npm run screenshots
// Quotes are opened through the share-link codec and the clock is fixed, so the images are reproducible.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defaultState,defaultRoom,encodeState} from '../state.mjs';

const root=new URL('../',import.meta.url);
const living={...defaultRoom(0),name:'Living room',lengthMm:5200,widthMm:4100,heightMm:2600,finish:'eggshell',ceiling:true,doors:1,windows:2};
const hallway={...defaultRoom(1),name:'Hallway',lengthMm:4200,widthMm:2000,heightMm:2600,finish:'matte',repair:true,doors:2};
const bedroom={...defaultRoom(2),name:'Bedroom',lengthMm:3800,widthMm:3200,heightMm:2600,finish:'satin',ceiling:true,doors:1,windows:1};
const twoRooms={...defaultState(),name:'Flat 4B repaint',taxBp:750,rooms:[living,hallway]};
const threeRooms={...defaultState(),name:'Flat 4B repaint',taxBp:825,rooms:[living,hallway,bedroom]};
const largest={...defaultState(),name:'Whole house',taxBp:825,rooms:Array.from({length:10},(_,n)=>({...defaultRoom(n),name:`Room ${n+1} with every option`,lengthMm:6000,widthMm:5000,heightMm:3000,finish:'satin',ceiling:true,repair:true,doors:2,windows:3}))};

const child=spawn(process.execPath,[fileURLToPath(new URL('serve.mjs',root))],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
let output='';
const base=await (async()=>{for await(const chunk of child.stdout){output+=chunk;const match=output.match(/(http:\/\/127\.0\.0\.1:\d+)/);if(match)return match[1]+'/';}throw new Error('no server');})();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
const open=async(state,options)=>{
  const context=await browser.newContext({locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce',...options});
  const page=await context.newPage();
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  await page.goto(base+'#q='+encodeState(state));
  await page.waitForSelector('.room');
  return {context,page};
};
const pages=pdf=>pdf.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g).length;
try{
  let {context,page}=await open(twoRooms,{viewport:{width:1360,height:900}});
  await page.screenshot({path:fileURLToPath(new URL('docs/preview.png',root)),fullPage:true});
  await context.close();

  ({context,page}=await open(twoRooms,{viewport:{width:390,height:844}}));
  await page.evaluate(()=>window.scrollTo(0,document.getElementById('quote-title').getBoundingClientRect().top+scrollY-12));
  await page.screenshot({path:fileURLToPath(new URL('docs/preview-mobile.png',root))});
  await context.close();

  // The printed page: print media on an A4-sized screen (794 x 1123 px at 96 dpi) with the 14 mm page margin drawn in.
  ({context,page}=await open(threeRooms,{viewport:{width:794,height:1123},deviceScaleFactor:2,bypassCSP:true}));
  await page.emulateMedia({media:'print'});
  const typical=pages(await page.pdf({format:'A4'}));   // counted before the screenshot-only padding below
  await page.addStyleTag({content:'html{background:#fff}body{padding:14mm}'});
  const height=await page.evaluate(()=>document.documentElement.scrollHeight);
  await page.screenshot({path:fileURLToPath(new URL('docs/quote-print.png',root)),fullPage:true});
  await context.close();

  ({context,page}=await open(largest,{viewport:{width:1280,height:900}}));
  const biggest=pages(await page.pdf({format:'A4'}));
  await context.close();
  writeFileSync(new URL('docs/evidence/print.json',root),JSON.stringify({
    paper:'A4',method:'Chromium page.pdf with print CSS; pages counted as /Type /Page objects in the PDF',date:new Date().toISOString().slice(0,10),
    typicalQuote:{rooms:3,description:'the 3-room quote shown in docs/quote-print.png',pages:typical,screenHeightPx:height,pageHeightPx:1123},
    largestQuote:{rooms:10,description:'10 rooms, each with ceiling, repairs, 2 doors and 3 windows',pages:biggest}},null,2)+'\n');
  console.log('print pages: typical',typical,'largest',biggest,'| print sheet height',height,'px of 1123');
}finally{await browser.close();child.kill();}
