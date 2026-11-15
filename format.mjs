// Display helpers: money, areas, lengths and dates for a chosen market, and the description of a
// priced quote that both the on-screen summary and the printed sheet are drawn from.
// Prices reach Intl as decimal strings built from integers, never as floating-point sums.
import {roundDiv,mmToMetresText,mmToFeetInchesText,mm2ToSquareFeetTenths} from './units.mjs';
import {MARKETS,FINISH_LABELS,LIMITS} from './quote.mjs';

/** decimalText(12345, 2) is "123.45"; decimalText(-5, 2) is "-0.05". */
export function decimalText(scaled,decimals){
  const digits=String(Math.abs(scaled)).padStart(decimals+1,'0');
  return (scaled<0?'-':'')+digits.slice(0,-decimals)+'.'+digits.slice(-decimals);
}

const formats=new Map();
function numberFormat(locale,options){
  const key=locale+'|'+JSON.stringify(options);
  if(!formats.has(key))formats.set(key,new Intl.NumberFormat(locale,options));
  return formats.get(key);
}
const fixed=(locale,digits)=>numberFormat(locale,{minimumFractionDigits:digits,maximumFractionDigits:digits});

/** A function from whole cents to text such as "$1,234.56", for one of the markets. */
export function moneyFormatter(market){
  const {locale,currency}=MARKETS[market], format=numberFormat(locale,{style:'currency',currency});
  return cents=>format.format(decimalText(cents,2));
}

/** Areas are priced per m2. In imperial mode the square feet follow in brackets. */
export function areaText(mm2,unit,locale){
  const metric=fixed(locale,2).format(decimalText(roundDiv(mm2,10000),2))+' m²';
  return unit==='ft'?metric+' ('+fixed(locale,1).format(decimalText(mm2ToSquareFeetTenths(mm2),1))+' ft²)':metric;
}

export function lengthText(mm,unit,locale='en-US'){
  if(unit==='ft'){
    const {feet,inches}=mmToFeetInchesText(mm);
    return feet+' ft'+(inches==='0'?'':' '+inches+' in');
  }
  return numberFormat(locale,{maximumFractionDigits:3}).format(mmToMetresText(mm))+' m';
}

export function dimensionsText(room,unit,locale){
  const sizes=[room.lengthMm,room.widthMm,room.heightMm];
  if(unit==='ft')return sizes.map(mm=>lengthText(mm,'ft')).join(' × ');
  return sizes.map(mm=>numberFormat(locale,{maximumFractionDigits:3}).format(mmToMetresText(mm))).join(' × ')+' m';
}

export const percentText=(basisPoints,locale)=>numberFormat(locale,{style:'percent',maximumFractionDigits:2}).format(basisPoints/10000);
export const formatDate=(date,locale)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(date);
export function addDays(date,days){
  const result=new Date(date.getTime());
  result.setDate(result.getDate()+days);
  return result;
}

/** The engine words its range messages in metres; in imperial mode restate them in feet and inches. */
export function issueMessage(issue,unit){
  if(unit==='ft'&&['length','width','height'].includes(issue.field)){
    const [min,max]=LIMITS[issue.field];
    return `Enter a ${issue.field} from ${lengthText(min,'ft')} to ${lengthText(max,'ft')}.`;
  }
  return issue.message;
}

const plural=(count,word)=>`${count} ${word}${count===1?'':'s'}`;

/** Everything the summary and the printed quote show, as plain text ready to place on the page. */
export function describeQuote(state,priced){
  const {locale}=MARKETS[state.market], money=moneyFormatter(state.market), {unit}=state;
  const rooms=priced.rooms.map((result,index)=>{
    const room=state.rooms[index];
    const openings=[room.doors&&plural(room.doors,'door'),room.windows&&plural(room.windows,'window')].filter(Boolean);
    return {
      title:room.name||`Room ${index+1}`,
      details:[dimensionsText(room,unit,locale),FINISH_LABELS[room.finish],...(openings.length?[openings.join(' and ')]:[])].join(' · '),
      deduction:result.deductedMm2>0?`Openings deducted: ${areaText(result.deductedMm2,'m',locale)}`:'',
      rows:result.lines.map(line=>({
        key:line.key,label:line.label,
        quantity:line.mm2===undefined?'1':areaText(line.mm2,unit,locale),
        rate:line.rate===undefined?'flat':money(line.rate)+' per m²',
        amount:money(line.cents)
      })),
      subtotal:money(result.subtotalCents)
    };
  });
  const jobRows=[{key:'setup',label:`${priced.setup.label} (once per quote)`,amount:money(priced.setup.cents)}];
  if(priced.discount.applies)
    jobRows.push({key:'discount',label:`Multi-room discount (${priced.discount.percent}% of paint lines, ${priced.discount.minRooms}+ rooms)`,amount:money(-priced.discount.cents)});
  jobRows.push({key:'subtotal',label:'Subtotal',amount:money(priced.subtotalCents)});
  if(priced.tax.bp>0)jobRows.push({key:'tax',label:`Tax (${percentText(priced.tax.bp,locale)})`,amount:money(priced.tax.cents)});
  return {rooms,jobRows,total:money(priced.totalCents)};
}
