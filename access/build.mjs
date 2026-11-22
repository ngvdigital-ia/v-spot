import {mkdir,readdir,lstat,copyFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const accessDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(accessDir);
const outputRoot=path.join(root,'.vercel');
// Publish the same original offer for everyone, with no access function.
const scratch=path.join(outputRoot,'public-build-'+randomUUID());
const staticRoot=path.join(scratch,'static');
const extensions=new Set(['.html','.htm','.js','.css','.json','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.mp4','.webm','.mp3','.ogg','.wav','.woff','.woff2','.ttf','.otf','.pdf','.txt','.md','.webmanifest','.avif']);
const forbidden=name=>name.startsWith('.')||/^(?:auth|credentials?|secrets?|tokens?)\.(?:json|txt)$/i.test(name)||/\.env(?:\.|$)/i.test(name);
async function copyStatic(src,dest,top=false){
 await mkdir(dest,{recursive:true});
 for(const entry of await readdir(src,{withFileTypes:true})){
  if(forbidden(entry.name)||['node_modules','access'].includes(entry.name))continue;
  if(top&&['vercel.json','package.json','package-lock.json','MANIFESTO.json'].includes(entry.name))continue;
  const from=path.join(src,entry.name),to=path.join(dest,entry.name);
  if(entry.isSymbolicLink())throw new Error('Link simbólico não é conteúdo estático permitido.');
  if(entry.isDirectory()){await copyStatic(from,to);continue;}
  if(!entry.isFile()||!extensions.has(path.extname(entry.name).toLowerCase()))continue;
  if((await lstat(from)).size>50*1024*1024)throw new Error('Arquivo grande demais para o pacote da função.');
  await copyFile(from,to);
 }
}
await mkdir(outputRoot,{recursive:true});
try{
 await copyStatic(root,staticRoot,true);
 const escapeRE=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 // Keep the site's original public redirect destinations.
 const routes=[
  {src:'^/(?:index\\.html)?$',dest:'/vsl-2/',status:307},
  {src:'^/v-spot$',dest:'/the-squirting-system/',status:307},
  {src:'^/v-spot-PF$',dest:'/the-squirting-system-PF/',status:307},
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
 await writeFile(path.join(scratch,'config.json'),JSON.stringify({version:3,routes},null,2)+'\n');
 await rm(path.join(outputRoot,'output'),{recursive:true,force:true});
 await rename(scratch,path.join(outputRoot,'output'));
 console.log('Oferta pública: somente arquivos estáticos, sem função de acesso ou alternância de conteúdo.');
}finally{
 await rm(scratch,{recursive:true,force:true});
}
