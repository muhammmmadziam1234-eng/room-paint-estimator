// Runs the unit and server tests with Node's built-in coverage, writes docs/evidence/coverage.txt, and fails
// when line coverage of quote.mjs or state.mjs is below 90 %. Usage: npm run coverage
import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const MODULES=['quote.mjs','state.mjs','units.mjs','format.mjs','store.mjs'];
const GATED=['quote.mjs','state.mjs'], MINIMUM=90;
const args=['--test','--experimental-test-coverage',...MODULES.map(file=>`--test-coverage-include=${file}`),'test/*.test.mjs'];
const run=spawnSync(process.execPath,args,{cwd:fileURLToPath(root),encoding:'utf8',maxBuffer:64*1024*1024});
const report=(run.stdout.match(/# start of coverage report[\s\S]*?# end of coverage report/)?.[0]??'').split('\n').map(line=>line.replace(/^# ?/,'')).join('\n');
const lines=Object.fromEntries(MODULES.map(file=>{
  const match=new RegExp(`^\\s*${file.replace('.','\\.')}\\s*\\|\\s*([\\d.]+)`,'m').exec(report);
  return [file,match?Number(match[1]):null];
}));
const failures=GATED.filter(file=>lines[file]===null||lines[file]<MINIMUM).map(file=>`${file}: ${lines[file]}`);
const testsOk=run.status===0;
const verdict=testsOk&&!failures.length?'PASS':'FAIL';
mkdirSync(new URL('docs/evidence/',root),{recursive:true});
writeFileSync(new URL('docs/evidence/coverage.txt',root),[
  `Unit and server test coverage, recorded ${new Date().toISOString().slice(0,10)} with Node ${process.version}.`,
  `Command: node ${args.map(arg=>arg.includes('*')?`"${arg}"`:arg).join(' ')}`,
  `Gate: line coverage of ${GATED.join(' and ')} must be at least ${MINIMUM} %. The other modules are reported, not gated.`,
  '',report.trim(),'',
  `Result: ${verdict}. ${MODULES.map(file=>`${file} ${lines[file]} %`).join(', ')}.`,''].join('\n'));
console.log(`coverage ${verdict}:`,MODULES.map(file=>`${file} ${lines[file]}%`).join(', '));
process.exitCode=verdict==='PASS'?0:1;
