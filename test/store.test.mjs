import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,SAVED_KEY,DRAFT_KEY,MAX_SAVED} from '../store.mjs';
import {defaultState,encodeState} from '../state.mjs';

class FakeStorage{
  constructor(){this.map=new Map();this.fail=null;}
  getItem(key){if(this.fail==='read')throw new Error('blocked');return this.map.has(key)?this.map.get(key):null;}
  setItem(key,value){if(this.fail==='write')throw new DOMException('full','QuotaExceededError');this.map.set(key,String(value));}
}
const code=(over={})=>encodeState({...defaultState(),...over});
const at=minutes=>new Date(Date.UTC(2026,10,15,9,minutes,0));

test('quotes are saved, listed with their decoded state, and removed',()=>{
  const storage=new FakeStorage(), store=createStore(storage);
  assert.deepEqual(store.list(),{items:[],skipped:0,available:true});
  assert.deepEqual(store.save('Flat 4B',code({name:'Flat 4B'}),at(0)),{ok:true,replaced:false,name:'Flat 4B'});
  assert.deepEqual(store.save('  Office   2 ',code(),at(5)),{ok:true,replaced:false,name:'Office 2'});
  const {items,skipped}=store.list();
  assert.equal(skipped,0);
  assert.deepEqual(items.map(i=>[i.name,i.savedAt]),[['Flat 4B','2026-11-15T09:00:00.000Z'],['Office 2','2026-11-15T09:05:00.000Z']]);
  assert.deepEqual(items[0].state,{...defaultState(),name:'Flat 4B'});
  assert.deepEqual(store.remove(items[0].id),{ok:true});
  assert.deepEqual(store.list().items.map(i=>i.name),['Office 2']);
  assert.deepEqual(store.remove(items[0].id),{ok:false,reason:'missing'});
  assert.deepEqual(store.remove('../../x'),{ok:false,reason:'missing'});
});

test('saving under an existing name replaces that entry and keeps its id',()=>{
  const store=createStore(new FakeStorage());
  store.save('Flat',code({taxBp:100}),at(0));
  const id=store.list().items[0].id;
  assert.deepEqual(store.save('FLAT',code({taxBp:200}),at(9)),{ok:true,replaced:true,name:'FLAT'});
  const {items}=store.list();
  assert.equal(items.length,1);
  assert.equal(items[0].id,id);
  assert.equal(items[0].state.taxBp,200);
  assert.equal(items[0].savedAt,'2026-11-15T09:09:00.000Z');
  assert.equal(store.save('',code(),at(10)).name,'Untitled quote');
  // Two saves in the same millisecond still get different ids.
  store.save('A',code(),at(11));store.save('B',code(),at(11));
  const ids=store.list().items.map(i=>i.id);
  assert.equal(new Set(ids).size,ids.length);
});

test('twenty quotes is the limit, and a refused save changes nothing',()=>{
  const storage=new FakeStorage(), store=createStore(storage);
  for(let n=0;n<MAX_SAVED;n++)assert.equal(store.save('Quote '+n,code(),at(n)).ok,true);
  const before=storage.getItem(SAVED_KEY);
  assert.deepEqual(store.save('One more',code(),at(30)),{ok:false,reason:'full'});
  assert.equal(storage.getItem(SAVED_KEY),before);
  assert.equal(store.save('Quote 3',code({taxBp:5}),at(31)).ok,true,'replacing is still allowed when full');
});

test('storage that is blocked or full is reported, not thrown',()=>{
  const storage=new FakeStorage(), store=createStore(storage);
  storage.fail='write';
  assert.deepEqual(store.save('x',code()),{ok:false,reason:'storage'});
  assert.equal(store.saveDraft(code()),false);
  storage.fail='read';
  assert.deepEqual(store.list(),{items:[],skipped:0,available:false});
  assert.deepEqual(store.save('x',code()),{ok:false,reason:'unavailable'});
  assert.equal(store.loadDraft(),null);
  assert.deepEqual(store.save('x','not a quote'),{ok:false,reason:'invalid'});
});

test('stored data is untrusted: damaged entries are skipped and counted',()=>{
  const storage=new FakeStorage(), store=createStore(storage);
  const good={id:'abc1',name:'Good',savedAt:'2026-11-15T09:00:00.000Z',code:code()};
  const put=value=>storage.setItem(SAVED_KEY,typeof value==='string'?value:JSON.stringify(value));
  put({v:1,items:[good,{...good,id:'abc2',code:'q1~garbage'},{...good,id:'ABC'},{...good,id:'abc1'},{...good,id:'abc3',name:' padded '},
    {...good,id:'abc4',savedAt:'yesterday'},{...good,id:'abc5',name:''},{...good,id:'abc6',code:42},null,'text',[],{...good,id:'a'.repeat(21)},
    {...good,id:'abc7',savedAt:'2026-13-45T99:99:99.000Z'}]});
  const result=store.list();
  assert.deepEqual(result.items.map(i=>i.id),['abc1']);
  assert.equal(result.skipped,12);
  put({v:1,items:Array.from({length:MAX_SAVED+5},(_,n)=>({...good,id:'id'+n,name:'Q'+n}))});
  assert.deepEqual([store.list().items.length,store.list().skipped],[MAX_SAVED,5]);
  for(const bad of ['{not json','null','[]','"text"','{"v":2,"items":[]}','{"v":1,"items":"x"}','{"v":1}','x'.repeat(200_000)]){
    put(bad);
    assert.deepEqual(store.list(),{items:[],skipped:1,available:true},bad.slice(0,20));
  }
  storage.map.set(SAVED_KEY,12345);
  assert.deepEqual(store.list().items,[]);
});

test('the working draft is a single code, and anything else is ignored',()=>{
  const storage=new FakeStorage(), store=createStore(storage);
  assert.equal(store.loadDraft(),null);
  assert.equal(store.saveDraft(code({name:'x'})),true);
  assert.equal(store.loadDraft(),code({name:'x'}));
  storage.setItem(DRAFT_KEY,'x'.repeat(10000));
  assert.equal(store.loadDraft(),null);
});
