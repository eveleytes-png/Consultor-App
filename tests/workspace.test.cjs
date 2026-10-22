const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({Intl,Date,console});vm.runInContext(fs.readFileSync('dist/home.js','utf8'),ctx);vm.runInContext(fs.readFileSync('dist/workspace.js','utf8').split('home=function')[0],ctx);
const run=s=>vm.runInContext(s,ctx);
run(`const portfolioHeaders=['Transaccionabilidad proyectada Point','Transaccionabilidad proyectada QR'];`);
assert.equal(run(`workspaceStatuses({accept:'NO',sourceValues:['NO POINTER REFERIBLE','no qR']}).join('|')`),'Sin aceptación|No Pointer referible|No QR');
assert.equal(run(`workspaceStatuses({accept:'si',sourceValues:['70%','']}).length`),0);
for(const [survey,target] of [[0,60],[60,75],[75,100],[100,100]]){const g=run(`workspaceGoal(computePortfolio(Array.from({length:100},(_,i)=>({e:'x',accept:'si',survey:i<${survey}?'si':'no'}))),new Date('2026-10-22T15:00:00Z'))`);assert.equal(g.target,target);assert.equal(g.days,8);assert.equal(g.deadline,30);assert.equal(g.perDay,Math.ceil(g.missing/8));}
assert.equal(run(`workspaceGoal(computePortfolio([]),new Date('2026-02-27T15:00:00Z')).days`),0);
console.log('PASS workspace: explicit Point/QR states, goals, ceiling daily pace, month deadline and zero-day case');
