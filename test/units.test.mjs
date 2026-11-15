import test from 'node:test';
import assert from 'node:assert/strict';
import {roundDiv,parseDecimal,metresToMm,feetInchesToMm,mmToMetresText,mmToFeetInchesText,mm2ToSquareFeetTenths} from '../units.mjs';

test('roundDiv rounds halves up with integers only',()=>{
  assert.equal(roundDiv(9,2),5);          // 4.5
  assert.equal(roundDiv(1,3),0);          // 0.33
  assert.equal(roundDiv(2,3),1);          // 0.67
  assert.equal(roundDiv(0,7),0);
  assert.equal(roundDiv(10965000,10000),1097); // 1096.5
});

test('parseDecimal reads plain decimals into scaled integers',()=>{
  assert.deepEqual(parseDecimal('4.5',3),{ok:true,scaled:4500});
  assert.deepEqual(parseDecimal(' 4,5 ',3),{ok:true,scaled:4500});
  assert.deepEqual(parseDecimal('0.001',3),{ok:true,scaled:1});
  assert.deepEqual(parseDecimal('12',2),{ok:true,scaled:1200});
  assert.deepEqual(parseDecimal('007',0),{ok:true,scaled:7});
  assert.deepEqual(parseDecimal('1.500000',3),{ok:true,scaled:1500}); // trailing zeros are harmless
});

test('parseDecimal names the reason when it refuses',()=>{
  const cases=[['','empty'],['   ','empty'],['abc','format'],['-1','format'],['+4','format'],['1e3','format'],['4..5','format'],
    ['4.5.1','format'],['.5','format'],['4.','format'],['1 000','format'],['١٢','format'],['123456','format'],[null,'format'],[4.5,'format'],
    [undefined,'format'],['4.1234','decimals']];
  for(const [text,reason] of cases)assert.deepEqual(parseDecimal(text,3),{ok:false,reason},String(text));
});

test('metres convert to whole millimetres',()=>{
  assert.deepEqual(metresToMm('4.5'),{ok:true,mm:4500});
  assert.deepEqual(metresToMm('2'),{ok:true,mm:2000});
  assert.deepEqual(metresToMm('14,999'),{ok:true,mm:14999});
  assert.deepEqual(metresToMm('4.0005'),{ok:false,reason:'decimals'});
  assert.deepEqual(metresToMm(''),{ok:false,reason:'empty'});
});

test('feet and inches convert exactly; a half millimetre rounds up',()=>{
  // 1 ft is exactly 304.8 mm and 1 in is exactly 25.4 mm.
  assert.deepEqual(feetInchesToMm('10','0'),{ok:true,mm:3048});
  assert.deepEqual(feetInchesToMm('14','9'),{ok:true,mm:4496});   // 4267.2 + 228.6 = 4495.8
  assert.deepEqual(feetInchesToMm('','100'),{ok:true,mm:2540});
  assert.deepEqual(feetInchesToMm('6.5',''),{ok:true,mm:1981});   // 1981.2
  assert.deepEqual(feetInchesToMm('0','2.5'),{ok:true,mm:64});    // exactly 63.5
  assert.deepEqual(feetInchesToMm('0','2.4'),{ok:true,mm:61});    // 60.96
  assert.deepEqual(feetInchesToMm('0.01','0'),{ok:true,mm:3});    // 3.048
  assert.deepEqual(feetInchesToMm('',''),{ok:false,reason:'empty'});
  assert.deepEqual(feetInchesToMm('x','1'),{ok:false,reason:'format',part:'feet'});
  assert.deepEqual(feetInchesToMm('1','1.234'),{ok:false,reason:'decimals',part:'inches'});
});

test('every millimetre survives a round trip through the text shown in the fields',()=>{
  for(let mm=0;mm<=20000;mm++){
    assert.equal(metresToMm(mmToMetresText(mm)).mm,mm,'metres '+mm);
    const {feet,inches}=mmToFeetInchesText(mm);
    assert.match(inches,/^(0|[1-9]\d?)(\.\d{1,2})?$/,'inches text '+inches);
    assert.ok(Number(inches)<12,'inches below 12 for '+mm);
    assert.equal(feetInchesToMm(feet,inches).mm,mm,'feet and inches '+mm);
  }
});

test('the text shown in the fields is as short as it can be',()=>{
  assert.equal(mmToMetresText(4500),'4.5');
  assert.equal(mmToMetresText(4000),'4');
  assert.equal(mmToMetresText(4005),'4.005');
  assert.equal(mmToMetresText(0),'0');
  assert.deepEqual(mmToFeetInchesText(3048),{feet:'10',inches:'0'});
  assert.deepEqual(mmToFeetInchesText(4496),{feet:'14',inches:'9'});      // what 14 ft 9 in became
  assert.deepEqual(mmToFeetInchesText(4500),{feet:'14',inches:'9.17'});   // 177.165 in needs two decimals
  assert.deepEqual(mmToFeetInchesText(2000),{feet:'6',inches:'6.74'});
});

test('areas convert to tenths of a square foot exactly',()=>{
  assert.equal(mm2ToSquareFeetTenths(40_000_000),4306);  // 40 m2 = 430.556 ft2
  assert.equal(mm2ToSquareFeetTenths(10_000_000),1076);  // 107.639 ft2
  assert.equal(mm2ToSquareFeetTenths(92_903),10);        // one square foot
  assert.equal(mm2ToSquareFeetTenths(0),0);
});
