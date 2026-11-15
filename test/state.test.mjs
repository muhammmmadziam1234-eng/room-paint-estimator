import test from 'node:test';
import assert from 'node:assert/strict';
import {STATE_VERSION,MAX_ENCODED_LENGTH,MAX_NAME,defaultState,defaultRoom,normalizeName,validateState,encodeState,decodeState,restoreState,
  quoteNumber,fnv1a,hashFor,codeFromHash} from '../state.mjs';
import {MARKETS,FINISH_LABELS} from '../quote.mjs';

const sample=()=>({name:'Flat 4B',unit:'ft',market:'de',taxBp:825,rooms:[
  {name:'Living room',lengthMm:4500,widthMm:3500,heightMm:2500,finish:'matte',ceiling:true,repair:false,doors:1,windows:2},
  {name:'Küche/Bad. ~100%',lengthMm:3000,widthMm:2000,heightMm:2400,finish:'satin',ceiling:false,repair:true,doors:0,windows:1}]});
const SAMPLE_CODE='q1~f.de.825.Flat%204B~Living%20room.4500.3500.2500.m.1.1.2~K%C3%BCche%2FBad%2E%20%7E100%25.3000.2000.2400.s.2.0.1';

function mulberry32(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const NAMES=['','Living room','Kitchen & hall','a.b~c%d','Zoë 🏠 日本語','  padded  ','x'.repeat(60),'tab\tand\nnewline','semi;colon,comma=eq#hash?q','\ud800 lone','<script>alert(1)</script>',"quote'\"back\\slash"];
function randomState(rnd){
  const int=(a,b)=>a+Math.floor(rnd()*(b-a+1)), pick=list=>list[int(0,list.length-1)];
  return {name:normalizeName(pick(NAMES)),unit:pick(['m','ft']),market:pick(Object.keys(MARKETS)),taxBp:rnd()<.4?0:int(0,2500),
    rooms:Array.from({length:int(1,10)},()=>({name:normalizeName(pick(NAMES)),lengthMm:int(2000,15000),widthMm:int(2000,15000),heightMm:int(2000,5000),
      finish:pick(Object.keys(FINISH_LABELS)),ceiling:rnd()<.5,repair:rnd()<.5,doors:int(0,10),windows:int(0,10)}))};
}

test('the wire format is the documented one, byte for byte',()=>{
  assert.equal(encodeState(sample()),SAMPLE_CODE);
  assert.deepEqual(decodeState(SAMPLE_CODE),{ok:true,state:sample()});
  assert.equal(STATE_VERSION,1);
  assert.equal(encodeState(defaultState()),'q1~m.us.0.~Room%201.4500.3500.2500.m.0.0.0');
});

test('state survives 2000 seeded round trips, odd names included',()=>{
  const rnd=mulberry32(77);
  for(let n=0;n<2000;n++){
    const state=randomState(rnd), code=encodeState(state);
    assert.ok(code.length<=MAX_ENCODED_LENGTH,'length '+code.length);
    assert.match(code,/^q1~[A-Za-z0-9._~%-]+$/);
    assert.deepEqual(decodeState(code),{ok:true,state},code);
  }
});

test('names are cleaned the same way every time',()=>{
  assert.equal(normalizeName('  Living   room \n'),'Living room');
  assert.equal(normalizeName('a\u0000b\u007fc'),'a b c');
  assert.equal(normalizeName('x\ud800y'),'xy');
  assert.equal(normalizeName(null),'');
  assert.equal(normalizeName(42),'');
  assert.equal(normalizeName('é'.repeat(50)).length,MAX_NAME);
  assert.equal(normalizeName('🏠'.repeat(30)).length,MAX_NAME,'cuts between pairs, never inside one');
  assert.equal(normalizeName('a'.repeat(39)+'🏠'),'a'.repeat(39),'a pair that does not fit is dropped whole');
  const rnd=mulberry32(5);
  for(let n=0;n<500;n++){
    const text=Array.from({length:rnd()*80|0},()=>String.fromCharCode(rnd()<.2?0xd800+(rnd()*0x800|0):rnd()*0x300|0)).join('');
    const once=normalizeName(text);
    assert.equal(normalizeName(once),once,'idempotent');
    assert.ok(once.length<=MAX_NAME);
    assert.doesNotThrow(()=>encodeURIComponent(once),'always encodable');
  }
});

test('the quote number is a stable function of the quote, not of the units shown',()=>{
  // FNV-1a, 32 bit: published test vectors.
  assert.equal(fnv1a(''),0x811c9dc5);
  assert.equal(fnv1a('a'),0xe40c292c);
  assert.equal(fnv1a('foobar'),0xbf9cf968);
  // Independent BigInt version of the same hash for the default quote.
  let h=0x811c9dc5n;
  for(const ch of 'q1~m.us.0.~Room%201.4500.3500.2500.m.0.0.0')h=((h^BigInt(ch.charCodeAt(0)))*0x01000193n)&0xffffffffn;
  const hex=h.toString(16).toUpperCase().padStart(8,'0');
  assert.equal(quoteNumber(defaultState()),'SC-'+hex.slice(0,4)+'-'+hex.slice(4));
  assert.match(quoteNumber(sample()),/^SC-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(quoteNumber(sample()),quoteNumber(sample()));
  assert.equal(quoteNumber({...sample(),unit:'m'}),quoteNumber({...sample(),unit:'ft'}));
  const changed=sample();changed.rooms[1].windows=2;
  assert.notEqual(quoteNumber(changed),quoteNumber(sample()));
  const renamed={...sample(),name:'Flat 4C'};
  assert.notEqual(quoteNumber(renamed),quoteNumber(sample()));
});

test('a link or stored value that is not a valid quote is refused with a reason',()=>{
  const bad=(code,error)=>{
    const result=decodeState(code);
    assert.equal(result.ok,false,String(code));
    assert.equal(result.error,error,String(code));
    assert.ok(typeof result.message==='string'&&result.message.length>10);
  };
  for(const value of [null,undefined,42,{},[],true,()=>1,Symbol('x'),10n])bad(value,'type');
  bad('','format');bad('hello','format');bad('q1','format');bad('q1~','format');bad('q1~m.us.0.','format');
  bad('q2~m.us.0.~Room.4500.3500.2500.m.0.0.0','version');bad('q0~m.us.0.~Room.4500.3500.2500.m.0.0.0','version');
  bad('x1~m.us.0.~Room.4500.3500.2500.m.0.0.0','format');
  const room='Room.4500.3500.2500.m.0.0.0';
  bad(`q1~m.us.0.~${room}.extra`,'format');bad('q1~m.us.0.~Room.4500.3500.2500.m.0.0','format');bad('q1~m.us.0~'+room,'format');
  bad(`q1~m.us.0.~${room}~`,'format');bad(`q1~m.us.0.~~${room}`,'format');
  bad(`q1~m.us.0.~${room}x`,'format');
  // wrong values
  bad('q1~x.us.0.~'+room,'invalid');bad('q1~m.xx.0.~'+room,'invalid');bad('q1~m.us.2501.~'+room,'invalid');bad('q1~m.us.-1.~'+room,'format');
  bad('q1~m.us.00.~'+room,'format');bad('q1~m.us.1.5.~'+room,'format');bad('q1~m.us.0.~Room.04500.3500.2500.m.0.0.0','format');
  bad('q1~m.us.0.~Room.1999.3500.2500.m.0.0.0','invalid');bad('q1~m.us.0.~Room.4500.15001.2500.m.0.0.0','invalid');
  bad('q1~m.us.0.~Room.4500.3500.5001.m.0.0.0','invalid');bad('q1~m.us.0.~Room.4500.3500.2500.x.0.0.0','invalid');
  bad('q1~m.us.0.~Room.4500.3500.2500.m.4.0.0','invalid');bad('q1~m.us.0.~Room.4500.3500.2500.m.0.11.0','invalid');
  bad('q1~m.us.0.~Room.4500.3500.2500.m.0.0.11','invalid');bad('q1~m.us.0.~Room.4500.3500.2500.M.0.0.0','invalid');
  bad('q1~m.us.0.~Room.1e3.3500.2500.m.0.0.0','format');bad('q1~m.us.0.~Room.0x10.3500.2500.m.0.0.0','format');
  bad('q1~m.us.0.~Room.99999999999999999999.3500.2500.m.0.0.0','format');
  // text that is not canonical, not UTF-8, too long or contains control characters
  bad('q1~m.us.0.~%52oom.4500.3500.2500.m.0.0.0','format');          // %52 is just "R"
  bad('q1~m.us.0.~K%c3%bcche.4500.3500.2500.m.0.0.0','format');      // lower-case hex
  bad('q1~m.us.0.~%FF.4500.3500.2500.m.0.0.0','format');             // not UTF-8
  bad('q1~m.us.0.~%.4500.3500.2500.m.0.0.0','format');
  bad('q1~m.us.0.~a%0Ab.4500.3500.2500.m.0.0.0','invalid');          // newline in a name
  bad('q1~m.us.0.~'+'a'.repeat(41)+'.4500.3500.2500.m.0.0.0','invalid');
  bad('q1~m.us.0.'+'a'.repeat(41)+'~'+room,'invalid');
  bad('q1~m.us.0.~%20lead.4500.3500.2500.m.0.0.0','invalid');        // names are stored trimmed
  // characters that can never appear
  for(const ch of [' ','#','?','&','=','<','>','"',"'",'\\','/','é','\u2028','\u0000','🏠','+'])bad('q1~m.us.0.~Ro'+ch+'om.4500.3500.2500.m.0.0.0','format');
  bad('q1~m.u s.0.~'+room,'format');bad('q1~m.us.0 .~'+room,'format');bad('q1~m.us.0.~'+room.replace('.m.','. .'),'format'); // outside the name field too
  // room count
  bad('q1~m.us.0.',  'format');
  bad('q1~m.us.0.'+('~'+room).repeat(11),'invalid');
  assert.equal(decodeState('q1~m.us.0.'+('~'+room).repeat(10)).ok,true);
});

test('the length limit is checked before anything is parsed',()=>{
  const limit=decodeState('q1~'+'a'.repeat(MAX_ENCODED_LENGTH));
  assert.equal(limit.ok,false);assert.equal(limit.error,'too-long');
  const started=process.hrtime.bigint();
  const huge=decodeState('q1~'+'%41'.repeat(5_000_000));
  assert.equal(huge.error,'too-long');
  assert.ok(Number(process.hrtime.bigint()-started)/1e6<250,'a 15 MB string is dismissed quickly');
  assert.ok(encodeState(randomState(mulberry32(1))).length<MAX_ENCODED_LENGTH);
});

test('worst-case names still fit in the limit',()=>{
  // A 3-byte character such as 日 grows to 9 characters when percent-encoded: the worst case per UTF-16 unit.
  const worst={...defaultState(),name:'日'.repeat(40),rooms:Array.from({length:10},()=>({...defaultRoom(),name:'日'.repeat(40)}))};
  assert.deepEqual(decodeState(encodeState(worst)),{ok:true,state:worst});
  assert.ok(encodeState(worst).length<=MAX_ENCODED_LENGTH,String(encodeState(worst).length));
});

test('an invalid state cannot be encoded',()=>{
  for(const state of [null,{},{...defaultState(),unit:'yd'},{...defaultState(),name:'x'.repeat(41)},{...defaultState(),rooms:[]},
    {...defaultState(),rooms:[{...defaultRoom(),name:'a\nb'}]},{...defaultState(),taxBp:3000}])
    assert.throws(()=>encodeState(state),RangeError);
  assert.deepEqual(validateState(defaultState()),[]);
  assert.deepEqual(validateState({...defaultState(),unit:'yd'}).map(i=>i.field),['unit']);
  assert.deepEqual(validateState({...defaultState(),name:'  x'}).map(i=>i.field),['name']);
  assert.deepEqual(validateState({...defaultState(),rooms:[{...defaultRoom(),name:'a\nb'}]}).map(i=>[i.room,i.field]),[[0,'name']]);
  assert.ok(validateState(undefined).length>0);
});

test('restoreState always gives a usable quote and says so when it fell back',()=>{
  const fresh=restoreState('');
  assert.deepEqual(fresh.state,defaultState());assert.equal(fresh.message,null);assert.equal(fresh.restored,false);
  assert.equal(restoreState(null).message,null);assert.equal(restoreState(undefined).restored,false);
  const good=restoreState(SAMPLE_CODE);
  assert.deepEqual(good.state,sample());assert.equal(good.restored,true);assert.equal(good.message,null);
  for(const input of ['garbage','q1~m.us.99999.~x',{a:1},'q2~m.us.0.~Room.4500.3500.2500.m.0.0.0','q1~m.us.0.~Room.1.3500.2500.m.0.0.0']){
    const result=restoreState(input);
    assert.deepEqual(result.state,defaultState());
    assert.equal(result.restored,false);
    assert.match(result.message,/new quote is shown instead/);
  }
});

test('defaults are fresh, valid objects each time',()=>{
  const a=defaultState();a.rooms[0].lengthMm=1;a.rooms.push(defaultRoom());
  assert.equal(defaultState().rooms.length,1);
  assert.equal(defaultState().rooms[0].lengthMm,4500);
  assert.deepEqual(validateState(defaultState()),[]);
  assert.deepEqual(defaultRoom(2).name,'Room 3');
});

test('the address hash carries the code and nothing else is trusted',()=>{
  assert.equal(hashFor(SAMPLE_CODE),'#q='+SAMPLE_CODE);
  assert.equal(codeFromHash('#q='+SAMPLE_CODE),SAMPLE_CODE);
  for(const hash of ['','#','#estimate','#Q=abc','#x=q1~',null,undefined,42])assert.equal(codeFromHash(hash),null,String(hash));
  assert.equal(codeFromHash('#q='),'');
});

test('random garbage never throws and never yields an invalid or non-canonical quote',()=>{
  const rnd=mulberry32(424242);
  const int=(a,b)=>a+Math.floor(rnd()*(b-a+1)), pick=list=>list[int(0,list.length-1)];
  const alphabet='q1~.%0123456789ABCDEFabcdefmfusgbdrenpt-_ /#?&=<>"\'\\\u00e9\u2028\ud83c\udfe0\u0000{}[]';
  const seeds=Array.from({length:40},()=>encodeState(randomState(rnd)));
  const mutate=text=>{
    let s=text;
    for(let k=int(1,4);k>0;k--){
      const i=int(0,s.length), op=int(0,4);
      s=op===0?s.slice(0,i)+s.slice(i+1):op===1?s.slice(0,i)+pick([...alphabet])+s.slice(i):op===2?s.slice(0,i)+pick([...alphabet])+s.slice(i+1)
        :op===3?s.slice(0,i):s.slice(0,i)+s.slice(int(0,s.length));
    }
    return s;
  };
  const structured=()=>'q1~'+[pick(['m','f','x','']),pick(['us','gb','de','fr','zz']),pick(['0','825','2500','2501','x']),pick(['','Name','%41'])].join('.')
    +Array.from({length:int(0,12)},()=>'~'+[pick(['R','','%20','Room%201']),...[int(1900,15100),int(1900,15100),int(1900,5100)].map(String),
      pick(['m','e','s','x']),String(int(0,4)),String(int(0,12)),String(int(0,12))].join('.')).join('');
  const odd=[null,undefined,0,1.5,NaN,'',' ',[],{},{toString(){throw new Error('boom');}},[['q1']],true,Symbol.iterator,10n,'\ud800','q1~'+'\ud800'];
  const accepted=[0,0,0,0,0,0];let total=0;
  const check=(input,kind)=>{
    total++;
    let result;
    assert.doesNotThrow(()=>{result=decodeState(input);},String(typeof input==='string'?input.slice(0,80):typeof input));
    assert.equal(typeof result.ok,'boolean');
    if(result.ok){
      accepted[kind]++;
      assert.deepEqual(validateState(result.state),[],'valid');
      assert.equal(encodeState(result.state),input,'canonical');
    }else{
      assert.ok(['type','too-long','format','version','invalid'].includes(result.error));
      assert.ok(result.message.length>10);
    }
    const restored=restoreState(input);
    assert.deepEqual(validateState(restored.state),[],'restoreState is always usable');
  };
  for(let n=0;n<30000;n++){
    const kind=n%6;
    check(kind===0?Array.from({length:int(0,120)},()=>pick([...alphabet])).join(''):kind===1?mutate(pick(seeds)):kind===2?structured()
      :kind===3?pick(seeds).slice(0,int(0,200)):kind===4?pick(odd):encodeState(randomState(rnd)),kind);
  }
  // Pure noise and odd types are never accepted; mutated, truncated and structured inputs sometimes are, and then they are valid and canonical.
  assert.deepEqual([accepted[0],accepted[4]],[0,0]);
  assert.ok(accepted[1]>100&&accepted[2]>20&&accepted[3]>100,'the fuzzer reached the accept path: '+accepted.join('/'));
  assert.equal(accepted[5],5000);
});
