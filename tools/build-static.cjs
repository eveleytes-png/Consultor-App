// Publish only browser assets. Server libraries, migrations and tests stay private.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync(root)){
 if(/\.(?:js|css|html)$/.test(name))fs.copyFileSync(path.join(root,name),path.join(out,name));
}
for(const name of ['assets','vendor'])fs.cpSync(path.join(root,name),path.join(out,name),{recursive:true});
if(!fs.existsSync(path.join(out,'notifications.js')))throw Error('Missing profile extension');
// Any failed check exits the build and prevents Vercel from replacing production.
require('./check-release.cjs');
console.log('Static app built and release checks passed. Backend code, SQL and tests excluded from public output.');
