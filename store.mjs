// Saved quotes and the working draft, kept in localStorage (or any object with the same methods).
// Everything read back is untrusted: it is parsed, size-limited and run through the state codec,
// and entries that fail are skipped and counted rather than trusted.
import {decodeState,normalizeName,MAX_ENCODED_LENGTH} from './state.mjs';

export const SAVED_KEY='second-coat.saved.v1';
export const DRAFT_KEY='second-coat.draft.v1';
export const MAX_SAVED=20;
const MAX_STORED_CHARS=MAX_SAVED*(MAX_ENCODED_LENGTH+200)+200;
const ID=/^[0-9a-z]{1,20}$/;
const SAVED_AT=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function checkEntry(entry,seen){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
  const {id,name,savedAt,code}=entry;
  if(typeof id!=='string'||!ID.test(id)||seen.has(id))return null;
  if(typeof name!=='string'||!name||name!==normalizeName(name))return null;
  if(typeof savedAt!=='string'||!SAVED_AT.test(savedAt)||Number.isNaN(Date.parse(savedAt)))return null;
  const decoded=decodeState(code);
  return decoded.ok?{id,name,savedAt,code,state:decoded.state}:null;
}

export function createStore(storage){
  function list(){
    let raw;
    try{raw=storage.getItem(SAVED_KEY);}catch{return {items:[],skipped:0,available:false};}
    if(raw===null||raw===undefined)return {items:[],skipped:0,available:true};
    if(typeof raw!=='string'||raw.length>MAX_STORED_CHARS)return {items:[],skipped:1,available:true};
    let data;
    try{data=JSON.parse(raw);}catch{return {items:[],skipped:1,available:true};}
    if(!data||typeof data!=='object'||data.v!==1||!Array.isArray(data.items))return {items:[],skipped:1,available:true};
    const items=[], seen=new Set();
    let skipped=Math.max(0,data.items.length-MAX_SAVED);
    for(const entry of data.items.slice(0,MAX_SAVED)){
      const item=checkEntry(entry,seen);
      if(item){items.push(item);seen.add(item.id);}else skipped++;
    }
    return {items,skipped,available:true};
  }
  function write(items){
    try{
      storage.setItem(SAVED_KEY,JSON.stringify({v:1,items:items.map(({id,name,savedAt,code})=>({id,name,savedAt,code}))}));
      return true;
    }catch{return false;}
  }
  /** Saving under a name that already exists replaces that entry. Returns {ok:true,replaced} or {ok:false,reason}. */
  function save(name,code,now=new Date()){
    if(!decodeState(code).ok)return {ok:false,reason:'invalid'};
    const current=list();
    if(!current.available)return {ok:false,reason:'unavailable'};
    const clean=normalizeName(name)||'Untitled quote', savedAt=now.toISOString();
    const existing=current.items.find(item=>item.name.toLowerCase()===clean.toLowerCase());
    let items;
    if(existing)items=current.items.map(item=>item===existing?{...existing,code,savedAt}:item);
    else{
      if(current.items.length>=MAX_SAVED)return {ok:false,reason:'full'};
      let id=now.getTime().toString(36);
      for(let n=1;current.items.some(item=>item.id===id);n++)id=now.getTime().toString(36)+n.toString(36);
      items=[...current.items,{id,name:clean,savedAt,code}];
    }
    return write(items)?{ok:true,replaced:Boolean(existing),name:clean}:{ok:false,reason:'storage'};
  }
  function remove(id){
    const current=list();
    const items=current.items.filter(item=>item.id!==id);
    if(items.length===current.items.length)return {ok:false,reason:'missing'};
    return write(items)?{ok:true}:{ok:false,reason:'storage'};
  }
  function loadDraft(){
    try{
      const raw=storage.getItem(DRAFT_KEY);
      return typeof raw==='string'&&raw.length<=MAX_ENCODED_LENGTH?raw:null;
    }catch{return null;}
  }
  function saveDraft(code){
    try{storage.setItem(DRAFT_KEY,code);return true;}catch{return false;}
  }
  return {list,save,remove,loadDraft,saveDraft};
}
