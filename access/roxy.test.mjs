import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {createVercelHandler} from '../.vercel/output/functions/access.func/index.mjs';
import {issueCampaignEntry} from '../.vercel/output/functions/access.func/gate.mjs';

const SECRET='roxy-local-fixture-only-not-for-deployment-20261121';
const KEY='shared-roxy-local-fixture-credential-20261121';
const ORIGIN='https://roxyfox.online', CAMPAIGN='roxyfox-20261121';
const white=await readFile(new URL('./institution/index.html',import.meta.url));
const origin=JSON.parse(await readFile(new URL('./source-manifest.json',import.meta.url)));
const publicHTML=new Set(['privacy-policy','refund-policy','terms-of-use','contact','imprint','privacy','terms','refund','support'].map(p=>p+'/index.html'));
const cookie=r=>r.headers.get('set-cookie')?.split(';')[0];
async function fixture(run,overrides={}){
 const env={XPROTOCOL_GATE_SECRET:SECRET,OFFER_SHARED_ACCESS_SHA256:createHash('sha256').update(KEY).digest('hex'),...overrides};
 const s=createServer(createVercelHandler({env}));await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const get=(p='/',c,options={})=>fetch('http://127.0.0.1:'+s.address().port+p,{redirect:'manual',...options,headers:{...(c?{cookie:c}:{}),...options.headers}});
 try{return await run(get);}finally{s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}
}
test('anonymous root, both VSL versions and aliases show the photo gallery without redirect',async()=>fixture(async get=>{
 for(const p of ['/','/vsl','/vsl/','/vsl/index.html','/vsl-2/','/v-spot','/?utm_source=FB']){
  const r=await get(p);assert.equal(r.status,200,p);assert.equal(r.headers.get('location'),null,p);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),white,p);
 }
 assert.match(white.toString(),/<title>The Complete Photo Gallery Guide<\/title>/);
 assert.doesNotMatch(white.toString(),/trusted-badge|The Secrets Of Orgasm/i);
 for(let i=1;i<=6;i++){
  const filename='white/img/g'+i+'.jpg';const r=await get('/'+filename);
  assert.equal(r.status,200,filename);assert.match(r.headers.get('content-type'),/^image\/jpeg/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),await readFile(new URL('./institution/'+filename,import.meta.url)));
 }
}));
test('shared and individual credentials work, attribution survives and public white stays public',async()=>fixture(async get=>{
 for(const key of [KEY,issueCampaignEntry({secret:SECRET,origin:ORIGIN,campaign:CAMPAIGN})]){
  const r=await get('/vsl?utm_source=FB&access_token='+key+'&fbclid=preserved');
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/vsl?utm_source=FB&fbclid=preserved');
  const c=cookie(r);assert.ok(c);
  assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/Secure/);
  const offer=await get('/vsl',c);assert.equal(offer.status,200);
  assert.deepEqual(Buffer.from(await offer.arrayBuffer()),await readFile(new URL('../vsl/index.html',import.meta.url)));
  assert.deepEqual(Buffer.from(await(await get('/white/',c)).arrayBuffer()),white);
 }
}));
test('all original HTML, scripts and media remain byte-identical after authorization',async()=>fixture(async get=>{
 const c=cookie(await get('/vsl?access_token='+KEY));let checked=0;
 for(const file of origin.files){
  if(file.path==='vercel.json')continue;
  const r=await get('/'+file.path,c);assert.equal(r.status,200,file.path);
  const bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);checked++;
 }
 assert.equal(checked,62);
}));
test('gate function denies its private copy anonymously; original legal documents remain intact',async()=>fixture(async get=>{
 for(const file of origin.files){
  if(file.path==='vercel.json')continue;
  const r=await get('/'+file.path);
  if(publicHTML.has(file.path)){
   assert.equal(r.status,200,file.path);
   assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),file.sha256,file.path);
  }else if(file.path.endsWith('.html')){
   assert.equal(r.status,200,file.path);assert.deepEqual(Buffer.from(await r.arrayBuffer()),white,file.path);
  }else assert.equal(r.status,404,file.path);
 }
 for(const p of ['/gate.mjs','/index.mjs','/runtime.json','/.env','/vercel.json','/package.json'])assert.equal((await get(p)).status,404,p);
}));
test('build exposes original funnel pages and assets publicly while VSL source and media stay out of static output',async()=>{
 let exposed=0,protectedFiles=0;
 for(const file of origin.files){
  if(file.path==='vercel.json')continue;
  const built=new URL('../.vercel/output/static/'+file.path,import.meta.url);
  if(/^(?:vsl|vsl-2)\//.test(file.path)){
   await assert.rejects(lstat(built),{code:'ENOENT'},file.path);protectedFiles++;
  }else{
   const bytes=await readFile(built);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);exposed++;
  }
 }
 assert.equal(exposed+protectedFiles,62);assert.ok(exposed>30);assert.ok(protectedFiles>10);
 for(const file of ['index.html','gate.mjs','index.mjs','runtime.json','.env','vercel.json','package.json'])
  await assert.rejects(lstat(new URL('../.vercel/output/static/'+file,import.meta.url)),{code:'ENOENT'},file);
});
test('all three original redirects preserve destination and UTMs after access',async()=>fixture(async get=>{
 const c=cookie(await get('/vsl?access_token='+KEY));
 for(const [source,destination] of [['/','/vsl-2/'],['/v-spot','/the-squirting-system/'],['/v-spot-PF','/the-squirting-system-PF/']]){
  const r=await get(source+'?utm_source=FB',c);assert.equal(r.status,307);assert.equal(r.headers.get('location'),destination+'?utm_source=FB');
 }
}));
test('media ranges and HEAD stay available only to authorized visitors',async()=>fixture(async get=>{
 const media='/vsl-2/assets/result.mp4';const c=cookie(await get('/vsl?access_token='+KEY));
 const r=await get(media,c,{headers:{Range:'bytes=0-8'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,9);
 const h=await get(media,c,{method:'HEAD'});assert.equal(h.status,200);assert.equal((await h.arrayBuffer()).byteLength,0);
 assert.equal((await get(media,null,{headers:{Range:'bytes=0-8'}})).status,404);
}));
test('invalid/duplicate keys and unconfigured signing secret fail closed',async()=>{
 await fixture(async get=>{
  for(const q of ['access_token=invalid','access_token='+KEY+'&access_token='+KEY]){
   const r=await get('/vsl?'+q);assert.equal(r.status,200);assert.equal(cookie(r),undefined);assert.deepEqual(Buffer.from(await r.arrayBuffer()),white);
  }
 });
 await fixture(async get=>{const r=await get('/vsl');assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SECRET|fixture|credential|SHA256/);},{XPROTOCOL_GATE_SECRET:undefined});
});
