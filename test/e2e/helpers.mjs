// Shared setup for the browser tests: a real server on a free port and a real Chromium.
// Locally: CHROME_PATH=/path/to/chrome npm run test:e2e. In CI the variable points at the preinstalled Chrome.
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {fileURLToPath} from 'node:url';

export const CHROME_PATH=process.env.CHROME_PATH;
/** Pass as the `skip` option: browser tests are skipped, loudly, when no browser is configured (never in CI). */
export const skip=CHROME_PATH?false:'CHROME_PATH is not set, so the browser tests are skipped.';
if(!CHROME_PATH&&process.env.CI)throw new Error('CHROME_PATH must be set in CI.');

const script=fileURLToPath(new URL('../../serve.mjs',import.meta.url));

export async function startServer(){
  const child=spawn(process.execPath,[script],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
  let output='';
  for await(const chunk of child.stdout){
    output+=chunk;
    const match=output.match(/127\.0\.0\.1:(\d+)/);
    if(match)return {url:`http://127.0.0.1:${match[1]}/`,port:Number(match[1]),stop:()=>child.kill()};
  }
  throw new Error('The server stopped before it began listening.');
}

export const launch=()=>chromium.launch({executablePath:CHROME_PATH,args:['--no-sandbox']});

/** Collects everything the browser complains about: console errors and warnings (CSP violations included), uncaught errors, failed requests. */
export function watch(page){
  const problems=[];
  page.on('console',message=>{if(['error','warning'].includes(message.type()))problems.push(`${message.type()}: ${message.text()}`);});
  page.on('pageerror',error=>problems.push('pageerror: '+error.message));
  page.on('requestfailed',request=>problems.push('requestfailed: '+request.url()));
  return problems;
}

/** A fresh browser profile (empty storage), a fixed clock and a fixed time zone, with the page already loaded. */
export async function openPage(browser,url,{viewport={width:1280,height:900},permissions,waitForRooms=true}={}){
  const context=await browser.newContext({viewport,locale:'en-US',timezoneId:'UTC',permissions,serviceWorkers:'allow'});
  const page=await context.newPage();
  const problems=watch(page);
  await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));
  await page.goto(url);
  if(waitForRooms)await page.waitForSelector('.room');
  return {context,page,problems};
}

export const room=(page,number)=>page.locator('.room').nth(number-1);
export const status=(page,text)=>page.waitForFunction(expected=>document.getElementById('status').textContent===expected,text);
export const total=page=>page.locator('#total').textContent();
