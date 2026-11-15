import test from 'node:test';
import assert from 'node:assert/strict';
import {priceQuote,validateQuote,QuoteError,LIMITS,RATE_CARDS,MARKETS,FINISH_LABELS} from '../quote.mjs';

const room=(over={})=>({lengthMm:4500,widthMm:3500,heightMm:2500,finish:'matte',ceiling:false,repair:false,doors:0,windows:0,...over});
const quote=(rooms,over={})=>({market:'us',taxBp:0,rooms,...over});
const cents=(result,roomIndex,key)=>result.rooms[roomIndex].lines.find(line=>line.key===key)?.cents;

test('one plain room prices like the original single-room estimate',()=>{
  // Walls: 2 x (4.5 + 3.5) x 2.5 = 40 m2 at 4.25 = 170.00. Setup 45.00.
  const result=priceQuote(quote([room()]));
  assert.equal(cents(result,0,'walls'),17000);
  assert.equal(result.setup.cents,4500);
  assert.equal(result.discount.cents,0);
  assert.equal(result.discount.applies,false);
  assert.equal(result.subtotalCents,21500);
  assert.equal(result.tax.cents,0);
  assert.equal(result.totalCents,21500);
});

test('doors (0.9 x 2.1 m) and windows (1.2 x 1.2 m) come off the wall area',()=>{
  // 1 door + 2 windows = 1.89 + 2 x 1.44 = 4.77 m2 -> 35.23 m2 net.
  // 35.23 x 4.25 = 149.7275 -> 149.73 (the half cent is rounded up). Total 149.73 + 45.00 = 194.73.
  const result=priceQuote(quote([room({doors:1,windows:2})]));
  assert.equal(result.rooms[0].grossWallMm2,40_000_000);
  assert.equal(result.rooms[0].deductedMm2,4_770_000);
  assert.equal(result.rooms[0].netWallMm2,35_230_000);
  assert.equal(cents(result,0,'walls'),14973);
  assert.equal(result.totalCents,19473);
});

test('openings larger than the walls leave zero, never a negative price',()=>{
  // Smallest room: 2 x 2 x 2 m = 16 m2 of wall. Ten doors and ten windows are 33.3 m2.
  const result=priceQuote(quote([room({lengthMm:2000,widthMm:2000,heightMm:2000,doors:10,windows:10})]));
  assert.equal(result.rooms[0].netWallMm2,0);
  assert.equal(result.rooms[0].deductedMm2,16_000_000); // only what the wall can give up
  assert.equal(cents(result,0,'walls'),0);
  assert.equal(result.totalCents,4500);                 // the setup fee alone
  // Ceilings are not reduced by openings.
  const withCeiling=priceQuote(quote([room({lengthMm:2000,widthMm:2000,heightMm:2000,doors:10,windows:10,ceiling:true})]));
  assert.equal(cents(withCeiling,0,'ceiling'),1400);    // 4 m2 x 3.50
  assert.equal(withCeiling.totalCents,5900);
});

test('three rooms: setup once, 5% off paint lines only, then tax on the subtotal (worked by hand)',()=>{
  const rooms=[
    // 36.67 m2 x 4.25 = 155.8475 -> 155.85; ceiling 15.75 m2 x 3.50 = 55.125 -> 55.13; repairs 65.00. Room: 275.98
    room({doors:1,windows:1,ceiling:true,repair:true}),
    // 26.91 m2 x 5.00 = 134.55. Room: 134.55
    room({lengthMm:3000,widthMm:3000,heightMm:2400,finish:'eggshell',doors:1}),
    // 45.72 m2 x 5.90 = 269.748 -> 269.75; ceiling 20 m2 x 3.50 = 70.00. Room: 339.75
    room({lengthMm:5000,widthMm:4000,heightMm:2700,finish:'satin',ceiling:true,windows:2})
  ];
  const result=priceQuote(quote(rooms,{taxBp:825}));
  assert.deepEqual(result.rooms.map(r=>r.subtotalCents),[27598,13455,33975]);
  assert.deepEqual(result.rooms.map(r=>r.lines.map(l=>l.cents)),[[15585,5513,6500],[13455],[26975,7000]]);
  assert.equal(result.paintCents,68528);          // 155.85 + 55.13 + 134.55 + 269.75 + 70.00
  assert.equal(result.setup.cents,4500);          // once, not 3 x 45.00
  assert.equal(result.discount.percent,5);
  assert.equal(result.discount.cents,3426);       // 68528 x 5% = 3426.4 -> 34.26 (repairs and setup are not discounted)
  assert.equal(result.subtotalCents,76102);       // 68528 + 6500 + 4500 - 3426
  assert.equal(result.tax.bp,825);
  assert.equal(result.tax.cents,6278);            // 76102 x 8.25% = 6278.415 -> 62.78
  assert.equal(result.totalCents,82380);
});

test('the discount starts at the third room and not before',()=>{
  const two=priceQuote(quote([room(),room()]));
  assert.equal(two.discount.applies,false);
  assert.equal(two.discount.cents,0);
  assert.equal(two.totalCents,2*17000+4500);
  const three=priceQuote(quote([room(),room(),room()]));
  assert.equal(three.discount.applies,true);
  assert.equal(three.discount.cents,2550);        // 51000 x 5%
  assert.equal(three.totalCents,3*17000+4500-2550);
});

test('a discount that lands exactly on half a cent rounds up',()=>{
  // Paint lines: 93.50 + 24.50 (room 1), 93.50 (room 2), 170.00 (room 3) = 381.50 -> 5% = 19.075 -> 19.08.
  const result=priceQuote(quote([
    room({lengthMm:3500,widthMm:2000,heightMm:2000,ceiling:true}),
    room({lengthMm:3500,widthMm:2000,heightMm:2000}),
    room()
  ]));
  assert.equal(result.paintCents,38150);
  assert.equal(result.discount.cents,1908);
  assert.equal(result.totalCents,38150+4500-1908);
});

test('tax is optional, capped at 25 % and rounds a half cent up',()=>{
  assert.equal(priceQuote(quote([room()])).tax.cents,0);
  // 215.00 x 5.10 % = 10.965 -> 10.97
  const tie=priceQuote(quote([room()],{taxBp:510}));
  assert.equal(tie.tax.cents,1097);
  assert.equal(tie.totalCents,22597);
  const top=priceQuote(quote([room()],{taxBp:2500}));
  assert.equal(top.tax.cents,5375);               // 215.00 x 25 %
  assert.equal(top.totalCents,26875);
});

test('every line is rounded to cents first and the rounded lines are summed',()=>{
  // Each ceiling is 55.125 -> 55.13. Two of them are 110.26, not round(110.25) = 110.25.
  const result=priceQuote(quote([room({ceiling:true}),room({ceiling:true})]));
  assert.equal(cents(result,0,'ceiling')+cents(result,1,'ceiling'),11026);
  assert.equal(result.paintCents,2*17000+11026);
});

test('each market uses its own fictional price list',()=>{
  const base=quote([room()]);
  assert.equal(priceQuote({...base,market:'us'}).totalCents,17000+4500);
  assert.equal(priceQuote({...base,market:'gb'}).totalCents,40*340+3600);   // 17200
  assert.equal(priceQuote({...base,market:'de'}).totalCents,40*390+4100);   // 19700
  assert.equal(priceQuote({...base,market:'fr'}).totalCents,40*390+4100);
  assert.equal(priceQuote({...base,market:'gb'}).currency,'GBP');
  assert.equal(priceQuote({...base,market:'fr'}).locale,'fr-FR');
  assert.deepEqual(Object.keys(RATE_CARDS).sort(),['EUR','GBP','USD']);
  assert.deepEqual(Object.keys(MARKETS).sort(),['de','fr','gb','us']);
  assert.deepEqual(Object.keys(FINISH_LABELS),['matte','eggshell','satin']);
});

test('limits are inclusive and one step beyond each is refused',()=>{
  const ok=(r,extra)=>assert.deepEqual(validateQuote(quote([r],extra)),[]);
  const bad=(r,field,extra)=>{const issues=validateQuote(quote([r],extra));assert.equal(issues.length,1,field);assert.equal(issues[0].field,field);assert.equal(issues[0].room,field==='tax'?null:0);};
  ok(room({lengthMm:2000,widthMm:2000,heightMm:2000}));
  ok(room({lengthMm:15000,widthMm:15000,heightMm:5000,doors:10,windows:10}));
  ok(room(),{taxBp:0});ok(room(),{taxBp:2500});
  bad(room({lengthMm:1999}),'length');bad(room({lengthMm:15001}),'length');
  bad(room({widthMm:1999}),'width');bad(room({widthMm:15001}),'width');
  bad(room({heightMm:1999}),'height');bad(room({heightMm:5001}),'height');
  bad(room({doors:-1}),'doors');bad(room({doors:11}),'doors');bad(room({windows:11}),'windows');
  bad(room({doors:1.5}),'doors');bad(room({lengthMm:4500.5}),'length');
  bad(room({finish:'gloss'}),'finish');bad(room({finish:'__proto__'}),'finish');bad(room({finish:undefined}),'finish');
  bad(room(),'tax',{taxBp:-1});bad(room(),'tax',{taxBp:2501});bad(room(),'tax',{taxBp:825.5});
  assert.equal(validateQuote({...quote([room()]),market:'xx'})[0].field,'market');
  assert.equal(validateQuote(quote([])).length,1);
  assert.equal(validateQuote(quote(Array.from({length:11},()=>room())))[0].field,'rooms');
  assert.equal(validateQuote(quote(Array.from({length:10},()=>room()))).length,0);
  assert.deepEqual([LIMITS.rooms,LIMITS.length,LIMITS.height,LIMITS.taxBp],[[1,10],[2000,15000],[2000,5000],[0,2500]]);
});

test('every problem is reported with its room and field, and priceQuote throws a RangeError carrying them',()=>{
  const q=quote([room({lengthMm:100,doors:99}),room(),room({finish:'gloss',heightMm:9000})],{taxBp:9999});
  const issues=validateQuote(q);
  assert.deepEqual(issues.map(i=>[i.room,i.field]),[[0,'length'],[0,'doors'],[2,'height'],[2,'finish'],[null,'tax']]);
  assert.ok(issues.every(i=>typeof i.message==='string'&&i.message.length>5));
  assert.match(issues[0].message,/length from 2 to 15 m/);
  assert.throws(()=>priceQuote(q),err=>err instanceof QuoteError&&err instanceof RangeError&&err.issues.length===5);
});

test('garbage input is reported, never thrown from validateQuote',()=>{
  for(const junk of [undefined,null,0,'text',[],{},{rooms:'x'},{rooms:[null]},{rooms:[[]],market:'us'},{rooms:[room()],market:7},quote([room({lengthMm:NaN})]),
    quote([room({lengthMm:Infinity,heightMm:'2500'})]),quote([room({ceiling:'yes'})]),quote([room({repair:1})]),quote([room()],{taxBp:'8'})]){
    const issues=validateQuote(junk);
    assert.ok(Array.isArray(issues)&&issues.length>0,JSON.stringify(junk));
  }
});

test('pricing leaves its input untouched',()=>{
  const deepFreeze=o=>{for(const v of Object.values(o))if(v&&typeof v==='object')deepFreeze(v);return Object.freeze(o);};
  const q=deepFreeze(quote([room({doors:2}),room({ceiling:true}),room({repair:true})],{taxBp:700}));
  assert.doesNotThrow(()=>priceQuote(q));
});

// ---- Independent reference: BigInt, divide-with-remainder rounding and its own copy of the price lists. ----
const PRICE={USD:{matte:425n,eggshell:500n,satin:590n,ceiling:350n,repairs:6500n,setup:4500n},
  GBP:{matte:340n,eggshell:400n,satin:470n,ceiling:280n,repairs:5200n,setup:3600n},
  EUR:{matte:390n,eggshell:460n,satin:540n,ceiling:320n,repairs:6000n,setup:4100n}};
const CURRENCY={us:'USD',gb:'GBP',de:'EUR',fr:'EUR'};
const halfUp=(n,d)=>{const q=n/d,r=n%d;return 2n*r>=d?q+1n:q;};
function reference(q){
  const p=PRICE[CURRENCY[q.market]];
  let paint=0n,other=0n;const perRoom=[];
  for(const r of q.rooms){
    const [l,w,h]=[BigInt(r.lengthMm),BigInt(r.widthMm),BigInt(r.heightMm)];
    let net=2n*(l+w)*h-BigInt(r.doors)*(900n*2100n)-BigInt(r.windows)*(1200n*1200n);
    if(net<0n)net=0n;
    const walls=halfUp(net*p[r.finish],1000000n);
    const ceiling=r.ceiling?halfUp(l*w*p.ceiling,1000000n):0n;
    const repairs=r.repair?p.repairs:0n;
    paint+=walls+ceiling;other+=repairs;
    perRoom.push({walls,ceiling,repairs,subtotal:walls+ceiling+repairs});
  }
  const discount=q.rooms.length>=3?halfUp(paint*5n,100n):0n;
  const subtotal=paint+other+p.setup-discount;
  const tax=halfUp(subtotal*BigInt(q.taxBp),10000n);
  return {perRoom,paint,discount,subtotal,tax,total:subtotal+tax};
}
function mulberry32(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

test('5000 seeded random quotes match the independent integer reference to the cent',()=>{
  const rnd=mulberry32(20261115);
  const int=(a,b)=>a+Math.floor(rnd()*(b-a+1));
  const edge=(a,b)=>{const x=rnd();return x<.08?a:x<.16?b:int(a,b);};
  const finishes=Object.keys(FINISH_LABELS), markets=Object.keys(MARKETS);
  let discounted=0,clamped=0,taxed=0;
  for(let n=0;n<5000;n++){
    const randomRoom=()=>rnd()<.15
      // Small rooms with many openings, so the "deductions exceed the walls" branch is exercised.
      ?room({lengthMm:int(2000,3000),widthMm:int(2000,3000),heightMm:int(2000,2500),finish:finishes[int(0,2)],
        ceiling:rnd()<.5,repair:rnd()<.5,doors:int(4,10),windows:int(4,10)})
      :room({lengthMm:edge(2000,15000),widthMm:edge(2000,15000),heightMm:edge(2000,5000),finish:finishes[int(0,2)],
        ceiling:rnd()<.5,repair:rnd()<.5,doors:rnd()<.3?0:edge(0,10),windows:rnd()<.3?0:edge(0,10)});
    const q=quote(Array.from({length:int(1,10)},randomRoom),
      {market:markets[int(0,3)],taxBp:rnd()<.4?0:edge(0,2500)});
    const got=priceQuote(q), want=reference(q);
    assert.deepEqual(got.rooms.map(r=>[cents(got,r.index,'walls'),cents(got,r.index,'ceiling')??0,cents(got,r.index,'repairs')??0]),
      want.perRoom.map(r=>[Number(r.walls),Number(r.ceiling),Number(r.repairs)]),'lines of quote '+n);
    assert.deepEqual([got.paintCents,got.discount.cents,got.subtotalCents,got.tax.cents,got.totalCents],
      [want.paint,want.discount,want.subtotal,want.tax,want.total].map(Number),'totals of quote '+n);
    assert.equal(got.rooms.reduce((s,r)=>s+r.subtotalCents,0)+got.setup.cents-got.discount.cents,got.subtotalCents);
    if(got.discount.applies)discounted++;
    if(got.rooms.some(r=>r.netWallMm2===0))clamped++;
    if(got.tax.cents>0)taxed++;
  }
  // The generator really reached the interesting cases.
  assert.ok(discounted>2500&&clamped>100&&taxed>2000,[discounted,clamped,taxed].join());
});
