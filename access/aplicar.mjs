#!/usr/bin/env node
import {readFile, writeFile, mkdir, lstat, realpath, readdir, copyFile, rename, rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const forbidden = name => name.startsWith('.') || /^(?:auth|credentials?|secrets?|tokens?)\.(?:json|txt)$/i.test(name) || /\.env(?:\.|$)/i.test(name);
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
const routeOK = route => typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') && !route.includes('..') && !/[?#\\\u0000-\u0020]/.test(route);

export async function applyOffer(configFile, destination) {
  const configPath = await realpath(configFile);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const origin = new URL(config.origem);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('Origem deve ser somente um domínio HTTPS.');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(config.campanha ?? '') || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(config.projeto_vercel ?? ''))
    throw new Error('Campanha ou projeto inválido.');
  for (const key of Object.keys(config)) {
    if (/secret|token|chave|password|senha|cookie/i.test(key)) throw new Error('Configuração não pode conter credenciais.');
  }
  const roots = [];
  for (const key of ['conteudo_privado', 'conteudo_publico']) {
    if (typeof config[key] !== 'string') throw new Error('Falta ' + key + '.');
    const src = path.resolve(path.dirname(configPath), config[key]);
    if ((await lstat(src)).isSymbolicLink()) throw new Error('Fonte não pode ser link simbólico.');
    const resolved = await realpath(src);
    if (!(await lstat(resolved)).isDirectory()) throw new Error('Fonte deve ser diretório.');
    roots.push(resolved);
  }
  if (inside(roots[0], roots[1]) || inside(roots[1], roots[0])) throw new Error('Separe os dois conteúdos.');
  const dest = path.resolve(destination);
  const parent = await realpath(path.dirname(dest));
  const target = path.join(parent, path.basename(dest));
  if (roots.some(src => inside(target, src) || inside(src, target))) throw new Error('Destino se sobrepõe à fonte.');
  try { await lstat(target); throw new Error('Destino já existe; nenhum arquivo foi sobrescrito.'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const routes = config.rotas ?? ['/'];
  if (!Array.isArray(routes) || routes.some(route => !routeOK(route))) throw new Error('Rotas inválidas.');
  const redirects = config.redirecionamentos ?? [];
  if (!Array.isArray(redirects) || redirects.some(r => !routeOK(r?.source) || !routeOK(r?.destination) || r.source === r.destination || (r.permanent !== undefined && typeof r.permanent !== 'boolean')))
    throw new Error('Redirecionamentos inválidos.');
  const entry = config.arquivo_principal ?? 'index.html';
  if (typeof entry !== 'string' || path.isAbsolute(entry) || entry.split(/[\\/]/).some(p => p === '..' || forbidden(p))) throw new Error('Entrada inválida.');
  const entryPath = path.join(roots[0], entry);
  if (!inside(await realpath(entryPath), roots[0]) || !(await lstat(entryPath)).isFile()) throw new Error('Entrada ausente.');
  if (!(await lstat(path.join(roots[1], 'index.html'))).isFile()) throw new Error('Institucional sem index.html.');
  const staging = path.join(parent, '.cloaker-' + randomUUID());
  const functionDir = path.join(staging, 'output/functions/access.func');
  const manifest = [];
  let bytes = 0;
  async function copyTree(src, dst, prefix) {
    await mkdir(dst, {recursive: true});
    for (const item of await readdir(src, {withFileTypes: true})) {
      if (forbidden(item.name)) throw new Error('Arquivo oculto ou sensível na fonte; remova-o do pacote de conteúdo.');
      const source = path.join(src, item.name), output = path.join(dst, item.name);
      if (item.isSymbolicLink() || (!item.isFile() && !item.isDirectory())) throw new Error('Somente arquivos e diretórios regulares são aceitos.');
      if (item.isDirectory()) { await copyTree(source, output, prefix + item.name + '/'); continue; }
      const stat = await lstat(source);
      bytes += stat.size;
      if (stat.size > 50 * 1024 * 1024 || bytes > 150 * 1024 * 1024) throw new Error('Pacote excede o limite local de tamanho.');
      const data = await readFile(source);
      await writeFile(output, data, {flag: 'wx'});
      manifest.push({path: prefix + item.name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')});
    }
  }
  try {
    await mkdir(functionDir, {recursive: true});
    await copyTree(roots[0], path.join(functionDir, 'offer'), 'offer/');
    await copyTree(roots[1], path.join(functionDir, 'institution'), 'institution/');
    // Anonymous .html aliases must show the same institution, with no private fallback.
    const anonymous = await readFile(path.join(functionDir, 'institution/index.html'));
    for (const item of [...manifest]) {
      if (!item.path.startsWith('offer/') || !item.path.toLowerCase().endsWith('.html')) continue;
      const relative = item.path.slice('offer/'.length);
      const output = path.join(functionDir, 'institution', relative);
      try {await lstat(output);continue;} catch(e) {if(e.code !== 'ENOENT')throw e;}
      await mkdir(path.dirname(output), {recursive:true});
      await writeFile(output, anonymous, {flag:'wx'});
      bytes += anonymous.length;
      if (bytes > 150 * 1024 * 1024) throw new Error('Pacote excede o limite local de tamanho.');
      manifest.push({path:'institution/'+relative,bytes:anonymous.length,sha256:createHash('sha256').update(anonymous).digest('hex'),source:'institution/index.html'});
    }
    if (entry !== 'index.html') {
      const data = await readFile(entryPath);
      bytes += data.length;
      if (bytes > 150 * 1024 * 1024) throw new Error('Pacote excede o limite local de tamanho.');
      await writeFile(path.join(functionDir, 'offer/index.html'), data, {flag: 'wx'});
      manifest.push({path: 'offer/index.html', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), source: entry});
    }
    await copyFile(path.join(KIT, 'gate.mjs'), path.join(functionDir, 'gate.mjs'), constants.COPYFILE_EXCL);
    await copyFile(path.join(KIT, 'function-config.json'), path.join(functionDir, '.vc-config.json'), constants.COPYFILE_EXCL);
    const runtime = {origin: origin.origin, campaign: config.campanha, routes, redirects};
    await writeFile(path.join(functionDir, 'runtime.json'), JSON.stringify(runtime, null, 2) + '\n');
    const wrapper = `import {createGate} from './gate.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isIP} from 'node:net';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const CONFIG=JSON.parse(readFileSync(path.join(ROOT,'runtime.json'),'utf8'));
export function createVercelHandler({env=process.env,root=ROOT,now}={}) {
 let initialized;
 return async (req,res)=>{
  res.setHeader('X-Robots-Tag','noindex');
  try {
   if (req.url?.split('?')[0]==='/white') {
    const u=new URL(req.url,CONFIG.origin); u.searchParams.delete('access_token');
    res.writeHead(308,{'Location':'/white/'+u.search,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});res.end();return;
   }
   initialized??=createGate({
    secret:env.XPROTOCOL_GATE_SECRET,origin:env.XPROTOCOL_ORIGIN??CONFIG.origin,
    campaigns:new Set((env.XPROTOCOL_CAMPAIGNS??CONFIG.campaign).split(',').map(s=>s.trim()).filter(Boolean)),
    sharedAccessHash:env.OFFER_SHARED_ACCESS_SHA256,sharedCampaign:env.OFFER_SHARED_CAMPAIGN,
    rememberVisitors:true,sessionTTL:365*86400,offerDir:path.join(root,'offer'),institutionDir:path.join(root,'institution'),
    offerSPARoutes:CONFIG.routes,offerSPA:false,publicPathPrefix:'/white/',offerRedirects:CONFIG.redirects,
    ...(now?{now}:{}),
    clientIP(req){if(env.VERCEL!=='1')return req.socket.remoteAddress;const ip=req.headers['x-vercel-forwarded-for'];return typeof ip==='string'&&isIP(ip)?ip:'';}
   });
   return await (await initialized)(req,res);
  } catch {
   res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store','Vercel-CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
   res.end('Conteúdo indisponível; tente novamente ou contate o suporte.');
  }
 };
}
export default createVercelHandler();
`;
    await writeFile(path.join(functionDir, 'index.mjs'), wrapper);
    await writeFile(path.join(staging, 'output/config.json'), JSON.stringify({version:3,routes:[{src:'/(.*)',dest:'/access'}]},null,2)+'\n');
    await writeFile(path.join(staging,'package.json'), JSON.stringify({private:true,type:'module',scripts:{build:'node build.mjs'}},null,2)+'\n');
    await writeFile(path.join(staging,'build.mjs'), `import {mkdir,cp,rm} from 'node:fs/promises';\nconst root=new URL('.',import.meta.url);\nawait mkdir(new URL('.vercel/',root),{recursive:true});\nawait rm(new URL('.vercel/output/',root),{recursive:true,force:true});\nawait cp(new URL('output/',root),new URL('.vercel/output/',root),{recursive:true});\nconsole.log('Pacote preparado; conteúdo privado somente na função.');\n`);
    await writeFile(path.join(staging,'MANIFESTO.json'),JSON.stringify({origin:origin.origin,campaign:config.campanha,project:config.projeto_vercel,files:manifest},null,2)+'\n');
    await rename(staging,target);
    return {destination:target,origin:origin.origin,project:config.projeto_vercel,files:manifest.length,bytes};
  } catch(e) {await rm(staging,{recursive:true,force:true});throw e;}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const config = args[args.indexOf('--config') + 1], dest = args[args.indexOf('--dest') + 1];
  if (!args.includes('--config') || !args.includes('--dest') || !config || !dest) {
    console.error('Uso: node aplicar.mjs --config oferta.json --dest /pasta/nova');process.exitCode=2;
  } else {
    try { console.log(JSON.stringify(await applyOffer(config,dest))); }
    catch(e) { console.error(e.message);process.exitCode=1; }
  }
}
