import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=new URL('../',import.meta.url);
const readme=readFileSync(new URL('README.md',root),'utf8');
const lines=readme.trimEnd().split('\n');

test('the README keeps its title, its status badge and its copyright line',()=>{
  assert.equal(lines[0],'# Room Paint Estimator');
  assert.equal(lines[1],'');
  assert.equal(lines[2],'[![Tests](https://github.com/muhammmmadziam1234-eng/room-paint-estimator/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/muhammmmadziam1234-eng/room-paint-estimator/actions/workflows/test.yml)');
  assert.equal(lines.at(-1),'© 2026 muhammmmadziam1234-eng. All rights reserved, except the typeface in [fonts](fonts), which keeps its own licence.');
  assert.match(readFileSync(new URL('.github/workflows/test.yml',root),'utf8'),/^name: Tests$/m);
});

test('the README has the sections of a case study and says the studio is fictional',()=>{
  for(const heading of ['What it demonstrates','Run it','Pricing rules','Architecture','Decisions','Quality evidence','Limits and next steps'])
    assert.match(readme,new RegExp(`^## ${heading}$`,'m'),heading);
  assert.match(readme,/Second Coat is a fictional/);
  assert.match(readme,/```mermaid\nflowchart/);
});

test('every relative link and image in the README points at a file that exists',()=>{
  const targets=[...readme.matchAll(/\]\(([^)\s]+)\)/g)].map(match=>match[1]).filter(target=>!/^(https?:|#|mailto:)/.test(target));
  assert.ok(targets.length>15);
  for(const target of targets)assert.ok(existsSync(new URL(decodeURI(target.split('#')[0]),root)),target);
});

test('no file in the repository mentions an AI tool or an internal project name',()=>{
  const banned=new RegExp(['cla'+'ude','anthro'+'pic','chat'+'gpt','open'+'ai','copi'+'lot','gem'+'ini','AXI'+'OM','Meri'+'dian'].join('|'),'i');
  const walk=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>
    ['node_modules','.git','package-lock.json'].includes(entry.name)?[]:entry.isDirectory()?walk(join(directory,entry.name)):[join(directory,entry.name)]);
  const files=walk(fileURLToPath(root)).filter(path=>/\.(mjs|js|json|css|html|md|txt|yml|svg|webmanifest)$/.test(path));
  assert.ok(files.length>25);
  for(const file of files)assert.doesNotMatch(readFileSync(file,'utf8'),banned,file);
});
