// The original single-room estimate, kept as a thin wrapper over the quote engine in quote.mjs
// so both share one price list and one set of rounding rules.
import {priceQuote,FINISH_LABELS,RATE_CARDS} from './quote.mjs';

export const finishes=Object.fromEntries(Object.entries(FINISH_LABELS).map(([key,label])=>[key,{label,centsPerM2:RATE_CARDS.USD[key]}]));
const range=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const mm=metres=>Math.round(metres*1000);
export function estimate({length,width,height,finish,ceiling=false,repair=false}){
  if(!range(length,2,15)||!range(width,2,15)||!range(height,2,5))
    throw new RangeError('Enter a length and width from 2 to 15 m, and a height from 2 to 5 m.');
  if(!Object.hasOwn(finishes,finish))throw new RangeError('Choose a paint finish.');
  const priced=priceQuote({market:'us',taxBp:0,rooms:[{
    lengthMm:mm(length),widthMm:mm(width),heightMm:mm(height),finish,ceiling:Boolean(ceiling),repair:Boolean(repair),doors:0,windows:0}]});
  const [room]=priced.rooms;
  return {
    walls:room.netWallMm2/1e6,ceiling:room.ceilingMm2/1e6,finish:finishes[finish].label,
    lines:[...room.lines.map(({label,cents})=>({label,cents})),{label:priced.setup.label,cents:priced.setup.cents}],
    total:priced.totalCents
  };
}
