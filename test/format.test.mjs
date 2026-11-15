import test from 'node:test';
import assert from 'node:assert/strict';
import {decimalText,moneyFormatter,areaText,lengthText,dimensionsText,percentText,formatDate,addDays,issueMessage,describeQuote} from '../format.mjs';
import {priceQuote} from '../quote.mjs';

// Number formats put a no-break or narrow no-break space in places; compare with plain spaces.
const plain=text=>text.replace(/[  ]/g,' ');

test('decimal text is built from integers',()=>{
  assert.equal(decimalText(12345,2),'123.45');
  assert.equal(decimalText(5,2),'0.05');
  assert.equal(decimalText(-5,2),'-0.05');
  assert.equal(decimalText(0,1),'0.0');
  assert.equal(decimalText(4306,1),'430.6');
});

test('money is shown in the currency and number format of each market',()=>{
  assert.equal(moneyFormatter('us')(21500),'$215.00');
  assert.equal(moneyFormatter('us')(1234567),'$12,345.67');
  assert.equal(moneyFormatter('us')(-3426),'-$34.26');
  assert.equal(moneyFormatter('gb')(1234567),'£12,345.67');
  assert.equal(plain(moneyFormatter('de')(1234567)),'12.345,67 €');
  assert.equal(plain(moneyFormatter('fr')(1234567)),'12 345,67 €');
  assert.equal(moneyFormatter('us')(0),'$0.00');
  assert.equal(moneyFormatter('us')(5),'$0.05');
});

test('areas are shown in square metres, with square feet in brackets for imperial',()=>{
  assert.equal(areaText(35_230_000,'m','en-US'),'35.23 m²');
  assert.equal(areaText(35_230_000,'ft','en-US'),'35.23 m² (379.2 ft²)');
  assert.equal(areaText(35_230_000,'m','de-DE'),'35,23 m²');
  assert.equal(areaText(0,'m','en-US'),'0.00 m²');
  assert.equal(areaText(15_750_000,'m','en-GB'),'15.75 m²');
});

test('lengths and room sizes',()=>{
  assert.equal(lengthText(4500,'m','en-US'),'4.5 m');
  assert.equal(lengthText(4123,'m','en-US'),'4.123 m');
  assert.equal(lengthText(4500,'m','de-DE'),'4,5 m');
  assert.equal(lengthText(4496,'ft'),'14 ft 9 in');
  assert.equal(lengthText(3048,'ft'),'10 ft');
  assert.equal(lengthText(4500,'ft'),'14 ft 9.17 in');
  const room={lengthMm:4500,widthMm:3500,heightMm:2500};
  assert.equal(dimensionsText(room,'m','en-US'),'4.5 × 3.5 × 2.5 m');
  assert.equal(dimensionsText(room,'m','de-DE'),'4,5 × 3,5 × 2,5 m');
  assert.equal(dimensionsText(room,'ft','en-US'),'14 ft 9.17 in × 11 ft 5.8 in × 8 ft 2.43 in');
});

test('percentages and dates follow the locale; thirty days later is the same time of day',()=>{
  assert.equal(percentText(825,'en-US'),'8.25%');
  assert.equal(percentText(2500,'en-US'),'25%');
  assert.equal(plain(percentText(825,'de-DE')),'8,25 %');
  const day=new Date(2026,10,15,9,30);
  assert.equal(formatDate(day,'en-US'),'Nov 15, 2026');
  assert.equal(formatDate(day,'en-GB'),'15 Nov 2026');
  const later=addDays(day,30);
  assert.equal(formatDate(later,'en-US'),'Dec 15, 2026');
  assert.equal(later.getHours(),9);
  assert.equal(day.getDate(),15,'the original date is not changed');
  assert.equal(formatDate(addDays(new Date(2026,0,31),30),'en-US'),'Mar 2, 2026');
});

test('range messages are restated in feet and inches for imperial quotes',()=>{
  const issue={room:0,field:'length',message:'Enter a length from 2 to 15 m.'};
  assert.equal(issueMessage(issue,'m'),'Enter a length from 2 to 15 m.');
  assert.equal(issueMessage(issue,'ft'),'Enter a length from 6 ft 6.74 in to 49 ft 2.55 in.');
  assert.equal(issueMessage({...issue,field:'height'},'ft'),'Enter a height from 6 ft 6.74 in to 16 ft 4.85 in.');
  const doors={room:0,field:'doors',message:'Enter a number of doors from 0 to 10.'};
  assert.equal(issueMessage(doors,'ft'),doors.message);
});

test('a priced quote is described in plain text for the summary and the printed sheet',()=>{
  const room=over=>({name:'',lengthMm:4500,widthMm:3500,heightMm:2500,finish:'matte',ceiling:false,repair:false,doors:0,windows:0,...over});
  const state={name:'Flat 4B',unit:'m',market:'us',taxBp:825,rooms:[
    room({name:'Living room',doors:1,windows:1,ceiling:true,repair:true}),
    room({lengthMm:3000,widthMm:3000,heightMm:2400,finish:'eggshell',doors:1}),
    room({lengthMm:5000,widthMm:4000,heightMm:2700,finish:'satin',ceiling:true,windows:2})]};
  const view=describeQuote(state,priceQuote(state));
  assert.equal(view.rooms[0].title,'Living room');
  assert.equal(view.rooms[1].title,'Room 2','an empty name falls back to its position');
  assert.equal(view.rooms[0].details,'4.5 × 3.5 × 2.5 m · Matte · 1 door and 1 window');
  assert.equal(view.rooms[1].details,'3 × 3 × 2.4 m · Eggshell · 1 door');
  assert.equal(view.rooms[2].details,'5 × 4 × 2.7 m · Satin · 2 windows');
  assert.equal(view.rooms[0].deduction,'Openings deducted: 3.33 m²');
  assert.deepEqual(view.rooms[0].rows,[
    {key:'walls',label:'Wall paint and labour',quantity:'36.67 m²',rate:'$4.25 per m²',amount:'$155.85'},
    {key:'ceiling',label:'Ceiling paint and labour',quantity:'15.75 m²',rate:'$3.50 per m²',amount:'$55.13'},
    {key:'repairs',label:'Minor wall repairs',quantity:'1',rate:'flat',amount:'$65.00'}]);
  assert.equal(view.rooms[0].subtotal,'$275.98');
  assert.deepEqual(view.jobRows.map(r=>[r.key,r.label,r.amount]),[
    ['setup','Room protection and setup (once per quote)','$45.00'],
    ['discount','Multi-room discount (5% of paint lines, 3+ rooms)','-$34.26'],
    ['subtotal','Subtotal','$761.02'],
    ['tax','Tax (8.25%)','$62.78']]);
  assert.equal(view.total,'$823.80');
  // Imperial, no discount, no tax: only the rows that apply are listed.
  const small={...state,unit:'ft',taxBp:0,rooms:[room()]};
  const plainView=describeQuote(small,priceQuote(small));
  assert.deepEqual(plainView.jobRows.map(r=>r.key),['setup','subtotal']);
  assert.equal(plainView.rooms[0].rows[0].quantity,'40.00 m² (430.6 ft²)');
  assert.equal(plainView.rooms[0].deduction,'');
});
