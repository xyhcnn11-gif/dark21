// 自由桌 V6 —— socket.io 房间服务器
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const fs = require('fs');
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 2e6,
  /* v150：心跳调宽一点，手机/弱网切换（4G↔Wi-Fi）时不至于被立刻踢掉 */
  pingInterval: 20000,
  pingTimeout: 30000,
  perMessageDeflate: false,
  transports: ['websocket', 'polling'],
});

/* v150：单个连接里的意外异常不能把整个服务带走（否则所有人一起卡掉） */
process.on('uncaughtException', (e) => {
  console.error('[uncaught] ' + ((e && e.stack) || e));
});
process.on('unhandledRejection', (e) => {
  console.error('[unhandled] ' + ((e && e.stack) || e));
});

/* 荒岛 21 天：独立命名空间 /island（三人合作生存） */
try {
  require('./island.js').attach(io);
} catch (e) {
  console.error('[island] 挂载失败：', e && e.message);
}

// 外部访问日志（排查"朋友/手机能不能进来"）：只记非本机来源
const ACCESS_LOG = path.join(__dirname, 'shots', 'access.log');
app.use((req, res, next) => {
  try {
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip)) {
      fs.appendFile(ACCESS_LOG, [new Date().toISOString(), ip, req.method, req.originalUrl, String(req.headers['user-agent'] || '').slice(0, 70)].join(' | ') + '\n', () => {});
    }
  } catch (_) { /* 日志失败不影响服务 */ }
  next();
});

/* v238：gzip 压缩（没装 compression 包时自动跳过，不影响本地开发） */
let compression = null;
try { compression = require('compression'); } catch (e) { compression = null; }
if (compression) {
  app.use(compression({
    threshold: 700,
    filter(req, res) {
      const p = String(req.path || '');
      if (p === '/') return true;
      return /\.(js|css|json|html|svg|txt|map|md)$/i.test(p);
    },
  }));
}

/* v238：带 ?v= 的静态资源一年强缓存（版本号变了 URL 就变，不会读到旧文件） */
app.use((req, res, next) => {
  const p = String(req.path || '');
  const hasV = /[?&]v=\d+/.test(String(req.originalUrl || ''));
  if (hasV && /\.(js|css)$/i.test(p)) {
    res.locals.vAsset = true;
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (/\.(png|jpg|jpeg|webp|gif|wav|mp3|ico|svg)$/i.test(p) && !/[\\/]heroes[\\/]/.test(p)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  next();
});

/* 武将图：一年强缓存（浏览器存本地，第二次进房间不再下载）；其它资源每次都问一下（改了立刻生效） */
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders(res, filePath) {
    if (res.locals && res.locals.vAsset) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/factions\.json$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/[\\/]heroes[\\/]/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

const rooms = new Map();
const MAX_PLAYERS = 4;

/* 前端上传武将图走 JSON（dataURL），给足体积上限 */
app.use(express.json({ limit: '24mb' }));

// 当前公网地址（由 watchdog.cjs 维护 public-url.txt）、虚拟网固定地址（lan-ip.txt）、以及本机 IPv6 直连地址
// 本机 IPv6 是可全局路由的地址（免安装、免账号、不限速），朋友用手机流量/宽带 IPv6 直接就能开
function pickPublicV6() {
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    const cands = [];
    for (const name of Object.keys(nets)) {
      for (const ni of nets[name] || []) {
        if (ni.family !== 'IPv6' && ni.family !== 6) continue;
        const a = String(ni.address || '');
        if (!a || a === '::1') continue;
        if (/^fe80/i.test(a) || /^f[cd]/i.test(a)) continue; // 链路本地/唯一本地地址
        cands.push({ addr: a, name });
      }
    }
    if (!cands.length) return '';
    // 优先 DHCP 下发的稳定地址（不含随机隐私后缀），其次按顺序取第一个
    cands.sort((x, y) => (x.addr.split(':').length) - (y.addr.split(':').length));
    return cands[0].addr;
  } catch (_) { return ''; }
}

app.post('/api/diag', (req, res) => {
  try {
    const line = JSON.stringify(Object.assign({
      t: new Date().toISOString(),
      ip: (req.socket && req.socket.remoteAddress) || ''
    }, req.body || {}));
    fs.appendFileSync(path.join(__dirname, 'shots', 'diag.log'), line + '\n');
  } catch (e) { /* ignore */ }
  res.json({ ok: true });
});

app.get('/api/public-url', (req, res) => {
  const fs = require('fs');
  const readOne = (f) => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8').trim().split(/\s+/)[0]; } catch (_) { return ''; } };
  const url = readOne('public-url.txt');
  const lanIp = readOne('lan-ip.txt');
  const lan = lanIp ? 'http://' + lanIp + ':3010' : '';
  const v6 = pickPublicV6();
  const v6url = v6 ? 'http://[' + v6 + ']:3010' : '';
  res.json({ url, lan, v6, v6url, ts: Date.now() });
});

// 玩法 → 人数上限（按人数限死：2 单挑 / 3 斗地主 / 4 排位）
const GAME_CAPS = { free: 4, duel: 2, landlord: 3, ladder: 4, match: 3 };
const NEED_NAME = { duel: '单挑', landlord: '斗地主', match: '比赛', ladder: '排位 2v2' };
const GAME_NAMES = { free: '自由', duel: '单挑', landlord: '斗地主', ladder: '排位', match: '比赛' };
const EQUIP_SLOTS = ['weapon', 'armor', 'plus', 'minus'];
const EQUIP_NAMES = { weapon: '武器', armor: '防具', plus: '加一', minus: '减一' };
const SPECIAL_MAX = 6;

// 武将池：直接读 public/heroes/thumbs 里的缩略图（文件名=武将 id，图上有名字，前端不再写名字）
const HERO_THUMB_DIR = path.join(__dirname, 'public', 'heroes', 'thumbs');
function loadHeroPool() {
  try {
    const fs = require('fs');
    const list = fs.readdirSync(HERO_THUMB_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => f.replace(/\.(jpe?g|png|webp)$/i, ''))
      .sort();
    return list.length ? list : ['placeholder'];
  } catch (e) {
    console.warn('[heroes] 读取武将图失败：', e.message);
    return ['placeholder'];
  }
}
let HERO_POOL = loadHeroPool();
console.log('[heroes] 武将数量：', HERO_POOL.length);

/* ============ 武将管理（仅房主本机可用；联网的朋友拿不到） ============ */
const HERO_DIR = path.join(__dirname, 'public', 'heroes');
const HERO_THUMBS = path.join(HERO_DIR, 'thumbs');
const FACTION_FILE = path.join(HERO_DIR, 'factions.json');
const HERO_TRASH = path.join(HERO_DIR, '_trash');
const FACTION_KEYS = ['wei', 'shu', 'wu', 'qun', 'shen'];

function readFactions() {
  try { return JSON.parse(fs.readFileSync(FACTION_FILE, 'utf8')) || {}; } catch (e) { return {}; }
}
function writeFactions(obj) {
  try { fs.writeFileSync(FACTION_FILE, JSON.stringify(obj), 'utf8'); return true; } catch (e) { return false; }
}
function refreshHeroPool() {
  HERO_POOL = loadHeroPool();
  return HERO_POOL;
}
/* 只有"你真坐在这一台电脑前"才算管理员：来源必须是本机回环地址或本机自己的网卡地址
   （这样从 26.x 的 Radmin 虚拟地址 / 局域网 IP 打开也算本机；别人从他那台电脑进来，源地址不是本机，就不是管理员） */
function ownAddresses() {
  const set = new Set(['127.0.0.1', '::1']);
  try {
    const os = require('os');
    const ifs = os.networkInterfaces();
    Object.keys(ifs).forEach((k) => (ifs[k] || []).forEach((a) => {
      if (!a || !a.address) return;
      set.add(a.address);
      set.add(a.address.replace(/^::ffff:/, ''));
    }));
  } catch (e) { /* 拿不到网卡就用回环 */ }
  return set;
}
function isLocalAdmin(req) {
  let ip = (req.socket && req.socket.remoteAddress) || '';
  ip = ip.replace(/^::ffff:/, '');
  if (!ownAddresses().has(ip)) return false;
  const host = String(req.headers.host || '');
  if (/trycloudflare\.com|loca\.lt|ngrok|cpolar|natapp/i.test(host)) return false;
  return true;
}
function adminOnly(req, res) {
  if (isLocalAdmin(req)) return true;
  res.status(403).json({ ok: false, err: '只有房主本机可以改武将' });
  return false;
}
/* 把武将图（原图 + 缩略图）挪进回收站，不直接删，随时能捞回来 */
function trashHero(id) {
  fs.mkdirSync(HERO_TRASH, { recursive: true });
  const stamp = Date.now();
  for (const dir of [HERO_DIR, HERO_THUMBS]) {
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      const p = path.join(dir, id + ext);
      if (fs.existsSync(p)) {
        try { fs.renameSync(p, path.join(HERO_TRASH, id + '__' + stamp + ext)); } catch (e) { /* 挪不动就算了 */ }
      }
    }
  }
}

/* 让前端知道自己跑的是不是最新版：改完代码这里变号，页面会自动提示刷新 */
/* ===== 背景音乐同步：服务器记住“现在放哪一首、放到第几秒”，所有人跟着走 ===== */
function musicDirPath() { return path.join(__dirname, 'public', 'music'); }
function musicListFiles() {
  let out = [];
  try {
    out = fs.readdirSync(musicDirPath())
      .filter((f) => /\.(mp3|ogg|oga|m4a|aac|wav|flac|opus)$/i.test(f))
      .map((f) => {
        let size = 0;
        try { size = fs.statSync(path.join(musicDirPath(), f)).size; } catch (e) {}
        return { name: f.replace(/\.[^.]+$/, ''), file: 'music/' + encodeURIComponent(f), size };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  } catch (e) { out = []; }
  return out;
}
const MUSIC = { track: null, playing: false, pos: 0, at: Date.now(), by: '' };
function musicNow() {
  let pos = MUSIC.pos || 0;
  if (MUSIC.playing && MUSIC.at) pos += (Date.now() - MUSIC.at) / 1000;
  return { track: MUSIC.track, playing: !!MUSIC.playing, pos: Math.max(0, pos), at: Date.now(), by: MUSIC.by || '' };
}
function musicBroadcast() { try { io.emit('music:state', musicNow()); } catch (e) {} }

/* 背景音乐：扫描 public/music 目录（双击左上角「自由桌」里的歌单就是它） */
app.get('/api/music/list', (req, res) => {
  const dir = path.join(__dirname, 'public', 'music');
  let list = [];
  try {
    list = fs.readdirSync(dir)
      .filter((f) => /\.(mp3|ogg|oga|m4a|aac|wav|flac|opus)$/i.test(f))
      .map((f) => {
        let size = 0;
        try { size = fs.statSync(path.join(dir, f)).size; } catch (e) { /* ignore */ }
        return { name: f.replace(/\.[^.]+$/, ''), file: 'music/' + encodeURIComponent(f), size };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  } catch (e) { /* 目录还没建就先给空列表 */ }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ list });
});

/* 这个房号属于哪个模式：island / cards / null */
app.get('/api/room-mode', (req, res) => {
  const code = String((req.query && req.query.code) || '').trim().toUpperCase();
  if (!code) return res.json({ code: '', mode: null });
  let isl = false;
  try { isl = require('./island.js').hasRoom(code); } catch (e) { isl = false; }
  if (isl) return res.json({ code, mode: 'island' });
  const r = rooms.get(code);
  if (r) return res.json({ code, mode: 'cards', tableMode: r.mode || 'sanguosha' });
  return res.json({ code, mode: null });
});

app.get('/api/build', (req, res) => {
  let v = '';
  try {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const m = /app\.js\?v=(\d+)/.exec(html);
    if (m) v = m[1];
  } catch (e) { /* 读不到就返回空 */ }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ v });
});

/* 前端进房间时用它预加载全部缩略图并显示进度；顺便告诉它自己是不是管理员 */
const POOL_FILE = path.join(__dirname, 'state', 'hero-pool.json');
function readPool() {
  try { const j = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8')); return (j.list || []).filter((id) => HERO_POOL.includes(id)); }
  catch (e) { return []; }
}
function writePoolFile(list) {
  try { fs.mkdirSync(path.dirname(POOL_FILE), { recursive: true }); fs.writeFileSync(POOL_FILE, JSON.stringify({ list }, null, 1)); } catch (e) {}
}
app.get('/api/heroes/pool', (req, res) => { res.json({ list: readPool() }); });

const RECO_FILE = path.join(__dirname, 'state', 'hero-pool-recommend.json');
function readReco() {
  try { const j = JSON.parse(fs.readFileSync(RECO_FILE, 'utf8')); return (j.list || []).filter((id) => HERO_POOL.includes(id)); }
  catch (e) { return []; }
}
function writeRecoFile(list) {
  try { fs.mkdirSync(path.dirname(RECO_FILE), { recursive: true }); fs.writeFileSync(RECO_FILE, JSON.stringify({ list }, null, 1)); } catch (e) {}
}
app.get('/api/heroes/reco', (req, res) => { res.json({ list: readReco() }); });
app.post('/api/heroes/reco', (req, res) => {
  const list = Array.isArray(req.body && req.body.list) ? req.body.list.filter((id) => HERO_POOL.includes(id)) : [];
  writeRecoFile(list);
  res.json({ ok: true, list });
});
app.post('/api/heroes/pool', (req, res) => {
  const list = Array.isArray(req.body && req.body.list) ? req.body.list.filter((id) => HERO_POOL.includes(id)) : [];
  writePoolFile(list);
  res.json({ ok: true, list });
});

app.get('/api/heroes', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ heroes: HERO_POOL, factions: readFactions(), admin: isLocalAdmin(req) });
});

app.post('/api/heroes/faction', (req, res) => {
  if (!adminOnly(req, res)) return;
  const id = String((req.body || {}).id || '');
  const faction = String((req.body || {}).faction || '');
  if (!HERO_POOL.includes(id)) return res.json({ ok: false, err: '没有这个武将' });
  if (faction && !FACTION_KEYS.includes(faction)) return res.json({ ok: false, err: '势力值不对' });
  // 每个武将必须有一个势力，不接受"取消归属"
  if (!faction) return res.json({ ok: false, err: '势力不能为空，请选一个' });
  const map = readFactions();
  map[id] = faction;
  if (!writeFactions(map)) return res.json({ ok: false, err: '写 factions.json 失败' });
  res.json({ ok: true, factions: map });
});

app.post('/api/heroes/delete', (req, res) => {
  if (!adminOnly(req, res)) return;
  const id = String((req.body || {}).id || '');
  if (!HERO_POOL.includes(id)) return res.json({ ok: false, err: '没有这个武将' });
  trashHero(id);
  const map = readFactions();
  delete map[id];
  writeFactions(map);
  const pool = refreshHeroPool();
  console.log('[heroes] 删除', id, '剩余', pool.length);
  res.json({ ok: true, heroes: pool });
});

/* 新增武将：前端把图片读成 dataURL 传上来，这里解码落盘（原图 + 同名缩略图） */
app.post('/api/heroes/add', (req, res) => {
  if (!adminOnly(req, res)) return;
  const body = req.body || {};
  const dataUrl = String(body.dataUrl || '');
  const faction = String(body.faction || '');
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) return res.json({ ok: false, err: '图片格式不对（要 png/jpg/webp）' });
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (buf.length < 2048) return res.json({ ok: false, err: '图片太小了' });
  if (buf.length > 16 * 1024 * 1024) return res.json({ ok: false, err: '图片太大了（上限 16MB）' });
  const id = require('crypto').createHash('md5').update(buf).digest('hex');
  fs.mkdirSync(HERO_DIR, { recursive: true });
  fs.mkdirSync(HERO_THUMBS, { recursive: true });
  fs.writeFileSync(path.join(HERO_DIR, id + '.' + ext), buf);
  /* 缩略图：前端已经压好 300x400 的 jpg 就单独存，没传才退回用原图 */
  const tm = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(body.thumbUrl || ''));
  if (tm) {
    const tbuf = Buffer.from(tm[2].replace(/\s/g, ''), 'base64');
    if (tbuf.length > 1024) fs.writeFileSync(path.join(HERO_THUMBS, id + '.jpg'), tbuf);
    else fs.writeFileSync(path.join(HERO_THUMBS, id + '.' + ext), buf);
  } else {
    fs.writeFileSync(path.join(HERO_THUMBS, id + '.' + ext), buf);
  }
  if (faction && FACTION_KEYS.includes(faction)) {
    const map = readFactions();
    map[id] = faction;
    writeFactions(map);
  }
  const pool = refreshHeroPool();
  console.log('[heroes] 新增', id, ext, buf.length, '总', pool.length);
  res.json({ ok: true, id, heroes: pool });
});
// 入座顺序：①南 ②北 ③东 ④西；angle 是该座位在“世界坐标”里的朝向（玩家视角旋转 -angle）
const SEATS = [
  { key: 'S', angle: 0 },
  { key: 'N', angle: 180 },
  { key: 'E', angle: 90 },
  { key: 'W', angle: 270 },
];

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 标准版 108（含 EX 4）+ 军争 52 = 160 张，逐张对应实体牌
const STANDARD_EX = [
  ['♠', 'A', '闪电'], ['♠', 'A', '决斗'], ['♠', '2', '八卦阵'], ['♠', '2', '雌雄双股剑'], ['♠', '2', '寒冰剑'],
  ['♠', '3', '过河拆桥'], ['♠', '3', '顺手牵羊'], ['♠', '4', '过河拆桥'], ['♠', '4', '顺手牵羊'],
  ['♠', '5', '青龙偃月刀'], ['♠', '5', '绝影'], ['♠', '6', '乐不思蜀'], ['♠', '6', '青釭剑'],
  ['♠', '7', '南蛮入侵'], ['♠', '7', '杀'], ['♠', '8', '杀'], ['♠', '8', '杀'], ['♠', '9', '杀'], ['♠', '9', '杀'],
  ['♠', '10', '杀'], ['♠', '10', '杀'], ['♠', 'J', '无懈可击'], ['♠', 'J', '顺手牵羊'],
  ['♠', 'Q', '丈八蛇矛'], ['♠', 'Q', '过河拆桥'], ['♠', 'K', '大宛'], ['♠', 'K', '南蛮入侵'],
  ['♥', 'A', '桃园结义'], ['♥', 'A', '万箭齐发'], ['♥', '2', '闪'], ['♥', '2', '闪'], ['♥', '3', '桃'], ['♥', '3', '五谷丰登'],
  ['♥', '4', '桃'], ['♥', '4', '五谷丰登'], ['♥', '5', '麒麟弓'], ['♥', '5', '赤兔'], ['♥', '6', '桃'], ['♥', '6', '乐不思蜀'],
  ['♥', '7', '桃'], ['♥', '7', '无中生有'], ['♥', '8', '桃'], ['♥', '8', '无中生有'], ['♥', '9', '桃'], ['♥', '9', '无中生有'],
  ['♥', '10', '杀'], ['♥', '10', '杀'], ['♥', 'J', '杀'], ['♥', 'J', '无中生有'], ['♥', 'Q', '桃'], ['♥', 'Q', '过河拆桥'],
  ['♥', 'Q', '闪电'], ['♥', 'K', '爪黄飞电'], ['♥', 'K', '闪'],
  ['♣', 'A', '诸葛连弩'], ['♣', 'A', '决斗'], ['♣', '2', '八卦阵'], ['♣', '2', '杀'], ['♣', '2', '仁王盾'],
  ['♣', '3', '过河拆桥'], ['♣', '3', '杀'], ['♣', '4', '过河拆桥'], ['♣', '4', '杀'], ['♣', '5', '的卢'], ['♣', '5', '杀'],
  ['♣', '6', '乐不思蜀'], ['♣', '6', '杀'], ['♣', '7', '南蛮入侵'], ['♣', '7', '杀'], ['♣', '8', '杀'], ['♣', '8', '杀'],
  ['♣', '9', '杀'], ['♣', '9', '杀'], ['♣', '10', '杀'], ['♣', '10', '杀'], ['♣', 'J', '杀'], ['♣', 'J', '杀'],
  ['♣', 'Q', '借刀杀人'], ['♣', 'Q', '无懈可击'], ['♣', 'K', '借刀杀人'], ['♣', 'K', '无懈可击'],
  ['♦', 'A', '诸葛连弩'], ['♦', 'A', '决斗'], ['♦', '2', '闪'], ['♦', '2', '闪'], ['♦', '3', '闪'], ['♦', '3', '顺手牵羊'],
  ['♦', '4', '闪'], ['♦', '4', '顺手牵羊'], ['♦', '5', '闪'], ['♦', '5', '贯石斧'], ['♦', '6', '闪'], ['♦', '6', '杀'],
  ['♦', '7', '闪'], ['♦', '7', '杀'], ['♦', '8', '闪'], ['♦', '8', '杀'], ['♦', '9', '闪'], ['♦', '9', '杀'],
  ['♦', '10', '闪'], ['♦', '10', '杀'], ['♦', 'J', '闪'], ['♦', 'J', '闪'], ['♦', 'Q', '桃'], ['♦', 'Q', '方天画戟'], ['♦', 'Q', '无懈可击'],
  ['♦', 'K', '杀'], ['♦', 'K', '紫骍'],
];

const WAR = [
  ['♥', 'A', '无懈可击'], ['♥', '2', '火攻'], ['♥', '3', '火攻'], ['♥', '4', '火杀'], ['♥', '5', '桃'], ['♥', '6', '桃'], ['♥', '7', '火杀'], ['♥', '8', '闪'], ['♥', '9', '闪'], ['♥', '10', '火杀'], ['♥', 'J', '闪'], ['♥', 'Q', '闪'], ['♥', 'K', '无懈可击'],
  ['♣', 'A', '白银狮子'], ['♣', '2', '藤甲'], ['♣', '3', '酒'], ['♣', '4', '兵粮寸断'], ['♣', '5', '雷杀'], ['♣', '6', '雷杀'], ['♣', '7', '雷杀'], ['♣', '8', '雷杀'], ['♣', '9', '酒'], ['♣', '10', '铁索连环'], ['♣', 'J', '铁索连环'], ['♣', 'Q', '铁索连环'], ['♣', 'K', '铁索连环'],
  ['♠', 'A', '古锭刀'], ['♠', '2', '藤甲'], ['♠', '3', '酒'], ['♠', '4', '雷杀'], ['♠', '5', '雷杀'], ['♠', '6', '雷杀'], ['♠', '7', '雷杀'], ['♠', '8', '雷杀'], ['♠', '9', '酒'], ['♠', '10', '兵粮寸断'], ['♠', 'J', '铁索连环'], ['♠', 'Q', '铁索连环'], ['♠', 'K', '无懈可击'],
  ['♦', 'A', '朱雀羽扇'], ['♦', '2', '桃'], ['♦', '3', '桃'], ['♦', '4', '火杀'], ['♦', '5', '火杀'], ['♦', '6', '闪'], ['♦', '7', '闪'], ['♦', '8', '闪'], ['♦', '9', '酒'], ['♦', '10', '闪'], ['♦', 'J', '闪'], ['♦', 'Q', '火攻'], ['♦', 'K', '骅骝'],
];

if (STANDARD_EX.length !== 108 || WAR.length !== 52) {
  throw new Error('牌堆数据错误: ' + STANDARD_EX.length + '+' + WAR.length);
}

const uidSeq = { n: 0 };
function uid(prefix) { return prefix + (uidSeq.n++).toString(36) + Math.random().toString(36).slice(2, 6); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function makeCard(suit, num, name, type) {
  return {
    id: uid('c'), suit, num, name, type: type || 'card',
    x: 0, y: 0, r: 0, up: false, zone: 'deck', owner: null, pile: 'main', z: 0,
  };
}

// ===== 扩展锦囊（大厅里“加牌”勾选后并入牌堆） =====
const ADDON_PACKS = [
  { id: 'jiangji', name: '将计就计', cards: [['♠', '5'], ['♠', '6'], ['♠', '7']] },
  { id: 'beishui', name: '背水一战', cards: [['♥', '7'], ['♥', '10']] },
  { id: 'yushi', name: '玉石俱焚', cards: [['♣', '8'], ['♣', '9']] },
  { id: 'jiagong', name: '假公济私', cards: [['♣', '2'], ['♣', '3']] },
  { id: 'jinshang', name: '锦上添花', cards: [['♥', 'A'], ['♦', 'Q'], ['♠', 'K']] },
  { id: 'luojing', name: '落井下石', cards: [['♥', 'A'], ['♠', '10']] },
  { id: 'guji', name: '故技重施', cards: [['♦', '2'], ['♦', '3'], ['♦', '4']] },
  { id: 'wuxie', name: '无懈可击', cards: [['♥', 'Q'], ['♠', 'K']] },
];
// “全选”额外追加：方片 4/8/2/3 = 闪，红心 5/6/7 = 杀，红心 9/10 = 闪，梅花 9 = 酒
const ADDON_FULL_EXTRA = [
  ['♦', '4', '闪'], ['♦', '8', '闪'], ['♦', '2', '闪'], ['♦', '3', '闪'],
  ['♥', '5', '杀'], ['♥', '6', '杀'], ['♥', '7', '杀'],
  ['♥', '9', '闪'], ['♥', '10', '闪'], ['♣', '9', '酒'],
];

// ===== 游戏内「锦囊牌」面板（双击房间号加入，洗进摸牌堆） =====
const TRICK_GROUPS = [
  {
    id: 'card', name: '卡牌锦囊', tone: 'light',
    items: ADDON_PACKS.map((p) => ({ id: p.id, name: p.name, cards: p.cards })),
  },
  {
    id: 'role', name: '角色锦囊', tone: 'deep',
    items: [
      { id: 'zhudou', name: '煮豆燃萁', cards: [['♣', '7'], ['♣', '7'], ['♣', 'J'], ['♣', 'Q'], ['♦', '7'], ['♦', '7'], ['♦', 'K']] },
    ],
  },
];
const TRICK_ITEMS = new Map();
for (const g of TRICK_GROUPS) for (const it of g.items) TRICK_ITEMS.set(it.id, it);


function makeSanguoshaDeck(addons, addonsAll) {
  const cards = [];
  for (const row of [...STANDARD_EX, ...WAR]) cards.push(makeCard(row[0], row[1], row[2]));
  const picked = new Set(Array.isArray(addons) ? addons : []);
  for (const pack of ADDON_PACKS) {
    if (!picked.has(pack.id)) continue;
    for (const [suit, num] of pack.cards) cards.push(makeCard(suit, num, pack.name));
  }
  if (addonsAll) {
    for (const [suit, num, name] of ADDON_FULL_EXTRA) cards.push(makeCard(suit, num, name));
  }
  shuffle(cards);
  cards.forEach((c, i) => { c.z = i; c.pile = 'main'; });
  return cards;
}

function makePokerDeck(decks, includeJokers) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (const n of RANKS) cards.push(makeCard(s, n, n, 'poker'));
    if (includeJokers) {
      cards.push(makeCard('', '', '大王', 'joker'));
      cards.push(makeCard('', '', '小王', 'joker'));
    }
  }
  shuffle(cards);
  cards.forEach((c, i) => { c.z = i; c.pile = 'main'; });
  return cards;
}

/* ===== 筹码 ===== */
const CHIP_VALUES = [1, 2, 5, 10, 20, 30, 50];
function chipWallet(init) {
  const o = {};
  for (const v of CHIP_VALUES) o[v] = 0;
  if (init) for (const v of CHIP_VALUES) o[v] = Math.max(0, Math.min(99, Number(init[v]) || 0));
  return o;
}
function chipPass(r, owner) {
  const mid = r.midChips || chipWallet();
  let gain = 0;
  owner.chips = owner.chips || chipWallet();
  for (const v of CHIP_VALUES) {
    const n = Number(mid[v]) || 0;
    if (!n) continue;
    gain += v * n;
    owner.chips[v] = Math.max(0, Math.min(99, (owner.chips[v] || 0) + n));
    mid[v] = 0;
  }
  r.midChips = mid;
  r.midStack = [];
  r.chipVote = null;
  r.gain = { playerId: owner.id, name: owner.name, total: gain, at: Date.now() };
  broadcast(r.code);
}

function chipTotal(w) {
  let t = 0;
  for (const v of CHIP_VALUES) t += v * (Number(w && w[v]) || 0);
  return t;
}

function newRoom(mode, opts = {}) {
  const decks = mode === 'poker' ? (Number(opts.decks) === 2 ? 2 : 1) : 1;
  const includeJokers = opts.includeJokers !== false;
  const cards = mode === 'poker' ? makePokerDeck(decks, includeJokers) : makeSanguoshaDeck(opts.addons, opts.addonsAll);
  const game = GAME_CAPS[opts.game] ? opts.game : 'free';
  const r = {
    mode,
    game,
    maxPlayers: mode === 'poker' ? 4 : (GAME_CAPS[game] || 4),
    draft: null,
    pokerDecks: decks,
    includeJokers,
    players: new Map(),
    midChips: chipWallet(),
    midStack: [],
    heroPool: (Array.isArray(opts.heroPool) && opts.heroPool.length) ? opts.heroPool.slice() : null,
    chipVote: null,
    gain: null,
    cards,
    piles: { main: { id: 'main', ids: [], x: 24, y: 50 } },
    discardIds: [],
    mid: [],
    hostId: null,
    nickSeat: new Map(),
    votes: new Map(),
    voteSeq: 0,
    nextPileNo: 1,
    splitCount: 0,
    startedAt: Date.now(),
    lastActive: Date.now(),
  };
  r.piles.main.ids = cards.map((c) => c.id);
  if (mode === 'poker' && !includeJokers) {
    const keep = [];
    const out = [];
    for (const c of cards) {
      if (c.type === 'joker') { c.zone = 'discard'; c.up = false; c.pile = 'discard'; out.push(c.id); }
      else keep.push(c.id);
    }
    r.piles.main.ids = keep;
    r.discardIds = out;
  }
  return r;
}

function cardById(r, id) { return r.cards.find((c) => c.id === id); }
function playerById(r, id) { return r.players.get(id); }
function removeFromList(a, id) { const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); }
function detachFromContainers(r, id) {
  for (const pl of r.players.values()) {
    if (pl.equip) {
      for (const s of EQUIP_SLOTS) if (pl.equip[s] === id) pl.equip[s] = null;
    }
    if (pl.special && pl.special.length) {
      const i = pl.special.findIndex((s) => s && s.id === id);
      if (i >= 0) pl.special.splice(i, 1);
    }
    if (pl.fronts) {
      for (const arr of pl.fronts) {
        if (!arr) continue;
        const i = arr.findIndex((s) => s && s.id === id);
        if (i >= 0) arr.splice(i, 1);
      }
    }
  }
  if (r.mid) {
    const i = r.mid.findIndex((s) => s && s.id === id);
    if (i >= 0) r.mid.splice(i, 1);
  }
}
function removeFromAllPiles(r, id) {
  for (const p of Object.values(r.piles)) removeFromList(p.ids, id);
  for (const pl of r.players.values()) removeFromList(pl.hand, id);
  removeFromList(r.discardIds, id);
  detachFromContainers(r, id);
}
function syncDeckIds(r) { r.deckIds = Object.values(r.piles).flatMap((p) => p.ids); }

const clampX = (v) => Math.max(6, Math.min(94, Number(v) || 0));
const clampY = (v) => Math.max(10, Math.min(90, Number(v) || 0));

function placeTable(r, c, x, y, rot) {
  c.zone = 'table'; c.owner = null; c.pile = null;
  c.x = clampX(x); c.y = clampY(y); c.r = (((Number(rot) || 0) % 360) + 360) % 360;
  c.z = Date.now();
}

function toHand(r, c, player) {
  detachFromContainers(r, c.id);
  c.zone = 'hand'; c.owner = player.id; c.up = true; c.x = 0; c.y = 0; c.r = 0; c.pile = null;
  c.z = player.hand.length; player.hand.push(c.id);
}

function toDiscard(r, c) {
  detachFromContainers(r, c.id);
  c.zone = 'discard'; c.owner = null; c.up = true; c.pile = 'discard'; c.r = 0; c.x = 0; c.y = 0;
  c.z = r.discardIds.length; r.discardIds.push(c.id);
}

function toPile(r, c, pileId) {
  detachFromContainers(r, c.id);
  const list = Object.values(r.piles).filter((x) => x && x.ids);
  const p = r.piles[pileId] || r.piles.main || list[0];
  if (!p) return false;
  c.zone = 'deck'; c.owner = null; c.up = false; c.pile = p.id; c.r = 0;
  c.x = p.x; c.y = p.y; c.z = p.ids.length; p.ids.push(c.id);
  return true;
}

function equipClear(r, owner, slot) {
  const id = owner.equip[slot];
  if (!id) return;
  owner.equip[slot] = null;
  const c = cardById(r, id);
  if (c) toDiscard(r, c);
}

function liftCard(r, c) {
  detachFromContainers(r, c.id);
  for (const pl of r.players.values()) removeFromList(pl.hand, c.id);
  removeFromList(r.discardIds, c.id);
  for (const p of Object.values(r.piles)) removeFromList(p.ids, c.id);
}

function equipPut(r, c, owner, slot, up) {
  if (!EQUIP_SLOTS.includes(slot)) return false;
  if (!owner.equipLocked || owner.equipLocked[slot]) return false;
  liftCard(r, c);
  if (owner.equip[slot]) {
    const old = cardById(r, owner.equip[slot]);
    owner.equip[slot] = null;
    if (old && old.id !== c.id) toDiscard(r, old);
  }
  c.zone = 'equip'; c.owner = owner.id; c.pile = null; c.r = 0; c.x = 0; c.y = 0;
  c.slot = slot;
  if (typeof up === 'boolean') c.up = up;
  else if (c.up === undefined) c.up = true;
  owner.equip[slot] = c.id;
  return true;
}

function frontArr(owner, idx) {
  if (!owner.fronts) owner.fronts = [[], []];
  const i = Number(idx) === 1 ? 1 : 0;
  if (!owner.fronts[i]) owner.fronts[i] = [];
  return owner.fronts[i];
}

function frontPut(r, owner, c, up, idx) {
  liftCard(r, c);
  c.zone = 'front'; c.owner = owner.id; c.pile = null; c.r = 0; c.x = 0; c.y = 0;
  // 没明确指定就保持卡牌原来的朝向：背面朝上的牌放进门前区依然是背面
  if (typeof up === 'boolean') c.up = up;
  else if (c.up === undefined) c.up = true;
  const arr = frontArr(owner, idx);
  const i = arr.findIndex((s) => s && s.id === c.id);
  if (i >= 0) arr.splice(i, 1);
  arr.push({ id: c.id, up: c.up, at: Date.now() });
  owner.front = owner.fronts[0];
  return true;
}

/* 扑克模式：牌桌正中一块公共手牌区，谁都能往里放，放进去会吸附并保持朝向 */
function midPut(r, c, up) {
  liftCard(r, c);
  c.zone = 'mid'; c.owner = null; c.pile = null; c.r = 0; c.x = 0; c.y = 0;
  if (typeof up === 'boolean') c.up = up;
  else if (c.up === undefined) c.up = true;
  if (!r.mid) r.mid = [];
  const i = r.mid.findIndex((s) => s && s.id === c.id);
  if (i >= 0) r.mid.splice(i, 1);
  r.mid.push({ id: c.id, up: c.up, at: Date.now() });
  return true;
}

function specialPut(r, owner, c, up) {
  liftCard(r, c);
  c.zone = 'special'; c.owner = owner.id; c.pile = null; c.r = 0; c.x = 0; c.y = 0;
  if (typeof up === 'boolean') c.up = up;
  else if (c.up === undefined) c.up = true;
  while (owner.special.length >= SPECIAL_MAX) {
    const oldest = owner.special.shift();
    const oc = oldest && cardById(r, oldest.id);
    if (oc && oc.id !== c.id) toDiscard(r, oc);
  }
  owner.special.push({ id: c.id, up: c.up, at: Date.now() });
  return true;
}

function safeCard(c, viewer) {
  const hidden = c.up === false;   // 背面朝上：连主人都看不到，只下发牌背信息
  const o = {
    id: c.id, x: c.x, y: c.y, r: c.r, up: c.up, zone: c.zone, z: c.z, pile: c.pile,
  };
  if (!hidden) {
    o.suit = c.suit; o.num = c.num; o.type = c.type;
    if (c.zone === 'hand') { if (c.owner === viewer) o.name = c.name; }
    else o.name = c.name;
  }
  return o;
}

function safeEqCard(r, id, viewer) {
  if (!id) return null;
  const c = cardById(r, id);
  return c ? safeCard(c, viewer) : null;
}

function draftPeers(r, viewer) {
  const d = r.draft;
  if (!d || !d.cands) return [];
  const me = playerById(r, viewer);
  if (!me) return [];
  const allow = [];
  if (d.mode === 'ladder' && d.teams && d.teamOf) {
    const myTeam = d.teamOf[viewer];
    for (const id of d.teams[myTeam] || []) if (id !== viewer) allow.push(id);
  } else if (d.mode === 'match' && d.farmerSplit) {
    if (d.farmerSplit.includes(viewer)) for (const id of d.farmerSplit) if (id !== viewer) allow.push(id);
  }
  return allow.map((id) => {
    const p = playerById(r, id);
    const list = d.cands[id] || [];
    return p ? { id, name: p.name, seat: p.seat, cands: list, picked: (d.picks[id] && d.picks[id].hero) || null } : null;
  }).filter(Boolean);
}

function safeState(r, viewer) {
  const me = r.players.get(viewer);
  const players = [...r.players.values()].map((p) => {
    const equip = {};
    for (const s of EQUIP_SLOTS) equip[s] = safeEqCard(r, p.equip && p.equip[s], viewer);
    const equipLocked = {};
    for (const s of EQUIP_SLOTS) equipLocked[s] = !!(p.equipLocked && p.equipLocked[s]);
    return {
      id: p.id, name: p.name, seat: p.seat, angle: SEATS[p.seat] ? SEATS[p.seat].angle : 0,
      hp: p.hp, maxHp: p.maxHp, armor: p.armor || 0, handCount: p.hand.length,
      chips: p.chips || chipWallet(),
      online: p.online !== false,
      chained: !!p.chained,
      equip, equipLocked,
      special: (p.special || []).map((s) => {
        const c = cardById(r, s.id);
        return c ? { ...safeCard(c, viewer), up: !!s.up, zone: 'special' } : null;
      }).filter(Boolean),
      fronts: (p.fronts || [[], []]).map((arr) => (arr || []).map((s) => {
        const c = cardById(r, s.id);
        return c ? { ...safeCard(c, viewer), up: !!s.up, zone: 'front' } : null;
      }).filter(Boolean)),
      front: (((p.fronts || [])[0]) || []).map((s) => {
        const c = cardById(r, s.id);
        return c ? { ...safeCard(c, viewer), up: !!s.up, zone: 'front' } : null;
      }).filter(Boolean),
      hero: p.hero || null,
      reactAt: p.reactAt || 0,
      gotFlower: p.gotFlower || 0,
      gotEgg: p.gotEgg || 0,
    };
  });
  const tableCards = [];
  const handCards = [];
  for (const c of r.cards) {
    if (c.zone === 'table') tableCards.push(safeCard(c, viewer));
    else if (c.zone === 'hand' && c.owner === viewer) handCards.push(safeCard(c, viewer));
  }
  handCards.sort((a, b) => (a.z || 0) - (b.z || 0));
  tableCards.sort((a, b) => (a.z || 0) - (b.z || 0));
  const discardAll = r.discardIds.map((id) => cardById(r, id)).filter(Boolean);
  const piles = Object.values(r.piles).map((p) => ({
    id: p.id, x: p.x, y: p.y, count: p.ids.length,
    topId: p.ids[p.ids.length - 1] || null,
    top: p.ids.length ? safeCard(cardById(r, p.ids[p.ids.length - 1]), viewer) : null,
  }));
  return {
    mode: r.mode, pokerDecks: r.pokerDecks, includeJokers: r.includeJokers,
    game: r.game || 'free', gameName: GAME_NAMES[r.game || 'free'] || '自由',
    maxPlayers: r.maxPlayers || MAX_PLAYERS,
    draft: r.draft ? {
      phase: r.draft.phase, mode: r.draft.mode, deadline: r.draft.deadline,
      landlord: r.draft.landlord || null, score: r.draft.score || 0, round: r.draft.round || 1,
      farmerSplit: r.draft.farmerSplit || null,
      calling: r.draft.calling ? { turn: r.draft.calling.order[r.draft.calling.turn] || null, turnIndex: r.draft.calling.turn, order: r.draft.calling.order, best: r.draft.calling.best, bestBy: r.draft.calling.bestBy, canPass: r.draft.calling.turn > 0, minScore: (r.draft.calling.best || 0) + 1 } : null,
      picks: r.draft.picks || {},
      myCands: (r.draft.cands && r.draft.cands[viewer]) || [],
      teamPools: r.draft.teamPools || null,
      teamOf: r.draft.teamOf || null,
      peers: draftPeers(r, viewer),
    } : null,
    players, meId: viewer, meSeat: me ? me.seat : 0, hostId: r.hostId || null,
    landlordId: r.landlordId || null,
    roomPool: r.heroPool ? r.heroPool.slice() : null,
    trickAdded: Array.isArray(r.trickAdded) ? r.trickAdded.slice() : [],
    tableCards, handCards, piles,
    discardCount: discardAll.length,
    discardTop: discardAll.slice(-4).map((c) => safeCard(c, viewer)),
    midChips: r.midChips || chipWallet(),
    midStack: Array.isArray(r.midStack) ? r.midStack.slice(-120) : [],
    chipVote: r.chipVote,
    gain: r.gain,
    mid: (r.mid || []).map((s) => {
      const c = cardById(r, s.id);
      return c ? { ...safeCard(c, viewer), up: !!s.up, zone: 'mid' } : null;
    }).filter(Boolean),
  };
}

function broadcast(code) {
  const r = rooms.get(code);
  if (!r) return;
  r.lastActive = Date.now();
  for (const p of r.players.values()) io.to(p.id).emit('state', safeState(r, p.id));
}

function applyVote(r, code, action, socketId, decision) {
  const v = r.votes.get(action);
  if (!v) return;
  if (decision === 'yes') { v.no.delete(socketId); v.yes.add(socketId); }
  else if (decision === 'no') { v.yes.delete(socketId); v.no.add(socketId); }
  else return;

  if (v.no.size > 0) {
    r.votes.delete(action);
    for (const p of r.players.values()) io.to(p.id).emit('voteStatus', { action, yes: 0, no: 1, total: r.players.size, done: true, cancelled: true });
    return;
  }
  if (v.yes.size >= (onlinePlayers(r).length || r.players.size)) {
    let pileId = v.pileId && r.piles[v.pileId] ? v.pileId : null;
    if (!pileId) {
      const biggest = Object.values(r.piles).sort((x, y) => y.ids.length - x.ids.length)[0];
      pileId = biggest ? biggest.id : 'main';
    }
    r.votes.delete(action);
    if (action === 'collect') collectScattered(r);
    if (action === 'shuffle') fullShuffle(r);
    if (action === 'split') splitPile(r, pileId);
    if (action === 'startGame') {
      if (v.poolSet) r.heroPool = v.heroPool ? v.heroPool.filter((id) => HERO_POOL.includes(id)) : null;
      /* 开局随机排座：不按房主、不按顺时针，谁坐哪由洗牌决定 */
      const ps = [...r.players.values()];
      const seats = shuffle(ps.map((_, i) => i));
      ps.forEach((p, i) => { p.seat = seats[i]; });
      draftStart(r, v.game || 'free');
    }
    if (action === 'randomSeat') {
      const ps = [...r.players.values()];
      const seats = shuffle(ps.map((_, i) => i));
      ps.forEach((p, i) => { p.seat = seats[i]; });
    }
    for (const p of r.players.values()) io.to(p.id).emit('voteStatus', { action, yes: r.players.size, no: 0, total: r.players.size, done: true, applied: true });
    return broadcast(code);
  }
  emitVote(r, action);
}

function voteStatusFor(r, action, viewer) {
  const v = r.votes.get(action);
  return {
    action,
    yes: v ? v.yes.size : 0,
    no: v ? v.no.size : 0,
    total: r.players.size,
    active: !!v,
    decision: v ? (v.yes.has(viewer) ? 'yes' : v.no.has(viewer) ? 'no' : '') : '',
    pileId: v ? v.pileId : null,
  };
}
function emitVote(r, action) {
  for (const p of r.players.values()) io.to(p.id).emit('voteStatus', voteStatusFor(r, action, p.id));
}

function beginVote(r, action, extra) {
  const running = [...r.votes.keys()][0];
  if (running) return running === action ? false : null;
  r.voteSeq++;
  const v = { seq: r.voteSeq, yes: new Set(), no: new Set() };
  if (extra && extra.pileId) v.pileId = extra.pileId;
  if (extra && extra.game) v.game = extra.game;
  if (extra && (Array.isArray(extra.heroPool) || extra.heroPoolAll)) {
    v.poolSet = true;
    v.heroPool = (Array.isArray(extra.heroPool) && extra.heroPool.length) ? extra.heroPool.slice() : null;
  }
  r.votes.set(action, v);
  emitVote(r, action);
  return true;
}

function splitPile(r, pileId) {
  const ids = r.piles[pileId] ? r.piles[pileId].ids.slice() : [];
  if (ids.length < 2) return false;
  if (Object.keys(r.piles).length >= 4) return false;
  const old = r.piles[pileId];
  const half = Math.floor(ids.length / 2);
  const a = ids.slice(0, half);
  const b = ids.slice(half);
  const n = (r.splitCount = r.splitCount + 1);
  const id1 = 'p' + n + 'a';
  const id2 = 'p' + n + 'b';
  delete r.piles[pileId];
  r.piles[id1] = { id: id1, ids: a, x: clampX(old.x), y: clampY(old.y) };
  r.piles[id2] = { id: id2, ids: b, x: clampX(old.x), y: clampY(old.y) };
  a.forEach((cid, i) => { const c = cardById(r, cid); c.pile = id1; c.x = r.piles[id1].x; c.y = r.piles[id1].y; c.z = i; });
  b.forEach((cid, i) => { const c = cardById(r, cid); c.pile = id2; c.x = r.piles[id2].x; c.y = r.piles[id2].y; c.z = i; });
  layoutPiles(r);
  syncDeckIds(r);
  return true;
}

function layoutPiles(r) {
  const ids = Object.keys(r.piles).sort();
  const n = ids.length;
  const gap = n <= 1 ? 0 : Math.min(11, 40 / n);
  const startX = 24 - (gap * (n - 1)) / 2;
  ids.forEach((id, i) => {
    const p = r.piles[id];
    p.x = clampX(startX + gap * i);
    p.y = clampY(50);
    p.ids.forEach((cid) => { const c = cardById(r, cid); if (c) { c.x = p.x; c.y = p.y; } });
  });
}

function fullShuffle(r) {
  const pool = r.cards.filter((c) => c.zone !== 'hand');
  r.discardIds = [];
  r.piles = { main: { id: 'main', ids: [], x: 24, y: 50 } };
  for (const c of pool) { c.zone = 'deck'; c.owner = null; c.up = false; c.pile = 'main'; c.r = 0; }
  shuffle(pool);
  pool.forEach((c, i) => { c.z = i; c.x = 24; c.y = 50; r.piles.main.ids.push(c.id); });
  r.splitCount = 0;
  syncDeckIds(r);
}

function collectScattered(r) {
  for (const c of r.cards.filter((x) => x.zone === 'table')) toDiscard(r, c);
}

// ---------------- 选将（draft） ----------------
const DRAFT_TIME = { duel: 30000, landlord: 40000, ladder: 40000, match: 30000, call: 10000 };

function onlinePlayers(r) {
  return [...r.players.values()].filter((p) => p.online !== false);
}

function clearDraftTimer(r) {
  if (r.draftTimer) { clearTimeout(r.draftTimer); r.draftTimer = null; }
}

function scheduleDraftTimer(r) {
  clearDraftTimer(r);
  const d = r.draft;
  if (!d || d.phase === 'done') return;
  const left = Math.max(200, d.deadline - Date.now());
  r.draftTimer = setTimeout(() => {
    try {
      r.draftTimer = null;
      const room = r;
      if (!room.draft || room.draft.phase === 'done') return;
      if (room.draft.phase === 'call') {
        const c = room.draft.calling;
        const who = c.order[c.turn];
        // 超时自动帮这位玩家做决定，避免卡住整局
        if (c.turn === 0) draftCall(room, who, 1);
        else if (!draftCallPass(room, who)) draftCall(room, who, Math.min(3, (c.best || 0) + 1));
      } else {
        draftAutoPickAndFinish(room);
      }
      // 定时器里推进的状态必须广播出去，否则所有人看到的还是旧倒计时（表现就是"卡住"）
      if (room.code) broadcast(room.code);
      else for (const p of room.players.values()) io.to(p.id).emit('state', safeState(room, p.id));
    } catch (e) { console.error('[draft timer]', e && e.message); }
  }, left + 50);
}

const DRAFT_NEED = { duel: 6, landlord: 11, match: 13, ladder: 12 };
function draftStart(r, game) {
  const g = GAME_CAPS[game] ? game : 'free';
  const needN = DRAFT_NEED[g] || 0;
  if (needN && r.heroPool && r.heroPool.length && r.heroPool.length < needN) {
    const tip = '武将过少：' + (NEED_NAME[g] || g) + ' 需要 ' + needN + ' 个武将，自定义库只有 ' + r.heroPool.length + ' 个';
    for (const p2 of r.players.values()) io.to(p2.id).emit('toast', tip);
    return;
  }
  r.game = g;
  r.landlordId = null;
  r.maxPlayers = GAME_CAPS[g] || 4;
  clearDraftTimer(r);
  const players = onlinePlayers(r);
  /* 整局只洗一次、且先去重：谁都不可能拿到重复的武将 */
  const pool = shuffle([...new Set((r.heroPool || HERO_POOL).slice())]);
  const d = {
    mode: g, phase: 'pick', deadline: 0, cands: {}, picks: {}, teams: null, teamPools: null,
    teamOf: null, calling: null, landlord: null, round: 1, pool: pool,
  };
  if (g === 'ladder') {
    d.teams = { A: [], B: [] };
    for (const p of players) (p.seat === 0 || p.seat === 1 ? d.teams.A : d.teams.B).push(p.id);
    d.teamPools = {}; d.teamOf = {};
    for (const k of ['A', 'B']) {
      d.teamPools[k] = d.pool.splice(0, 6);
      for (const id of d.teams[k]) { d.cands[id] = d.teamPools[k]; d.teamOf[id] = k; }
    }
    d.deadline = Date.now() + DRAFT_TIME.ladder;
  } else if (g === 'landlord' || g === 'match') {
    d.phase = 'call';
    // 叫分前每人先发 2 张，公开可见
    for (const p of players) d.cands[p.id] = d.pool.splice(0, 2);
    /* 每一把开始游戏都重新随机；如果和上一把一模一样，就转一位，保证连着两把顺序不同 */
    const callOrder = shuffle(players.map((p) => p.id));
    if (r.lastCallOrder && callOrder.length > 1 && callOrder.every((id, i) => id === r.lastCallOrder[i])) {
      callOrder.push(callOrder.shift());
    }
    r.lastCallOrder = callOrder.slice();
    d.calling = { order: callOrder, turn: 0, best: 0, bestBy: null, deadline: Date.now() + DRAFT_TIME.call };
    d.deadline = d.calling.deadline;
  } else if (g === 'duel') {
    for (const p of players) d.cands[p.id] = d.pool.splice(0, 3);
    d.deadline = Date.now() + DRAFT_TIME.duel;
  } else {
    r.draft = null;
    return;
  }
  r.draft = d;
  scheduleDraftTimer(r);
}

function draftCallPass(r, playerId) {
  const d = r.draft; if (!d || d.phase !== 'call') return false;
  const c = d.calling;
  if (c.order[c.turn] !== playerId) return false;
  // 第一个叫分的人不能「不叫」，必须叫 1/2/3
  if (c.turn === 0) return false;
  return draftAdvanceCall(r);
}

function draftAdvanceCall(r) {
  const d = r.draft; const c = d.calling;
  c.turn += 1;
  if (c.bestBy && (c.turn >= c.order.length)) {
    draftAssignLandlord(r, c.bestBy, c.best);
    return true;
  }
  if (c.turn >= c.order.length) {
    // 全都不叫 → 重新发一轮
    c.order = shuffle(onlinePlayers(r).map((p) => p.id));
    c.turn = 0; c.best = 0; c.bestBy = null;
    d.round = (d.round || 1) + 1;
  }
  c.deadline = Date.now() + DRAFT_TIME.call;
  d.deadline = c.deadline;
  scheduleDraftTimer(r);
  return true;
}

function draftCall(r, playerId, score) {
  const d = r.draft; if (!d || d.phase !== 'call') return false;
  const c = d.calling;
  if (c.order[c.turn] !== playerId) return false;
  const n = Number(score) || 0;
  if (n < 1 || n > 3 || n <= c.best) {
    // 不叫（0）也要推进；第一个叫分的人不能不叫
    if (n <= 0) return c.turn === 0 ? false : draftAdvanceCall(r);
    return false;
  }
  c.best = n; c.bestBy = playerId;
  if (n === 3) { draftAssignLandlord(r, playerId, 3); return true; }
  return draftAdvanceCall(r);
}

function draftAssignLandlord(r, landlordId, score) {
  const d = r.draft;
  const pool = d.pool || [];
  d.landlord = landlordId;
  r.landlordId = landlordId;
  d.score = score;
  d.phase = 'pick';
  d.calling = null;
  const others = onlinePlayers(r).filter((p) => p.id !== landlordId);
  // 叫分时每人已有 2 张：地主再加 3（比赛 +5），每个农民再加 1
  const add = (id, n) => { d.cands[id] = (d.cands[id] || []).concat(pool.splice(0, n)); };
  if (d.mode === 'match') {
    add(landlordId, 5);
    for (const o of others) add(o.id, 1);
    d.farmerSplit = others.map((p) => p.id);
    d.deadline = Date.now() + DRAFT_TIME.match;
  } else {
    add(landlordId, 3);
    for (const o of others) add(o.id, 1);
    d.deadline = Date.now() + DRAFT_TIME.landlord;
  }
  scheduleDraftTimer(r);
}

function draftConfirm(r, playerId, hero) {
  const d = r.draft; if (!d || d.phase !== 'pick') return false;
  const list = d.cands[playerId];
  if (!list || !list.includes(hero)) return false;
  // 同一武将不能被两个人同时拿走（排位同队共用一个池）
  for (const id of Object.keys(d.picks || {})) {
    if (id !== playerId && d.picks[id] && d.picks[id].hero === hero) return false;
  }
  d.picks[playerId] = { hero, confirmed: true, rec: null };
  const need = onlinePlayers(r).map((p) => p.id);
  if (need.every((id) => d.picks[id] && d.picks[id].confirmed)) { draftFinish(r); return true; }
  return true;
}

function draftAutoPickAndFinish(r) {
  const d = r.draft; if (!d) return;
  for (const p of onlinePlayers(r)) {
    if (d.picks[p.id] && d.picks[p.id].confirmed) continue;
    const list = d.cands[p.id] || [];
    const hero = list[Math.floor(Math.random() * Math.max(1, list.length))] || (r.heroPool || HERO_POOL)[Math.floor(Math.random() * (r.heroPool || HERO_POOL).length)];
    d.picks[p.id] = { hero, confirmed: true, auto: true };
  }
  draftFinish(r);
}

function draftFinish(r) {
  const d = r.draft; if (!d) return;
  clearDraftTimer(r);
  d.phase = 'done';
  for (const p of r.players.values()) {
    const pick = d.picks[p.id];
    p.hero = pick ? pick.hero : null;
  }
  r.game = d.mode;
}

io.on('connection', (socket) => {

  /* 背景音乐：任何人按播放/暂停/切歌，所有客户端一起跟着变 */
  socket.emit('music:state', musicNow());
  socket.on('music:cmd', (d) => {
    d = d || {};
    const files = musicListFiles().map((x) => x.file);
    const act = String(d.action || '');
    if (act === 'sync') { socket.emit('music:state', musicNow()); return; }
    let track = MUSIC.track;
    if (act === 'select') {
      if (d.track && files.indexOf(d.track) >= 0) track = d.track;
    } else if (act === 'next' || act === 'prev') {
      if (files.length) {
        let i = files.indexOf(MUSIC.track);
        if (i < 0) i = act === 'next' ? -1 : 0;
        track = act === 'next' ? files[(i + 1) % files.length] : files[(i - 1 + files.length) % files.length];
      }
    }
    let playing = MUSIC.playing;
    let pos = 0;
    if (act === 'play') { playing = true; pos = track === MUSIC.track ? musicNow().pos : 0; }
    else if (act === 'pause') { playing = false; pos = musicNow().pos; }
    else if (act === 'seek') { pos = Math.max(0, Number(d.pos) || 0); }
    else if (act === 'select') {
      /* 点的是“正在放的那一首”：接着现在的位置放，不要从头重来；点别的歌才从头开始 */
      playing = true;
      pos = (track && track === MUSIC.track) ? musicNow().pos : 0;
    }
    else if (act === 'next' || act === 'prev') { playing = true; pos = 0; }
    else if (act !== 'sync') { return; }
    if (!track) { MUSIC.track = null; MUSIC.playing = false; MUSIC.pos = 0; MUSIC.at = Date.now(); musicBroadcast(); return; }
    MUSIC.track = track; MUSIC.playing = playing; MUSIC.pos = pos; MUSIC.at = Date.now();
    MUSIC.by = String(d.by || '').slice(0, 16);
    musicBroadcast();
  });
  socket.on('join', (data) => {
    const code = String(data && data.code || '').trim().toUpperCase().slice(0, 12);
    const name = String(data && data.name || '玩家').trim().slice(0, 16) || '玩家';
    const requestedMode = data && data.mode === 'poker' ? 'poker' : 'sanguosha';
    const intent = data && data.intent === 'join' ? 'join' : 'create';
    if (!code) return socket.emit('errorMsg', '请输入房间号');
    let r = rooms.get(code);
    if (!r) {
      if (intent === 'join') return socket.emit('errorMsg', `房间 ${code} 不存在`);
      r = newRoom(requestedMode, {
        decks: data && data.pokerDecks, includeJokers: data && data.includeJokers,
        addons: data && data.addons, addonsAll: data && data.addonsAll,
        game: data && data.game,
        heroPool: data && data.heroPool,
      });
      rooms.set(code, r);
      r.code = code;
    } else if (intent === 'create') {
      /* 一个房号全局只有一个房间：已存在就只能"加入"，不能重复创建 */
      return socket.emit('errorMsg', `房间 ${code} 已存在（${r.mode === 'poker' ? '扑克' : '三国杀'}房），请点「加入房间」进入`);
    }
    r.code = code;
    r.lastActive = Date.now();

    // 同名且掉线 → 直接接管原来的座位和手牌
    const prev = [...r.players.values()].find((p) => p.name === name);
    if (prev) {
      if (prev.online !== false) return socket.emit('errorMsg', '这个昵称已经在房间里了，换个昵称');
      const oldId = prev.id;
      r.players.delete(oldId);
      prev.id = socket.id;
      prev.online = true;
      r.players.set(socket.id, prev);
      if (r.hostId === oldId) r.hostId = socket.id;
      socket.data.code = code;
      socket.emit('joined', { code, seat: prev.seat, mode: r.mode, resumed: true });
      broadcast(code);
      return;
    }

    const cap = r.maxPlayers || MAX_PLAYERS;
    if (r.players.size >= cap) {
      return socket.emit('errorMsg', r.game && r.game !== 'free'
        ? `房间满了：${GAME_NAMES[r.game]}最多 ${cap} 人`
        : `房间满了（最多 ${cap} 人）`);
    }
    const taken = new Set([...r.players.values()].map((p) => p.seat));
    let seat = -1;
    const remembered = r.nickSeat ? r.nickSeat.get(name) : undefined;
    if (typeof remembered === 'number' && !taken.has(remembered)) seat = remembered;
    if (seat < 0) for (let i = 0; i < cap; i++) if (!taken.has(i)) { seat = i; break; }
    if (seat < 0) seat = 0;
    if (!r.nickSeat) r.nickSeat = new Map();
    r.nickSeat.set(name, seat);
    if (!r.hostId) r.hostId = socket.id;
    const baseHp = r.mode === 'poker' ? 10
      : (intent === 'join' ? 4 : Math.max(1, Math.min(99, Number(data && data.maxHp) || 4)));
    const p = {
      id: socket.id, name, seat, hp: baseHp, maxHp: baseHp, armor: 0, hand: [],
      online: true, chained: false, hero: null,
      equip: { weapon: null, armor: null, plus: null, minus: null },
      equipLocked: { weapon: false, armor: false, plus: false, minus: false },
      special: [],
      front: [],
      fronts: [[], []],
    chips: chipWallet(),
    };
    r.players.set(socket.id, p);
    socket.data.code = code;
    socket.emit('joined', { code, seat, mode: r.mode });
    broadcast(code);
  });

  socket.on('hp', (data) => {
    const r = rooms.get(socket.data.code); if (!r) return;
    const t = playerById(r, String(data && data.playerId || socket.id)); if (!t) return;
    if (t.id !== socket.id && socket.id !== r.hostId) return;
    const d = Math.sign(Number(data && data.delta) || 0);
    if (!d) return;
    const old = t.hp;
    t.hp = Math.max(0, Math.min(t.maxHp, t.hp + d));
    if (t.hp !== old) {
      for (const p of r.players.values()) io.to(p.id).emit('fx', { kind: 'hp', playerId: t.id, delta: t.hp - old });
      broadcast(socket.data.code);
    }
  });

  socket.on('maxHp', (data) => {
    const r = rooms.get(socket.data.code); if (!r) return;
    const t = playerById(r, String(data && data.playerId || socket.id)); if (!t) return;
    if (t.id !== socket.id && socket.id !== r.hostId) return;
    const d = Math.sign(Number(data && data.delta) || 0);
    if (!d) return;
    const cap = r.mode === 'poker' ? 1000 : 99;
    const old = t.maxHp;
    t.maxHp = Math.max(1, Math.min(cap, t.maxHp + d));
    if (t.hp > t.maxHp) t.hp = t.maxHp;
    if (t.maxHp !== old) {
      for (const p of r.players.values()) io.to(p.id).emit('fx', { kind: 'maxHp', playerId: t.id, delta: t.maxHp - old });
      broadcast(socket.data.code);
    }
  });

  socket.on('armor', (data) => {
    const r = rooms.get(socket.data.code); if (!r) return;
    const t = playerById(r, String(data && data.playerId || socket.id)); if (!t) return;
    if (t.id !== socket.id && socket.id !== r.hostId) return;
    const d = Math.sign(Number(data && data.delta) || 0);
    if (!d) return;
    const old = t.armor || 0;
    t.armor = Math.max(0, Math.min(5, old + d));
    if (t.armor !== old) {
      for (const p of r.players.values()) io.to(p.id).emit('fx', { kind: 'armor', playerId: t.id, delta: t.armor - old });
      broadcast(socket.data.code);
    }
  });

  /* 送花 / 砸蛋：一人一分钟一次，全房间广播，出场特效在客户端各自播 */
  const REACT_CD = 60000;
  socket.on('react', (data) => {
    const r = rooms.get(socket.data.code); if (!r) return;
    const me = playerById(r, socket.id); if (!me) return;
    const kind = data && data.kind === 'egg' ? 'egg' : 'flower';
    const to = playerById(r, String((data && data.to) || ''));
    if (!to || to === me) return;
    const now = Date.now();
    const left = REACT_CD - (now - (me.reactAt || 0));
    if (left > 0) {
      io.to(socket.id).emit('toast', '还要等 ' + Math.ceil(left / 1000) + ' 秒才能再送');
      return;
    }
    me.reactAt = now;
    if (kind === 'flower') to.gotFlower = (to.gotFlower || 0) + 1;
    else to.gotEgg = (to.gotEgg || 0) + 1;
    for (const p of r.players.values()) io.to(p.id).emit('react', { from: me.id, to: to.id, kind, ts: now, name: me.name });
    broadcast(socket.data.code);
  });

  socket.on('drag', (data) => {
    const r = rooms.get(socket.data.code); if (!r) return;
    const c = cardById(r, String(data && data.id || ''));
    if (!c || (c.zone === 'hand' && c.owner !== socket.id)) return;
    const payload = { id: c.id, x: Number(data.x), y: Number(data.y), r: Number(data.r) || c.r, up: c.up };
    /* 注意：必须按"玩家对象"排除发送者本人。若玩家重连过、p.id 与当前 socket.id 不一致，
       只比较 p.id 会把 drag 回传给本人 —— 客户端就会把刚落下的牌当成"别人正在拖"藏起来，
       表现为"最新放下的那张消失，动一下别的牌它才出现"。 */
    const me = playerById(r, socket.id);
    for (const p of r.players.values()) {
      if (p === me || p.id === socket.id) continue;
      io.to(p.id).emit('drag', payload);
    }
  });

  socket.on('chip', (data) => {
    const r = rooms.get(socket.data.code);
    if (!r || r.mode !== 'poker') return;
    const me = playerById(r, socket.id);
    if (!me) return;
    const d = data || {};
    me.chips = me.chips || chipWallet();
    r.midChips = r.midChips || chipWallet();
    const v = Number(d.value);
    if (d.act === 'add' && CHIP_VALUES.indexOf(v) >= 0) {
      me.chips[v] = Math.max(0, Math.min(99, (me.chips[v] || 0) + (Number(d.delta) || 0)));
      return broadcast(r.code);
    }
    if (d.act === 'toMid' && CHIP_VALUES.indexOf(v) >= 0) {
      const n = Math.max(1, Math.min(99, Number(d.count) || 1));
      const have = me.chips[v] || 0;
      if (have < n) return socket.emit('chipFail');
      me.chips[v] = have - n;
      r.midChips[v] = (r.midChips[v] || 0) + n;
      /* 记顺序：后扔的压在上面 */
      if (!Array.isArray(r.midStack)) r.midStack = [];
      for (let i = 0; i < n; i++) r.midStack.push(v);
      if (r.midStack.length > 200) r.midStack = r.midStack.slice(-200);
      return broadcast(r.code);
    }
    if (d.act === 'collect') {
      if (chipTotal(r.midChips) <= 0 || r.chipVote) return;
      const others = [...r.players.values()].filter((p) => p.id !== me.id && p.online !== false).map((p) => p.id);
      r.chipVote = { by: me.id, byName: me.name, need: others, got: [], at: Date.now() };
      if (!others.length) return chipPass(r, me);
      return broadcast(r.code);
    }
    if (d.act === 'vote' && r.chipVote) {
      const vote = r.chipVote;
      const base = playerById(r, vote.by);
      if (!base) { r.chipVote = null; return broadcast(r.code); }
      if (vote.need.indexOf(me.id) < 0) return;
      if (d.yes) {
        if (vote.got.indexOf(me.id) < 0) vote.got.push(me.id);
        if (vote.got.length >= vote.need.length) return chipPass(r, base);
      } else {
        r.chipVote = null;
        for (const p of r.players.values()) io.to(p.id).emit('errorMsg', `${me.name} 不同意，这次作废`);
      }
      return broadcast(r.code);
    }
    if (d.act === 'cancel' && r.chipVote && r.chipVote.by === me.id) {
      r.chipVote = null;
      return broadcast(r.code);
    }
  });

  socket.on('op', (op) => { try {
    const r = rooms.get(socket.data.code); if (!r) return;
    const code = socket.data.code;
    const type = op && op.type;
    if (process.env.OPLOG) console.log('[op]', socket.id, JSON.stringify(op));

    if (type === 'pileMove') {
      const p = r.piles[String(op.pileId || '')]; if (!p) return;
      p.x = clampX(op.x); p.y = clampY(op.y);
      p.ids.forEach((cid) => { const c = cardById(r, cid); c.x = p.x; c.y = p.y; });
      return broadcast(code);
    }

    if (type === 'devHero') {
    /* 仅本机房主可用：给某位玩家指定武将立绘（用于截图/预览，不影响手牌） */
    const p = playerById(r, String(op.playerId || socket.id));
    const hid = String(op.heroId || '');
    if (p && socket.id === r.hostId && HERO_POOL.includes(hid)) {
      p.hero = hid;
      io.to(socket.id).emit('toast', '已设置立绘');
      broadcast(code);
    }
    return;
  }
  if (type === 'setHero') {
      /* 任何玩家都能把自己这局的武将立绘换成武将池里的某张（只看立绘，不动手牌） */
      const p = socket.id ? playerById(r, socket.id) : null;
      const hid = String(op.heroId || '');
      if (p && HERO_POOL.includes(hid)) {
        p.hero = hid;
        broadcast(code);
      }
      return;
  }
  if (type === 'draw') {
      const pileId = String(op.pileId || 'main');
      const pile = r.piles[pileId]; if (!pile || !pile.ids.length) return;
      const c = cardById(r, pile.ids[pile.ids.length - 1]);
      if (!c) return;
      removeFromAllPiles(r, c.id);
      const target = op.targetZone;
      if (target === 'hand') {
        const p = playerById(r, socket.id); if (!p) return;
        toHand(r, c, p);
      } else if (target === 'discard') {
        toDiscard(r, c);
      } else if (target === 'front') {
        const owner = playerById(r, String(op.ownerId || socket.id));
        if (owner) frontPut(r, owner, c, !!op.up, Number(op.idx) || 0);
        else placeTable(r, c, op.x, op.y, op.r);
      } else {
        placeTable(r, c, op.x, op.y, op.r);
      }
      syncDeckIds(r);
      return broadcast(code);
    }

    // 不需要具体牌的指令
    if (type === 'chain') {
      const target = playerById(r, String(op.playerId || socket.id)); if (!target) return;
      if (target.id !== socket.id && socket.id !== r.hostId) return;
      target.chained = typeof op.on === 'boolean' ? !!op.on : !target.chained;
      return broadcast(code);
    }
    if (type === 'equipLock') {
      if (r.mode === 'poker') return;
      const owner = playerById(r, String(op.ownerId || socket.id)); if (!owner) return;
      const slot = String(op.slot || '');
      if (!EQUIP_SLOTS.includes(slot)) return;
      owner.equipLocked[slot] = !!op.locked;
      if (op.locked) equipClear(r, owner, slot);
      return broadcast(code);
    }

    if (type === 'addTricks') {
      /* 勾选的锦囊：生成实体牌 → 并入主牌堆 → 重新洗牌 */
      const ids = Array.isArray(op.ids) ? op.ids.map(String) : [];
      const main = r.piles.main;
      if (!main) return;
      r.trickAdded = Array.isArray(r.trickAdded) ? r.trickAdded : [];
      let made = 0;
      const names = [];
      for (const id of ids) {
        const it = TRICK_ITEMS.get(id);
        if (!it || r.trickAdded.includes(id)) continue;
        for (const row of it.cards) {
          const card = makeCard(row[0], row[1], it.name);
          card.pile = 'main';
          r.cards.push(card);
          main.ids.push(card.id);
        }
        r.trickAdded.push(id);
        made += it.cards.length;
        names.push(it.name);
      }
      if (!made) { io.to(socket.id).emit('toast', '这些锦囊已经在牌堆里了'); return; }
      shuffle(main.ids);
      main.ids.forEach((cid, i) => { const cc = cardById(r, cid); if (cc) { cc.z = i; cc.pile = 'main'; } });
      syncDeckIds(r);
      io.emit('toast', (socket.data.name || '有人') + ' 洗入了锦囊：' + names.join('、') + '（共 ' + made + ' 张）');
      return broadcast(code);
    }

    const c = cardById(r, String(op && op.id || ''));
    if (!c) return;
    if (c.zone === 'hand' && c.owner !== socket.id) return;
    if (c.zone === 'equip' && c.owner !== socket.id && socket.id !== r.hostId) return;
    if (c.zone === 'special' && c.owner !== socket.id && socket.id !== r.hostId) return;

    switch (type) {
      case 'equip': {
        const owner = playerById(r, String(op.ownerId || socket.id)) || playerById(r, socket.id);
        if (!owner) return;
        if (r.mode === 'poker') return;
        if (equipPut(r, c, owner, String(op.slot || ''), op.up)) { syncDeckIds(r); broadcast(code); }
        else io.to(socket.id).emit('toast', '这个格子锁着，先解锁');
        return;
      }
      case 'equipLock': {
        // 兜底：正常应在卡牌解析前处理
        if (r.mode === 'poker') return;
        const owner = playerById(r, String(op.ownerId || socket.id)); if (!owner) return;
        const slot = String(op.slot || '');
        if (!EQUIP_SLOTS.includes(slot)) return;
        owner.equipLocked[slot] = !!op.locked;
        if (op.locked) equipClear(r, owner, slot);
        return broadcast(code);
      }
      case 'front': {
        const owner = playerById(r, String(op.ownerId || socket.id)); if (!owner) return;
        frontPut(r, owner, c, op.up, op.idx);
        syncDeckIds(r);
        return broadcast(code);
      }
      case 'equipFlip': {
        const owner = playerById(r, String(op.ownerId || '')) || playerById(r, socket.id);
        if (!owner || !owner.equip) return;
        const slot = String(op.slot || '');
        const e = owner.equip[slot];
        if (!e) return;
        e.up = !e.up;
        c.up = e.up;
        return broadcast(code);
      }
      case 'frontFlip': {
        const owner = playerById(r, String(op.ownerId || '')) || playerById(r, socket.id);
        if (!owner) return;
        let e = null;
        for (const arr of (owner.fronts || [])) {
          if (!arr) continue;
          e = arr.find((s) => s && s.id === c.id);
          if (e) break;
        }
        if (!e) e = (owner.front || []).find((s) => s && s.id === c.id);
        if (e) { e.up = !e.up; c.up = e.up; }
        else c.up = !c.up;
        return broadcast(code);
      }
      case 'mid': {
        if (r.mode !== 'poker') return;
        midPut(r, c, op.up);
        syncDeckIds(r);
        return broadcast(code);
      }
      case 'midFlip': {
        const e = (r.mid || []).find((s) => s && s.id === c.id);
        if (e) { e.up = !e.up; c.up = e.up; }
        else c.up = !c.up;
        return broadcast(code);
      }
      case 'special': {
        if (r.mode === 'poker') return;
        const owner = playerById(r, String(op.ownerId || socket.id)); if (!owner) return;
        if (specialPut(r, owner, c, op.up)) { syncDeckIds(r); broadcast(code); }
        return;
      }
      case 'specialFlip': {
        const owner = playerById(r, String(op.ownerId || '')) || playerById(r, socket.id);
        if (!owner) return;
        const e = owner.special.find((s) => s && s.id === c.id);
        if (e) { e.up = !e.up; c.up = e.up; }
        else c.up = !c.up;
        return broadcast(code);
      }
      case 'chain': {
        const target = playerById(r, String(op.playerId || socket.id)); if (!target) return;
        target.chained = typeof op.on === 'boolean' ? !!op.on : !target.chained;
        return broadcast(code);
      }
      case 'move': {
        removeFromAllPiles(r, c.id);
        const target = op.targetZone;
        if (target === 'hand') {
          const p = playerById(r, socket.id); if (!p) return;
          toHand(r, c, p);
        } else if (target === 'discard') {
          toDiscard(r, c);
        } else if (target === 'deck') {
          toPile(r, c, String(op.pileId || 'main'));
        } else if (target === 'equip') {
          const owner = playerById(r, String(op.ownerId || socket.id)); if (!owner) return;
          if (r.mode === 'poker') return;
          if (!equipPut(r, c, owner, String(op.slot || ''), op.up)) {
            io.to(socket.id).emit('toast', '这个格子锁着，先解锁');
            return broadcast(code);
          }
        } else if (target === 'front') {
          if (r.mode === 'poker') return;
          const owner = playerById(r, String(op.ownerId || socket.id)); if (!owner) return;
          frontPut(r, owner, c, op.up, op.idx);
        } else if (target === 'mid') {
          if (r.mode !== 'poker') return;
          midPut(r, c, op.up);
        } else if (target === 'special') {
          const owner = playerById(r, String(op.ownerId || socket.id)); if (!owner) return;
          if (r.mode === 'poker') return;
          specialPut(r, owner, c, op.up);
        } else {
          placeTable(r, c, op.x, op.y, op.r);
          if (typeof op.up === 'boolean') c.up = op.up;
        }
        syncDeckIds(r);
        return broadcast(code);
      }
      case 'flip': {
        c.up = !c.up;
        if (c.zone === 'special' && c.owner) {
          const owner = playerById(r, c.owner);
          const e = owner && owner.special.find((s) => s && s.id === c.id);
          if (e) e.up = c.up;
        }
        return broadcast(code);
      }
      case 'rotate': {
        c.r = (((c.r + (Number(op.delta) || 0)) % 360) + 360) % 360;
        return broadcast(code);
      }
      case 'reorderHand': {
        const p = playerById(r, socket.id); if (!p) return;
        if (c.zone !== 'hand' || c.owner !== socket.id) return;
        removeFromList(p.hand, c.id);
        const idx = Math.max(0, Math.min(p.hand.length, Number(op.index) || 0));
        p.hand.splice(idx, 0, c.id);
        p.hand.forEach((cid, i) => { const cc = cardById(r, cid); if (cc) cc.z = i; });
        return broadcast(code);
      }
      case 'toDeck': {
        removeFromAllPiles(r, c.id);
        toPile(r, c, String(op.pileId || 'main'));
        syncDeckIds(r);
        return broadcast(code);
      }
    }
  } catch (e) { console.error('[op] 处理失败', e && e.message); } });

  /* 房间级自定义将池：谁都能改，改完全房同步 */
  socket.on('pool', (data) => {
    const r = rooms.get(socket.data.code); if (!r) return;
    if (!r.players.has(socket.id)) return;
    if (r.mode !== 'sanguosha') return;
    const raw = data && data.list;
    if (!Array.isArray(raw)) return;
    const list = [...new Set(raw.map(String))].filter((id) => HERO_POOL.includes(id));
    r.heroPool = list.length ? list : null;
    broadcast(socket.data.code);
  });

  socket.on('vote', (data) => {
    const r = rooms.get(socket.data.code); if (!r) return;
    const code = socket.data.code;
    const action = String(data && data.action || '');
    const allowed = ['collect', 'shuffle', 'randomSeat', 'split', 'startGame'];
    if (!allowed.includes(action)) return;
    if (!r.players.has(socket.id)) return;
    const decision = String(data && data.decision || '');

    if (decision === 'start' || !decision) {
      if (action === 'split' && Object.keys(r.piles).length >= 4) {
        return io.to(socket.id).emit('toast', '牌堆最多分成四堆');
      }
      const started = beginVote(r, action, { pileId: data && data.pileId, game: data && data.game, heroPool: data && data.heroPool });
      if (started === true) { applyVote(r, code, action, socket.id, 'yes'); return; }
      if (started === false) return io.to(socket.id).emit('voteStatus', voteStatusFor(r, action, socket.id));
      if (started === null) {
        const current = [...r.votes.keys()][0];
        return io.to(socket.id).emit('toast', '先处理进行中的投票：' + current);
      }
      return;
    }

    applyVote(r, code, action, socket.id, decision);
  });

  socket.on('draft', (data) => {
    const r = rooms.get(socket.data.code); if (!r) return;
    const code = socket.data.code;
    const action = String((data && (data.action || data.type)) || '');
    const d = r.draft;
    if (!d) return;

    if (action === 'call') {
      if (r.mode === 'poker') return;
      if (draftCall(r, socket.id, data && data.score)) broadcast(code);
      return;
    }
    if (action === 'confirm') {
      if (draftConfirm(r, socket.id, String(data && data.hero || ''))) broadcast(code);
      return;
    }
    if (action === 'recommend') {
      if (!d.picks[socket.id]) d.picks[socket.id] = { hero: null, confirmed: false, rec: null };
      d.picks[socket.id].rec = String(data && data.hero || '');
      return broadcast(code);
    }
    if (action === 'cancel') {
      if (socket.id !== r.hostId) return;
      clearDraftTimer(r);
      r.draft = null;
      for (const p of r.players.values()) p.hero = null;
      return broadcast(code);
    }
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    const r = rooms.get(code); if (!r) return;
    const p = r.players.get(socket.id);
    if (p) {
      // 掉线保座：座位/手牌/装备/特殊区全部保留，等同名重连时接管
      p.online = false;
      p.leftAt = Date.now();
    }
    for (const action of [...r.votes.keys()]) {
      r.votes.delete(action);
      for (const pp of r.players.values()) io.to(pp.id).emit('voteStatus', { action, done: true, cancelled: true, total: r.players.size });
    }
    if (!r.players.size) rooms.delete(code); else broadcast(code);
  });
});

/* 空壳房间回收：房间里所有人都掉线，且超过 ROOM_IDLE_MS 没有任何活动，就整间清掉。
   有人在线绝不会被清，所以掉线保座（同名重连能接回座位）不受影响。 */
const ROOM_IDLE_MS = Number(process.env.ROOM_IDLE_MS) || 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const anyOnline = [...r.players.values()].some((p) => p.online !== false);
    if (anyOnline) continue;
    const stamp = Math.max(r.lastActive || 0, ...[...r.players.values()].map((p) => p.leftAt || 0), 0);
    if (now - stamp > ROOM_IDLE_MS) {
      if (r.draftTimer) { clearTimeout(r.draftTimer); r.draftTimer = null; }
      rooms.delete(code);
      console.log('[room] 回收无人房间', code, Math.round((now - stamp) / 60000) + ' 分钟无活动');
    }
  }
}, Number(process.env.ROOM_SWEEP_MS) || 60 * 1000).unref();

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => console.log('自由桌 V6 已启动 http://127.0.0.1:' + PORT));



