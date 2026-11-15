// Regenerates every file in docs/evidence and the generated tables in README.md: test counts, coverage, axe results,
// Lighthouse medians and the print page counts. Usage: CHROME_PATH=/path/to/chrome npm run evidence
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url), cwd=fileURLToPath(root);
const run=(name,args,env={})=>{
  console.log(`\n== ${name} ==`);
  const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',env:{...process.env,...env},maxBuffer:64*1024*1024});
  if(result.status!==0){console.error(result.stdout.slice(-2000),result.stderr.slice(-2000),`${name} failed`);process.exit(1);}
  return result.stdout;
};
const count=(output,label)=>Number(new RegExp(`^# ${label} (\\d+)`,'m').exec(output)?.[1]);
const summary=output=>({tests:count(output,'tests'),pass:count(output,'pass'),fail:count(output,'fail')});

const unit=summary(run('unit and server tests',['--test','--test-reporter=tap','test/*.test.mjs']));
const e2e=summary(run('browser tests',['--test','--test-reporter=tap','--test-concurrency=1','--test-timeout=120000','test/e2e/*.test.mjs'],{WRITE_EVIDENCE:'1'})); // also writes axe.json
writeFileSync(new URL('docs/evidence/tests.json',root),JSON.stringify({date:new Date().toISOString().slice(0,10),node:process.version,unit,e2e},null,2)+'\n');
run('coverage',['scripts/coverage.mjs']);
console.log(run('lighthouse',['scripts/lighthouse.mjs']).trim().split('\n').at(-1));
console.log(run('print pages and images',['scripts/screenshots.mjs']).trim());
run('readme',['scripts/readme-evidence.mjs']);
console.log('\nevidence regenerated');
