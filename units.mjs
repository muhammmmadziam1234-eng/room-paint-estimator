// Exact unit handling. Lengths become whole millimetres and areas whole square millimetres, so every
// price is integer arithmetic. Decimal text is read into scaled integers and never passes through
// floating point: 1 ft is exactly 304.8 mm and 1 in is exactly 25.4 mm.

/** Divide two non-negative integers and round half up: roundDiv(9, 2) is 5. */
export const roundDiv=(n,d)=>Math.floor((2*n+d)/(2*d));

const DECIMAL=/^(\d{1,5})(?:[.,](\d+))?$/;

/**
 * Read plain decimal text ("4.5", "4,5") into an integer scaled by 10^decimals.
 * Returns {ok:true, scaled} or {ok:false, reason:'empty'|'format'|'decimals'}.
 */
export function parseDecimal(text,decimals){
  if(typeof text!=='string')return {ok:false,reason:'format'};
  const trimmed=text.trim();
  if(trimmed==='')return {ok:false,reason:'empty'};
  const match=DECIMAL.exec(trimmed);
  if(!match)return {ok:false,reason:'format'};
  const fraction=(match[2]??'').replace(/0+$/,'');
  if(fraction.length>decimals)return {ok:false,reason:'decimals'};
  return {ok:true,scaled:Number(match[1])*10**decimals+Number(fraction.padEnd(decimals,'0')||'0')};
}

/** Metres with up to three decimals are whole millimetres. */
export function metresToMm(text){
  const parsed=parseDecimal(text,3);
  return parsed.ok?{ok:true,mm:parsed.scaled}:parsed;
}

const isBlank=text=>typeof text==='string'&&text.trim()==='';

/** Feet and inches, each with up to two decimals. A blank part counts as zero; both blank is 'empty'. */
export function feetInchesToMm(feetText,inchesText){
  if(isBlank(feetText)&&isBlank(inchesText))return {ok:false,reason:'empty'};
  const feet=isBlank(feetText)?{ok:true,scaled:0}:parseDecimal(feetText,2);
  if(!feet.ok)return {ok:false,reason:feet.reason,part:'feet'};
  const inches=isBlank(inchesText)?{ok:true,scaled:0}:parseDecimal(inchesText,2);
  if(!inches.ok)return {ok:false,reason:inches.reason,part:'inches'};
  // Both are in hundredths: mm = (feet x 304.8 + inches x 25.4) = (feet x 3048 + inches x 254) / 1000.
  return {ok:true,mm:roundDiv(feet.scaled*3048+inches.scaled*254,1000)};
}

/** 4500 -> "4.5", 4005 -> "4.005", 4000 -> "4". */
export function mmToMetresText(mm){
  const rest=mm%1000;
  return rest?Math.floor(mm/1000)+'.'+String(rest).padStart(3,'0').replace(/0+$/,''):String(Math.floor(mm/1000));
}

const hundredthsText=hundredths=>{
  const rest=hundredths%100;
  return rest?Math.floor(hundredths/100)+'.'+String(rest).padStart(2,'0').replace(/0+$/,''):String(Math.floor(hundredths/100));
};

/**
 * The shortest feet and inches text that converts back to exactly the same millimetres.
 * Whole inches are tried first, then tenths, then hundredths; hundredths (0.254 mm) always work.
 */
export function mmToFeetInchesText(mm){
  const exact=roundDiv(mm*1000,254); // inches in hundredths
  const text=hundredths=>({feet:String(Math.floor(hundredths/1200)),inches:hundredthsText(hundredths%1200)});
  for(const step of [100,10]){
    const candidate=text(roundDiv(exact,step)*step);
    if(feetInchesToMm(candidate.feet,candidate.inches).mm===mm)return candidate;
  }
  return text(exact);
}

/** Square millimetres to tenths of a square foot (1 ft2 = 92 903.04 mm2). */
export const mm2ToSquareFeetTenths=mm2=>roundDiv(mm2*1000,9290304);
