import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {startServer,launch,openPage,room,skip} from './helpers.mjs';

// axe-core is injected through the debugging protocol, so the page keeps its strict Content-Security-Policy.
const require=createRequire(import.meta.url);
const AXE=readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const AXE_VERSION=require('axe-core/package.json').version;
const TAGS=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'];
const results=[];

let server, browser;
test.before(async()=>{if(skip)return;server=await startServer();browser=await launch();});
test.after(async()=>{
  await browser?.close();server?.stop();
  // `npm run evidence:a11y` writes the numbers to docs/evidence/axe.json; a normal test run leaves the files alone.
  if(process.env.WRITE_EVIDENCE&&results.length){
    mkdirSync(new URL('../../docs/evidence/',import.meta.url),{recursive:true});
    writeFileSync(new URL('../../docs/evidence/axe.json',import.meta.url),JSON.stringify({tool:'axe-core',version:AXE_VERSION,date:new Date().toISOString().slice(0,10),
      rulesetTags:TAGS,browser:await browserVersion,scenarios:results},null,2)+'\n');
  }
});
let browserVersion;

const SCREEN_RULES=['color-contrast','target-size','label','button-name','aria-valid-attr-value','landmark-one-main','region'];
// Nothing can be clicked on the printed page, so only the rules that apply to a document are required there.
const PRINT_RULES=['color-contrast','landmark-one-main','region','page-has-heading-one','th-has-data-cells'];
async function scan(page,name,required=SCREEN_RULES){
  await page.evaluate(AXE);
  const report=await page.evaluate(async tags=>{
    const run=await axe.run(document,{runOnly:{type:'tag',values:tags}});
    return {violations:run.violations.map(v=>({rule:v.id,impact:v.impact,help:v.help,where:v.nodes.map(n=>n.target.join(' ')).slice(0,4)})),
      passes:run.passes.map(p=>p.id),incomplete:run.incomplete.map(i=>i.id)};
  },TAGS);
  browserVersion??=browser.version();
  results.push({scenario:name,violations:report.violations.length,rulesPassed:report.passes.length,needsReview:report.incomplete});
  assert.deepEqual(report.violations,[],name);
  for(const rule of required)
    assert.ok(report.passes.includes(rule),`${rule} was checked and passed in: ${name}`);
  return report;
}

async function threeRooms(page){
  for(const n of [2,3])await page.click('#add-room');
  await room(page,1).locator('[data-field="ceiling"]').check();
  await room(page,2).locator('[data-field="finish"][value="satin"]').check();
  await room(page,3).locator('[data-field="doors"]').fill('2');
  await page.fill('#tax','8.25');
  await page.fill('#quote-name','Flat 4B');
}

test('axe: the empty (default) quote has no violations',{skip},async()=>{
  const {page,problems}=await openPage(browser,server.url);
  await scan(page,'default quote, desktop');
  assert.deepEqual(problems,[]);
  const phone=await openPage(browser,server.url,{viewport:{width:360,height:740}});
  await scan(phone.page,'default quote, 360 px wide');
  assert.deepEqual(phone.problems,[]);
});

test('axe: a 3-room quote with errors showing has no violations',{skip},async()=>{
  const {page,problems}=await openPage(browser,server.url);
  await threeRooms(page);
  await room(page,2).locator('[data-field="length-m"]').fill('1');
  await room(page,3).locator('[data-field="doors"]').fill('99');
  await room(page,3).locator('[data-field="height-m"]').fill('tall');
  await page.fill('#tax','30');
  assert.equal(await page.locator('.field-error:visible').count(),4);
  await scan(page,'3-room quote with 4 errors shown');
  await page.check('input[name="unit"][value="ft"]');
  assert.ok(await page.locator('.field-error:visible').count()>=4);
  await scan(page,'the same quote in feet and inches');
  assert.deepEqual(problems,[]);
});

test('axe: the saved-quotes panel has no violations',{skip},async()=>{
  const {page,problems}=await openPage(browser,server.url);
  await threeRooms(page);
  await page.click('#save');
  await page.fill('#quote-name','Garage');
  await page.click('#save');
  await page.waitForFunction(()=>document.querySelectorAll('.saved-item').length===2);
  await scan(page,'saved-quotes panel with two saved quotes');
  assert.deepEqual(problems,[]);
});

test('axe: the printed quote (print media emulation) has no violations',{skip},async()=>{
  const {page,problems}=await openPage(browser,server.url);
  await threeRooms(page);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.isVisible('#print-sheet'),true);
  await scan(page,'print media emulation, 3-room quote',PRINT_RULES);
  assert.deepEqual(problems,[]);
});
