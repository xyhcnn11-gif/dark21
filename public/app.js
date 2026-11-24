/* 自由桌 V6 前端 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // 世界坐标（不分视角）：南=自己(下) 北=对家(上) 东=右 西=左
  const SEAT_WORLD = [
    { x: 50, y: 90 },   // 0 南
    { x: 50, y: 10 },   // 1 北
    { x: 90, y: 50 },   // 2 东
    { x: 10, y: 50 },   // 3 西
  ];
  const SEAT_ANGLE = [0, 180, 90, 270];
  // 牌堆/弃牌的世界锚点：南视角左摸右弃
  const WORLD_DECK = { x: 20, y: 50 };
  const WORLD_DISCARD = { x: 78, y: 50 };
  /* 牌堆/弃牌堆固定在屏幕下方两侧，不跟着视角旋转，避免和座位面板打架 */
  const SCREEN_DECK = { x: 30, y: 47 };
  const SCREEN_DISCARD = { x: 70, y: 47 };
  // 手牌区上方的安全边界（百分比）
  const SAFE = { x0: 9, x1: 91, y0: 9, y1: 68 };

  // 世界坐标 → 当前视角屏幕百分比：按座位角度旋转 + 边界钳制（永不进手牌区）
  function toScreen(wx, wy) {
    const a = ((S.rot || 0) * Math.PI) / 180;
    const dx = wx - 50, dy = wy - 50;
    const c = Math.cos(a), s = Math.sin(a);
    const x = 50 + dx * c - dy * s;
    const y = 50 + dx * s + dy * c;
    return {
      x: Math.max(SAFE.x0, Math.min(SAFE.x1, x)),
      y: Math.max(SAFE.y0, Math.min(SAFE.y1, y)),
    };
  }

  // 屏幕百分比 → 世界坐标（拖拽用，不钳制）
  function toWorld(sx, sy) {
    const a = ((S.rot || 0) * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    const dx = sx - 50, dy = sy - 50;
    return { x: 50 + dx * c + dy * s, y: 50 - dx * s + dy * c };
  }
  const THEMES = ['green', 'dark', 'blue', 'wood', 'night'];

  const el = {
    lobby: $('#lobby'), game: $('#game'),
    name: $('#name'), room: $('#room'), maxHp: $('#maxHp'), err: $('#error'), join: $('#join'),
    sgOptions: $('#sgOptions'), pokerOptions: $('#pokerOptions'),
    topbar: $('#topbar'), roomLabel: $('#roomLabel'), playersLabel: $('#playersLabel'),
    gear: $('#gear'), gearTray: $('#gearTray'), splitBtn: $('#splitBtn'), themeBtn: $('#themeBtn'),
    worldInner: $('#worldInner'), table: $('#table'),
    deckPile: $('#deckPile'), deckCount: $('#deckCount'),
    discardZone: $('#discardZone'), discardSlot: $('#discardSlot'), discardCount: $('#discardCount'),
    pilesLayer: $('#pilesLayer'), cardsLayer: $('#cardsLayer'), seatsLayer: $('#seatsLayer'),
    meName: $('#meName'), meHp: $('#meHp'), upMax: $('#upMax'), downMax: $('#downMax'),
    meChain: $('#meChain'), meEquip: $('#meEquip'), meFront: $('#meFront'), meBar: $('#meBar'),
    hand: $('#handZone'), dragLayer: $('#dragLayer'), toast: $('#toast'),
    voteBox: $('#voteBox'), voteName: $('#voteName'), voteCount: $('#voteCount'),
    voteYes: $('#voteYes'), voteNo: $('#voteNo'), rotateHint: $('#rotateHint'),
    draftLayer: $('#draftLayer'), draftTitle: $('#draftTitle'), draftInfo: $('#draftInfo'),
    draftClock: $('#draftClock'), draftCall: $('#draftCall'), draftCallText: $('#draftCallText'),
    draftCands: $('#draftCands'), draftPicked: $('#draftPicked'), draftConfirm: $('#draftConfirm'),
    draftFrames: $('#draftFrames'),
    roomTabs: $$('.room-tab'), roomLabelText: $('#roomLabelText'),
  };

  const S = {
    mode: 'sanguosha', decks: 1, jokers: 1, intent: 'create', diff: 'easy',
    socket: null, me: null, state: null,
    cardEls: new Map(), handEls: new Map(), seatEls: new Map(), discardEls: new Map(), pileEls: new Map(),
    rot: 0, handGapIndex: -1, theme: localStorage.getItem('ft-theme') || 'green',
    vote: null, voteTimer: null,
    joinPayload: null, draftSel: null, lastDraftKey: '', draftClockTimer: null,
    optimistic: new Map(),
    remoteDrag: new Map(),
    hideUntil: new Map(),
    myDrag: null,
  };

  /* ---------------- lobby ---------------- */
  $$('.mode-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.mode-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    S.mode = b.dataset.mode;
    el.sgOptions.hidden = S.mode !== 'sanguosha';
    el.pokerOptions.hidden = S.mode !== 'poker';
    const islO = document.getElementById('islOptions');
    if (islO) islO.hidden = S.mode !== 'island';
    const mh = document.getElementById('maxHp');
    if (mh && mh.closest('#createOnly')) mh.closest('#createOnly').querySelectorAll('label,input#maxHp').forEach((n) => {
      if (n.id === 'maxHp' || /体力上限/.test(n.textContent || '')) n.style.display = S.mode === 'island' ? 'none' : '';
    });
    const sub = document.getElementById('lobbySub');
    if (sub) sub.textContent = S.mode === 'island' ? '荒岛 21 天 · 三人合作求生' : '三国杀 · 扑克 · 联机开桌';
  }));
  /* v186：难度选择（只有 21 天用） */
  $$('.diff-btn').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    $$('.diff-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    S.diff = b.dataset.diff || 'easy';
  }));
  $$('.choice').forEach((b) => b.addEventListener('click', () => {
    $$('.choice').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); S.decks = Number(b.dataset.decks);
  }));
  $$('.joker-choice').forEach((b) => b.addEventListener('click', () => {
    $$('.joker-choice').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); S.jokers = Number(b.dataset.jokers);
  }));

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- 大厅：加牌（扩展锦囊）----
  const ADDON_PACK_CARDS = { jiangji: 3, beishui: 2, yushi: 2, jiagong: 2, jinshang: 3, luojing: 2, guji: 3, wuxie: 2 };
  const ADDON_FULL_EXTRA = 10;
  function addonBoxes() { return [...document.querySelectorAll('#addonList input[type=checkbox][value]')]; }
  function selectedAddons() { return addonBoxes().filter((x) => x.checked).map((x) => x.value); }
  function updateAddonTip() {
    const tip = document.getElementById('addonTip');
    if (!tip) return;
    const all = document.getElementById('addonAll');
    const n = selectedAddons().reduce((s, id) => s + (ADDON_PACK_CARDS[id] || 0), 0) + (all && all.checked ? ADDON_FULL_EXTRA : 0);
    tip.textContent = n ? '（已加 ' + n + ' 张，共 ' + (160 + n) + ' 张）' : '（未选）';
  }
  (function initAddonPanel() {
    const list = document.getElementById('addonList');
    const toggle = document.getElementById('addonToggle');
    const all = document.getElementById('addonAll');
    const arrow = document.getElementById('addonArrow');
    if (!list || !toggle || !all) return;
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
      if (arrow) arrow.textContent = list.hidden ? '▾' : '▴';
    });
    addonBoxes().forEach((b) => b.addEventListener('change', () => {
      if (!b.checked) all.checked = false;
      updateAddonTip();
    }));
    all.addEventListener('change', () => {
      addonBoxes().forEach((b) => { b.checked = all.checked; });
      updateAddonTip();
    });
    updateAddonTip();
  })();

  /* ---- 大厅：创建 / 加入 双标签 ---- */
  function setIntent(intent) {
    S.intent = intent;
    el.roomTabs.forEach((b) => b.classList.toggle('active', b.dataset.intent === intent));
    const join = intent === 'join';
    if (el.roomLabelText) {
      el.roomLabelText.textContent = join ? '房间号（必填）' : '房间号（留空自动生成）';
    }
    el.room.placeholder = join ? '输入房号，例如 RJH7SM' : '留空自动生成';
    el.join.textContent = join ? '加入房间' : '创建并进入';
    el.err.textContent = '';
    /* 加入房间时：模式 / 扩展包 / 牌副数 / 体力上限全部隐藏 —— 房号决定一切 */
    const only = document.getElementById('createOnly');
    if (only) only.hidden = join;
    const sub = document.getElementById('lobbySub');
    if (sub) sub.textContent = join ? '输入房间号就能进，模式由房间决定' : '三国杀 · 扑克 · 联机开桌';
  }
  el.roomTabs.forEach((b) => b.addEventListener('click', () => setIntent(b.dataset.intent)));
  setIntent('create');

  function doJoin() {
    const name = (el.name.value || '').trim() || '玩家';
    let code = (el.room.value || '').trim().toUpperCase();
    if (S.intent === 'join' && !code) { el.err.textContent = '请先输入房间号'; return; }
    if (!code) code = Math.random().toString(36).slice(2, 8).toUpperCase();
    el.err.textContent = '';
    /* 加入房间：先问服务端这个房号属于哪个模式 */
    if (S.intent === 'join') {
      el.err.textContent = '';
      fetch('/api/room-mode?code=' + encodeURIComponent(code))
        .then((r) => r.json())
        .then((info) => {
          if (info && info.mode === 'island') {
            location.href = 'island.html?room=' + encodeURIComponent(code) + '&name=' +
              encodeURIComponent(name) + '&intent=join';
            return;
          }
          if (!info || !info.mode) {
            el.err.textContent = '房间 ' + code + ' 不存在，确认一下房号（可能房主还没建，或者已经关了）';
            return;
          }
          joinCards(code, name, info.tableMode || S.mode);
        })
        .catch(() => { el.err.textContent = '连不上服务器，稍后再试'; });
      return;
    }

    /* 21天：单独页面，不走牌桌引擎 */
    if (S.mode === 'island') {
      location.href = 'island.html?room=' + encodeURIComponent(code) + '&name=' + encodeURIComponent(name) +
        '&diff=' + encodeURIComponent(S.diff || 'easy');
      return;
    }
    joinCards(code, name, S.mode);
  }

  function joinCards(code, name, mode) {
    S.joinPayload = {
      code, name, mode, intent: S.intent,
      maxHp: Number(el.maxHp.value) || 4,
      pokerDecks: S.decks, includeJokers: S.jokers === 1,
      addons: selectedAddons(),
      addonsAll: !!(document.getElementById('addonAll') || {}).checked,
    };
    if (!S.socket) { S.socket = io({ transports: ['websocket', 'polling'] }); bindSocket(S.socket); }
    window.__op = (o) => S.socket && S.socket.emit('op', o);
    window.__state = () => S.state;
  window.__S = S;
  window.__render = function(){ try { render(); } catch(e) { window.__rErr = String(e); } };


    S.socket.emit('join', S.joinPayload);
  }
  el.join.addEventListener('click', doJoin);

  document.addEventListener('click', (e) => {
    const pb = e.target.closest && e.target.closest('.pool-btn');
    if (!pb) return;
    const want = pb.dataset.pool;
    if (want === 'custom' && e.target.closest('.pool-gear')) { openHeroBook('pool'); return; }
    if (want === 'custom' && poolUse !== 'custom') { openHeroBook('pool'); return; }
    poolUse = want;
    document.querySelectorAll('.pool-btn').forEach((b) => b.classList.toggle('active', b.dataset.pool === poolUse));
    updatePoolLabel();
  });
  loadPoolFromServer();
  el.room.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  el.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove('show'), 1800);
  }

  /* ---------------- 现场取证：把 DOM 实况写给服务端，出问题时我直接看日志 ---------------- */
  function sendDiag(tag) {
    try {
      const st = S.state || {};
      const dom = [...el.cardsLayer.querySelectorAll('.card')].map((d) => {
        const b = d.getBoundingClientRect();
        return {
          id: d.dataset.id, op: d.style.opacity, cs: getComputedStyle(d).opacity,
          cls: d.className, rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]
        };
      });
      fetch('/api/diag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag, ua: navigator.userAgent.slice(0, 80),
          stateTable: (st.tableCards || []).map((c) => c.id),
          stateCount: { table: (st.tableCards || []).length, hand: (st.handCards || []).length, discard: st.discardCount },
          dom, pool: [...POOL.keys()], optimistic: [...S.optimistic.keys()],
          dragging: null, rot: S.rot
        })
      }).catch(() => {});
    } catch (e) { /* never break the game for a log */ }
  }

  /* ---------------- socket ---------------- */
  function bindSocket(sock) {
    /* 任何"把某张牌放到某个区域"的指令都先记成乐观状态：
       服务器还没回包时，渲染层不许把这张牌删掉，否则就是"放下就消失" */
    const rawEmit = sock.emit.bind(sock);
    sock.emit = function (ev, payload) {
      try {
        if (ev === 'drag' && payload && payload.id) S.myDrag = { id: payload.id, ts: Date.now() };
        if (ev === 'op' && payload && payload.id &&
            ['equip', 'front', 'mid', 'move', 'flip', 'frontFlip', 'midFlip'].indexOf(payload.type) >= 0) {
          S.optimistic.set(payload.id, Date.now());
        }
        if (ev === 'op' && payload && payload.type) {
          const tag = payload.type + (payload.targetZone ? '>' + payload.targetZone : '');
          setTimeout(() => sendDiag('t50 ' + tag), 50);
          setTimeout(() => sendDiag('t900 ' + tag), 900);
        }
      } catch (e) { /* ignore */ }
      return rawEmit(ev, payload);
    };
    sock.on('joined', (info) => {
      S.me = { id: sock.id, name: (el.name.value || '玩家').trim(), code: info.code };
      el.lobby.hidden = true; el.game.hidden = false;
      preloadHeroes();
      el.roomLabel.textContent = '房间 ' + info.code;
      el.game.dataset.mode = info.mode;
      if (S.joinPayload) S.joinPayload.intent = 'join';   // 重连时按「加入」接管原座位
      applyTheme();
      if (info.resumed) toast('已恢复到你的座位');
    });
    sock.on('state', (st) => {
      S.state = st; S.rot = SEAT_ANGLE[st.meSeat] || 0;
      /* 房间级自定义将池同步：别人改了，我这边跟着变 */
      const hb = document.getElementById('heroBook');
      if (hb && !hb.hidden && bookMode === 'pool') {
        const next = new Set(st.roomPool || []);
        if (next.size !== poolSel.size || [...next].some((x) => !poolSel.has(x))) {
          poolSel = next; paintHeroBook();
        }
      }
      scheduleRender();
    });
    sock.on('errorMsg', (m) => { el.err.textContent = m; toast(m); });
    sock.on('toast', toast);
    sock.on('voteStatus', onVoteStatus);
    sock.on('drag', onRemoteDrag);
    // 断线自动重连：拿回同一座位、同一手牌
    sock.on('disconnect', (reason) => {
      if (!S.joinPayload) return;
      if (S.state) toast('连接断开，正在重连…');
    });
    sock.io.on('reconnect', () => {
      if (!S.joinPayload) return;
      S.joinPayload.intent = 'join';
      sock.emit('join', S.joinPayload);
    });
    sock.on('react', (d) => { playReact(d); });
    sock.on('fx', (f) => {
      const seatEl = S.seatEls.get(f.playerId);
      if (!seatEl) return;
      seatEl.classList.remove('pop'); void seatEl.offsetWidth; seatEl.classList.add('pop');
      seatEl.querySelector(f.kind === 'hp' ? '.hp-row' : '.sname')?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 260 });
    });
  }

  /* ---------------- theme ---------------- */
  function applyTheme() { document.body.dataset.theme = S.theme; }
  function cycleTheme() {
    S.theme = THEMES[(THEMES.indexOf(S.theme) + 1) % THEMES.length];
    localStorage.setItem('ft-theme', S.theme);
    applyTheme();
    toast('桌布：' + ({ green: '绿呢', dark: '墨黑', blue: '深蓝', wood: '木纹', night: '夜色' }[S.theme] || S.theme));
  }
  let clickTimes = [];
  el.table.addEventListener('pointerdown', (e) => {
    if (e.target !== el.table && e.target !== el.worldInner) return;
    const r = el.table.getBoundingClientRect();
    if (e.clientY - r.top > r.height * 0.28) { clickTimes = []; return; }
    const now = Date.now();
    clickTimes = clickTimes.filter((t) => now - t < 420);
    clickTimes.push(now);
    if (clickTimes.length >= 3) {
      clickTimes = [];
      cycleTheme();
    }
  });

  /* ---------------- render ---------------- */
  function cardHTML(c) {
    if (c.type === 'joker') {
      return `<div class="face"><div class="cname">${nameHTML(c.name)}</div></div>`;
    }
    const red = c.suit === '♥' || c.suit === '♦';
    const corner = c.suit ? `${escapeHtml(c.num)}<span class="suit">${c.suit}</span>` : escapeHtml(c.num);
    return `<div class="face"><div class="corner">${corner}</div>` +
      (c.type === 'poker' ? '' : `<div class="cname">${nameHTML(c.name)}</div>`) + `</div>`;
  }

  function cardFaceHTML(c) {
    /* 背面朝上时连牌面 HTML 都不生成：不只是 CSS 遮住，免得有人翻 DOM 看牌 */
    return '<div class="back"></div>' + (c && c.up === false ? '' : cardHTML(c));
  }

  /* 牌名统一：最多留 4 个字；3~4 字排成「上面两个字、下面两个字」 */
  function zoneShort(name) {
    if (!name) return '';
    return name.length > 4 ? name.slice(0, 4) : name;
  }
  function nameHTML(name) {
    const s = zoneShort(name || '');
    if (!s) return '';
    /* 所有牌上的名字统一只显示前两个字 */
    return escapeHtml(s.slice(0, 2));
  }
  function applyCardName(d, c, short) {
    const n = d.querySelector('.cname');
    if (!n) return;
    /* 门前区/装备区/公共区：只留前两个字；手牌与桌面：最多四个字，上二下二 */
    if (short) {
      n.innerHTML = escapeHtml(zoneShort(c && c.name).slice(0, 2));
    } else {
      n.innerHTML = nameHTML(c && c.name);
    }
  }

  function makeCardEl(c) {
    const d = document.createElement('div');
    d.className = 'card';
    d.dataset.id = c.id;
    d.dataset.up = String(!(c && c.up === false));
    d.innerHTML = cardFaceHTML(c);
    d.addEventListener('pointerdown', onCardDown);
    return d;
  }

  function paintCard(d, c) {
    const upNow = !(c && c.up === false);
    if (d.dataset.up !== String(upNow)) {
      d.dataset.up = String(upNow);
      d.innerHTML = cardFaceHTML(c);
    }
    d.classList.toggle('down', !upNow);
    d.classList.toggle('poker', c.type === 'poker');
    d.classList.toggle('joker', c.type === 'joker');
    d.classList.toggle('s-red', c.suit === '♥' || c.suit === '♦');
    d.classList.toggle('s-black', c.suit === '♠' || c.suit === '♣');
  }

  /* 一次动画帧最多重绘一次：服务器连续推 state 时不会排队堆积，手感明显更跟手 */
  let renderTicket = 0;
  /* ===== 卡牌 DOM 统一池 =====
     一张牌在整个页面里永远只有一个元素：手牌、桌面、弃牌堆、门前区、中央手牌区
     之间只是把它搬到另一个父节点，绝不"删了再建"，这样就不会闪、不会消失、不会出现两张。 */
  const POOL = new Map();
  function cardEl(c) {
    let d = POOL.get(c.id);
    if (!d) {
      d = document.createElement('div');
      d.className = 'card';
      d.dataset.id = c.id;
      d.addEventListener('pointerdown', onCardDown);
      POOL.set(c.id, d);
    }
    paintCard(d, c);
    return d;
  }
  /* 换区域时只清"布局类"的 class。背面朝上的牌（down）必须保留——
     否则 className 被清成 card 后，背面那层会被 .card:not(.down) .back{display:none} 藏掉，
     整张牌就"看不见"了，直到下次重绘才恢复。 */
  const CARD_KEEP = ['down', 'poker', 'joker', 's-red', 's-black', 'red-back'];
  function resetCardEl(d) {
    const keep = CARD_KEEP.filter((k) => d.classList.contains(k));
    d.className = 'card';
    keep.forEach((k) => d.classList.add(k));
    d.removeAttribute('style');
  }
  function sweepCards(st) {
    const keep = new Set();
    (st.tableCards || []).forEach((c) => keep.add(c.id));
    (st.handCards || []).forEach((c) => keep.add(c.id));
    (st.discardTop || []).forEach((c) => keep.add(c.id));
    (st.mid || []).forEach((c) => keep.add(c.id));
    (st.players || []).forEach((p) => {
      EQUIP_SLOTS.forEach((sl) => { const c = p.equip && p.equip[sl]; if (c) keep.add(c.id); });
      (p.fronts || []).forEach((arr) => (arr || []).forEach((c) => { if (c) keep.add(c.id); }));
    });
    const now = Date.now();
    for (const [id, ts] of S.optimistic) {
      if (now - ts > 2600 || keep.has(id)) S.optimistic.delete(id);
    }
    for (const [id, d] of POOL) {
      if (keep.has(id)) continue;
      /* 刚落下的牌还没等到服务器回包：先别删，否则会"放下就消失" */
      if (S.optimistic.has(id)) continue;
      d.remove();
      POOL.delete(id);
    }
  }

  function scheduleRender() {
    if (renderTicket) return;
    const fire = () => { renderTicket = 0; try { render(); } catch (e) { console.error(e); } };
    // 标签页在后台时 requestAnimationFrame 会被暂停，退化成宏任务，切回来时也不会卡在旧画面
    renderTicket = document.hidden ? setTimeout(fire, 0) : requestAnimationFrame(fire);
  }

  function render() {
    const st = S.state; if (!st) return;
    el.worldInner.style.setProperty('--rot', 0);
    // 安全区上限：按「血量面板顶部 - 半个牌高」动态算，保证牌堆/桌面牌永不压住手牌区
    try {
      const tr = el.table.getBoundingClientRect();
      const mp = document.getElementById('mePanel').getBoundingClientRect();
      const cardH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ch')) || 106;
      SAFE.y1 = Math.max(12, ((mp.top - tr.top) / tr.height) * 100 - (cardH / 2 / tr.height) * 100 - 2);
    } catch (e) { /* keep default */ }
    const dp = SCREEN_DECK;
    const xp = SCREEN_DISCARD;
    const deckSlot = document.getElementById('deckSlot');
    const discardSlot = document.getElementById('discardSlot');
    if (deckSlot) {
      deckSlot.style.left = dp.x + '%';
      deckSlot.style.top = dp.y + '%';
      deckSlot.style.transform = 'translate(-50%,-50%)';
    }
    if (discardSlot) {
      discardSlot.style.left = xp.x + '%';
      discardSlot.style.top = xp.y + '%';
      discardSlot.style.transform = 'translate(-50%,-50%)';
    }
    el.deckCount.textContent = st.piles.filter((p) => p.id === 'main').reduce((n, p) => n + p.count, 0) || st.piles.reduce((n, p) => n + p.count, 0);
    const mainPile = st.piles.find((p) => p.id === 'main');
    const bh = mainPile && mainPile.count
      ? '<div class="back" style="border:1px solid #f4e9d0;box-shadow:2px 2px 0 0 #6b1c1c,4px 4px 0 0 #5c1616,6px 6px 0 0 #4d1212,0 3px 8px rgba(0,0,0,.45)"></div>'
      : '';
    if (el.deckPile.innerHTML !== bh) el.deckPile.innerHTML = bh;
    const livePiles = st.piles.filter((p) => p.count > 0).length;
    el.deckCount.style.display = livePiles > 1 ? 'none' : '';
    if (st.mode === 'poker') el.splitBtn.disabled = livePiles >= 4;
    el.playersLabel.textContent = st.players.length + ' 人 · ' +
      (st.mode === 'poker' ? '扑克' : (st.gameName || '三国杀'));

    renderMe(st);
    renderSeats(st);
    renderTableCards(st);
    renderDiscard(st);
    renderPiles(st);
    renderHand(st);
    renderZones(st);
    paintMid(st);
    sweepCards(st);
    applyGear(st);
    renderDraft(st);
    /* 刚放下的牌（乐观集合里的）强制重画一次：换父节点的牌在部分机器上不会自动重绘 */
    if (S.optimistic && S.optimistic.size) {
      for (const id of S.optimistic.keys()) {
        const d = POOL.get(id);
        if (!d || !d.parentNode) continue;
        if (d.closest('#handZone')) continue;
        kickPaint(d);
      }
    }
    paintChips(st);
    updateDbg(st);
  }

  /* 排查用：地址后面加 ?dbg=1 才显示。桌面牌的状态数 / 画面数 / 被设成透明的张数 */
  function updateDbg(st) {
    if (location.search.indexOf('dbg') < 0) return;
    let box = document.getElementById('dbgBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dbgBox';
      box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;padding:4px 8px;border-radius:6px;' +
        'background:rgba(0,0,0,.72);color:#ffd479;font:12px/1.5 Consolas,monospace;pointer-events:none';
      document.body.appendChild(box);
    }
    const cards = [...el.cardsLayer.querySelectorAll('.card')];
    const tf = el.table.getBoundingClientRect();
    const hidden = cards.filter((d) => d.style.opacity === '0').length;
    const outside = cards.filter((d) => {
      const r = d.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      return !(cx > tf.left + 2 && cx < tf.right - 2 && cy > tf.top + 2 && cy < tf.bottom - 2);
    }).length;
    const zero = cards.filter((d) => { const r = d.getBoundingClientRect(); return r.width < 5 || r.height < 5; }).length;
    const covered = cards.filter((d) => {
      const r = d.getBoundingClientRect(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const top = document.elementFromPoint(cx, cy);
      if (!top) return true;
      return top !== d && !d.contains(top);
    }).length;
    box.textContent = `桌面牌 状态${st.tableCards.length} 画面${cards.length} 透明${hidden} | 手牌${st.handCards.length} 乐观${S.optimistic.size} | 越界${outside} 零尺寸${zero} 被盖${covered}`;
    const nowT = Date.now();
    if (nowT - (S.__dbgPush || 0) > 1500) {
      S.__dbgPush = nowT;
      try {
        fetch('/api/diag', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            tag: 'dbg', stateCount: st.tableCards.length,
            go: { outside, zero, covered, hidden },
            dom: cards.map((d) => {
              const r = d.getBoundingClientRect(); const cs = getComputedStyle(d);
              return { id: d.dataset.id, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
                op: cs.opacity, vis: cs.visibility, disp: cs.display, z: cs.zIndex, cls: d.className };
            }),
          }),
        });
      } catch (e) {}
    }
  }

  function heartSVG() {
    return '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.7-9.6-9A5.6 5.6 0 0 1 12 5.7 5.6 5.6 0 0 1 21.6 12c-2.1 4.3-9.6 9-9.6 9z" stroke-width="1.4"/></svg>';
  }

  function shieldSVG() {
    return '<svg viewBox="0 0 24 24"><path d="M12 2.6 20 6v6.2c0 4.8-3.3 8-8 9.2-4.7-1.2-8-4.4-8-9.2V6z" stroke-width="1.4"/><path d="M8.6 12.1 11 14.5l4.4-4.6" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }


  /* 一把刀从右上砍到左下：裂痕先从右上出现、一路划到左下，停一会儿，
     再从右上那一端开始慢慢愈合，直到整条消失。可以划到黑框外面。 */
  function bladeCut(panel) {
    const b = panel.getBoundingClientRect();
    if (b.width < 40) return;
    const padX = 190, padY = 150;
    const left = Math.max(-40, b.left - padX);
    const top = Math.max(-40, b.top - padY);
    const w = b.width + padX * 2, h = b.height + padY * 2;
    const oldFx = document.querySelector('.blade-fx');
    if (oldFx) oldFx.remove();
    const NS = 'http://www.w3.org/2000/svg';
    let svg;
    try { svg = document.createElementNS(NS, 'svg'); } catch (err) { return; }
    svg.setAttribute('class', 'blade-fx');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.style.cssText = 'position:fixed;left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h +
      'px;pointer-events:none;z-index:9500;overflow:visible';
    const x0 = w * 0.88, y0 = h * 0.06, x1 = w * 0.10, y1 = h * 0.94;
    const N = 10, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const mid = (i === 0 || i === N) ? 0 : 1;
      pts.push([x0 + (x1 - x0) * t + Math.sin(i * 2.9) * w * 0.024 * mid,
                y0 + (y1 - y0) * t + Math.cos(i * 3.3) * h * 0.055 * mid]);
    }
    const toPath = (arr) => 'M' + arr.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    const main = toPath(pts);
    const line = (d, wd, color, op, blur) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color); p.setAttribute('stroke-width', wd);
      p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('opacity', op);
      p.style.filter = blur ? 'drop-shadow(0 0 ' + blur + 'px rgba(255,110,70,.95))' : '';
      svg.appendChild(p); return p;
    };
    const halo = line(main, 11, '#ff7a48', '.5', 14);
    const glow = line(main, 4.6, '#ffd0a8', '.9', 6);
    const core = line(main, 2, '#fff', '1', 4);
    /* 分叉：从主痕上伸出几根细碎的小裂纹 */
    const branches = [];
    [0.3, 0.48, 0.64, 0.8].forEach((t, i) => {
      const idx = Math.round(t * N);
      const p0 = pts[idx];
      const dir = (i % 2 ? 1 : -1);
      const bp = [[p0[0], p0[1]]];
      let cx = p0[0], cy = p0[1];
      for (let k = 1; k <= 3; k++) {
        cx += dir * (w * 0.035) + Math.sin(k * 2.1 + i) * 6;
        cy += (k % 2 ? -1 : 1) * (h * 0.05) + h * 0.02;
        bp.push([cx, cy]);
      }
      branches.push(line(toPath(bp), 1.4, '#fff', '.85', 4));
    });
    document.body.appendChild(svg);
    const L = core.getTotalLength() || 1;
    const bLen = branches.map((p) => { try { return p.getTotalLength(); } catch (e) { return 1; } });
    const total = 1000 + Math.random() * 500;      /* 每次 1.0~1.5 秒，长长短短 */
    const GROW = total * 0.30, HOLD = total * 0.30, HEAL = total * 0.32, TAIL = total * 0.08;
    const t0 = performance.now();
    const ease = (x) => 1 - Math.pow(1 - x, 2.2);
    const setPath = (p, len, off) => {
      p.setAttribute('stroke-dasharray', len.toFixed(1) + ' ' + (L + 20).toFixed(1));
      p.setAttribute('stroke-dashoffset', off.toFixed(1));
    };
    const tick = (now) => {
      const el = now - t0;
      let len = L, off = 0, fade = 1;
      if (el < GROW) { len = L * ease(el / GROW); off = 0; }
      else if (el < GROW + HOLD) { len = L; off = 0; }
      else if (el < GROW + HOLD + HEAL) {
        const k = ease((el - GROW - HOLD) / HEAL);
        len = L; off = -L * k;               /* 从右上那一端（起点）开始愈合 */
      } else {
        const k = (el - GROW - HOLD - HEAL) / TAIL;
        fade = Math.max(0, 1 - k);
        off = -L;
      }
      [halo, glow, core].forEach((p) => {
        p.setAttribute('stroke-dasharray', len.toFixed(1) + ' ' + (L + 20).toFixed(1));
        p.setAttribute('stroke-dashoffset', off.toFixed(1));
        p.setAttribute('opacity', (fade * (p === halo ? 0.5 : (p === glow ? 0.9 : 1))).toFixed(2));
      });
      branches.forEach((p, i) => {
        const bl = bLen[i] || 1;
        const st = 200 + i * 95;
        const bk = Math.min(1, Math.max(0, (el - st) / 240));
        p.setAttribute('stroke-dasharray', (bl * bk).toFixed(1) + ' ' + (bl + 10).toFixed(1));
        p.setAttribute('stroke-dashoffset', '0');
        p.setAttribute('opacity', (bk * fade * 0.85).toFixed(2));
      });
      if (el < total) requestAnimationFrame(tick); else svg.remove();
    };
    requestAnimationFrame(tick);
  }
  let hpHitT = 0, hpHitN = 0;
  /* 扣血：面板只闪光不位移（不然按不到血格）；刀光用 body 上的固定覆盖层，永远在最上层 */
  function hpFx(panel, delta) {
    if (!panel || !delta) return;
    const now = Date.now();
    if (delta < 0) {
      hpHitN = (now - hpHitT < 5000) ? hpHitN + 1 : 1;
      hpHitT = now;
      const amp = Math.min(11, 3.2 + hpHitN * 2.2);
      panel.style.setProperty('--amp', amp.toFixed(1) + 'px');
      panel.classList.remove('hp-hit'); void panel.offsetWidth; panel.classList.add('hp-hit');
      if (hpHitN >= 2) {
        panel.style.setProperty('--crumble', (1000 + Math.random() * 500).toFixed(0) + 'ms');
        panel.classList.remove('hp-crumble'); void panel.offsetWidth; panel.classList.add('hp-crumble');
        bladeCut(panel);
      }
    } else {
      const b = panel.getBoundingClientRect();
      const f = document.createElement('span');
      f.className = 'hp-heal';
      f.style.position = 'fixed';
      f.style.left = (b.left + b.width / 2) + 'px';
      f.style.top = (b.top + 2) + 'px';
      f.textContent = '+' + delta;
      document.body.appendChild(f);
      setTimeout(function () { f.remove(); }, 1200);
    }
  }

  function hpHTML(p, interactive) {
    const max = Math.max(1, Math.min(1000, p.maxHp));
    const hp = Math.max(0, Math.min(p.hp, max));
    const armor = Math.max(0, Math.min(5, p.armor || 0));
    let shields = '';
    for (let i = 0; i < armor; i++) shields += `<span class="shield">${shieldSVG()}</span>`;
    if (max <= 10) {
      let s = '<div class="hp-row" data-hp="1">';
      for (let i = 0; i < max; i++) s += `<span class="heart ${i < hp ? 'full' : 'empty'}" data-i="${i}">${heartSVG()}</span>`;
      s += `<span class="hpnum">${hp}/${max}</span>${shields}</div>`;
      return s;
    }
    return `<div class="hp-row" data-hp="1"><span class="heart ${hp > 0 ? 'full' : 'empty'}">${heartSVG()}</span>` +
      `<span class="hpnum">${hp} / ${max}</span>${shields}</div>`;
  }

  function renderMe(st) {
    const me = st.players.find((p) => p.id === st.meId);
    if (!me) return;
    el.meName.textContent = me.name;
    const mePanelEl = document.getElementById('mePanel');
    if (mePanelEl) {
      mePanelEl.classList.toggle('lord', !!st.landlordId && st.landlordId === st.meId);
      mePanelEl.classList.toggle('farmer', !!st.landlordId && st.landlordId !== st.meId);
    }
    const meHpPrev = S.meHpPrev;
    el.meHp.innerHTML = hpHTML(me);
    { const hb = document.querySelector('#mePanel .handbadge b'); if (hb) hb.textContent = String(me.handCount || 0); }
    if (meHpPrev !== undefined && meHpPrev !== me.hp) hpFx(document.getElementById('mePanel') || el.meHp, me.hp - meHpPrev);
    S.meHpPrev = me.hp;
    let armorEl = document.getElementById('meArmor');
    if (!armorEl) {
      const wrap = document.createElement('div');
      wrap.className = 'armor-ctl';
      wrap.innerHTML = '<button class="ar-btn" data-d="-1">▾</button><b id="meArmor">0</b>' +
        '<button class="ar-btn" data-d="1">▴</button><span class="ar-lab">护盾</span>';
      const btns = document.querySelector('.hp-btns');
      if (btns) btns.after(wrap); else el.meHp.after(wrap);
      wrap.addEventListener('click', (ev) => {
        const b = ev.target.closest('.ar-btn'); if (!b) return;
        S.socket.emit('armor', { delta: Number(b.dataset.d) });
      });
      armorEl = document.getElementById('meArmor');
    }
    armorEl.textContent = String(me.armor || 0);
    el.meHp.querySelectorAll('.heart').forEach((h) => h.addEventListener('click', () => {
      const idx = Number(h.dataset.i);
      const isFull = h.classList.contains('full');
      if (Number.isNaN(idx)) return;
      S.socket.emit('hp', { playerId: me.id, delta: isFull ? -1 : 1 });
    }));
    if (me.maxHp > 10) {
      if (!$('#hpBig')) {
        const div = document.createElement('div');
        div.id = 'hpBig'; div.className = 'hp-actions';
        div.innerHTML = '<button data-d="-1">扣血</button><button data-d="1">回血</button>';
        el.meHp.parentNode.insertBefore(div, el.meHp.nextSibling);
        div.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          S.socket.emit('hp', { playerId: me.id, delta: Number(b.dataset.d) });
        });
      }
    } else { const d = $('#hpBig'); if (d) d.remove(); }
  }

  function renderSeats(st) {
    const seen = new Set();
    for (const p of st.players) {
      if (p.id === st.meId) continue;
      seen.add(p.id);
      let node = S.seatEls.get(p.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'seat';
        node.innerHTML = '<div class="hero-box"><img class="hero-thumb" alt="" hidden>' +
          '<button class="chain cbtn" title="铁索"></button></div>' +
          '<div class="s-top"><div class="head"><div class="sname"></div></div>' +
          '<div class="pbar">' +
          '<div class="hpwrap"><div class="hp-row"></div></div>' +
          '<span class="handbadge"><i class="mini"></i><b>0</b></span></div></div>' +
          '<div class="chipmini"></div>' +
          '<div class="vside"><span class="vs-name"></span><span class="vs-hand"></span></div>' +
          '<div class="front"><div class="equip"></div><div class="frontzone" data-idx="0"></div><div class="frontzone" data-idx="1"></div></div>' +
          '<div class="host-ctl" hidden><button data-act="a-">-盾</button><button data-act="a+">+盾</button>' +
          '<button data-act="m-">-上限</button><button data-act="m+">+上限</button></div>';
        node.addEventListener('click', (ev) => {
          const st = S.state; if (!st) return;
          const pid = node.dataset.pid;
          const ch = ev.target.closest('.chain');
          if (ch) return S.socket.emit('op', { type: 'chain', playerId: pid });
          const ht = ev.target.closest('.hero-thumb');
          if (ht) return heroZoom(ht.dataset.hero);
          const fzc = ev.target.closest('.frontzone .zcard');
          if (fzc) return S.socket.emit('op', { type: 'frontFlip', id: fzc.dataset.card });
          const st_ = S.state; if (!st_ || st_.hostId !== st_.meId) return;
          const btn = ev.target.closest('[data-act]');
          if (btn) {
            const a = btn.dataset.act;
            if (a === 'a+') return S.socket.emit('armor', { playerId: pid, delta: 1 });
            if (a === 'a-') return S.socket.emit('armor', { playerId: pid, delta: -1 });
            if (a === 'm+') return S.socket.emit('maxHp', { playerId: pid, delta: 1 });
            if (a === 'm-') return S.socket.emit('maxHp', { playerId: pid, delta: -1 });
            return;
          }
          if (ev.target.closest('.shield')) return S.socket.emit('armor', { playerId: pid, delta: -1 });
          const h = ev.target.closest('.heart');
          if (h) return S.socket.emit('hp', { playerId: pid, delta: h.classList.contains('full') ? -1 : 1 });
        });
        node.addEventListener('dblclick', (ev) => {
          const cell = ev.target.closest('.eq');
          if (!cell) return;
          const pid = cell.dataset.owner || node.dataset.pid;
          const locked = !!S.state.players.find((x) => x.id === pid)?.equipLocked?.[cell.dataset.slot];
          S.socket.emit('op', { type: 'equipLock', ownerId: pid, slot: cell.dataset.slot, locked: !locked });
        });
        el.seatsLayer.appendChild(node);
        S.seatEls.set(p.id, node);
      }
      node.dataset.pid = p.id;
      node.dataset.rot = String((((SEAT_ANGLE[p.seat] || 0) - (S.rot || 0)) + 360) % 360);
      const wpt = SEAT_WORLD[p.seat] || SEAT_WORLD[0];
      const spt = toScreen(wpt.x, wpt.y);
      node.style.left = spt.x + '%';
      node.style.top = spt.y + '%';
      node.style.transform = 'translate(-50%,-50%)';
      node.style.marginLeft = '0px';
      node.style.marginTop = '0px';
      { /* 座位面板不许跑出屏幕 */
        const rr = node.getBoundingClientRect();
        const mm = 6;
        let dx = 0, dy = 0;
        if (rr.left < mm) dx = mm - rr.left;
        else if (rr.right > window.innerWidth - mm) dx = window.innerWidth - mm - rr.right;
        if (rr.top < mm) dy = mm - rr.top;
        else if (rr.bottom > window.innerHeight - mm) dy = window.innerHeight - mm - rr.bottom;
        if (dx) node.style.marginLeft = dx + 'px';
        if (dy) node.style.marginTop = dy + 'px';
      }
      node.querySelector('.sname').textContent = p.name;
      const vsn = node.querySelector('.vs-name'); if (vsn) vsn.textContent = p.name;
      const vsh = node.querySelector('.vs-hand'); if (vsh) vsh.textContent = p.handCount;
      const th = node.querySelector('.hero-thumb');
      if (th) {
        if (p.hero) {
          if (th.dataset.hero !== p.hero) {
            th.src = 'heroes/thumbs/' + encodeURIComponent(p.hero) + '.jpg';
            th.dataset.hero = p.hero;
          }
          th.hidden = false;
        } else { th.hidden = true; delete th.dataset.hero; }
        if (window.applyHornFx) window.applyHornFx(node.querySelector('.hero-box'), p.hero);
      }
      const hpRow = node.querySelector('.hp-row');
      const hpKey = p.hp + '/' + p.maxHp + '/' + (p.armor || 0);
      if (hpRow.dataset.key !== hpKey) {
        const prevHp = Number(hpRow.dataset.hp || '');
        hpRow.dataset.key = hpKey;
        hpRow.innerHTML = hpHTML(p).replace(/class="hp-row"[^>]*/, '');
        if (prevHp !== '' && prevHp !== p.hp) hpFx(node, p.hp - prevHp);
        hpRow.dataset.hp = String(p.hp);
      }
      paintZones(node, p);
      /* 地主/农民光晕（只在地主类玩法里显示） */
      const isLord = !!st.landlordId && st.landlordId === p.id;
      const isFarmer = !!st.landlordId && st.landlordId !== p.id;
      node.classList.toggle('lord', isLord);
      node.classList.toggle('farmer', isFarmer);
      const hostCtl = node.querySelector('.host-ctl');
      hostCtl.hidden = !(st.hostId === st.meId);
      node.querySelector('.handbadge b').textContent = p.handCount;
      { const vh = node.querySelector('.vs-hand'); if (vh) vh.textContent = p.handCount; }
      const cm = node.querySelector('.chipmini');
      if (cm) {
        const key = JSON.stringify(p.chips || {});
        if (cm.dataset.key !== key) { cm.dataset.key = key; cm.innerHTML = chipMini(p.chips || {}); }
      }
      /* 座位面板比牌大，按百分比摆完再把整个面板挪回桌面范围内 */
      const tr = el.table.getBoundingClientRect();
      const r = node.getBoundingClientRect();
      let dx = 0, dy = 0;
      const topLimit = tr.top + 6;
      const bottomLimit = tr.bottom - 118;
      if (r.top < topLimit) dy = topLimit - r.top;
      else if (r.bottom > bottomLimit) dy = bottomLimit - r.bottom;
      if (r.left < 6) dx = 6 - r.left;
      else if (r.right > tr.right - 6) dx = tr.right - 6 - r.right;
      node.style.transform = (dx || dy)
        ? 'translate(calc(-50% + ' + Math.round(dx) + 'px), calc(-50% + ' + Math.round(dy) + 'px))'
        : 'translate(-50%,-50%)';
    }
    for (const [id, node] of S.seatEls) if (!seen.has(id)) { node.remove(); S.seatEls.delete(id); }
  }

  function renderTableCards(st) {
    for (const c of st.tableCards) {
      const d = cardEl(c);
      if (d.parentNode !== el.cardsLayer) resetCardEl(d);
      if (d.parentNode !== el.cardsLayer) el.cardsLayer.appendChild(d);
      const sp = toScreen(c.x, c.y);
      d.style.position = 'absolute';
      d.style.left = sp.x + '%';
      d.style.top = sp.y + '%';
      d.style.transform = `translate(-50%,-50%) rotate(${c.r || 0}deg)`;
      d.style.zIndex = String(100 + ((c.z || 0) % 50));
      applyCardName(d, c, false);
      const gh = S.cardEls.get('ghost-' + c.id);
      if (gh) {
        /* 服务端发来真实位置 = 对方已经松手，幽灵立刻撤掉，真牌立刻显示 */
        gh.remove();
        S.cardEls.delete('ghost-' + c.id);
      }
      d.style.opacity = '';
    }
    for (const [id, gh] of S.cardEls) {
      if (id.indexOf('ghost-') !== 0) continue;
      const real = id.slice(6);
      if (!st.tableCards.some((x) => x.id === real)) { gh.remove(); S.cardEls.delete(id); }
    }
  }


  /* 弃牌堆的立体厚度：跟摸牌堆一样，是一叠牌，超过 4 张就从左边/下面露出一层层牌边 */
  function paintDiscardStack(total) {
    const extra = Math.max(0, Math.min(6, total - 4));
    if (!S.dzLayers) S.dzLayers = [];
    while (S.dzLayers.length < extra) {
      const d = document.createElement('div');
      d.className = 'dz-layer';
      el.discardZone.appendChild(d);
      S.dzLayers.push(d);
    }
    while (S.dzLayers.length > extra) S.dzLayers.pop().remove();
    S.dzLayers.forEach((d, i) => {
      d.style.left = (14 - (i + 1) * 2) + 'px';
      d.style.top = '50%';
      d.style.transform = `translate(0,-50%)`;
      d.style.zIndex = String(9 - i);
    });
  }

  function renderDiscard(st) {
    const top = st.discardTop.slice(-4);
    paintDiscardStack(st.discardCount || 0);
    let step = 24;
    top.forEach((c, i) => {
      const d = cardEl(c);
      if (d.parentNode !== el.discardZone) resetCardEl(d);
      if (d.parentNode !== el.discardZone) el.discardZone.appendChild(d);
      d.classList.add('discardcard');
      d.style.position = 'absolute';
      d.style.top = '50%';
      d.style.left = (14 + i * step) + 'px';
      d.style.transform = 'translate(0,-50%) rotate(0deg)';
      d.style.zIndex = String(10 + i);
      applyCardName(d, c, false);
      step = (d.offsetWidth || 49) * 0.5;
    });
    let title = S.discardTitle;
    if (!title) {
      title = document.createElement('div');
      title.className = 'slot-title';
      title.style.top = '50%'; title.style.transform = 'translate(-50%,-50%)';
      el.discardZone.appendChild(title);
      S.discardTitle = title;
    }
    title.style.display = top.length ? 'none' : '';
    title.textContent = st.discardCount ? st.discardCount + ' 张' : '';
    if (el.discardCount) el.discardCount.textContent = (st.discardCount || 0) + ' 张';
  }

  function renderPiles(st) {
    const seen = new Set();
    for (const p of st.piles) {
      if (p.count === 0) continue;
      if (p.id === 'main') continue;
      seen.add(p.id);
      let node = S.pileEls.get(p.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'slot pile';
        node.dataset.pile = p.id;
        node.innerHTML = '<div class="back"></div><span class="count"></span>';
        node.addEventListener('pointerdown', (e) => startPileDrag(e, { id: p.id }));
        el.pilesLayer.appendChild(node);
        S.pileEls.set(p.id, node);
      }
      const sp = toScreen(p.x, p.y);
      node.style.left = sp.x + '%';
      node.style.top = sp.y + '%';
      node.style.transform = 'translate(-50%,-50%)';
      node.style.width = 'var(--cw)';
      node.style.height = 'var(--ch)';
      node.style.cursor = 'grab';
      node.querySelector('.count').textContent = p.count;
    }
    for (const [id, node] of S.pileEls) if (!seen.has(id)) { node.remove(); S.pileEls.delete(id); }
  }

  function renderHand(st) {
    const hand = st.handCards;
    for (const c of hand) {
      const d = cardEl(c);
      if (d.parentNode !== el.hand) resetCardEl(d);
      d.classList.add('hcard');
      d.dataset.hid = c.id;
      if (d.parentNode !== el.hand) el.hand.appendChild(d);
      d.style.position = 'absolute';
      applyCardName(d, c, false);
    }
    /* 按服务端 p.hand 顺序重排 DOM：layoutHand 是按 DOM 顺序摆位的 */
    for (const c of hand) { const d = POOL.get(c.id); if (d) el.hand.appendChild(d); }
    layoutHand();
  }

  function layoutHand() {
    const cards = [...el.hand.querySelectorAll('.hcard')];
    const n = cards.length;
    if (!n) return;
    const cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hcw')) || 84;
    const gap = 6;
    const avail = Math.max(cw + 20, el.hand.clientWidth - 90);
    let step = cw + gap;
    if (n > 1) step = Math.min(cw + gap, Math.max(cw * 0.42, (avail - cw) / (n - 1)));
    if (n > 10) step = Math.min(step, Math.max(cw * 0.42, (cw * 10) / (n - 0.6)));
    const total = cw + step * (n - 1);
    const start = -total / 2 + cw / 2;
    const gi = dragging && dragging.kind === 'hand' ? S.handGapIndex : -1;
    cards.forEach((d, i) => {
      let x = start + step * i;
      if (gi >= 0 && i >= gi) x += Math.min(cw * 0.55, step * 0.6);
      const held = S.dropHold && S.dropHold.id === d.dataset.id && Date.now() - S.dropHold.ts < 400;
      if (held) d.style.transition = 'none';
      const hot = !held && S.hoverId && d.dataset.id === S.hoverId;
      d.style.position = 'absolute';
      d.style.left = '50%';
      d.style.zIndex = String(hot ? 60 : 10 + i);
      const lift = d.classList.contains('selected') ? -14 : (hot ? -16 : 0);
      d.style.transform = `translateX(calc(${x.toFixed(1)}px - 50%))` + (lift ? ` translateY(${lift}px)` : '');
    });
  }

  /* 手牌悬停：像斗地主那样"鼠标压到哪张哪张抬起来"，抬起来的同时压在上面 */
  el.hand.addEventListener('pointerover', (e) => {
    const d = e.target.closest && e.target.closest('.hcard');
    const id = d ? d.dataset.id : null;
    if (id === S.hoverId) return;
    S.hoverId = id;
    layoutHand();
  });
  el.hand.addEventListener('pointerleave', () => {
    if (!S.hoverId) return;
    S.hoverId = null;
    layoutHand();
  });

  /* ---------------- drag ---------------- */
  let dragging = null;
  let lastZoneDragAt = 0;
  /* 强制重画：有些机器上新插入/刚移动的元素不会立刻画出来（牌放下了却看不见，
     点一下别的地方才冒出来）。这里给元素和桌面各来一次"几乎看不见的透明度闪动"，
     逼浏览器把这一块重新合成一遍。 */
  function kickPaint(d) {
    if (!d) return;
    d.style.opacity = '0.999';
    void d.offsetWidth;
    requestAnimationFrame(() => {
      d.style.opacity = '';
      const t = el.table;
      if (!t) return;
      t.style.opacity = '0.999';
      void t.offsetHeight;
      requestAnimationFrame(() => { t.style.opacity = ''; });
    });
  }

  /* 放下牌时先把这张牌挪到落点，不等服务器回包，手感更跟手 */
  function optimisticPlace(d, wx, wy) {
    if (!d) return;
    const sp = toScreen(wx, wy);
    d.style.left = sp.x + '%';
    d.style.top = sp.y + '%';
    d.style.opacity = '';
    if (d.dataset.id) S.optimistic.set(d.dataset.id, Date.now());
    kickPaint(d);
  }

  /* 松手瞬间就把牌画到桌上（不等服务器回包），所以不会"先消失一下再出现" */
  function dropToTable(d, wx, wy) {
    const id = d && d.dataset.id;
    if (!id) return;
    const st = S.state || {};
    const c = [].concat(st.handCards || [], st.tableCards || [], st.mid || []).find((x) => x.id === id);
    if (!c) return;
    /* 新建一个元素交给桌面：直接搬动旧节点时，部分显卡/浏览器不会重绘这一层
       （表现就是"牌放下去不显示，点一下别的地方才冒出来"） */
    const nd = makeCardEl(c);
    nd.style.position = 'absolute';
    nd.style.zIndex = '120';
    nd.style.transform = 'translate(-50%,-50%)';
    const old = POOL.get(id);
    if (old && old !== nd) old.remove();
    POOL.set(id, nd);
    if (nd.parentNode !== el.cardsLayer) el.cardsLayer.appendChild(nd);
    optimisticPlace(nd, wx, wy);
    /* 强制重绘一次：个别显卡/浏览器对"新插入的定位元素"不会立刻重绘那一层 */
    nd.style.display = 'none';
    void nd.offsetWidth;
    nd.style.display = '';
  }

  function pointToWorld(clientX, clientY) {
    const r = el.table.getBoundingClientRect();
    const sx = 50 + ((clientX - (r.left + r.width / 2)) / r.width) * 100;
    const sy = 50 + ((clientY - (r.top + r.height / 2)) / r.height) * 100;
    return toWorld(sx, sy);
  }

  function overRect(elm, x, y) {
    const r = elm.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  // 指针落在哪个牌堆上（主牌堆或分开的子堆），返回 pileId 或 null
  function pileAt(x, y) {
    const candidates = [el.deckPile, ...document.querySelectorAll('#pilesLayer .pile')];
    for (const node of candidates) {
      if (!node) continue;
      if (overRect(node, x, y)) return node.dataset.pile || 'main';
    }
    return null;
  }

  function onCardDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const d = e.currentTarget;
    const id = d.dataset.id;
    const st = S.state; if (!st) return;
    const inZone = d.closest && (d.closest('.frontzone') || d.closest('#midZone') || d.closest('.eq'));
    if (inZone) {
      /* 门前区 / 中央手牌区 / 装备格：按住拖动可以拿出来，轻点才翻面 */
      const zc = zoneCardOf(st, id);
      if (zc) startZonePress(e, d, zc);
      return;
    }
    const c = st.handCards.find((x) => x.id === id);
    if (c) { startHandDrag(e, d, c); return; }
    const t = st.tableCards.find((x) => x.id === id);
    if (t) { startTableDrag(e, d, t); return; }
    const dc = (st.discardTop || []).find((x) => x.id === id);
    if (dc) { startDiscardDrag(e, { ...dc, up: true }); return; }
  }

  function makeGhost(c, clientX, clientY, rotDeg) {
    const g = document.createElement('div');
    g.className = 'card ghost';
    g.dataset.up = String(!(c && c.up === false));
    g.innerHTML = cardFaceHTML(c);
    paintCard(g, c);
    g.style.width = 'var(--cw)';
    g.style.height = 'var(--ch)';
    el.dragLayer.appendChild(g);
    g.classList.add('dragging');
    const move = (x, y) => {
      g.style.left = x + 'px';
      g.style.top = y + 'px';
      g.style.transform = `translate(-50%,-50%) scale(1.03) rotate(${rotDeg}deg)`;
    };
    move(clientX, clientY);
    return { g, move };
  }

  function startTableDrag(e, d, c) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const { g, move } = makeGhost(c, startX, startY, c.r || 0);
    d.style.opacity = '0';
    dragging = { id: c.id, kind: 'table' };
    const onMove = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true;
      move(ev.clientX, ev.clientY);
      S.socket.emit('drag', { id: c.id, x: pointToWorld(ev.clientX, ev.clientY).x, y: pointToWorld(ev.clientX, ev.clientY).y, r: c.r });
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragging = null;
      g.remove();
      if (d) d.style.opacity = '';
      if (!moved) { S.socket.emit('op', { type: 'flip', id: c.id }); return; }
      const ec = equipAt(ev.clientX, ev.clientY);
      if (ec) { S.socket.emit('op', { type: 'equip', id: c.id, slot: ec.slot, ownerId: ec.ownerId, up: !(c && c.up === false) }); return; }
      const fz = frontAt(ev.clientX, ev.clientY);
      if (fz) { S.socket.emit('op', { type: 'front', id: c.id, ownerId: fz.ownerId, idx: fz.idx, up: c.up }); return; }
      const mz = midAt(ev.clientX, ev.clientY);
      if (mz) { S.socket.emit('op', { type: 'mid', id: c.id, up: c.up }); return; }
      if (overRect(el.hand, ev.clientX, ev.clientY)) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'hand' }); return; }
      if (overRect(el.discardZone, ev.clientX, ev.clientY)) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'discard' }); return; }
      const pd = pileAt(ev.clientX, ev.clientY);
      if (pd) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'deck', pileId: pd }); return; }
      const w = pointToWorld(ev.clientX, ev.clientY);
      optimisticPlace(d, w.x, w.y);
      S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'table', x: w.x, y: w.y, r: c.r, up: c.up });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startHandDrag(e, d, c) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const { g, move } = makeGhost(c, startX, startY, 0);
    d.style.opacity = '0';
    dragging = { id: c.id, kind: 'hand' };
    const onMove = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true;
      move(ev.clientX, ev.clientY);
      if (moved) {
        const now = Date.now();
        if (now - (startHandDrag._t || 0) > 60) {
          startHandDrag._t = now;
          const w = pointToWorld(ev.clientX, ev.clientY);
          S.socket.emit('drag', { id: c.id, x: w.x, y: w.y, r: 0 });
        }
        const others = [...el.hand.querySelectorAll('.hcard')].filter((x) => x !== d);
        let idx = others.length;
        for (let i = 0; i < others.length; i++) {
          const r = others[i].getBoundingClientRect();
          if (ev.clientX < r.left + r.width / 2) { idx = i; break; }
        }
        if (S.handGapIndex !== idx) { S.handGapIndex = idx; layoutHand(); }
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragging = null;
      S.handGapIndex = -1;
      g.remove();
      d.style.opacity = '';
      if (!moved) {
        /* 单击 = 翻面：翻过来的牌谁都看不到（包括自己），点第二次再翻回来 */
        S.socket.emit('op', { type: 'flip', id: c.id });
        return;
      }
      const mz = midAt(ev.clientX, ev.clientY);
      if (mz) { S.socket.emit('op', { type: 'mid', id: c.id, up: c.up }); return; }
      if (overRect(el.hand, ev.clientX, ev.clientY)) {
        const others = [...el.hand.querySelectorAll('.hcard')].filter((x) => x !== d);
        let idx = others.length;
        for (let i = 0; i < others.length; i++) {
          const r = others[i].getBoundingClientRect();
          if (ev.clientX < r.left + r.width / 2) { idx = i; break; }
        }
        S.dropHold = { id: c.id, ts: Date.now() };
        d.style.transition = 'none';
        S.socket.emit('op', { type: 'reorderHand', id: c.id, index: idx });
        return;
      }
      if (overRect(el.discardZone, ev.clientX, ev.clientY)) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'discard' }); return; }
      const ec2 = equipAt(ev.clientX, ev.clientY);
      if (ec2) { S.socket.emit('op', { type: 'equip', id: c.id, slot: ec2.slot, ownerId: ec2.ownerId, up: !(c && c.up === false) }); return; }
      const sc2 = frontAt(ev.clientX, ev.clientY);
      if (sc2) { S.socket.emit('op', { type: 'front', id: c.id, ownerId: sc2.ownerId, idx: sc2.idx, up: c.up }); return; }
      const pd = pileAt(ev.clientX, ev.clientY);
      if (pd) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'deck', pileId: pd }); return; }
      const w = pointToWorld(ev.clientX, ev.clientY);
      dropToTable(d, w.x, w.y);
      S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'table', x: w.x, y: w.y, r: 0, up: c.up });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startDiscardDrag(e, c) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const { g, move } = makeGhost({ ...c, up: true }, startX, startY, 0);
    const src = POOL.get(c.id) || null;
    if (src) src.style.opacity = '0.25';
    dragging = { id: c.id, kind: 'discard' };
    let lastEmit = 0;
    const onMove = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true;
      move(ev.clientX, ev.clientY);
      if (moved) {
        const now = Date.now();
        if (now - lastEmit > 60) {
          lastEmit = now;
          const w = pointToWorld(ev.clientX, ev.clientY);
          S.socket.emit('drag', { id: c.id, x: w.x, y: w.y, r: 0 });
        }
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragging = null;
      g.remove();
      if (src) src.style.opacity = '';
      if (!moved) return;
      if (overRect(el.hand, ev.clientX, ev.clientY)) {
        S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'hand' });
        return;
      }
      if (overRect(el.discardZone, ev.clientX, ev.clientY)) return;
      const ec3 = equipAt(ev.clientX, ev.clientY);
      if (ec3) { S.socket.emit('op', { type: 'equip', id: c.id, slot: ec3.slot, ownerId: ec3.ownerId, up: !(c && c.up === false) }); return; }
      const sc3 = frontAt(ev.clientX, ev.clientY);
      if (sc3) { S.socket.emit('op', { type: 'front', id: c.id, ownerId: sc3.ownerId, idx: sc3.idx }); return; }
      const pd = pileAt(ev.clientX, ev.clientY);
      if (pd) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'deck', pileId: pd }); return; }
      const w = pointToWorld(ev.clientX, ev.clientY);
      S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'table', x: w.x, y: w.y, r: 0, up: true });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startPileDrag(e, pile) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const ghost = document.createElement('div');
    ghost.className = 'card down';
    ghost.innerHTML = '<div class="back"></div>';
    ghost.style.cssText = 'position:fixed;width:var(--cw);height:var(--ch);left:' + startX + 'px;top:' + startY +
      'px;transform:translate(-50%,-50%) scale(1.03);z-index:9500;pointer-events:none;' +
      'filter:drop-shadow(0 12px 16px rgba(0,0,0,.5))';
    document.body.appendChild(ghost);
    const place = (x, y) => { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; };
    const onMove = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 3) moved = true;
      place(ev.clientX, ev.clientY);
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      ghost.remove();
      el.deckPile.classList.add('press');
      setTimeout(() => el.deckPile.classList.remove('press'), 160);
      if (!moved) { S.socket.emit('op', { type: 'draw', pileId: pile.id, targetZone: 'hand' }); return; }
      if (overRect(el.hand, ev.clientX, ev.clientY)) { S.socket.emit('op', { type: 'draw', pileId: pile.id, targetZone: 'hand' }); return; }
      if (overRect(el.discardZone, ev.clientX, ev.clientY)) { S.socket.emit('op', { type: 'draw', pileId: pile.id, targetZone: 'discard' }); return; }
      const fzDrop = frontAt(ev.clientX, ev.clientY);
      if (fzDrop) {
        S.socket.emit('op', {
          type: 'draw', pileId: pile.id, targetZone: 'front',
          ownerId: fzDrop.ownerId, idx: fzDrop.idx
        });
        return;
      }
      const w = pointToWorld(ev.clientX, ev.clientY);
      S.socket.emit('op', { type: 'draw', pileId: pile.id, targetZone: 'table', x: w.x, y: w.y, r: 0 });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // 牌堆顶部也可以整叠拿起
  el.deckPile.addEventListener('pointerdown', (e) => {
    if (!S.state) return;
    e.preventDefault();
    startPileDrag(e, { id: 'main' });
  });

  function onRemoteDrag(d) {
    /* 自己拖牌的回声（服务器重连后可能把 drag 发回给本人）：一律忽略，
       否则刚放下的那张会被当成"别人正在拖"而藏起来 = "最新放的那张消失" */
    if (S.myDrag && S.myDrag.id === d.id && Date.now() - S.myDrag.ts < 3000) return;
    if (dragging && dragging.id === d.id) return;
    /* 自己手里的牌不可能被别人拖走：这类消息一定是回声/脏数据，忽略 */
    if (S.state && (S.state.handCards || []).some((x) => x.id === d.id)) return;
    sendDiag('rdrag ' + d.id);
    const c = S.state && S.state.tableCards.find((x) => x.id === d.id);
    let g = S.cardEls.get('ghost-' + d.id);
    if (!g) {
      if (c) {
        g = makeCardEl(c);
      } else {
        g = document.createElement('div');
        g.className = 'card down';
        g.innerHTML = '<div class="back"></div>';
        g.dataset.ph = '1';
      }
      g.dataset.ghost = '1';
      g.style.opacity = '.9';
      g.style.transition = 'none';
      g.style.zIndex = '200';
      el.cardsLayer.appendChild(g);
      S.cardEls.set('ghost-' + d.id, g);
    }
    g.style.left = d.x + '%';
    g.style.top = d.y + '%';
    g.style.transform = `translate(-50%,-50%) rotate(${Number(d.r) || 0}deg)`;
    g.dataset.t = String(Date.now());
    /* 对方正拿着这张牌：原地的真牌先藏起来，屏幕上只有他手里那一张 */
    const realEl = POOL.get(d.id);
    if (realEl) { realEl.style.opacity = '0'; S.hideUntil.set(d.id, Date.now() + 1200); }
    clearTimeout(onRemoteDrag['t' + d.id]);
    onRemoteDrag['t' + d.id] = setTimeout(() => {
      const gg = S.cardEls.get('ghost-' + d.id);
      if (gg) { gg.remove(); S.cardEls.delete('ghost-' + d.id); }
      /* 对方松手了：原地真牌必须恢复，否则这张牌会一直隐身 */
      const r2 = POOL.get(d.id);
      if (r2) r2.style.opacity = '';
      S.remoteDrag.delete(d.id);
    }, 2600);
    S.remoteDrag.set(d.id, Date.now());
  }

  /* 兜底：任何原因导致的"牌被设成透明却没人复原"，250ms 内自动救回来。
     语义很简单：只要服务器说这张牌在桌上/在弃牌堆/在我手上，它就必须能被看见。 */
  setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of S.remoteDrag) {
      if (now - ts > 2500) {
        S.remoteDrag.delete(id);
        const r = POOL.get(id);
        if (r) r.style.opacity = '';
      }
    }
    for (const [id, until] of S.hideUntil) if (now > until + 400) S.hideUntil.delete(id);
    const heldId = dragging && dragging.id;
    for (const [id, d] of POOL) {
      if (!d || d.style.opacity !== '0') continue;
      if (id === heldId) continue;
      if (String(id).indexOf('ghost-') === 0) continue;
      if (S.remoteDrag.has(id)) continue;
      if ((S.hideUntil.get(id) || 0) > now) continue;
      d.style.opacity = '';
    }
  }, 250);

  /* ---------------- 第二期：装备区 / 特殊区 / 铁索 / 选将 ---------------- */
  const EQUIP_SLOTS = ['weapon', 'armor', 'plus', 'minus'];
  const EQUIP_LABELS = { weapon: '武器', armor: '防具', plus: '加一', minus: '减一' };

  // 门前区的一张牌：和手牌一样是完整牌面（点数/花色/名字），所有人可见
  function zoneCardHTML(c) {
    if (!c) return '';
    const red = c.suit === '♥' || c.suit === '♦';
    const down = c.up === false;
    return `<div class="card zc${red ? ' s-red' : ''}${down ? ' down' : ''}">` +
      '<div class="back"></div>' + (down ? '' : cardHTML(c)) + '</div>';
  }

  // 给「铁索 + 装备 4 格 + 特殊 6 格」上色（自己 / 别人共用）
  function paintZones(root, p) {
    root.classList.toggle('chained', !!p.chained);
    const bar = root.querySelector('.pbar');
    if (bar) bar.classList.toggle('chained', !!p.chained);
    const ch = root.querySelector('.chain');
    if (ch) ch.classList.toggle('on', !!p.chained);

    /* 装备 4 格：格子元素建一次就复用，里面只换牌 */
    const eqBox = root.querySelector('.equip');
    if (eqBox) {
      eqBox.dataset.owner = p.id;
      if (eqBox.children.length !== EQUIP_SLOTS.length) {
        eqBox.innerHTML = EQUIP_SLOTS.map((slot) => '<div class="eq" data-slot="' + slot + '" data-owner="' + p.id + '"><span class="eq-lab">' + EQUIP_LABELS[slot] + '</span></div>').join('');
      }
      EQUIP_SLOTS.forEach((slot) => {
        const cell = eqBox.querySelector('.eq[data-slot="' + slot + '"]');
        if (!cell) return;
        const c = p.equip && p.equip[slot];
        const locked = !!(p.equipLocked && p.equipLocked[slot]);
        cell.dataset.owner = p.id;
        cell.classList.toggle('filled', !!c);
        cell.classList.toggle('locked', locked);
        cell.title = EQUIP_LABELS[slot] + (locked ? '（已锁，双击解锁）' : '（双击锁定）');
        const lab = cell.querySelector('.eq-lab');
        if (lab) lab.style.display = c ? 'none' : '';
        const cur = cell.querySelector('.card');
        if (c) {
          const d = cardEl(c);
          if (d.parentNode !== cell) resetCardEl(d);
          if (cur && cur !== d) cur.remove();
          if (d.parentNode !== cell) cell.appendChild(d);
          d.classList.add('zc');
          d.style.position = 'relative';
          d.style.left = 'auto'; d.style.top = 'auto'; d.style.transform = 'none'; d.style.zIndex = '';
          applyCardName(d, c, true);
        } else if (cur && !S.optimistic.has(cur.dataset.id)) cur.remove();
      });
    }

    /* 两个门前区（三国杀）：别人能放，谁都能看见 */
    const zones = root.querySelectorAll('.frontzone');
    for (let i = 0; i < zones.length; i++) {
      const fz = zones[i];
      const list = ((p.fronts || [])[i] || []).filter(Boolean);
      fz.dataset.owner = p.id;
      fz.dataset.idx = String(i);
      fz.classList.toggle('has', list.length > 0);
      const seen = new Set();
      list.forEach((c) => {
        seen.add(c.id);
        const d = cardEl(c);
        if (d.parentNode !== fz) resetCardEl(d);
        if (d.parentNode !== fz) fz.appendChild(d);
        d.classList.add('zc');
        d.style.position = 'relative';
        d.style.left = 'auto'; d.style.top = 'auto'; d.style.transform = 'none'; d.style.zIndex = '';
        applyCardName(d, c, true);
      });
      for (const child of [...fz.children]) {
        if (child.classList.contains('card') && !seen.has(child.dataset.id) && !S.optimistic.has(child.dataset.id)) child.remove();
      }
      let lab = fz.querySelector('.zone-lab');
      if (!lab) {
        lab = document.createElement('span');
        lab.className = 'zone-lab';
        lab.textContent = '门前区';
        fz.appendChild(lab);
      }
      lab.style.display = list.length ? 'none' : '';
    }
  }

  /* 扑克模式：牌桌正中的公共手牌区 */
  function paintMid(st) {
    const box = document.getElementById('midZone');
    if (!box) return;
    const poker = st.mode === 'poker';
    box.hidden = !poker;
    if (!poker) return;
    const list = (st.mid || []).filter(Boolean);
    box.classList.toggle('has', list.length > 0);
    const seen = new Set();
    list.forEach((c) => {
      seen.add(c.id);
      const d = cardEl(c);
      if (d.parentNode !== box) resetCardEl(d);
      if (d.parentNode !== box) box.appendChild(d);
      d.classList.add('zc');
      d.style.position = 'relative';
      d.style.left = 'auto'; d.style.top = 'auto'; d.style.transform = 'none'; d.style.zIndex = '';
      applyCardName(d, c, true);
    });
    for (const child of [...box.children]) {
      if (child.classList.contains('card') && !seen.has(child.dataset.id) && !S.optimistic.has(child.dataset.id)) child.remove();
    }
    let lab = box.querySelector('.zone-lab');
    if (!lab) {
      lab = document.createElement('span');
      lab.className = 'zone-lab';
      lab.textContent = '公共筹码区';
      box.appendChild(lab);
    }
    lab.style.display = list.length ? 'none' : '';
  }

  /* 武将牌放大：.jpg / .png 两种原图都试，最后才退回缩略图 */
  /* ---------------- 送花 / 砸蛋 ---------------- */
  const REACT_CD = 60000;
  const REACT_ICON = { flower: 'ui/flower.png', egg: 'ui/egg.png' };
  const REACT_LABEL = { flower: '鲜花', egg: '鸡蛋' };
  let reactMenu = null;

  function heroRectOf(pid) {
    const st = S.state;
    let r = null;
    if (st && pid === st.meId) {
      const mh = document.getElementById('meHero');
      if (mh) r = mh.getBoundingClientRect();
    } else {
      const seat = S.seatEls.get(pid);
      if (seat) {
        const th = seat.querySelector('.hero-thumb:not([hidden])');
        r = (th && th.getBoundingClientRect()) || seat.getBoundingClientRect();
      }
    }
    if (!r || !r.width) {
      const seat = S.seatEls.get(pid);
      const mp = document.getElementById('mePanel');
      if (st && pid === st.meId && mp) r = mp.getBoundingClientRect();
      else if (seat) r = seat.getBoundingClientRect();
    }
    return r;
  }

  function myReactLeft() {
    const st = S.state; if (!st) return 0;
    const me = (st.players || []).find((p) => p.id === st.meId);
    const at = (me && Number(me.reactAt)) || 0;
    return Math.max(0, REACT_CD - (Date.now() - at));
  }

  function closeReactMenu() { if (reactMenu) { reactMenu.remove(); reactMenu = null; } }

  function refreshReactMenu() {
    if (!reactMenu) return;
    const left = myReactLeft();
    reactMenu.querySelectorAll('[data-kind]').forEach((b) => {
      const k = b.dataset.kind;
      b.classList.toggle('cool', left > 0);
      const sp = b.querySelector('span');
      if (sp) sp.textContent = left > 0 ? Math.ceil(left / 1000) + 's' : REACT_LABEL[k];
    });
    if (left > 0) setTimeout(refreshReactMenu, 400);
  }

  function openReactMenu(pid, ev) {
    const st = S.state; if (!st || !pid) return;
    closeReactMenu();
    const rect = heroRectOf(pid) || { left: ev.clientX, top: ev.clientY, width: 0, height: 0, bottom: ev.clientY };
    const box = document.createElement('div');
    box.className = 'react-menu';
    box.innerHTML = ['flower', 'egg'].map((k) =>
      '<button class="rbtn ' + k + '" data-kind="' + k + '" type="button">' +
      '<img src="' + REACT_ICON[k] + '" alt=""><span>' + REACT_LABEL[k] + '</span></button>').join('');
    document.body.appendChild(box);
    reactMenu = box;
    const bw = box.offsetWidth || 130, bh = box.offsetHeight || 64;
    const seat = S.seatEls.get(pid);
    const rot = seat ? String(seat.dataset.rot) : '';
    /* 对位（正上方那位）上面没空间，只能往下弹 */
    const below = rot === '180';
    let top = below ? rect.bottom + 8 : rect.top - bh - 8;
    top = Math.max(8, Math.min(window.innerHeight - bh - 8, top));
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
    box.style.top = Math.round(top) + 'px';
    box.style.left = Math.round(left) + 'px';
    refreshReactMenu();
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind]'); if (!b) return;
      if (b.classList.contains('cool')) { toast('还要等 ' + Math.ceil(myReactLeft() / 1000) + ' 秒'); return; }
      S.socket.emit('react', { to: pid, kind: b.dataset.kind });
      closeReactMenu();
    });
  }

  function reactFxLayer() {
    let l = document.getElementById('reactFx');
    if (!l) { l = document.createElement('div'); l.id = 'reactFx'; document.body.appendChild(l); }
    return l;
  }

  function impactReact(d, rect) {
    const st = S.state || {};
    const layer = reactFxLayer();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const burst = document.createElement('div');
    burst.className = 'rfx-burst ' + (d.kind === 'egg' ? 'egg' : 'flower');
    burst.style.left = Math.round(x) + 'px';
    burst.style.top = Math.round(y) + 'px';
    layer.appendChild(burst);
    setTimeout(() => burst.remove(), 720);
    const pop = document.createElement('img');
    pop.className = 'rfx-pop' + (d.kind === 'egg' ? ' egg' : '');
    pop.src = REACT_ICON[d.kind] || REACT_ICON.flower;
    pop.style.left = Math.round(x) + 'px';
    pop.style.top = Math.round(rect.top) + 'px';
    layer.appendChild(pop);
    setTimeout(() => pop.remove(), 1100);
    const target = d.to === st.meId ? document.getElementById('mePanel') : S.seatEls.get(d.to);
    if (target) { target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop'); }
  }

  function playReact(d) {
    if (!d || !S.state) return;
    const from = heroRectOf(d.from);
    const to = heroRectOf(d.to);
    if (!from || !to) return;
    const layer = reactFxLayer();
    const img = document.createElement('img');
    const isEgg = d.kind === 'egg';
    img.className = 'rfx' + (isEgg ? ' egg' : '');
    img.src = REACT_ICON[d.kind] || REACT_ICON.flower;
    img.alt = '';
    layer.appendChild(img);
    const hw = isEgg ? 15 : 24, hh = isEgg ? 21 : 24;
    const x0 = from.left + from.width / 2;
    const y0 = from.top + from.height / 2;
    const x1 = to.left + to.width / 2;
    const y1 = to.top + to.height / 2;
    const cx = (x0 + x1) / 2 + (y1 - y0) * 0.16;
    const cy = Math.min(y0, y1) - Math.max(60, Math.abs(x1 - x0) * 0.12);
    const T = 620;
    const t0 = performance.now();
    const spin = d.kind === 'egg' ? 1 : -1;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / T);
      const mt = 1 - t;
      const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      const sc = 0.55 + 0.55 * Math.sin(Math.PI * t) + 0.1 * t;
      const rot = spin * t * 400;
      img.style.transform = 'translate(' + (x - hw) + 'px,' + (y - hh) + 'px) rotate(' + rot + 'deg) scale(' + sc.toFixed(3) + ')';
      if (t < 1) requestAnimationFrame(step);
      else { img.remove(); impactReact(d, to); }
    };
    requestAnimationFrame(step);
  }

  /* 右键武将牌 → 两个圆形按钮（对位玩家的从下方弹出） */
  document.addEventListener('contextmenu', (e) => {
    const st = S.state; if (!st || !st.meId) return;
    const hit = e.target.closest('.hero-thumb, #meHero');
    if (!hit) return;
    let pid = null;
    if (hit.closest('#mePanel')) pid = st.meId;
    else { const seat = hit.closest('.seat'); pid = seat && seat.dataset.pid; }
    if (!pid) return;
    e.preventDefault();
    openReactMenu(pid, e);
  });
  document.addEventListener('pointerdown', (e) => {
    if (reactMenu && !e.target.closest('.react-menu')) closeReactMenu();
  }, true);
  window.addEventListener('blur', closeReactMenu);

  function heroZoom(heroId) {
    if (!heroId) return;
    const layer = document.getElementById('heroZoom');
    const img = document.getElementById('heroZoomImg');
    if (!layer || !img) return;
    /* 放大层必须在最上面：把它挂到 body 顶层，避免被 #game / #heroBook 的层叠上下文关住 */
    if (layer.parentNode !== document.body) document.body.appendChild(layer);
    img.dataset.hero = heroId;
    const base = 'heroes/' + encodeURIComponent(heroId);
    const tries = [base + '.jpg', base + '.png', 'heroes/thumbs/' + encodeURIComponent(heroId) + '.jpg'];
    let i = 0;
    img.onerror = () => { i += 1; if (i < tries.length) img.src = tries[i]; else img.onerror = null; };
    img.src = tries[0];
    layer.hidden = false;
  }
  function heroZoomClose() {
    const layer = document.getElementById('heroZoom');
    if (layer) layer.hidden = true;
  }

  /* 进房间时预加载全部武将缩略图：第一次显示百分比进度，之后走浏览器缓存一闪而过 */
  let heroPreloadStarted = false;
  function preloadHeroes() {
    if (heroPreloadStarted) return;
    heroPreloadStarted = true;
    const box = document.getElementById('preload');
    const fill = document.getElementById('preloadFill');
    const pctEl = document.getElementById('preloadPct');
    if (!box || !fill || !pctEl) return;
    const KEY = 'heroThumbsCached';
    let cached = false;
    try { cached = localStorage.getItem(KEY) === '1'; } catch (e) { /* 隐私模式 */ }
    if (!cached) box.hidden = false;
    box.onclick = () => { box.hidden = true; };   // 不想等可以直接点掉
    const setPct = (n) => {
      const p = Math.max(0, Math.min(100, Math.round(n)));
      fill.style.width = p + '%';
      pctEl.textContent = p + '%';
    };
    fetch('/api/heroes', { cache: 'no-cache' })
      .then((r) => r.json())
      .then((data) => {
        const list = (data && data.heroes) || [];
        if (!list.length) { box.hidden = true; return null; }
        let done = 0;
        setPct(0);
        const one = (id) => new Promise((resolve) => {
          const im = new Image();
          const fin = () => { done += 1; setPct((done / list.length) * 100); resolve(); };
          im.onload = fin;
          im.onerror = fin;
          im.src = 'heroes/thumbs/' + encodeURIComponent(id) + '.jpg';
        });
        return Promise.all(list.map(one)).then(() => {
          try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
          box.hidden = true;
        });
      })
      .catch(() => { box.hidden = true; });
  }

  function renderZones(st) {
    const me = st.players.find((p) => p.id === st.meId);
    if (!me) return;
    const isPoker = st.mode === 'poker';
    document.body.classList.toggle('poker', isPoker);
    el.meBar.style.display = '';
    paintZones(document.getElementById('mePanel'), me);
    const hb = document.querySelector('#meHandBadge b');
    if (hb) hb.textContent = me.handCount;
    const mh = document.getElementById('meHero');
    if (mh) {
      if (me.hero && !isPoker) {
        mh.hidden = false;
        const im = document.getElementById('meHeroImg');
        if (im && im.dataset.hero !== me.hero) {
          im.src = 'heroes/thumbs/' + encodeURIComponent(me.hero) + '.jpg';
          im.dataset.hero = me.hero;
        }
        const nm = document.getElementById('meHeroName');
        if (nm) nm.textContent = '';
      } else mh.hidden = true;
      if (window.applyHornFx) window.applyHornFx(mh, me.hero);
    }
  }

  // 命中检测：拖拽落点是不是装备格 / 门前区
  /* 取落点命中的容器：从最上层往下找，避免被浮层/幽灵挡住 */
  function hitStack(x, y, sel) {
    const list = (document.elementsFromPoint ? document.elementsFromPoint(x, y) : []) || [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const b = n && n.closest && n.closest(sel);
      if (b) return b;
    }
    const n2 = document.elementFromPoint(x, y);
    return n2 && n2.closest ? n2.closest(sel) : null;
  }
  function equipAt(x, y) {
    const box = hitStack(x, y, '.eq[data-owner]');
    if (!box) return null;
    return { ownerId: box.dataset.owner, slot: box.dataset.slot };
  }
  function midAt(x, y) {
    return hitStack(x, y, '#midZone') ? {} : null;
  }
  function frontAt(x, y) {
    const box = hitStack(x, y, '.frontzone[data-owner]');
    if (box) return { ownerId: box.dataset.owner, idx: Number(box.dataset.idx || 0) };
    /* 松手位置不必压在框里：附近一圈也算（扑克的框更小，容差更大） */
    const pad = document.body.classList.contains('poker') ? 110 : 34;
    let best = null, bestD = Infinity;
    document.querySelectorAll('.frontzone[data-owner]').forEach((bz) => {
      const r = bz.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      if (dx > pad || dy > pad) return;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; best = bz; }
    });
    return best ? { ownerId: best.dataset.owner, idx: Number(best.dataset.idx || 0) } : null;
  }

  /* 门前区：滚轮上下 = 左右翻看（默认露 2 张半，滚一下看后面的） */
  document.addEventListener('wheel', (e) => {
    const fz = e.target && e.target.closest && e.target.closest('.frontzone');
    if (!fz || fz.scrollWidth <= fz.clientWidth + 1) return;
    e.preventDefault();
    fz.scrollLeft += (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
  }, { passive: false });

  /* ---- 自己这一栏的交互 ---- */
  el.meChain.addEventListener('click', () => S.socket.emit('op', { type: 'chain' }));
  {
    const mz = document.getElementById('meHero');
    if (mz) mz.addEventListener('click', () => {
      const st = S.state;
      const me = st && st.players.find((p) => p.id === st.meId);
      heroZoom(me && me.hero);
    });
    const layer = document.getElementById('heroZoom');
    if (layer) {
      layer.addEventListener('click', (ev) => { if (!ev.target.closest('#heroZoomImg')) heroZoomClose(); });
    }
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') heroZoomClose(); });
  }
  document.getElementById('mePanel').addEventListener('dblclick', (ev) => {
    const cell = ev.target.closest('.eq');
    if (!cell) return;
    const st = S.state; if (!st) return;
    const owner = cell.dataset.owner;
    const p = st.players.find((x) => x.id === owner);
    const locked = !!(p && p.equipLocked && p.equipLocked[cell.dataset.slot]);
    S.socket.emit('op', { type: 'equipLock', ownerId: owner, slot: cell.dataset.slot, locked: !locked });
  });
  document.getElementById('mePanel').addEventListener('click', (ev) => {
    const zc = ev.target.closest('.frontzone .zcard');
    if (zc) {
      if (Date.now() - lastZoneDragAt < 400) return;
      S.socket.emit('op', { type: 'frontFlip', id: zc.dataset.card });
    }
  });

  /* ---- 从装备格 / 门前区把牌拖出来 ---- */
  document.getElementById('mePanel').addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    const st = S.state; if (!st) return;
    const me = st.players.find((p) => p.id === st.meId);
    if (!me) return;
    const cell = ev.target.closest('.frontzone .zcard');
    if (cell) {
      const id = cell.dataset.card;
      const c = (me.front || []).find((x) => x && x.id === id);
      if (c) { startZoneDrag(ev, c); return; }
    }
    const eqc = ev.target.closest('.eq.filled .card');
    if (eqc) {
      const slot = eqc.closest('.eq').dataset.slot;
      const c = me.equip && me.equip[slot];
      if (c) { startZoneDrag(ev, c, { fromEquip: slot }); return; }
    }
  });

  /* 找到某个 id 在当前玩家各区域里的牌对象（装备 / 两个门前区 / 公共区） */
  function zoneCardOf(st, id) {
    /* 任何人的装备格 / 门前区都能点、能拖 */
    for (const p of (st.players || [])) {
      for (const slot of EQUIP_SLOTS) {
        const c = p.equip && p.equip[slot];
        if (c && c.id === id) return { ...c, _owner: p.id, _slot: slot, _kind: 'equip' };
      }
      const fr = p.fronts || [];
      for (let i = 0; i < fr.length; i++) {
        for (const c of (fr[i] || [])) if (c && c.id === id) return { ...c, _owner: p.id, _idx: i, _kind: 'front' };
      }
    }
    for (const c of (st.mid || [])) if (c && c.id === id) return { ...c, _kind: 'mid' };
    return null;
  }

  /* 区域里的牌：轻点=翻面，按住拖动=拿出来 */
  function startZonePress(e, d, c) {
    const startX = e.clientX, startY = e.clientY;
    let handed = false;
    const onMove = (ev) => {
      if (handed) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 5) return;
      handed = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const eq = d.closest('.eq');
      startZoneDrag(ev, c, { fromEquip: eq ? eq.dataset.slot : null });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (handed) return;
      if (c._kind === 'mid') { S.socket.emit('op', { type: 'midFlip', id: c.id }); return; }
      const cell = d.closest('.eq');
      if (cell || c._kind === 'equip') {
        S.socket.emit('op', {
          type: 'equipFlip', id: c.id,
          ownerId: (cell && cell.dataset.owner) || c._owner,
          slot: (cell && cell.dataset.slot) || c._slot,
        });
        return;
      }
      const box = d.closest('.frontzone');
      if (!box && c._kind !== 'front') return;
      S.socket.emit('op', { type: 'frontFlip', id: c.id, ownerId: (box && box.dataset.owner) || c._owner });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startZoneDrag(e, c, opts) {
    const fromEquip = opts && opts.fromEquip;
    const fromOwner = (opts && (opts.ownerId || c._owner)) || (S.state && S.state.meId);
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const { g, move } = makeGhost({ ...c, up: c.up !== false }, startX, startY, 0);
    dragging = { id: c.id, kind: 'zone' };
    const onMove = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true;
      move(ev.clientX, ev.clientY);
      document.querySelectorAll('.eq.drop-hl').forEach((x) => x.classList.remove('drop-hl'));
      const ec = equipAt(ev.clientX, ev.clientY);
      if (ec) {
        const n = document.elementFromPoint(ev.clientX, ev.clientY);
        const box = n && n.closest && n.closest('.eq');
        if (box) box.classList.add('drop-hl');
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragging = null;
      g.remove();
      document.querySelectorAll('.eq.drop-hl').forEach((x) => x.classList.remove('drop-hl'));
      if (!moved) return;
      lastZoneDragAt = Date.now();
      const ec = equipAt(ev.clientX, ev.clientY);
      if (ec) { S.socket.emit('op', { type: 'equip', id: c.id, slot: ec.slot, ownerId: ec.ownerId, up: !(c && c.up === false) }); return; }
      const fz = frontAt(ev.clientX, ev.clientY);
      if (fz) { S.socket.emit('op', { type: 'front', id: c.id, ownerId: fz.ownerId, idx: fz.idx, up: c.up }); return; }
      const mz = midAt(ev.clientX, ev.clientY);
      if (mz) { S.socket.emit('op', { type: 'mid', id: c.id, up: c.up }); return; }
      if (overRect(el.hand, ev.clientX, ev.clientY)) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'hand' }); return; }
      if (overRect(el.discardZone, ev.clientX, ev.clientY)) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'discard' }); return; }
      const pd = pileAt(ev.clientX, ev.clientY);
      if (pd) { S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'deck', pileId: pd }); return; }
      const w = pointToWorld(ev.clientX, ev.clientY);
      dropToTable(POOL.get(c.id), w.x, w.y);
      S.socket.emit('op', { type: 'move', id: c.id, targetZone: 'table', x: w.x, y: w.y, r: 0, up: true });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /* ---- 齿轮：第四键按模式区分 ---- */
  function applyGear(st) {
    const isPoker = st.mode === 'poker';
    const btn = el.splitBtn;
    const isHost = st.hostId === st.meId;
    if (isPoker) {
      btn.dataset.action = 'split';
      btn.innerHTML = '➗ <span>一分为二</span>';
      btn.disabled = st.piles.filter((p) => p.count > 0).length >= 4;
      closeFlyout();
      return;
    }
    btn.dataset.action = 'startGame';
    btn.innerHTML = '▶ <span>开始游戏</span>';
    btn.disabled = false;
    btn.title = '选玩法并开始（谁点都行，其他人同意后开局）';
  }

  // 「开始游戏」的玩法选择条（插在齿轮面板里）
  function toggleStartPick() {
    const st = S.state; if (!st) return;
    if (document.getElementById('flyout')) { closeFlyout(); return; }
    const online = st.players.filter((p) => p.online !== false).length;
    const opts = [];
    if (online === 2) opts.push(['duel', '单挑（2 人）']);
    if (online === 3) opts.push(['landlord', '斗地主（3 人）'], ['match', '比赛（地主 7 张）']);
    if (online === 4) opts.push(['ladder', '排位 2v2'], ['free', '自由（4 人）']);
    if (!opts.length) opts.push(['free', '自由模式（当前人数）']);
    const anchor = el.splitBtn;
    flyoutLeft(anchor, opts.map(([g, t]) => ({
      label: t,
      onClick: () => {
        el.gearTray.hidden = true;
        if (g === 'free' || S.state.mode !== 'sanguosha') {
          S.socket.emit('vote', { action: 'startGame', decision: 'start', game: g, heroPool: null, heroPoolAll: true });
          return;
        }
        openPoolPick(g);
      }
    })).concat([{ label: '取消', gray: true, onClick: () => {} }]));
  }

  /* ---- 开局前选将池：全武将 / 自定义武将库（现场可改） ---- */
  const DRAFT_NEED = { duel: 6, landlord: 11, match: 13, ladder: 12 };
  const NEED_NAME = { duel: '单挑', landlord: '斗地主', match: '比赛', ladder: '排位 2v2' };

  function openPoolPick(game) {
    /* 房间已有自定义将池就用房间的（全房一致），没有才回落到本机备份 */
    if (S.state && S.state.roomPool) poolSel = new Set(S.state.roomPool);
    let m = document.getElementById('poolPick');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'poolPick';
    m.className = 'pool-pick';
    m.innerHTML =
      '<div class="pp-box">' +
      '<div class="pp-title">选将池 · ' + (NEED_NAME[game] || game) + '</div>' +
      '<div class="pp-sub">这一局从哪些武将里选？需要 <b id="ppNeed">' + (DRAFT_NEED[game] || 0) +
      '</b> 个，自定义库现有 <b id="ppHave">' + poolSel.size + '</b> 个</div>' +
      '<div class="pp-btns">' +
      '<button class="pp-opt" data-use="all"><i>全部</i><span>全武将（' + (heroBookList || []).length + ' 人）</span></button>' +
      '<button class="pp-opt" data-use="custom"><i>自选</i><span>自定义武将库</span><em class="pp-gear" title="现在改">⚙</em></button>' +
      '</div>' +
      '<div class="pp-warn" id="ppWarn"></div>' +
      '<div class="pp-foot"><button class="pp-go">开始</button><button class="pp-cancel">取消</button></div>' +
      '</div>';
    document.body.appendChild(m);
    m.dataset.game = game;
    m.dataset.use = poolSel.size ? 'custom' : 'all';
    const sync = () => {
      m.querySelectorAll('.pp-opt').forEach((b) => b.classList.toggle('on', b.dataset.use === m.dataset.use));
      const have = poolSel.size;
      const need = DRAFT_NEED[game] || 0;
      const hv = document.getElementById('ppHave');
      if (hv) hv.textContent = have;
      const warn = document.getElementById('ppWarn');
      const bad = m.dataset.use === 'custom' && have < need;
      warn.textContent = bad ? ('武将过少：这个模式需要 ' + need + ' 个，现在只有 ' + have + ' 个') : '';
      warn.hidden = !bad;
      m.querySelector('.pp-go').disabled = bad;
    };
    m.addEventListener('click', (e) => {
      const t = e.target;
      if (t === m || t.closest('.pp-cancel')) { m.remove(); return; }
      if (t.closest('.pp-gear')) { openHeroBook('pool', sync); return; }
      const opt = t.closest('.pp-opt');
      if (opt) { m.dataset.use = opt.dataset.use; sync(); return; }
      if (t.closest('.pp-go')) {
        const use = m.dataset.use;
        S.socket.emit('vote', {
          action: 'startGame', decision: 'start', game,
          heroPool: use === 'custom' && poolSel.size ? [...poolSel] : null,
          heroPoolAll: use !== 'custom',
        });
        m.remove();
      }
    });
    sync();
  }
  window.__poolPick = openPoolPick;

  /* ---- 武将大全（按势力分栏；势力映射来自 heroes/factions.json，缺省全放「全部」） ---- */
  const FACTIONS = [
    ['all', '全部'], ['wei', '魏'], ['shu', '蜀'], ['wu', '吴'], ['qun', '群'], ['shen', '神'],
  ];
  const FACTION_NAME = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', shen: '神' };
  let heroBookList = null;
  let heroBookMap = null;
  let heroBookAdmin = false;
  let heroBookTab = 'all';
  let bookMode = 'view';
  let bookClickTimer = null;
  let lastBookClick = null;
  let poolSel = new Set();
  let poolUse = 'all';
  let bookOnClose = null;
  let lastPoolClick = null;

  async function loadHeroBook(force) {
    if (!heroBookList || force) {
      try {
        const r = await fetch('/api/heroes', { cache: 'no-store' });
        const j = await r.json();
        heroBookList = j.heroes || [];
        heroBookMap = j.factions || {};
        heroBookAdmin = !!j.admin;
      } catch (e) { heroBookList = []; heroBookMap = {}; }
    }
  }

  async function setHeroFaction(id, faction) {
    try {
      const r = await fetch('/api/heroes/faction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, faction }),
      });
      const j = await r.json();
      if (j.ok) { heroBookMap = j.factions; paintHeroBook(); toast(faction ? ('已归到' + FACTION_NAME[faction]) : '已取消势力'); }
      else toast(j.err || '没改成');
    } catch (e) { toast('连不上本机服务'); }
  }

  async function removeHero(id) {
    if (!confirm('确定把这个武将删掉吗？（图片会挪到回收站，能找回）')) return;
    try {
      const r = await fetch('/api/heroes/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (j.ok) { heroBookList = j.heroes; paintHeroBook(); toast('已删除'); }
      else toast(j.err || '没删成');
    } catch (e) { toast('连不上本机服务'); }
  }

  function addHeroFile(file) {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        /* 原图：最长边压到 1200，jpg 0.86 */
        const sc = Math.min(1, 1200 / Math.max(1, img.width));
        const c1 = document.createElement('canvas');
        c1.width = Math.max(1, Math.round(img.width * sc));
        c1.height = Math.max(1, Math.round(img.height * sc));
        c1.getContext('2d').drawImage(img, 0, 0, c1.width, c1.height);
        const full = c1.toDataURL('image/jpeg', 0.86);
        /* 缩略图：300x400 居中裁切 */
        const tw = 300, th = 400;
        const c2 = document.createElement('canvas');
        c2.width = tw; c2.height = th;
        const g2 = c2.getContext('2d');
        const k = Math.max(tw / img.width, th / img.height);
        const dw = img.width * k, dh = img.height * k;
        g2.fillStyle = '#0d1410'; g2.fillRect(0, 0, tw, th);
        g2.drawImage(img, (tw - dw) / 2, (th - dh) / 2, dw, dh);
        const thumb = c2.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(url);
        const r = await fetch('/api/heroes/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: full, thumbUrl: thumb, faction: heroBookTab === 'all' ? '' : heroBookTab }),
        });
        const j = await r.json();
        if (j.ok) { heroBookList = j.heroes; await loadHeroBook(true); paintHeroBook(); toast('已加进武将池（' + (heroBookTab === 'all' ? '未分势力，点色块可归到魏蜀吴群神' : '已归到当前势力') + '）'); }
        else toast(j.err || '没加上');
      } catch (e) { URL.revokeObjectURL(url); toast('这张图读不了'); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('这张图读不了'); };
    img.src = url;
  }

  function paintHeroBook() {
    const grid = document.querySelector('#heroBook .book-grid');
    const tabs = document.querySelector('#heroBook .book-tabs');
    const addBtn = document.querySelector('#heroBook .book-add');
    if (!grid || !tabs) return;
    if (addBtn) addBtn.hidden = !heroBookAdmin || bookMode === 'pool';
    const title = document.querySelector('#heroBook .book-title');
    if (title) title.textContent = bookMode === 'pool' ? '自定义武将库（点一下选中／再点取消）' : '武将大全';
    const headR = document.querySelector('#heroBook .book-head-r');
    if (headR) {
      let sv = headR.querySelector('.book-save');
      let rc = headR.querySelector('.book-reco');
      if (bookMode === 'pool') {
        if (!rc) {
          rc = document.createElement('button');
          rc.className = 'book-reco';
          rc.textContent = '⭐ 好人推荐';
          rc.title = '一键点亮你自己定的推荐名单';
          headR.insertBefore(rc, headR.firstChild);
        }
        const srOld = headR.querySelector('.book-setreco');
        if (srOld) srOld.remove();
        if (!sv) { sv = document.createElement('button'); sv.className = 'book-save'; headR.insertBefore(sv, headR.firstChild); }
        sv.textContent = '保存（已选 ' + poolSel.size + '）';
      } else {
        if (sv) sv.remove();
        if (rc) rc.remove();
      }
    }
    const layerEl = document.getElementById('heroBook');
    if (layerEl) layerEl.classList.toggle('poolmode', bookMode === 'pool');
    tabs.innerHTML = FACTIONS.map(([k, t]) => {
      const n = k === 'all' ? (heroBookList || []).length
        : (heroBookList || []).filter((id) => (heroBookMap[id] || '') === k).length;
      return `<button class="book-tab${k === heroBookTab ? ' active' : ''}" data-f="${k}">${t}<i>${n}</i></button>`;
    }).join('');
    const list = (heroBookList || []).filter((id) => heroBookTab === 'all' || (heroBookMap[id] || '') === heroBookTab);
    if (!list.length) {
      grid.innerHTML = '<div class="book-empty">' + (heroBookTab === 'all'
        ? '还没拿到武将图，进房间后会自动加载'
        : '这一类还没有武将（管理员可以在「全部」里给每个武将指定势力）') + '</div>';
      return;
    }
    grid.innerHTML = list.map((id) => {
      const f = heroBookMap[id] || '';
      const poolCls = bookMode === 'pool' && !poolSel.has(id) ? ' off' : '';
      const tools = (bookMode === 'pool' || !heroBookAdmin) ? '' : heroBookAdmin
        ? '<div class="bk-tools">' + FACTIONS.slice(1).map(([k, t]) =>
          `<button class="bk-f${f === k ? ' on' : ''}" data-hero="${id}" data-f2="${k}" title="设为${t}">${t}</button>`).join('') +
          `<button class="bk-del" data-hero="${id}" title="删除">✕</button></div>`
        : '';
      return `<div class="bk-item${poolCls}" data-hero="${id}">` +
        `<img src="heroes/thumbs/${encodeURIComponent(id)}.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src='heroes/thumbs/${encodeURIComponent(id)}.png'">` +
        (f ? `<span class="bk-badge bk-${f}">${FACTION_NAME[f]}</span>` : '') + tools + '</div>';
    }).join('');
  }

  async function recommendPool() {
    try {
      const r = await fetch('/api/heroes/reco', { cache: 'no-store' });
      const j = await r.json();
      let list = (j.list || []).filter((id) => (heroBookList || []).includes(id));
      if (!list.length) {
        const r2 = await fetch('/api/heroes/pool', { cache: 'no-store' });
        const j2 = await r2.json();
        list = (j2.list || []).filter((id) => (heroBookList || []).includes(id));
        if (!list.length) { toast('还没名单：先勾选你想要的，点「📌 设为好人推荐」或直接保存'); return; }
        toast('用了你上次保存的名单（' + list.length + ' 个）');
      }
      poolSel = new Set(list);
      paintHeroBook();
      toast('好人推荐：已选 ' + list.length + ' 个');
    } catch (e) { toast('连不上本机服务'); }
  }

  function askSaveReco() {
    let q = document.getElementById('recoAsk');
    if (q) q.remove();
    q = document.createElement('div');
    q.id = 'recoAsk';
    q.className = 'pool-pick';
    q.innerHTML = '<div class="pp-box" style="width:min(420px,92vw)">' +
      '<div class="pp-title">设为好人推荐？</div>' +
      '<div class="pp-sub">把当前勾选的 <b>' + poolSel.size + '</b> 个武将存成「好人推荐」，以后点 ⭐ 一键点亮这几个。</div>' +
      '<div class="pp-foot"><button class="pp-go" data-ask="yes">确定</button>' +
      '<button class="pp-cancel" data-ask="no">取消</button></div></div>';
    document.body.appendChild(q);
    q.addEventListener('click', (e) => {
      if (e.target === q || e.target.closest('[data-ask="no"]')) { q.remove(); return; }
      if (e.target.closest('[data-ask="yes"]')) { q.remove(); setRecommend(); }
    });
  }

  async function setRecommend() {
    if (!poolSel.size) { toast('先勾几个武将再设为推荐'); return; }
    try {
      const r = await fetch('/api/heroes/reco', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: [...poolSel] }),
      });
      const j = await r.json();
      if (j.ok) toast('已把这 ' + j.list.length + ' 个记为「好人推荐」');
      else toast(j.err || '没存上');
    } catch (e) { toast('连不上本机服务'); }
  }

  async function savePool() {
    try {
      const r = await fetch('/api/heroes/pool', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: [...poolSel] }),
      });
      const j = await r.json();
      if (j.ok) {
        poolSel = new Set(j.list || []);
        toast('已保存 ' + j.list.length + ' 个武将');
        document.getElementById('heroBook').hidden = true;
        updatePoolLabel();
        if (typeof bookOnClose === 'function') bookOnClose();
      } else toast(j.err || '没存上');
    } catch (e) { toast('连不上本机服务'); }
  }

  function updatePoolLabel() {
    const c = document.getElementById('poolCount');
    if (c) c.textContent = poolUse === 'custom' ? ('已选 ' + poolSel.size + ' 个') : '';
  }

  async function loadPoolFromServer() {
    try {
      const r = await fetch('/api/heroes/pool', { cache: 'no-store' });
      const j = await r.json();
      poolSel = new Set(j.list || []);
      poolUse = poolSel.size ? 'custom' : 'all';
      document.querySelectorAll('.pool-btn').forEach((b) => b.classList.toggle('active', b.dataset.pool === poolUse));
      updatePoolLabel();
    } catch (e) {}
  }

  async function openHeroBook(mode, onClose) {
    bookMode = mode === 'pool' ? 'pool' : 'view';
    bookOnClose = typeof onClose === 'function' ? onClose : null;
    let layer = document.getElementById('heroBook');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'heroBook';
      layer.className = 'hero-book';
      layer.innerHTML = '<div class="book-box"><div class="book-head"><b class="book-title">武将大全</b>' +
        '<div class="book-head-r"><button class="book-add" hidden>＋ 新增武将</button>' +
        '<button class="book-close" title="关闭">✕</button></div></div>' +
        '<div class="book-tabs"></div><div class="book-grid"></div>' +
        '<input type="file" class="book-file" accept="image/png,image/jpeg,image/webp" hidden></div>';
      document.body.appendChild(layer);
      layer.addEventListener('click', (ev) => {
        if (ev.target === layer || ev.target.closest('.book-close')) { layer.hidden = true; return; }
        if (ev.target.closest('.book-add')) { layer.querySelector('.book-file').click(); return; }
        const fb = ev.target.closest('.bk-f');
        if (fb) {
          /* 每个武将必须有势力：点哪个就是哪个，不允许点空 */
          setHeroFaction(fb.dataset.hero, fb.dataset.f2);
          return;
        }
        const del = ev.target.closest('.bk-del');
        if (del) { removeHero(del.dataset.hero); return; }
        const tab = ev.target.closest('.book-tab');
        if (tab) { heroBookTab = tab.dataset.f; paintHeroBook(); return; }
        if (ev.target.closest('.book-save')) { savePool(); return; }
        if (ev.target.closest('.book-reco')) { recommendPool(); return; }
        if (ev.target.closest('.book-setreco')) { setRecommend(); return; }
        const item = ev.target.closest('.bk-item');
        if (item) {
          if (bookMode === 'pool') {
            const id = item.dataset.hero;
            const items = [...document.querySelectorAll('#heroBook .bk-item')];
            const lastId = items.length ? items[items.length - 1].dataset.hero : '';
            const now = Date.now();
            const dbl = lastPoolClick && lastPoolClick.id === id && now - lastPoolClick.t < 480;
            lastPoolClick = { id, t: now };
            if (poolSel.has(id)) poolSel.delete(id); else poolSel.add(id);
            /* 房间级共享：改一下全房同步（谁改都行） */
            if (S.state && S.socket) S.socket.emit('pool', { list: [...poolSel] });
            paintHeroBook();
            if (dbl && id === lastId) askSaveReco();
          } else {
            const id = item.dataset.hero;
            const now = Date.now();
            if (lastBookClick && lastBookClick.id === id && now - lastBookClick.t < 460) {
              /* 双击：直接把自己这局的武将换成这张 */
              lastBookClick = null;
              if (bookClickTimer) { clearTimeout(bookClickTimer); bookClickTimer = null; }
              if (S.socket && S.state) {
                S.socket.emit('op', { type: 'setHero', heroId: id });
                toast('已把这张设为你这局的武将');
                heroZoomClose();
                const lay = document.getElementById('heroBook');
                if (lay) lay.hidden = true;
              } else {
                toast('先进房间，再双击选武将');
              }
              return;
            }
            lastBookClick = { id: id, t: now };
            if (bookClickTimer) clearTimeout(bookClickTimer);
            bookClickTimer = setTimeout(function () { bookClickTimer = null; heroZoom(id); }, 320);
          }
          return;
        }
      });
      layer.querySelector('.book-file').addEventListener('change', (ev) => {
        addHeroFile(ev.target.files && ev.target.files[0]);
        ev.target.value = '';
      });
    }
    layer.hidden = false;
    el.gearTray.hidden = true;
    await loadHeroBook();
    paintHeroBook();
  }

  /* ---- 选将 UI ---- */
  const DRAFT_TITLES = { duel: '单挑 · 选将', landlord: '斗地主 · 选将', ladder: '排位 2v2 · 选将', match: '比赛 · 选将', free: '选将' };
  function draftKey(d) {
    return [d.phase, d.mode, d.deadline, (d.cands || []).join(','), JSON.stringify(d.picks || {})].join('|');
  }

  function heroCardHTML(id, opts) {
    const o = opts || {};
    const cls = ['hc'];
    if (o.sel) cls.push('sel');
    if (o.taken) cls.push('taken');
    if (o.mine) cls.push('mine');
    if (o.sm) cls.push('sm');
    const img = id ? `<img src="heroes/thumbs/${encodeURIComponent(id)}.jpg" alt="" loading="lazy" ` +
      `onerror="this.parentNode.innerHTML='<div class=\\'silhouette\\'>👤</div>'">` : '<div class="silhouette">👤</div>';
    return `<div class="${cls.join(' ')}" data-hero="${escapeHtml(id || '')}">` +
      `<div class="hcimg">${img}</div>` +
      (o.tag ? `<span class="hctag">${escapeHtml(o.tag)}</span>` : '') +
      (o.rec ? `<span class="rec">队友推荐</span>` : '') +
      '</div>';
  }

  function frameHTML(name, pick, role) {
    return '<div class="dframe' + (role ? ' ' + role : '') + '">' +
      '<div class="df-n">' + escapeHtml(name) + '</div>' +
      '<div class="df-img">' + (pick
        ? '<img src="heroes/thumbs/' + encodeURIComponent(pick) + '.jpg" alt="">'
        : '<span>待选</span>') + '</div>' +
      '<div class="df-s">' + (pick ? '已确认' : '挑选中') + '</div></div>';
  }

  function renderDraftFrames(d, st, skip) {
    const peers = d.peers || [];
    if (skip || !peers.length) {
      el.draftFrames.hidden = true;
      el.draftFrames.innerHTML = '';
      return;
    }
    el.draftFrames.hidden = false;
    const me = st.players.find((p) => p.id === st.meId) || {};
    const mine = (d.picks || {})[st.meId] || {};
    /* 地主红晕、农民绿晕（叫分最高分的那个人是地主） */
    const lordId = d.landlord || st.landlordId || null;
    const roleOf = (pid) => (!lordId ? '' : (pid === lordId ? 'lord' : 'farmer'));
    el.draftFrames.innerHTML = frameHTML(me.name || '我', mine.confirmed ? mine.hero : null, roleOf(st.meId)) +
      peers.map((pr) => frameHTML(pr.name, pr.picked, roleOf(pr.id))).join('');
  }

  function renderMyCands(d, st) {
    const ids = d.myCands || [];
    el.draftCands.classList.remove('few');
    el.draftCands.innerHTML = '<div class="dsec" data-own="1">' +
      '<div class="dsec-t">我的两张武将（只有你自己看得到）</div>' +
      '<div class="dcards">' + ids.map((id) => heroCardHTML(id, { sm: true })).join('') + '</div></div>';
  }

  function renderDraft(st) {
    const d = st.draft;
    if (!d || d.phase === 'done' || d.phase === 'off') {
      el.draftLayer.hidden = true;
      clearInterval(S.draftClockTimer); S.draftClockTimer = null;
      S.lastDraftKey = ''; S.draftSel = null;
      return;
    }
    el.draftLayer.hidden = false;
    const me = st.players.find((p) => p.id === st.meId) || {};
    const modeName = GAME_NAME(d.mode);
    el.draftTitle.textContent = DRAFT_TITLES[d.mode] || '选将';
    const calling = d.phase === 'call';
    el.draftInfo.textContent = calling
      ? '叫分中 · 只有你自己看得到这 2 张'
      : (d.score ? d.score + ' 分局 · ' : '') + '点一张选中，再点右下确认';
    el.draftClock.textContent = '--';
    el.draftClock.classList.remove('warn');

    // 倒计时 + 进度条
    clearInterval(S.draftClockTimer);
    let bar = document.getElementById('draftBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'draftBar';
      bar.innerHTML = '<i></i>';
      if (el.draftClock && el.draftClock.parentNode) el.draftClock.parentNode.appendChild(bar);
    }
    const phaseKey = [d.phase, d.calling ? d.calling.turnIndex : '', d.calling ? (d.calling.order || []).join('|') : '',
      d.round || 1, d.landlord || '', d.score || 0, (d.myCands || []).length].join('#');
    if (S.draftBarKey !== phaseKey) {
      S.draftBarKey = phaseKey;
      S.draftBarTotal = Math.max(1000, d.deadline - Date.now());
    }
    const totalMs = Math.max(1000, S.draftBarTotal || 10000);
    const tick = () => {
      const ms = Math.max(0, d.deadline - Date.now());
      const left = Math.ceil(ms / 1000);
      el.draftClock.textContent = String(left).padStart(2, '0');
      el.draftClock.classList.toggle('warn', left <= 5);
      const fill = bar.firstElementChild;
      if (fill) fill.style.width = Math.max(0, Math.min(100, (ms / totalMs) * 100)).toFixed(1) + '%';
      bar.classList.toggle('timeout', ms <= 0);
      if (ms <= 0) el.draftPicked.textContent = d.phase === 'call' ? '时间到，正在自动叫分…' : '时间到，正在自动选将…';
    };
    tick();
    S.draftClockTimer = setInterval(tick, 200);

    // 叫分阶段
    el.draftCall.hidden = !calling;
    el.draftCands.hidden = false;
    el.draftConfirm.disabled = true;
    el.draftConfirm.hidden = calling;
    if (calling) {
      renderMyCands(d, st);
      const cur = d.calling || {};
      const isMyTurn = cur.turn === st.meId;
      const turnName = (st.players.find((p) => p.id === cur.turn) || {}).name || '其他人';
      // 没轮到自己就不显示叫分按钮，只等
      el.draftCall.hidden = !isMyTurn;
      const best = Number((cur && cur.best) || 0);
      const canPass = cur.canPass === true;
      el.draftCallText.textContent = canPass
        ? '轮到你叫分了：可以叫比 ' + best + ' 分更高的，也可以不叫（10 秒内）'
        : '轮到你叫分了：你是第一个叫的，必须叫 1 分、2 分或 3 分（10 秒内）';
      el.draftPicked.textContent = isMyTurn
        ? '轮到你叫分（当前最高 ' + best + ' 分）'
        : '等待 ' + turnName + ' 叫分…（当前最高 ' + best + ' 分）';
      el.draftCall.querySelectorAll('button[data-score]').forEach((b) => {
        const sc = Number(b.dataset.score);
        // 不叫：第一个人不给；分值：必须高于当前最高
        const ok = sc === 0 ? canPass : sc > best;
        b.hidden = !ok;
        b.disabled = !isMyTurn;
      });
      return;
    }

    // 选将阶段
    const cands = d.myCands || [];
    const peers = d.peers || [];
    const taken = new Set();
    Object.values(d.picks || {}).forEach((pk) => {
      if (pk && pk.confirmed && pk.hero) taken.add(pk.hero);
    });
    const myPick = (d.picks || {})[st.meId] || {};
    if (!S.draftSel || !cands.includes(S.draftSel) || taken.has(S.draftSel)) {
      S.draftSel = myPick.hero && cands.includes(myPick.hero) && !taken.has(myPick.hero) ? myPick.hero : null;
    }
    const sel = S.draftSel;
    const ownCards = cands.map((id) => heroCardHTML(id, {
      sel: id === sel,
      taken: taken.has(id) && id !== sel,
    })).join('');
    const samePool = peers.length > 0 && peers.every((pr) => (pr.cands || []).join(',') === cands.join(','));
    const split = peers.length > 0 && !samePool;
    renderDraftFrames(d, st, split);
    if (split) {
      // 比赛：两个农民分屏（左我 / 右另一位农民）
      const me = st.players.find((p) => p.id === st.meId) || {};
      const col = (name, picked, cards, peer) =>
        '<div class="dsp-col' + (peer ? ' peer' : '') + '">' +
        frameHTML(name, picked ? picked : null) +
        '<div class="dsec" data-own="' + (peer ? '0' : '1') + '">' +
        '<div class="dsec-t">' + (peer ? escapeHtml(name) + ' 的武将池（点 = 推荐给 TA）' : '我的武将池') + '</div>' +
        '<div class="dcards">' + cards + '</div></div></div>';
      el.draftCands.innerHTML = '<div class="draft-split">' +
        col(me.name || '我', myPick.confirmed ? myPick.hero : null, ownCards, false) +
        peers.map((pr) => col(pr.name, pr.picked, (pr.cands || []).map((id) =>
          heroCardHTML(id, { taken: taken.has(id), mine: true })).join(''), true)).join('') +
        '</div>';
    } else if (samePool) {
      const recOn = !!S.recMode;
      el.draftCands.innerHTML = '<div class="dsec" data-own="1">' +
        '<div class="dsec-t">本队武将池（你和队友共用这 ' + cands.length + ' 张，各选一张、不能重复）' +
        '<button class="recmode' + (recOn ? ' on' : '') + '">' + (recOn ? '推荐模式：开（点牌=推荐给队友）' : '推荐给队友') + '</button>' +
        '</div><div class="dcards">' + ownCards + '</div></div>';
    } else {
      el.draftCands.innerHTML = '<div class="dsec" data-own="1">' +
        '<div class="dsec-t">我的武将池（' + cands.length + ' 张里挑 1 张，别人看不到）</div>' +
        '<div class="dcards">' + ownCards + '</div></div>';
    }
    // 候选少就放大牌面
    el.draftCands.classList.toggle('few', cands.length <= 3 && cands.length > 0);
    const mine = myPick.confirmed;
    el.draftPicked.textContent = mine ? '已确认，等其他人…' : (sel ? '已选中，点右下确认' : '未选择');
    el.draftConfirm.disabled = mine || !sel;
    el.draftConfirm.textContent = mine ? '已确认' : '确认';
    S.lastDraftKey = draftKey(d);
  }

  function GAME_NAME(g) {
    return ({ free: '自由', duel: '单挑', landlord: '斗地主', ladder: '排位 2v2', match: '比赛' })[g] || '三国杀';
  }

  el.draftCands.addEventListener('click', (ev) => {
    const recBtn = ev.target.closest('.recmode');
    if (recBtn) {
      S.recMode = !S.recMode;
      const st0 = S.state;
      if (st0) renderDraft(st0);
      return;
    }
    const card = ev.target.closest('.hc');
    if (!card || card.classList.contains('taken')) return;
    const id = card.dataset.hero;
    if (!id) return;
    const st = S.state;
    const peerSec = card.closest('.dsec.peer') || card.closest('.dsp-col.peer');
    const st0 = S.state;
    if (st0 && st0.draft && st0.draft.phase === 'call') return;
    if (peerSec || (S.recMode && (st && st.draft && (st.draft.peers || []).length))) {
      S.socket.emit('draft', { type: 'recommend', hero: id });
      toast('已推荐给队友：' + id.slice(0, 6));
      return;
    }
    S.draftSel = id;
    if (st) renderDraft(st);
  });
  el.draftConfirm.addEventListener('click', () => {
    if (!S.draftSel) return;
    S.socket.emit('draft', { type: 'confirm', hero: S.draftSel });
    el.draftConfirm.disabled = true;
    el.draftConfirm.textContent = '已确认';
  });
  el.draftCall.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-score]');
    if (!b || b.disabled) return;
    S.socket.emit('draft', { type: 'call', score: Number(b.dataset.score) });
    el.draftCall.querySelectorAll('button').forEach((x) => { x.disabled = true; });
  });
  const VOTE_NAMES = { collect: '收拢弃牌', randomSeat: '随机换座', shuffle: '一键洗牌', split: '一分为二' };
  let pendingAction = null;

  el.gear.addEventListener('click', () => { el.gearTray.hidden = !el.gearTray.hidden; });
  if (el.themeBtn) el.themeBtn.addEventListener('click', () => cycleTheme());

  // 顶部显示可用地址：有虚拟网就用固定地址，否则显示公网（watchdog 换地址后自动跟着变），点一下复制
  const netChip = document.getElementById('netChip');
  async function refreshNetChip() {
    try {
      const r = await fetch('api/public-url?_=' + Date.now(), { cache: 'no-store' });
      const j = await r.json();
      const lan = (j && j.lan) || '';
      const v6url = (j && j.v6url) || '';
      const wan = (j && j.url) || '';
      const url = v6url || lan || wan;
      if (!netChip) return;
      if (!url) { netChip.hidden = true; return; }
      netChip.hidden = false;
      netChip.dataset.url = url;
      netChip.dataset.kind = v6url ? 'v6' : (lan ? 'lan' : 'wan');
      const host = url.replace(/^https?:\/\//, '');
      netChip.textContent = v6url ? '直连 ' + host.replace(/:3010$/, '') : (lan ? '固定 ' + host : '公网 ' + host.slice(0, 22));
      netChip.title = (v6url ? 'IPv6 直连地址（朋友不用装任何东西），' : (lan ? '虚拟网固定地址，' : '公网临时地址（会变），')) + '点一下复制';
    } catch (_) { /* 忽略 */ }
  }
  if (netChip) {
    netChip.addEventListener('click', () => {
      const url = netChip.dataset.url || '';
      if (!url) return;
      try { navigator.clipboard.writeText(url); toast(netChip.dataset.kind === 'wan' ? '已复制公网地址' : '已复制直连地址'); } catch (_) { toast(url); }
    });
  }
  refreshNetChip();
  setInterval(refreshNetChip, 15000);
  el.gearTray.addEventListener('click', (e) => {
    if (e.target.closest('#heroBookBtn')) { openHeroBook(); return; }
    if (e.target.closest('#customPoolBtn')) { openHeroBook('pool'); return; }
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const action = b.dataset.action;
    if (action === 'startGame') { toggleStartPick(); return; }
    el.gearTray.hidden = true;
    S.socket.emit('vote', { action, decision: 'start' });
  });

  function onVoteStatus(v) {
    clearTimeout(S.voteTimer);
    if (v.cancelled) {
      el.voteName.textContent = '已否决';
      el.voteCount.textContent = '3';
      el.voteBox.hidden = false;
      let n = 3;
      const tick = () => {
        n -= 1;
        el.voteCount.textContent = String(Math.max(n, 1));
        if (n <= 0) { el.voteBox.hidden = true; }
        else S.voteTimer = setTimeout(tick, 500);
      };
      S.voteTimer = setTimeout(tick, 500);
      return;
    }
    if (v.done) { el.voteBox.hidden = true; S.vote = null; return; }
    if (!v.active) { el.voteBox.hidden = true; return; }
    S.vote = v;
    el.voteBox.hidden = false;
    el.voteName.textContent = VOTE_NAMES[v.action] || v.action;
    el.voteCount.textContent = v.yes + ' / ' + v.total;
    el.voteYes.disabled = false; el.voteNo.disabled = false;
  }
  el.voteYes.addEventListener('click', () => S.vote && S.socket.emit('vote', { action: S.vote.action, decision: 'yes' }));
  el.voteNo.addEventListener('click', () => S.vote && S.socket.emit('vote', { action: S.vote.action, decision: 'no' }));

  /* ---------------- hp buttons ---------------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('#previewBtn')) { previewLayout(); }
  });
  el.upMax.addEventListener('click', () => {
    const me = S.state && S.state.players.find((p) => p.id === S.state.meId);
    if (me) S.socket.emit('maxHp', { delta: 1 });
  });
  el.downMax.addEventListener('click', () => {
    const me = S.state && S.state.players.find((p) => p.id === S.state.meId);
    if (me) S.socket.emit('maxHp', { delta: -1 });
  });

  /* ---------------- misc ---------------- */
  function checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    const touch = matchMedia('(pointer:coarse)').matches;
    el.rotateHint.hidden = !(portrait && touch);
  }
  window.addEventListener('resize', () => { checkOrientation(); layoutHand(); });
  checkOrientation();
  applyTheme();

  /* 测试用：?room=CODE&name=NN&mode=poker&auto=1 */
  (function autoJoin() {
    const qp = new URLSearchParams(location.search);
    if (!qp.get('room')) return;
    const mode = qp.get('mode') === 'poker' ? 'poker' : 'sanguosha';
    document.querySelectorAll('.mode-btn').forEach((x) => x.classList.toggle('active', x.dataset.mode === mode));
    S.mode = mode;
    el.sgOptions.hidden = mode !== 'sanguosha';
    el.pokerOptions.hidden = mode !== 'poker';
    if (qp.get('decks')) S.decks = Number(qp.get('decks')) || 1;
    if (qp.get('jokers') === '0') S.jokers = 0;
    el.name.value = qp.get('name') || '玩家';
    el.room.value = qp.get('room');
    setTimeout(() => el.join.click(), 60);
  })();
/* ================= 扑克：筹码（澳门式圆形筹码） ================= */
  const CHIP_V = [1, 2, 5, 10, 20, 30, 50];
  const CHIP_C = { 1: '#2f8f4e', 2: '#2f6fb0', 5: '#b03a3a', 10: '#c9772e', 20: '#e6dfcd', 30: '#7a4fb0', 50: '#22252a' };

  /* 别人座位上的小筹码条（不可拖，只显示） */
  function moneyTier(total) {
    if (total >= 1000) return 5;
    if (total >= 600) return 4;
    if (total >= 400) return 3;
    if (total >= 200) return 2;
    if (total >= 100) return 1;
    return 0;
  }
  function moneyHTML(total, cls) {
    const t = moneyTier(total || 0);
    return '<span class="money t' + t + (cls ? ' ' + cls : '') + '"><i>$</i><b>' + (total || 0) + '</b></span>';
  }
  function chipTotal(w) {
    let s = 0;
    for (const v of CHIP_V) s += (w[v] || 0) * v;
    return s;
  }
  /* 座位框里不再列每种筹码，只写一个总价值 $N */
  function chipMini(w) {
    return moneyHTML(chipTotal(w || {}));
  }

  function chipHTML(v, n, where) {
    const shown = Math.min(5, n | 0);
    let pile = '';
    for (let i = 0; i < shown; i++) {
      pile += '<i class="cchip" style="bottom:' + (i * 3) + 'px;--cc:' + CHIP_C[v] + '"><b>' + v + '</b></i>';
    }
    if (!shown) pile = '<i class="cchip ghost" style="--cc:' + CHIP_C[v] + '"></i>';
    const up = where === 'me' ? '<b class="chip-plus">+</b>' : '';
    const dn = where === 'me' ? '<b class="chip-minus">-</b>' : '';
    return '<div class="chip-slot" data-v="' + v + '" data-where="' + where + '">' + up +
      '<div class="chip-pile">' + pile + '</div><span class="chip-count">' + (n | 0) + '</span>' + dn + '</div>';
  }

  function paintChips(st) {
    const poker = st.mode === 'poker';
    document.body.classList.toggle('poker', poker);
    if (!poker) {
      const a = document.getElementById('chipRow'); if (a) a.remove();
      const b = document.getElementById('midChips'); if (b) b.remove();
      return;
    }
    const myId = (S.me && S.me.id) || '';
    const me = (st.players || []).find((p) => p.id === myId);
    let row = document.getElementById('chipRow');
    if (!row) {
      row = document.createElement('div');
      row.id = 'chipRow';
      const mp = document.getElementById('mePanel');
      mp.insertBefore(row, mp.firstChild);
    }
    const w = (me && me.chips) || {};
    row.innerHTML = CHIP_V.map((v) => chipHTML(v, w[v] || 0, 'me')).join('') +
      '<div class="chip-side">' +
      '<div id="chipGet" title="把公共筹码区的筹码收进来">获得筹码</div>' +
      '<div class="side-name">' + escapeHtml((me && me.name) || '') + '</div>' +
      '<div class="side-money">' + moneyHTML(chipTotal((me && me.chips) || {})) + '</div>' +
      '' +
      '</div>';
    let mid = document.getElementById('midChips');
    if (!mid) {
      mid = document.createElement('div');
      mid.id = 'midChips';
      document.getElementById('midZone').appendChild(mid);
      document.getElementById('midZone').hidden = false;
    }
    const m = st.midChips || {};
    const hs = (x) => { const q = Math.sin(x * 12.9898) * 43758.5453; return q - Math.floor(q); };
    let sc = '';
    /* 按服务端记录的顺序渲染：后扔的在上层（z 越大越靠上） */
    const stack = Array.isArray(st.midStack) && st.midStack.length ? st.midStack : null;
    if (stack) {
      stack.forEach((v, i) => {
        const a = hs(i * 37.1 + v), b = hs(i * 11.7 + v * 3.3), c = hs(i * 5.9 + v * 7.7);
        sc += '<i class="cchip scatter" style="z-index:' + (i + 1) + ';left:' + (10 + a * 70).toFixed(1) + '%;top:' +
          (16 + b * 60).toFixed(1) + '%;--cc:' + CHIP_C[v] + ';transform:translate(-50%,-50%) rotate(' +
          (c * 80 - 40).toFixed(0) + 'deg)"><b>' + v + '</b></i>';
      });
    } else {
      for (const v of CHIP_V) {
        const n = Math.min(80, m[v] || 0);
        for (let i = 0; i < n; i++) {
          const a = hs(v * 97 + i * 13.7), b = hs(v * 31 + i * 7.3 + 5.1), c = hs(v * 17 + i * 3.1 + 9.7);
          sc += '<i class="cchip scatter" style="left:' + (10 + a * 70).toFixed(1) + '%;top:' + (16 + b * 60).toFixed(1) +
            '%;--cc:' + CHIP_C[v] + ';transform:translate(-50%,-50%) rotate(' + (c * 80 - 40).toFixed(0) + 'deg)"><b>' + v + '</b></i>';
        }
      }
    }
    const totalMid = CHIP_V.reduce((t2, v) => t2 + ((m[v] || 0) > 0 ? 1 : 0), 0);
    mid.innerHTML = sc;
    const lab2 = document.querySelector('#midZone .zone-lab');
    if (lab2 && sc) lab2.style.display = 'none';
    mid.classList.toggle('has', totalMid > 0);
    let vb = document.getElementById('chipVote');
    const vote = st.chipVote;
    if (vote) {
      if (!vb) { vb = document.createElement('div'); vb.id = 'chipVote'; document.body.appendChild(vb); }
      const need = vote.need || [];
      const mine = need.indexOf(myId) >= 0;
      const total = CHIP_V.reduce((a, v) => a + v * ((st.midChips && st.midChips[v]) || 0), 0);
      vb.innerHTML = vote.by === myId
        ? '<span><b>' + vote.byName + '</b> 想收取公共筹码区 ' + total + ' 点，等其他人同意（' + vote.got.length + '/' + need.length + '）</span><button data-v="cancel">取消</button>'
        : '<span><b>' + vote.byName + '</b> 想收取公共筹码区 ' + total + ' 点筹码，是否同意？</span><button data-v="yes">同意</button><button data-v="no">不同意</button>';
      vb.hidden = !(mine || vote.by === myId);
    } else if (vb) { vb.remove(); }
    const g = st.gain;
    if (g && Date.now() - g.at < 30000) {
      let gb = document.getElementById('chipGain');
      if (!gb) { gb = document.createElement('div'); gb.id = 'chipGain'; document.body.appendChild(gb); }
      const size = Math.max(26, Math.min(96, 20 + g.total * 0.7));
      const hot = Math.min(1, g.total / 200);
      gb.innerHTML = '<em>' + escapeHtml(g.name || '') + ' 本轮获得</em><b style="font-size:' + size + 'px;text-shadow:0 0 ' + (8 + hot * 30) + 'px rgba(255,205,80,' + (0.35 + hot * 0.6) + ')">' + g.total + '</b><em>积分</em>';
      gb.className = hot > 0.6 ? 'boom' : hot > 0.25 ? 'warm' : '';
    } else { const gb = document.getElementById('chipGain'); if (gb) gb.remove(); }
  }

  function chipBigX() {
    const x = document.createElement('div');
    x.id = 'chipX';
    x.textContent = '✕';
    document.body.appendChild(x);
    setTimeout(() => x.remove(), 900);
  }

  /* 双击筹码 → 就在筹码下面的小输入框里填个数（不再用网页弹窗） */
  function chipInlineInput(slot) {
    const old = document.getElementById('chipInput');
    if (old) old.remove();
    const v = Number(slot.dataset.v);
    const myId = (S.me && S.me.id) || '';
    const me = ((S.state && S.state.players) || []).find((p) => p.id === myId);
    const have = (me && me.chips && me.chips[v]) || 0;
    const box = document.createElement('div');
    box.id = 'chipInput';
    box.innerHTML = '<input type="text" inputmode="numeric" value="' + Math.min(have, 1) + '" /><button>扔</button>';
    slot.appendChild(box);
    const inp = box.querySelector('input');
    const fire = () => {
      const n = Math.floor(Number(inp.value));
      if (!(n > 0)) { box.remove(); return; }
      if (n > have) { chipBigX(); inp.value = ''; inp.focus(); return; }
      box.remove();
      S.socket.emit('chip', { act: 'toMid', value: v, count: n });
    };
    box.querySelector('button').addEventListener('pointerdown', (e) => { e.stopPropagation(); fire(); });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') fire(); if (e.key === 'Escape') box.remove(); });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.id === 'chipGet') { S.socket.emit('chip', { act: 'collect' }); return; }
    const vb = t.closest && t.closest('#chipVote button');
    if (vb) {
      if (vb.dataset.v === 'cancel') S.socket.emit('chip', { act: 'cancel' });
      else S.socket.emit('chip', { act: 'vote', yes: vb.dataset.v === 'yes' });
      return;
    }
    const plus = t.closest && t.closest('.chip-plus');
    if (plus) { const s = plus.closest('.chip-slot'); S.socket.emit('chip', { act: 'add', value: Number(s.dataset.v), delta: 1 }); return; }
    const minus = t.closest && t.closest('.chip-minus');
    if (minus) { const s = minus.closest('.chip-slot'); S.socket.emit('chip', { act: 'add', value: Number(s.dataset.v), delta: -1 }); return; }
  });

  /* 拖一枚扔进公共筹码区：不必扔进框里，往上甩到加减号那一带就算 */
  document.addEventListener('pointerdown', (e) => {
    const slot = e.target.closest && e.target.closest('.chip-slot');
    if (!slot || slot.dataset.where !== 'me') return;
    if (e.target.closest('.chip-plus') || e.target.closest('.chip-minus') || e.target.closest('#chipInput')) return;
    const v = Number(slot.dataset.v);
    const myId = (S.me && S.me.id) || '';
    const me = ((S.state && S.state.players) || []).find((p) => p.id === myId);
    const have = (me && me.chips && me.chips[v]) || 0;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    let ghost = null;
    const rowBox = document.getElementById('chipRow').getBoundingClientRect();
    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        moved = true;
        ghost = document.createElement('i');
        ghost.className = 'cchip flying';
        ghost.style.setProperty('--cc', CHIP_C[v]);
        document.body.appendChild(ghost);
      }
      if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) return;
      if (ghost) ghost.remove();
      if (have < 1) { chipBigX(); return; }
      const zone = document.getElementById('midZone').getBoundingClientRect();
      const inZone = ev.clientX >= zone.left - 60 && ev.clientX <= zone.right + 60 &&
        ev.clientY >= zone.top - 140 && ev.clientY <= zone.bottom + 30;
      const thrownUp = ev.clientY <= rowBox.top + 4;
      if (inZone || thrownUp) S.socket.emit('chip', { act: 'toMid', value: v, count: 1 });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  document.addEventListener('dblclick', (e) => {
    const slot = e.target.closest && e.target.closest('.chip-slot');
    if (!slot || slot.dataset.where !== 'me') return;
    if (e.target.closest('.chip-plus') || e.target.closest('.chip-minus')) return;
    chipInlineInput(slot);
  });


  /* ---- 版本自检：我改完代码但你页面没刷新时，右下角会冒出一个刷新按钮 ---- */
  const MY_V = (() => {
    const sc = document.querySelector('script[src*="app.js"]');
    const m = sc && /[?&]v=(\d+)/.exec(sc.src);
    return m ? m[1] : '';
  })();
  function showNewVer() {
    if (document.getElementById('newVer')) return;
    const b = document.createElement('button');
    b.id = 'newVer';
    b.textContent = '有新版本 · 点这里刷新';
    b.onclick = () => location.reload(true);
    document.body.appendChild(b);
  }
  async function checkBuild() {
    try {
      const r = await fetch('/api/build', { cache: 'no-store' });
      const j = await r.json();
      if (MY_V && j && j.v && String(j.v) !== String(MY_V)) showNewVer();
    } catch (e) { /* 断线时忽略 */ }
  }
  setTimeout(checkBuild, 4000);
  setInterval(checkBuild, 15000);

  /* ================= 本机桌面背景（只存本机，不上传） ================= */
  const BG_DB = 'sgs_bg';
  function bgIDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(BG_DB, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) {} };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function bgGet(k) {
    try {
      const db = await bgIDB();
      return await new Promise((res) => {
        const t = db.transaction('kv', 'readonly').objectStore('kv').get(k);
        t.onsuccess = () => res(t.result);
        t.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  async function bgSet(k, v) {
    try {
      const db = await bgIDB();
      return await new Promise((res) => {
        const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k);
        t.onsuccess = () => res(true);
        t.onerror = () => res(false);
      });
    } catch (e) { return false; }
  }
  function shrinkImage(file, maxW, q) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, (maxW || 1920) / Math.max(1, img.width));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', q || 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      img.src = url;
    });
  }
  function applyBg() {
    const t = el.table;
    if (!t) return;
    const b = S.bg || {};
    if (b.url) {
      const vv = Number(S.bg && S.bg.veil);
      const v = isFinite(vv) ? Math.max(0, Math.min(0.92, vv)) : 0.55;
      const shade = 'rgba(4,8,6,' + v.toFixed(2) + ')';
      t.style.backgroundImage = 'linear-gradient(' + shade + ',' + shade + '),url("' + b.url + '")';
      t.style.backgroundSize = 'cover,cover';
      t.style.backgroundPosition = 'center,center';
      t.classList.add('custom-bg');
    } else {
      t.style.backgroundImage = '';
      t.style.backgroundSize = '';
      t.style.backgroundPosition = '';
      t.classList.remove('custom-bg');
    }
  }
  /* ---- 选项左侧弹出的小分支（齿轮里不再往下堆） ---- */
  function closeFlyout() {
    const f = document.getElementById('flyout');
    if (f) f.remove();
  }
  function flyoutLeft(anchor, items) {
    const open = document.getElementById('flyout');
    if (open && open.dataset.anchor === (anchor.id || '')) { closeFlyout(); return null; }
    closeFlyout();
    const f = document.createElement('div');
    f.id = 'flyout';
    f.className = 'flyout';
    f.dataset.anchor = anchor.id || '';
    f.innerHTML = items.map((it, i) => '<button data-i="' + i + '"' + (it.gray ? ' class="gray"' : '') + '>' + it.label + '</button>').join('');
    document.body.appendChild(f);
    const r = anchor.getBoundingClientRect();
    const w = f.offsetWidth, h = f.offsetHeight;
    let left = r.left - w - 8;
    if (left < 6) left = Math.min(window.innerWidth - w - 6, r.right + 8);
    let top = r.top + r.height / 2 - h / 2;
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    f.style.left = left + 'px';
    f.style.top = top + 'px';
    f.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const it = items[+b.dataset.i];
      closeFlyout();
      if (it && it.onClick) it.onClick();
    });
    return f;
  }
  document.addEventListener('pointerdown', (ev) => {
    const f = document.getElementById('flyout');
    if (!f) return;
    if (f.contains(ev.target)) return;
    const a = document.getElementById(f.dataset.anchor || '');
    if (a && a.contains(ev.target)) return;
    closeFlyout();
  }, true);

  function ensureBgButtons() {
    const tray = el.gearTray;
    if (!tray || document.getElementById('bgBtn')) return;
    const b1 = document.createElement('button');
    b1.id = 'bgBtn';
    b1.innerHTML = '🖼 <span>换桌面背景</span>';
    tray.appendChild(b1);
    b1.addEventListener('click', () => {
      flyoutLeft(b1, [
        { label: '🖼 换一张', onClick: () => pickBg() },
        { label: '↺ 还原默认', gray: true, onClick: () => resetBg() }
      ]);
    });
  }
  async function resetBg() {
    S.bg = { url: '' };
    applyBg();
    await bgSet('img', '');
    toast('已恢复默认背景');
  }
  function pickBg() {
    let inp = document.getElementById('bgFile');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file';
      inp.id = 'bgFile';
      inp.accept = 'image/*';
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        inp.value = '';
        if (!f) return;
        if (f.size > 40 * 1024 * 1024) { toast('这张图太大了（超过 40MB）'); return; }
        try {
          const data = await shrinkImage(f, 1920, 0.82);
          const veil = (S.bg && Number(S.bg.veil)) || 0.45;
          S.bg = { url: data, veil };
          await bgSet('img', data);
          await bgSet('veil', veil);
          applyBg();
          toast('换好了（只有你这台电脑看得到）');
        } catch (e) { toast('这张图读不了，换一张试试'); }
      });
    }
    inp.click();
  }
  /* 键盘上下键直接调背景亮度（没有任何按钮/选项） */
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    if (!S.bg || !S.bg.url) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    ev.preventDefault();
    const cur = Number(S.bg.veil); const v = isFinite(cur) ? cur : 0.45;
    const nv = Math.max(0, Math.min(0.92, +(v + (ev.key === 'ArrowUp' ? -0.05 : 0.05)).toFixed(2)));
    S.bg.veil = nv; applyBg(); bgSet('veil', nv);
    toast('背景亮度 ' + Math.round((1 - nv) * 100) + '%');
  }, { passive: false });

  (async () => {
    ensureBgButtons();
    const img = await bgGet('img');
    const veil = await bgGet('veil');
    S.bg = { url: img || '', veil: typeof veil === 'number' ? veil : 0.45 };
    applyBg();
  })();


  /* ================= 本地预览：没有朋友时也能看四人桌长什么样 ================= */
  function previewHero(i) {
    const pool = (S.state && S.state.heroes) || window.__HEROES || [];
    return pool.length ? pool[i % pool.length] : 'preview' + i;
  }
  window.__pv = previewLayout;
  function previewLayout() {
    const heroes = (window.__HEROES && window.__HEROES.length) ? window.__HEROES : null;
    if (!heroes) { fetch('/api/heroes').then(r => r.json()).then(j => { window.__HEROES = j.heroes || []; previewLayout(); }).catch(() => {}); return; }
    const mkCard = (i, up, name) => ({ id: 'pv' + i, name: name || '杀', suit: '♠', num: 7, up: up !== false, type: 'basic' });
    const bot = (id, name, seat, hero, hp, hand, f0, f1) => ({
      id, name, seat, hero, hp, maxHp: 4, armor: 0, handCount: hand,
      equip: { weapon: null, armor: null, horsePlus: null, horseMinus: null },
      fronts: [[mkCard(seat * 10 + 1, f0 !== false), mkCard(seat * 10 + 2, f0 !== false)], [mkCard(seat * 10 + 3, f1 !== false)]],
    });
    const me = bot('me-preview', '我自己六个字', 0, heroes[0], 3, 5, true, true);
    const st = {
      mode: 'sanguosha', gameName: '预览（斗地主）', phase: 'play', meId: me.id,
      players: [me, bot('pv-b1', '阿明六个字啊', 1, heroes[1], 2, 4, false, true),
                     bot('pv-b2', '小美六个字啊', 2, heroes[2], 4, 7, true, false),
                     bot('pv-b3', '老王六个字啊', 3, heroes[3], 1, 2, true, true)],
      heroPool: null, roomPool: null, landlordId: 'pv-b1',
      piles: [{ id: 'main', count: 84 }],
      tableCards: [mkCard(901, true), mkCard(902, true)],
      discardTop: [mkCard(903, true, '闪'), mkCard(904, true, '桃')], discardCount: 9,
      mid: [], midChips: {}, chipVote: null, gain: null,
      handCards: [mkCard(101, true, '杀'), mkCard(102, true, '闪'), mkCard(103, true, '桃'), mkCard(104, true, '决斗'), mkCard(105, true, '赤兔')],
      draft: null, hostId: me.id, rotate: 0,
    };
    closeFlyout && closeFlyout();
    el.lobby.hidden = true;
    el.game.hidden = false;
    S.state = st;
    S.rot = 0;
    S.seatEls.forEach((n) => n.remove());
    S.seatEls.clear();
    try { render(); } catch (err) { window.__pvErr = String(err && err.stack || err); console.error('PREVIEW', err); }
    toast('这是预览：4 人桌的排版长这样，点右上角 ⚙ → 退出预览 可回大厅');
    const quit = document.createElement('button');
    quit.id = 'previewQuit';
    quit.textContent = '✕ 退出预览';
    quit.style.cssText = 'position:fixed;left:14px;top:14px;z-index:9999;padding:8px 14px;border-radius:10px;border:1px solid #d8b25a;background:#1b2a20;color:#ffe9c8;font-weight:700;cursor:pointer';
    quit.onclick = () => { quit.remove(); el.game.hidden = true; el.lobby.hidden = false; S.state = null; S.seatEls.forEach((n) => n.remove()); S.seatEls.clear(); };
    document.body.appendChild(quit);
  }
})();

/* ==================== 背景音乐（双击左上角「自由桌」开启｜所有人一起听） ==================== */
(function () {
  var KEY = 'sgs_music_v1';
  var mem = {};
  try { mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { mem = {}; }
  var vol = typeof mem.vol === 'number' ? Math.max(0, Math.min(1, mem.vol)) : 0.6;
  var tracks = [];
  var st = null;
  var audio = null;
  var panel = null, listEl = null, tipEl = null, curEl = null, playBtn = null, volBtn = null, volPop = null, volRange = null;
  var volTrack = null, volFill = null, volKnob = null, volLab = null;
  var needGesture = false;
  var armed = false;   /* 只有本标签页自己点过播放/选歌，才允许出声 */

  function save() { try { localStorage.setItem(KEY, JSON.stringify({ vol: vol })); } catch (e) {} }

  /* ---------- 音量（自绘竖条：整条区域都能按/拖） ---------- */
  function syncVol() {
    var p = Math.round(vol * 100);
    if (volFill) volFill.style.height = p + '%';
    if (volKnob) volKnob.style.bottom = p + '%';
    if (volLab) volLab.textContent = p + '%';
    if (volBtn) {
      volBtn.innerHTML = vol <= 0.01 ? '🔇' : vol < 0.45 ? '🔉' : '🔊';
      volBtn.title = '音量 ' + p + '%';
    }
  }
  function setVol(v) {
    vol = Math.max(0, Math.min(1, v));
    if (audio) audio.volume = vol;
    save();
    syncVol();
  }
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var msock = null;
  function sockRef() {
    if (msock) return msock;
    if (!window.io) return null;
    msock = window.io({ transports: ['websocket', 'polling'] });
    msock.on('music:state', applyState);
    msock.on('connect', function () { try { msock.emit('music:cmd', { action: 'sync' }); } catch (e) { /* ignore */ } });
    return msock;
  }
  function send(p) { var s = sockRef(); if (!s) return; try { s.emit('music:cmd', p); } catch (e) { /* ignore */ } }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = vol;
    audio.addEventListener('ended', function () { send({ action: 'next' }); });
    return audio;
  }

  function trackName(file) {
    if (!file) return '';
    for (var i = 0; i < tracks.length; i += 1) if (tracks[i].file === file) return tracks[i].name;
    var s = String(file).split('/').pop();
    try { s = decodeURIComponent(s); } catch (e) { /* ignore */ }
    return s.replace(/\.[^.]+$/, '');
  }

  /* ---------- 把“服务器状态”落到本机播放器 ---------- */
  function applyState(s) {
    if (!s) return;
    s.recvAt = (window.performance && performance.now) ? performance.now() : Date.now();
    st = s;
    var a = ensureAudio();
    if (!s.track) {
      try { a.pause(); } catch (e) { /* ignore */ }
      a.__track = null;
      render();
      return;
    }
    if (a.__track !== s.track) {
      a.__track = s.track;
      a.src = s.track;
      a.load();
      needGesture = false;
    }
    var nowMs = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
    var expect = function () { return (s.pos || 0) + (s.playing ? (nowMs() - s.recvAt) / 1000 : 0); };
    var seek = function () {
      try {
        var t = expect();
        if (t > 0.3 && Math.abs(a.currentTime - t) > 0.35) a.currentTime = t;
      } catch (e) { /* ignore */ }
    };
    if (s.playing && !armed) {
      try { a.pause(); } catch (e) { /* ignore */ }
      render();
      return;
    }
    if (s.playing) {
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () { needGesture = true; render(); });
      if (a.readyState >= 1) seek(); else a.addEventListener('loadedmetadata', seek, { once: true });
      a.addEventListener('canplay', seek, { once: true });
    } else {
      try { a.pause(); } catch (e) { /* ignore */ }
      if (a.readyState >= 1) seek();
    }
    render();
  }

  /* 每 4 秒纠一次对：大家听的位置尽量齐 */
  setInterval(function () {
    if (!st || !st.playing || !audio || audio.paused || !st.track) return;
    var nowMs = (window.performance && performance.now) ? performance.now() : Date.now();
    var t = (st.pos || 0) + (nowMs - (st.recvAt || nowMs)) / 1000;
    if (Math.abs(audio.currentTime - t) > 0.4) { try { audio.currentTime = t; } catch (e) { /* ignore */ } }
  }, 2000);

  setTimeout(function () { sockRef(); }, 0);

  /* ---------- 曲库 ---------- */
  function loadList(cb) {
    fetch('api/music/list', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        tracks = (j && j.list) || [];
        renderList();
        if (cb) cb();
      })
      .catch(function () {
        tracks = [];
        renderList();
        if (cb) cb();
      });
  }

  /* ---------- 界面 ---------- */
  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!tracks.length) {
      var e = make('div', 'mz-empty');
      e.innerHTML = '还没有歌。<br>把 mp3 丢进 <b>public\\music</b> 文件夹，再点下面的「刷新」。';
      listEl.appendChild(e);
      return;
    }
    tracks.forEach(function (t) {
      var row = make('button', 'mz-row' + (st && st.track === t.file ? ' on' : ''));
      row.type = 'button';
      var ic = make('span', 'mz-ic', st && st.track === t.file ? (st.playing ? '❚❚' : '▶') : '🎵');
      var nm = make('b', 'mz-nm', t.name);
      row.appendChild(ic);
      row.appendChild(nm);
      row.addEventListener('click', function () { armed = true; send({ action: 'select', track: t.file }); });
      listEl.appendChild(row);
    });
  }

  function render() {
    if (!panel) return;
    var name = st && st.track ? trackName(st.track) : '未选择';
    curEl.innerHTML = '';
    var sp = make('span', 'mz-note', st && st.track ? (st.playing ? '♫' : '❚❚') : '♪');
    var tx = make('span', 'mz-name', name);
    curEl.appendChild(sp);
    curEl.appendChild(tx);
    if (st && st.by) {
      var by = make('span', 'mz-cur-by', st.by);
      curEl.appendChild(by);
    }
    if (playBtn) {
      var localPlaying = !!(audio && !audio.paused);
      playBtn.innerHTML = localPlaying
        ? '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="4" width="4" height="16" rx="1.4"/><rect x="14" y="4" width="4" height="16" rx="1.4"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>';
      playBtn.title = st && st.playing ? '暂停（所有人一起停）' : '播放（所有人一起听）';
    }
    if (volBtn) {
      volBtn.innerHTML = vol <= 0.01 ? '🔇' : vol < 0.45 ? '🔉' : '🔊';
      volBtn.title = '音量 ' + Math.round(vol * 100) + '%';
    }
    syncVol();
    if (tipEl) {
      if (needGesture) { tipEl.hidden = false; tipEl.textContent = '浏览器拦了自动播放：点一下 ▶ 就有声了'; }
      else if (st && st.track) { tipEl.hidden = true; tipEl.textContent = ''; }
      else { tipEl.hidden = true; tipEl.textContent = ''; }
    }
    renderList();
  }

  function build() {
    panel = make('div');
    panel.id = 'musicPanel';
    panel.className = 'on';

    var head = make('div', 'mz-head');
    var title = make('div', 'mz-title', '一起听');
    var x = make('button', 'mz-x', '✕');
    x.type = 'button';
    x.addEventListener('click', hide);
    head.appendChild(title);
    head.appendChild(x);

    curEl = make('div', 'mz-now');

    listEl = make('div', 'mz-list');

    tipEl = make('div', 'mz-tip');
    tipEl.hidden = true;

    var foot = make('div', 'mz-foot');
    var prev = make('button', 'mz-btn', '⏮');
    var next = make('button', 'mz-btn', '⏭');
    playBtn = make('button', 'mz-btn mz-play', '');
    volBtn = make('button', 'mz-btn mz-volbtn', '🔊');
    var rf = make('button', 'mz-btn mz-refresh', '刷新');
    [prev, next, playBtn, volBtn, rf].forEach(function (b) { b.type = 'button'; });

    prev.addEventListener('click', function () { armed = true; send({ action: 'prev' }); });
    next.addEventListener('click', function () { armed = true; send({ action: 'next' }); });
    playBtn.addEventListener('click', function () {
      needGesture = false;
      armed = true;
      var mine = audio && !audio.paused;   /* 看本机是否真的在响，而不是看服务器状态 */
      send({ action: mine ? 'pause' : 'play' });
    });
    rf.addEventListener('click', function () { loadList(); });

    volPop = make('div', 'mz-volpop');
    volTrack = make('div', 'mz-vtrack');
    volFill = make('i', 'mz-vfill');
    volKnob = make('b', 'mz-vknob');
    volTrack.appendChild(volFill);
    volTrack.appendChild(volKnob);
    volLab = make('span', 'mz-vlab', '');
    volPop.appendChild(volTrack);
    volPop.appendChild(volLab);
    var volDrag = false;
    var volFromY = function (clientY) {
      var r = volTrack.getBoundingClientRect();
      if (!r.height) return;
      setVol((r.bottom - clientY) / r.height);      /* 下=0，上=1 */
    };
    volPop.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      e.preventDefault();
      volDrag = true;
      try { volPop.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      volFromY(e.clientY);
    });
    volPop.addEventListener('pointermove', function (e) {
      if (!volDrag) return;
      e.preventDefault();
      volFromY(e.clientY);
    });
    var volEnd = function () { volDrag = false; };
    volPop.addEventListener('pointerup', volEnd);
    volPop.addEventListener('pointercancel', volEnd);
    window.addEventListener('pointerup', volEnd);
    volPop.addEventListener('wheel', function (e) {
      e.preventDefault();
      setVol(vol + (e.deltaY < 0 ? 0.06 : -0.06));
    }, { passive: false });
    volBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      volPop.classList.toggle('on');
    });

    foot.appendChild(prev);
    foot.appendChild(playBtn);
    foot.appendChild(next);
    foot.appendChild(volBtn);
    foot.appendChild(rf);

    panel.appendChild(head);
    panel.appendChild(curEl);
    panel.appendChild(listEl);
    panel.appendChild(tipEl);
    panel.appendChild(foot);
    panel.appendChild(volPop);
    panel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    panel.addEventListener('click', function (e) {
      if (volPop && volPop.classList.contains('on') && !volPop.contains(e.target) && e.target !== volBtn) {
        volPop.classList.remove('on');
      }
    });
    document.body.appendChild(panel);
    render();
    loadList();
    return panel;
  }

  function show() {
    if (!panel) build();
    panel.classList.add('on');
    loadList();
  }
  function hide() {
    if (panel) panel.classList.remove('on');
    if (volPop) volPop.classList.remove('on');
  }
  function toggle() {
    if (!panel || !panel.classList.contains('on')) show(); else hide();
  }

  document.addEventListener('dblclick', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var bar = t.closest('#topbar');
    if (!bar) return;
    if (!t.closest('b, h1, .brand, span')) return;
    e.preventDefault();
    toggle();
  });

  window.__music = { show: show, hide: hide, toggle: toggle, applyState: applyState, get audio() { return audio; } };
})();

/* ===== v156 龙角内部透光（水晶感）：光在角内由根部向尖部涌动，颜色取自角本身 ===== */
(function () {
  const KEY = 'horn_fx_cfg_v4';
  const DEFAULTS = {
    '814585d867c46f87f9a5ba32614bae75': {
      l: { x: 52.5, y: 10.0, ang: -16, w: 13, h: 20 },
      r: { x: 64.0, y: 9.5, ang: 13, w: 12, h: 19 }
    }
  };
  /* 角本身是青玉色；采样太灰时用它兜底 */
  const JADE = { g1: '50,150,130', g2: '140,235,205', g3: '235,255,248', g4: '190,255,235' };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadCfg() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    const base = clone(DEFAULTS);
    if (saved && typeof saved === 'object') {
      Object.keys(saved).forEach(function (hero) {
        base[hero] = base[hero] || {};
        ['l', 'r'].forEach(function (k) {
          if (saved[hero] && saved[hero][k]) {
            base[hero][k] = Object.assign({}, base[hero][k] || {}, saved[hero][k]);
          }
        });
      });
    }
    return base;
  }
  const CFG = loadCfg();
  function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(CFG)); } catch (e) { } }

  function sampleColor(img, cfg) {
    try {
      const W = 54, H = 72;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0, W, H);
      const px = [];
      ['l', 'r'].forEach(function (k) {
        const a = cfg[k]; if (!a) return;
        const cx = a.x / 100 * W, cy = a.y / 100 * H;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -3; dy <= 3; dy++) {
            const x = Math.max(0, Math.min(W - 1, Math.round(cx + dx)));
            const y = Math.max(0, Math.min(H - 1, Math.round(cy + dy)));
            const d = g.getImageData(x, y, 1, 1).data;
            if (d[3] < 8) continue;
            px.push([d[0], d[1], d[2]]);
          }
        }
      });
      if (!px.length) return JADE;
      px.sort(function (a, b) {
        const sa = Math.max(a[0], a[1], a[2]) - Math.min(a[0], a[1], a[2]);
        const sb = Math.max(b[0], b[1], b[2]) - Math.min(b[0], b[1], b[2]);
        return sb - sa;
      });
      const take = px.slice(0, Math.max(4, Math.floor(px.length * 0.4)));
      let r = 0, gg = 0, bb = 0;
      take.forEach(function (p) { r += p[0]; gg += p[1]; bb += p[2]; });
      r /= take.length; gg /= take.length; bb /= take.length;
      const mx = Math.max(r, gg, bb) || 1;
      const sat = (mx - Math.min(r, gg, bb)) / mx;
      if (sat < 0.45) return JADE;                       /* 采样点偏灰（头发/天空）→ 用角本身的青玉色 */
      const k = 240 / mx;
      const g3 = [r, gg, bb].map(function (v) { return Math.min(255, Math.round(v * k)); });
      const g2 = [r, gg, bb].map(function (v) { return Math.min(255, Math.round(v * 1.7)); });
      const g1 = [r, gg, bb].map(function (v) { return Math.min(255, Math.round(v * 1.15)); });
      const g4 = g3.map(function (v) { return Math.min(255, Math.round(255 - (255 - v) * 0.55)); });
      return { g1: g1.join(','), g2: g2.join(','), g3: g3.join(','), g4: g4.join(',') };
    } catch (e) {
      return JADE;
    }
  }

  function place(el, c) {
    if (!el || !c) return;
    el.style.left = c.x + '%';
    el.style.top = c.y + '%';
    el.style.setProperty('--ang', (c.ang || 0) + 'deg');
  }

  function build(box, cfg, hero) {
    const fx = document.createElement('div');
    fx.className = 'horn-fx';
    fx.dataset.hero = hero;
    ['l', 'r'].forEach(function (k) {
      const c = cfg[k]; if (!c) return;
      const bloom = document.createElement('i');
      bloom.className = 'horn-bloom ' + k;
      bloom.dataset.k = k;
      place(bloom, c);
      bloom.style.width = (c.w * 2) + '%';
      bloom.style.height = (c.h * 1.8) + '%';
      fx.appendChild(bloom);

      const glow = document.createElement('i');
      glow.className = 'horn-glow ' + k;
      glow.dataset.k = k;
      place(glow, c);
      glow.style.width = c.w + '%';
      glow.style.height = c.h + '%';
      fx.appendChild(glow);
    });
    box.appendChild(fx);
    const img = box.querySelector('img');
    const col = img ? sampleColor(img, cfg) : JADE;
    ['g1', 'g2', 'g3', 'g4'].forEach(function (n) { fx.style.setProperty('--' + n, col[n]); });
    return fx;
  }

  function refresh(box, cfg) {
    const fx = box.querySelector('.horn-fx');
    if (!fx) return;
    fx.querySelectorAll('.horn-glow,.horn-bloom').forEach(function (el) {
      const c = cfg[el.dataset.k];
      if (!c) return;
      place(el, c);
      el.style.width = (el.classList.contains('horn-bloom') ? c.w * 2 : c.w) + '%';
      el.style.height = (el.classList.contains('horn-bloom') ? c.h * 1.8 : c.h) + '%';
    });
  }

  window.applyHornFx = function (box, hero) {
    if (!box) return;
    const old = box.querySelector('.horn-fx');
    const cfg = hero && CFG[hero];
    if (!cfg) { if (old) old.remove(); return; }
    if (old) {
      if (old.dataset.hero === hero) refresh(box, cfg);
      else old.remove();
      return;
    }
    build(box, cfg, hero);
    if (calibOn) drawHandles(box);
  };

  /* ---- 校准：按 H 在自己武将牌上显示两个可拖动的点 ---- */
  let calibOn = false;
  function drawHandles(box) {
    const fx = box.querySelector('.horn-fx');
    if (!fx) return;
    const hero = fx.dataset.hero, cfg = CFG[hero];
    if (!cfg) return;
    fx.querySelectorAll('.horn-handle').forEach(function (n) { n.remove(); });
    if (!calibOn) { fx.classList.remove('calib'); return; }
    fx.classList.add('calib');
    ['l', 'r'].forEach(function (k) {
      const c = cfg[k]; if (!c) return;
      const h = document.createElement('div');
      h.className = 'horn-handle ' + k;
      h.style.left = c.x + '%';
      h.style.top = c.y + '%';
      h.title = (k === 'l' ? '左角' : '右角') + '：拖动摆位置；滚轮调大小；双击恢复默认';
      h.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        const r = box.getBoundingClientRect();
        const move = function (e2) {
          const px = (e2.clientX - r.left) / r.width * 100;
          const py = (e2.clientY - r.top) / r.height * 100;
          c.x = Math.round(Math.max(-10, Math.min(110, px)) * 10) / 10;
          c.y = Math.round(Math.max(-10, Math.min(110, py)) * 10) / 10;
          h.style.left = c.x + '%'; h.style.top = c.y + '%';
          refresh(box, cfg); saveCfg();
        };
        const up = function () {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      h.addEventListener('wheel', function (ev) {
        ev.preventDefault();
        const d = ev.deltaY < 0 ? 1 : -1;
        c.h = Math.max(4, Math.min(60, (c.h || 18) + d));
        c.w = Math.max(3, Math.min(60, Math.round(((c.w || 14) + d * 0.8) * 10) / 10));
        refresh(box, cfg); saveCfg();
      }, { passive: false });
      h.addEventListener('dblclick', function () {
        const d = DEFAULTS[hero] && DEFAULTS[hero][k];
        if (!d) return;
        Object.assign(c, d);
        h.style.left = c.x + '%'; h.style.top = c.y + '%';
        refresh(box, cfg); saveCfg();
      });
      fx.appendChild(h);
    });
  }
  window.hornCalib = function (on) {
    calibOn = (on === undefined) ? !calibOn : !!on;
    const mh = document.getElementById('meHero');
    if (mh && mh.querySelector('.horn-fx')) drawHandles(mh);
    else calibOn = false;
    return calibOn;
  };
  document.addEventListener('keydown', function (e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'h' || e.key === 'H') {
      const on = window.hornCalib();
      try { toast(on ? '龙角校准：拖动红/绿点对准龙角，滚轮调大小，再按 H 退出' : '龙角校准已退出'); } catch (err) { }
    }
  });
  window.__HORN_FX = CFG;
  window.__HORN_DEFAULTS = DEFAULTS;
})();

/* ===== v159 锦囊牌：双击左上角房间号 → 勾选锦囊 → 确认后洗进牌堆并重新洗牌 ===== */
(function () {
  var GROUPS = [
    {
      id: 'card', name: '卡牌锦囊', tone: 'light', items: [
        { id: 'jiangji', name: '将计就计', n: 3 },
        { id: 'beishui', name: '背水一战', n: 2 },
        { id: 'yushi', name: '玉石俱焚', n: 2 },
        { id: 'jiagong', name: '假公济私', n: 2 },
        { id: 'jinshang', name: '锦上添花', n: 3 },
        { id: 'luojing', name: '落井下石', n: 2 },
        { id: 'guji', name: '故技重施', n: 3 },
        { id: 'wuxie', name: '无懈可击', n: 2 }
      ]
    },
    {
      id: 'role', name: '角色锦囊', tone: 'deep', items: [
        { id: 'zhudou', name: '煮豆燃萁', n: 7 }
      ]
    }
  ];
  var panel = null, body = null, hint = null;

  function state() { return (window.__S && window.__S.state) || null; }
  function addedIds() {
    var st = state();
    return (st && st.trickAdded) || [];
  }
  function sock() { return (window.__S && window.__S.socket) || null; }

  function build() {
    panel = document.createElement('div');
    panel.id = 'trickPanel';
    var head = document.createElement('div');
    head.className = 'tp-head';
    var t = document.createElement('b');
    t.textContent = '锦囊牌';
    var x = document.createElement('button');
    x.className = 'tp-x';
    x.type = 'button';
    x.textContent = '✕';
    x.addEventListener('click', hide);
    head.appendChild(t);
    head.appendChild(x);

    body = document.createElement('div');
    body.className = 'tp-body';

    hint = document.createElement('div');
    hint.className = 'tp-hint';
    hint.textContent = '勾选要加入这一局的锦囊，确认后会洗进摸牌堆并重新洗乱。';

    var foot = document.createElement('div');
    foot.className = 'tp-foot';
    var ok = document.createElement('button');
    ok.className = 'tp-ok';
    ok.type = 'button';
    ok.textContent = '确认加入';
    ok.addEventListener('click', confirm);
    var cancel = document.createElement('button');
    cancel.className = 'tp-cancel';
    cancel.type = 'button';
    cancel.textContent = '关闭';
    cancel.addEventListener('click', hide);
    foot.appendChild(ok);
    foot.appendChild(cancel);

    panel.appendChild(head);
    panel.appendChild(hint);
    panel.appendChild(body);
    panel.appendChild(foot);
    document.body.appendChild(panel);
    render();
  }

  function render() {
    if (!panel) return;
    var done = addedIds();
    body.innerHTML = '';
    GROUPS.forEach(function (g) {
      var box = document.createElement('div');
      box.className = 'tp-group ' + g.tone;
      var gt = document.createElement('div');
      gt.className = 'tp-gname ' + g.tone;
      gt.textContent = g.name;
      box.appendChild(gt);
      g.items.forEach(function (it) {
        var on = done.indexOf(it.id) >= 0;
        var row = document.createElement('label');
        row.className = 'tp-row ' + g.tone + (on ? ' done' : '');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.id = it.id;
        cb.checked = on;
        cb.disabled = on;
        var nm = document.createElement('b');
        nm.textContent = it.name;
        var ct = document.createElement('em');
        ct.textContent = on ? '已加入' : it.n + ' 张';
        row.appendChild(cb);
        row.appendChild(nm);
        row.appendChild(ct);
        box.appendChild(row);
      });
      body.appendChild(box);
    });
  }

  function confirm() {
    var s = sock();
    if (!s) { try { toast('还没进房间'); } catch (e) { } return; }
    var done = addedIds();
    var ids = [];
    body.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      if (cb.checked && !cb.disabled && done.indexOf(cb.dataset.id) < 0) ids.push(cb.dataset.id);
    });
    if (!ids.length) { try { toast('没有新勾选的锦囊'); } catch (e) { } return; }
    s.emit('op', { type: 'addTricks', ids: ids });
    hide();
    try { toast('正在洗入 ' + ids.length + ' 种锦囊…'); } catch (e) { }
  }

  function show() { if (!panel) build(); render(); panel.classList.add('on'); }
  function hide() { if (panel) panel.classList.remove('on'); }
  function toggle() { if (panel && panel.classList.contains('on')) hide(); else show(); }

  document.addEventListener('dblclick', function (e) {
    var t = e.target;
    if (t && (t.id === 'roomLabel' || (t.closest && t.closest('#roomLabel')))) {
      e.preventDefault();
      toggle();
    }
  }, true);

  /* 服务器洗入成功后，卡片里会带回 trickAdded，面板自动打勾 */
  window.addEventListener('__trick_sync', function () { if (panel && panel.classList.contains('on')) render(); });
  window.__trickPanel = { show: show, hide: hide, toggle: toggle };

  /* ===== v236 ESC/F11 ===== */
  (function escFullV236() {
    if (window.__escFullV236) return;
    window.__escFullV236 = true;
    var box = null;
    function room() {
      try {
        var s = window.__S;
        var r = s ? (s.state || s.st) : null;
        if (r && r.players) return true;
        var g = document.getElementById('game');
        if (g && !g.hidden) return true;
        var il = document.getElementById('islRoot');
        if (il && !il.hidden) return true;
        return false;
      } catch (e) { return false; }
    }
    function busy() {
      var sel = ['#heroZoom', '#draftLayer', '#modal', '#roleUI', '#busyLock', '.witch-modal', '#fateLayer'];
      for (var i = 0; i < sel.length; i++) {
        var n = document.querySelector(sel[i]);
        if (!n) continue;
        if (n.hidden) continue;
        var cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (Number(cs.opacity) < 0.15) continue;
        if (!n.getClientRects().length) continue;
        return true;
      }
      return false;
    }
    function close() { if (box) { box.remove(); box = null; } }
    function open() {
      if (box) return;
      box = document.createElement('div');
      box.setAttribute('data-v236', '1');
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(6,8,10,.62)';
      box.innerHTML = '<div style="min-width:320px;max-width:86vw;padding:24px 26px;border-radius:16px;' +
        'background:rgba(24,27,32,.97);border:1px solid rgba(226,196,120,.28);box-shadow:0 24px 70px rgba(0,0,0,.62);' +
        'text-align:center;color:#e9e3d6;font-family:inherit">' +
        '<div style="font-size:18px;font-weight:700;letter-spacing:1px;margin-bottom:8px">返回大厅？</div>' +
        '<div style="font-size:13px;opacity:.66;line-height:1.7;margin-bottom:20px">这一局会留在桌上，其他人还能接着打。</div>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
        '<button class="v236-no" style="min-width:104px;padding:9px 18px;border-radius:9px;border:1px solid rgba(255,255,255,.22);' +
        'background:rgba(255,255,255,.08);color:#e9e3d6;font-size:14px;cursor:pointer">取消</button>' +
        '<button class="v236-yes" style="min-width:104px;padding:9px 18px;border-radius:9px;border:1px solid rgba(226,196,120,.5);' +
        'background:linear-gradient(180deg,rgba(226,196,120,.3),rgba(226,196,120,.16));color:#ffe9b8;font-size:14px;' +
        'font-weight:600;cursor:pointer">返回大厅</button>' +
        '</div></div>';
      document.body.appendChild(box);
      box.querySelector('.v236-yes').onclick = function () { location.href = 'index.html'; };
      box.querySelector('.v236-no').onclick = close;
      box.addEventListener('click', function (e) { if (e.target === box) close(); });
    }
    document.addEventListener('keydown', function (e) {
      var k = e.key || '';
      if (k === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          var p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
          if (p && p.catch) p.catch(function () {});
        } else if (document.exitFullscreen) {
          document.exitFullscreen().catch(function () {});
        }
        return;
      }
      if (k !== 'Escape') return;
      if (box) { e.preventDefault(); close(); return; }
      if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen().catch(function () {}); return; }
      if (busy()) return;
      if (!room()) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      open();
    }, true);
  })();


  /* ===== v237 开屏动画 + 默认名字 ===== */
  (function bootV237() {
    var NICK_KEY = 'sgs_myName';
    function nickGet() { try { return (localStorage.getItem(NICK_KEY) || '').trim(); } catch (e) { return ''; } }
    function nickSet(v) { try { localStorage.setItem(NICK_KEY, v); } catch (e) {} }

    function paintIdBox() {
      var b = document.getElementById('myIdName');
      if (!b) return;
      var n = nickGet();
      b.textContent = n || '未设置';
      b.className = n ? '' : 'empty';
    }

    function bindIdBox() {
      var box = document.getElementById('myIdBox');
      if (!box || box.__bound) return;
      box.__bound = true;
      box.addEventListener('click', function () {
        if (box.querySelector('input')) return;
        var b = box.querySelector('b');
        var old = nickGet();
        var inp = document.createElement('input');
        inp.value = old;
        inp.maxLength = 12;
        inp.placeholder = '输入名字';
        b.style.display = 'none';
        box.insertBefore(inp, box.querySelector('em'));
        inp.focus(); inp.select();
        function done(save) {
          var v = (inp.value || '').trim().slice(0, 12);
          if (save && v) {
            nickSet(v);
            var nf = document.getElementById('name');
            if (nf) nf.value = v;
          }
          inp.remove(); b.style.display = ''; paintIdBox();
        }
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); done(true); }
          else if (e.key === 'Escape') { e.preventDefault(); done(false); }
          e.stopPropagation();
        });
        inp.addEventListener('blur', function () { done(true); });
      });
    }

    function prefillName() {
      var nf = document.getElementById('name');
      if (!nf) return;
      var n = nickGet();
      if (n && !nf.value.trim()) nf.value = n;
      if (nf.__nameBound) return;
      nf.__nameBound = true;
      nf.addEventListener('input', function () {
        var v = (nf.value || '').trim().slice(0, 12);
        if (v) { nickSet(v); paintIdBox(); }
      });
    }

    function flyName() {
      var box = document.getElementById('myIdBox');
      var el = document.getElementById('myIdName');
      var nm = nickGet() || (el && el.textContent) || '';
      if (!nm || !box) { if (box) box.style.opacity = '1'; return; }
      box.style.opacity = '0';
      var chip = document.createElement('div');
      chip.className = 'boot-name';
      chip.textContent = nm;
      document.body.appendChild(chip);
      var c = chip.getBoundingClientRect();
      var t = box.getBoundingClientRect();
      var dx = (t.left + t.width / 2) - (c.left + c.width / 2);
      var dy = (t.top + t.height / 2) - (c.top + c.height / 2);
      var an = chip.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 0.96, offset: 0 },
        { transform: 'translate(' + dx * 0.55 + 'px,' + dy * 0.55 + 'px) scale(.82)', opacity: 0.9, offset: 0.62 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.42)', opacity: 0, offset: 1 }
      ], { duration: 780, easing: 'cubic-bezier(.28,.72,.24,1)', fill: 'forwards' });
      an.onfinish = function () {
        chip.remove();
        box.style.opacity = '1';
        box.classList.add('pop');
        setTimeout(function () { box.classList.remove('pop'); }, 600);
      };
    }

    function boot() {
      bindIdBox();
      prefillName();
      paintIdBox();
      var sp = document.getElementById('bootSplash');
      if (!sp) { flyName(); return; }
      var qs = new URLSearchParams(location.search);
      if (qs.get('nosplash') === '1') { sp.remove(); flyName(); return; }

      requestAnimationFrame(function () { sp.classList.add('go'); });
      setTimeout(function () { sp.classList.add('dim'); }, 1150);          // 字变黑消失
      setTimeout(function () { sp.classList.add('out'); flyName(); }, 1650);
      setTimeout(function () { if (sp.parentNode) sp.remove(); }, 2350);

      // 预载框：只淡出，不位移（避免"突然跳到左上角"那种闪现）
      var pre = document.getElementById('preload');
      if (pre) {
        var mo = new MutationObserver(function () {
          if (pre.hidden) {
            pre.classList.add('fadeout');
            mo.disconnect();
          }
        });
        mo.observe(pre, { attributes: true, attributeFilter: ['hidden'] });
      }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  })();

})();
