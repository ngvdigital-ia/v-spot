import { createServer } from 'node:http';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COOKIE = '__Host-xprotocol_access';
const MAX_ENTRY_TTL = 7 * 86400;
const SESSION_TTL = 1800;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
  '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t',
};

function checkSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32)
    throw new Error('Segredo ausente ou curto; forneça XPROTOCOL_GATE_SECRET aleatório de pelo menos 32 bytes.');
}
function originValue(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Origem inválida; use somente https://seu-dominio, sem caminho, credenciais ou parâmetros.');
  return url.origin;
}
function encode(secret, payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return data + '.' + signature;
}
export function issueEntry({ secret, origin, campaign, ttl = 86400, now = Date.now() }) {
  checkSecret(secret);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(campaign ?? ''))
    throw new Error('Campanha inválida; use 1–80 letras, números, hífen ou sublinhado.');
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > MAX_ENTRY_TTL)
    throw new Error('Validade inválida; informe segundos inteiros entre 60 e 604800.');
  const iat = Math.floor(now / 1000);
  return encode(secret, { v: 1, type: 'entry', aud: originValue(origin), campaign, iat, exp: iat + ttl });
}
// A campaign link is a revocable bearer credential, not proof of an ad click or visitor identity.
export function issueCampaignEntry({ secret, origin, campaign }) {
  checkSecret(secret);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(campaign ?? ''))
    throw new Error('Campanha inválida; use 1–80 letras, números, hífen ou sublinhado.');
  return encode(secret, { v: 1, type: 'campaign', aud: originValue(origin), campaign });
}
function decode(secret, raw, type, origin, campaigns, now, sessionTTL = SESSION_TTL) {
  if (typeof raw !== 'string' || raw.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const [data, signature] = raw.split('.');
    const received = Buffer.from(signature, 'base64url');
    if (received.toString('base64url') !== signature) return null;
    const expected = createHmac('sha256', secret).update(data).digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    if (Buffer.from(data, 'base64url').toString('base64url') !== data) return null;
    const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (p?.v !== 1 || p.type !== type || p.aud !== origin ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(p.campaign ?? '') || !campaigns.has(p.campaign)) return null;
    // kiss: removing the campaign from the deployed allowlist revokes its link AND remembered cookies.
    if (type === 'campaign') return p.iat === undefined && p.exp === undefined ? p : null;
    const seconds = Math.floor(now / 1000);
    const maxTTL = type === 'entry' ? MAX_ENTRY_TTL : sessionTTL;
    if (!Number.isInteger(p.iat) || !Number.isInteger(p.exp) ||
        p.iat > seconds || p.exp <= seconds || p.exp <= p.iat || p.exp - p.iat > maxTTL) return null;
    return p;
  } catch { return null; }
}
function cookieValue(header) {
  if (typeof header !== 'string' || header.length > 8192) return null;
  const matches = header.split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE + '='));
  return matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : null;
}
function securityHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
}
function plain(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
function normalizeIP(value) {
  if (typeof value !== 'string') return '';
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) return value.slice(7);
  return value;
}
function makeDenyList(cidrs) {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [ip, prefix, extra] = cidr.split('/');
    const type = isIP(ip);
    const bits = type === 4 ? 32 : 128;
    if (!type || extra !== undefined || (prefix !== undefined && !/^\d+$/.test(prefix)) ||
        (prefix !== undefined && Number(prefix) > bits))
      throw new Error('CIDR inválido na lista de bloqueio; forneça redes IPv4/IPv6 com prefixo válido.');
    list.addSubnet(ip, prefix === undefined ? bits : Number(prefix), type === 4 ? 'ipv4' : 'ipv6');
  }
  return list;
}
async function fileFor(root, pathname, allowIndexFallback) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.split('/').some(s => s.startsWith('.'))) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidates = [relative];
  if (!path.posix.extname(relative)) candidates.push(relative + '.html', relative + '/index.html');
  // kiss: SPA fallback is explicit; missing assets never fall back to HTML.
  // Protected bundles stay in a separate tree; filenames are never authorization.
  if (allowIndexFallback && !path.posix.extname(relative)) candidates.push('index.html');
  for (const candidate of candidates) {
    try {
      const actual = await realpath(path.resolve(root, candidate));
      if (!actual.startsWith(root + path.sep)) continue;
      const info = await stat(actual);
      if (info.isFile()) return { actual, size: info.size };
    } catch (e) {
      if (!['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(e.code)) throw e;
    }
  }
  return null;
}
function byteRange(header, size) {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || size === 0 || (!match[1] && !match[2])) return false;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

/** Local prototype. Both directories must contain only public, reviewed build output. */
export async function createGate({
  secret, origin, campaigns, offerDir, institutionDir, now = Date.now,
  denyCIDRs = [], rateLimit = 300, windowMs = 60000, maxBuckets = 10000,
  clientIP = req => req.socket.remoteAddress, audit = () => {},
  offerSPARoutes = [], offerSPA = false, protectedJSONPaths = [], publicJSONPaths = [],
  sessionTTL = SESSION_TTL, rememberVisitors = false,
  publicPathPrefix, sharedAccessHash, sharedCampaign, offerRedirects = [],
}) {
  checkSecret(secret);
  origin = originValue(origin);
  if (!(campaigns instanceof Set) || (!rememberVisitors && campaigns.size === 0) ||
      [...campaigns].some(c => !/^[a-zA-Z0-9_-]{1,80}$/.test(c)))
    throw new Error('Campanhas ausentes ou inválidas; configure uma lista explícita de campanhas ativas.');
  if (![rateLimit, windowMs, maxBuckets].every(n => Number.isInteger(n) && n > 0))
    throw new Error('Limites inválidos; forneça inteiros positivos para taxa, janela e capacidade.');
  if (typeof offerSPA !== 'boolean')
    throw new Error('Modo SPA inválido; configure offerSPA como booleano.');
  if (typeof rememberVisitors !== 'boolean' || !Number.isInteger(sessionTTL) || sessionTTL < 60 || sessionTTL > 400 * 86400)
    throw new Error('Persistência inválida; use rememberVisitors booleano e sessionTTL entre 60 e 34560000 segundos.');
  for (const paths of [offerSPARoutes, protectedJSONPaths, publicJSONPaths]) {
    if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !p.startsWith('/') ||
        p.includes('..') || /[?#\\\u0000-\u001f]/.test(p)))
      throw new Error('Rotas inválidas; configure caminhos absolutos canônicos sem query, fragmento ou traversal.');
  }
  if (publicPathPrefix !== undefined && !/^\/[a-zA-Z0-9_-]+\/$/.test(publicPathPrefix))
    throw new Error('Rota pública inválida; forneça um prefixo canônico terminado em barra.');
  const sharedCampaignId = sharedCampaign ?? [...campaigns].sort()[0];
  if (sharedAccessHash !== undefined &&
      (typeof sharedAccessHash !== 'string' || !/^[a-f0-9]{64}$/.test(sharedAccessHash) ||
       !campaigns.has(sharedCampaignId)))
    throw new Error('Acesso comum inválido; configure SHA-256 hexadecimal e uma campanha ativa.');
  if (sharedCampaign !== undefined && sharedAccessHash === undefined)
    throw new Error('Campanha comum sem configuração de acesso comum.');
  const sharedDigest = sharedAccessHash === undefined ? null : Buffer.from(sharedAccessHash, 'hex');
  function sharedEntry(raw, timestamp) {
    if (!sharedDigest || typeof raw !== 'string' || raw.length < 32 || raw.length > 2048) return null;
    const digest = createHash('sha256').update(raw).digest();
    return timingSafeEqual(digest, sharedDigest)
      ? { campaign: sharedCampaignId, shared: sharedAccessHash, exp: Math.floor(timestamp / 1000) + sessionTTL } : null;
  }
  if (!Array.isArray(offerRedirects)) throw new Error('Redirecionamentos inválidos.');
  const redirectRules = new Map();
  for (const rule of offerRedirects) {
    if (!rule || typeof rule.source !== 'string' || typeof rule.destination !== 'string' ||
        !rule.source.startsWith('/') || !rule.destination.startsWith('/') ||
        rule.source.startsWith('//') || rule.destination.startsWith('//') ||
        /[?#\\\u0000-\u0020]/.test(rule.source + rule.destination) ||
        rule.source.includes('..') || rule.destination.includes('..') ||
        rule.source === rule.destination || redirectRules.has(rule.source) ||
        (rule.permanent !== undefined && typeof rule.permanent !== 'boolean'))
      throw new Error('Redirecionamento inválido; use caminhos locais distintos e únicos.');
    redirectRules.set(rule.source, { destination: rule.destination, status: rule.permanent ? 308 : 307 });
  }
  const spaRoutes = new Set(offerSPARoutes);
  const privateJSON = new Set(protectedJSONPaths);
  const jsonPaths = new Set([...protectedJSONPaths, ...publicJSONPaths]);
  const offerRoot = await realpath(offerDir);
  const institutionRoot = await realpath(institutionDir);
  if (offerRoot === institutionRoot || offerRoot.startsWith(institutionRoot + path.sep) ||
      institutionRoot.startsWith(offerRoot + path.sep))
    throw new Error('Diretórios sobrepostos; separe oferta e institucional em árvores independentes.');
  for (const root of [offerRoot, institutionRoot]) {
    const index = await fileFor(root, '/', false);
    if (!index) throw new Error('Conteúdo incompleto; cada diretório precisa de index.html legível.');
  }
  const deny = makeDenyList(denyCIDRs);
  function setSessionCookie(res, campaign, iat, exp, sharedVersion) {
    const session = encode(secret, { v: 1, type: 'session', aud: origin, campaign, iat, exp, ...(sharedVersion ? { shared: sharedVersion } : {}) });
    res.setHeader('Set-Cookie', COOKIE + '=' + session + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + (exp - iat) + '; Expires=' + new Date(exp * 1000).toUTCString());
  }
  const buckets = new Map();
  // kiss: limits are per process, bounded to maxBuckets. Multi-instance needs a shared store.
  function permitted(ip, timestamp) {
    let bucket = buckets.get(ip);
    if (!bucket || bucket.reset <= timestamp) {
      if (buckets.size >= maxBuckets) {
        for (const [key, value] of buckets) if (value.reset <= timestamp) buckets.delete(key);
        if (buckets.size >= maxBuckets) return false;
      }
      bucket = { count: 0, reset: timestamp + windowMs };
      buckets.set(ip, bucket);
    }
    return ++bucket.count <= rateLimit;
  }
  return async function gate(req, res) {
    securityHeaders(res);
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD'); plain(res, 405, 'Método não permitido.'); return;
      }
      if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.url.length > 8192) {
        plain(res, 400, 'URL inválida ou longa; use um caminho relativo com até 8192 caracteres.'); return;
      }
      const url = new URL(req.url, origin);
      const ip = normalizeIP(clientIP(req));
      if (!isIP(ip)) { plain(res, 503, 'Origem indisponível; tente novamente.'); return; }
      const timestamp = now();
      if (!permitted(ip, timestamp)) {
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        audit({ decision: 'limited', reason: 'rate' });
        plain(res, 429, 'Muitas requisições; aguarde e tente novamente.'); return;
      }
      const blockedIP = deny.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
      const tokens = url.searchParams.getAll('access_token');
      const entry = !blockedIP && tokens.length === 1
        ? decode(secret, tokens[0], 'entry', origin, campaigns, timestamp) ||
          (rememberVisitors ? decode(secret, tokens[0], 'campaign', origin, campaigns, timestamp) : null) ||
          sharedEntry(tokens[0], timestamp) : null;
      if (entry) {
        const iat = Math.floor(timestamp / 1000);
        // Once a visit is authorized, remembering it is independent of the initial link's expiry.
        const exp = rememberVisitors ? iat + sessionTTL : Math.min(iat + sessionTTL, entry.exp);
        setSessionCookie(res, entry.campaign, iat, exp, entry.shared);
        url.searchParams.delete('access_token');
        res.setHeader('Location', url.pathname + url.search);
        audit({ decision: 'session', reason: 'valid_entry', campaign: entry.campaign });
        res.writeHead(303); res.end(); return;
      }
      // A separately valid remembered cookie survives an expired link or lost/mangled ad parameters.
      const decodedSession = !blockedIP && (tokens.length === 0 || rememberVisitors)
        ? decode(secret, cookieValue(req.headers.cookie), 'session', origin, campaigns, timestamp, sessionTTL) : null;
      const session = decodedSession && (!Object.hasOwn(decodedSession, 'shared') ||
        decodedSession.shared === sharedAccessHash) ? decodedSession : null;
      const authorized = Boolean(session);
      const seconds = Math.floor(timestamp / 1000);
      if (rememberVisitors && session && seconds > session.iat)
        setSessionCookie(res, session.campaign, seconds, seconds + sessionTTL, session.shared);
      audit({
        decision: authorized ? 'offer' : 'institution',
        reason: blockedIP ? 'listed_network' : authorized ? 'valid_session' : tokens.length ? 'invalid_entry' : 'no_session',
        ...(authorized ? { campaign: session.campaign } : {}),
      });
      if (!authorized && privateJSON.has(url.pathname)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'access_required' })); return;
      }
      // kiss: one explicit public subtree; every other path stays behind the same authorization.
      const publicPath = publicPathPrefix && url.pathname.startsWith(publicPathPrefix);
      const useOffer = authorized && !publicPath;
      const routeRedirect = useOffer && redirectRules.get(url.pathname);
      if (routeRedirect) {
        res.setHeader('Location', routeRedirect.destination + url.search);
        res.writeHead(routeRedirect.status); res.end(); return;
      }
      const allowIndexFallback = !url.pathname.startsWith('/api/') &&
        (!publicPath && (!authorized || offerSPA || spaRoutes.has(url.pathname)));
      const file = await fileFor(useOffer ? offerRoot : institutionRoot, url.pathname, allowIndexFallback);
      if (!file) { plain(res, 404, 'Arquivo não encontrado.'); return; }
      res.setHeader('Content-Type', jsonPaths.has(url.pathname) ? 'application/json; charset=utf-8' :
        MIME[path.extname(file.actual).toLowerCase()] ?? 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');
      const range = byteRange(req.headers.range, file.size);
      if (range === false) {
        res.setHeader('Content-Range', 'bytes */' + file.size);
        plain(res, 416, 'Intervalo inválido; solicite um único intervalo de bytes existente.'); return;
      }
      if (range) res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + file.size);
      res.setHeader('Content-Length', range ? range.end - range.start + 1 : file.size);
      res.statusCode = range ? 206 : 200;
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(file.actual, range || {});
      res.on('close', () => stream.destroy());
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch {
      audit({ decision: 'error', reason: 'internal' });
      if (!res.headersSent) {
        res.removeHeader('Content-Length');
        plain(res, 500, 'Conteúdo indisponível; tente novamente ou contate o suporte.');
      } else res.destroy();
    }
  };
}

async function main() {
  const [command = 'serve', campaign, ttlRaw] = process.argv.slice(2);
  const secret = process.env.XPROTOCOL_GATE_SECRET;
  const origin = process.env.XPROTOCOL_ORIGIN;
  if (command === 'issue-campaign') {
    const active = new Set((process.env.XPROTOCOL_CAMPAIGNS ?? '').split(',').map(s => s.trim()).filter(Boolean));
    if (!active.has(campaign)) throw new Error('Campanha inativa; use uma campanha de XPROTOCOL_CAMPAIGNS antes de emitir o link.');
    const url = new URL(origin);
    url.searchParams.set('access_token', issueCampaignEntry({ secret, origin, campaign }));
    // Intentional operator delivery only. Do not put campaign links into request logs or reports.
    process.stdout.write(url.href + '\n');
    return;
  }
  if (command === 'issue') {
    const token = issueEntry({ secret, origin, campaign, ttl: ttlRaw === undefined ? 86400 : Number(ttlRaw) });
    const url = new URL(origin); url.searchParams.set('access_token', token);
    // Intentional delivery to the operator, never a request log. Treat the link as a credential.
    process.stdout.write(url.href + '\n');
    return;
  }
  if (command !== 'serve') throw new Error('Comando desconhecido; use serve, issue CAMPANHA [SEGUNDOS] ou issue-campaign CAMPANHA.');
  const handler = await createGate({
    secret, origin,
    campaigns: new Set((process.env.XPROTOCOL_CAMPAIGNS ?? '').split(',').map(s => s.trim()).filter(Boolean)),
    offerDir: process.env.XPROTOCOL_OFFER_DIR,
    institutionDir: process.env.XPROTOCOL_INSTITUTION_DIR,
    denyCIDRs: (process.env.XPROTOCOL_DENY_CIDRS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    // Standalone uses socket IP. Behind Caddy, integrate with Express req.ip after validating trust proxy.
    audit: event => process.stdout.write(JSON.stringify(event) + '\n'),
  });
  const port = Number(process.env.PORT ?? '5088');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Porta inválida; use um inteiro entre 1 e 65535.');
  const server = createServer({ maxHeaderSize: 16384, requestTimeout: 15000, headersTimeout: 10000 }, handler);
  server.on('error', () => { console.error('Servidor indisponível; confira se a porta está livre e se o ambiente permite escuta local.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log('Protótipo em 127.0.0.1:' + port + '; acesso real exige HTTPS e revisão da integração.'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof TypeError ? 'Configuração incompleta; confira origem e diretórios no briefing.' : error.message); process.exitCode = 1; });
}
