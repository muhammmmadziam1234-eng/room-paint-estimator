import test from 'node:test';
import assert from 'node:assert/strict';
import {estimate,finishes} from '../estimate.mjs';
const room={length:4.5,width:3.5,height:2.5,finish:'matte'};
test('calculates wall area and the baseline line items in cents',()=>{
  const result=estimate(room);
  assert.equal(result.walls,40);
  assert.equal(result.ceiling,0);
  assert.deepEqual(result.lines.map(x=>x.cents),[17000,4500]);
  assert.equal(result.total,21500);
});
test('finish, ceiling and repairs affect the correct line items',()=>{
  const result=estimate({...room,finish:'satin',ceiling:true,repair:true});
  assert.equal(result.ceiling,15.75);
  assert.deepEqual(result.lines.map(x=>x.cents),[23600,5513,6500,4500]);
  assert.equal(result.total,40113);
});
test('invalid measurements and unknown finishes are rejected',()=>{
  for(const invalid of [{length:0},{width:NaN},{height:5.1},{finish:'gloss'},{finish:'__proto__'}])
    assert.throws(()=>estimate({...room,...invalid}),RangeError);
});
test('half cents round up exactly, not by floating-point accident',()=>{
  // 2.0 x 2.1 x 2.1 m of matte wall is 17.22 m2 at 4.25 a m2: exactly 73.185, so $73.19.
  const small=estimate({length:2,width:2.1,height:2.1,finish:'matte'});
  assert.equal(small.walls,17.22);
  assert.equal(small.lines[0].cents,7319);
  // Reference sums in whole tenths of a metre, sharing no arithmetic with the estimator.
  for(let l=20;l<=150;l+=3)for(let w=20;w<=150;w+=3)for(const h of [20,25,33,50])
    for(const [finish,{centsPerM2}] of Object.entries(finishes)){
      const {lines}=estimate({length:l/10,width:w/10,height:h/10,finish,ceiling:true});
      assert.equal(lines[0].cents,Math.floor((2*(l+w)*h*centsPerM2+50)/100),'walls '+l/10+' x '+w/10+' x '+h/10+' '+finish);
      assert.equal(lines[1].cents,Math.floor((l*w*350+50)/100),'ceiling '+l/10+' x '+w/10);
    }
});
