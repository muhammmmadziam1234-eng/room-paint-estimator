export const finishes={
  matte:{label:'Matte',centsPerM2:425},
  eggshell:{label:'Eggshell',centsPerM2:500},
  satin:{label:'Satin',centsPerM2:590}
};
const range=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
// Measurements become whole millimetres and areas whole square millimetres, so every
// price is exact integer arithmetic. Half a cent rounds up and never drifts by a cent.
const mm=metres=>Math.round(metres*1000);
const priceInCents=(squareMm,centsPerM2)=>Math.floor((squareMm*centsPerM2+500000)/1000000);
export function estimate({length,width,height,finish,ceiling=false,repair=false}){
  if(!range(length,2,15)||!range(width,2,15)||!range(height,2,5))
    throw new RangeError('Enter a length and width from 2 to 15 m, and a height from 2 to 5 m.');
  if(!Object.hasOwn(finishes,finish))throw new RangeError('Choose a paint finish.');
  const option=finishes[finish], [l,w,h]=[length,width,height].map(mm);
  const wallsMm2=2*(l+w)*h, ceilingMm2=ceiling?l*w:0;
  const lines=[
    {label:'Wall paint and labour',cents:priceInCents(wallsMm2,option.centsPerM2)},
    ...(ceiling?[{label:'Ceiling paint and labour',cents:priceInCents(ceilingMm2,350)}]:[]),
    ...(repair?[{label:'Minor wall repairs',cents:6500}]:[]),
    {label:'Room protection and setup',cents:4500}
  ];
  return {walls:wallsMm2/1e6,ceiling:ceilingMm2/1e6,finish:option.label,lines,total:lines.reduce((sum,item)=>sum+item.cents,0)};
}
