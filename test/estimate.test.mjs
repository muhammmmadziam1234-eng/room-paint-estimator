import test from 'node:test';
import assert from 'node:assert/strict';
import {estimate} from '../estimate.mjs';
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
