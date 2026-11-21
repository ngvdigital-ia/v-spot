import {mkdir,readdir,lstat,copyFile,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyOffer} from './aplicar.mjs';

const accessDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(accessDir);
const outputRoot=path.join(root,'.vercel');
const scratch=path.join(outputRoot,'gate-build-'+randomUUID());
const input=path.join(scratch,'input');
const privateRoot=path.join(input,'offer');
const extensions=new Set(['.html','.htm','.js','.css','.json','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.mp4','.webm','.mp3','.ogg','.wav','.woff','.woff2','.ttf','.otf','.pdf','.txt','.md','.webmanifest','.avif']);
const forbidden=name=>name.startsWith('.')||/^(?:auth|credentials?|secrets?|tokens?)\.(?:json|txt)$/i.test(name)||/\.env(?:\.|$)/i.test(name);
async function copyStatic(src,dest,top=false,publicContent=false){
 await mkdir(dest,{recursive:true});
 for(const entry of await readdir(src,{withFileTypes:true})){
  if(forbidden(entry.name)||['node_modules','access'].includes(entry.name))continue;
  if(top&&publicContent&&['vsl','vsl-2'].includes(entry.name))continue;
  if(top&&['vercel.json','package.json','package-lock.json','MANIFESTO.json'].includes(entry.name))continue;
  const from=path.join(src,entry.name),to=path.join(dest,entry.name);
  if(entry.isSymbolicLink())throw new Error('Link simbólico não é conteúdo estático permitido.');
  if(entry.isDirectory()){await copyStatic(from,to,false,publicContent);continue;}
  if(!entry.isFile()||!extensions.has(path.extname(entry.name).toLowerCase()))continue;
  if((await lstat(from)).size>50*1024*1024)throw new Error('Arquivo grande demais para o pacote da função.');
  await copyFile(from,to);
 }
}
await mkdir(input,{recursive:true});
try{
 await copyStatic(root,privateRoot,true);
 const config=JSON.parse(await readFile(path.join(accessDir,'oferta.json'),'utf8'));
 config.conteudo_privado=privateRoot;
 config.conteudo_publico=path.join(accessDir,'institution');
 const configPath=path.join(input,'oferta.json');
 await writeFile(configPath,JSON.stringify(config));
 const generated=path.join(scratch,'generated');
 const result=await applyOffer(configPath,generated);
 await rm(path.join(outputRoot,'output'),{recursive:true,force:true});
 await rename(path.join(generated,'output'),path.join(outputRoot,'output'));
 const staticRoot=path.join(outputRoot,'output/static');
 await copyStatic(root,staticRoot,true,true);
 const escapeRE=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const routes=[
  {src:'^/(?:index\\.html)?$',dest:'/access'},
  {src:'^/(?:vsl|vsl-2|white)(?:/.*)?$',dest:'/access'},
  ...config.redirecionamentos.filter(rule=>rule.source!=='/').map(rule=>({src:'^'+escapeRE(rule.source)+'$',dest:rule.destination,status:rule.permanent?308:307})),
  {src:'^/access(?:/.*)?$',status:404},
 ];
 for(const entry of await readdir(staticRoot,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  try{
   if((await lstat(path.join(staticRoot,entry.name,'index.html'))).isFile())
    routes.push({src:'^/'+escapeRE(entry.name)+'/?$',dest:'/'+entry.name+'/index.html'});
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }
 routes.push({handle:'filesystem'},{src:'/(.*)',status:404});
 await writeFile(path.join(outputRoot,'output/config.json'),JSON.stringify({version:3,routes},null,2)+'\n');
 console.log('Gate preparado somente para entrada/VSL; outras páginas estáticas públicas; arquivos privados somente na função.');
}finally{
 await rm(scratch,{recursive:true,force:true});
}
