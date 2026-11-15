// Quote state <-> a compact, versioned string for the address hash and localStorage.
//
//   q1~<unit>.<market>.<tax>.<name>~<room>~<room>...
//   room = <name>.<length>.<width>.<height>.<finish>.<flags>.<doors>.<windows>
//
// unit m|f, tax in basis points (825 = 8.25 %), lengths in whole millimetres, finish m|e|s,
// flags 1 = ceiling + 2 = repairs. Names are percent-encoded (also . ~ ! ' ( ) *) so the
// separators never occur inside a field. The decoder is strict: it accepts only the exact
// string the encoder would produce, so encode(decode(x)) === x for everything it accepts.
import {LIMITS,validateQuote} from './quote.mjs';

export const STATE_VERSION=1;
export const MAX_NAME=40;
/** Ten rooms with 40 three-byte characters in every name encode to about 4200 characters. */
export const MAX_ENCODED_LENGTH=4500;

const CONTROL=/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const SURROGATES=/([\ud800-\udbff][\udc00-\udfff])|[\ud800-\udfff]/g;
const CODE_CHARACTERS=/^[A-Za-z0-9._~%-]*$/;
const NUMBER=/^(0|[1-9]\d{0,4})$/;
const UNIT_FROM_CODE=new Map([['m','m'],['f','ft']]);
const FINISH_FROM_CODE=new Map([['m','matte'],['e','eggshell'],['s','satin']]);
const FINISH_CODE={matte:'m',eggshell:'e',satin:'s'};

/** Names are single-line text of at most 40 UTF-16 units with no control characters or lone surrogates. */
export function normalizeName(text){
  if(typeof text!=='string')return '';
  let name=text.replace(SURROGATES,(match,pair)=>pair||'').replace(CONTROL,' ').replace(/\s+/g,' ').trim();
  if(name.length>MAX_NAME){
    name=name.slice(0,MAX_NAME);
    if(/[\ud800-\udbff]$/.test(name))name=name.slice(0,-1);
    name=name.trimEnd();
  }
  return name;
}

export const defaultRoom=(index=0)=>({name:'Room '+(index+1),lengthMm:4500,widthMm:3500,heightMm:2500,finish:'matte',ceiling:false,repair:false,doors:0,windows:0});
export const defaultState=()=>({name:'',unit:'m',market:'us',taxBp:0,rooms:[defaultRoom(0)]});

const isName=value=>typeof value==='string'&&value===normalizeName(value);

/** Every problem in a state (quote problems plus unit and names) as {room, field, message}. Never throws. */
export function validateState(state){
  const issues=validateQuote(state);
  if(!state||typeof state!=='object'||Array.isArray(state))return issues;
  if(state.unit!=='m'&&state.unit!=='ft')issues.push({room:null,field:'unit',message:'Choose metric or imperial units.'});
  if(!isName(state.name))issues.push({room:null,field:'name',message:`Use up to ${MAX_NAME} characters on one line for the quote name.`});
  if(Array.isArray(state.rooms)&&state.rooms.length<=LIMITS.rooms[1])
    state.rooms.forEach((room,index)=>{
      if(room&&typeof room==='object'&&!isName(room.name))issues.push({room:index,field:'name',message:`Use up to ${MAX_NAME} characters on one line for the room name.`});
    });
  return issues;
}

const escapeName=name=>encodeURIComponent(name).replace(/[!'()*~.]/g,character=>'%'+character.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'));

export function encodeState(state){
  if(validateState(state).length)throw new RangeError('This quote has values that cannot be saved.');
  const header=[state.unit==='ft'?'f':'m',state.market,state.taxBp,escapeName(state.name)].join('.');
  const rooms=state.rooms.map(room=>[escapeName(room.name),room.lengthMm,room.widthMm,room.heightMm,FINISH_CODE[room.finish],
    (room.ceiling?1:0)+(room.repair?2:0),room.doors,room.windows].join('.'));
  return ['q'+STATE_VERSION,header,...rooms].join('~');
}

const MESSAGES={
  type:'The saved quote is not text.',
  'too-long':'That quote is too long to have been made by this page.',
  format:'That quote is not in a format this page understands.',
  version:'That quote was made by a different version of this page.'
};
const fail=(error,message=MESSAGES[error])=>({ok:false,error,message});
const number=text=>NUMBER.test(text)?Number(text):null;

function decodeName(field){
  let name;
  try{name=decodeURIComponent(field);}catch{return null;}
  return escapeName(name)===field?name:null;
}

/**
 * Decode and strictly validate untrusted text. Never throws.
 * Returns {ok:true,state} or {ok:false,error:'type'|'too-long'|'format'|'version'|'invalid',message}.
 */
export function decodeState(code){
  if(typeof code!=='string')return fail('type');
  if(code.length>MAX_ENCODED_LENGTH)return fail('too-long');
  if(!CODE_CHARACTERS.test(code))return fail('format');
  const parts=code.split('~');
  const version=/^q(\d{1,3})$/.exec(parts[0]);
  if(!version)return fail('format');
  if(Number(version[1])!==STATE_VERSION)return fail('version');
  if(parts.length<3)return fail('format');
  const header=parts[1].split('.');
  if(header.length!==4)return fail('format');
  const taxBp=number(header[2]), quoteName=decodeName(header[3]);
  if(taxBp===null||quoteName===null)return fail('format');
  const rooms=[];
  for(const part of parts.slice(2)){
    const field=part.split('.');
    if(field.length!==8)return fail('format');
    const name=decodeName(field[0]);
    const [lengthMm,widthMm,heightMm,flags,doors,windows]=[field[1],field[2],field[3],field[5],field[6],field[7]].map(number);
    if(name===null||[lengthMm,widthMm,heightMm,flags,doors,windows].includes(null))return fail('format');
    rooms.push({name,lengthMm,widthMm,heightMm,finish:FINISH_FROM_CODE.get(field[4]),
      ceiling:flags<=3?Boolean(flags&1):undefined,repair:flags<=3?Boolean(flags&2):undefined,doors,windows});
  }
  const state={name:quoteName,unit:UNIT_FROM_CODE.get(header[0]),market:header[1],taxBp,rooms};
  const issues=validateState(state);
  if(issues.length)return fail('invalid','That quote has a value that is out of range. '+issues[0].message);
  return {ok:true,state};
}

/** Always returns a usable quote: the decoded one, or a new default quote plus a message to show the visitor. */
export function restoreState(code){
  if(code===null||code===undefined||code==='')return {state:defaultState(),message:null,restored:false};
  const result=decodeState(code);
  if(result.ok)return {state:result.state,message:null,restored:true};
  return {state:defaultState(),message:result.message+' A new quote is shown instead.',restored:false};
}

/** 32-bit FNV-1a over the characters of an ASCII string. */
export function fnv1a(text){
  let hash=0x811c9dc5;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193);}
  return hash>>>0;
}

/** SC-XXXX-XXXX from the encoded quote. The unit preference is left out, so metric and imperial views share one number. */
export function quoteNumber(state){
  const hex=fnv1a(encodeState({...state,unit:'m'})).toString(16).toUpperCase().padStart(8,'0');
  return 'SC-'+hex.slice(0,4)+'-'+hex.slice(4);
}

export const hashFor=code=>'#q='+code;
export const codeFromHash=hash=>typeof hash==='string'&&hash.startsWith('#q=')?hash.slice(3):null;
