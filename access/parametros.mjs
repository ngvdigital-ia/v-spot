#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const UTM = 'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}';
export function credential(input) {
  if (typeof input !== 'string') throw new Error('Cole a chave ou os parâmetros da oferta.');
  let value=input.trim();
  const looksLikeURL=/^https?:\/\//i.test(value);
  if (looksLikeURL || value.includes('&') || value.startsWith('?') || value.startsWith('access_token=')) {
    const query=looksLikeURL ? new URL(value).search : value.replace(/^\?/,'');
    const params=new URLSearchParams(query);
    const named=params.getAll('access_token');
    const bare=[...params].filter(([key,val])=>val===''&&/^[A-Za-z0-9_.-]{32,2048}$/.test(key)).map(([key])=>key);
    if (named.length+bare.length!==1) throw new Error('Há chave ausente ou duplicada; cole uma única chave.');
    value=named[0]??bare[0];
  }
  if (!/^[A-Za-z0-9_.-]{32,2048}$/.test(value)) throw new Error('Chave inválida; confira o texto copiado.');
  return value;
}
export function parameters(key) {
  if (typeof key !== 'string' || key.length < 32 || key.length > 2048 || /[\u0000-\u0020]/.test(key)) throw new Error('Chave ausente ou inválida.');
  return UTM + '&access_token=' + encodeURIComponent(key);
}
export function copyParameters(key) {
  const value = parameters(key);
  const options = process.platform === 'darwin' ? [['pbcopy',[]]] : process.platform === 'win32' ? [['clip.exe',[]]] : [['wl-copy',[]],['xclip',['-selection','clipboard']]];
  for (const [command,args] of options) {
    const result = spawnSync(command,args,{input:value,stdio:['pipe','ignore','ignore'],timeout:5000});
    if (result.error?.code === 'ENOENT') continue;
    if (!result.error && result.status === 0) return;
    throw new Error('Não foi possível copiar os parâmetros; a chave não foi impressa.');
  }
  throw new Error('Instale uma ferramenta de clipboard compatível; a chave não foi impressa.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--chave-stdin')) {console.error('Uso: fornecer a chave por stdin para node parametros.mjs --chave-stdin. Saída somente no clipboard.');process.exitCode=2;}
  else {
    let input='';
    for await(const chunk of process.stdin){input+=chunk;if(input.length>4096){console.error('Entrada muito longa.');process.exit(2);}}
    try {copyParameters(credential(input));console.log('UTMs e access_token copiados. A mesma string pode ser usada nas ofertas habilitadas.');}
    catch(e){console.error(e.message);process.exitCode=1;}
  }
}
