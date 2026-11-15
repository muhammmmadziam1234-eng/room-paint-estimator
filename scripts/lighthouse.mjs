// Runs Lighthouse (its default mobile preset: a phone-sized screen, simulated slow 4G, 4x CPU slowdown) several
// times against `node serve.mjs` and records the median score of each category.
// Usage: CHROME_PATH=/path/to/chrome node scripts/lighthouse.mjs [--runs=3] [--out=docs/evidence/lighthouse.json]
//          [--min=performance:95,accessibility:100,best-practices:95,seo:95]
// Exits with 1 when a median is below its minimum.
import lighthouse from 'lighthouse';
import {launch} from 'chrome-launcher';
import {spawn} from 'node:child_process';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const option=(name,fallback)=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const runs=Number(option('runs','3'));
const out=fileURLToPath(new URL(option('out','docs/evidence/lighthouse.json'),new URL('../',import.meta.url)));
const minimum=Object.fromEntries(option('min','performance:95,accessibility:100,best-practices:95,seo:95').split(',').map(pair=>{const [k,v]=pair.split(':');return [k,Number(v)];}));
const CATEGORIES=['performance','accessibility','best-practices','seo'];
const median=numbers=>[...numbers].sort((a,b)=>a-b)[Math.floor(numbers.length/2)];

const child=spawn(process.execPath,[fileURLToPath(new URL('../serve.mjs',import.meta.url))],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
let output='';
const url=await (async()=>{for await(const chunk of child.stdout){output+=chunk;const match=output.match(/(http:\/\/127\.0\.0\.1:\d+)/);if(match)return match[1]+'/';}throw new Error('The server did not start.');})();

const perRun=[];
let settings, userAgent, version;
try{
  for(let run=1;run<=runs;run++){
    const chrome=await launch({chromePath:process.env.CHROME_PATH,chromeFlags:['--headless','--no-sandbox'],logLevel:'silent'});
    try{
      const {lhr}=await lighthouse(url,{port:chrome.port,logLevel:'error',output:'json',onlyCategories:CATEGORIES});
      settings??=lhr.configSettings; userAgent??=lhr.environment.hostUserAgent; version??=lhr.lighthouseVersion;
      const audit=id=>lhr.audits[id].numericValue;
      perRun.push({
        scores:Object.fromEntries(CATEGORIES.map(id=>[id,Math.round(lhr.categories[id].score*100)])),
        metrics:{firstContentfulPaintMs:Math.round(audit('first-contentful-paint')),largestContentfulPaintMs:Math.round(audit('largest-contentful-paint')),
          totalBlockingTimeMs:Math.round(audit('total-blocking-time')),cumulativeLayoutShift:Number(audit('cumulative-layout-shift').toFixed(3)),speedIndexMs:Math.round(audit('speed-index'))},
        notFullMarks:CATEGORIES.flatMap(id=>lhr.categories[id].auditRefs.filter(ref=>ref.weight>0&&lhr.audits[ref.id].score!==null&&lhr.audits[ref.id].score<1).map(ref=>`${id}: ${ref.id} (${lhr.audits[ref.id].score})`))
      });
      console.log(`run ${run}:`,JSON.stringify(perRun.at(-1).scores));
    }finally{await chrome.kill();}
  }
}finally{child.kill();}

const medianScores=Object.fromEntries(CATEGORIES.map(id=>[id,median(perRun.map(r=>r.scores[id]))]));
const failures=CATEGORIES.filter(id=>medianScores[id]<minimum[id]).map(id=>`${id} ${medianScores[id]} is below ${minimum[id]}`);
const report={
  tool:'lighthouse',version,date:new Date().toISOString().slice(0,10),browser:userAgent.match(/(?:Headless)?Chrome\/[\d.]+/)?.[0],
  formFactor:settings.formFactor,throttlingMethod:settings.throttlingMethod,throttling:settings.throttling,
  target:'node serve.mjs on a free local port, page loaded once per run in a fresh browser profile',runs,
  medianScores,medianMetrics:{
    firstContentfulPaintMs:median(perRun.map(r=>r.metrics.firstContentfulPaintMs)),largestContentfulPaintMs:median(perRun.map(r=>r.metrics.largestContentfulPaintMs)),
    totalBlockingTimeMs:median(perRun.map(r=>r.metrics.totalBlockingTimeMs)),cumulativeLayoutShift:median(perRun.map(r=>r.metrics.cumulativeLayoutShift)),
    speedIndexMs:median(perRun.map(r=>r.metrics.speedIndexMs))},
  minimums:minimum,passed:failures.length===0,perRun
};
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log('median:',JSON.stringify(medianScores),failures.length?'FAILED: '+failures.join('; '):'all thresholds met','->',out);
process.exitCode=failures.length?1:0;
