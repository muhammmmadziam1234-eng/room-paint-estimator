// Pricing engine for a multi-room painting quote. Pure functions, integer arithmetic only:
// lengths are whole millimetres, areas whole square millimetres, money whole cents.
// Every rule below is a rule of this fictional demo studio, listed in the README.
import {roundDiv} from './units.mjs';

const pair=(min,max)=>Object.freeze([min,max]);

export const FINISH_LABELS=Object.freeze({matte:'Matte',eggshell:'Eggshell',satin:'Satin'});

/** Fictional price lists in minor units (cents, pence). Per m2 for paint; flat for repairs and setup. Not exchange rates. */
export const RATE_CARDS=Object.freeze({
  USD:Object.freeze({matte:425,eggshell:500,satin:590,ceiling:350,repairs:6500,setup:4500}),
  GBP:Object.freeze({matte:340,eggshell:400,satin:470,ceiling:280,repairs:5200,setup:3600}),
  EUR:Object.freeze({matte:390,eggshell:460,satin:540,ceiling:320,repairs:6000,setup:4100})
});

/** Currency and number format pairs offered to the visitor. The currency picks the price list. */
export const MARKETS=Object.freeze({
  us:Object.freeze({locale:'en-US',currency:'USD',label:'United States, US dollar'}),
  gb:Object.freeze({locale:'en-GB',currency:'GBP',label:'United Kingdom, pound sterling'}),
  de:Object.freeze({locale:'de-DE',currency:'EUR',label:'Germany, euro'}),
  fr:Object.freeze({locale:'fr-FR',currency:'EUR',label:'France, euro'})
});

export const LIMITS=Object.freeze({
  rooms:pair(1,10),length:pair(2000,15000),width:pair(2000,15000),height:pair(2000,5000),
  doors:pair(0,10),windows:pair(0,10),taxBp:pair(0,2500)
});

/** A door is 0.9 x 2.1 m and a window 1.2 x 1.2 m, in square millimetres. */
export const OPENINGS=Object.freeze({doorMm2:900*2100,windowMm2:1200*1200});

/** 5 % off the paint lines (walls and ceilings) from the third room on. */
export const DISCOUNT=Object.freeze({minRooms:3,percent:5});

const MM2_PER_M2=1_000_000;
const isInt=(value,[min,max])=>Number.isSafeInteger(value)&&value>=min&&value<=max;

export class QuoteError extends RangeError{
  constructor(issues){
    super(issues[0].message);
    this.name='QuoteError';
    this.issues=issues;
  }
}

function validateRoom(room,index,add){
  if(!room||typeof room!=='object'||Array.isArray(room)){add(index,'room','This room is not valid.');return;}
  for(const [field,key] of [['length','lengthMm'],['width','widthMm'],['height','heightMm']]){
    const [min,max]=LIMITS[field];
    if(!isInt(room[key],LIMITS[field]))add(index,field,`Enter a ${field} from ${min/1000} to ${max/1000} m.`);
  }
  if(typeof room.finish!=='string'||!Object.hasOwn(FINISH_LABELS,room.finish))add(index,'finish','Choose a paint finish.');
  for(const field of ['doors','windows']){
    const [min,max]=LIMITS[field];
    if(!isInt(room[field],LIMITS[field]))add(index,field,`Enter a number of ${field} from ${min} to ${max}.`);
  }
  for(const field of ['ceiling','repair'])
    if(typeof room[field]!=='boolean')add(index,field,`Choose yes or no for ${field==='ceiling'?'the ceiling':'repairs'}.`);
}

/** Every problem in a quote as {room (index or null), field, message}. An empty array means it can be priced. Never throws. */
export function validateQuote(quote){
  const issues=[];
  const add=(room,field,message)=>issues.push({room,field,message});
  if(!quote||typeof quote!=='object'||Array.isArray(quote)){
    add(null,'rooms','Add 1 to 10 rooms.');
    return issues;
  }
  if(typeof quote.market!=='string'||!Object.hasOwn(MARKETS,quote.market))add(null,'market','Choose a currency and number format.');
  const {rooms}=quote;
  if(!Array.isArray(rooms)||rooms.length<LIMITS.rooms[0]||rooms.length>LIMITS.rooms[1])add(null,'rooms','Add 1 to 10 rooms.');
  else rooms.forEach((room,index)=>validateRoom(room,index,add));
  if(!isInt(quote.taxBp,LIMITS.taxBp))add(null,'tax','Enter a tax rate from 0 to 25 %.');
  return issues;
}

/**
 * Price a quote. Throws a QuoteError (a RangeError with .issues) if validateQuote finds anything.
 *
 * Rules, in order:
 *  1. Wall area is the perimeter times the height, minus 1.89 m2 per door and 1.44 m2 per window,
 *     never below zero. Ceiling area is length times width (openings do not reduce it).
 *  2. Each paint line is area x price per m2, rounded half up to a whole cent. Repairs are a flat line.
 *  3. The setup fee is charged once for the whole quote, not per room.
 *  4. From 3 rooms on, 5 % of the summed paint lines (walls and ceilings only) is taken off, rounded half up.
 *  5. Tax is applied to the subtotal (after the discount) and rounded half up. The total is the sum.
 */
export function priceQuote(quote){
  const issues=validateQuote(quote);
  if(issues.length)throw new QuoteError(issues);
  const market=MARKETS[quote.market], card=RATE_CARDS[market.currency];
  const rooms=quote.rooms.map((room,index)=>{
    const {lengthMm:length,widthMm:width,heightMm:height}=room;
    const grossWallMm2=2*(length+width)*height;
    const openingsMm2=room.doors*OPENINGS.doorMm2+room.windows*OPENINGS.windowMm2;
    const netWallMm2=Math.max(0,grossWallMm2-openingsMm2);
    const ceilingMm2=room.ceiling?length*width:0;
    const lines=[{key:'walls',label:'Wall paint and labour',mm2:netWallMm2,rate:card[room.finish],cents:roundDiv(netWallMm2*card[room.finish],MM2_PER_M2),paint:true}];
    if(room.ceiling)lines.push({key:'ceiling',label:'Ceiling paint and labour',mm2:ceilingMm2,rate:card.ceiling,cents:roundDiv(ceilingMm2*card.ceiling,MM2_PER_M2),paint:true});
    if(room.repair)lines.push({key:'repairs',label:'Minor wall repairs',cents:card.repairs,paint:false});
    return {
      index,finish:room.finish,grossWallMm2,openingsMm2,deductedMm2:Math.min(grossWallMm2,openingsMm2),netWallMm2,ceilingMm2,lines,
      subtotalCents:lines.reduce((sum,line)=>sum+line.cents,0)
    };
  });
  const paintCents=rooms.reduce((sum,room)=>sum+room.lines.filter(line=>line.paint).reduce((s,line)=>s+line.cents,0),0);
  const setup={label:'Room protection and setup',cents:card.setup};
  const applies=rooms.length>=DISCOUNT.minRooms;
  const discount={percent:DISCOUNT.percent,minRooms:DISCOUNT.minRooms,applies,cents:applies?roundDiv(paintCents*DISCOUNT.percent,100):0};
  const subtotalCents=rooms.reduce((sum,room)=>sum+room.subtotalCents,0)+setup.cents-discount.cents;
  const tax={bp:quote.taxBp,cents:roundDiv(subtotalCents*quote.taxBp,10000)};
  return {market:quote.market,currency:market.currency,locale:market.locale,rooms,setup,paintCents,discount,subtotalCents,tax,totalCents:subtotalCents+tax.cents};
}
