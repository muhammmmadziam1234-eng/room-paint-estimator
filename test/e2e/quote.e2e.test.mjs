import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,launch,openPage,room,status,total,skip} from './helpers.mjs';
import {defaultState,defaultRoom,encodeState,quoteNumber} from '../../state.mjs';
import {priceQuote} from '../../quote.mjs';
import {moneyFormatter} from '../../format.mjs';

let server, browser;
test.before(async()=>{if(skip)return;server=await startServer();browser=await launch();});
test.after(async()=>{await browser?.close();server?.stop();});
const open=(options,hash='')=>openPage(browser,server.url+hash,options);
const plain=text=>text.replace(/[  ]/g,' ');

async function threeRoomQuote(page,afterSecondRoom){
  // The hand-worked example from test/quote.test.mjs, entered through the page.
  await room(page,1).locator('[data-field="ceiling"]').check();
  await room(page,1).locator('[data-field="repair"]').check();
  await room(page,1).locator('[data-field="doors"]').fill('1');
  await room(page,1).locator('[data-field="windows"]').fill('1');
  await page.click('#add-room');
  await room(page,2).locator('[data-field="length-m"]').fill('3');
  await room(page,2).locator('[data-field="width-m"]').fill('3');
  await room(page,2).locator('[data-field="height-m"]').fill('2.4');
  await room(page,2).locator('[data-field="finish"][value="eggshell"]').check();
  await room(page,2).locator('[data-field="doors"]').fill('1');
  await afterSecondRoom?.();
  await page.click('#add-room');
  await room(page,3).locator('[data-field="length-m"]').fill('5');
  await room(page,3).locator('[data-field="width-m"]').fill('4');
  await room(page,3).locator('[data-field="height-m"]').fill('2.7');
  await room(page,3).locator('[data-field="finish"][value="satin"]').check();
  await room(page,3).locator('[data-field="ceiling"]').check();
  await room(page,3).locator('[data-field="windows"]').fill('2');
  await page.fill('#tax','8.25');
}

test('a 3-room quote: deductions, one setup fee, the 5% discount and tax come out to the cent',{skip},async()=>{
  const {page,problems}=await open();
  assert.equal(await total(page),'$215.00','the starting quote matches the original estimator');
  await threeRoomQuote(page,async()=>{
    // Two rooms so far (27 598 + 13 455 + 4 500 setup): no discount line yet.
    assert.equal(await total(page),'$455.53');
    assert.equal(await page.locator('#job-totals div').count(),2);
    assert.equal(await page.textContent('#summary-note'),'2 rooms.');
  });
  assert.equal(await total(page),'$823.80');
  assert.equal(await page.textContent('#total-bar-value'),'$823.80');
  assert.deepEqual(await page.locator('#room-totals li').allTextContents(),['Room 1$275.98','Room 2$134.55','Room 3$339.75']);
  assert.deepEqual(await page.locator('#job-totals div').allTextContents(),[
    'Room protection and setup (once per quote)$45.00','Multi-room discount (5% of paint lines, 3+ rooms)-$34.26','Subtotal$761.02','Tax (8.25%)$62.78']);
  assert.match(await page.textContent('#summary-note'),/^3 rooms, 5% multi-room discount applied\.$/);
  assert.match(await room(page,1).locator('[data-result]').textContent(),/Room subtotal \$275\.98\. Walls 36\.67 m² after 3\.33 m² of doors and windows, ceiling 15\.75 m²\./);
  assert.match(await page.inputValue('#share-link'),/#q=q1~m\.us\.825\./);
  assert.deepEqual(problems,[]);
});

test('imperial units: feet and inches convert exactly and switch back without drift',{skip},async()=>{
  const {page,problems}=await open();
  await page.check('input[name="unit"][value="ft"]');
  assert.equal(await room(page,1).locator('[data-field="length-ft"]').inputValue(),'14');
  assert.equal(await room(page,1).locator('[data-field="length-in"]').inputValue(),'9.17');
  const set=async(dim,feet,inches)=>{await room(page,1).locator(`[data-field="${dim}-ft"]`).fill(feet);await room(page,1).locator(`[data-field="${dim}-in"]`).fill(inches);};
  await set('length','14','9');await set('width','11','6');await set('height','8','0');
  // 4496 x 3505 x 2438 mm: walls 39 012 876 mm2 -> 165.80 + 45.00 setup.
  assert.equal(await total(page),'$210.80');
  assert.match(await room(page,1).locator('[data-result]').textContent(),/Walls 39\.01 m² \(419\.9 ft²\)/);
  await page.fill('#quote-name','Imperial');
  await page.check('input[name="unit"][value="m"]');
  assert.deepEqual(await Promise.all(['length','width','height'].map(d=>room(page,1).locator(`[data-field="${d}-m"]`).inputValue())),['4.496','3.505','2.438']);
  assert.equal(await total(page),'$210.80');
  await page.fill('#quote-name','');
  await page.check('input[name="unit"][value="ft"]');
  await room(page,1).locator('[data-field="length-ft"]').fill('2');
  assert.equal(await room(page,1).locator('[data-error="length"]').textContent(),'Enter a length from 6 ft 6.74 in to 49 ft 2.55 in.');
  assert.deepEqual(problems,[]);
});

test('mistakes are explained next to the field, marked invalid, and block the total until fixed',{skip},async()=>{
  const {page,problems}=await open();
  const length=room(page,1).locator('[data-field="length-m"]');
  await length.fill('1.5');
  assert.equal(await room(page,1).locator('[data-error="length"]').textContent(),'Enter a length from 2 to 15 m.');
  assert.equal(await length.getAttribute('aria-invalid'),'true');
  assert.equal((await length.getAttribute('aria-describedby')),await room(page,1).locator('[data-error="length"]').getAttribute('id'));
  assert.equal(await total(page),'—');
  assert.equal(await page.textContent('#summary-note'),'Fix 1 problem to see the total.');
  for(const id of ['save','copy-link','print'])assert.equal(await page.isDisabled('#'+id),true,id);
  assert.match(await room(page,1).locator('[data-result]').textContent(),/Complete the marked fields/);
  await length.fill('abc');
  assert.equal(await room(page,1).locator('[data-error="length"]').textContent(),'Use plain numbers for the length, like 4.5.');
  await length.fill('4.1234');
  assert.equal(await room(page,1).locator('[data-error="length"]').textContent(),'Use at most 3 decimals (whole millimetres).');
  await room(page,1).locator('[data-field="doors"]').fill('11');
  await page.fill('#tax','30');
  assert.equal(await page.textContent('#summary-note'),'Fix 3 problems to see the total.');
  assert.equal(await page.textContent('#tax-error'),'Enter a tax rate from 0 to 25 %.');
  await length.fill('4.5');await room(page,1).locator('[data-field="doors"]').fill('0');await page.fill('#tax','');
  assert.equal(await total(page),'$215.00');
  assert.equal(await length.getAttribute('aria-invalid'),null);
  assert.equal(await page.locator('.field-error:visible').count(),0);
  assert.equal(await page.isDisabled('#save'),false);
  assert.deepEqual(problems,[]);
});

test('add, duplicate and remove move focus sensibly and announce the change',{skip},async()=>{
  const {page,problems}=await open();
  assert.equal(await page.getAttribute('#status','role'),'status');
  assert.equal(await page.isDisabled('[data-action="remove"]'),true,'the only room cannot be removed');
  await page.click('#add-room');
  await status(page,'Room 2 added. 2 rooms in this quote.');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.field),'name');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('.room').querySelector('[data-title]').textContent),'Room 2');
  await page.keyboard.type('Hall');
  assert.equal(await room(page,2).locator('[data-title]').textContent(),'Hall');
  assert.equal(await room(page,2).locator('[data-action="remove"]').getAttribute('aria-label'),'Remove Hall');
  await room(page,2).locator('[data-action="duplicate"]').click();
  await status(page,'Hall duplicated as Hall copy. 3 rooms in this quote.');
  assert.equal(await page.evaluate(()=>document.activeElement.value),'Hall copy');
  assert.equal(await page.locator('.room').count(),3);
  assert.equal(await room(page,3).locator('[data-title]').textContent(),'Hall copy','the copy sits right after its source');
  await room(page,2).locator('[data-action="remove"]').click();
  await status(page,'Hall removed. 2 rooms in this quote.');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Hall copy','focus lands on the next room heading');
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H3');
  await room(page,2).locator('[data-action="remove"]').click();
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Room 1','removing the last room focuses the previous one');
  assert.equal(await page.locator('.room').count(),1);
  for(let n=2;n<=10;n++)await page.click('#add-room');
  assert.equal(await page.locator('.room').count(),10);
  assert.equal(await page.isDisabled('#add-room'),true);
  assert.equal(await room(page,1).locator('[data-action="duplicate"]').isDisabled(),true);
  assert.match(await page.textContent('#room-limit'),/^10 of 10 rooms/);
  assert.deepEqual(problems,[]);
});

test('every control works from the keyboard alone',{skip},async()=>{
  const {page,problems}=await open();
  const focused=()=>page.evaluate(()=>document.activeElement.id||document.activeElement.dataset.field||document.activeElement.tagName);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.className),'skip');
  await page.keyboard.press('Enter');
  assert.equal(await focused(),'quote-title','the skip link lands on the quote');
  for(let n=0;n<60&&await focused()!=='add-room';n++)await page.keyboard.press('Tab');
  assert.equal(await focused(),'add-room');
  await page.keyboard.press('Space');
  await status(page,'Room 2 added. 2 rooms in this quote.');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.room').count(),2);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Study');
  await page.keyboard.press('Enter');
  assert.equal(await room(page,2).locator('[data-title]').textContent(),'Study','Enter in a field does not submit or reload');
  await page.keyboard.press('Tab');
  assert.equal(await focused(),'length-m');
  await page.keyboard.type('6');
  assert.equal(await room(page,2).locator('[data-field="length-m"]').inputValue(),'6');
  await page.focus('#print');
  await page.evaluate(()=>{window.print=()=>{window.__printed=true;};});
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__printed),true);
  assert.deepEqual(problems,[]);
});

test('currency and number format change the price list and the way amounts are written',{skip},async()=>{
  const {page,problems}=await open();
  await page.selectOption('#market','gb');
  assert.equal(await total(page),'£172.00');                // 40 m2 x 3.40 + 36.00 setup
  await page.selectOption('#market','de');
  assert.equal(plain(await total(page)),'197,00 €');         // 40 m2 x 3.90 + 41.00 setup
  await page.selectOption('#market','fr');
  assert.equal(plain(await total(page)),'197,00 €');
  await page.fill('#tax','20');
  assert.equal(plain(await total(page)),'236,40 €');
  assert.match(plain(await page.textContent('#job-totals')),/Tax \(20 ?%\)39,40 €/);
  assert.deepEqual(problems,[]);
});

test('quotes are saved in localStorage, listed with their totals, loaded again and deleted',{skip},async()=>{
  const {page,problems}=await open();
  assert.match(await page.textContent('#saved-empty'),/No saved quotes yet/);
  await page.fill('#quote-name','Flat 4B');
  await page.click('#add-room');
  await page.click('#save');
  await status(page,'Saved "Flat 4B" in this browser.');
  assert.equal(await page.locator('.saved-item').count(),1);
  assert.match(await page.textContent('.saved-item'),/Flat 4B.*\$385\.00 · 2 rooms · saved Nov 15, 2026/s);
  const stored=JSON.parse(await page.evaluate(()=>localStorage.getItem('second-coat.saved.v1')));
  assert.equal(stored.v,1);assert.equal(stored.items[0].name,'Flat 4B');assert.match(stored.items[0].code,/^q1~/);
  await page.fill('#tax','10');await page.click('#save');
  await status(page,'Updated "Flat 4B" in your saved quotes.');
  assert.equal(await page.locator('.saved-item').count(),1,'saving under the same name replaces');
  await page.click('#new-quote');
  assert.equal(await total(page),'$215.00');
  assert.equal(await page.inputValue('#quote-name'),'');
  await page.click('[aria-label="Load Flat 4B"]');
  await status(page,'Loaded "Flat 4B".');
  assert.equal(await page.inputValue('#quote-name'),'Flat 4B');
  assert.equal(await page.inputValue('#tax'),'10');
  assert.equal(await page.locator('.room').count(),2);
  assert.equal(await total(page),'$423.50');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'quote-title');
  await page.click('[aria-label="Delete Flat 4B"]');
  await status(page,'Deleted "Flat 4B".');
  assert.equal(await page.locator('.saved-item').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'saved-title');
  assert.match(await page.textContent('#saved-empty'),/No saved quotes yet/);
  assert.deepEqual(problems,[]);
});

test('damaged saved data is skipped with a visible note, and a draft survives a reload',{skip},async()=>{
  const {page,context,problems}=await open();
  await page.fill('#quote-name','Draft check');
  await page.evaluate(()=>localStorage.setItem('second-coat.saved.v1',JSON.stringify({v:1,items:[{id:'x1',name:'Broken',savedAt:'2026-11-15T09:00:00.000Z',code:'q1~nonsense'}]})));
  await page.goto(server.url);   // no address hash: the draft comes back from localStorage
  await page.waitForSelector('.room');
  assert.equal(await page.inputValue('#quote-name'),'Draft check');
  await status(page,'Restored your last quote from this browser.');
  assert.equal(await page.textContent('#saved-note'),'1 saved quote could not be read and was skipped.');
  assert.equal(await page.locator('.saved-item').count(),0);
  await page.evaluate(()=>localStorage.setItem('second-coat.draft.v1','q1~garbage'));
  await page.goto(server.url);
  await page.waitForSelector('.room');
  assert.match(await page.textContent('#status'),/not in a format this page understands\. A new quote is shown instead\.$/);
  assert.equal(await page.locator('#status.warn').count(),1);
  assert.equal(await total(page),'$215.00');
  await context.close();
  assert.deepEqual(problems,[]);
});

test('a shared link restores the quote, a bad link falls back with a message, and anchors keep the quote',{skip},async()=>{
  const state={...defaultState(),name:'Shared',market:'gb',taxBp:500,rooms:[{...defaultRoom(0),name:'Lounge',lengthMm:5200,doors:2},{...defaultRoom(1),finish:'satin',ceiling:true,repair:true,windows:3}]};
  const expected=moneyFormatter('gb')(priceQuote(state).totalCents);
  const {page,problems}=await open({},'#q='+encodeState(state));
  await status(page,'Loaded the quote from the link.');
  assert.equal(await page.inputValue('#quote-name'),'Shared');
  assert.equal(await page.inputValue('#market'),'gb');
  assert.equal(await page.inputValue('#tax'),'5');
  assert.equal(await room(page,1).locator('[data-field="length-m"]').inputValue(),'5.2');
  assert.equal(await room(page,2).locator('[data-field="finish"][value="satin"]').isChecked(),true);
  assert.equal(await total(page),expected);
  assert.equal(await page.evaluate(()=>location.hash),'#q='+encodeState(state));
  await page.click('.jump');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>location.hash),'#q='+encodeState(state),'clicking an in-page link does not drop the quote');
  const other={...defaultState(),name:'Second'};
  await page.evaluate(code=>{location.hash='#q='+code;},encodeState(other));
  await status(page,'Loaded the quote from the link.');
  assert.equal(await page.inputValue('#quote-name'),'Second');
  await page.evaluate(()=>{location.hash='#q=q9~whatever';});
  await page.waitForFunction(()=>/made by a different version of this page\. A new quote is shown instead\.$/.test(document.getElementById('status').textContent));
  assert.equal(await page.locator('#status.warn').count(),1);
  assert.equal(await total(page),'$215.00');
  assert.equal(await page.evaluate(()=>location.hash),'#q='+encodeState(defaultState()));
  // Text that is not a quote at all, and a link that is far too long.
  for(const [bad,message] of [['%00%FF',/not in a format this page understands/],['x'.repeat(9000),/too long/],['q1~m.us.99999.~Room.4500.3500.2500.m.0.0.0',/out of range/]]){
    await page.goto(server.url+'#q='+bad);
    await page.waitForFunction(pattern=>new RegExp(pattern).test(document.getElementById('status').textContent),message.source);
    assert.equal(await total(page),'$215.00');
  }
  assert.deepEqual(problems.filter(problem=>!/Failed to load resource/.test(problem)),[]);
});

test('the link can be copied to the clipboard',{skip},async()=>{
  const {page,problems}=await open({permissions:['clipboard-read','clipboard-write']});
  await page.click('#copy-link');
  await status(page,'Link copied. It holds the whole quote and nothing else.');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),page.url());
  assert.match(page.url(),/#q=q1~/);
  assert.deepEqual(problems,[]);
});

test('print: only the quote sheet shows, with number, dates, itemised rooms, totals, terms and the demo notice',{skip},async()=>{
  const {page,problems}=await open();
  await threeRoomQuote(page);
  await page.fill('#quote-name','Flat 4B');
  const state=await page.evaluate(async()=>{const {decodeState,codeFromHash}=await import('./state.mjs');return decodeState(codeFromHash(location.hash)).state;});
  await page.emulateMedia({media:'print'});
  assert.equal(await page.isVisible('#print-sheet'),true);
  for(const hidden of ['.workbench','.hero','body > header','body > footer','.saved','.total-bar','.skip'])assert.equal(await page.isVisible(hidden),false,hidden+' is hidden in print');
  const sheet=page.locator('#print-sheet');
  assert.equal(await sheet.locator('h1').textContent(),'Painting quote');
  assert.equal(await sheet.locator('.sheet-studio').textContent(),'Second Coat');
  assert.equal(await sheet.locator('.sheet-name').textContent(),'Flat 4B');
  const meta=await sheet.locator('.sheet-meta').innerText();
  assert.match(meta,new RegExp(`Quote number\\s+${quoteNumber(state)}`));
  assert.match(meta,/Date\s+Nov 15, 2026/);
  assert.match(meta,/Valid until\s+Dec 15, 2026/);
  assert.match(meta,/Currency\s+USD/);
  assert.equal(await sheet.locator('table').count(),4,'one itemised table per room plus the whole-job table');
  assert.deepEqual(await sheet.locator('table').nth(0).locator('thead th').allTextContents(),['Item','Quantity','Rate','Amount']);
  assert.deepEqual(await sheet.locator('table').nth(0).locator('tbody tr').nth(0).locator('th, td').allTextContents(),['Wall paint and labour','36.67 m²','$4.25 per m²','$155.85']);
  assert.match(await sheet.locator('table').nth(0).locator('caption').innerText(),/Room 1.*4\.5 × 3\.5 × 2\.5 m · Matte · 1 door and 1 window\s+Openings deducted: 3\.33 m²/s);
  assert.equal(await sheet.locator('table').nth(2).locator('.subtotal td').textContent(),'$339.75');
  const job=await sheet.locator('table').nth(3).innerText();
  for(const line of ['Room protection and setup (once per quote)','$45.00','Multi-room discount','-$34.26','Subtotal','$761.02','Tax (8.25%)','$62.78','$823.80'])assert.ok(job.includes(line),line);
  assert.equal(await sheet.locator('.grand td').textContent(),'$823.80');
  assert.match(await sheet.locator('.sheet-terms').innerText(),/valid for 30 days, until Dec 15, 2026/);
  assert.match(await sheet.locator('.sheet-demo').innerText(),/Fictional demo: this is not an offer/);
  const pdf=await page.pdf({format:'A4'});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>8000,'the PDF has content: '+pdf.length+' bytes');
  const pages=pdf.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length;
  assert.equal(pages,1,'a 3-room quote prints on one page');
  assert.deepEqual(problems,[]);
});

test('at 360 px nothing scrolls sideways, targets are large enough and the total stays in view',{skip},async()=>{
  const {page,problems}=await open({viewport:{width:360,height:740}});
  await threeRoomQuote(page);
  for(const unit of ['m','ft']){
    await page.check(`input[name="unit"][value="${unit}"]`);
    const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,
      wide:[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>document.documentElement.clientWidth+0.5).map(el=>el.tagName+'.'+el.className).slice(0,5)}));
    assert.equal(layout.scroll,layout.client,`${unit}: no horizontal scroll`);
    assert.deepEqual(layout.wide,[],`${unit}: no element sticks out`);
  }
  const small=await page.evaluate(()=>[...document.querySelectorAll('button,input:not([type=hidden]),select,summary,a[href]')]
    .filter(el=>el.getClientRects().length).map(el=>{
      const box=(el.type==='radio'||el.type==='checkbox'?el.closest('label'):el)?.getBoundingClientRect()??el.getBoundingClientRect();
      return {name:(el.getAttribute('aria-label')||el.dataset.field||el.id||el.textContent).trim().slice(0,30),w:Math.round(box.width),h:Math.round(box.height)};
    }).filter(item=>item.w<24||item.h<24));
  assert.deepEqual(small,[],'every control is at least 24 x 24 px');
  await page.evaluate(()=>window.scrollTo(0,0));
  const bar=await page.evaluate(()=>{const box=document.querySelector('.total-bar').getBoundingClientRect();return {bottom:Math.round(box.bottom),height:innerHeight,text:document.querySelector('.total-bar').textContent};});
  assert.equal(bar.bottom,bar.height,'the total bar sticks to the bottom of the screen');
  assert.match(bar.text,/\$823\.80/);
  assert.deepEqual(problems,[]);
});

test('reduced motion is respected',{skip},async()=>{
  const context=await browser.newContext({reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(server.url);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
  await context.close();
});
