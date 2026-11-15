// Second Coat quote builder: wires the page to the quote engine (quote.mjs), the state codec (state.mjs),
// the formatters (format.mjs) and the saved-quote store (store.mjs). No framework; the DOM is the form.
import {MARKETS,LIMITS,DISCOUNT,priceQuote} from './quote.mjs';
import {parseDecimal,metresToMm,feetInchesToMm,mmToMetresText,mmToFeetInchesText} from './units.mjs';
import {defaultRoom,defaultState,normalizeName,validateState,encodeState,restoreState,quoteNumber,hashFor,codeFromHash} from './state.mjs';
import {moneyFormatter,describeQuote,issueMessage,areaText,formatDate,addDays} from './format.mjs';
import {createStore,MAX_SAVED} from './store.mjs';
import {registerOffline} from './pwa.mjs';

const $=id=>document.getElementById(id);
const form=$('quote-form'), roomsList=$('rooms'), savedList=$('saved-list');
const roomTemplate=$('room-template'), savedTemplate=$('saved-template');
const DIMS=['length','width','height'];
const MAX_ROOMS=LIMITS.rooms[1];

let store;
try{store=createStore(window.localStorage);}
catch{store=createStore({getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');}});}

let nextRoomId=0;
let shownCode=null;

$('market').replaceChildren(...Object.entries(MARKETS).map(([key,market])=>{
  const option=document.createElement('option');
  option.value=key;
  option.textContent=`${market.label} (${market.currency})`;
  return option;
}));

/* ---------- small helpers ---------- */
const roomEls=()=>[...roomsList.children];
const field=(room,name)=>room.querySelector(`[data-field="${name}"]`);
const text=(room,name)=>field(room,name).value;
const currentUnit=()=>form.elements.unit.value;
const plural=(count,word)=>`${count} ${count===1?word:word+'s'}`;
function h(tag,attributes={},...children){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
  node.append(...children);
  return node;
}
/** One polite live region for every message. Clearing first lets a repeated message be announced again. */
function setStatus(message,warn=false){
  const status=$('status');
  status.classList.toggle('warn',warn);
  status.textContent='';
  if(message)setTimeout(()=>{status.textContent=message;},30);
}

/* ---------- room cards ---------- */
function inputsFor(room,name){
  if(room===null)return name==='tax'?[$('tax')]:name==='name'?[$('quote-name')]:[];
  if(DIMS.includes(name))return ['m','ft','in'].map(part=>field(room,`${name}-${part}`));
  return [field(room,name)];
}
function setDimension(room,dim,mm){
  field(room,`${dim}-m`).value=mmToMetresText(mm);
  const {feet,inches}=mmToFeetInchesText(mm);
  field(room,`${dim}-ft`).value=feet;
  field(room,`${dim}-in`).value=inches;
}
/** Keep the hidden unit's fields in step with what was typed, so switching units needs no conversion step. */
function syncDimension(room,dim){
  if(currentUnit()==='ft'){
    const parsed=feetInchesToMm(text(room,`${dim}-ft`),text(room,`${dim}-in`));
    field(room,`${dim}-m`).value=parsed.ok?mmToMetresText(parsed.mm):'';
  }else{
    const parsed=metresToMm(text(room,`${dim}-m`));
    const shown=parsed.ok?mmToFeetInchesText(parsed.mm):{feet:'',inches:''};
    field(room,`${dim}-ft`).value=shown.feet;
    field(room,`${dim}-in`).value=shown.inches;
  }
}
function writeRoom(room,values){
  field(room,'name').value=values.name;
  setDimension(room,'length',values.lengthMm);
  setDimension(room,'width',values.widthMm);
  setDimension(room,'height',values.heightMm);
  room.querySelector(`[data-field="finish"][value="${values.finish}"]`).checked=true;
  field(room,'ceiling').checked=values.ceiling;
  field(room,'repair').checked=values.repair;
  field(room,'doors').value=String(values.doors);
  field(room,'windows').value=String(values.windows);
}
function buildRoom(values){
  const room=roomTemplate.content.firstElementChild.cloneNode(true), id=++nextRoomId;
  room.querySelector('article').setAttribute('aria-labelledby',`room-${id}-title`);
  room.querySelector('[data-title]').id=`room-${id}-title`;
  for(const radio of room.querySelectorAll('[data-field="finish"]'))radio.name=`finish-${id}`;
  for(const error of room.querySelectorAll('[data-error]')){
    error.id=`room-${id}-error-${error.dataset.error}`;
    for(const input of inputsFor(room,error.dataset.error))input.setAttribute('aria-describedby',error.id);
  }
  writeRoom(room,values);
  return room;
}
function parseMessage(result,dim,unit){
  if(result.reason==='empty')return `Enter a ${dim}.`;
  if(result.reason==='decimals')return unit==='ft'?'Use at most 2 decimals.':'Use at most 3 decimals (whole millimetres).';
  return unit==='ft'?`Use plain numbers for the ${dim}, like 14 ft and 9.5 in.`:`Use plain numbers for the ${dim}, like 4.5.`;
}
function readRoom(room,index,unit){
  const issues=[], sizes={};
  for(const dim of DIMS){
    const parsed=unit==='ft'?feetInchesToMm(text(room,`${dim}-ft`),text(room,`${dim}-in`)):metresToMm(text(room,`${dim}-m`));
    if(parsed.ok)sizes[dim]=parsed.mm;
    else{sizes[dim]=NaN;issues.push({room:index,field:dim,message:parseMessage(parsed,dim,unit)});}
  }
  const count=name=>{const value=text(room,name).trim();return value===''?0:/^\d{1,2}$/.test(value)?Number(value):NaN;};
  return {issues,room:{
    name:normalizeName(text(room,'name')),lengthMm:sizes.length,widthMm:sizes.width,heightMm:sizes.height,
    finish:room.querySelector('[data-field="finish"]:checked')?.value,ceiling:field(room,'ceiling').checked,repair:field(room,'repair').checked,
    doors:count('doors'),windows:count('windows')
  }};
}

/** Read the whole form into a state plus every problem found (text that is not a number, then range checks). */
function collect(){
  const unit=currentUnit(), issues=[];
  const rooms=roomEls().map((room,index)=>{const read=readRoom(room,index,unit);issues.push(...read.issues);return read.room;});
  let taxBp=0;
  const taxText=$('tax').value.trim();
  if(taxText!==''){
    const parsed=parseDecimal(taxText,2);
    if(parsed.ok)taxBp=parsed.scaled;
    else{taxBp=NaN;issues.push({room:null,field:'tax',message:parsed.reason==='decimals'?'Use at most 2 decimals.':'Use a plain number such as 8.25.'});}
  }
  const state={name:normalizeName($('quote-name').value),unit,market:$('market').value,taxBp,rooms};
  for(const issue of validateState(state))
    if(!issues.some(known=>known.room===issue.room&&known.field===issue.field))issues.push({...issue,message:issueMessage(issue,unit)});
  return {state,issues};
}

/* ---------- showing results ---------- */
function showIssues(issues){
  for(const error of document.querySelectorAll('.field-error')){error.hidden=true;error.textContent='';}
  for(const input of form.querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');
  const rooms=roomEls();
  for(const issue of issues){
    const room=issue.room===null?null:rooms[issue.room];
    const error=room?room.querySelector(`[data-error="${issue.field}"]`):issue.field==='tax'?$('tax-error'):null;
    if(!error)continue;
    error.hidden=false;
    error.textContent=issue.message;
    for(const input of inputsFor(room,issue.field))input.setAttribute('aria-invalid','true');
  }
}
function roomTitle(state,index){return state.rooms[index].name||`Room ${index+1}`;}
function refreshRoomControls(state){
  const rooms=roomEls(), count=rooms.length;
  rooms.forEach((room,index)=>{
    const title=roomTitle(state,index);
    room.querySelector('[data-title]').textContent=title;
    const duplicate=room.querySelector('[data-action="duplicate"]'), remove=room.querySelector('[data-action="remove"]');
    duplicate.setAttribute('aria-label',`Duplicate ${title}`);
    remove.setAttribute('aria-label',`Remove ${title}`);
    duplicate.disabled=count>=MAX_ROOMS;
    remove.disabled=count<=1;
  });
  $('add-room').disabled=count>=MAX_ROOMS;
  $('room-limit').textContent=`${count} of ${MAX_ROOMS} rooms. The ${DISCOUNT.percent}% multi-room discount starts at ${DISCOUNT.minRooms} rooms.`;
}
/** A room priced on its own: the discount, setup fee and tax belong to the whole quote, so this is its subtotal. */
const priceRoom=(state,index)=>priceQuote({market:state.market,taxBp:0,rooms:[state.rooms[index]]}).rooms[0];
function showRoomResults(state,issues){
  const money=moneyFormatter(state.market), {locale}=MARKETS[state.market];
  roomEls().forEach((room,index)=>{
    const out=room.querySelector('[data-result]');
    if(issues.some(issue=>issue.room===index)){out.textContent='Complete the marked fields to price this room.';return;}
    const priced=priceRoom(state,index);
    const parts=[`Walls ${areaText(priced.netWallMm2,state.unit,locale)}`+(priced.deductedMm2?` after ${areaText(priced.deductedMm2,'m',locale)} of doors and windows`:'')];
    if(priced.ceilingMm2)parts.push(`ceiling ${areaText(priced.ceilingMm2,state.unit,locale)}`);
    out.replaceChildren(h('strong',{},`Room subtotal ${money(priced.subtotalCents)}.`),` ${parts.join(', ')}.`);
  });
}
const summaryLine=(name,amount)=>h('li',{},h('span',{},name),h('span',{class:'amount'},amount));
function showSummary(state,priced,issues){
  const money=moneyFormatter(state.market);
  if(!priced){
    const count=new Set(issues.map(issue=>`${issue.room}:${issue.field}`)).size;
    $('summary-note').textContent=`Fix ${plural(count,'problem')} to see the total.`;
    $('room-totals').replaceChildren(...state.rooms.map((room,index)=>
      summaryLine(roomTitle(state,index),issues.some(issue=>issue.room===index)?'—':money(priceRoom(state,index).subtotalCents))));
    $('job-totals').replaceChildren();
    $('total').textContent=$('total-bar-value').textContent='—';
    return;
  }
  const view=describeQuote(state,priced);
  $('summary-note').textContent=`${plural(priced.rooms.length,'room')}${priced.discount.applies?`, ${priced.discount.percent}% multi-room discount applied`:''}.`;
  $('room-totals').replaceChildren(...view.rooms.map(room=>summaryLine(room.title,room.subtotal)));
  $('job-totals').replaceChildren(...view.jobRows.map(row=>h('div',{},h('dt',{},row.label),h('dd',{},row.amount))));
  $('total').textContent=$('total-bar-value').textContent=view.total;
}

/** The printable quote. It is rebuilt on every change so what prints is always what is on screen. */
function renderSheet(state,priced,now){
  const view=describeQuote(state,priced), {locale,currency}=MARKETS[state.market];
  const validUntil=formatDate(addDays(now,30),locale);
  const top=h('div',{class:'sheet-top'},
    h('div',{},h('p',{class:'sheet-studio'},'Second Coat'),h('p',{class:'sheet-note'},'Fictional painting studio. Sample quote.')),
    h('dl',{class:'sheet-meta'},
      h('dt',{},'Quote number'),h('dd',{},quoteNumber(state)),
      h('dt',{},'Date'),h('dd',{},formatDate(now,locale)),
      h('dt',{},'Valid until'),h('dd',{},validUntil),
      h('dt',{},'Currency'),h('dd',{},currency)));
  const roomTables=view.rooms.map(room=>h('table',{class:'sheet-table'},
    h('caption',{},h('strong',{},room.title),' ',room.details,...(room.deduction?[h('br'),room.deduction]:[])),
    h('thead',{},h('tr',{},...['Item','Quantity','Rate','Amount'].map(label=>h('th',{scope:'col'},label)))),
    h('tbody',{},
      ...room.rows.map(row=>h('tr',{},h('th',{scope:'row'},row.label),h('td',{},row.quantity),h('td',{},row.rate),h('td',{},row.amount))),
      h('tr',{class:'subtotal'},h('th',{scope:'row',colspan:'3'},'Room subtotal'),h('td',{},room.subtotal)))));
  const jobTable=h('table',{class:'sheet-table'},h('caption',{},h('strong',{},'Whole job')),
    h('tbody',{},
      ...view.jobRows.map(row=>h('tr',{class:row.key},h('th',{scope:'row',colspan:'3'},row.label),h('td',{},row.amount))),
      h('tr',{class:'grand'},h('th',{scope:'row',colspan:'3'},'Total'),h('td',{},view.total))));
  const terms=h('div',{class:'sheet-terms'},h('h2',{},'Terms'),h('ul',{},
    ...[`This quote is valid for 30 days, until ${validUntil}.`,
      'Walls are priced per m² of paint area. Each door (0.9 × 2.1 m) and each window (1.2 × 1.2 m) is deducted from the wall area, never below zero. Ceilings are not reduced.',
      `The setup fee is charged once for the whole job. From ${DISCOUNT.minRooms} rooms, ${DISCOUNT.percent}% is taken off the paint lines (walls and ceilings).`,
      'Every line is rounded to the nearest cent, halves up, before the lines are added. Tax, when shown, is added to the subtotal.',
      'Sizes are the ones entered when the quote was made; they were not checked on site.'].map(item=>h('li',{},item))));
  $('print-sheet').replaceChildren(top,h('h1',{id:'sheet-title'},'Painting quote'),...(state.name?[h('p',{class:'sheet-name'},state.name)]:[]),
    ...roomTables,jobTable,terms,h('p',{class:'sheet-demo'},'Fictional demo: this is not an offer, a contract or a booking, and Second Coat is not a real business.'));
}

/* ---------- state in the address and in the browser ---------- */
function persist(state){
  const code=encodeState(state);
  if(location.hash!==hashFor(code)){history.replaceState(null,'',hashFor(code));}
  if(code!==shownCode){shownCode=code;store.saveDraft(code);}
  $('share-link').value=location.href;
}
function update(){
  const {state,issues}=collect();
  showIssues(issues);
  refreshRoomControls(state);
  showRoomResults(state,issues);
  const priced=issues.length?null:priceQuote(state);
  showSummary(state,priced,issues);
  for(const id of ['save','copy-link','print'])$(id).disabled=!priced;
  if(priced){renderSheet(state,priced,new Date());persist(state);}
}
function applyState(state){
  $('quote-name').value=state.name;
  form.dataset.unit=state.unit;
  form.querySelector(`input[name="unit"][value="${state.unit}"]`).checked=true;
  $('market').value=state.market;
  $('tax').value=state.taxBp?String(state.taxBp/100):'';
  roomsList.replaceChildren(...state.rooms.map(buildRoom));
  update();
}

/* ---------- room actions ---------- */
function addRoom(){
  const count=roomEls().length;
  if(count>=MAX_ROOMS)return;
  const room=buildRoom(defaultRoom(count));
  roomsList.append(room);
  update();
  field(room,'name').focus();
  field(room,'name').select();
  setStatus(`${text(room,'name')} added. ${plural(count+1,'room')} in this quote.`);
}
function duplicateRoom(source){
  const count=roomEls().length;
  if(count>=MAX_ROOMS)return;
  const sourceTitle=source.querySelector('[data-title]').textContent;
  const copy=buildRoom(defaultRoom(0));
  for(const name of ['length-m','length-ft','length-in','width-m','width-ft','width-in','height-m','height-ft','height-in','doors','windows'])
    field(copy,name).value=text(source,name);
  copy.querySelector(`[data-field="finish"][value="${source.querySelector('[data-field="finish"]:checked').value}"]`).checked=true;
  field(copy,'ceiling').checked=field(source,'ceiling').checked;
  field(copy,'repair').checked=field(source,'repair').checked;
  const copyName=normalizeName(`${sourceTitle} copy`);
  field(copy,'name').value=copyName;
  source.after(copy);
  update();
  field(copy,'name').focus();
  setStatus(`${sourceTitle} duplicated as ${copyName}. ${plural(count+1,'room')} in this quote.`);
}
function removeRoom(room){
  const rooms=roomEls();
  if(rooms.length<=1)return;
  const index=rooms.indexOf(room), title=room.querySelector('[data-title]').textContent;
  const next=rooms[index+1]||rooms[index-1];
  room.remove();
  update();
  next.querySelector('[data-title]').focus();
  setStatus(`${title} removed. ${plural(rooms.length-1,'room')} in this quote.`);
}

/* ---------- saved quotes ---------- */
function renderSaved(){
  const {items,skipped,available}=store.list();
  savedList.replaceChildren(...[...items].sort((a,b)=>b.savedAt.localeCompare(a.savedAt)).map(item=>{
    const entry=savedTemplate.content.firstElementChild.cloneNode(true), {state}=item, {locale}=MARKETS[state.market];
    entry.dataset.id=item.id;
    entry.querySelector('[data-name]').textContent=item.name;
    entry.querySelector('[data-meta]').textContent=`${moneyFormatter(state.market)(priceQuote(state).totalCents)} · ${plural(state.rooms.length,'room')} · saved ${formatDate(new Date(item.savedAt),locale)}`;
    entry.querySelector('[data-action="load"]').setAttribute('aria-label',`Load ${item.name}`);
    entry.querySelector('[data-action="delete"]').setAttribute('aria-label',`Delete ${item.name}`);
    return entry;
  }));
  const empty=$('saved-empty');
  empty.hidden=items.length>0;
  empty.textContent=available?'No saved quotes yet. Saved quotes stay in this browser and are never sent anywhere.'
    :'This browser is not allowing local storage, so quotes cannot be saved here. The link still works.';
  $('saved-note').textContent=skipped?`${plural(skipped,'saved quote')} could not be read and ${skipped===1?'was':'were'} skipped.`:'';
}
savedList.addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');
  if(!button)return;
  const entry=button.closest('.saved-item'), name=entry.querySelector('[data-name]').textContent;
  if(button.dataset.action==='load'){
    const found=store.list().items.find(item=>item.id===entry.dataset.id);
    if(!found)return;
    applyState(found.state);
    $('quote-title').focus();
    setStatus(`Loaded "${found.name}".`);
  }else{
    const position=[...savedList.children].indexOf(entry);
    store.remove(entry.dataset.id);
    renderSaved();
    (savedList.children[Math.min(position,savedList.children.length-1)]?.querySelector('button')||$('saved-title')).focus();
    setStatus(`Deleted "${name}".`);
  }
});
$('save').addEventListener('click',()=>{
  const {state,issues}=collect();
  if(issues.length)return;
  const result=store.save(state.name||'Untitled quote',encodeState(state));
  if(result.ok){
    renderSaved();
    setStatus(result.replaced?`Updated "${result.name}" in your saved quotes.`:`Saved "${result.name}" in this browser.`);
  }else setStatus({
    full:`You can keep ${MAX_SAVED} saved quotes. Delete one first.`,
    storage:'This browser would not store the quote. Its storage may be full or blocked.',
    unavailable:'This browser is not allowing local storage, so the quote cannot be saved here. The link still works.',
    invalid:'That quote could not be saved.'}[result.reason],true);
});

/* ---------- other buttons and events ---------- */
$('copy-link').addEventListener('click',async()=>{
  const link=$('share-link');
  try{await navigator.clipboard.writeText(link.value);setStatus('Link copied. It holds the whole quote and nothing else.');}
  catch{link.focus();link.select();setStatus('Press Ctrl+C (or Cmd+C) to copy the link.');}
});
$('print').addEventListener('click',()=>window.print());
$('new-quote').addEventListener('click',()=>{
  applyState(defaultState());
  $('quote-name').focus();
  setStatus('Started a new quote. A quote you saved earlier is still in the saved list.');
});
$('add-room').addEventListener('click',addRoom);
roomsList.addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');
  if(!button)return;
  const room=button.closest('.room');
  if(button.dataset.action==='remove')removeRoom(room);else duplicateRoom(room);
});
form.addEventListener('submit',event=>event.preventDefault());
form.addEventListener('input',event=>{
  const target=event.target, room=target.closest('.room'), dimension=/^(length|width|height)-/.exec(target.dataset.field||'');
  if(target.name==='unit')form.dataset.unit=target.value;
  if(room&&dimension)syncDimension(room,dimension[1]);
  setStatus('');
  update();
});
addEventListener('beforeprint',update);
addEventListener('hashchange',()=>{
  const code=codeFromHash(location.hash);
  if(code===null){if(shownCode)history.replaceState(null,'',hashFor(shownCode));return;} // an in-page anchor must not drop the quote
  if(code===shownCode)return;
  const result=restoreState(code);
  applyState(result.state);
  setStatus(result.restored?'Loaded the quote from the link.':result.message,!result.restored);
});

/* ---------- start ---------- */
function start(){
  let result, message=null, warn=false;
  const linkCode=codeFromHash(location.hash);
  if(linkCode){
    result=restoreState(linkCode);
    if(result.restored)message='Loaded the quote from the link.';else{message=result.message;warn=true;}
  }else{
    const draft=store.loadDraft();
    result=restoreState(draft);
    if(draft&&result.restored)message='Restored your last quote from this browser.';
    else if(draft){message=result.message;warn=true;}
  }
  applyState(result.state);
  renderSaved();
  if(message)setStatus(message,warn);
}
start();
registerOffline();
