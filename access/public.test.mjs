import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const output=new URL('../.vercel/output/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('./source-manifest.json',import.meta.url)));
const approved=manifest.files.filter(file=>file.path!=='vercel.json');

test('all 62 approved original pages, scripts and media are public and byte-identical',async()=>{
 assert.equal(approved.length,62);
 for(const file of approved){
  const bytes=await readFile(new URL('static/'+file.path,output));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
  assert.deepEqual(bytes,await readFile(new URL('../'+file.path,import.meta.url)),file.path);
 }
});

test('deployment has no function, access configuration or extra public files',async()=>{
 assert.deepEqual((await readdir(output)).sort(),['config.json','static']);
 const paths=[];
 async function walk(url,prefix=''){
  for(const item of await readdir(url,{withFileTypes:true})){
   const name=prefix+item.name;
   if(item.isDirectory())await walk(new URL(item.name+'/',url),name+'/');else paths.push(name);
  }
 }
 await walk(new URL('static/',output));
 assert.deepEqual(paths.sort(),approved.map(f=>f.path).sort());
 for(const name of ['functions','static/access','static/.env','static/package.json','static/vercel.json','static/white'])
  await assert.rejects(lstat(new URL(name,output)),{code:'ENOENT'},name);
});

test('both public VSLs preserve exactly one approved Utmify pixel',async()=>{
 for(const page of ['vsl','vsl-2']){
  const html=await readFile(new URL('static/'+page+'/index.html',output),'utf8');
  const pixels=[];
  for(const [,body] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
   const plain=/window\.pixelId\s*=\s*["']([a-z0-9]+)["']/.exec(body);
   if(plain)pixels.push(plain[1]);
   for(const [,payload] of body.matchAll(/atob\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/g)){
    const raw=Buffer.from(payload,'base64'),size=raw[0],key=raw.subarray(1,1+size);
    if(!size||key.length!==size)continue;
    let config;try{config=JSON.parse(Buffer.from(raw.subarray(1+size).map((b,i)=>b^key[i%size])).toString());}catch{continue;}
    if(config.url==='https://cdn.utmify.com.br/scripts/pixel/pixel.js')pixels.push(...config.globals.filter(g=>g.name==='pixelId').map(g=>g.value));
   }
  }
  assert.deepEqual(pixels,['6af3ae8ae7a1a1e791ee8148'],page);
 }
});
