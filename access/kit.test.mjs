import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile, readFile, rm, symlink, access, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createGate, issueCampaignEntry} from './gate.mjs';
import {applyOffer} from './aplicar.mjs';
import {parameters, credential, UTM} from './parametros.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const SECRET='only-local-fixture-never-a-production-secret-20261121';
const COMMON='common-fixture-for-behavior-only-20261121-123456789';
const HASH=createHash('sha256').update(COMMON).digest('hex');
const C='offer-campaign';
const cookie=response=>response.headers.get('set-cookie')?.split(';')[0];
async function files(run) {
 const root=await mkdtemp(path.join(HERE,'.test-'));
 await mkdir(path.join(root,'offer','vsl'),{recursive:true});
 await mkdir(path.join(root,'institution','white'),{recursive:true});
 await writeFile(path.join(root,'offer','index.html'),'PRIVATE-ROOT');
 await writeFile(path.join(root,'offer','vsl','index.html'),'PRIVATE-OFFER');
 await writeFile(path.join(root,'offer','private.txt'),'PRIVATE-FILE');
 await writeFile(path.join(root,'institution','index.html'),'PUBLIC-INSTITUTION');
 await writeFile(path.join(root,'institution','white','index.html'),'PUBLIC-WHITE');
 try{return await run(root);}finally{await rm(root,{recursive:true,force:true});}
}
async function server(root,extra={}) {
 const handler=await createGate({secret:SECRET,origin:'https://first.example',campaigns:new Set([C]),
  offerDir:path.join(root,'offer'),institutionDir:path.join(root,'institution'),
  rememberVisitors:true,sessionTTL:365*86400,publicPathPrefix:'/white/',sharedAccessHash:HASH,...extra});
 const s=createServer(handler);
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 return {get:(p='/',c)=>fetch('http://127.0.0.1:'+s.address().port+p,{redirect:'manual',headers:c?{cookie:c}:{}}),
  close:()=>new Promise(resolve=>{s.closeAllConnections();s.close(resolve);})};
}
test('common access works at two origins; sessions and individual keys remain origin-specific',async()=>files(async root=>{
 const a=await server(root), b=await server(root,{origin:'https://second.example',secret:SECRET+'second'});
 try{
  const r=await a.get('/vsl/?utm_source=FB&access_token='+COMMON+'&fbclid=keep');
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/vsl/?utm_source=FB&fbclid=keep');
  assert.match(r.headers.get('set-cookie'),/Secure/);assert.match(r.headers.get('set-cookie'),/HttpOnly/);
  assert.equal(await (await a.get('/vsl/',cookie(r))).text(),'PRIVATE-OFFER');
  assert.equal(await (await b.get('/vsl/',cookie(r))).text(),'PUBLIC-INSTITUTION');
  assert.equal((await b.get('/vsl/?access_token='+COMMON)).status,303);
  const old=issueCampaignEntry({secret:SECRET,origin:'https://first.example',campaign:C});
  assert.equal((await a.get('/vsl/?access_token='+old)).status,303);
  assert.equal(await (await b.get('/vsl/?access_token='+old)).text(),'PUBLIC-INSTITUTION');
 }finally{await a.close();await b.close();}
}));
test('common access and its remembered session are revoked without revoking individual sessions',async()=>files(async root=>{
 const enabled=await server(root), disabled=await server(root,{sharedAccessHash:undefined});
 try{
  const shared=cookie(await enabled.get('/vsl/?access_token='+COMMON));
  const old=issueCampaignEntry({secret:SECRET,origin:'https://first.example',campaign:C});
  const individual=cookie(await enabled.get('/vsl/?access_token='+old));
  assert.equal(await (await disabled.get('/vsl/',shared)).text(),'PUBLIC-INSTITUTION');
  assert.equal(await (await disabled.get('/vsl/?access_token='+COMMON)).text(),'PUBLIC-INSTITUTION');
  assert.equal(await (await disabled.get('/vsl/',individual)).text(),'PRIVATE-OFFER');
  assert.equal((await disabled.get('/vsl/?access_token='+old)).status,303);
 }finally{await enabled.close();await disabled.close();}
}));
test('invalid and duplicate credentials do not authorize; private files and source stay protected',async()=>files(async root=>{
 const s=await server(root);
 try{
  for(const query of ['access_token=wrong','access_token='+COMMON+'&access_token='+COMMON,COMMON]){
   const r=await s.get('/vsl/?'+query);assert.equal(r.status,200);assert.equal(await r.text(),'PUBLIC-INSTITUTION');assert.equal(cookie(r),undefined);
  }
  for(const p of ['/private.txt','/gate.mjs','/runtime.json','/.env'])assert.equal((await s.get(p)).status,404,p);
  const c=cookie(await s.get('/vsl/?access_token='+COMMON));
  assert.equal(await(await s.get('/white/',c)).text(),'PUBLIC-WHITE');
 }finally{await s.close();}
}));
test('shared configuration fails closed and respects campaign removal',async()=>files(async root=>{
 await assert.rejects(()=>server(root,{sharedAccessHash:'not-a-digest'}),/Acesso comum inválido/);
 await assert.rejects(()=>server(root,{sharedCampaign:'removed'}),/Acesso comum inválido/);
 await assert.rejects(()=>server(root,{sharedAccessHash:undefined,sharedCampaign:C}),/sem configuração/);
 await assert.rejects(()=>server(root,{campaigns:new Set()}),/Acesso comum inválido/);
}));
test('original redirects run only with authorization and preserve advertising parameters',async()=>files(async root=>{
 const s=await server(root,{offerRedirects:[{source:'/',destination:'/vsl/',permanent:false}]});
 try{
  const anonymous=await s.get('/?utm_source=FB');assert.equal(anonymous.status,200);assert.equal(anonymous.headers.get('location'),null);
  const c=cookie(await s.get('/?access_token='+COMMON));
  const r=await s.get('/?utm_source=FB',c);assert.equal(r.status,307);assert.equal(r.headers.get('location'),'/vsl/?utm_source=FB');
 }finally{await s.close();}
 await assert.rejects(()=>server(root,{offerRedirects:[{source:'/',destination:'//other.example'}]}),/Redirecionamento inválido/);
}));
test('parameters retain Meta macros and always name and encode the access credential',()=>{
 const value=parameters(COMMON);
 assert.equal(value,UTM+'&access_token='+COMMON);
 const p=new URLSearchParams(value);assert.equal(p.get('access_token'),COMMON);
 assert.equal(p.get('utm_campaign'),'{{campaign.name}}|{{campaign.id}}');
 assert.equal(p.get('utm_medium'),'{{adset.name}}|{{adset.id}}');
 assert.equal(new URLSearchParams(parameters(COMMON+'&extra')).get('access_token'),COMMON+'&extra');
 assert.throws(()=>parameters('short'),/inválida/);
} );
test('delivery helper repairs the reported bare-key parameters and rejects ambiguous credentials',()=>{
 for(const input of [COMMON,'utm_source=FB&'+COMMON,'utm_source=FB&access_token='+COMMON,'https://offer.example/vsl?utm_source=FB&'+COMMON]) {
  assert.equal(credential(input),COMMON);
  assert.equal(new URLSearchParams(parameters(credential(input))).get('access_token'),COMMON);
 }
 assert.throws(()=>credential('utm_source=FB&access_token='+COMMON+'&access_token='+COMMON),/duplicada/);
 assert.throws(()=>credential('utm_source=FB'),/inválida/);
});
async function configAt(root,extra={}){
 const c={origem:'https://generated.example',campanha:C,projeto_vercel:'generated-offer',conteudo_privado:'offer',conteudo_publico:'institution',rotas:['/','/vsl/'],...extra};
 const file=path.join(root,'oferta.json');await writeFile(file,JSON.stringify(c));return file;
}
test('applicator preserves every byte and generates a working server without credentials or static bypass',async()=>files(async root=>{
 const target=path.join(root,'generated');const c=await configAt(root);
 const out=await applyOffer(c,target);assert.ok(out.files>=5);
 const manifest=JSON.parse(await readFile(path.join(target,'MANIFESTO.json')));
 for(const file of manifest.files){const b=await readFile(path.join(target,'output/functions/access.func',file.path));assert.equal(createHash('sha256').update(b).digest('hex'),file.sha256);}
 const module=await import(pathToFileURL(path.join(target,'output/functions/access.func/index.mjs')));
 const s=createServer(module.createVercelHandler({env:{XPROTOCOL_GATE_SECRET:SECRET,OFFER_SHARED_ACCESS_SHA256:HASH}}));
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+s.address().port;
  assert.equal(await(await fetch(base+'/vsl/')).text(),'PUBLIC-INSTITUTION');
  assert.equal((await fetch(base+'/private.txt')).status,404);
  const r=await fetch(base+'/vsl/?access_token='+COMMON,{redirect:'manual'});assert.equal(r.status,303);
  assert.equal(await(await fetch(base+'/vsl/',{headers:{cookie:cookie(r)}})).text(),'PRIVATE-OFFER');
 }finally{s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}
 await assert.rejects(access(path.join(target,'output/static')));
 assert.equal(JSON.parse(await readFile(path.join(target,'output/config.json'))).routes[0].dest,'/access');
 await assert.rejects(()=>applyOffer(c,target),/já existe/);
}));
test('applicator refuses secrets, symlinks, traversal, overlapping roots and malformed origin without partial output',async()=>files(async root=>{
 const target=path.join(root,'generated');
 let c=await configAt(root,{origem:'https://generated.example/path'});await assert.rejects(()=>applyOffer(c,target),/domínio HTTPS/);
 c=await configAt(root,{chave:COMMON});await assert.rejects(()=>applyOffer(c,target),/credenciais/);
 c=await configAt(root,{arquivo_principal:'../oferta.json'});await assert.rejects(()=>applyOffer(c,target),/Entrada inválida/);
 c=await configAt(root,{conteudo_publico:'offer'});await assert.rejects(()=>applyOffer(c,target),/Separe/);
 c=await configAt(root);await assert.rejects(()=>applyOffer(c,path.join(root,'offer','generated')),/sobrepõe/);
 await writeFile(path.join(root,'offer','.env'),'FIXTURE_ONLY');await assert.rejects(()=>applyOffer(c,target),/sensível/);
 await rm(path.join(root,'offer','.env'));
 await symlink(path.join(root,'oferta.json'),path.join(root,'offer','link.json'));await assert.rejects(()=>applyOffer(c,target),/regulares/);
 await assert.rejects(access(target));assert.ok(!(await readdir(root)).some(name=>name.startsWith('.cloaker-')));
}));
