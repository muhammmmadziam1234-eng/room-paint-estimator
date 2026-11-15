import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// WCAG 2 contrast ratios for the colour pairs the stylesheet actually uses, computed from the palette in style.css.
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const palette=Object.fromEntries([...css.matchAll(/--([a-z-]+):(#[0-9a-f]{6})/gi)].map(match=>[match[1],match[2].toLowerCase()]));
const linear=value=>value<=0.03928?value/12.92:((value+0.055)/1.055)**2.4;
const luminance=hex=>{const [r,g,b]=[1,3,5].map(i=>linear(parseInt(hex.slice(i,i+2),16)/255));return 0.2126*r+0.7152*g+0.0722*b;};
const ratio=(a,b)=>{const [light,dark]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (light+0.05)/(dark+0.05);};
const colour=name=>name.startsWith('#')?name:palette[name];
// Colours written directly in a rule rather than as a variable must really be in the stylesheet.
const LITERALS=['#fbf7e6','#fffdf4','#f4eed6','#efe3b8','#3d3826','#6b6551','#53482e','#ac9d77'];

test('the stylesheet declares the palette this test relies on',()=>{
  for(const name of ['paper','card','receipt','yellow','ink','muted','line','field','focus','danger','btn','pick','pick-line'])assert.ok(palette[name],name);
  for(const literal of LITERALS)assert.ok(css.includes(literal),literal+' is used in style.css');
});

test('text meets 4.5:1 on every background it is drawn on',()=>{
  const text=[
    ['ink',['paper','card','receipt','yellow','pick','#fbf7e6','#fffdf4','#f4eed6','#efe3b8']],
    ['muted',['paper','card','receipt','#fbf7e6']],
    ['danger',['paper','card','receipt','#fbf7e6']],
    ['#53482e',['pick','#fffdf4']],
    ['#6b6551',['#fffdf4']],
    ['#ffffff',['btn','#3d3826']],
    ['btn',['paper','card','receipt','#fbf7e6','#efe3b8']]
  ];
  for(const [foreground,backgrounds] of text)for(const background of backgrounds)
    assert.ok(ratio(colour(foreground),colour(background))>=4.5,`${foreground} on ${background}: ${ratio(colour(foreground),colour(background)).toFixed(2)}`);
});

test('focus rings, field borders and the selected-choice border meet 3:1 against what they sit on',()=>{
  for(const [foreground,backgrounds] of [['focus',['paper','card','yellow','#fbf7e6','receipt']],['field',['card','#fbf7e6','receipt','#fffdf4']],
    ['danger',['card','#fbf7e6']],['pick-line',['pick']]])
    for(const background of backgrounds)
      assert.ok(ratio(colour(foreground),colour(background))>=3,`${foreground} on ${background}: ${ratio(colour(foreground),colour(background)).toFixed(2)}`);
});

test('the ratio function agrees with known values',()=>{
  assert.equal(ratio('#000000','#ffffff').toFixed(2),'21.00');
  assert.equal(ratio('#777777','#ffffff').toFixed(2),'4.48');
});
