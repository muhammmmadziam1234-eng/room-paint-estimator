// Regenerates every file in docs/evidence: coverage, axe results and the Lighthouse medians.
// Usage: CHROME_PATH=/path/to/chrome npm run evidence
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cwd=fileURLToPath(new URL('../',import.meta.url));
const steps=[
  ['coverage',['scripts/coverage.mjs']],
  ['axe',['--test','--test-timeout=120000','test/e2e/a11y.e2e.test.mjs'],{WRITE_EVIDENCE:'1'}],
  ['lighthouse',['scripts/lighthouse.mjs']]
];
for(const [name,args,env] of steps){
  console.log(`\n== ${name} ==`);
  const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit',env:{...process.env,...env}});
  if(result.status!==0){console.error(`${name} failed`);process.exit(1);}
}
