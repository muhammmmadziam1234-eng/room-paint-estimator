export const finishes={
  matte:{label:'Matte',centsPerM2:425},
  eggshell:{label:'Eggshell',centsPerM2:500},
  satin:{label:'Satin',centsPerM2:590}
};
const range=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
export function estimate({length,width,height,finish,ceiling=false,repair=false}){
  if(!range(length,2,15)||!range(width,2,15)||!range(height,2,5))
    throw new RangeError('Enter a length and width from 2 to 15 m, and a height from 2 to 5 m.');
  if(!Object.hasOwn(finishes,finish))throw new RangeError('Choose a paint finish.');
  const option=finishes[finish], walls=2*(length+width)*height, ceilingArea=ceiling?length*width:0;
  const lines=[
    {label:'Wall paint and labour',cents:Math.round(walls*option.centsPerM2)},
    ...(ceiling?[{label:'Ceiling paint and labour',cents:Math.round(ceilingArea*350)}]:[]),
    ...(repair?[{label:'Minor wall repairs',cents:6500}]:[]),
    {label:'Room protection and setup',cents:4500}
  ];
  return {walls,ceiling:ceilingArea,finish:option.label,lines,total:lines.reduce((sum,item)=>sum+item.cents,0)};
}
