// Release gate: execute the built browser code, not an injected map configuration.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
for(const name of fs.readdirSync(dist).filter(name=>name.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(dist,name),'utf8'),{filename:name});
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)){
 const src=match[1];if(/^https?:/.test(src))continue;
 if(!fs.existsSync(path.join(dist,src)))throw Error('Falta un script de la aplicación: '+src);
}
for(const args of [
 ['tests/map-viewport.test.cjs'],
 ['--test','tests/visit-visualization.test.mjs'],
 ['tests/survey-age-filters.test.cjs'],
 ['tests/navigation-actions-regression.test.cjs']
])execFileSync(process.execPath,args,{cwd:root,stdio:'inherit'});
// Prove that this exact regression cannot silently pass the map test again.
const tempRoot=path.resolve(os.tmpdir()),temp=fs.mkdtempSync(path.join(tempRoot,'consultor-map-gate-'));
try{
 fs.mkdirSync(path.join(temp,'dist'));
 const source=fs.readFileSync(path.join(dist,'customization.js'),'utf8');
 const broken=source.replace(/const mapTilerKey='[^']*';/,'');
 if(source===broken)throw Error('No se encontró la configuración del mapa que debe cubrir la prueba.');
 fs.writeFileSync(path.join(temp,'dist','customization.js'),broken);
 const result=spawnSync(process.execPath,[path.join(root,'tests','map-viewport.test.cjs')],{cwd:temp,encoding:'utf8'});
 if(result.error)throw result.error;
 if(result.status===0||!((result.stdout||'')+(result.stderr||'')).includes('mapTilerKey'))throw Error('La prueba no detectó la falta de configuración del mapa. Se bloquea la publicación.');
 console.log('PASS: removing the map configuration fails the regression test; deployment guard is active.');
}finally{
 if(path.dirname(path.resolve(temp))!==tempRoot||!path.basename(temp).startsWith('consultor-map-gate-'))throw Error('Unexpected temporary cleanup path.');
 fs.rmSync(temp,{recursive:true,force:true});
}
console.log('Release gate passed.');
