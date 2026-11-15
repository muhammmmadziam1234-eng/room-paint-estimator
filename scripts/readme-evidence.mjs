// Renders the pricing-rule tables and the quality-evidence table for the README from the code constants and the
// files in docs/evidence, so no number in them is typed by hand. A test fails when the README differs from this output.
// Usage: node scripts/readme-evidence.mjs           rewrites the marked blocks in README.md
//        node scripts/readme-evidence.mjs --check   exits with 1 if README.md is not what the code and evidence say (run in CI)
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {RATE_CARDS,LIMITS,OPENINGS,DISCOUNT} from '../quote.mjs';
import {decimalText} from '../format.mjs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const json=path=>JSON.parse(read(path));
const m2=mm2=>(mm2/1e6).toFixed(2);
const metres=mm=>String(mm/1000);
const link=file=>`[${file}](docs/evidence/${file})`;

export function renderRules(){
  const rules=[
    ['Rooms in a quote',`${LIMITS.rooms[0]} to ${LIMITS.rooms[1]}`],
    ['Room size',`length and width ${metres(LIMITS.length[0])} to ${metres(LIMITS.length[1])} m, height ${metres(LIMITS.height[0])} to ${metres(LIMITS.height[1])} m. Stored as whole millimetres; feet and inches are converted exactly (1 ft = 304.8 mm, 1 in = 25.4 mm), a half millimetre rounds up`],
    ['Doors',`${LIMITS.doors[0]} to ${LIMITS.doors[1]} per room; each is 0.9 × 2.1 m, so ${m2(OPENINGS.doorMm2)} m² comes off the walls`],
    ['Windows',`${LIMITS.windows[0]} to ${LIMITS.windows[1]} per room; each is 1.2 × 1.2 m, so ${m2(OPENINGS.windowMm2)} m² comes off the walls`],
    ['Wall area','2 × (length + width) × height, minus the doors and windows, never below zero (a room whose openings are larger than its walls has a wall line of 0.00)'],
    ['Ceiling area','length × width, only when the room has its ceiling painted; doors and windows are not deducted'],
    ['Paint lines','area × the price per m² for the finish (walls) or the ceiling price, rounded half up to a whole cent, one line at a time'],
    ['Minor wall repairs','a flat fee for each room that has them'],
    ['Room protection and setup','one flat fee for the whole quote, not one per room'],
    ['Multi-room discount (a rule of this demo)',`${DISCOUNT.percent} % of the summed paint lines (walls and ceilings only) when the quote has ${DISCOUNT.minRooms} or more rooms, rounded half up. Repairs and the setup fee are not discounted`],
    ['Tax',`optional, ${LIMITS.taxBp[0]/100} to ${LIMITS.taxBp[1]/100} % in steps of 0.01 %, applied to the subtotal after the discount and rounded half up`],
    ['Total','the rounded lines added up, minus the discount, plus the tax']
  ];
  const cards=[['Matte walls, per m²','matte'],['Eggshell walls, per m²','eggshell'],['Satin walls, per m²','satin'],['Ceiling, per m²','ceiling'],['Minor wall repairs, per room','repairs'],['Room protection and setup, per quote','setup']];
  const table=(head,rows)=>[`| ${head.join(' | ')} |`,`| ${head.map(()=>'---').join(' | ')} |`,...rows.map(row=>`| ${row.join(' | ')} |`)].join('\n');
  return [
    table(['Rule','In this demo'],rules),'',
    'Price lists. They are fictional, and each currency has its own list; they are not exchange rates of one another.','',
    table(['Item','USD (United States)','GBP (United Kingdom)','EUR (Germany, France)'],cards.map(([label,key])=>[label,...['USD','GBP','EUR'].map(code=>decimalText(RATE_CARDS[code][key],2))]))
  ].join('\n');
}

export function renderEvidence(){
  const tests=json('docs/evidence/tests.json'), axe=json('docs/evidence/axe.json'), lighthouse=json('docs/evidence/lighthouse.json'), print=json('docs/evidence/print.json');
  const coverage=read('docs/evidence/coverage.txt');
  const rows=[...coverage.matchAll(/^(\S+\.mjs)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/gm)].map(match=>`${match[1]} ${match[2]} %`);
  const branches=/^all files\s*\|\s*[\d.]+\s*\|\s*([\d.]+)/m.exec(coverage)?.[1];
  const scores=lighthouse.medianScores, metrics=lighthouse.medianMetrics;
  const violations=axe.scenarios.reduce((sum,scenario)=>sum+scenario.violations,0);
  const lines=[
    ['Unit and server tests',`${tests.unit.pass} of ${tests.unit.tests} pass (Node ${tests.node}, ${tests.date})`,link('tests.json')],
    ['Browser tests',`${tests.e2e.pass} of ${tests.e2e.tests} pass (Chrome ${axe.browser})`,link('tests.json')],
    ['Line coverage of the unit tests',`${rows.join(', ')}. The gate is 90 % on quote.mjs and state.mjs. Branch coverage over all five files is ${branches} %`,link('coverage.txt')],
    [`Accessibility, axe-core ${axe.version} (WCAG 2.0 to 2.2 A and AA, plus best practices)`,`${violations} violations in ${axe.scenarios.length} scenarios`,link('axe.json')],
    [`Lighthouse ${lighthouse.version}, ${lighthouse.formFactor} preset, ${lighthouse.throttlingMethod}d throttling, median of ${lighthouse.runs} runs`,
      `Performance ${scores.performance}, Accessibility ${scores.accessibility}, Best Practices ${scores['best-practices']}, SEO ${scores.seo}`,link('lighthouse.json')],
    ['Lighthouse metrics (median)',`first contentful paint ${metrics.firstContentfulPaintMs} ms, largest contentful paint ${metrics.largestContentfulPaintMs} ms, total blocking time ${metrics.totalBlockingTimeMs} ms, cumulative layout shift ${metrics.cumulativeLayoutShift}, speed index ${metrics.speedIndexMs} ms`,link('lighthouse.json')],
    ['Printed quote',`${print.typicalQuote.rooms} rooms: ${print.typicalQuote.pages} ${print.paper} page. ${print.largestQuote.rooms} rooms with every option: ${print.largestQuote.pages} pages`,link('print.json')]
  ];
  const scenarios=axe.scenarios.map(scenario=>scenario.scenario).join('; ');
  return [
    '| Check | Result | Recorded in |','| --- | --- | --- |',...lines.map(row=>`| ${row.join(' | ')} |`),'',
    `The axe scenarios are: ${scenarios}.`
  ].join('\n');
}

const block=(name,body)=>`<!-- ${name}:start -->\n${body}\n<!-- ${name}:end -->`;
export function fillReadme(readme){
  let result=readme;
  for(const [name,body] of [['rules',renderRules()],['evidence',renderEvidence()]]){
    const pattern=new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`);
    if(!pattern.test(result))throw new Error(`README.md has no ${name} block`);
    result=result.replace(pattern,()=>block(name,body));
  }
  return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const current=read('README.md'), expected=fillReadme(current);
  if(process.argv.includes('--check')){
    console.log(current===expected?'README.md matches the code and docs/evidence':'README.md is out of date: run node scripts/readme-evidence.mjs');
    process.exitCode=current===expected?0:1;
  }else{
    writeFileSync(new URL('README.md',root),expected);
    console.log('README.md rules and evidence blocks updated');
  }
}
