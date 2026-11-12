import {estimate} from './estimate.mjs';
const $=id=>document.getElementById(id), form=$('quote');
const currency=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const money=cents=>currency.format(cents/100);
let saved;
const share=$('share');
const inputs=['length','width','height','finish','ceiling','repair'];
function estimateFor(data){
  return estimate({length:Number(data.get('length')),width:Number(data.get('width')),height:Number(data.get('height')),
    finish:data.get('finish'),ceiling:data.has('ceiling'),repair:data.has('repair')});
}
function restore(){
  const query=new URLSearchParams(location.search);
  if(!query.has('length'))return;
  try{
    estimateFor(query);
    for(const name of inputs){
      const field=form.elements.namedItem(name);
      if(name==='ceiling'||name==='repair')field.checked=query.has(name);
      else field.value=query.get(name);
    }
    $('share-note').textContent='Shared estimate loaded.';
  }catch{$('share-note').textContent='The shared estimate could not be opened. Sample dimensions are shown.';}
}
function render(){
  const data=new FormData(form);
  try{
    saved=estimateFor(data);
    const url=new URL(location.href);url.search=new URLSearchParams(data);url.hash='estimate';
    share.href=url;share.hidden=false;
    $('error').textContent='';
    $('area').textContent=saved.walls.toFixed(1)+' m² of walls'+(saved.ceiling?' + '+saved.ceiling.toFixed(1)+' m² of ceiling':'')+' / '+saved.finish+' finish';
    $('breakdown').replaceChildren(...saved.lines.map(({label,cents})=>{
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=label;dd.textContent=money(cents);row.append(dt,dd);return row;
    }));
    $('total').textContent=money(saved.total);$('download').disabled=false;
  }catch(e){
    saved=undefined;share.hidden=true;$('error').textContent=e.message;$('download').disabled=true;
    $('area').textContent='';$('breakdown').replaceChildren();$('total').textContent='—';
  }
}
form.onsubmit=e=>{e.preventDefault();render();};
form.addEventListener('input',()=>{ $('download').disabled=true; share.hidden=true; $('share-note').textContent=''; $('error').textContent=''; });
$('download').onclick=()=>{
  if(!saved)return;
  const summary=['Second Coat | Room paint estimate',$('area').textContent,'',...saved.lines.map(x=>x.label+': '+money(x.cents)),
    '', 'Estimated total: '+money(saved.total)+' USD','Fictional demo; this is not a booking.'].join('\n');
  const url=URL.createObjectURL(new Blob([summary],{type:'text/plain'}));
  const link=document.createElement('a');link.href=url;link.download='second-coat-estimate.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
restore();render();
