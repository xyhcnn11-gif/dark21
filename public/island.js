/* 荒岛 21 天 · 客户端（独立命名空间 /island） */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  /* v232：认设备不认名字 —— 同一台机器同一个浏览器，断线重连 / 下一局都接得回来 */
  const DEV = (function () {
    try {
      let d = localStorage.getItem('isl_dev');
      if (!d) { d = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem('isl_dev', d); }
      return d;
    } catch (e) { return 'd0'; }
  })();
  function nick() {
    try {
      const n = S.name || localStorage.getItem('isl_nick') || '';
      if (n) localStorage.setItem('isl_nick', n);
      return n;
    } catch (e) { return S.name || ''; }
  }
  const S = { fateId: null, lastDay: null, lastPhase: null, lastCookStep: null, hpPrev: null, lastWeatherShown: null, ac: null,
    sfxSeen: {},     /* v164：已播过的产出音效 kind+at，防重复 */
    code: String(qs.get('room') || '').trim().toUpperCase(),
    name: String(qs.get('name') || '').trim(),
    sock: null,
    st: null,
    sel: null,       /* 选中的手牌 id */
    selMon: null,    /* 选中的野怪 id */
    joined: false,
    chestOpen: true,   /* v168：箱子块默认展开 */
    diff: String(qs.get('diff') || '').trim(),
    shSeen: {},        /* v186：已经播过碎裂动画的卡 */
    medAsked: {},    /* 今天已经问过用药的卡 id */
    dawnReady: 0,    /* v188：「第 N 天 / 清晨」大字落定之后才允许弹分药窗 */
  };

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- v186：食物碎裂（渺茫版每两夜碎一张） ---------------- */
  /* v187：右上角难度框（宝宝绿 / 简单黄 / 渺茫红 / 噩梦黑） */
  function paintDiff(st) {
    const box = el('diffChip');
    if (!box || !st) return;
    const key = st.diff || 'easy';
    const name = { baby: '宝宝', easy: '简单', bleak: '渺茫', nightmare: '噩梦' }[key] || key;
    box.textContent = name;
    box.className = 'diff-chip d-' + key;
    box.hidden = false;
    box.title = '';
  }

  function captureShatter(st) {
    if (!st || !Array.isArray(st.shatter) || !st.shatter.length) return [];
    const out = [];
    st.shatter.forEach((e) => {
      if (!e || !e.id || S.shSeen[e.id]) return;
      S.shSeen[e.id] = 1;
      const n = document.querySelector('[data-card="' + e.id + '"]');
      if (!n) return;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) return;
      out.push({ html: n.innerHTML, cls: n.className, x: r.left, y: r.top, w: r.width, h: r.height, name: e.name || '' });
    });
    return out;
  }

  function playShatter(list) {
    if (!list || !list.length) return;
    let fx = el('shatterFx');
    if (!fx) {
      fx = document.createElement('div');
      fx.id = 'shatterFx';
      document.body.appendChild(fx);
    }
    list.forEach((s) => {
      ['a', 'b'].forEach((half, i) => {
        const d = document.createElement('div');
        d.className = 'shard ' + half + ' ' + s.cls;
        d.style.left = s.x + 'px';
        d.style.top = s.y + 'px';
        d.style.width = s.w + 'px';
        d.style.height = s.h + 'px';
        d.style.setProperty('--dx', (i ? 1 : -1) * (10 + Math.random() * 12) + 'px');
        d.style.setProperty('--rot', (i ? 1 : -1) * (10 + Math.random() * 16) + 'deg');
        d.style.setProperty('--dy', (26 + Math.random() * 24) + 'px');
        d.innerHTML = '<div class="shard-in">' + s.html + '</div>';
        fx.appendChild(d);
        setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 900);
      });
      toast('「' + (s.name || '食物') + '」放坏了，碎成了渣');
      try { SFXW.play('crack', 0.3, 1200); } catch (e) {}
    });
  }

  /* ---------------- 提示 ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  /* ---------------- 通信 ---------------- */
  /* v150：断线/重连横幅（网络波动时给个明确提示，而不是整页像卡死） */
  function netBanner(txt) {
    let b = document.getElementById('netBanner');
    if (!txt) { if (b && b.parentNode) b.parentNode.removeChild(b); return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'netBanner';
      document.body.appendChild(b);
    }
    b.textContent = txt;
  }

  function connect() {
    S.sock = io('/island', {
      transports: ['websocket', 'polling'],
      /* v150：弱网自动重连（永不放弃），抖一抖就能自己接回来 */
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      reconnectionDelayMax: 3000,
      randomizationFactor: 0.5,
      timeout: 15000,
    });
  document.addEventListener('pointerdown', (ev) => {
    const t = ev.target;
    /* 箱子那一层单独处理，处理完就退出，不能把下面的通用点击吞掉 */
    if (t.closest && t.closest('#chestDock')) {
      if (t.closest('[data-act="chestToggle"]')) {
        S.chestOpen = (S.chestOpen === false);   /* 展开 ⇄ 收拢 */
        paintChestDock();
        return;
      }
      if (t.closest('[data-act="chestClose"]')) { S.chestOpen = false; paintChestDock(); return; }
      const cc = t.closest('#chestDock [data-card]');
      if (cc) { op({ type: 'chestTake', card: cc.dataset.card }); ev.preventDefault(); }
      return;
    }
    const lootEl = t.closest && t.closest('[data-loot]');
    if (lootEl) { op({ type: 'lootTake', card: lootEl.getAttribute('data-loot') }); return; }
    if (t.closest && t.closest('[data-act="lootOk"]')) { op({ type: 'lootOk' }); return; }
    const useEl = t.closest && t.closest('[data-use]');
    if (useEl) { op({ type: 'usetool', key: useEl.getAttribute('data-use') }); return; }
    /* v127：就餐区的牌不再「一点就取回手牌」——只能在就餐区之间拖（见下面 fDrag） */
  });
    S.sock.on('connect', () => {
      netBanner('');
      S.lastStateAt = Date.now();
      S.sock.emit('island:join', { code: S.code, name: S.name, diff: S.diff || '', dev: DEV,
        intent: (new URLSearchParams(location.search).get('intent') || 'auto') });
    });
    S.sock.on('disconnect', (why) => {
      if (why === 'io client disconnect') return;
      netBanner('网络波动，正在重连…（牌局还在）');
    });
    S.sock.on('connect_error', () => netBanner('连接不稳定，正在重试…'));
    S.sock.on('reconnect', () => netBanner(''));
    /* v156：服务端心跳脉冲算活动信号（房间没人操作时也不会被误判成断线） */
    S.sock.on('island:pulse', () => { S.lastStateAt = Date.now(); });
    /* v150：心跳自愈——客户端连着但 25 秒收不到任何状态，就自己掐断重连一次 */
    setInterval(() => {
      if (!S.sock || !S.sock.connected) return;
      if (!S.lastStateAt) { S.lastStateAt = Date.now(); return; }
      if (Date.now() - S.lastStateAt > 25000) {
        S.lastStateAt = Date.now();
        netBanner('好像卡住了，正在重连…');
        try { S.sock.disconnect(); } catch (e) {}
        try { S.sock.connect(); } catch (e) {}
      }
    }, 5000);
    S.sock.on('island:joined', (d) => {
      S.joined = true;
      el('roomChip').textContent = '房间 ' + d.code;
      if (d.seat != null) el('roomChip').dataset.seat = d.seat;
    });
    S.sock.on('island:state', (st) => {
      S.joined = true;
      S.lastStateAt = Date.now();
      S.st = st;
  try { roleUI(st); } catch (e) { console.error("roleUI", e); }
      if (S.sel && !(st.me && (st.me.hand || []).some((c) => c && c.id === S.sel))) S.sel = null;
      if (S.isleSel && !(st.phase === 'trade' && st.isleOffer)) S.isleSel = null;
      const shards = captureShatter(st);
      try { render(st); } catch (ex) { window.__islErr = String(ex && ex.stack || ex); }
      try { renderCatDock(); } catch (e2) { console.error('catDock', e2); }
      playShatter(shards);
      paintDiff(st);
    });
    /* v225：商人做生意 —— 金币抛起来，全桌可见 */
  function coinFx(name, cost) {
    let layer = el('coinLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'coinLayer';
      document.body.appendChild(layer);
    }
    const box = document.createElement('div');
    box.className = 'coin-fly';
    box.innerHTML = '<div class="coin">￥</div><div class="ctxt">' + esc(name || '亨德勒') +
      ' 做生意 · 饱食 -' + (cost || 1) + ' · 换两张牌</div>';
    layer.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1300);
  }
  S.sock.on('island:sfx', (d) => {
    if (!d) return;
    if (d.t === 'search') startReveal(d.items);
    else if (d.t === 'fight') {
      const ms = (d.mons && d.mons.length) ? d.mons : [''];
      ms.forEach((k, i) => setTimeout(() => { try { SFX.monCall(k); } catch (e) {} }, i * 680));
    }
    else if (d.t === 'npc' && d.key) SFX.human(d.key);
    else if (d.t === 'prey' && d.key) { try { SFX.prey(d.key); } catch (e4) {} }
    else if (d.t === 'flee' && d.key) { try { SFX.prey(d.key, 0.9); } catch (e5) {} }
    else if (d.t === 'coin') { try { SFX.coin(); } catch (e3) {} coinFx(d.name, d.cost); }
  });
  S.sock.on('island:nightw', (w) => {
    S.askingNight = false;
    if (!w) return;
    if (w.key === 'rain' && w.umb) {
      showModal('<h3>外面在下雨</h3><p>雨夜出门会淋透，带雨伞能多带回 1 张。</p>' +
        '<div class="modal-row">' +
        '<button class="primary" data-act="nightOutDirect">直接出行</button>' +
        '<button data-act="nightOutUmb">带雨伞出行</button>' +
        '</div>');
      return;
    }
    op({ type: 'night', mode: 'out' });
  });

  S.sock.on('island:drag', (d) => {
      if (!d || d.by === (S.sock && S.sock.id)) return;
      let g = document.querySelector('.remote-ghost[data-by="' + d.by + '"]');
      if (!g) {
        g = document.createElement('div');
        g.className = 'remote-ghost drag-ghost';
        g.dataset.by = d.by;
        document.body.appendChild(g);
      }
      g.innerHTML = '<div class="cname">' + esc(d.name2 || '') + '</div><div class="who">' + esc(d.name || '') + '</div>';
      g.style.transform = 'translate(' + (d.x * window.innerWidth - 34) + 'px,' + (d.y * window.innerHeight - 46) + 'px)';
      g.dataset.t = String(Date.now());
      clearTimeout(g._tm);
      g._tm = setTimeout(() => { if (g.parentNode) g.parentNode.removeChild(g); }, 420);
    });
    S.sock.on('island:err', (msg) => toast(msg));
    S.sock.on('island:reset', () => {
      closeModal();
      showModal('<h3>房间已重置</h3><p>房主关闭了这局。回大厅可以重新开一局。</p>' +
        '<div class="modal-row"><button class="primary" onclick="location.href=\'index.html\'">回大厅</button></div>');
    });
    /* v153：房主重新开局时，其他人被请出房间 */
    S.sock.on('island:kicked', (d) => {
      S.endShown = true;
      document.body.classList.remove('night');
      closeModal();
      showModal('<h3>房间已重置</h3><p>' + esc((d && d.msg) || '房主重新开局了，这一局已经结束。') +
        '</p><div class="modal-row"><button class="primary" onclick="location.href=\'index.html\'">回大厅</button></div>');
    });
    S.sock.on('disconnect', (why) => { if (why !== 'io client disconnect') toast('连接断开，正在重连…'); });
    window.__sfxdbg = { play: playSearchSfx, SFX, mon: () => SFX };
  window.__isl = S.sock;
    window.__islS = S;
    window.__SFX = SFX;

  /* 双击岛名（房主）进入背景编辑；方向键调，回车退出 */
  (function bindBgEdit() {
    const nameEl = document.getElementById('islandName');
    if (!nameEl) return;
    nameEl.addEventListener('dblclick', function () {
      if (!S.isHost) return;
      setBgEdit(!S.bgEdit);
    });
    document.addEventListener('keydown', function (ev) {
      if (!S.bgEdit) return;
      if (ev.key === 'Enter' || ev.key === 'Escape') {
        ev.preventDefault();
        setBgEdit(false);
        return;
      }
      const step = ev.shiftKey ? 5 : 1;
      const dstep = ev.shiftKey ? 0.12 : 0.04;
      const k = String(ev.key || '').toLowerCase();
      if (k === 'w' || k === 's') {
        ev.preventDefault();
        if (!S.bgPos) S.bgPos = { x: 50, y: 50, dim: 0 };
        const cur = Number(S.bgPos.dim || 0);
        S.bgPos.dim = Math.round(Math.max(-0.35, Math.min(0.42, cur + (k === 's' ? dstep : -dstep))) * 100) / 100;
        applyBgPosStyle();
        refreshBgHud();
        pushBgPos();
        return;
      }
      let dx = 0, dy = 0;
      if (ev.key === 'ArrowLeft') dx = -step;
      else if (ev.key === 'ArrowRight') dx = step;
      else if (ev.key === 'ArrowUp') dy = -step;
      else if (ev.key === 'ArrowDown') dy = step;
      else return;
      ev.preventDefault();
      if (!S.bgPos) S.bgPos = { x: 50, y: 50, dim: 0 };
      S.bgPos.x = Math.max(0, Math.min(100, S.bgPos.x + dx));
      S.bgPos.y = Math.max(0, Math.min(100, S.bgPos.y + dy));
      applyBgPosStyle();
      refreshBgHud();
      pushBgPos();
    });
  })();
  }

  function op(obj) {
    if (!S.sock) return;
    S.sock.emit('island:op', Object.assign({ code: S.code }, obj));
  }

  const WNAME = { clear: '晴朗', rain: '下雨', fog: '雾天', storm: '雷雨', hot: '炎日' };

  /* 天气图案：晴=大太阳，雨=云+雨滴，雾=朦胧，雷雨=闪电，炎日=烈日+裂地 */
  const WICON = {
    clear: '<svg viewBox="0 0 64 64" width="46" height="46"><circle cx="32" cy="32" r="13" fill="#ffd45e"/>' +
      '<g stroke="#ffd45e" stroke-width="3.4" stroke-linecap="round">' +
      '<path d="M32 6v7M32 51v7M6 32h7M51 32h7M13 13l5 5M46 46l5 5M51 13l-5 5M18 46l-5 5"/></g></svg>',
    rain: '<svg viewBox="0 0 64 64" width="46" height="46"><path d="M18 38a10 10 0 0 1 1-19 13 13 0 0 1 25 3 9 9 0 0 1 1 16z" fill="#9fc4d8"/>' +
      '<g stroke="#6fb7ff" stroke-width="3.2" stroke-linecap="round"><path d="M22 44l-3 8M32 44l-3 8M42 44l-3 8"/></g></svg>',
    fog: '<svg viewBox="0 0 64 64" width="46" height="46"><g stroke="#b9c9c2" stroke-width="3.6" stroke-linecap="round" opacity=".95">' +
      '<path d="M12 22h40M8 32h44M14 42h36M10 52h40"/></g></svg>',
    storm: '<svg viewBox="0 0 64 64" width="46" height="46"><path d="M18 36a10 10 0 0 1 1-19 13 13 0 0 1 25 3 9 9 0 0 1 1 16z" fill="#7f93a6"/>' +
      '<path d="M32 34l-9 15h7l-3 11 13-17h-8l4-9z" fill="#ffe066" stroke="#ffd93b" stroke-width="1.4"/></svg>',
    hot: '<svg viewBox="0 0 64 64" width="46" height="46"><circle cx="32" cy="24" r="11" fill="#ff9b3d"/>' +
      '<g stroke="#ff9b3d" stroke-width="3" stroke-linecap="round"><path d="M32 2v6M32 40v5M8 24h6M50 24h6M15 7l4 4M45 37l4 4M49 7l-4 4M19 37l-4 4"/></g>' +
      '<path d="M4 56h56" stroke="#c47a3a" stroke-width="2.6"/><g stroke="#8a4b1f" stroke-width="2.2" fill="none" stroke-linecap="round">' +
      '<path d="M12 56l6-8 5 5 6-9 5 7"/><path d="M38 56l5-6 4 4 6-8 5 6"/></g></svg>'
  };

  /* ---------------- 通用渲染 ---------------- */
  function cardHTML(c, cls) {
    if (!c) return '';
    const dur = c.maxDur ? Math.round((1 - c.dur / c.maxDur) * 100) : 0;
    const meta = [];
    if (c.kind === 'food') {
      meta.push('饱食 +' + c.cal);
      if (c.fresh != null && c.fresh < 100) meta.push('新鲜 ' + c.fresh + '%');
    }
    if (c.kind === 'blueprint') {
      const rec = c.rec || {};
      const mats = rec.mats || {};
      const del = c.deliv || {};
      const chips = Object.keys(mats).map((k) => {
        const ok = (del[k] || 0) >= mats[k];
        const left = Math.max(0, mats[k] - (del[k] || 0));
        return '<i class="bpchip mchip' + (ok ? ' ok' : '') + '" title="' + (MAT_NAME[k] || k) + ' ×' + mats[k] + '">' +
          '<i class="mico" data-k="' + k + '">' + (MAT_ICON[k] || '·') + '</i>' +
          '<b class="mleft">' + left + '</b></i>';
      }).join('');
      return '<div class="card blueprint bp' + (cls ? ' ' + cls : '') + (S.sel === c.id ? ' sel' : '') + (S.reveal && S.reveal.has(c.id) ? ' unrevealed' : '') + '" data-card="' + esc(c.id) + '">' +
        '<i class="bp-tag side">图纸</i>' +
        '<i class="bp-ico">' + (ICONS[c.bp] || '📐') + '</i>' +
        '<div class="cname">' + esc(c.name) + '</div>' +
        '<div class="cmeta">' + chips + '</div>' +
        '</div>';
    }
    if (c.kind === 'monster') meta.push('野怪');
    if (c.kind === 'human') meta.push('人物');
    if (c.kind === 'item' && c.bp) meta.push('道具');
    if (c.kind === 'equip') meta.push('装备');
    const saltTip = (c.key === 'salt') ? ' title="将它拖至盛宴区，为盛宴附加好效果，听说能包治百病。"' : '';
    /* v234：浆果 / 烤浆果 的悬停说明 */
    let tipAttr = saltTip;
    if (!tipAttr && c.tip) tipAttr = ' title="' + esc(c.tip) + '"';
    else if (!tipAttr && c.instant) tipAttr = ' title="拿起就能吃：拖到就餐框里"';
    return '<div class="card ' + c.kind + (cls ? ' ' + cls : '') + (S.sel === c.id ? ' sel' : '') + (S.reveal && S.reveal.has(c.id) ? ' unrevealed' : '') + '" data-card="' + esc(c.id) + '"' + tipAttr + '>' +
      (dur > 0 ? '<i class="durtop" style="height:' + dur + '%"></i>' : '') +
      ((ICONS[c.key] || (c.kind === 'food' ? ICONS.meat : '')) && (ICONS[c.key] || c.kind === 'food')
        ? '<div class="cart">' + (ICONS[c.key] || ICONS.meat) + '</div>' : '') +
      '<div class="cname">' + esc(c.name) + '</div>' +
      '<div class="cmeta">' + esc(meta.join(' · ')) + '</div>' +
      '</div>';
  }

  function bpMatsText(rec) {
    if (!rec || !rec.mats) return '';
    return Object.keys(rec.mats).map((k) => MAT_NAME[k] + '×' + rec.mats[k]).join(' ');
  }

  const MAT_NAME = { stone: '石头', grass: '草', wood: '木头', iron: '铁', charcoal: '木炭', molten: '铁水' };
  const MON_IMG = { hound: 'mons/dog_1.png', cat: 'mons/cat_1.png', snake: 'mons/snake_1.png',
    bear: 'mons/bear_1.png', rat: 'mons/rat_1.png', ox: 'mons/ox_1.png',
    rabbit: 'mons/rabbit_1.png', sheep: 'mons/sheep_1.png' };
  /* v194：三只长得不一样的老鼠 + 戴皇冠的鼠王，同一只怪每次渲染都是同一张脸 */
  const RAT_PICS = ['mons/rat_a.png', 'mons/rat_b.png', 'mons/rat_c.png'];
  function monPic(m) {
    if (!m) return '';
    if (m.key === 'ratking') return 'mons/ratking.png';
    if (m.key === 'rat') {
      let h = 7;
      for (const ch of String(m.id || 'rat')) h = (h * 31 + ch.charCodeAt(0)) % 9973;
      return RAT_PICS[h % RAT_PICS.length];
    }
    return MON_IMG[m.key] || '';
  }
  const MON_FACE = { hound: '🐕', cat: '🐈', snake: '🐍', bear: '🐻', ox: '🐂', rat: '🐀', ratking: '🐀', rabbit: '🐇', sheep: '🐑' };
  const MAT_SVG = {
    wood: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="5" rx="2.5" fill="#a4713a"/><rect x="3" y="12" width="18" height="5" rx="2.5" fill="#8a5b2b"/><ellipse cx="6" cy="9.5" rx="3" ry="2.5" fill="#d9a86a"/><ellipse cx="6" cy="9.5" rx="1.3" ry="1.1" fill="#8a5b2b"/><path d="M11 9.5h8" stroke="#6d451f" stroke-width="1"/><path d="M11 14.5h8" stroke="#6d451f" stroke-width="1"/></svg>',
    stone: '<svg viewBox="0 0 24 24"><path d="M5 15l3-8 8-1 4 6-4 7H8z" fill="#9aa0a6"/><path d="M8 7l8-1 4 6-3 1z" fill="#b9bfc4"/><path d="M5 15l3 4h9l-2-5z" fill="#7c8287"/></svg>',
    grass: '<svg viewBox="0 0 24 24"><path d="M12 20c0-6 1-10 5-13" stroke="#5cbf5c" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12 20c0-5-2-9-6-11" stroke="#4aa84a" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12 20V9" stroke="#6fd46f" stroke-width="2" stroke-linecap="round"/></svg>',
    iron: '<svg viewBox="0 0 24 24"><path d="M4 14l3-5h9l4 5-3 4H8z" fill="#c9cfd6"/><path d="M7 9h9l4 5H4z" fill="#e6ebf0"/><path d="M8 18h8l-1 2H9z" fill="#9aa2ab"/></svg>',
    charcoal: '<svg viewBox="0 0 24 24"><path d="M6 18l2-9 5-3 5 4-1 8z" fill="#3c3c3c"/><path d="M8 9l5-3 5 4-5 2z" fill="#5a5a5a"/><circle cx="11" cy="14" r="1.4" fill="#ff8d3a"/></svg>'
  };
  const PIC = (f) => '<img class="pic" src="icons/' + f + '.png" alt="">';
  const MAT_ICON = {
    stone: PIC('stone'), grass: PIC('grass'), wood: PIC('wood'),
    molten: PIC('molten'),
    iron: PIC('iron'), charcoal: MAT_SVG.charcoal
  };
  /* 卡牌/图纸/道具小图标（火炉格、图纸卡正中都用它） */
  const ICONS = Object.assign({}, MAT_ICON, {
    telescope: PIC('scope'), mat: PIC('mat'), torch: PIC('torch'), spear: PIC('spear'), shield: PIC('shield'),
    boat: PIC('boat'), bonfire: PIC('campfire'), shelter: PIC('shelter'), furnace: PIC('furnace'), chest: PIC('chest'),
    pot: PIC('pot'), umbrella: PIC('umbrella'), ironblock: PIC('iron'),
    junk: PIC('scrap'), molten: PIC('molten'), meat: PIC('meat'), fish: PIC('fish'), carrot: PIC('carrot'),
    berry: PIC('berry'), roasted: PIC('roasted'),
    herb: '🌱', rat: '🐀', harpoon: PIC('harpoon'), axe: PIC('axe'), warhammer: PIC('warhammer'),
    heal: PIC('heal'), clean: PIC('clean'), ox: PIC('ox'), medkit: PIC('medkit'),
    bearpaw: PIC('bearpaw'), holyshield: PIC('holyshield'), salt: PIC('salt'), treehole: PIC('treehole'),
  });

  function pips(n, max, cls) {
    /* 血=爱心 + 几杠几；饱食=圆点 + 几杠几（和怪物面板一致） */
    const kind = String(cls).indexOf('hp') === 0 ? 'hp' : 'sat';
    const nm = kind === 'hp' ? '❤' : '●';
    return '<i class="pip ' + kind + '"></i><span class="pv ' + kind + '">' + nm + ' ' + (n | 0) + '/' + (max | 0) + '</span>';
  }

  /* v126：自己面板的爱心条——心数=上限、亮=当前值；数值变化只切亮灭，不重建 DOM（防闪烁） */
  const HRT_ON = '\u2665\uFE0E', HRT_OFF = '\u2661\uFE0E';
  /* v127：血量=爱心（♥/♡），饱食=黄色圆点（●/○）；总数=上限，亮=当前值 */
  const DOT_ON = '\u25CF', DOT_OFF = '\u25CB';
  function pipGlyph(kind, on) {
    if (kind === 'sat') return on ? DOT_ON : DOT_OFF;
    return on ? HRT_ON : HRT_OFF;
  }
  function heartHTML(cur, total, kind) {
    let h = '';
    for (let i = 0; i < total; i++) {
      const on = i < cur;
      h += '<i class="hrt ' + kind + (on ? ' on' : ' off') + '">' + pipGlyph(kind, on) + '</i>';
    }
    return h;
  }
  function syncHearts(box, n, max, kind) {
    if (!box) return;
    const total = Math.max(0, Math.min(24, Math.floor(Number(max) || 0)));
    const cur = Math.max(0, Math.min(total, Math.floor(Number(n) || 0)));
    if (box.getAttribute('data-kind') !== kind || Number(box.getAttribute('data-max')) !== total) {
      box.setAttribute('data-kind', kind);
      box.setAttribute('data-max', String(total));
      box.innerHTML = heartHTML(cur, total, kind);
    } else {
      const kids = box.children;
      for (let i = 0; i < kids.length; i++) {
        const on = i < cur, k = kids[i];
        if (k.classList.contains('on') === on) continue;
        k.classList.toggle('on', on);
        k.classList.toggle('off', !on);
        k.textContent = pipGlyph(kind, on);
      }
    }
    box.setAttribute('data-cur', String(cur));
    const lbl = (kind === 'hp' ? '血量 ' : '饱食 ') + cur + '/' + total;
    box.setAttribute('title', lbl);
    box.setAttribute('aria-label', lbl);
  }


  /* v136：成品「垃圾」——不占手牌上限，每人最多 2 张，固定排在手里最后 */
  function isJunk(c) { return !!c && c.kind === 'item' && c.key === 'junk'; }

  function itemHTML(e) {
    const hasDur = Number(e.maxDur) > 0;
    const ic = ICONS[e.key] || '';
    const nm = ic ? '<span class="itm-nm">' + esc(e.name) + '</span>' : esc(e.name);
    return '<div class="itm" title="' + esc(e.name) + '">' +
      (ic ? '<i class="itm-ic">' + ic + '</i>' : '') + nm +
      (hasDur ? '<div class="durbar"><i style="width:' + Math.round((e.dur / e.maxDur) * 100) + '%"></i></div>' +
        '<div style="opacity:.6;font-size:9px">' + e.dur + '/' + e.maxDur + '</div>' : '') +
      '</div>';
  }

  /* 负面 buff：方形图标 + 像王者荣耀那样的剩余环形阴影 */
  function buffChips(p) {
    const list = (p && p.buffs) || [];
    if (!list.length) return '';
    return list.map((b) => {
      const perm = !!b.perm || !(b.days > 0);
      const frac = perm ? 1 : Math.max(0, Math.min(1, (b.days || 1) / Math.max(1, b.max || b.days || 1)));
      const title = b.tip ? b.tip : (b.name + ' · ' + (b.eff || '') + (b.good ? (perm ? '' : '（增益）') : ' · 还剩 ' + b.days + ' 天'));
      const icon = b.key === 'hunger'
        ? '<span class="btxt hleg">🍗</span>'
        : (b.img
          ? '<img src="icons/' + esc(b.img) + '.png" alt="' + esc(b.name) + '" onerror="this.remove()">'
          : '<span class="btxt">' + esc(String(b.name || '?').slice(0, 1)) + '</span>');
      return '<i class="buffchip' + (b.good ? ' good' : '') + '" style="--frac:' + frac.toFixed(3) + '" title="' + esc(title) + '">' +
        icon + '<b class="bw"></b></i>';
    }).join('');
  }

  function tagsOf(p) {
    const t = [];
    if (!p.alive) t.push('<span class="tag wound">已阵亡</span>');
    /* v234：跟着萨图离开营地 */
    if (p.alive && p.away) t.push('<span class="tag wound">已离开</span>');
    return t.join('') + buffChips(p);
  }


  const NPC_FACE = { priest: 'npc/npc_priest.png', warrior: 'npc/npc_warrior.png', child: 'npc/npc_girl.png' };

  function npcStrip(n) {
    const hp = Math.max(0, n.hp | 0), maxHp = n.maxHp || 5;
    const sat = Math.max(0, n.sat == null ? 5 : n.sat), maxSat = n.maxSat || 5;
    let wantTxt = '';
    if (!n.alive) {
      wantTxt = '已阵亡，没有操作了';
    } else if (n.want) {
      const need = Math.max(1, n.want.count || 1);
      const done = Math.min(need, n.want.done || 0);
      const by = (n.want.by || []).map((x) => '<em class="pby">' + esc(x.name) + '</em>').join('');
      const left = Math.max(0, need - done);
      const ico = (typeof ICONS !== 'undefined' && ICONS[n.want.key])
        || (typeof MAT_ICON !== 'undefined' && MAT_ICON[n.want.key])
        || (typeof PIC === 'function' ? PIC(n.want.kind === 'food' ? 'carrot' : (n.want.kind === 'blueprint' ? 'scope' : 'junk')) : '🎁');
      const buildNow = !!(S.st && (S.st.phase === 'build' || S.st.phase === 'nightbuild'));
      wantTxt = '想要：<i class="wico' + (buildNow ? ' wico-big' : '') + '">' + ico + '</i>' +
        '<span class="wname">' + esc(n.want.name) + '</span>' +
        '<b class="wbadge">' + left + '</b>' + (by ? ' ' + by : '');
    }
    let hearts = '';
    for (let i = 0; i < maxHp; i++) hearts += '<i class="hp-heart' + (i < hp ? ' on' : '') + '">\u2665</i>';
    return '<div class="npc-face">' + (NPC_FACE[n.key] ? '<img src="' + NPC_FACE[n.key] + '" alt="">' : '') + '</div>' +
      '<div class="npc-info">' +
        '<div class="npc-top"><b>' + esc(n.name) + '</b>' + (n.alive ? '<small>同伴</small>' : '<span class="dead-tag">已阵亡</span>') + '</div>' +
        '<div class="npc-line"><span>血量</span>' + hearts + '</div>' +
        '<div class="npc-line"><span>饱食度</span><i class="bar sat">' + dots(sat, maxSat, 'satd') + '</i></div>' +
      '</div>' +
      '<div class="ss-hand"' + (n.want ? ' data-want="1"' + ((S.st && (S.st.phase === 'build' || S.st.phase === 'nightbuild')) ? ' data-want-box="1"' : '') : '') + '>' + wantTxt + '</div>';
  }

  function heartsOf(hp, max) {
    let out = '';
    for (let i = 0; i < max; i++) out += '<i class="hp-heart' + (i < hp ? ' on' : '') + '">\u2665</i>';
    return out;
  }

  function dots(n, max, cls) {
    let out = '';
    for (let i = 0; i < max; i++) out += '<b class="' + cls + (i < n ? ' on' : '') + '"></b>';
    return out;
  }

  /* v135：玩家颜色（服务端开局定好的 p.color），标注这个人时统一用它 */
  const PC_HEX = { red: '#e05252', orange: '#ef8a3a', yellow: '#e7c84a', green: '#57c07a', blue: '#4b9fe0', purple: '#a877e0', white: '#f2f2f2', black: '#3a3a3a' };
  function pcOf(p) { return (p && PC_HEX[p.color]) || ''; }
  function pcById(st, id) {
    const p = ((st && st.players) || []).find((x) => x && x.id === id);
    return pcOf(p);
  }
  function pcName(p, txt) {
    const c = pcOf(p);
    return '<span class="ss-nm"' + (c ? ' style="color:' + c + '"' : '') + '>' + txt + '</span>';
  }

  function seatHTML(p, side) {
    if (!p) return '<div class="srow" style="opacity:.5">等待玩家加入…</div>';
    /* 别人视角：造出来的东西一律盖上（只显示盖牌背），自己的才看得到名字 */
    let items = '';
    const eq = p.equip || [];
    if (p.isMe) {
      items = eq.map((e) => itemHTML(e)).join('');
    } else {
      items = eq.slice(0, 6).map(() => '<i class="backcard"></i>').join('');
      if (eq.length > 6) items += '<i class="backcard more">+' + (eq.length - 6) + '</i>';
      if (eq.length > 8) items = eq.slice(0, 7).map(() => '<i class="backcard"></i>').join('') + '<i class="backcard more">+' + (eq.length - 7) + '</i>';
    }
    if (!p.alive) {
      const face2 = p.charId ? '<img class="ss-face" src="ui/chars/' + p.charId + '.png" alt="">' : '';
      const tag2 = p.escaped ? '<span class="esc-tag">已撤离</span>' : '<span class="dead-tag">已阵亡</span>';
      return '<div class="ss-name">' + face2 + pcName(p, esc(p.name)) + tag2 + '</div>' +
        '<div class="ss-bars"><div class="bar-line">' + pips(0, p.maxHp, 'hp') + '</div></div>' +
        '<div class="ss-hand" style="opacity:.6">' + (p.escaped ? '已经坐船离开了' : '已经没有操作了') + '</div>' +
        '<div class="ss-items"></div>';
    }
    const face = p.charId ? '<img class="ss-face" src="ui/chars/' + p.charId + '.png" alt="">' : '';
    /* v234：跟着萨图走了 —— 只留一句「已离开营地」 */
    if (p.away) {
      return '<div class="ss-name">' + face + pcName(p, esc(p.name)) + '<span class="dead-tag">已离开营地</span></div>' +
        '<div class="ss-bars"><div class="bar-line">' + pips(p.hp, p.maxHp, 'hp') + '</div></div>' +
        '<div class="ss-hand" style="opacity:.6">跟着野人萨图去营地帮忙了' + (p.awayBack ? '（第 ' + p.awayBack + ' 天回来）' : '') + '</div>' +
        '<div class="ss-items"></div>';
    }
    return '<div class="ss-name">' + face + pcName(p, esc(p.name))
      + (p.charTitle ? '<em class="ss-ttl">' + esc(p.charTitle) + '</em>' : '')
      + '<i class="dot ' + (p.alive ? 'on' : '') + '"></i></div>' +
      '<div class="ss-bars">' +
        '<div class="bar-line">' + pips(p.hp, p.maxHp, 'hp') + '</div>' +
        '<div class="bar-line"><span class="bl">饱</span>' + pips(p.sat, p.maxSat, 'sat') + '</div>' +
      '</div>' +
      '<div class="ss-hand">手牌 <b>' + p.handCount + '</b></div>' +
      (tagsOf(p) ? '<div class="ss-tags">' + tagsOf(p) + '</div>' : '') +
      '<div class="ss-items">' + (items || '') + '</div>';
  }

  /* 受击抖动：对比上一次渲染的血量 */
  const LAST_HP = {};
  /* v137：选角色阶段换角色会让血量数字变化，那不是受伤——只有开局后才允许播受击特效 */
  function fxArmed(st) { return !!(st && st.started && !st.picking); }
  function hitShake(st) {
    (st.players || []).forEach((p, i) => {
      const prev = LAST_HP[p.id];
      LAST_HP[p.id] = p.hp;
      if (prev == null || p.hp >= prev) return;
      if (!fxArmed(st)) return; /* 选角色阶段：换角色不算受伤，不出刀光/裂痕 */
      /* v162：任何人掉血的瞬间来一声脆雷击；同一帧多人掉血只响一次
         v171：这一次掉血如果是饿的（服务端带 hungerAt），换成肚子打鸣，不打雷
         v181：受伤音效分两种 —— 饿的 = 肚子打鸣（growl）；被动物伤的 = 宝剑刺入（pierce，已在战斗特效里播），
               其余来源才用脆雷击；并且整体音量降 30%（0.45 → 0.315）。 */
      const hungry = st.hungerAt && (Date.now() - st.hungerAt) < 2500;
      const stabbed = S.lastPierceAt && (Date.now() - S.lastPierceAt) < 600;
      if (hungry) {
        try { SFXW.play('growl', 0.55, 900); } catch (err) {}
      } else if (!stabbed) {
        try { SFXW.play('crack', 0.315, 900); } catch (err) {}
      }
      const node = el('seat' + i);
      if (!node) return;
      node.classList.remove('hit');
      void node.offsetWidth;
      node.classList.add('hit');
      /* 真正掉血才播斜切刀光 + 裂开 */
      hitSlashAt(node);
      const bb = node.getBoundingClientRect();
      crackAt(bb.left + bb.width / 2, bb.top + bb.height / 2, Math.max(60, Math.min(bb.width, bb.height) * 0.9));
      setTimeout(() => node.classList.remove('hit'), 620);
    });
  }

  /* v168：盛宴区宽度只占「中心区左边 → 怪物区右边界」这一段，不再顶到火炉那一列 */
  function fitFeastsWidth() {
    const fb = el('feasts'), mz = el('monsterZone');
    if (!fb || !mz) return;
    const fr = fb.getBoundingClientRect(), mr = mz.getBoundingClientRect();
    if (!fr.width && !mr.width) return;
    const w = Math.max(120, Math.round(mr.right - fr.left));
    if (w > 0 && Math.abs(fb.offsetWidth - w) > 1) fb.style.width = w + 'px';
  }
  window.addEventListener('resize', function () { fitFeastsWidth(); });

  /* 箱子块（v168）：常驻在右列火炉下面，不再浮在页面中间。
     未建造 → 虚线占位「箱子未建造」；已建造 → 图标+「箱子」+ 4 格（点击标题可收拢/展开）。 */
  function paintChestDock() {
    const dock = el('chestDock');
    if (!dock) return;
    const st = S.st;
    const chest = st && st.common && st.common.chest;
    const built = !!(chest && chest.built);
    const open = S.chestOpen !== false;   /* 默认展开 */
    dock.hidden = false;
    dock.classList.toggle('collapsed', !open);
    /* SICO.chest 本身就是一段 <img class="pic" …> 的 HTML，这里只挂 class，不能再塞进 src */
    const ico = '<span class="cd-ico">' + (SICO.chest || '&#129520;') + '</span>';
    let body = '';
    if (!built) {
      body = '<div class="cd-empty">箱子未建造</div>';
    } else if (open) {
      const info = (chest && chest.cells) || [];
      const cells = [];
      for (let i = 0; i < 4; i++) {
        const ci = info[i] || { i: i, mine: true, name: '', color: '' };
        /* v158：格子位置写死，只显示这格真正的内容；别人的格子只显示「看不到」 */
        const two = ci.hidden ? [] : (ci.items || []);
        cells.push('<div class="cd-cell' + (ci.mine ? ' mine' : ' other') +
          (ci.alive === false ? ' dead' : '') +
          (ci.color ? ' c-' + ci.color : '') + '" data-cslot="' + i + '" title="' + esc(ci.name || '') + '">' +
          '<span class="cd-name">' + esc(ci.name || '') + '</span>' +
          (ci.hidden ? '<span class="cd-lock">看不到</span>' : '') +
          two.map((c, k) => '<div class="cd-card' + (k ? ' stacked' : '') + '">' + cardHTML(c, 'mini') + '</div>').join('') +
          (two.length > 1 ? '<i class="stack">×' + two.length + '</i>' : '') +
          '</div>');
      }
      body = '<div class="cd-grid">' + cells.join('') + '</div>';
    }
    dock.innerHTML = '<div class="cd-head" data-act="chestToggle">' + ico + '<b>箱子</b>' +
      (built ? '<small>4 格</small>' : '') +
      (built ? '<button class="cd-toggle" data-act="chestToggle">' + (open ? '收拢' : '展开') + '</button>' : '') +
      '</div>' + body;
  }


  /* ---------------- v194：树洞与小猫咪 ---------------- */
  function catDockEl() {
    let d = document.getElementById('catDock');
    if (!d) {
      d = document.createElement('div');
      d.id = 'catDock';
      d.className = 'cat-dock';
      d.hidden = true;
      /* v197：树洞挂在箱子框的正下方（与箱子同一个容器，排在最后 = 最靠底） */
      const host = document.getElementById('chestDock');
      (host && host.parentElement ? host.parentElement : (host || document.body)).appendChild(d);
    }
    return d;
  }
  function renderCatDock() {
    const d = catDockEl();
    const st = S.st;
    if (!st || !st.treehole) { d.hidden = true; return; }
    d.hidden = false;
    const cat = st.cat;
    const me = st.me || {};
    const canCook = st.phase === 'cook';
    const canGift = (st.phase === 'cook' || st.phase === 'trade') && cat;
    const hand = (me.hand || []).filter(Boolean);
    const foods = hand.filter((c) => c.kind === 'food');
    const head = '<div class="cat-head"><span class="cat-ico">' + PIC('treehole') + '</span><b>树洞</b>' +
      (cat ? '<small>小猫咪跟着 ' + esc(cat.followName || '人') + '</small>' : '<small>还没有猫</small>') +
      '</div>';
    let body = '';
    if (!cat) {
      body += '<div class="cat-tip">把食物放在树洞门口，也许会有小猫咪来。</div>';
    } else {
      body += '<div class="cat-tip">战斗时会扑上去挠一下（伤害 +1）。' + (cat.gift ? '它叼着「' + esc(cat.gift.name) + '」。' : '') + '</div>';
    }
    if (canCook && foods.length) {
      body += '<div class="cat-lab">投喂（胡萝卜 10% · 鱼 30% · 大肉 30%）</div><div class="cat-row">' +
        foods.map((c) => '<button class="cat-card" data-catfeed="' + c.id + '">' + cardHTML(c, 'mini') + '</button>').join('') +
        '</div>';
    }
    if (canGift && hand.length && !(cat && cat.gift)) {
      body += '<div class="cat-lab">交给它一件东西（明天清晨它会叼给别人）</div><div class="cat-row">' +
        hand.slice(0, 10).map((c) => '<button class="cat-card" data-catgift="' + c.id + '">' + cardHTML(c, 'mini') + '</button>').join('') +
        '</div>';
    }
    if ((st.helpers || []).length) {
      body += '<div class="cat-lab">身边的善良生灵</div><div class="cat-row">' +
        st.helpers.map((h) => '<span class="cat-tip">' + esc(h.name) + ' ' + h.hp + '/' + h.maxHp + '</span>').join('') +
        '</div>';
    }
    d.innerHTML = head + body;
  }
  document.addEventListener('click', function (ev) {
    const f = ev.target.closest && ev.target.closest('[data-catfeed]');
    if (f) { ev.stopPropagation(); op({ type: 'catfeed', card: f.dataset.catfeed }); return; }
    const g = ev.target.closest && ev.target.closest('[data-catgift]');
    if (g) { ev.stopPropagation(); op({ type: 'catgift', card: g.dataset.catgift }); return; }
  }, true);

  /* ---------------- v19 中间区（锅 / 怪物 / 火炉） ---------------- */
  const SICO = {
    bonfire: PIC('campfire'),
    shelter: PIC('shelter'),
    boat: PIC('boat'),
    chest: PIC('chest'),
  };

  const POT_SVG = '<img class="pot-svg" src="icons/pot.png" alt="">';

  const FUR_SVG = '<img class="fur-svg" src="icons/furnace.png" alt="">';

  function slotIco(card) {
    if (!card) return '';
    if (card.pic && ICONS[card.pic]) return ICONS[card.pic];
    return ICONS[card.key] || (card.kind === 'blueprint' ? '📐' : '❔');
  }

  /* 一道菜固定一个样子：只按名字（其次 dish 键）决定，和它被放在哪里无关 */
  const DISH_IMG_BY_NAME = {
    '胡萝卜盛宴': 'carrot', '鱼盛宴': 'fish', '大肉盛宴': 'meat', '草盛宴': 'grass',
    '胡萝卜鱼佳肴': 'carrot_fish', '肉鱼佳肴': 'meat_fish', '胡萝卜肉佳肴': 'carrot_meat',
  };
  /* v216：粑粑的饱食是 -1，文案不能写「饱食 +-1」 */
  function calTxt(f) {
    const n = Number((f && f.cal) || 0);
    return n < 0 ? ('饱食 ' + n) : ('饱食 +' + n);
  }
  function dishImg(f) {
    if (typeof f !== 'object' || !f) return 'icons/dish1.png';
    if (f.poop || f.key === 'poop' || f.name === '粑粑') return 'icons/feast_poop.png';
    const nm = String(f.name || '');
    if (DISH_IMG_BY_NAME[nm]) return 'icons/feast_' + DISH_IMG_BY_NAME[nm] + '.png';
    if (typeof f.dish === 'string' && f.dish) return 'icons/feast_' + f.dish + '.png';
    if (typeof f.dish === 'number' && f.dish) return 'icons/dish' + f.dish + '.png';
    /* 名字里带食材的，按食材取图 */
    if (nm.indexOf('胡萝卜') >= 0) return 'icons/feast_carrot.png';
    if (nm.indexOf('肉') >= 0 || nm.indexOf('大肉') >= 0) return 'icons/feast_meat.png';
    if (nm.indexOf('鱼') >= 0) return 'icons/feast_fish.png';
    if (nm.indexOf('草') >= 0) return 'icons/feast_grass.png';
    return 'icons/dish1.png';
  }

  /* v162：右侧那个「选中食材」浮层整块去掉——单击只是选中，双击才直接进锅（见 dblclick 处理） */
  function paintCookSel(st) {
    const bar = el('cookSelBar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  function paintCenterZones(st) {
    const c = st.common || {};

    /* 左：锅（可多口）—— 我放进锅里的那一份食物 */
    const meP = (st.players || []).find((p) => p && p.isMe) || null;
    const myMeal = (meP && meP.meal && meP.meal[0]) || null;
    function icoSrc(c) {
      const key = c && (c.ico || c.key || c.icon || '');
      return 'icons/' + (key || 'meat') + '.png';
    }

    /* 左：锅（可多口） */
    const pz = el('potZone');
    if (pz) {
      const nPots = Math.max(1, Number(st.potCount || 1));
      pz.classList.toggle('two-pots', nPots > 1);
      const put = st.cook && st.cook.put ? Object.keys(st.cook.put).length : 0;
      const feastsN = (st.feasts || []).length;
      const fl = st.feasts || [];
      const slot = (f) => f
        ? '<i class="filled" data-feast="' + esc(f.id) + '" title="' + esc(f.name) + ' ' + calTxt(f) + '（拖一张手牌上来就能吃）"><img class="dish" src="' + dishImg(f) + '" alt=""></i>'
        : '<i></i>';
      /* 锅里放进去的食材：全员可见（每个人放的都显示出来） */
      const potFoods = [];
      if (Array.isArray(st.potFoods)) {
        st.potFoods.forEach((list) => (list || []).forEach((m) => { if (m) potFoods.push(m); }));
      } else {
        (st.players || []).forEach((p) => {
          if (!p || !p.alive) return;
          (p.meal || []).forEach((m) => { if (m) potFoods.push(Object.assign({ _who: p.name }, m)); });
        });
      }
      const out = [];
      const meId = (st.me && st.me.id) || '';
      const potSlot = (f, potIdx, slotIdx) => f
        ? '<span class="pot-slot has-item' + (f._owner && f._owner === meId ? ' mine' : '') + '" data-pot="' + potIdx + '" data-slot="' + slotIdx + '" data-pot-item="1" data-card-id="' + esc(f.id) + '"' +
          ' title="' + (f._owner && f._owner === meId ? '点一下或拖回自己的手牌，把「' + esc(f.name || '') + '」拿回来' : '这是 ' + esc(f._who || '别人') + ' 放的「' + esc(f.name || '') + '」') + '"' +
          '><img class="pic pot-food" src="' + icoSrc(f) + '" alt=""><em class="pfn">' + esc(f.name || '') + '</em>' + (f._who ? '<em class="pwho">' + esc(f._who) + '</em>' : '') + '</span>'
        : '<span class="pot-slot"><i></i></span>';
      for (let i = 0; i < nPots; i++) {
        const tops = [potFoods[i * 2], potFoods[i * 2 + 1]];
        const more = (i === nPots - 1 && potFoods.length > nPots * 2) ? '<b class="pot-more">+' + (potFoods.length - nPots * 2) + '</b>' : '';
        const cooking = st.cookStep === 'cooking';
        const pd = (st.potDishes && st.potDishes[i]) || fl.slice(i * 4, i * 4 + 4);
        out.push('<div class="pot-wrap' + (cooking ? ' cooking' : '') + '" data-pot="' + i + '">' +
          (cooking ? '<em class="pot-cook">锅在翻腾…</em>' : '') +
          '<div class="pot-in">' + potSlot(tops[0], i, 0) + potSlot(tops[1], i, 1) + more + '</div>' +
          POT_SVG +
          '</div>');
      }
      let eatRow = '';
      if (st.cookStep === 'serve') {
        const hue = (id) => { let h = 0; const t = String(id || ''); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return h; };
        const boxOf = (who, isPlayer) => {
          const items = who.eat || [];
          const head = isPlayer
            ? esc(String(who.name || '').slice(0, 3)) + (who.serveOk ? ' ✓' : '')
            : '';
          const face = (!isPlayer && NPC_FACE[who.key]) ? '<img class="eb-face" src="' + NPC_FACE[who.key] + '" alt="">' : '';
          return '<div class="eatbox' + (isPlayer && who.isMe ? ' mine' : '') + '" data-eat="' + esc(who.id) + '" data-kind="' + (isPlayer ? 'p' : 'n') + '" style="--ec:hsl(' + hue(who.id) + ' 62% 46%)">' +
            '<b class="eb-head">' + face + head + '</b>' +
            '<span class="eb-items">' +
            (items.length ? items.map((f) => {
              const nm = String(f.name || '');
              const cal = Number(f.cal || 0);
              const isDish = !f.raw || /盛宴|佳肴/.test(nm);
              const src = isDish ? dishImg(f) : ('icons/' + (f.key || 'meat') + '.png');
              const tip = (isPlayer ? (who.isMe ? '你' : who.name) : who.name) + ' 的框 · ' + nm + (cal ? '（+' + cal + '）' : '');
              return '<i class="eb-chip" title="' + esc(tip) + '" data-take="' + esc(f.id) + '">' + (src ? '<img src="' + src + '" alt="">' : '🍲') + '</i>';
            }).join('') : '<em class="eb-empty">可以放吃的</em>') +
            '</span></div>';
        };
        const aliveP = (st.players || []).filter((p) => p && p.alive);
        const aliveN = (st.npcs || []).filter((n) => n && n.alive);
        const chunk = (arr) => { const out = []; for (let i = 0; i < arr.length; i += 3) out.push(arr.slice(i, i + 3)); return out; };
        let rows = '';
        chunk(aliveP).forEach((g) => { rows += '<div class="eatrow">' + g.map((p) => boxOf(p, true)).join('') + '</div>'; });
        chunk(aliveN).forEach((g) => { rows += '<div class="eatrow nrow">' + g.map((n) => boxOf(n, false)).join('') + '</div>'; });
        eatRow = '<div class="eatwrap">' + rows +
          '<em class="eat-tip">把盛宴拖进任何人的框里</em></div>';
      }
      pz.innerHTML = (nPots > 1 ? '<div class="pots-row">' + out.join('') + '</div>' : out.join('')) + eatRow;
    }

    /* 右：火炉（熔炉，未建灰） */
    const fz = el('furnaceZone');
    if (fz) {
      const f = c.furnace || {};
      const top = f.topCard || null, outC = f.outCard || null;
      fz.innerHTML = '<div class="fur-wrap' + (f.built ? '' : ' off') + '">' +
        '<div class="fur-slot top"><i class="' + (top ? 'filled' : '') + '">' + slotIco(top) + '</i>' + (f.burning ? '<em class="fur-burn">🔥</em>' : '') + '</div>' +
        FUR_SVG +
        '<div class="fur-slot bottom"><i class="' + (outC ? 'filled' : '') + '">' + slotIco(outC) + '</i></div>' +
        '</div>' +
        (f.built ? '<div class="fur-acts">' +
          (outC ? '<button data-act="furnaceTake">取出</button>' : '') +
          '</div>' : '') +
        /* v168：箱子块常驻在火炉下面（每次重建火炉都要把占位挂回来） */
        '<div id="chestDock" class="chest-dock"></div>';
    }

    /* 图标条 */
    const pi = el('publicItems');
    if (pi) {
      const chips = [];
      const cspec = [
        { key: 'bonfire', name: '篝火' },
        { key: 'shelter', name: '草棚' },
        { key: 'chest', name: '箱子' },
        { key: 'telescope', name: '望远镜' },
      ];
      cspec.forEach((sp) => {
        const x = sp.key === 'telescope'
          ? { built: !!(st.telescope && st.telescope.built) }
          : (c[sp.key] || {});
        const ico = SICO[sp.key] || (sp.key === 'telescope' ? '🔭' : '');
        chips.push('<span class="pchip' + (x.built ? ' on' : '') + ' clickable" data-common="' + sp.key + '" title="' + sp.name + '"><i class="ico">' + ico + '</i>' + sp.name + '</span>');
      });
      /* v160：有几艘船就摆几个船按钮，点一下＝自己上船撤离 */
      (st.common && st.common.ships ? st.common.ships : (st.ships || [])).forEach((s, i) => {
        const taken = !!s.takenBy || !!(st.me && st.me.escaped);
        chips.push('<button class="pchip ship' + (taken ? ' off' : ' on') + ' clickable" data-act="boat" data-ship="' + i + '"' + (taken ? ' disabled' : '') +
          ' title="' + (taken ? '这条船已经开走了' : '乘船离开瓦格（' + esc(s.byName || '') + ' 造的）') + '"><i class="ico">⛵</i>' + (taken ? '已开走' : '船 ' + (i + 1)) + '</button>');
      });
      (st.npcs || []).forEach((n) => chips.push('<span class="pchip' + (n.alive ? ' on' : '') + '"><i class="ico">' + (n.key === 'priest' ? '🧓' : n.key === 'warrior' ? '🛡' : '🧒') + '</i>' + esc(n.name) + '</span>'));
      pi.innerHTML = chips.join('');
    }

    paintChestDock();
  }


  /* ---------------- v20 战斗特效 ---------------- */
  function floatText(x, y, txt, cls) {
    const d = document.createElement('div');
    d.className = 'fx-float' + (cls ? ' ' + cls : '');
    d.textContent = txt;
    d.style.left = Math.round(x) + 'px';
    d.style.top = Math.round(y) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  function shakeEl(elm, cls, ms) {
    if (!elm) return;
    elm.classList.remove(cls);
    void elm.offsetWidth;
    elm.classList.add(cls);
    setTimeout(() => elm.classList.remove(cls), ms || 520);
  }

  function redFlash() {
    const v = document.getElementById('redVig');
    if (!v) return;
    v.classList.remove('on');
    void v.offsetWidth;
    v.classList.add('on');
    setTimeout(() => v.classList.remove('on'), 620);
  }

  function slashAt(elm) {
    if (!elm) return;
    const b = elm.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'fx-slash';
    d.style.left = Math.round(b.left + b.width / 2) + 'px';
    d.style.top = Math.round(b.top + b.height / 2) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 700);
  }

  /* 受击斜切刀光：用 ui/slash.png 当蒙版，白光斜着划过，约 460ms，不吃点击 */
  function hitSlashAt(elm) {
    if (!elm) return;
    const b = elm.getBoundingClientRect();
    const size = Math.max(140, Math.min(340, Math.max(b.width, b.height) * 2.4));
    const d = document.createElement('div');
    d.className = 'fx-hit-slash';
    d.style.left = Math.round(b.left + b.width / 2 - size / 2) + 'px';
    d.style.top = Math.round(b.top + b.height / 2 - size / 2) + 'px';
    d.style.width = size + 'px';
    d.style.height = size + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 520);
  }

  /* 刀痕裂痕：一段锯齿裂纹 SVG，sr 是半径 */
  function crackAt(x, y, sr) {
    const d = document.createElement('div');
    d.className = 'fx-crack';
    d.style.left = Math.round(x) + 'px';
    d.style.top = Math.round(y) + 'px';
    const r = Math.max(70, Math.round(sr || 120));
    const spikes = [[-1.05, 0.82], [-0.55, 1], [0.1, 0.7], [0.6, 0.95], [1.1, 0.6], [-0.3, 0.55], [0.35, 0.5], [-1.25, 0.5]];
    let paths = '';
    spikes.forEach((s, i) => {
      const ang = s[0];
      const len = r * s[1];
      const steps = 4;
      let p = 'M0,0';
      for (let k = 1; k <= steps; k++) {
        const t = len * k / steps;
        const jitter = (k === steps ? 0 : (k % 2 ? 1 : -1) * r * 0.055);
        const px = Math.cos(ang) * t + Math.cos(ang + Math.PI / 2) * jitter;
        const py = Math.sin(ang) * t + Math.sin(ang + Math.PI / 2) * jitter;
        p += ' L' + px.toFixed(1) + ',' + py.toFixed(1);
      }
      paths += '<path d="' + p + '" style="animation-delay:' + (i * 22) + 'ms;opacity:' + (i > 4 ? 0.55 : 0.95) + '"></path>';
    });
    d.innerHTML = '<svg width="' + (r * 2.4) + '" height="' + (r * 2.4) + '" viewBox="' + (-r * 1.2) + ' ' + (-r * 1.2) + ' ' + (r * 2.4) + ' ' + (r * 2.4) + '">' + paths + '</svg>';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  /* 怪物扑击（参照《饥荒》猎狗的 attack 状态：
     atk_pre 蓄力 → atk 冲击（第 16 帧＝0.53s 命中，第 14 帧出咬合声）→ atk_pst 收招）
     时长：蓄力 0.32s / 冲 0.12s / 命中鞑 0.06s / 回位 0.62s，合计 1.12s */
  function monNodeOf(monId) {
    let n = monId ? document.querySelector('.mon[data-mon="' + monId + '"]') : null;
    if (!n) n = document.querySelector('.mon[data-mon]');
    return n;
  }

  function monsterLunge(monKey, targetNode, monId) {
    const monNode = monNodeOf(monId);
    if (!monNode || !targetNode) return;
    const srcImg = monNode.querySelector('img');
    const a = monNode.getBoundingClientRect();
    const b = targetNode.getBoundingClientRect();
    const ghost = document.createElement('img');
    ghost.className = 'fx-mon-lunge';
    if (srcImg && srcImg.src) ghost.src = srcImg.src;
    ghost.style.left = a.left + 'px';
    ghost.style.top = a.top + 'px';
    ghost.style.width = a.width + 'px';
    ghost.style.height = a.height + 'px';
    document.body.appendChild(ghost);
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    const D = 1120;
    const anim = ghost.animate([
      /* 蓄力：往后缩一下，让人看得出要扑了 */
      { transform: 'translate(' + (-dx * 0.10) + 'px,' + (-dy * 0.10) + 'px) scale(1.04,.93)', offset: 0 },
      { transform: 'translate(' + (-dx * 0.12) + 'px,' + (-dy * 0.12) + 'px) scale(1.06,.9)', offset: 0.29 },
      /* 冲击：0.12s 扑到目标身上 */
      { transform: 'translate(' + (dx * 0.94) + 'px,' + (dy * 0.94) + 'px) scale(.86)', offset: 0.39 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.78,.92)', offset: 0.44 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.8,.95)', offset: 0.48 },
      /* 收招：慢慢退回去 */
      { transform: 'translate(' + (dx * 0.42) + 'px,' + (dy * 0.42) + 'px) scale(.94)', offset: 0.72 },
      { transform: 'translate(0,0) scale(1)', offset: 1 },
    ], { duration: D, easing: 'linear', fill: 'forwards' });
    anim.onfinish = function () { ghost.remove(); };
  }

  /* 被扑的人自己看：先蹲下（50%）→ 0.26s 撞满屏幕（最上层）→ 满屏那一瞬红光+刀伤+轻震 → 0.55s 退回原大 */
  function monsterZoomHit(monKey, n, monId) {
    const monNode = monNodeOf(monId);
    const srcImg = monNode ? monNode.querySelector('img') : null;
    const a = monNode ? monNode.getBoundingClientRect() : { left: window.innerWidth / 2 - 40, top: window.innerHeight / 2 - 40, width: 80, height: 80 };
    const layer = document.createElement('div');
    layer.className = 'fx-mon-zoom';
    layer.style.left = a.left + 'px';
    layer.style.top = a.top + 'px';
    layer.style.width = a.width + 'px';
    layer.style.height = a.height + 'px';
    const img = document.createElement('img');
    if (srcImg && srcImg.src) img.src = srcImg.src;
    layer.appendChild(img);
    document.body.appendChild(layer);
    const cover = Math.max(window.innerWidth / Math.max(1, a.width), window.innerHeight / Math.max(1, a.height)) * 1.2;
    const D = 1050;
    const anim = layer.animate([
      { transform: 'scale(1)', offset: 0 },
      { transform: 'scale(.5)', offset: 0.13 },                 /* 蓄力：蹲下 */
      { transform: 'scale(' + cover.toFixed(3) + ')', offset: 0.40 },  /* 0.26s 涨满屏 */
      { transform: 'scale(' + (cover * 1.03).toFixed(3) + ')', offset: 0.46 },
      { transform: 'scale(' + cover.toFixed(3) + ')', offset: 0.50 },  /* 满屏停一下 */
      { transform: 'scale(1.15)', offset: 0.90 },               /* 慢慢退回去 */
      { transform: 'scale(1)', offset: 1 },
    ], { duration: D, easing: 'cubic-bezier(.3,.85,.35,1)', fill: 'forwards' });

    setTimeout(function () {
      try { redFlash(); } catch (e) {}
      const w = window.innerWidth, h = window.innerHeight;
      const sl = document.createElement('div');
      sl.className = 'fx-slash big';
      sl.style.left = '50%';
      sl.style.top = '46%';
      document.body.appendChild(sl);
      setTimeout(function () { sl.remove(); }, 900);
      crackAt(w * 0.52, h * 0.44, Math.min(w, h) * 0.4);
      setTimeout(function () { crackAt(w * 0.34, h * 0.62, Math.min(w, h) * 0.18); }, 90);
      document.body.classList.remove('monShake');
      void document.body.offsetWidth;
      document.body.classList.add('monShake');
      setTimeout(function () { document.body.classList.remove('monShake'); }, 420);
      if (Number(n) > 0) floatText(w * 0.5, h * 0.3, '-' + n, 'dmg big');
    }, 430);
    setTimeout(function () { layer.remove(); }, D + 40);
  }

  /* 自己挨打：整屏一刀劈下来 + 裂痕 + 红边 + 屏幕震 */
  function screenHit(n) {
    redFlash();
    const s = document.createElement('div');
    s.className = 'fx-slash big';
    s.style.left = '50%';
    s.style.top = '48%';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
    const w = window.innerWidth, h = window.innerHeight;
    crackAt(w * 0.5, h * 0.46, Math.min(w, h) * 0.34);
    setTimeout(() => crackAt(w * 0.36, h * 0.6, Math.min(w, h) * 0.16), 90);
    document.body.classList.remove('hitShake');
    void document.body.offsetWidth;
    document.body.classList.add('hitShake');
    setTimeout(() => document.body.classList.remove('hitShake'), 460);
    if (Number(n) > 0) {
      floatText(w * 0.5, h * 0.34, '-' + n, 'dmg big');
    }
  }

  function seatHitPulse(node) {
    if (!node) return;
    node.classList.remove('redpulse');
    void node.offsetWidth;
    node.classList.add('redpulse');
    setTimeout(() => node.classList.remove('redpulse'), 700);
  }

  function playerNode(pid) {
    const st = S.st || {};
    if (st.me && st.me.id === pid) return el('me');
    const idx = (st.players || []).filter((p) => p && !p.isMe).map((p) => p.seat).indexOf((st.players || []).find((p) => p && p.id === pid) || {}) ;
    return document.querySelector('[data-eat="' + pid + '"]') || el('seat' + (idx + 1)) || null;
  }

  /* v168：肉牛不出手扑人 —— 只在原地上下弹一下（0 → -12px → 0，约 0.28s，落回带一点压缩感），
     弹跳起点同时来一声「哞」（sfx/moo_ox.wav，音量 0.6，同类 1s 内只响一次；全场都会播到） */
  function oxBounce(monId) {
    const node = monNodeOf(monId);
    if (node) {
      try {
        node.animate([
          { transform: 'translateY(0) scaleY(1)', offset: 0 },
          { transform: 'translateY(-12px) scaleY(1.04)', offset: 0.45 },
          { transform: 'translateY(0) scaleY(.97)', offset: 1 },
        ], { duration: 280, easing: 'ease-out', fill: 'none' });
      } catch (err) { /* 老浏览器没有 WAAPI 就只播声音 */ }
      const b = node.getBoundingClientRect();
      floatText(b.left + b.width / 2, b.top + b.height * 0.2, '哞', 'dmg');
    }
    try { SFXW.play('moo', 0.6, 2000); } catch (err) {}
  }

  function applyFightFx(st) {
    const f = st.fight;
    if (!f || !f.fx) { S.lastFx = 0; return; }
    const mine = Number(S.lastFx || 0);
    let maxId = mine;
    f.fx.forEach((e) => {
      if (e.id <= mine) return;
      if (e.id > maxId) maxId = e.id;
      if (e.kind === 'dmgMon') {
        /* v181：肉牛不攻击人，挨打只「哞」一声，不叠金属挨揍音 */
        if (e.key !== 'ox') { try { SFX.monHit(String(e.key || e.mon || '').toLowerCase()); } catch (err) {} }
        const node = document.querySelector('.mon[data-mon="' + e.mon + '"]');
        if (e.key === 'ox') {
          /* 肉牛挨打：不走普通挨揍抖动，弹一下 + 哞 */
          oxBounce(e.mon);
          if (node && e.n) {
            const bo = node.getBoundingClientRect();
            floatText(bo.left + bo.width / 2, bo.top + bo.height * 0.24, '-' + e.n, 'dmg');
          }
        } else if (node) {
          shakeEl(node, 'hit', 460);
          const b = node.getBoundingClientRect();
          floatText(b.left + b.width / 2, b.top + b.height * 0.24, '-' + e.n, 'dmg');
        }
      } else if (e.kind === 'atkMon') {
        const node = document.querySelector('.mon[data-mon="' + e.mon + '"]');
        if (e.key === 'ox') oxBounce(e.mon);
        else if (node) shakeEl(node, 'atk', 560);
      } else if (e.kind === 'hitPlayer' || e.kind === 'hitNpc') {
        /* v181：被动物伤到 → 宝剑刺入的「噗嗤」声（同类 0.6s 内只响一次；音量比原来低 30%）。
           伤害为 0 的不算（肉牛只弹一下叫一声，不弄出受击特效）。 */
        if (Number(e.n) > 0) {
          S.lastPierceAt = Date.now();
          try { SFXW.play('pierce', 0.315, 600); } catch (err) {}
        }
        const node = e.kind === 'hitPlayer' ? playerNode(e.target) : document.querySelector('[data-npc-strip="' + e.target + '"]');
        const target = node || (e.kind === 'hitPlayer' ? playerNode(e.target) : null);
        const dealHit = Number(e.n) > 0;
        if (target && dealHit) {
          shakeEl(target, 'hit', 520);
          const b = target.getBoundingClientRect();
          floatText(b.left + b.width / 2, b.top + 12, '-' + e.n, 'dmg big');
          hitSlashAt(target);
        }
        const meHit = e.kind === 'hitPlayer' && st.me && st.me.id === e.target;
        if (meHit && dealHit) {
          screenHit(e.n);
          /* 肉牛不扑人：不做满屏扑击，弹一下就行（弹跳/牛叫已在 atkMon 那一步播过） */
          if (e.key && e.key !== 'ox') monsterZoomHit(e.key, e.n, e.mon);
        } else if (e.kind === 'hitPlayer' || e.kind === 'hitNpc') {
          if (e.key && target && e.key !== 'ox') monsterLunge(e.key, target, e.mon);
          /* 别人挨打：他座位上一圈红光 + 裂纹，全场都看得见 */
          if (target) {
            const b2 = target.getBoundingClientRect();
            crackAt(b2.left + b2.width / 2, b2.top + b2.height / 2, 78);
            seatHitPulse(target);
          }
        }
      } else if (e.kind === 'blocked') {
        const node = playerNode(e.target);
        if (node) { shakeEl(node, 'blocked', 420); const b = node.getBoundingClientRect(); floatText(b.left + b.width / 2, b.top + 12, '挡下', 'block'); }
      }
    });
    S.lastFx = maxId;
  }

  /* ---------------- 主渲染 ---------------- */
  /* ---------- 音效引擎（全部现场合成，不依赖音频文件） ---------- */
  const SFX = (() => {
    function ac() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!S.ac) S.ac = new AC();
      if (S.ac.state === 'suspended') S.ac.resume();
      return S.ac;
    }
    function tone(freq, dur, type, gain, delay, opt) {
      const a = ac(); if (!a) return;
      const t0 = a.currentTime + (delay || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      const o2 = opt || {};
      if (o2.to) o.frequency.exponentialRampToValueAtTime(o2.to, t0 + dur);
      if (o2.vib) {
        const l = a.createOscillator(), lg = a.createGain();
        l.frequency.value = o2.vib; lg.gain.value = o2.vibDepth || 6;
        l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05);
      }
      let node = o;
      if (o2.bp) {
        const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o2.bp; f.Q.value = o2.q || 1;
        o.connect(f); node = f;
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.02, gain || 0.14), t0 + (o2.atk || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      node.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function noise(dur, gain, delay, bp, q) {
      const a = ac(); if (!a) return;
      const t0 = a.currentTime + (delay || 0);
      const n = Math.max(1, Math.floor(a.sampleRate * dur));
      const buf = a.createBuffer(1, n, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = a.createBufferSource(); src.buffer = buf;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp || 1200; f.Q.value = q || 1.2;
      const g = a.createGain(); g.gain.value = gain || 0.12;
      src.connect(f); f.connect(g); g.connect(a.destination);
      src.start(t0); src.stop(t0 + dur + 0.02);
    }
    return {
      tone, noise,
      click() { tone(760, 0.06, 'square', 0.05, 0, { to: 520 }); noise(0.03, 0.05, 0, 2600, 2); },
      duang(n) { for (let i = 0; i < (n || 1); i++) { tone(180, 0.22, 'sine', 0.16, i * 0.12, { to: 88 }); noise(0.05, 0.07, i * 0.12, 420, 1.4); } },
      ding(n) { for (let i = 0; i < (n || 1); i++) { tone(1180, 0.42, 'sine', 0.11, i * 0.11); tone(1770, 0.30, 'sine', 0.05, i * 0.11); } },
      /* 木琴：回血 / 回饱食度时「一个人连跳几下」= do mi sol 一点点往上升 */
      xyl(k, delay) {
        const step = Math.max(0, Math.min(11, Number(k) || 0));
        const semi = [0, 4, 7][step % 3] + 12 * Math.floor(step / 3);
        const f = 523.25 * Math.pow(2, semi / 12);
        const d = delay || 0;
        tone(f, 0.32, 'sine', 0.17, d, { atk: 0.002 });
        tone(f * 2, 0.16, 'sine', 0.06, d + 0.002, { atk: 0.002 });
        tone(f * 3, 0.09, 'triangle', 0.03, d + 0.004, { atk: 0.002 });
        noise(0.012, 0.035, d, 3800, 2.6);
      },
      /* 铁：一声清脆的「叮」，长余韵 */
      iron(n) {
        const k = n || 1;
        for (let i = 0; i < k; i++) {
          const d = i * 0.42;
          tone(2093, 1.10, 'sine', 0.13, d, { atk: 0.003 });
          tone(3136, 0.70, 'sine', 0.05, d + 0.004, { atk: 0.003 });
          tone(4186, 0.40, 'sine', 0.025, d + 0.008, { atk: 0.003 });
          noise(0.020, 0.05, d, 5200, 3.4);
        }
      },
      /* 图纸：轰隆——低频滚地一声 */
      blueprint() {
        tone(86, 0.95, 'sine', 0.22, 0, { to: 42, atk: 0.02 });
        tone(58, 1.10, 'triangle', 0.14, 0.02, { to: 36, atk: 0.03 });
        noise(0.70, 0.13, 0, 260, 0.7);
        noise(0.34, 0.06, 0.06, 620, 0.9);
      },
      /* 食物：短短短——三下短促的「嗒」，中间断开 */
      food(n) {
        const k = n || 1;
        for (let r = 0; r < k; r++) {
          const base = r * 0.46;
          [0, 0.13, 0.26].forEach((d, i) => {
            tone(880 + i * 120, 0.075, 'sine', 0.12, base + d, { to: 660 + i * 90, atk: 0.004 });
            noise(0.028, 0.05, base + d, 900, 2.2);
          });
        }
      },
      /* 材料：咔嚓一下 */
      clack() {
        noise(0.055, 0.16, 0, 1750, 1.1);
        noise(0.10, 0.07, 0.005, 700, 0.8);
        tone(220, 0.09, 'square', 0.09, 0, { to: 120, bp: 900, q: 1.2, atk: 0.002 });
      },
      /* v225：金币弹起 —— 两声金属脆响 + 一点高频尾音 */
      coin() {
        tone(1568, 0.16, 'triangle', 0.13, 0, { atk: 0.002, to: 2093, bp: 3200, q: 2.4 });
        tone(2093, 0.20, 'sine', 0.10, 0.045, { atk: 0.002, to: 2637 });
        tone(3136, 0.12, 'sine', 0.045, 0.09);
        noise(0.05, 0.05, 0.012, 5200, 2.2);
      },
      /* 人物：小女孩长笛 / 老牧师钢琴 / 战士鼓 */
      human(key) {
        if (key === 'child') { [660, 784, 988, 1175].forEach((f, i) => tone(f, 0.36, 'sine', 0.09, i * 0.17, { vib: 5.2, vibDepth: 7, atk: 0.05 })); }
        else if (key === 'warrior') { [0, 0.24, 0.42, 0.66].forEach((d, i) => { tone(72 - i * 4, 0.20, 'sine', 0.2, d, { to: 48 }); noise(0.06, 0.09, d, 260, 1.2); }); }
        else if (key === 'priest') { [262, 330, 392, 523].forEach((f, i) => { tone(f, 1.5, 'triangle', 0.075, i * 0.10, { atk: 0.10 }); tone(f * 2, 1.0, 'sine', 0.03, i * 0.10, { atk: 0.14 }); }); }
        else if (key === 'gambler') { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'square', 0.05, i * 0.07, { bp: 2200, q: 2 })); }
        else { [523, 659, 784, 1046, 784].forEach((f, i) => { tone(f, 0.5, 'triangle', 0.07, i * 0.16); tone(f * 2, 0.3, 'sine', 0.03, i * 0.16); }); }
      },
      harp() {
      /* 竖琴琶音：由低到高快速轻掠，像水波 */
      const notes = [392, 494, 587, 698, 784, 988, 1175];
      notes.forEach((f, i) => {
        this.tone(f, 0.9, 'triangle', 0.075, i * 0.055, { atk: 0.004, to: f * 1.002 });
        this.tone(f * 2, 0.5, 'sine', 0.022, i * 0.055 + 0.008, { atk: 0.004 });
      });
    },
    horn() {
      /* 交易阶段牛角号：整体升一个八度 */
      tone(292, 0.55, 'sawtooth', 0.15, 0, { to: 392, vib: 4.5, vibDepth: 8, atk: 0.06, bp: 1400, q: 1.1 });
      tone(392, 0.55, 'sawtooth', 0.12, 0.52, { to: 494, vib: 4.5, vibDepth: 8, atk: 0.06, bp: 1450, q: 1.1 });
    },
    roll(dur, gain) {
      const n = Math.max(6, Math.round(dur / 0.038));
      for (let i = 0; i < n; i++) noise(0.045, gain * (0.7 + 0.3 * Math.random()), i * 0.038, 2600, 1.6);
    },
    /* 野兽登场：各自的怪声 */
    /* v234：兔子 = 轻盈的短笛；绵羊 = 柔和的音色 + 巴松管 */
    prey(key, vol) {
      const k = String(key || '').toLowerCase();
      const g = Number(vol) || 1;
      if (k === 'rabbit') {
        tone(1245, 0.13, 'sine', 0.10 * g, 0, { to: 1568, atk: 0.006, vib: 22, vibDepth: 14 });
        tone(1568, 0.11, 'sine', 0.075 * g, 0.15, { to: 2093, atk: 0.006, vib: 24, vibDepth: 12 });
        tone(1245, 0.20, 'sine', 0.05 * g, 0.30, { to: 1760, atk: 0.008, vib: 18, vibDepth: 20 });
        return;
      }
      if (k === 'sheep') {
        /* 柔和的“咩”：中频颤音 */
        tone(392, 0.55, 'triangle', 0.10 * g, 0, { to: 330, vib: 7, vibDepth: 16, atk: 0.05 });
        /* 巴松管：低音簧片木头味 */
        tone(131, 0.60, 'sawtooth', 0.085 * g, 0.03, { to: 110, bp: 420, q: 1.4, atk: 0.06 });
        tone(196, 0.42, 'triangle', 0.05 * g, 0.06, { to: 165, atk: 0.05 });
        noise(0.10, 0.03 * g, 0.05, 900, 1.2);
        return;
      }
      tone(880, 0.15, 'sine', 0.06 * g, 0, { to: 1200 });
    },
    monCall(key) {
      const k = String(key || '').toLowerCase();
      if (k === 'cat') {
        tone(760, 0.55, 'triangle', 0.10, 0, { to: 1180, vib: 12, vibDepth: 26, atk: 0.03 });
        tone(1040, 0.40, 'sine', 0.05, 0.22, { to: 720, vib: 9, vibDepth: 18 });
        return;
      }
      if (k === 'hound' || k === 'dog') {
        for (let i = 0; i < 2; i++) {
          tone(180 + i * 20, 0.18, 'sawtooth', 0.15, i * 0.26, { to: 250, bp: 680, q: 1.6, atk: 0.012 });
          noise(0.07, 0.09, i * 0.26, 900, 1.4);
        }
        return;
      }
      if (k === 'rat') {
        [2340, 2960, 3520].forEach((f, i) => tone(f, 0.14, 'sine', 0.075, i * 0.09, { to: f * 1.15, atk: 0.004 }));
        return;
      }
      if (k === 'ox') {
        tone(88, 0.85, 'sine', 0.20, 0, { to: 62, atk: 0.05 });
        tone(132, 0.70, 'triangle', 0.07, 0.02, { to: 96, atk: 0.06 });
        noise(0.30, 0.05, 0, 300, 0.8);
        return;
      }
      if (k === 'snake') {
        noise(0.75, 0.10, 0, 6200, 2.2);
        tone(1860, 0.50, 'sine', 0.035, 0.10, { to: 2600, atk: 0.20 });
        return;
      }
      if (k === 'bear') {
        tone(72, 0.90, 'sawtooth', 0.18, 0, { to: 44, bp: 320, q: 1.1, atk: 0.04 });
        tone(104, 0.70, 'sine', 0.16, 0.02, { to: 58, atk: 0.05 });
        noise(0.55, 0.09, 0.04, 420, 0.9);
        return;
      }
      this.duang(1);
    },
    monHit(key) {
      if (key === 'cat') {
        tone(980, 0.34, 'triangle', 0.12, 0, { to: 1620, vib: 24, vibDepth: 55, atk: 0.02 });
        tone(1520, 0.20, 'square', 0.05, 0.14, { to: 1180, vib: 20, vibDepth: 40 });
        this.roll(0.30, 0.055);
        return;
      }
      if (key === 'hound' || key === 'dog') {
        tone(196, 0.14, 'sawtooth', 0.14, 0, { to: 262, bp: 700, q: 1.6, atk: 0.01 });
        tone(220, 0.13, 'sawtooth', 0.12, 0.17, { to: 300, bp: 740, q: 1.6, atk: 0.01 });
        tone(1180, 0.07, 'sine', 0.13, 0.05, {});
        noise(0.05, 0.09, 0.22, 3600, 2.4);
        return;
      }
      if (key === 'rat') {
        tone(2680, 0.55, 'sine', 0.10, 0, { atk: 0.004 });
        tone(4020, 0.42, 'sine', 0.05, 0.01, {});
        tone(3120, 0.30, 'sine', 0.045, 0.10, {});
        tone(4680, 0.24, 'sine', 0.035, 0.16, {});
        return;
      }
      if (key === 'ox') {
        tone(96, 0.36, 'sine', 0.22, 0, { to: 52, atk: 0.006 });
        noise(0.14, 0.06, 0.01, 260, 0.9);
        tone(84, 0.45, 'sawtooth', 0.09, 0.05, { to: 62, bp: 320, q: 1.4, vib: 12, vibDepth: 10 });
        return;
      }
      if (key === 'snake') {
        noise(0.26, 0.075, 0, 6200, 1.1);
        noise(0.10, 0.04, 0.06, 5200, 1.3);
        tone(2340, 0.09, 'square', 0.07, 0.20, { atk: 0.004 });
        return;
      }
      if (key === 'bear') {
        tone(104, 0.42, 'sine', 0.22, 0, { to: 68, atk: 0.005 });
        noise(0.20, 0.07, 0.02, 220, 0.8);
        tone(72, 0.62, 'sawtooth', 0.13, 0.10, { to: 44, bp: 280, q: 1.2, vib: 9, vibDepth: 14 });
        tone(58, 0.30, 'sine', 0.16, 0.46, { to: 38 });
        return;
      }
      this.duang(1);
    },
      hammer() { for (let i = 0; i < 4; i++) { const d = i * 0.34; noise(0.09, 0.16, d, 900, 1.0); tone(96, 0.16, 'sine', 0.18, d, { to: 58 }); } },
      pots() { for (let i = 0; i < 9; i++) { const d = i * 0.11 + Math.random() * 0.03; noise(0.05, 0.07, d, 2600 + Math.random() * 2600, 3.2); tone(1500 + Math.random() * 1400, 0.12, 'triangle', 0.05, d); } },
      viola() { tone(233, 1.9, 'sawtooth', 0.09, 0, { vib: 6.5, vibDepth: 12, atk: 0.25, bp: 900 }); tone(247, 1.9, 'sawtooth', 0.08, 0.02, { vib: 6.0, vibDepth: 12, atk: 0.25, bp: 900 }); noise(0.5, 0.05, 0.1, 1400, 0.7); },
      night() { tone(196, 1.6, 'sine', 0.07, 0, { atk: 0.4, to: 147 }); tone(294, 1.4, 'sine', 0.04, 0.15, { atk: 0.4 }); },
    };
  })();

  /* v164：wav 音效（复用实例池，播完归还；不在每次播放时 new Audio 泄漏）
     roll = 雷雨清晨的开场滚雷；crack = 任何人掉血；far = 远雷（备用）；
     horn = 图纸成品；bubble = 学者研究产出；clank = 火炉出炉；snare = 锅做出菜。
     浏览器自动播放限制：首次交互（点开始/选角色）后自动解锁，不加按钮也不加提示文字。 */
  const SFXW = (() => {
    const SRC = {
      roll: 'sfx/thunder_roll.wav?v=211', far: 'sfx/thunder_far.wav?v=211', crack: 'sfx/thunder_crack.wav?v=211',
      horn: 'sfx/horn_craft.wav?v=211', bubble: 'sfx/bubble_research.wav?v=211', clank: 'sfx/clank_furnace.wav?v=211',
      snare: 'sfx/snare_dish.wav?v=211', clarinet: 'sfx/clarinet_um.wav?v=211', moo: 'sfx/moo_ox.wav?v=211',
      growl: 'sfx/stomach_growl.wav?v=211', pierce: 'sfx/pierce.wav?v=211',
      ship: 'sfx/ship_horn.wav?v=227'
    };
    const POOL = {};
    const LAST = {};
    const COUNT = { roll: 0, far: 0, crack: 0, horn: 0, bubble: 0, clank: 0, snare: 0, clarinet: 0, moo: 0, growl: 0, pierce: 0, ship: 0, all: 0 };
    const LOG = [];
    let unlocked = false;
    /* v204：全局音效音量（0~1），默认 0.7 = 比原来小声 30% */
    let master = (() => {
      try {
        const raw = localStorage.getItem('isl_vol');
        if (raw == null) return 0.7;
        const v = Number(raw);
        return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
      } catch (e) { return 0.7; }
    })();
    function setVol(v) {
      master = Math.max(0, Math.min(1, Number(v) || 0));
      try { localStorage.setItem('isl_vol', String(master)); } catch (e) {}
      if (typeof window !== 'undefined' && window.__volSync) window.__volSync();
      return master;
    }
    function getVol() { return master; }
    function play(name, vol, minGap) {
      if (!SRC[name] || !unlocked) return false;
      if (master <= 0.001) return false;
      const now = Date.now();
      if (minGap && LAST[name] && now - LAST[name] < minGap) return false;
      LAST[name] = now;
      const pool = (POOL[name] = POOL[name] || []);
      let a = null;
      for (let i = 0; i < pool.length; i++) {
        if (pool[i].paused || pool[i].ended) { a = pool[i]; break; }
      }
      if (!a) {
        if (pool.length >= 2) a = pool[0];
        else { a = new Audio(SRC[name]); a.preload = 'auto'; pool.push(a); }
      }
      try {
        a.currentTime = 0;
        a.volume = Math.max(0, Math.min(1, (vol == null ? 0.5 : vol) * master));
        const pr = a.play();
        if (pr && pr.catch) pr.catch(() => {});
      } catch (e) { return false; }
      COUNT[name] = (COUNT[name] || 0) + 1;
      COUNT.all++;
      LOG.push({ kind: name, src: SRC[name], vol: (vol == null ? 0.5 : vol), at: now });
      if (LOG.length > 20) LOG.shift();
      return true;
    }
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      try { if (S.ac && S.ac.state === 'suspended') S.ac.resume(); } catch (e) {}
      /* 预热一次加载，真正播的时候不卡 */
      Object.keys(SRC).forEach((k) => {
        const a = new Audio(SRC[k]);
        a.preload = 'auto';
        a.volume = 0;
        (POOL[k] = POOL[k] || []).push(a);
      });
    }
    function stats() {
      return { unlocked: unlocked, counts: { roll: COUNT.roll, far: COUNT.far, crack: COUNT.crack, horn: COUNT.horn, bubble: COUNT.bubble, clank: COUNT.clank, snare: COUNT.snare, clarinet: COUNT.clarinet, moo: COUNT.moo, growl: COUNT.growl, pierce: COUNT.pierce, all: COUNT.all }, log: LOG.slice(-12) };
    }
    return { play, unlock, stats, SRC, setVol, getVol };
  })();
  if (typeof window !== 'undefined') window.__SFXW = SFXW;
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
    document.addEventListener(ev, function onceUnlock() {
      SFXW.unlock();
      document.removeEventListener(ev, onceUnlock, true);
    }, true);
  });

  /* v204：顶栏喇叭 → 0~100 全局音效音量 */
  (function initVolUI() {
    const btn = document.getElementById('volBtn');
    const pop = document.getElementById('volPop');
    const track = document.getElementById('volTrack');
    const fill = document.getElementById('volFill');
    const knob = document.getElementById('volKnob');
    const lab = document.getElementById('volLab');
    if (!btn || !pop || !track) return;
    function paint() {
      const p = Math.round(SFXW.getVol() * 100);
      if (fill) fill.style.height = p + '%';
      if (knob) knob.style.bottom = p + '%';
      if (lab) lab.textContent = String(p);
      btn.innerHTML = p <= 1 ? '\uD83D\uDD07' : (p < 45 ? '\uD83D\uDD09' : '\uD83D\uDD0A');
      btn.title = '音效音量 ' + p;
    }
    window.__volSync = paint;
    paint();
    function setFromY(clientY) {
      const box = track.getBoundingClientRect();
      const t = 1 - (clientY - box.top) / Math.max(1, box.height);
      SFXW.setVol(Math.max(0, Math.min(1, t)));
      paint();
    }
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      pop.hidden = !pop.hidden;
      paint();
    });
    let drag = false;
    track.addEventListener('pointerdown', function (ev) {
      drag = true;
      try { track.setPointerCapture(ev.pointerId); } catch (e) {}
      setFromY(ev.clientY);
      ev.preventDefault();
    });
    track.addEventListener('pointermove', function (ev) { if (drag) setFromY(ev.clientY); });
    track.addEventListener('pointerup', function () { drag = false; });
    track.addEventListener('pointercancel', function () { drag = false; });
    document.addEventListener('pointerdown', function (ev) {
      if (pop.hidden) return;
      if (pop.contains(ev.target) || btn.contains(ev.target)) return;
      pop.hidden = true;
    }, true);
  })();


  /* 按钮按下弹起 + 点击音 */
  document.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest('button,.btn,[data-act],.pchip,.mode-btn,.wcell');
    if (!b) return;
    b.classList.remove('tapped');
    void b.offsetWidth;
    b.classList.add('tapped');
    setTimeout(() => b.classList.remove('tapped'), 320);
    SFX.click();
  }, true);

  /* 抽卡逐张发：每 0.4 秒给一张，每张配一个音效 */
  function oneCardSfx(it) {
    if (!it) return;
    try {
      if (it.kind === 'food') SFX.food(1);
      else if (it.kind === 'material') { if (it.key === 'iron') SFX.iron(1); else SFX.clack(); }
      else if (it.kind === 'blueprint') SFX.blueprint();
      else if (it.kind === 'human') SFX.human(it.key);
      else SFX.duang(1);
    } catch (e) {}
  }
  function startReveal(items) {
    const q = (items || []).filter((x) => x && x.id);
    if (!q.length) { playSearchSfx(items); return; }
    if (!S.reveal) S.reveal = new Set();
    q.forEach((it) => S.reveal.add(it.id));
    try { if (S.st) render(S.st); } catch (e) {}
    q.forEach((it, i) => {
      setTimeout(() => {
        S.reveal.delete(it.id);
        const d = document.querySelector('#meHand .card[data-card="' + it.id + '"]');
        if (d) {
          d.classList.remove('unrevealed');
          d.classList.remove('pop');
          void d.offsetWidth;
          d.classList.add('pop');
          setTimeout(() => d.classList.remove('pop'), 380);
        }
        oneCardSfx(it);
      }, 260 + i * 400);
    });
  }

  function playSearchSfx(items) {
    (items || []).forEach((it, i) => {
      setTimeout(() => {
        if (it.kind === 'food') SFX.food(1);
        else if (it.kind === 'material') { if (it.key === 'iron') SFX.iron(1); else SFX.clack(); }
        else if (it.kind === 'blueprint') SFX.blueprint();
        else if (it.kind === 'human') SFX.human(it.key);
        else SFX.duang(1);
      }, i * 380);
    });
  }

  /* 抽卡播报：屏幕中间弹一下，再飘进日志 */
  const FEED_Q = [];
  let feedRunning = false;
  function runFeedToast() {
    if (feedRunning) return;
    const item = FEED_Q.shift();
    if (!item) return;
    feedRunning = true;
    const d = document.createElement('div');
    d.className = 'draw-toast tone-' + (item.tone || 'red') + ' kind-' + (item.kind || '');
    d.textContent = item.text || '';
    document.body.appendChild(d);
    void d.offsetWidth;
    d.classList.add('show');
    setTimeout(function () { d.classList.add('land'); }, 1500);
    setTimeout(function () {
      if (d.parentNode) d.parentNode.removeChild(d);
      feedRunning = false;
      runFeedToast();
    }, 2100);
  }
  function pushFeedToast(it) {
    if (!it || !it.text) return;
    if (FEED_Q.length > 5) FEED_Q.length = 0;
    FEED_Q.push(it);
    runFeedToast();
  }

  function paintLoot(st) {
    let box = document.getElementById('lootPanel');
    if (!st.loot) { if (box && box.parentNode) box.parentNode.removeChild(box); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'lootPanel';
      document.body.appendChild(box);
    }
    const items = (st.loot.items || []).map((it) =>
      '<div class="loot-card" data-loot="' + esc(it.id) + '">' + cardHTML(it) + '</div>').join('');
    box.innerHTML = '<div class="loot-head">' + esc(st.loot.name) + ' 留下的东西</div>' +
      '<div class="loot-row">' + (items || '<span class="st-sub">已经分完了</span>') + '</div>' +
      '<div class="loot-foot"><button data-act="lootOk"' + (st.loot.ok ? ' disabled' : '') + '>' + (st.loot.ok ? '已确认' : '确认') + '</button></div>';
  }

  function showEnd(ended) {
    if (S.endShown) return;
    S.endShown = true;
    const win = ended && ended.result === 'win';
    const old = document.getElementById('endOverlay');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const d = document.createElement('div');
    d.id = 'endOverlay';
    d.className = win ? 'end-win' : 'end-lose';
    d.innerHTML = '<div class="end-word">' + (win ? '胜利' : '失败') + '</div>' +
      '<div class="end-why">' + esc((ended && (ended.why || ended.text)) || '') + '</div>' +
      '<div class="end-btns">' +
      '<button class="end-restart" data-act="nextRoom">去下一局' + (S.st && S.st.nextCode ? '（房间 ' + esc(S.st.nextCode) + '）' : '') + '</button>' +
      '<button class="end-save" data-act="saveLog">保存日志</button>' +
      '</div>';
    document.body.appendChild(d);
    setTimeout(() => d.classList.add('on'), 30);
    const rb0 = d.querySelector('.end-restart');
    if (rb0) rb0.classList.add('on');
    try { if (win) { SFX.ding(3); setTimeout(() => SFX.ding(3), 260); } else SFX.night(); } catch (e) {}
  }

  /* v160：把这一局从登岛开始的完整日志导出成 txt（浏览器下载，玩家自己选位置） */
  function saveGameLog() {
    const st = S.st || {};
    const list = (st.allLog && st.allLog.length) ? st.allLog : (st.log || []);
    if (!list.length) { toast('这局还没有日志'); return; }
    let lastDay = 1;
    const lines = list.map((x) => {
      const d = (x && x.day != null) ? Number(x.day) : lastDay;
      lastDay = d || lastDay;
      return '第' + (d || 1) + '天  ' + ((x && x.msg) || '');
    });
    const txt = '荒岛 21 天 · 逃离瓦格' + (st.code ? '（房间 ' + st.code + '）' : '') + '\r\n' +
      '结局：' + (st.ended ? (st.ended.result === 'win' ? '胜利' : '失败') + ' · ' + (st.ended.why || '') : '进行中') + '\r\n' +
      '导出时间：' + new Date().toLocaleString() + '\r\n' +
      '------------------------------\r\n' + lines.join('\r\n') + '\r\n';
    const name = '荒岛21天-日志-' + (st.code || 'local') + '.txt';
    const blobDownload = function () {
      try {
        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 400);
      } catch (e) { toast('导出失败'); }
    };
    try {
      if (window.showSaveFilePicker) {
        window.showSaveFilePicker({ suggestedName: name, types: [{ description: '文本文件', accept: { 'text/plain': ['.txt'] } }] })
          .then((h) => h.createWritable())
          .then((w) => w.write(txt).then(() => w.close()))
          .catch(function () { blobDownload(); });
        return;
      }
    } catch (e) {}
    blobDownload();
  }

  const ISL_KEY = { '\u74e6\u683c\u5c9b': 'wague', '\u57c3\u68ee\u5c9b': 'aisen', '\u65af\u6258\u592b\u5c9b': 'stov', '\u91c7\u5e0c\u519c\u5c9b': 'caixinong', '\u5df4\u5c14\u5df4\u91cc\u65af\u5c9b': 'barbaris' };
  const PHASE_CN = { dawn: '清晨', search: '搜索', trade: '交付', build: '建造', cook: '烹饪', night: '夜晚', nightbuild: '夜晚建造阶段', fight: '战斗', discard: '弃牌', loot: '拾取遗物' };

  /* 换岛过场：汽笛 → 屏幕慢慢变黑 → 「盖德正带我们前往」1.5s → 全黑里换壁纸 → 慢慢亮起 → 大岛名 → 飞到顶栏 */
  function islandSwitchFx(newName, newKey) {
    if (S.islFx) return;
    S.islFx = true;
    try { SFX.horn(); } catch (e) {}
    let veil = document.getElementById('blackVeil');
    if (!veil) {
      veil = document.createElement('div');
      veil.id = 'blackVeil';
      document.body.appendChild(veil);
    }
    void veil.offsetWidth;
    veil.classList.add('on');

    const gade = document.createElement('div');
    gade.id = 'gadeMsg';
    gade.innerHTML = '<div class="gd-main">盖德正带我们前往</div><div class="gd-sub">……</div>';
    document.body.appendChild(gade);

    setTimeout(function () { gade.classList.add('on'); }, 420);
    setTimeout(function () { gade.classList.remove('on'); }, 420 + 1500);
    setTimeout(function () { if (gade.parentNode) gade.parentNode.removeChild(gade); }, 420 + 1500 + 320);
    /* 全黑期间换壁纸 */
    setTimeout(function () {
      if (newKey) document.body.dataset.island = newKey;
      delete document.body.dataset.stage;
    }, 420 + 1500 + 300);
    /* 开始慢慢亮 */
    setTimeout(function () { veil.classList.remove('on'); }, 420 + 1500 + 460);
    /* 亮起来之后才出现大岛名（比原来多停 0.5 秒） */
    setTimeout(function () {
      flyBanner(newName, '岛', el('islandName'), 3100, function () {
        el('islandName').textContent = newName;
        S.islFx = false;
      });
    }, 420 + 1500 + 460 + 900);
    /* 兵底 */
    setTimeout(function () {
      if (!S.islFx) return;
      S.islFx = false;
      if (el('islandName')) el('islandName').textContent = newName;
      const v = document.getElementById('blackVeil');
      if (v) v.classList.remove('on');
    }, 11000);
  }

  /* 大字横幅：先居中，再缩小飞向目标元素。
     v128：改成排队播——一条播完才出下一条（第 N 天 → 约 3 秒后「搜索」），不会同屏堆出来 */
  const bannerQ = [];
  let bannerBusy = false;

  function flyBanner(text, sub, target, holdMs, onLand, flyMs) {
    bannerQ.push({ text: text, sub: sub, target: target, holdMs: holdMs, onLand: onLand, flyMs: flyMs });
    pumpBanner();
  }

  function pumpBanner() {
    if (bannerBusy) return;
    const job = bannerQ.shift();
    if (!job) return;
    bannerBusy = true;
    /* v161：target 可以传函数（起飞前再解析一次），也可以直接传元素 */
    playBanner(job.text, job.sub, job.target, job.holdMs, job.onLand, job.flyMs);
  }

  function playBanner(text, sub, target, holdMs, onLand, flyMs) {
    const resolve = () => (typeof target === 'function') ? target() : target;
    const old = document.getElementById('bigBanner');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const d = document.createElement('div');
    d.id = 'bigBanner';
    d.className = 'big-banner' + (sub ? ' has-sub' : '');
    d.innerHTML = '<div class="bb-main">' + esc(text) + '</div>' +
      (sub ? '<div class="bb-sub">' + esc(sub) + '</div>' : '');
    document.body.appendChild(d);
    const t = (function () { const n = resolve(); return n && n.getBoundingClientRect ? n.getBoundingClientRect() : null; })();
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const tx = t ? (t.left + t.width / 2 - cx) : 0;
    const ty = t ? (t.top + t.height / 2 - cy) : -cy * 0.55;
    d.style.setProperty('--tx', Math.round(tx) + 'px');
    d.style.setProperty('--ty', Math.round(ty) + 'px');
    const HOLD = Math.max(300, holdMs || 900);
    /* v161：阶段名飞出时长 1200ms + 500ms = 1700ms（flyMs 由调用方传，CSS 动画同步这个值） */
    const FLY = Math.max(400, flyMs || 1200);
    d.style.setProperty('--flyms', FLY + 'ms');
    requestAnimationFrame(() => d.classList.add('hold'));
    setTimeout(() => {
      /* v161：起飞前按目标「当前」实际位置再算一次——阶段刚开始时动作区还在重排，位置会跳 */
      const n2 = resolve();
      const t2 = (n2 && n2.getBoundingClientRect) ? n2.getBoundingClientRect() : null;
      if (t2 && t2.width > 1 && t2.height > 1) {
        d.style.setProperty('--tx', Math.round(t2.left + t2.width / 2 - cx) + 'px');
        d.style.setProperty('--ty', Math.round(t2.top + t2.height / 2 - cy) + 'px');
      }
      d.classList.remove('hold');
      d.classList.add('flying');
      setTimeout(() => { try { if (onLand) onLand(); } catch (e) {} }, FLY - 30);
    }, HOLD);
    setTimeout(() => {
      if (d.parentNode) d.parentNode.removeChild(d);
      bannerBusy = false;
      pumpBanner();
    }, HOLD + FLY + 120);
  }

  /* 公鸡打鸣（现场合成，没有音频文件也能响） */
  function crowSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!S.ac) S.ac = new AC();
      const ac = S.ac;
      if (ac.state === 'suspended') ac.resume();
      const t0 = ac.currentTime + 0.02;
      [0, 0.16, 0.34].forEach((off, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(430 + i * 40, t0 + off);
        o.frequency.exponentialRampToValueAtTime(880 + i * 60, t0 + off + 0.10);
        o.frequency.exponentialRampToValueAtTime(560, t0 + off + 0.20);
        bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.1;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.15, t0 + off + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.22);
        o.connect(bp); bp.connect(g); g.connect(ac.destination);
        o.start(t0 + off); o.stop(t0 + off + 0.26);
      });
    } catch (e) { /* 静音失败不影响游戏 */ }
  }

  /* v161：把某个绝对定位元素整体飞向目标元素（缩小 + 淡出）。
     用目标实际的 getBoundingClientRect() 算位移，CSS 里 .fly 负责 0.8s 过渡。 */
  function flyNodeTo(node, target, ms) {
    if (!node) return;
    const dur = Math.max(120, ms || 800);
    const r = node.getBoundingClientRect();
    const t = (target && target.getBoundingClientRect) ? target.getBoundingClientRect() : null;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const tx = t ? (t.left + t.width / 2 - cx) : 0;
    const ty = t ? (t.top + t.height / 2 - cy) : -cy * 0.55;
    node.style.setProperty('--tx', Math.round(tx) + 'px');
    node.style.setProperty('--ty', Math.round(ty) + 'px');
    node.style.setProperty('--flyT', dur + 'ms');   /* v170：每个节点自己决定飞多久 */
    node.classList.add('fly');
    return dur;
  }

  /* v162：天气只在「正上方」闪一下（约 1.2s），1.5s 后整层从 DOM 删掉。
     不再铺满背景、不在画面中间画太阳、不挡牌桌；只在视口顶部 12vh 内。 */
  const WX_KEYS = ['clear', 'rain', 'fog', 'storm', 'hot'];
  function topWeatherNodes(key) {
    let html = '', i = 0;
    if (key === 'rain' || key === 'storm') {
      const n = key === 'storm' ? 16 : 13;
      for (i = 0; i < n; i++) {
        html += '<i class="wt-drop" style="left:' + (4 + Math.random() * 92).toFixed(1) + '%;' +
          'animation-delay:' + (Math.random() * 0.32).toFixed(2) + 's"></i>';
      }
      if (key === 'storm') html += '<i class="wt-flash"></i>';
    } else if (key === 'fog') {
      html = '<i class="wt-fog"></i>';
    } else {
      html = '<i class="wt-glow"></i><i class="wt-ring"></i>';
    }
    return html;
  }
  function topWeatherShow(key) {
    key = WX_KEYS.indexOf(key) >= 0 ? key : 'clear';
    const old = document.getElementById('wxTop');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const box = document.createElement('div');
    box.id = 'wxTop';
    box.className = 'wx-' + key;
    box.innerHTML = topWeatherNodes(key);
    document.body.appendChild(box);
    S.dayWx = key;
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1500);
    return box;
  }
  /* v165：全天「周围」的天气环境层（雨/雾/太阳），一直挂着，不只是清晨那一下。
     雨丝从画面四周往下落、雾在上下两条飘、晴天是屏幕正上方之外的一轮大太阳
     透一小圈光、再洒下一道很淡的光柱——不挡牌、不吃点击（pointer-events:none）。 */
  function ambientWeather(key) {
    key = WX_KEYS.indexOf(key) >= 0 ? key : 'clear';
    if (S.ambWx === key && document.getElementById('wxAmb')) return;
    S.ambWx = key;
    const old = document.getElementById('wxAmb');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const box = document.createElement('div');
    box.id = 'wxAmb';
    box.className = 'amb-' + key;
    let html = '', i = 0;
    if (key === 'rain' || key === 'storm') {
      const n = key === 'storm' ? 72 : 54;
      for (i = 0; i < n; i++) {
        const h = 34 + Math.round(Math.random() * 46);
        const dur = (0.85 + Math.random() * 0.7).toFixed(2);
        const del = (Math.random() * 2).toFixed(2);
        html += '<i class="amb-drop" style="left:' + (Math.random() * 108 - 4).toFixed(1) + '%;' +
          'height:' + h + 'px;animation-duration:' + dur + 's;animation-delay:-' + del + 's;' +
          'opacity:' + (0.32 + Math.random() * 0.42).toFixed(2) + '"></i>';
      }
      if (key === 'storm') html += '<i class="amb-veil"></i>';
    } else if (key === 'fog') {
      html = '<i class="amb-fog"></i><i class="amb-fog b"></i>';
    } else {
      html = '<i class="amb-wash"></i><i class="amb-sun"></i><i class="amb-ring"></i><i class="amb-rays"></i>' +
        '<i class="amb-streak s1"></i><i class="amb-streak s2"></i><i class="amb-streak s3"></i>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
  }
  /* 兼容旧调用点：换天气 / 换天时，只换常驻环境层（不再闪一下——「清晨那一下」才是亮的） */
  function setDayWeather(key) {
    ambientWeather(key);
  }

  /* 「清晨」那一刻：顶部天气一下（晴=光圈、雨=顶上细雨、雷雨=细雨+闪光、雾=淡灰雾）
     v168：每天只在进入 dawn 时演一次（按天数去重） */
  function dawnSkyShow() {
    const key = (S.st && S.st.today && S.st.today.key) || 'clear';
    const day = Number(S.st && S.st.day) || 0;
    if (day && S.dawnWxDay === day) return null;
    if (day) S.dawnWxDay = day;
    /* v162：雷雨天清晨同时来一声滚雷（音量 0.5，和顶部细雨+闪光同一刻） */
    if (key === 'storm') SFXW.play('roll', 0.5);
    return topWeatherShow(key);
  }

  function dayIntro(st) {
    crowSound();
    dayBannerStack(st, !!(st && st.phase === 'dawn'), false);
    setDayWeather(st.today ? st.today.key : 'clear');
  }

  /* v161：开场「第 N 天」+「清晨」同列堆叠（清晨在天数正下方，CSS gap 16px），两者同时淡入。
     时序：0s 同时淡入 2s → 停留 4s（原 2s + 2s）→ 0.8s 飞向各自锚点：
       天数 → 左上角常驻 #dayLabel；清晨 → 今天天气格（阶段名飞向自己的图标）。
     withMorning=false 时只放天数（非清晨时段换天用）。 */
  const DAYFADE = 2000, DAYHOLD = 2500, DAYFLY = 800;
  const DAYFLY_TEXT = 300;   /* v170：天数那三个字要更快消失（原 0.8s，减 0.5s） */
  const CN_DAY = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function cnDay(n) {
    return CN_DAY[n] ? ('第' + CN_DAY[n] + '天') : ('第 ' + n + ' 天');
  }

  /* v162：起飞终点统一为右上角常驻的「当前阶段」指示（#phaseChip）。
     天数、清晨、探索/交付/建造/烹饪/夜晚 全部飞向它。 */
  function phaseAnchor(ph) {
    const chip = el('phaseChip');
    if (chip) {
      const r = chip.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return chip;
    }
    return document.querySelector('.phase-chip') || document.body;
  }

  function dayBannerStack(st, withMorning, fadeMs) {
    /* v180：fadeMs 传了就用它做淡入时长（夜深了→天亮时只要 0.5s），不传还是原来的 2s */
    const fade = Math.max(0, Number(fadeMs) || 0);
    const old = document.getElementById('openSeq');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const box = document.createElement('div');
    box.id = 'openSeq';
    const wk = Math.max(1, Math.min(3, Number(st && st.week) || 1));
    box.innerHTML = '<div class="os-stack">' +
        '<div class="os-day wk' + wk + '">' + cnDay(st.day) + '</div>' +
        (withMorning ? '<div class="os-morning">清晨</div>' : '') +
      '</div>';
    document.body.appendChild(box);
    const day = box.querySelector('.os-day');
    const morning = box.querySelector('.os-morning');
    /* 同时出现：两个都在同一帧加 .on；v180 允许按需覆盖淡入时长 */
    if (fade) {
      day.style.transitionDuration = fade + 'ms';
      if (morning) morning.style.transitionDuration = fade + 'ms';
    }
    /* 强制先把「全透明」这一帧落实，否则连着加 .on 浏览器不会走过渡（会直接跳到 0.8） */
    void day.offsetWidth;
    if (morning) void morning.offsetWidth;
    day.classList.add('on');
    if (morning) morning.classList.add('on');
    /* 清晨那一刻的天空小演出 */
    if (withMorning) dawnSkyShow();
    /* 飞走：天数飞向左上角常驻天数（#dayLabel），清晨随之淡去；缩小 + 淡出 0.8s */
    const flyOff = function (msDay, msMor) {
      if (!box.parentNode) return;
      flyNodeTo(day, el('dayLabel'), msDay || DAYFLY_TEXT);   /* v170：天数三个字更快收走 */
      if (morning) flyNodeTo(morning, el('dayLabel'), msMor || DAYFLY);
    };
    const holdMs = (fade || DAYFADE) + DAYHOLD;
    const flyTimer = setTimeout(function () {
      flyOff();
      /* v188：大字读完了 —— 通知外面「清晨已经播完」，分药窗 / 老奶奶的仪式才往上接 */
      if (typeof S.onDayBannerLand === 'function') { try { S.onDayBannerLand(); } catch (e) {} }
    }, holdMs);
    /* v171：老奶奶说天气时要提前把这块收掉 —— 允许外部喊一声「现在就慢慢飞走」 */
    S.openSeqDismiss = function (ms) {
      clearTimeout(flyTimer);
      flyOff(ms || 600, ms || 600);
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, (ms || 600) + 160);
      S.openSeqDismiss = null;
    };
    setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
      if (S.openSeqDismiss) S.openSeqDismiss = null;
    }, holdMs + DAYFLY + 140);
    return box;
  }

  /* v188：天数/清晨大字落定（飞走那一刻）才算「这一天开始了」 */
  S.onDayBannerLand = function () {
    S.dawnReady = (S.st && S.st.day) || 0;
    try { if (S.st) render(S.st); } catch (e) {}
  };

  /* v169：夜深了——黄色字、位置比一般横幅高一点，而且一直挂着，
     直到每个人都选完今天的夜晚行动才收掉。 */
  function showNightBanner() {
    /* v213：金色「夜深了」横幅取消，只留蓝色弹窗，位置挪到原来金色大字那里 */
    document.body.classList.add('night-yellow');
  }
  function hideNightBanner() {
    document.body.classList.remove('night-yellow');
    const b = document.getElementById('nightBanner');
    if (!b) return;
    b.classList.remove('stay');
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 460);
  }

  /* v169：全队都直接睡（没人外出）→ 先慢慢黑下来，停 2.5s，再慢慢亮起来，
     亮完才播「第 N 天 / 清晨」。这段里不插任何别的阶段大字。 */
  function nightDawnSeq(done) {
    S.nightHold = true;
    S.opening = true;
    document.body.classList.add('dawn-fade');
    document.body.classList.add('night');
    const mask = document.querySelector('.night-mask');
    const cur = mask ? (parseFloat(getComputedStyle(mask).opacity) || 0) : 0;
    const darkMs = cur > 0.85 ? 0 : 2000;      /* 还没黑透就补一段变暗 */
    setTimeout(function () {
      document.body.classList.remove('night');  /* 慢慢亮起来 */
      /* v180：变亮的这一刻就把「第 N 天 / 清晨」放出来，用 0.5s 从全无到显现，
         跟画面一起亮起来（原来是等亮完 2s 才播）。 */
      if (typeof done === 'function') done(500);
      setTimeout(function () {
        S.nightHold = false;
        document.body.classList.remove('dawn-fade');
        S.opening = false;
      }, 2000);
    }, darkMs + 2500);
  }

  /* v159 起的开局过场（v161 重排）。探索要等真正进了搜索阶段才出现。 */
  function openingSeq(st, again, fadeMs) {
    if (S.openDone && !again) return;
    S.openDone = true;
    S.opening = true;
    S.openExploreShown = false;
    S.exploreArm = false;
    crowSound();
    dayBannerStack(st, true, fadeMs);
    S.openExplore = function () {
      if (S.openExploreShown || !S.exploreArm) return;
      const p = S.st && S.st.phase;
      if (p !== 'search' && p !== 'trade' && p !== 'build' && p !== 'cook' && p !== 'night') return;
      S.openExploreShown = true;
      S.opening = false;
      flyBanner('探索', '', () => phaseAnchor('search'), 1200, null, 1700);
    };
    /* 天数 / 清晨飞完（0.8s）之后才放「探索」，不同屏堆 */
    setTimeout(function () { S.exploreArm = true; if (S.openExplore) S.openExplore(); }, DAYFADE + DAYHOLD + DAYFLY + 200);
  }

  function phaseIntro(phase) {
    const cn = PHASE_CN[phase] || phase;
    if (phase === 'dawn') {
      const dn = (S.st && S.st.dawn) || {};
      const sub = dn.step === 'wx'
        ? ((dn.name || '乌姆') + ' 正在试图改变天气')
        : (dn.pid ? ((dn.name || '队友') + ' 正在给药') : '先给药，再看天气，然后才搜索');
      flyBanner(cn, sub, () => phaseAnchor('dawn'), 1600, null, 1700);
      return;
    }
    if (phase === 'night' || phase === 'nightbuild') {
      const pendingTixi = phase === 'night' && S.st && S.st.tixiAsk && !S.st.tixiAsk.done;
      if (!pendingTixi) document.body.classList.add('night');
      if (phase === 'nightbuild') {
        try { SFX.hammer(); } catch (e) {}
        hideNightBanner();   /* 有人外出 → 夜晚行动已经选完，夜深了收掉，别跟建造横幅挤一起 */
        flyBanner(cn, '可以建造 / 交付，也可以直接收工', () => phaseAnchor('nightbuild'), 2000, null, 1700);
      } else {
        SFX.night();
        /* v169：夜晚不叫「夜晚」，叫「夜深了」；黄色常驻横幅，等所有人都选完才收 */
        showNightBanner();
      }
      return;
    }
    document.body.classList.remove('night');
    const isleNow = phase === 'trade' && !!(S.st && S.st.isleOffer);
    if (phase === 'trade' && !isleNow) SFX.horn();
    else if (phase === 'build') SFX.hammer();
    else if (phase === 'cook') SFX.pots();
    else if (phase === 'fight') SFX.viola();
    /* v161：颜色不动，只改终点（各自阶段的图标）+ 飞出时长 1200 → 1700 */
    if (!isleNow) flyBanner(cn, '', () => phaseAnchor(phase), 2000, null, 1700);
  }

  /* 任何人掉血 → 整屏边缘红光闪一次 */
  function mealJumpSeq(st) {
    const raw = (st.players || []).filter((p) => p && p.alive && Number(p.eatGain || 0) > 0);
    if (!raw.length) return;
    /* 从左上角那个人开始，逆时针一个个跳 */
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const arr = raw.map((p) => {
      const n = document.querySelector('.seat-strip[data-p="' + p.id + '"]') || (p.isMe ? el('me') : null);
      const rc = n ? n.getBoundingClientRect() : { left: cx, top: cy, width: 0, height: 0 };
      const a = Math.atan2(rc.top + rc.height / 2 - cy, rc.left + rc.width / 2 - cx) * 180 / Math.PI;
      return { p: p, a: (a + 360) % 360, d: Math.hypot(rc.left + rc.width / 2 - cx, rc.top + rc.height / 2 - cy) };
    });
    const top = arr.slice().sort((x, y) => Math.abs(x.a - 225) - Math.abs(y.a - 225))[0];
    arr.forEach((x) => { x.k = (top.a - x.a + 360) % 360; });
    arr.sort((x, y) => x.k - y.k);
    const list = arr.map((x) => x.p);
    list.forEach((p, i) => {
      setTimeout(() => {
        /* v138：回几点就跳几下；同一个人音高一路往上爬（do mi sol ...），换到下一个人从 do 重新开始 */
        const times = Math.max(1, Math.min(10, Number(p.eatGain || 1)));
        for (let k = 0; k < times; k++) {
          setTimeout(() => {
            try { if (typeof SFX !== 'undefined' && SFX.xyl) SFX.xyl(k); } catch (e) {}
            if (p.isMe) { satJump(1); return; }
            const strip = document.querySelector('.seat-strip[data-p="' + p.id + '"]');
            if (strip) { strip.classList.remove('satpop'); void strip.offsetWidth; strip.classList.add('satpop'); }
          }, k * 500);
        }
      }, i * 400);
    });
  }

  function satJump(n) {
    const t = el('meSat');
    if (!t || !n) return;
    t.classList.remove('jump');
    void t.offsetWidth;
    t.style.setProperty('--jn', String(Math.max(1, n)));
    t.classList.add('jump');
    setTimeout(function () { t.classList.remove('jump'); }, 280 * n + 500);
  }

  function hpJumpSelf(n) {
    const t = el('meHp');
    if (!t || !n) return;
    t.classList.remove('jump');
    void t.offsetWidth;
    t.style.setProperty('--jn', String(Math.max(1, n)));
    t.classList.add('jump');
    setTimeout(function () { t.classList.remove('jump'); }, 280 * n + 500);
  }

  function healPop(id, cls) {
    const n = document.querySelector('.seat-strip[data-p="' + id + '"]');
    if (!n) return;
    n.classList.remove(cls);
    void n.offsetWidth;
    n.classList.add(cls);
    setTimeout(function () { n.classList.remove(cls); }, 520);
  }

  /* v138：木琴连音——同一个人连续跳时音高往上爬（do mi sol ...），换人就重新从 do 开始 */
  const XSEQ = { id: '', step: -1, t: 0 };
  function xylStepFor(id) {
    const now = Date.now();
    if (XSEQ.id === id && (now - XSEQ.t) < 1500) XSEQ.step = Math.min(11, XSEQ.step + 1);
    else { XSEQ.id = id; XSEQ.step = 0; }
    XSEQ.t = now;
    return XSEQ.step;
  }

  /* 谁回复（血 / 饱食）谁跳：从左上方那个开始，顺时针一个个来，间隔 0.62 秒 */
  function jumpSeq(gains) {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const arr = gains.map(function (g) {
      const n = document.querySelector('.seat-strip[data-p="' + g.id + '"]');
      const rc = n ? n.getBoundingClientRect() : { left: cx, top: cy, width: 0, height: 0 };
      const a = Math.atan2(rc.top + rc.height / 2 - cy, rc.left + rc.width / 2 - cx) * 180 / Math.PI;
      return { id: g.id, dhp: g.dhp, dsat: g.dsat, me: g.me, a: (a + 360) % 360 };
    });
    let start = arr.findIndex(function (x) { return x.me; });
    if (start < 0) {
      const top = arr.slice().sort(function (x, y) { return Math.abs(x.a - 225) - Math.abs(y.a - 225); })[0];
      start = arr.indexOf(top);
    }
    const seq = arr.slice(start).concat(arr.slice(0, start));
    seq.forEach(function (g, i) {
      setTimeout(function () {
        /* 回几点就跳几下（一回 4 点就跳 4 下，音高一路往上爬） */
        const times = Math.max(1, Math.min(10, Math.max(g.dhp, g.dsat)));
        for (let k = 0; k < times; k++) {
          setTimeout(function () {
            try { if (typeof SFX !== 'undefined' && SFX.xyl) SFX.xyl(xylStepFor(g.id)); } catch (e) {}
            if (g.me) {
              if (g.dsat > 0 && k < g.dsat) satJump(1);
              if (g.dhp > 0 && k < g.dhp) hpJumpSelf(1);
              if (g.dsat <= 0 && g.dhp <= 0) satJump(1);
            } else {
              healPop(g.id, 'satpop');
            }
          }, k * 260);
        }
      }, i * 620);
    });
  }

  function hpWatch(st) {
    const hpCur = {}, satCur = {};
    const take = function (x) {
      if (!x || !x.id) return;
      hpCur[x.id] = Number(x.hp);
      satCur[x.id] = Number(x.sat);
    };
    if (st.me) take(st.me);
    (st.players || []).forEach(take);
    (st.npcs || []).forEach(take);
    const gains = [];
    let lost = false;
    Object.keys(hpCur).forEach(function (id) {
      const ph = S.hpPrev ? S.hpPrev[id] : undefined;
      const ps = S.satPrev2 ? S.satPrev2[id] : undefined;
      const dhp = (typeof ph === 'number') ? hpCur[id] - ph : 0;
      const dsat = (typeof ps === 'number') ? satCur[id] - ps : 0;
      if (dhp < 0) lost = true;
      if (dhp > 0 || dsat > 0) gains.push({ id: id, dhp: Math.max(0, dhp), dsat: Math.max(0, dsat), me: !!(st.me && st.me.id === id) });
    });
    S.hpPrev = hpCur;
    S.satPrev2 = satCur;
    if (!fxArmed(st)) { S.hpPrev = hpCur; S.satPrev2 = satCur; return; } /* 选角色阶段：只记录数值，不播受伤/回血特效 */
    if (lost && typeof redFlash === 'function') redFlash();
    if (gains.length) jumpSeq(gains);
  }

  function bodyOutDim(on) {
    document.body.classList.toggle('outdark', !!on);
    let t = document.getElementById('outToast');
    if (on) {
      if (!t) {
        t = document.createElement('div');
        t.id = 'outToast';
        t.className = 'out-toast';
        t.innerHTML = '<i></i>有人选择了外出，等他回来';
        document.body.appendChild(t);
      }
    } else if (t && t.parentNode) { t.parentNode.removeChild(t); }
  }

  /* ---- 壁纸位置：双击岛名进入编辑，方向键微调，回车退出 ---- */
  function applyBgPosStyle() {
    const p = S.bgPos || { x: 50, y: 50, dim: 0 };
    document.body.style.backgroundPosition = 'center center, ' + p.x + '% ' + p.y + '%';
    document.body.style.setProperty('--bg-dim', String(Number(p.dim || 0)));
  }
  function bgHudEl() {
    let d = document.getElementById('bgHud');
    if (!d) {
      d = document.createElement('div');
      d.id = 'bgHud';
      d.hidden = true;
      document.body.appendChild(d);
    }
    return d;
  }
  function refreshBgHud() {
    const d = bgHudEl();
    if (!S.bgEdit) { d.hidden = true; return; }
    const p = S.bgPos || { x: 50, y: 50 };
    d.hidden = false;
    const pct = Math.round(Number(p.dim || 0) * 100);
    d.textContent = '编辑背景中 · 方向键移动、W 变亮 / S 更朦胧（Shift 加速）· 回车退出 · x ' + p.x + '% y ' + p.y + '% · 暗度 ' + pct + '%';
  }
  /* 命运人物结算后：在弹窗下面给自己看一眼“你被改变了什么”（1.6 秒） */
  let fateDeltaTimer = null;
  function showFateDelta(fr) {
    try {
      const me = S.st && S.st.me;
      const rec = fr && fr.byId && me && fr.byId[me.id];
      if (!rec || !rec.lines || !rec.lines.length) return;
      let d = document.getElementById('fateDelta');
      if (!d) {
        d = document.createElement('div');
        d.id = 'fateDelta';
        document.body.appendChild(d);
      }
      const rows = rec.lines.map(function (t) {
        const bad = /-\d|丢掉|被拿走|降到/.test(String(t));
        const good = /\+\d|送来了|提到/.test(String(t));
        const cls = bad ? 'fd-bad' : (good ? 'fd-good' : 'fd-mid');
        return '<div class="fd-row ' + cls + '">' + esc(String(t)) + '</div>';
      }).join('');
      d.innerHTML = '<div class="fd-head">' + esc(fr.name || '命运') + ' 对你——</div>' + rows;
      d.classList.add('on');
      if (fateDeltaTimer) clearTimeout(fateDeltaTimer);
      fateDeltaTimer = setTimeout(function () {
        d.classList.remove('on');
        setTimeout(function () { if (d && !d.classList.contains('on')) d.innerHTML = ''; }, 320);
      }, 1600);
    } catch (e) { console.error('fateDelta', e); }
  }

  function setBgEdit(on) {
    S.bgEdit = !!on;
    if (S.bgEdit && !S.bgPos) S.bgPos = { x: 50, y: 50 };
    refreshBgHud();
  }
  let bgPushTimer = null;
  function pushBgPos() {
    if (bgPushTimer) return;
    bgPushTimer = setTimeout(function () {
      bgPushTimer = null;
      const p = S.bgPos || { x: 50, y: 50, dim: 0 };
      try { S.sock.emit('island:op', { code: S.code, type: 'bgpos', isl: S.lastIsland || '', x: p.x, y: p.y, dim: Number(p.dim || 0) }); } catch (e) {}
    }, 140);
  }

  /* ===== v91：选人界面 ===== */
  function charPickHTML(st) {
    const chars = st.chars || [];
    const mine = S.preChar || st.charId || '';
    const cards = chars.map((c) => {
      const on = c.id === mine ? ' on' : '';
      const lock = c.locked ? ' locked' : '';
      const picked = (st.players || []).filter((p) => p.charId === c.id);
      const takenByOther = picked.some((p) => !p.isMe);
      const by = picked.length
        ? '<i class="cp-by">' + picked.map((p) => esc((takenByOther ? '被 ' : '') + p.name)).join('、') + '</i>'
        : '';
      const nm = c.disp || c.name;
      const mc = st.modeCfg || { maxHp: 5, startHp: 4, maxSat: 5, startSat: 3 };
      const dd = c.d || { hpMax: 0, hpStart: 0, satMax: 0, satStart: 0 };
      const eHpMax = Math.max(1, (mc.maxHp || 5) + dd.hpMax);
      const eSatMax = Math.max(1, (mc.maxSat || 5) + dd.satMax);
      const eHp = Math.min(eHpMax, Math.max(0, (mc.startHp || 4) + dd.hpStart));
      const eSat = Math.min(eSatMax, Math.max(0, (mc.startSat || 3) + dd.satStart));
      const hearts = (() => {
        let h = '';
        for (let k = 0; k < eHpMax; k++) h += '<i class="h' + (k < eHp ? '' : ' off') + '"></i>';
        return h;
      })();
      const dots = (() => {
        let h = '';
        for (let k = 0; k < eSatMax; k++) h += '<i class="d' + (k < eSat ? '' : ' off') + '"></i>';
        return h;
      })();
      const panel = c.locked ? '' : '<i class="cp-panel"><span class="cp-hp">' + hearts + '</span><span class="cp-sat">' + dots + '</span></i>';
      const fig = c.locked
        ? '<div class="cp-fig cp-none"><img src="ui/chars/' + c.id + '.png" alt=""></div>'
        : '<div class="cp-fig"><img src="ui/chars/' + c.id + '.png" alt=""></div>';
      const stamped = (c.id === mine && st.me && st.me.pickOk) ? ' stamped' : '';
      const taken = (!c.locked && takenByOther && c.id !== mine) ? ' taken' : '';
      const psel = (S.preChar && S.preChar === c.id && st.charId !== c.id) ? ' psel' : '';
      return '<div class="chcard' + on + lock + taken + psel + '" data-char="' + c.id + '" data-tip="' + esc(c.tip || '') + '">' +
        fig +
        (c.title ? '<i class="cp-title">' + esc(c.title) + '</i>' : '') +
        '<b class="cp-name">' + esc(nm) + '</b>' +
        panel + by +
        '</div>';
    }).join('');
    const need = st.modeNeed || 3;
    const n = st.playerCount || 0;
    const noPick = (st.players || []).filter((p) => !p.charId).map((p) => p.charDisp || p.name);
    const modes = st.isHost
      ? '<div class="cp-modes">' + ['solo', 'duo', 'trio'].map((m) => {
        const nm = m === 'solo' ? '单人' : (m === 'duo' ? '双人' : '三人');
        return '<button class="cp-mode' + (st.mode === m ? ' on' : '') + '" data-mode="' + m + '">' + nm + '</button>';
      }).join('') + '</div>'
      : '';
    const meId = (st.me && st.me.id) || '';
    const meP = (st.players || []).find((x) => x.id === meId) || {};
    const meOk = !!meP.pickOk;
    const dis2 = (!meP.charId || meOk) ? ' disabled' : '';
    const why = n < need ? '还差 ' + (need - n) + ' 人' : '';
    let foot = modes + '<div class="cp-foot"><span class="cp-count">' + (st.modeName || '三人') + '模式 · 当前 ' + n + '/' + need + ' 人' +
      ' · 已确认 ' + (st.players || []).filter((x) => x.pickOk).length + '/' + n + '</span>' +
      (why ? '<span class="cp-why">' + esc(why) + '</span>' : '') +
      '<button class="cp-start"' + dis2 + '>' + (meOk ? '等待其他人…' : '确认') + '</button></div>';
    const slots = (st.players || []).map((pl) => {
      const cn = pl.charDisp && pl.charDisp !== '？？？' ? pl.charDisp : '';
      const isMe = pl.id === meId;
      return '<div class="cpslot' + (isMe ? ' on' : '') + (pl.pickOk ? ' ok' : '') + '">' +
        (cn ? '<img src="ui/chars/' + esc(pl.charId) + '.png" alt="">' : '<i class="cpq">?</i>') +
        '<span class="cpn">' + esc(pl.name) + '</span>' +
        (pl.pickOk ? '<b class="cok">✓</b>' : '') + '</div>';
    }).join('');
    if (!st.picking) {
      const cnt = '<div class="cp-foot"><span class="cp-count">' + (st.modeName || '三人') + '模式 · 当前 ' + n + '/' + need + ' 人</span>' +
        (st.isHost ? '<button class="cp-begin"' + (n < need ? ' disabled' : '') + '>开始游戏</button>'
          : '<span class="cp-why">等房主开始</span>') + '</div>';
      return '<div class="cp-wrap"><div class="cp-rolled"><i class="roll-l"></i><i class="roll-r"></i></div>' + modes + cnt + '</div>';
    }
    return '<div class="cp-scroll"><div class="cp-head">请选择你的角色</div>' +
      '<div class="cp-slots">' + slots + '</div>' +
      '<div class="cp-grid">' + cards + '</div>' + foot + '</div>';
  }


  /* 「开始游戏」大字：只有房主点开始才播，5 秒后散开，再真正开局 */
  function playStartIntro(cb) {
    if (window.__starting) return;
    window.__starting = 1;
    const box = document.getElementById('charPick');
    if (!box) { cb(); return; }
    let iv = box.querySelector('.cp-intro');
    if (!iv) {
      iv = document.createElement('div');
      iv.className = 'cp-intro';
      iv.innerHTML = '<span>开</span><span>始</span><span>游</span><span>戏</span>';
      box.appendChild(iv);
    }
    box.classList.add('intro');
    setTimeout(() => { box.classList.add('scatter'); }, 5000);
    setTimeout(() => { cb(); }, 5900);
  }

  function renderCharPick(st) {
    let box = document.getElementById('charPick');
    if (st.started) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = 'charPick';
      box.className = 'charpick';
      document.body.appendChild(box);
      box.addEventListener('click', (ev) => {
        const card = ev.target.closest && ev.target.closest('.chcard');
        if (card) {
          if (card.classList.contains('locked')) return;
          if (card.classList.contains('taken')) { toast('这个角色已经被人选走了，换一个吧'); return; }
          const stNow = S.st || {};
          const meP = (stNow.players || []).filter(function (x) { return x && x.isMe; })[0] || {};
          if (meP.pickOk) { toast('已经锁定了，等其他人…'); return; }
          const cid = card.dataset.char || '';
          if (!cid) return;
          if (stNow.charId === cid) { toast('已经锁定这个角色了'); return; }
          if (S.preChar === cid) {          /* 再点同一张 = 锁定，这时公告栏才更新 */
            S.preChar = '';
            op({ type: 'pickchar', char: cid });
            return;
          }
          S.preChar = cid;                  /* 第一次点 = 只是本地预选，别人看不到、公告不动 */
          /* 开场动画期间 renderCharPick 会早退，这里直接把高亮打到已经存在的卡面上 */
          document.querySelectorAll('#charPick .chcard').forEach(function (n) {
            const isIt = n.dataset.char === cid;
            n.classList.toggle('psel', isIt && S.st && S.st.charId !== cid);
            if (isIt) n.classList.add('on');
          });
          if (typeof renderCharPick === 'function') renderCharPick(S.st);
          toast('已预选，再点一次同一张才算锁定');
          return;
        }
        const mb = ev.target.closest && ev.target.closest('.cp-mode');
        if (mb) { op({ type: 'setmode', mode: mb.dataset.mode }); return; }
        const sb = ev.target.closest && ev.target.closest('.cp-start');
        if (sb && !sb.disabled) { op({ type: 'confirmpick' }); return; }
        const bb = ev.target.closest && ev.target.closest('.cp-begin');
        if (bb && !bb.disabled) { op({ type: 'beginpick' }); return; }
      });
    }
    if (!st.picking) {
      window.__pickStarted = 0;
      window.__pickAnim = 0;
      box.className = 'charpick';
      box.innerHTML = charPickHTML(st);
      return;
    }
    if (st.picking && !window.__pickStarted) {
      window.__pickStarted = 1;
      window.__pickAnim = 1;
      box.innerHTML = '<div class="cp-intro"><span>开</span><span>始</span><span>游</span><span>戏</span></div>' + charPickHTML(st);
      box.classList.add('intro');
      setTimeout(() => { box.classList.add('scatter'); }, 5000);
      setTimeout(() => {
        box.classList.remove('intro', 'scatter');
        box.classList.add('unrolled');
        window.__pickAnim = 0;
        const iv = box.querySelector('.cp-intro');
        if (iv) iv.remove();
        /* 开场动画结束后按最新状态重绘一次（预选高亮、别人已选的角色） */
        if (S.st && S.st.picking && !S.st.started) { try { renderCharPick(S.st); } catch (_) { /* 忽略 */ } }
      }, 5900);
      return;
    }
    if (window.__pickAnim) return;
    box.innerHTML = charPickHTML(st);
  }

  /* ================= v227：外岛交付 / 交付页 ================= */
  const ISLE_KIND_CN = { food: '食物', material: '材料', blueprint: '图纸', item: '物品', equip: '装备', npc: '同伴' };
  function pName(st, id) {
    const q = pcById(st, id);
    return (q && q.name) || '有人';
  }
  function isleIconHtml(kind, key) {
    if (kind === 'npc') return '<img src="' + (NPC_FACE[key] || '') + '" alt="">';
    if (kind === 'blueprint') return (ICONS[key] || '📜');
    if (kind === 'material') return (MAT_ICON[key] || '·');
    return '<img src="icons/' + esc(key) + '.png" alt="" onerror="this.style.visibility=\'hidden\'">';
  }
  function isleItemHTML(x, gray) {
    const nm = (ISLE_KIND_CN[x.kind] || '') + '：' + x.name + ' ×' + x.qty;
    return '<div class="io-item' + (gray ? ' gray' : '') + '" title="' + esc(nm) + '">' +
      '<i class="io-ico">' + isleIconHtml(x.kind, x.key) + '</i>' +
      '<b class="io-name">' + esc(x.name) + '</b><span class="io-qty">×' + x.qty + '</span></div>';
  }
  function isleNeedCount(of) {
    return (of && of.need ? of.need : []).reduce(function (n, x) { return n + (x.qty || 0); }, 0);
  }
  function isPicked(id) {
    if ((S.isleSel || []).indexOf(id) >= 0) return true;
    return S.sel === id;
  }
  /* 别人在发动技能 / 分药时，其他人不能操作 */
  function busyText(st) {
    const me = st && st.me;
    if (!me) return '';
    const dn = (st.dawn || {});
    if (st.phase === 'dawn' && dn.pid && dn.pid !== me.id) {
      const nm = dn.name || '有人';
      if (dn.step === 'med') return nm + ' 正在分配药品…';
      if (dn.step === 'wx') return nm + ' 正在试着改天气…';
      if (dn.step === 'tixi') return nm + ' 正在想明天先找什么…';
      return nm + ' 正在忙…';
    }
    if (st.phase === 'dawn') return '';
    if (st.wxAsk && st.wxAsk.pid !== me.id) return (st.wxAsk.name || '乌姆') + ' 正在试着改天气…';
    if (st.tixiAsk && st.tixiAsk.pid !== me.id) return (st.tixiAsk.name || '缇西') + ' 正在想明天先找什么…';
    if (st.fate && (st.fate.left || 0) > 0) return '有人正在和「' + (st.fate.name || '命运人物') + '」对话…';
    return '';
  }
  function paintBusy(st) {
    const txt = busyText(st);
    let box = document.getElementById('busyLock');
    if (!txt) { if (box && box.parentNode) box.parentNode.removeChild(box); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'busyLock';
      box.className = 'busy-lock';
      box.innerHTML = '<div class="bl-card"><b class="bl-txt"></b><span class="bl-sub">等他（她）做完，大家再一起动</span></div>';
      document.body.appendChild(box);
    }
    const t = box.querySelector('.bl-txt');
    if (t && t.textContent !== txt) t.textContent = txt;
  }
  /* v229：外岛交付 —— 先用原样「交付」停 2 秒 → 汽笛 → 裂开变灰 → 碎块掉落 → 「外岛交付」从右滑入 → 整体淡出 → 才给单据 */
  function isleOfferFx(st) {
    if (!(st && st.phase === 'trade' && st.isleOffer)) return;
    if (!st.day || S.isleFxDay === st.day) return;
    if (S.isleFxActive || document.getElementById('isleFx')) return;
    S.isleFxDay = st.day;
    S.isleFxActive = true;
    S.isleFxDone = false;
    const wrap = document.createElement('div');
    wrap.id = 'isleFx';
    wrap.className = 'isle-fx';
    wrap.innerHTML = '<div class="ifx-word ifx-first"><div class="bb-main">交付</div></div>';
    document.body.appendChild(wrap);
    /* 2.0s：汽笛；2.96s：字裂开变灰；3.42s：碎块掉落；3.82s：「外岛交付」从右滑入；5.7s：整体淡出；6.5s：清场并放出单据 */
    setTimeout(function () { try { SFXW.play('ship', 0.98); } catch (e) {} }, 2000);
    setTimeout(function () {
      const first = wrap.querySelector('.ifx-first');
      if (first) first.classList.add('crack');
    }, 2960);
    setTimeout(function () { shatterWord(wrap); }, 3420);
    setTimeout(function () {
      if (!wrap.parentNode) return;
      const second = document.createElement('div');
      second.className = 'ifx-word ifx-second';
      second.textContent = '外岛交付';
      wrap.appendChild(second);
      void second.offsetWidth;
      second.classList.add('on');
    }, 3820);
    setTimeout(function () {
      const second = wrap.querySelector('.ifx-second');
      if (second) second.classList.add('gone');
    }, 5700);
    setTimeout(function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      S.isleFxActive = false;
      S.isleFxDone = true;
      try { if (S.st) render(S.st); } catch (e) {}
    }, 6500);
  }
  function shatterWord(wrap) {
    if (!wrap || !wrap.parentNode) return;
    const first = wrap.querySelector('.ifx-first');
    if (!first) return;
    const rect = first.getBoundingClientRect();
    first.style.opacity = '0';
    const cols = 4, rows = 2;
    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        const sh = document.createElement('div');
        sh.className = 'ifx-shard';
        sh.style.left = rect.left + 'px';
        sh.style.top = rect.top + 'px';
        sh.style.width = rect.width + 'px';
        sh.style.height = rect.height + 'px';
        sh.style.clipPath = 'inset(' + (ry * 50) + '% ' + ((cols - cx - 1) * 25) + '% ' +
          ((rows - ry - 1) * 50) + '% ' + (cx * 25) + '%)';
        sh.innerHTML = '<div class="ifx-in">交付</div>';
        sh.style.filter = 'grayscale(1) brightness(.62)';
        sh.style.setProperty('--dx', ((cx - 1.5) * 46 + (Math.random() * 30 - 15)).toFixed(1) + 'px');
        sh.style.setProperty('--dy', ((ry === 0 ? -1 : 1) * (46 + Math.random() * 70)).toFixed(1) + 'px');
        sh.style.setProperty('--rot', (Math.random() * 46 - 23).toFixed(1) + 'deg');
        sh.style.animationDelay = (Math.random() * 90).toFixed(0) + 'ms';
        wrap.appendChild(sh);
      }
    }
  }

  function render(st) {
    /* 顶栏 */
    const islNow = st.island || '瓦格';
    if (S.lastIsland == null) { S.lastIsland = islNow; el('islandName').textContent = islNow; }
    else if (S.lastIsland !== islNow) {
      S.lastIsland = islNow;
      islandSwitchFx(islNow, ISL_KEY[String(islNow)] || '');
    }
    renderCharPick(st);
    renderResearch(st);
    try { renderJob(st); } catch (e) { console.error('job', e); }
    el('dayLabel').textContent = '第 ' + st.day + ' 天 / 21 · 第 ' + st.week + ' 周';
    el('dayLabel').className = 'day-label wk' + Math.max(1, Math.min(3, Number(st.week) || 1));
    el('weatherStrip').innerHTML = (st.days || []).map((d) => {
      if (d.passed) {
        const pk = typeof d.w === 'string' ? d.w : ((d.w && d.w.key) || 'clear');
        return '<div class="wcell w-' + pk + ' passed"><div class="wico">' + (WICON[pk] || '') + '</div><div class="wno">第' + d.day + '天</div></div>';
      }
      if (!d.w) {
        return '<div class="wcell unknown' + (d.today ? ' today' : '') + '">' +
          (d.today ? '<i class="wptr"></i>' : '') +
          '<div class="wico wq">？</div><div class="wno">第' + d.day + '天</div></div>';
      }
      const k = typeof d.w === 'string' ? d.w : (d.w.key || 'clear');
      const wname = typeof d.w === 'string' ? (WNAME[k] || k) : (d.w.name || WNAME[k] || k);
      return '<div class="wcell w-' + k + (d.today ? ' today' : '') + (d.mon ? ' monster' : '') + '">' +
        (d.today ? '<i class="wptr"></i>' : '') +
        '<div class="wico">' + (WICON[k] || WICON.clear) + '</div>' +
        '<div class="wlabel">' + esc(wname) + '</div>' +
        '<div class="wno">第' + d.day + '天</div>' +
        (d.mon ? '<em class="wmon">野怪</em>' : '') + '</div>';
    }).join('');
    el('phaseChip').textContent = st.phaseName || PHASE_CN[st.phase] || st.phase;
    if (!S.feedSeen) S.feedSeen = {};
    (st.feed || []).forEach(function (it) {
      if (!it || !it.id || S.feedSeen[it.id]) return;
      S.feedSeen[it.id] = 1;
      pushFeedToast(it);
    });
    document.body.classList.toggle('fighting', !!st.fight || st.phase === 'fight');

    /* v164：四类产出音效由服务端广播（horn/bubble/clank/snare），全房间每人各播一遍。
       按 kind+at 去重，同类 1 秒内只响一次，避免叠成噪音。 */
    if (Array.isArray(st.sfx) && st.sfx.length) {
      const VOL = { horn: 0.385, bubble: 0.5, clank: 0.55, snare: 0.5 };
      st.sfx.forEach((ev) => {
        if (!ev || !ev.kind || !ev.at) return;
        const key = ev.kind + ':' + ev.at;
        if (S.sfxSeen[key]) return;
        S.sfxSeen[key] = 1;
        if (!st.started || !VOL[ev.kind]) return;
        try { SFXW.play(ev.kind, VOL[ev.kind], 1000); } catch (e) {}
      });
      const keys = Object.keys(S.sfxSeen);
      if (keys.length > 60) keys.slice(0, keys.length - 30).forEach((k) => { delete S.sfxSeen[k]; });
    }

    /* 每天开始 + 阶段切换的大字动画
       v162：整套开场（天数+清晨+探索）只在「全员选完角色、真开局了」之后才播；
       等人 / 选角色阶段一个字都不出现。 */
    if (st.started && !st.picking && !S.startedSeen) {
      S.startedSeen = true;
      S.lastDay = st.day;
      S.lastPhase = st.fight ? 'fight' : st.phase;
      openingSeq(st);
    }
    if (S.lastDay !== st.day) {
      const firstTime = S.lastDay == null;
      S.dawnReady = 0;   /* v188：换天了，等新一天的「清晨」播完再放分药窗 */
      S.lastDay = st.day;
      if (!S.opening && st.started && !st.picking && st.day > 1 && st.phase === 'dawn') {
        /* v169：整队直接睡的换天一过场（黑下来 → 2.5s → 亮起来 → 才播第 N 天/清晨）。
           有人外出过就还是原来的口径，直接进清晨。 */
        const fromNight = (S.lastPhase === 'night' || S.lastPhase === 'nightbuild');
        const anyOut = (st.players || []).some((p) => p && p.nightMode === 'out');
        if (fromNight && !anyOut) nightDawnSeq(function (fade) { openingSeq(st, true, fade); });
        else openingSeq(st, true);
      } else if (!S.opening && st.started && !st.picking && (!firstTime || st.day > 1)) dayIntro(st);
    }
    const ph = st.fight ? 'fight' : st.phase;
    /* 队列里换人了：标题/弹窗要跟着换，不能沿用上一张的“已选”状态 */
    if (st.fate && st.fate.id !== S.fateId) { S.fateId = st.fate.id; S.fateShown = false; S.gadeShown = false; }
    if (st.fate && st.fate.mine && !st.fate.decided && !S.fateShown) { S.fateShown = true; openFate(); }
    /* 盖德：所有人都弹窗，只有翻出来的人能选；他没选之前弹窗不关 */
    if (st.fate && st.fate.gade && !st.fate.mine && !S.gadeShown) { S.gadeShown = true; openFate(); }
    if (st.fateResults && st.fateResults.at !== S.fateResSeen) {
      S.fateResSeen = st.fateResults.at;
      showFateDelta(st.fateResults);
    }
    if (!st.fate) {
      S.fateShown = false;
      if (S.gadeShown) { S.gadeShown = false; closeModal(); }
    }
    if (st.phase === 'night' && st.me && !st.me.nightDone && !S.nightShown && !S.mealBufOpen && !(st.tixiAsk && !st.tixiAsk.done)) {
      if (!(st.fate && st.fate.mine)) { S.nightShown = true; openNight(); }
    }
    if (st.phase !== 'night') S.nightShown = false;
    /* v169：夜深了横幅——夜里一直挂着，全员选完就收（不给它飞走） */
    if (st.phase === 'night') {
      const nightAll = (st.players || []).length > 0 && (st.players || []).every((p) => p && p.nightDone);
      if (nightAll) hideNightBanner(); else showNightBanner();
    } else if (st.phase !== 'nightbuild') {
      hideNightBanner();
    }
    /* v132：夜里带回来的东西不再弹窗，点动作区的「搜索」直接进手牌 */
    if (!(st.phase === 'night' && st.me && st.me.nightLoot && st.me.nightLoot.length)) S.lootShown = false;
    if (S.lastCookStep !== st.cookStep) {
      if (S.lastCookStep === 'cooking' && st.cookStep === 'serve') {
        try { SFX.ding(2); } catch (e) {}
        document.body.classList.add('served');
        setTimeout(function () { document.body.classList.remove('served'); }, 700);
      }
      S.lastCookStep = st.cookStep;
    }
    if (S.lastPhase !== ph) {
      const firstPhase = S.lastPhase == null;
      S.lastPhase = ph;
      if (!st.started) {
        /* v159：还没开局时，不播任何阶段大字（等人就好） */
      } else if (S.opening) {
        /* 开局过场期间不插播阶段大字；进了搜索阶段就把「探索」放出来 */
        if (S.openExplore) { try { S.openExplore(); } catch (e) {} }
      } else if (!firstPhase || ph === 'dawn') phaseIntro(ph);
      else if (ph === 'night') document.body.classList.add('night');
      /* 饱食度由服务端逐口结算，hpWatch 负责每一下跳动 */
    }
    if (S.lastWeatherShown !== (st.today && st.today.key)) {
      S.lastWeatherShown = st.today && st.today.key;
      /* v161：天气是全天常驻层；乌姆改完天气（today.key 变）立刻跟着换 */
      setDayWeather(st.today && st.today.key);
    }
    (function nightDim() {
      const mp = (st.players || []).find((p) => p && p.isMe) || null;
      const mode = (mp && mp.nightMode) || '';
      const isNight = st.phase === 'night' || st.phase === 'nightbuild';
      const sleeping = isNight && mp && mp.nightDone && mode !== 'out';
      if (!S.nightHold) document.body.classList.toggle('night', !!sleeping);
      const anyOut = isNight && (st.players || []).some((p) => p && p.nightMode === 'out');
      bodyOutDim(anyOut);
    })();
    S.isHost = !!st.isHost;
    if (st.bgPos) S.bgPos = { x: Number(st.bgPos.x), y: Number(st.bgPos.y), dim: Number(st.bgPos.dim || 0) };
    if (!S.islFx) document.body.dataset.island = ISL_KEY[String(st.island || '')] || String(st.island || '');
    const cb = st.common || {};
    /* 船是最终形态；草棚与木箱谁后造出来就用谁 */
    const shAt = (cb.shelter && cb.shelter.built) ? Number(cb.shelter.builtAt || 0) : -1;
    const chAt = (cb.chest && cb.chest.built) ? Number(cb.chest.builtAt || 0) : -1;
    const stage = (cb.boat && cb.boat.built) ? 'boat' : ((shAt < 0 && chAt < 0) ? '' : (chAt > shAt ? 'chest' : 'shelter'));
    if (S.islFx) { /* 过场中不改壁纸 */ } else if (stage) document.body.dataset.stage = stage; else delete document.body.dataset.stage;
    applyBgPosStyle();
    hpWatch(st);

    /* 日志面板贴到顶栏与预报行下面，避免压住天气框 */
    (function () {
      const tp = el('topbar'), fb = el('forecastBar'), lp = el('logPanel');
      if (tp && lp) {
        const b = tp.getBoundingClientRect().bottom;
        const fh = fb ? fb.getBoundingClientRect().height : 0;
        lp.style.top = Math.round(b + fh + 6) + 'px';
      }
    })();

    /* 预报 */
    el('forecastBar').innerHTML = '<span class="fc-today">今天是第 ' + st.day + ' 天 · <b>' + esc(st.today.name) + '</b>' +
      ' · 探索点 <b>' + st.today.sp + '</b> · 饱食 <b>-' + st.today.food + '</b></span>' +
      (st.forecast || []).slice(1).map((f) => '<span class="fc-item">第' + f.day + '天 <b>' + esc(f.name || '') + '</b></span>').join('');

    /* 六个座位：左上 seat0 / 中左 seat1 / 右下 seat2；左下 npc0 / 中右 npc1 / 右上 npc2 */
    const ps = (st.players || []).filter((p) => p && !p.isMe);
    ['seat1', 'seat2'].forEach((sid, i) => {
      const node = el(sid);
      if (!node) return;
      const p = ps[i];
      if (p) {
        node.className = 'seat-strip slot-in' + (p.isMe ? ' mine' : '') + (p.alive ? '' : ' dead');
        node.dataset.p = p.id;
        node.innerHTML = seatHTML(p) + wantBadge(p);
        node.style.boxShadow = pcOf(p) ? ('inset 3px 0 0 ' + pcOf(p)) : '';
      } else {
        delete node.dataset.p;
        node.className = 'seat-strip slot-in empty';
        node.textContent = '等待玩家 ' + (i + 1) + ' 加入…';
      }
    });
    ['npc0', 'npc1', 'npc2'].forEach((sid) => {
      const node = el(sid);
      if (!node) return;
      node.className = 'seat-strip npc-strip slot-in empty';
      node.textContent = '空位';
    });
    /* v181：先跑战斗特效（被动物伤会播「刺入」并记下时间），再跑受击抖动，
       这样受击抖动就知道这一下是动物咬的、不再叠一声脆雷击。 */
    applyFightFx(st);
    hitShake(st);
    (st.npcs || []).forEach((n) => {
      const node = el(String(n.slot || 'n2').replace(/^n/, 'npc'));
      if (!node) return;
      node.className = 'seat-strip npc-strip slot-in' + (n.alive ? '' : ' dead') +
      ((n.alive && n.want && S.st && (S.st.phase === 'build' || S.st.phase === 'nightbuild')) ? ' want-hot' : '');
      node.dataset.npc = n.key;
      node.dataset.p = n.id;
      node.innerHTML = npcStrip(n);
    });

    /* 中间公共区：怪物区 / 锅 / 箱子 / 公共物品 */
    const c = st.common || {};

    const mz = el('monsterZone');
    if (mz && st.phase === 'discard') {
      const dc = st.discardCards || [];
      const canTake = !!st.takeDiscard;
      mz.innerHTML = '<div class="cz-lab">弃牌区 · ' + (canTake
          ? '把手牌拖到这里丢掉；手没满时，点弃牌堆里的牌可以拿回手里'
          : '把手牌拖到这里丢掉（弃到上限就结束）') + '</div>' +
        '<div class="discard-zone dropzone' + (canTake ? ' can-take' : '') + '" id="discardDrop">' +
        (dc.length ? dc.map((c) => '<div class="dcard' + (canTake ? ' takeable' : '') + '"' +
          (canTake ? ' data-disctake="' + esc(c.id) + '" title="点一下拿回手里"' : '') + '>' +
          esc(c.label || c.name || '??') + '</div>').join('') : '<em class="dz-hint">拖牌到这里</em>') +
        '</div>';
      const cc = el('meHand');
      if (cc) cc.classList.add('discarding');
    } else if (mz) {
      if (st.fight && (st.fight.monsters || []).length) {
        /* v226：不再整块重建 —— 复用怪物节点，挨打「后仰」动画才不会被重绘抹掉 */
        paintMonsters(mz, st);
      } else if ((st.pendingFight || []).length) {
        mz.innerHTML = '<div class="cz-lab">怪物区 · 有东西在靠近</div>' +
          '<div class="cz-empty pending">' + st.pendingFight.map((nm) => '<b>' + esc(nm) + '</b>').join('、') +
          ' 正在靠近，点右下角「结束搜索」它就会扑上来</div>';
      } else {
        mz.innerHTML = '<div class="cz-lab">怪物区</div><div class="cz-empty">暂时没有野怪</div>';
      }
    }

    /* 地面拾取区：肉牛掉的大肉等，谁点谁拿 */
    const gz = el('groundZone');
    if (gz) {
      const gitems = st.ground || [];
      gz.hidden = !gitems.length;
      gz.innerHTML = gitems.length
        ? '<div class="gz-lab">地上掉落 · 点一下就能捡走</div><div class="gz-row">' +
          gitems.map((it) => '<div class="gz-card" data-ground="' + esc(it.id) + '" title="' + esc(it.name) + '">' +
            '<span class="gz-ico">' + (ICONS[it.key] || (it.kind === 'food' ? ICONS.meat : '❔')) + '</span><b>' + esc(it.name) + '</b></div>').join('') +
          '</div>'
        : '';
    }

    paintCenterZones(st);
    try { paintCookSel(st); } catch (e) {}
    paintPriestWant(st);
    /* v128：吃完才结算的负面 buff —— 先弹窗 + 服务端已写日志 + 该扣的血已扣 */
    if (st.mealBuffs && st.mealBuffs.at !== S.mealBufAt) {
      S.mealBufAt = st.mealBuffs.at;
      showMealBuffs(st.mealBuffs);
    }

    /* 战斗提示（怪物在中间怪物区，右键选打法） */
    const fb = el('fightBox');
    if (fb) {
      if (st.fight) {
        fb.hidden = false;
        const myTurn = !(st.fight.acted || []).includes(st.me && st.me.id) && !st.fight.settling;
        fb.innerHTML = '<div class="fight-title">' + (myTurn ? '轮到你出手：右键怪物' : (st.fight.settling ? '伤害结算中…' : '你和队友都出手了，等结算')) + '</div>';
      } else { fb.hidden = true; fb.innerHTML = ''; }
    }

    /* 就餐区 */
    /* v128 盛宴框（生成区）：做好的菜在这里以小卡牌出现，只能拖进就餐框，不会凭空消失 */
    const fbox = el('feasts');
    if (fbox) {
      const fl = st.feasts || [];
      fbox.hidden = false;
      fbox.innerHTML = '<div class="feast-lab">盛宴</div><div class="feast-row">' +
        (fl.length
          ? fl.map((f) => '<div class="feast-card' + (f.rich ? ' rich' : '') + '" data-feast="' + esc(f.id) + '" title="' + esc(f.name) + ' ' + calTxt(f) + '">' +
            '<img class="fc-img" src="' + dishImg(f) + '" alt="">' +
            (f.rich ? '<img class="fc-star s1" src="icons/star_gold.png?v=230" alt="">' +
              '<img class="fc-star s2" src="icons/star_gold.png?v=230" alt="">' : '') +
            '<b class="fc-name">' + esc(f.name) + '</b>' +
            '<em class="fc-cal">' + calTxt(f) + '</em></div>').join('')
          : '') +
        '</div>';
      fitFeastsWidth();   /* v168：宽度只到「怪物区右边界」为止 */
    }

    /* 自己 */
    const me = st.me;
    if (!me) {
      el('meName').textContent = '（未加入）';
      el('meActions').innerHTML = '';
      return;
    }
    el('meName').innerHTML = esc(me.name) + wantBadge(me);
    if (pcOf(me)) {
      el('meName').style.color = pcOf(me);
      if (el('me')) el('me').style.boxShadow = 'inset 3px 0 0 ' + pcOf(me);
    }
    if (el('meCharTitle')) el('meCharTitle').textContent = me.charTitle || '';
    if (el('meFace')) {
      if (me.charId) {
        /* v225：商人的技能改成搜索阶段的「做生意」按钮，点头像不再触发 */
        el('meFace').onclick = null;
        el('meFace').src = 'ui/chars/' + me.charId + '.png';
        el('meFace').hidden = false;
      } else {
        el('meFace').hidden = true;
      }
    }
    const meDead = !me.alive;
    if (el('me')) el('me').classList.toggle('isdead', meDead);
    /* v126：血量/饱食 = 一排爱心（心数=上限，亮=当前值） */
    syncHearts(el('meHp'), me.hp, me.maxHp, 'hp');
    syncHearts(el('meSat'), me.sat, me.maxSat, 'sat');
    el('meTags').innerHTML = tagsOf(me);
    el('mePoints').textContent = me.points;
    if (el('meHandCount')) {
      const allCards = (me.hand || []).filter(Boolean);
      const hc = allCards.filter((c) => !isJunk(c)).length, hl = me.handLimit || 5;
      const jn = allCards.filter(isJunk).length;
      el('meHandCount').textContent = hc + '/' + hl + (jn ? '　垃圾 ' + jn + '/2' : '');
      el('meHandCount').classList.toggle('over', hc > hl);
    }
    if (el('meCost')) el('meCost').textContent = me.cost;
    if (el('handCount')) el('handCount').textContent = meDead ? '倒下' : (me.handCount + '/' + (me.handLimit || 5));

    /* 动作按钮 */
    const acts = [];
    if (meDead) {
      const meEsc = !!me.escaped;
      el('meTags').innerHTML = meEsc ? '<span class="esc-tag">已撤离</span>' : '<span class="dead-tag">已阵亡</span>';
      el('meActions').innerHTML = meEsc
        ? '<span class="st-sub">你已经坐船离开了瓦格，东西都留在岛上了</span>'
        : '<span class="st-sub">你已经倒下了，只能看着队友打完这一局</span>';
      if (el('meHand')) el('meHand').innerHTML = '<span class="fallen">' + (meEsc ? '已撤离，手牌留在了岛上' : '已阵亡，手牌已经进弃牌堆') + '</span>';
      if (el('meEquip')) el('meEquip').innerHTML = '<span class="fallen">' + (meEsc ? '已撤离，装备留在了岛上' : '装备全部失去') + '</span>';
      /* 全员倒下时也必须把失败动画弹出来：原来这里直接 return，永远走不到后面的 showEnd */
      if (st.ended) showEnd(st.ended);
      return;
    }
    if (st.fate) {
      const f = st.fate;
      if (f.gade && !f.mine) acts.push('<span class="st-sub">' + esc(f.pname || '有人') + ' 翻出了' + esc(f.name) + '，' + esc(f.name) + ' 正在迎接他（只有他能决定）</span>');
      else if (!f.gade) acts.push('<span class="st-sub">' + esc(f.name) + ' 来了：' + (f.mine ? (f.decided ? '你已选择，等其他人…（还剩 ' + f.left + ' 人）' : '轮到你选择迎接 / 回绝') : '其他人在选择…') + '</span>');
      if (f.queued) acts.push('<span class="st-sub">后面还有 ' + f.queued + ' 位命运人物在排队，先逐个处理</span>');
    }
    const isMyTurnFight = st.fight && !(st.fight.acted || []).includes(me.id) && !st.fight.settling;
    if (!st.started) {
      acts.push('<span class="st-sub">' + esc(st.modeName || '三人') + '模式 · 当前 ' + (st.playerCount || 1) + '/' + (st.modeNeed || 3) + ' 人</span>');
      acts.push('<span class="st-sub">' + '等待房主确认游戏…' + '</span>');
    } else if (st.ended) acts.push('<span class="st-sub">本局已结束</span>');
    else if (st.fight && isMyTurnFight) acts.push('<span class="st-sub">战斗中，在中间选择出手</span>');
    else if (st.phase === 'dawn') {
      const dn = st.dawn || {};
      /* v178：乌姆改天气不再在右下角提示、也不在这里给选择 —— 清晨自动弹她的仪式框 */
      if (dn.step === 'wx') {
        acts.push('<span class="st-sub">清晨…</span>');
      } else if (dn.step === 'med') {
        if (dn.pid === me.id) {
          const medAll = (me.hand || []).filter((x) => x && x.kind === 'item' && (x.key === 'heal' || x.key === 'clean'));
          const nH = medAll.filter((y) => y.key === 'heal').length;
          const nC = medAll.filter((y) => y.key === 'clean').length;
          /* v226：用药只有中间那个大弹窗（点取消就是取消），右下角不再问一次 */
          acts.push('<span class="st-sub">清晨：手里有药（回血 ' + nH + ' · 清创 ' + nC + '），在弹窗里分药，点取消就跳过</span>');
        } else {
          acts.push('<span class="st-sub">' + esc(dn.name || '队友') + ' 正在给药，其他人稍等</span>');
        }
      } else {
        acts.push('<span class="st-sub">清晨…</span>');
      }
    } else if (st.phase === 'search' && dawnHold(st)) {
      /* v226：天还没亮透（「清晨」大字还在天上飞）—— 先不给搜索 */
      acts.push('<span class="st-sub">天刚亮，等「清晨」这行字飘走、天完全亮起来再动手…</span>');
    } else if (st.phase === 'search') {
      /* v225：商人「做生意」—— 明确的按钮，分数旁边写着要花多少饱食 */
      if (me.charId === 'hendler') {
        const hDone = !!me.hendlerToday;
        acts.push('<button class="btn-gold" data-act="hendler"' + (hDone ? ' disabled' : '') + ' title="' +
          (hDone ? '今天已经做过生意了' : '花 1~2 点饱食换两张牌（饱食现在就扣）') + '">' +
          (hDone ? '今天做过了' : '做生意') + '</button>');
      }
      /* v194/v209：学生可以「跳过搜索」，全队获得鼓舞；放在最前面，橙色 */
      if (me.charId === 'stud') acts.push('<button class="btn-orange" data-act="skipsearch"' + (me.searched ? ' disabled' : '') +
        ' title="' + (me.searched ? '今天已经搜索过了，鼓舞和搜索只能选一个' : '全体队友伤害 +1，直到明天清晨（今天就不能再搜索了）') + '">' +
        (me.searched ? '已搜索' : '跳过搜索') + '</button>');
      acts.push('<button class="primary" data-act="search"' + (me.searched || me.wound ? ' disabled' : '') + '>' +
        (me.searched ? '今天已搜索' : (me.wound ? '伤口不能搜索' : '搜索（' + me.points + ' 张）')) + '</button>');
      acts.push('<button class="phase-adv-btn" data-act="advance" data-autocd="1">' + '结束搜索' +
        (st.searchAutoAt ? '（' + Math.max(0, Math.ceil((st.searchAutoAt - Date.now()) / 1000)) + '）' : '') + '</button>');
    } else if (st.phase === 'trade') {
      acts.push('<span class="st-sub">在下面把卡放进交易框，双方都确认后互换</span>');
      acts.push('<button data-act="advance">结束交付</button>');
    } else if (st.phase === 'build') {
      if (st.research) {
        /* v138：建造阶段一开始学者就在炼药，他确认之前大家只能看着 */
        const mineRs = st.research.pid === me.id;
        acts.push('<span class="st-sub">' + esc(st.research.name || '学者') + ' 正在炼药，' +
          (mineRs ? '先完成研制（弹窗里选两张牌确认）' : '等他确认后大家才能动手') + '</span>');
        acts.push('<button data-act="advance" disabled>结束建造</button>');
      } else {
        /* v162：不再在右下角提示「点图纸开始建造」 */
        acts.push('<button data-act="advance">结束建造</button>');
      }
    } else if (st.phase === 'cook') {
      const foodSel = (me.hand || []).some((x) => x && x.kind === 'food');
      if (st.cookStep === 'serve') {
        const nEat = (me.eat || []).length;
        acts.push('<button class="primary" data-act="serveok"' + (me.serveOk ? ' disabled' : '') + '>' +
          (me.serveOk ? '已确认吃饭' : ('确认吃饭' + (nEat ? '（' + nEat + ' 份）' : ''))) + '</button>');
        acts.push('<span class="st-sub">' + (nEat ? '点右边确认，大家就一起开吃' : '先把饭拖进自己的进食框') + '</span>');
      } else {
        acts.push('<button class="primary" data-act="cookok"' + (me.cookOk ? ' disabled' : '') + '>' + (me.cookOk ? '已确认烹饪' : '确认烹饪') + '</button>');
        /* v162：右下角不再提示「点食物卡 → 放入锅里」 */
      }
      acts.push('<button data-act="advance">结束烹饪</button>');
    } else if (st.phase === 'nightbuild') {
      /* v154：夜晚建造只等外出回来的人，没外出的人不用点 */
      if (me.nightMode === 'out') {
        acts.push('<span class="st-sub">夜晚建造阶段：点手牌里的图纸建造、把材料拖给图纸，建完或跳过这一天才会结束</span>');
        acts.push('<button class="primary" data-act="nightBuildDone"' + (me.nightBuildDone ? ' disabled' : '') + '>' +
          (me.nightBuildDone ? '已收工，等队友' : '建造完毕 / 跳过') + '</button>');
      } else {
        acts.push('<span class="st-sub">夜里外出的队友还在收整东西，这里不用你点，他们收工就会天亮</span>');
      }
    } else if (st.phase === 'night') {
      const lootN = (me.nightLoot || []).length;
      if (!me.nightDone && me.nightMode === 'out' && lootN) {
        acts.push('<button class="primary" data-act="nightSearch">搜索（带回 ' + lootN + ' 件）</button>');
        acts.push('<span class="st-sub">点「搜索」把夜里找到的东西收进手牌，然后点「下个阶段」</span>');
      } else if (!me.nightDone && me.nightMode === 'out') {
        acts.push('<button class="primary" data-act="nightNext">下个阶段</button>');
        acts.push('<span class="st-sub">东西已经在你手牌里了，点「下个阶段」进夜晚建造阶段</span>');
      } else {
        acts.push('<button class="primary" data-act="night"' + (me.nightDone ? ' disabled' : '') + '>' +
          (me.nightDone ? '已选择夜晚' : '选择夜晚行动') + '</button>');
      }
    } else if (st.phase === 'discard') {
      const over = (me.hand || []).filter((c) => c && !isJunk(c)).length - (me.handLimit || 5);
      acts.push('<span class="st-sub">' + (over > 0 ? '还要弃 ' + over + ' 张（点手牌弃掉）' : '已经合规，点右边结束') + '</span>');
      acts.push('<button class="primary" data-act="discardDone"' + (over > 0 || me.discardDone ? ' disabled' : '') + '>' +
        (me.discardDone ? '已弃牌' : '弃牌结束') + '</button>');
    }
    /* v177：夜里外出回来已经在「夜晚建造阶段」建过了，白天不再有补建造的提示 */
    if (st.common && st.common.boat && st.common.boat.built && !((st.common.ships || st.ships || []).length)) acts.push('<button class="ok" data-act="boat">登船离开</button>');
    if (st.fate) {
      for (let ai = 0; ai < acts.length; ai++) {
        if (acts[ai].indexOf('data-act="advance"') >= 0) {
          acts[ai] = acts[ai].replace('<button ', '<button disabled title="有人仍然和命运人物正在对话" ');
        }
      }
      acts.push('<span class="st-sub">有人仍然和命运人物正在对话…</span>');
    }
    el('meActions').innerHTML = acts.join('');
    if (me && me.alive === false && st.phase !== 'end') {
      el('meActions').innerHTML = '<span class=\'st-sub\'>你已经倒下了，不用再做选择</span>';
    }

    /* 装备栏 */
    el('meEquip').innerHTML = (me.equip || []).length
      ? me.equip.map((e) => (e.key === 'harpoon' || e.key === 'axe'
        ? '<div class="eq-tool" data-use="' + esc(e.key) + '" title="搜索阶段点一下就有收获">' + itemHTML(e) + '</div>'
        : itemHTML(e))).join('')
      : '<span class="st-sub" style="opacity:.45">空</span>';

    /* 手牌 */
    const handAll = (me.hand || []).filter(Boolean);
    const handReal = handAll.filter((c) => !isJunk(c));
    const handJunk = handAll.filter(isJunk);
    el('meHand').innerHTML = (handReal.map((c) => cardHTML(c)).join('') +
      (handJunk.length ? '<span class="hand-junk-sep">垃圾 ' + handJunk.length + '/2</span>' + handJunk.map((c) => cardHTML(c, 'junk')).join('') : '')) ||
      '<span class="st-sub" style="opacity:.45">没有手牌</span>';

    /* 交易区（v227：别人之间 → 我与别人 → 外岛交付） */
    const ta = el('tradeArea');
    if (st.phase === 'trade' && st.trade && (st.trade.pairs.length || st.isleOffer)) {
      ta.hidden = false;
      const mineList = [];
      const otherList = [];
      st.trade.pairs.forEach(function (pr) {
        if (pr.a !== me.id && pr.b !== me.id) {
          otherList.push('<div class="trade-pair' + (pr.done ? ' done' : '') + '"><div class="tp-head">' +
            '<span>' + esc(pName(st, pr.a)) + ' ⇄ ' + esc(pName(st, pr.b)) + '</span>' +
            '<span>' + (pr.done ? '已交换' : ((pr.okA && pr.okB) ? '正在交换' : '等他们商量')) + '</span></div>' +
            '<div class="tp-boxes"><div class="tp-box">' +
            ((pr.cardsA || []).map(function (c) { return cardHTML(c, 'mini'); }).join('') || '<span class="st-sub">空</span>') +
            '</div><div class="tp-box">' +
            ((pr.cardsB || []).map(function (c) { return cardHTML(c, 'mini'); }).join('') || '<span class="st-sub">空</span>') +
            '</div></div></div>');
          return;
        }
        const inA = pr.a === me.id;
        const otherId = inA ? pr.b : pr.a;
        const myCards = (inA ? pr.cardsA : pr.cardsB) || [];
        const hisCards = (inA ? pr.cardsB : pr.cardsA) || [];
        const myOk = inA ? pr.okA : pr.okB;
        const hisOk = inA ? pr.okB : pr.okA;
        const minePc = pcOf(me) || '';
        const otherPc = pcById(st, otherId) || '';
        const swapBtn = pr.done ? '' : '<button class="tp-swap" data-act="tradeok" data-pair="' + esc(pr.key) + '"' +
          (myOk || myCards.length !== hisCards.length ? ' disabled' : '') + ' title="确认交换">⇄</button>';
        mineList.push('<div class="trade-pair' + (pr.done ? ' done' : '') + '"><div class="tp-head">' +
          '<span>我 ⇄ ' + esc(pName(st, otherId)) + wantBadgeId(st, otherId) + '</span>' +
          '<span>' + (pr.done ? '已交换' : (myOk ? '已确认，等对方' : '点数要对等')) + '</span></div>' +
          '<div class="tp-boxes"><div class="tp-box mine' + (myOk ? ' ok' : '') + '" data-box="' + esc(pr.key) + '"' +
          (minePc ? ' style="border-color:' + minePc + '"' : '') + '>' +
          '<div class="tp-lab">我放的（' + myCards.length + '）' + wantBadge(me) + '</div>' +
          myCards.map(function (c) { return cardHTML(c, 'mini'); }).join('') + '</div>' + swapBtn +
          '<div class="tp-box' + (hisOk ? ' ok' : '') + '"' + (otherPc ? ' style="border-color:' + otherPc + '"' : '') + '>' +
          '<div class="tp-lab"' + (otherPc ? ' style="color:' + otherPc + '"' : '') + '>对方放的（' + hisCards.length + '）' +
          wantBadgeId(st, otherId) + '</div>' +
          hisCards.map(function (c) { return cardHTML(c, 'mini'); }).join('') + '</div></div>' +
          (pr.done ? '' : '<div class="tp-foot"><span class="st-sub">先点下面的东西挑起来，再点左边的框放进去</span></div>') + '</div>');
      });
      const of = st.isleOffer;
      const sel = S.isleSel || [];
      let isleHTML = '';
      if (of) {
        const needN = isleNeedCount(of);
        isleHTML = '<div class="isle-offer' + (sel.length === needN ? ' ready' : '') + '">' +
          '<div class="io-title">外岛交付</div>' +
          '<div class="io-row">' +
            '<div class="io-side">' +
              '<div class="io-lab">' + esc(of.myName || '') + ' · 我们要给的</div>' +
              '<div class="io-items req" data-isle-box="1">' +
                (of.need || []).map(function (x) { return isleItemHTML(x, true); }).join('') +
              '</div>' +
            '</div>' +
            '<div class="io-arrow">⇄</div>' +
            '<div class="io-side">' +
              '<div class="io-lab">' + esc(of.fromName || '') + ' · 他们给的</div>' +
              '<div class="io-items give">' +
                (of.give || []).map(function (x) { return isleItemHTML(x, false); }).join('') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="io-foot"><span class="io-sel">已挑 ' + sel.length + ' / ' + needN + '</span>' +
            '<button class="io-btn" data-act="isleDeal"' + (sel.length === needN && needN > 0 ? '' : ' disabled') + '>交给他</button>' +
            '<button class="io-btn ghost" data-act="isleRefuse">不做这笔</button></div>' +
          '</div>';
      }
      const trayCards = [];
      (me.equip || []).forEach(function (e) {
        trayCards.push({ id: 'E' + e.id, kind: 'equip', key: e.key, name: e.name, dur: e.dur, maxDur: e.maxDur });
      });
      (me.hand || []).forEach(function (c) { if (c) trayCards.push(c); });
      const trayHTML = trayCards.map(function (c) {
        return '<div class="tt-item' + (isPicked(c.id) ? ' sel' : '') + '" data-pick="' + esc(c.id) + '">' +
          cardHTML(c, 'mini') + '</div>';
      }).join('');
      ta.innerHTML = '<div class="trade-split">' +
          '<div class="trade-col other">' + (otherList.join('') || '<div class="st-sub" style="opacity:.4">别人之间的交换</div>') + '</div>' +
          '<div class="trade-col mine">' + (mineList.join('') || '<div class="st-sub" style="opacity:.4">你和别人的交换</div>') + '</div>' +
          ((of && S.isleFxDone && !S.isleFxActive) ? '<div class="trade-col isle">' + isleHTML + '</div>' : '') +
        '</div>' +
        '<div class="trade-tray"><div class="tt-lab">我的东西（含装备）—— 点一下挑起来，再点框放进去</div>' +
          '<div class="tt-items">' + (trayHTML || '<span class="st-sub" style="opacity:.45">手上没东西</span>') + '</div></div>';
    } else {
      ta.hidden = true;
      ta.innerHTML = '';
    }

    paintBusy(st);
    isleOfferFx(st);

    /* 日志 */
    el('logList').innerHTML = (st.log || []).map((x) => {
      const tone = x && x.tone ? ' log-' + x.tone : '';
      return '<div class="logline' + tone + '">' + esc(typeof x === 'string' ? x : (x && x.msg) || '') + '</div>';
    }).join('');

    /* 早上：只要手里有药，就弹中间的选择窗（三个人 × 红/蓝药瓶，选几个人扣几瓶） */
    const medCards = (me.hand || []).filter((x) => x && x.kind === 'item' && (x.key === 'heal' || x.key === 'clean'));
    const medKey = 'med:' + st.day + ':' + me.id;
    /* v189：兜底——万一这一天的「清晨」大字没播（重连/调试跳天），6 秒后也要把分药窗放出来，别卡住流程 */
    if (st.phase === 'dawn' && st.dawn && st.dawn.step === 'med' && st.dawn.pid === me.id && medCards.length &&
        !S.medAsked[medKey] && !S.modalShown && S.dawnReady !== st.day) {
      if (!S.medFallback || S.medFallback.key !== medKey) {
        S.medFallback = { key: medKey };
        setTimeout(function () {
          const st2 = S.st;
          if (!st2 || st2.phase !== 'dawn' || !st2.dawn || st2.dawn.step !== 'med') return;
          if (S.dawnReady === st2.day) return;
          S.dawnReady = st2.day;
          try { render(st2); } catch (e) {}
        }, 6000);
      }
    }
    if (st.phase === 'dawn' && st.dawn && st.dawn.step === 'med' && st.dawn.pid === me.id && medCards.length && !S.medAsked[medKey] && !S.modalShown && S.dawnReady === st.day) {
      S.medAsked[medKey] = true;
      S.medSel = { day: st.day, heal: [], clean: [] };
      openMedPanel();
    }

    /* v233：别人分药的提示统一由全屏遮罩（busyLock）负责，不再额外弹一个小框 */
    paintMedWait(st);
    /* 结束 */
    paintLoot(st);
    if (st.ended) showEnd(st.ended);
    else if (S.endShown) { /* 重新开局了：把结束画面收走 */
      S.endShown = false;
      const ov = document.getElementById('endOverlay');
      if (ov) { ov.classList.remove('on'); setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 260); }
    }
  }

  function nameOf(st, id) {
    const p = (st.players || []).find((x) => x.id === id);
    return p ? p.name : '？';
  }
  function myCardsHTML(st, cards) {
    return (cards || []).filter(Boolean).map((c) => cardHTML(c, 'mini')).join('') || '<span class="st-sub" style="opacity:.4">空</span>';
  }

  /* ---------------- 弹窗 ---------------- */
  let modalResolve = null;
  
/* ===== v113：角色技能界面 ===== */
const WX_CN = { clear: '晴朗', rain: '下雨', fog: '雾天', storm: '雷雨', hot: '炎日' };
let S_wxShown = 0, S_wxSeen = 0, S_tixiShown = false, S_witchShown = 0;

function wxIcon(key) {
  return { clear: '☀️', rain: '🌧️', fog: '🌫️', storm: '⛈️', hot: '🔥' }[key] || '☀️';
}

function roleUI(st) {
  if (!st || !st.me) return;
  /* v234：老巫婆清晨来访 —— 只有被找上的人弹框 */
  if (st.witch && st.witch.mine && S_witchShown !== (st.day || 0)) {
    S_witchShown = st.day || 0;
    showModal('<div class="witch-modal">' +
      '<div class="witch-face"><img src="ui/event/witch.png" alt="老巫婆"></div>' +
      '<h3>老巫婆来了</h3>' +
      '<p>「小家伙，要不要试试我新研制的魔法？」她把一只冒泡的小瓶子举到你面前。</p>' +
      '<p class="st-sub">拒绝的话，她可能会不高兴（25% 概率 -1 生命）。</p>' +
      '<p class="st-sub">答应的话：一半机会今天一张卡都抽不到、明天翻倍；另一半今天翻倍、明天一张都抽不到。</p>' +
      '<div class="modal-row">' +
      '<button class="primary" data-act="witchYes">喝下去</button>' +
      '<button data-act="witchNo">拒绝她</button>' +
      '</div></div>');
  }
  /* 老奶奶：起床选天气 */
  if (st.wxAsk && st.me.id === st.wxAsk.pid && S_wxShown !== (st.day || 0)) {
    S_wxShown = st.day || 0;
    const keys = ['clear', 'rain', 'fog', 'storm', 'hot'];
    /* v171：先把「第 N 天 / 清晨」亮 1 秒，再弹老奶奶的仪式框；
       框出来 1.5 秒后，让天上那行字自己慢慢变淡飞走（她选她的，不互相挡）
       v173：天亮可能是「慢慢黑 → 慢慢亮 → 再出字」，必须等那行字真的出来了再数这 1 秒 */
    const armAt = Date.now();
    const waitSeq = setInterval(function () {
      if (!S.st || !S.st.wxAsk || S.st.wxAsk.pid !== S.st.me.id) { clearInterval(waitSeq); return; }
      if (!document.getElementById('openSeq')) { if (Date.now() - armAt > 16000) clearInterval(waitSeq); return; }
      clearInterval(waitSeq);
      setTimeout(function () {
        if (!S.st || !S.st.wxAsk || S.st.wxAsk.pid !== S.st.me.id) return;
        let html = '<h3>老奶奶的起床仪式</h3>';
        html += '<p class="st-sub">你想让今天的天气变成什么？</p>';
        html += '<div class="modal-row wx-row">';
        keys.forEach(function (k) {
          html += '<button class="wx-btn" data-wxpick="' + k + '">' + wxIcon(k) + '<b>' + WX_CN[k] + '</b></button>';
        });
        html += '</div>';
        html += '<div class="modal-row"><button data-act="wxSkip">今天不改了</button></div>';
        showModal(html);
        /* 框一出来就把天上那行字抬上去，1.5s 内两边都看得见，之后那行字自己慢慢飞走 */
        const osBox = document.getElementById('openSeq');
        if (osBox) osBox.classList.add('lift');
        setTimeout(function () {
          if (typeof S.openSeqDismiss === 'function') S.openSeqDismiss(600);
        }, 1500);
      }, 1000);
    }, 100);
  }
  /* 天气变化结果：成功播过渡动画 */
  const wd = st.wxDone;
  if (wd && wd.at && wd.at !== S_wxSeen) {
    S_wxSeen = wd.at;
    if (wd.ok) playWeatherFx(wd.from, wd.to, wd.by);
    else toast(wd.by + ' 没能改变今天的天气');
  }
  /* 缇西：入睡前选明天想找什么 */
  if (st.tixiAsk && st.me.id === st.tixiAsk.pid && !st.me.tixiPickTonight && !S.tixiDone) {
    showModal('<div class="tixi-modal"><h3>吃完饭，缇西想起一件事</h3><p class="st-sub tixi-skill">明天想先找哪一类东西？</p>' +
      '<div class="modal-row rscat tixi-cats">' +
      '<button data-tixicat="food">🥕 食物</button>' +
      '<button data-tixicat="material">🪨 材料</button>' +
      '<button data-tixicat="blueprint">📜 图纸</button>' +
      '</div></div>');
  }
  if (!st.tixiAsk) S.tixiDone = false;
}

/* 天气过渡 */
/* v168：乌姆改判成功 → 屏幕正中一个大天气符号（140~180px，0.4s 淡入 → 1.6s 停留 → 0.6s 淡出），
   配一声单簧管；失败时什么都不放，只留 toast。环境层随后换成新天气。 */
let umWxTimer = null;
function umWeatherShow(to) {
  const old = document.getElementById('umWx');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  const box = document.createElement('div');
  box.id = 'umWx';
  box.className = 'um-wx';
  box.innerHTML = '<div class="um-icon wx-sym">' + wxIcon(to) + '</div>' +
    '<div class="um-txt">乌姆改变了天气</div>';
  document.body.appendChild(box);
  if (umWxTimer) clearTimeout(umWxTimer);
  umWxTimer = setTimeout(function () {
    if (box.parentNode) box.parentNode.removeChild(box);
    umWxTimer = null;
  }, 2800);
  return box;
}

function playWeatherFx(from, to, by) {
  /* v168 时序：先响单簧管（第一个音在 0.055s 站住），300ms 后中间的天气符号才淡入，
     环境层也在符号出现那一刻同步换，不提前；失败走另一条分支，什么都不放。 */
  try { SFXW.play('clarinet', 0.55, 1200); } catch (e) {}
  setTimeout(function () {
    umWeatherShow(to);
    try { ambientWeather(to); } catch (e) {}
  }, 300);
  toast(esc(by) + ' 把天气变成了「' + (WX_CN[to] || to) + '」');
}

document.addEventListener('click', function (ev) {
  const wb = ev.target.closest('[data-wxpick]');
  if (wb) {
    const k = wb.getAttribute('data-wxpick');
    closeModal();
    op({ type: 'wxpick', key: k });
    toast('老奶奶正在试着改变天气…');
    return;
  }
  const tb = ev.target.closest('[data-tixicat]');
  if (tb) {
    const cat = tb.getAttribute('data-tixicat');
    closeModal();
    /* v160：缇西选完之后，夜晚的「睡觉/外出」弹窗要接着补上 */
    S.tixiDone = true;
    S.nightShown = false;
    op({ type: 'tixipick', cat: cat });
    toast('缇西想好了：明天先找' + ({ food: '食物', material: '材料', blueprint: '图纸' }[cat] || ''));
    return;
  }
}, true);

function showModal(html) {
    el('modalBox').innerHTML = html;
    el('modal').hidden = false;
    S.modalShown = true;
  }
  function closeModal() {
    el('modal').hidden = true;
    S.modalShown = false;
    document.body.classList.remove('night-dialog');
  }

  /* 图纸：把材料一片片“塞进去”，塞满最后一片就直接造出来（不再问确认） */
  let buildState = null;

  function openBuild(card) {
    card = card || {};
    const st = S.st, me = st.me, bp = card.rec || {}, mats = bp.mats || {};
    buildState = { cardId: card.id, cname: card.name || '图纸', mats: mats, slots: [] };
    Object.keys(mats).forEach((k) => {
      for (let i = 0; i < mats[k]; i++) buildState.slots.push({ k: k, on: false });
    });
    renderBuild();
  }

  /* 学者「格莱尔特」研制物品 */
  function renderResearch(st) {
    const rs = st && st.research;
    if (!rs) { if (S.rsShown) { S.rsShown = false; S.rsPick = []; closeModal(); } return; }
    const meId = st.me && st.me.id;
    const mine = rs.pid === meId;
    const stamp = rs.stage + '|' + (rs.out && rs.out.name || '');
    if (S.rsShown === stamp) return;      /* 同一状态不重复刷 */
    S.rsShown = stamp;
    if (rs.stage === 'making') {
      showModal('<div class="rswait"><h3>' + esc(rs.name || '学者') + ' 正在研制物品</h3>' +
        '<p class="st-sub">器皿里咕嘟咕嘟地冒着气泡…</p><div class="rsdots"><i></i><i></i><i></i></div></div>');
      return;
    }
    if (rs.stage === 'result') {
      showModal('<h3>' + esc(rs.name || '学者') + ' 的研制结果</h3>' +
        '<div class="rsout">' + (rs.out ? '研制出了「<b>' + esc(rs.out.name) + '</b>」' : '什么都没研制出来') + '</div>' +
        (mine ? '<div class="modal-row"><button data-act="rsTake">收下</button></div>' : '<p class="st-sub">' + esc(rs.name || '学者') + ' 正在查看成果…</p>'));
      return;
    }
    if (!mine) {
      showModal('<div class="rswait"><h3>' + esc(rs.name || '学者') + ' 正在研制物品</h3>' +
        '<p class="st-sub">其他人都在等他配制完成…</p><div class="rsdots"><i></i><i></i><i></i></div></div>');
      return;
    }
    /* 自己：选两张牌（v176：直接显示卡面 —— 没点的是灰的，点了的有颜色） */
    const hand = (st.me && st.me.hand) || [];
    const pick = S.rsPick || (S.rsPick = []);
    const cards = hand.map((h) => {
      const on = pick.indexOf(h.id) >= 0;
      /* 卡面用真实卡片渲染，但把 data-card 去掉，避免点击被牌桌的手牌逻辑抢走 */
      const face = cardHTML(h, 'rscard').replace(/data-card="[^"]*"/g, '');
      const okKind = h.kind === 'blueprint' || h.kind === 'material' || h.kind === 'food';
      return '<button class="rspick' + (on ? ' on' : '') + (okKind ? '' : ' bad') +
        '" data-act="rsPick" data-card="' + esc(h.id) + '" title="' + esc(h.name || '') + '">' + face + '</button>';
    }).join('');
    const picked = pick.map((id) => hand.find((h) => h.id === id)).filter(Boolean);
    const hasBp = picked.some((h) => h.kind === 'blueprint');
    const ready = pick.length === 2 && hasBp && picked.some((h) => h.kind === 'material' || h.kind === 'food');
    showModal('<h3>研制物品</h3>' +
      '<p class="st-sub">放一张图纸 + 任意一张材料或食物，研制出随机食物 / 材料 / 图纸（不会是放进去的这两张）。</p>' +
      '<div class="rsgrid">' + (cards || '<p class="st-sub">手里没有牌</p>') + '</div>' +
      '<p class="st-sub">已选 ' + pick.length + ' / 2' + (pick.length === 2 && !ready ? '（要一张图纸 + 一张材料/食物）' : '') + '</p>' +
      '<div class="modal-row"><button data-act="rsSkip">先不研制</button>' +
      '<button data-act="rsGo"' + (ready ? '' : ' disabled') + '>开始研制</button></div>');
  }


  /* v195：医生 / 农夫 / 厨师 / 疯狂科学家 在建造阶段的私人作业 */
  const JOB_TXT = {
    doc: { title: '配药', hint: '放一株「草」加一块「石头」或一块「木头」。',
      rule: '草 + 石头：七成回血药 / 三成清创药；草 + 木头：三成回血药 / 七成清创药。只有你知道成的是什么。' },
    farmer: { title: '翻土', hint: '埋 1~3 份物品进土里，试试能不能有好收获。',
      rule: '' },
    chef: { title: '熬盐', hint: '在孤岛熬盐，[草]是必需品。',
      rule: '' },
    mad: { title: '邪恶研究', hint: '选取三个可怜物品当做我的研究材料。',
      rule: '' }
  };
  function jobReady(charId, picked) {
    const mat = (c) => c && c.kind === 'material';
    if (charId === 'doc') {
      return picked.length === 2 && picked.some((c) => mat(c) && c.key === 'grass') &&
        picked.some((c) => mat(c) && (c.key === 'stone' || c.key === 'wood'));
    }
    if (charId === 'farmer') return picked.length >= 1 && picked.length <= 3 &&
      picked.every((c) => c && c.key !== 'junk' && c.kind !== 'food');
    if (charId === 'chef') return picked.length >= 1 && picked.length <= 2 && picked.every((c) => mat(c) && c.key === 'grass');
    if (charId === 'mad') return picked.length === 3;
    return false;
  }
  function renderJob(st) {
    const meId = st.me && st.me.id;
    const jb = (st && st.myJob) || null;
    /* v213：需要转化的角色同时开工；没活干的人看到「正在等待：谁谁」 */
    if (!jb) {
      const wait = ((st && st.jobs) || []).filter((j) => j && j.pid !== meId);
      if (wait.length) {
        const wstamp = 'wait|' + wait.map((j) => j.pid + ':' + j.stage).join(',');
        if (S.jbShown === wstamp) return;
        S.jbShown = wstamp; S.jbOpen = true; S.jbPick = [];
        showModal('<div class="rswait"><h3>等他们忙完</h3>' +
          '<p class="st-sub">正在等待：' + wait.map((j) => esc(j.name || '') + '（' + esc(j.role || '') + '）').join('、') + '</p>' +
          '<div class="rsdots"><i></i><i></i><i></i></div></div>');
        return;
      }
      if (S.jbShown) { S.jbShown = ''; S.jbPick = []; if (S.jbOpen) { S.jbOpen = false; closeModal(); } }
      return;
    }
    const mine = jb.pid === meId;
    const stamp = jb.stage + '|' + jb.charId + '|' + (jb.out ? (jb.out.mine || []).map((g) => g.name).join(',') : '') +
      '|' + ((st.me && st.me.hand) || []).length;
    if (S.jbShown === stamp) return;
    S.jbShown = stamp; S.jbOpen = true;
    const tx = JOB_TXT[jb.charId] || { title: '忙活', hint: '', rule: '' };
    const head = esc(jb.name || '') + '（' + esc(jb.role || '') + '）';
    if (jb.stage === 'making') {
      showModal('<div class="rswait"><h3>' + head + '</h3>' +
        '<p class="st-sub">' + esc(mine ? (jb.msg || '手上还沾着味道…') : (jb.msg || tx.hint)) + '</p>' +
        '<div class="rsdots"><i></i><i></i><i></i></div></div>');
      return;
    }
    if (jb.stage === 'result') {
      if (!mine) {
        showModal('<h3>' + head + ' 忙完了</h3><p class="st-sub">' + esc(jb.msg || '大家都看着他那边。') + '</p>');
        return;
      }
      const mineList = (jb.out && jb.out.mine) || [];
      const got = mineList.length
        ? mineList.map((g) => (g.fail ? '<span class="jbfail">「' + esc(g.name) + '」没成</span>' : '<b>「' + esc(g.name) + '」</b>')).join('、')
        : '这次什么都没剩下';
      showModal('<h3>' + esc(tx.title) + '的结果</h3>' +
        '<div class="rsout">' + got + '</div>' +
        '<p class="st-sub">' + esc(jb.msg || '') + '</p>' +
        '<div class="modal-row"><button data-act="jbOk">收下</button></div>');
      return;
    }
    if (!mine) {
      showModal('<div class="rswait"><h3>' + head + '</h3>' +
        '<p class="st-sub">' + esc(jb.msg || tx.hint) + '</p><div class="rsdots"><i></i><i></i><i></i></div></div>');
      return;
    }
    const hand = (st.me && st.me.hand) || [];
    const pick = S.jbPick || (S.jbPick = []);
    const picked = pick.map((id) => hand.find((h) => h.id === id)).filter(Boolean);
    const cards = hand.map((h) => {
      const on = pick.indexOf(h.id) >= 0;
      const face = cardHTML(h, 'rscard').replace(/data-card="[^"]*"/g, '');
      return '<button class="rspick' + (on ? ' on' : '') + '" data-act="jbPick" data-card="' + esc(h.id) +
        '" title="' + esc(h.name || '') + '">' + face + '</button>';
    }).join('');
    const ready = jobReady(jb.charId, picked);
    showModal('<h3>' + esc(tx.title) + '</h3>' +
      '<p class="st-sub">' + esc(tx.hint) + '</p>' +
      (tx.rule ? '<p class="st-sub" style="opacity:.75">' + esc(tx.rule) + '</p>' : '') +
      '<div class="rsgrid">' + (cards || '<p class="st-sub">手里没有牌</p>') + '</div>' +
      '<p class="st-sub">已选 ' + pick.length + ' / ' + (jb.need || 3) + '</p>' +
      '<div class="modal-row"><button data-act="jbGo"' + (ready ? '' : ' disabled') + '>开始</button>' +
      '<button data-act="jbSkip" title="这次不做也不会卡住进度">跳过</button></div>');
  }

  function renderBuild() {
    if (!buildState) return;
    const st = S.st, me = st.me;
    const handMats = (me.hand || []).filter((c) => c && c.kind === 'material');
    const used = {};
    buildState.slots.forEach((s) => { if (s.on) used[s.k] = (used[s.k] || 0) + 1; });
    const slotsHTML = buildState.slots.map((s, i) => {
      const have = handMats.filter((c) => c.key === s.k).length - (used[s.k] || 0);
      const canFill = !s.on && have > 0;
      return '<button class="bmslot ' + (s.on ? 'on' : '') + '" data-act="fillslot" data-slot="' + i + '"' +
        (s.on ? '' : (canFill ? '' : ' disabled')) + '>' +
        (s.on ? '✔ ' + MAT_NAME[s.k] : MAT_NAME[s.k]) + '</button>';
    }).join('');
    const done = buildState.slots.filter((s) => s.on).length;
    showModal('<h3>' + esc(buildState.cname || '图纸') + '</h3>' +
      '<p class="st-sub">点材料把它塞进槽里，塞满最后一片会自动造出来。</p>' +
      '<div class="bmslots">' + slotsHTML + '</div>' +
      '<p class="st-sub">已塞 ' + done + ' / ' + buildState.slots.length + '</p>' +
      '<div class="modal-row"><button data-act="closeModal">先不造</button></div>');
  }

  function fillSlot(idx) {
    if (!buildState) return;
    const s = buildState.slots[idx];
    if (!s || s.on) return;
    const me = S.st.me;
    const used = {};
    buildState.slots.forEach((x) => { if (x.on) used[x.k] = (used[x.k] || 0) + 1; });
    const have = (me.hand || []).filter((c) => c && c.kind === 'material' && c.key === s.k).length;
    if (have <= (used[s.k] || 0)) { toast('手里没有「' + MAT_NAME[s.k] + '」了'); return; }
    s.on = true;
    if (buildState.slots.every((x) => x.on)) {
      const id = buildState.cardId;
      buildState = null;
      closeModal();
      op({ type: 'build', card: id });
      return;
    }
    renderBuild();
  }

  function openFurnace(card) {
    showModal('<h3>火炉</h3><p>把这张「木头」放进火炉？</p>' +
      '<p class="st-sub">放进去不用点火：到建造阶段会自动烧好，一次性结算。</p>' +
      '<div class="modal-row">' +
      '<button class="primary" data-act="doFurnace" data-card="' + esc(card.id) + '">放进火炉</button>' +
      '<button data-act="closeModal">算了</button></div>');
  }

  function openTelescope() {
    const t = S.st && S.st.telescope;
    if (!t || !t.built) return toast('得先有望远镜');
    const rows = (t.days || []).map((d) => '<div class="tel-row">第 ' + d.day + ' 天 · <b>' + esc(d.name) + '</b>' +
      ' · 探索点 ' + d.sp + ' · 饱食消耗 ' + d.food +
      (d.mon ? ' · <em class="tel-mon">有野怪</em>' : ' · 安全') + '</div>').join('');
    showModal('<h3>望远镜 · 未来 5 天</h3>' +
      '<p class="st-sub">' + (t.owner ? esc(t.owner) + ' 造的望远镜，全队都能看' : '') + '</p>' +
      (rows || '<p>已经到第 21 天了，看不到更远的天气。</p>') +
      '<div class="modal-row"><button data-act="closeModal">知道了</button></div>');
  }

  /* ⑤ v149：牧师需求不再用中间的浮框——改成「牧师自己的座位框亮起来 + 想要的物品图」 */
  function paintPriestWant(st) {
    const stale = document.getElementById('priestWantBox');
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    return;
  }
  function paintPriestWantOld(st) {
    let box = document.getElementById('priestWantBox');
    const priest = (st && st.npcs || []).filter((n) => n && n.key === 'priest' && n.alive && n.want)[0];
    /* v143：需求框改在建造阶段（含夜晚建造阶段）出现——弃牌阶段可能因为没人超牌被整段跳过 */
    if (!st || (st.phase !== 'build' && st.phase !== 'nightbuild') || !priest) {
      if (box) box.parentNode.removeChild(box);
      return;
    }
    const w = priest.want;
    const need = Math.max(1, w.count || 1);
    const done = Math.min(need, w.done || 0);
    if (!box) {
      box = document.createElement('div');
      box.id = 'priestWantBox';
      box.setAttribute('data-want', '1');
      box.setAttribute('data-want-box', '1');
      document.body.appendChild(box);
    }
    const ico = (typeof MAT_ICON !== 'undefined' && MAT_ICON[w.key])
      || (w.kind === 'food' ? (typeof PIC === 'function' ? PIC('carrot') : '🥕') : (w.kind === 'blueprint' ? '📜' : '🎁'));
    const have = ((st.me && st.me.hand) || []).some((c) => c && c.kind === w.kind && c.key === w.key);
    box.innerHTML = '<img class="pw-face" src="' + NPC_FACE.priest + '" alt="">' +
      '<div class="pw-info"><b>牧师想要</b>' +
      '<div class="pw-item"><i>' + ico + '</i> ' + esc(w.name) + ' ×' + need + '</div>' +
      '<div class="pw-prog">已交 <b>' + done + '</b> / ' + need + '</div>' +
      '<div class="pw-hint">' + (have ? '把手里的「' + esc(w.name) + '」拖进来，或点右边的框提交' : '你手里没有他要的东西') + '</div></div>' +
      '<div class="pw-drop">拖到这里<br>提交</div>';
  }

  /* v189：翻出命运卡的人，名字用他自己的颜色（八色里的一个） */
  function nameColored(name, color) {
    const c = String(color || '').toLowerCase();
    const okc = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'black'];
    if (okc.indexOf(c) < 0) return esc(name);
    return '<b class="pc-name pc-' + c + '">' + esc(name) + '</b>';
  }

  function openFate() {
    const f = S.st && S.st.fate;
    if (!f) return;
    if (!f.mine) {
      if (f.gade) {
        showModal(fateFaceHTML(f) + '<h3>' + esc(f.name) + '</h3>' +
          '<p>' + nameColored(f.pname || '有人', f.pcolor) + ' 翻出了<b>' + esc(f.name) + '</b>，' + esc(f.name) + ' 正在迎接他。</p>' +
          '<p class="st-sub">只有他能决定去哪座岛——等他选完就继续。</p>' +
          (f.queued ? '<p class="st-sub">后面还有 ' + f.queued + ' 位命运人物排队</p>' : '') +
          '<div class="modal-row"><button disabled>等待 ' + esc(f.pname || '他') + ' 选择…</button></div>');
      }
      return;
    }
    const me = S.st.me || {};
    const who = (f.pname || '有人') + (f.gade ? '' : '');
    const head = f.satu
      ? '<p>' + nameColored(f.pname || '有人', f.pcolor) + ' 翻出了<b>' + esc(f.name) + '</b>，萨图说营地缺人手，问能不能去帮几天。</p>' +
        '<p class="st-sub">答应的话会立刻开一场交付（先跟大家换东西），交付结束后你就跟他走了 —— 约 1~3 天后回来。</p>'
      : f.gade
      ? '<p>' + nameColored(f.pname || '有人', f.pcolor) + ' 翻出了<b>' + esc(f.name) + '</b>，' + esc(f.name) + ' 正在迎接他——要带全队换岛，只有他能决定。</p>'
      : '<p>' + nameColored(f.pname || '有人', f.pcolor) + ' 翻出了<b>' + esc(f.name) + '</b>，' + esc(f.name) + ' 正在迎接他。</p>' +
        '<p class="st-sub">每个人都可以选择是否迎接他。</p>' +
        (f.insight ? '<p class="st-sub fate-insight">（' + esc(f.insight) + '）</p>' : '');
    showModal(fateFaceHTML(f) + '<h3>' + esc(f.name) + '</h3>' + head +
      '<div class="modal-row">' +
      '<button class="primary" data-act="fateYes">' + (f.satu ? '我去帮忙' : '迎接') + '</button>' +
      '<button data-act="fateNo">回绝</button>' +
      '</div>');
  }

  /* ================= v128 新增界面 ================= */
  const WANT_ICON = { clean: 'icons/clean.png', heal: 'icons/heal.png', wood: 'icons/wood.png', grass: 'icons/grass.png', stone: 'icons/stone.png', iron: 'icons/iron.png' };
  const WANT_NAME = { clean: '清创药物', heal: '回血药物', wood: '木头', grass: '草', stone: '石头', iron: '铁' };

  function fateFaceHTML(f) {
    const k = String((f && f.key) || '');
    if (!k) return '';
    return '<div class="fate-face"><img src="ui/fate/' + esc(k) + '.png?v=132" alt="" onerror="this.style.display=\'none\'"></div>';
  }

  function wantBadge(p) {
    if (!p || !p.want || !WANT_ICON[p.want]) return '';
    return '<i class="want-badge" title="他需要：' + WANT_NAME[p.want] + '"><img src="' + WANT_ICON[p.want] + '" alt=""></i>';
  }

  /* 拖拽影子单例：任何时刻屏幕上最多一个，且一定会被清掉（修「菜卡变大贴片」） */
  function clearFxGhost() {
    document.querySelectorAll('body > .fx-drag').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    S.fxGhost = null;
  }

  function fxGhostEl(node) {
    clearFxGhost();
    node.classList.add('fx-drag');
    document.body.appendChild(node);
    S.fxGhost = node;
    return node;
  }

  /* 夜归：夜里摸到的东西先挑，收完这一夜才过去 */
  function openNightLoot() {
    const st = S.st, me = st && st.me;
    if (!me) return;
    const items = me.nightLoot || [];
    const html = '<h3>夜里带回来的东西</h3>' +
      '<p class="st-sub">摸到 ' + items.length + ' 件东西，挑要收下的（收下这一夜才过去）。</p>' +
      '<div class="nl-row">' + items.map(function (c) {
        return '<div class="nl-card"><i>' + (ICONS[c.key] || (c.kind === 'food' ? ICONS.meat : '❔')) + '</i><b>' + esc(c.name) + '</b></div>';
      }).join('') + '</div>' +
      '<div class="modal-row"><button class="primary" data-act="nightTakeAll">全部收下</button></div>';
    showModal(html);
  }

  /* 吃出毛病：谁获得了什么 buff + 效果 + 立刻扣血 */
  function showMealBuffs(mb) {
    S.mealBufOpen = true;   /* 先让玩家看清谁得了什么，再让他选夜晚行动 */
    const list = (mb && mb.list) || [];
    if (!list.length) return;
    showModal('<h3>吃完出事了</h3><div class="mb-list">' + list.map(function (x) {
      return '<div class="mb-row"><b>' + esc(x.name) + '</b><span>获得「' + esc(x.bname) + '」</span>' +
        '<span class="st-sub">' + esc(x.eff || '') + '</span>' +
        (x.now ? '<span class="st-sub">' + esc(x.now) + '</span>' : '') + '</div>';
    }).join('') + '</div><div class="modal-row"><button class="primary" data-act="mealBuffsOk">知道了</button></div>');
  }

  /* 用药面板：三个人 × 红瓶（回血）/ 蓝瓶（清创）；灰=不可用，半色=可点，满色=已选 */
  function openMedPanel() {
    const st = S.st;
    if (!st || !st.me) return;
    const me = st.me;
    if (!S.medSel || S.medSel.day !== st.day) S.medSel = { day: st.day, heal: [], clean: [] };
    const sel = S.medSel;
    const cnt = { heal: 0, clean: 0 };
    (me.hand || []).forEach(function (c) { if (c && c.kind === 'item' && (c.key === 'heal' || c.key === 'clean')) cnt[c.key]++; });
    const ps = (st.players || []).filter(function (x) { return x && x.alive; });
    const cols = ps.map(function (x) {
      const canHeal = Number(x.hp) < Number(x.maxHp || x.hp);
      const canClean = ((x.buffs || []).length > 0);
      function cell(key, ok) {
        const on = (sel[key] || []).indexOf(x.id) >= 0;
        const own = cnt[key] > 0;
        const cls = 'med-cell' + (on ? ' on' : '') + ((ok && own) ? '' : ' off');
        const tip = !own ? ('你没有' + WANT_NAME[key])
          : (!ok ? (key === 'heal' ? '他没有掉血' : '他身上没有负面效果') : (key === 'heal' ? '回血药物：生命 +1' : '清创药物：去掉一个负面效果'));
        return '<button class="' + cls + '" data-act="medToggle" data-key="' + key + '" data-target="' + esc(x.id) + '"' +
          ((ok && own) ? '' : ' disabled') + ' title="' + esc(tip) + '">' +
          '<img class="med-bottle" src="' + (key === 'heal' ? 'icons/heal.png' : 'icons/clean.png') + '" alt=""></button>';
      }
      return '<div class="med-col' + (x.isMe ? ' mine' : '') + '">' +
        '<b class="med-name">' + esc(x.name) + wantBadge(x) + '</b>' +
        '<span class="med-hp">❤ ' + x.hp + '/' + x.maxHp + '</span>' +
        '<div class="med-cells">' + cell('heal', canHeal) + cell('clean', canClean) + '</div></div>';
    }).join('');
    const n = (sel.heal || []).length + (sel.clean || []).length;
    showModal('<h3>用药</h3>' +
      '<p class="st-sub">回血药物 ' + cnt.heal + ' 瓶 · 清创药物 ' + cnt.clean + ' 瓶。点药瓶选人，选几个人就扣几瓶。</p>' +
      '<div class="med-grid">' + cols + '</div>' +
      '<div class="modal-row"><button data-act="closeModal">取消</button>' +
      '<button class="primary" data-act="medGo"' + (n ? '' : ' disabled') + '>确定' + (n ? '（' + n + '）' : '') + '</button></div>');
  }

  function openNight() {
    const me = S.st.me;
    const hasMat = (me.equip || []).some((e) => e.key === 'mat');
    const hasTorch = (me.equip || []).some((e) => e.key === 'torch');
    const wn = S.st.night;
    /* v162：没望远镜就只说「今夜天气未知。」；「没有草席」这类话不再说；
       三个选项平级并排等宽、一行排开，框保持矮扁（宽度不管）。 */
    const head = wn
      ? '<p class="nm-wx">今晚天气：<b>' + esc(wn.name) + '</b></p>'
      : '<p class="nm-wx">今夜天气未知。</p>';
    document.body.classList.add('night-dialog');
    showModal('<h3>夜深了</h3>' + head +
      '<div class="nm-opts">' +
      '<button class="nm-opt primary" data-act="nightSleep">直接睡</button>' +
      '<button class="nm-opt" data-act="nightMat"' + (hasMat ? '' : ' disabled') + '>睡草席</button>' +
      '<button class="nm-opt" data-act="nightOut"' + (hasTorch ? '' : ' disabled') + '>外出</button>' +
      '</div>');
  }

  /* ---------------- 拖牌（拖到图纸上就是交材料，所有人都能看到轨迹） ---------------- */
  var dragSt = null, dragGhost = null, lastEmit = 0;

  function ghostFor(card) {
    const g = document.createElement('div');
    g.className = 'drag-ghost ' + (card.kind || '');
    g.innerHTML = '<div class="cname">' + esc(card.name || '') + '</div>';
    document.body.appendChild(g);
    return g;
  }

  function moveGhost(x, y) {
    if (!dragGhost) return;
    dragGhost.style.transform = 'translate(' + (x - 34) + 'px,' + (y - 46) + 'px)';
  }

  function clearGhost() {
    if (dragGhost && dragGhost.parentNode) dragGhost.parentNode.removeChild(dragGhost);
    dragGhost = null;
  }

  function bounceCard(id) {
    const cards = document.querySelectorAll('#meHand .card[data-card]');
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].dataset.card !== String(id)) continue;
      const n = cards[i];
      n.classList.remove('bounce-back');
      void n.offsetWidth;
      n.classList.add('bounce-back');
      setTimeout(function () { n.classList.remove('bounce-back'); }, 470);
      break;
    }
  }

  /* 只认明确的目标；落在空白/无关区域时弹回手里，不产生任何删除操作 */
  function dropAction(x, y, st) {
    if (!st) return false;
    const under = document.elementFromPoint(x, y);
    const me = S.st && S.st.me;
    if (!under || !me) { bounceCard(st.id); return false; }

    const cardEl = under.closest('.card[data-card]');
    const boxEl = under.closest('[data-box]');
    const slotEl = under.closest('.bmslot[data-slot]');
    const festEl = under.closest('[data-feast]');
    const chestCell = under.closest('#chestDock .cd-cell');

    /* 拖到另一张手牌（图纸）上 → 交材料 */
    if (cardEl && cardEl.dataset.card !== st.id) {
      const target = (me.hand || []).find((c) => c && c.id === cardEl.dataset.card);
      if (target && target.kind === 'blueprint' && st.kind === 'material') {
        op({ type: 'deliver', card: st.id, bp: target.id });
        return true;
      }
    }
    /* 拖回自己的手牌区：留在手里 */
    if (under.closest('#meHand')) return true;

    /* v234：烤浆果（拿起就能吃的东西）拖到任何就餐框 = 直接吃 */
    const instCard = (me.hand || []).find((x) => x && String(x.id) === String(st.id)) || {};
    if ((instCard.instant || st.instant) && under.closest('.eatbox')) {
      op({ type: 'eatcard', id: st.id });
      return true;
    }

    const dz = under.closest('#discardDrop') || under.closest('.discard-zone');
    if (dz && S.st.phase === 'discard') { op({ type: 'discard', card: st.id }); return true; }
    if (chestCell) {
      const ci = ((((S.st.common || {}).chest || {}).cells) || [])[Number(chestCell.dataset.cslot)] || {};
      if (ci && ci.mine === false && ci.alive !== false) {
        toast('这是「' + (ci.name || '别人') + '」的格子，你只能动自己的');
        bounceCard(st.id);
        return false;
      }
      op({ type: 'chestPut', card: st.id, cell: Number(chestCell.dataset.cslot) });
      return true;
    }

    /* 分餐：拖到别人的餐盒/座位格子上才算分给他 */
    const canServe = st.kind === 'food' || (st.kind === 'material' && st.key === 'grass');
    if (S.st.cookStep === 'serve' && canServe) {
      const eatEl = under.closest('.eatbox');
      if (eatEl) { op({ type: 'serve', card: st.id, to: eatEl.dataset.eat }); return true; }
      const seatEl = under.closest('.seat-strip[data-p]');
      if (seatEl) { op({ type: 'serve', card: st.id, to: seatEl.dataset.p }); return true; }
    }

    /* 锅的上料格：只有烹饪放料阶段、且是食物才能进锅 */
    if (under.closest('.pot-in')) {
      if (S.st.phase !== 'cook' || st.kind !== 'food' || S.st.cookStep === 'serve' || S.st.cookStep === 'cooking') {
        bounceCard(st.id);
        return false;
      }
      const pw = under.closest('[data-pot]');
      op({ type: 'cookPut', card: st.id, pot: pw ? Number(pw.dataset.pot) : 0 });
      return true;
    }

    if (under.closest('.fur-slot.top')) { op({ type: 'furnace', card: st.id }); return true; }
    if (boxEl && S.st.phase === 'trade') { op({ type: 'tradeAdd', pair: boxEl.dataset.box, card: st.id }); return true; }
    if (slotEl) { fillSlot(Number(slotEl.dataset.slot)); return true; }
    /* v203/v206：厨师把盐拖到盛宴区 → 整桌菜都变「丰盛的」 */
    const srcCard = (me.hand || []).find((x) => x && String(x.id) === String(st.id)) || {};
    const srcKey = srcCard.key || st.key;
    if (st.kind === 'food' && srcKey === 'salt' && S.st.phase === 'cook' && S.st.cookStep === 'serve' &&
        (festEl || under.closest('#feasts'))) {
      op({ type: 'saltFest', card: st.id });
      return true;
    }
    if (festEl) { op({ type: 'eat', feast: festEl.dataset.feast }); return true; }
    /* v143：牧师需求框随时可交（弃牌阶段可能被跳过，建造阶段才是主要交付时机） */
    if (under.closest('[data-want]')) { op({ type: 'giveNpc', card: st.id }); return true; }
    if (S.st.phase === 'discard') {
      if (under.closest('#potZone') && (st.kind === 'food' || (st.kind === 'material' && st.key === 'grass'))) { op({ type: 'discard', card: st.id, to: 'pot' }); return true; }
      if (under.closest('#furnaceZone')) { op({ type: 'discard', card: st.id, to: 'furnace' }); return true; }
    }
    bounceCard(st.id);
    return false;
  }

  document.addEventListener('click', function (ev) {
    const chip = ev.target.closest && ev.target.closest('.pchip[data-common]');
    if (!chip) return;
    const key = chip.dataset.common;
    const st = S.st || {};
    const built = !!(st.common && st.common[key] && st.common[key].built);
    if (key === 'chest') {
      if (!built) return toast('箱子还没造出来');
      S.chestOpen = !(S.chestOpen !== false);   /* 默认展开 → 先收拢 */
      paintChestDock();
      return;
    }
    if (key === 'boat') {
      if (!built) return toast('船还没造出来');
      return showModal('<h3>出海</h3><p>确认驾船离开这座岛吗？离开就算成功脱险。</p><div class="modal-row"><button data-act="sailYes">确认驾船离开</button><button data-act="closeModal">再想想</button></div>');
    }
    if (key === 'telescope') {
      if (!(st.telescope && st.telescope.built)) return toast('得先有望远镜');
      return openTelescope();
    }
    if (key === 'furnace' && built) return toast('火炉已经建好了');
    toast((chip.textContent || '').trim() + (built ? ' 已经建好了' : ' 还没造出来'));
  }, true);

  let fDrag = null;
  document.addEventListener('wheel', function (ev) {
    const row = ev.target.closest && ev.target.closest('.eatrow');
    if (!row) return;
    if (row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft += (ev.deltaY || ev.deltaX);
    ev.preventDefault();
  }, { passive: false });

  document.addEventListener('click', function (ev) {
    const t = ev.target.closest && ev.target.closest('[data-pot-item]');
    if (!t) return;
    if (S.suppressClick) return;
    const st = S.st;
    if (!st || st.cookStep === 'serve' || st.cookStep === 'cooking') return;
    const pot = Number(t.dataset.pot || 0), slot = Number(t.dataset.slot || 0);
    const f = ((st.potFoods || [])[pot] || [])[slot];
    if (!f) return;
    if (f._owner !== (st.me && st.me.id)) return toast('这是 ' + (f._who || '别人') + ' 放的食材，不能动');
    op({ type: 'potTake', pot, slot, card: f.id });
  }, true);

  /* v128：就餐框 / 盛宴框里的菜卡拖拽。
     影子单例（clearFxGhost），pointercancel / blur 也清，绝不会留下贴片；就餐框里的牌可以拖回自己的手牌 */
  document.addEventListener('pointerdown', function (ev) {
    if (!S.st || S.st.cookStep !== 'serve') return;
    clearFxGhost();
    const chip = ev.target.closest && ev.target.closest('.eatbox [data-take]');
    if (chip) {
      const im = chip.querySelector('img');
      fDrag = { id: chip.getAttribute('data-take'), from: 'eat', x: ev.clientX, y: ev.clientY, ghost: null, kicked: false, src: im ? im.getAttribute('src') : '' };
      return;
    }
    const f = ev.target.closest && ev.target.closest('[data-feast]');
    if (!f) return;
    const im2 = f.querySelector('img');
    fDrag = { id: f.dataset.feast, from: 'table', x: ev.clientX, y: ev.clientY, ghost: null, kicked: false, src: im2 ? im2.getAttribute('src') : '' };
  }, true);
  document.addEventListener('pointermove', function (ev) {
    if (!fDrag) {
      if (document.querySelector('body > .fx-drag')) clearFxGhost();
      return;
    }
    if (!fDrag.ghost && Math.hypot(ev.clientX - fDrag.x, ev.clientY - fDrag.y) > 6) {
      fDrag.kicked = true;
      if (fDrag.src) {
        const im = document.createElement('img');
        im.className = 'fx-img';
        im.setAttribute('src', fDrag.src);
        im.setAttribute('alt', '');
        fDrag.ghost = fxGhostEl(im);
      } else {
        const dv = document.createElement('div');
        dv.className = 'fx-txt';
        dv.textContent = '🍲';
        fDrag.ghost = fxGhostEl(dv);
      }
    }
    if (fDrag.ghost) { fDrag.ghost.style.left = ev.clientX + 'px'; fDrag.ghost.style.top = ev.clientY + 'px'; }
  }, true);
  document.addEventListener('pointerup', function (ev) {
    if (!fDrag) { clearFxGhost(); return; }
    const d = fDrag; fDrag = null;
    clearFxGhost();
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const inHand = !!(under && under.closest && under.closest('#meHand'));
    if (d.from === 'eat') {
      if (!d.kicked) return;
      S.suppressClick = true; setTimeout(function () { S.suppressClick = false; }, 250);
      const box = under && under.closest ? under.closest('.eatbox') : null;
      if (box) { op({ type: 'serve', feast: d.id, to: box.dataset.eat }); return; }
      if (inHand) { op({ type: 'serveTake', id: d.id }); return; }
      const chip = document.querySelector('.eatbox [data-take="' + d.id + '"]');
      if (chip) {
        chip.classList.remove('bounce-back');
        void chip.offsetWidth;
        chip.classList.add('bounce-back');
        setTimeout(function () { chip.classList.remove('bounce-back'); }, 470);
      }
      toast('菜只能放在就餐区；生食拖回手牌可以拿回来');
      return;
    }
    if (d.kicked) {
      let toId = null;
      if (under && under.closest) {
        const box2 = under.closest('.eatbox');
        if (box2) toId = box2.dataset.eat;
        if (!toId) {
          const seat = under.closest('[data-p]');
          if (seat) toId = seat.getAttribute('data-p');
        }
        if (!toId && under.closest('#me') && S.st && S.st.me) toId = S.st.me.id;
      }
      if (!toId) { toast('把菜拖进某个人的就餐框里'); return; }
      op({ type: 'serve', feast: d.id, to: toId });
      return;
    }
    op({ type: 'serve', feast: d.id });
  }, true);
  document.addEventListener('pointercancel', function () { fDrag = null; clearFxGhost(); }, true);
  window.addEventListener('blur', function () {
    fDrag = null;
    clearFxGhost();
    document.querySelectorAll('.drag-ghost').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
  });

  /* v121：锅里的食材可以拖回自己的手牌（开火前） */
  let potDrag = null;
  document.addEventListener('pointerdown', function (ev) {
    const it = ev.target.closest && ev.target.closest('[data-pot-item]');
    if (!it || !S.st) return;
    const st = S.st;
    if (st.cookStep === 'serve' || st.cookStep === 'cooking') return;
    const pot = Number(it.dataset.pot || 0), slot = Number(it.dataset.slot || 0);
    const f = ((st.potFoods || [])[pot] || [])[slot];
    if (!f || f._owner !== (st.me && st.me.id)) return;
    potDrag = { id: f.id, pot, slot, name: f.name || '', x: ev.clientX, y: ev.clientY, ghost: null };
  }, true);
  document.addEventListener('pointermove', function (ev) {
    if (!potDrag) return;
    if (!potDrag.ghost && Math.hypot(ev.clientX - potDrag.x, ev.clientY - potDrag.y) > 6) {
      potDrag.ghost = ghostFor({ kind: 'food', name: potDrag.name });
      document.body.classList.add('dragging');
    }
    if (potDrag.ghost) moveGhost(ev.clientX, ev.clientY);
  }, true);
  document.addEventListener('pointerup', function (ev) {
    if (!potDrag) return;
    const d = potDrag; potDrag = null;
    const moved = !!d.ghost;
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    document.body.classList.remove('dragging');
    if (!moved) return;
    S.suppressClick = true;
    setTimeout(function () { S.suppressClick = false; }, 260);
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    if (under && under.closest && under.closest('#meHand, .hand-zone')) {
      op({ type: 'potTake', pot: d.pot, slot: d.slot, card: d.id });
    } else {
      toast('食材没动：拖回自己的手牌区才能拿回来');
    }
  }, true);

  document.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('[data-act="saveLog"]')) { saveGameLog(); return; }
    if (ev.target.closest && ev.target.closest('[data-act="restart"]')) { op({ type: 'restart' }); return; }
    if (ev.target.closest && ev.target.closest('[data-act="nextRoom"]')) {
      const nc = (S.st && S.st.nextCode) || '';
      if (!nc) return toast('还没有下一局的房号');
      const nm = nick();
      location.href = 'island.html?room=' + encodeURIComponent(nc) + '&name=' + encodeURIComponent(nm) +
        '&intent=auto' + (qs.get('dbg') ? '&dbg=1' : '') + '&diff=' + encodeURIComponent(S.diff || 'easy');
      return;
    }
  }, true);

  document.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('#serveOk')) { op({ type: 'serveOk' }); return; }
  }, true);

  /* v189：神明点弃牌堆的牌，拿回手里 */
  document.addEventListener('click', function (ev) {
    const d = ev.target.closest && ev.target.closest('.dcard[data-disctake]');
    if (!d) return;
    if (!(S.st && S.st.takeDiscard)) return;
    op({ type: 'discardTake', card: d.dataset.disctake });
  }, true);

  document.addEventListener('click', function (ev) {
    const m = ev.target.closest && ev.target.closest('.mon[data-mname]');
    if (!m) return;
    toast(m.dataset.mname + '　' + m.dataset.mtag);
  }, true);

  document.addEventListener('click', function (ev) {
    const out = ev.target.closest && ev.target.closest('#furnaceZone .fur-slot.bottom');
    if (!out) return;
    if (!out.querySelector('i.filled')) return;
    op({ type: 'furnaceTake' });
  }, true);

  function chestAction(ev) {
    const closeBtn = ev.target.closest('[data-act="chestClose"]');
    if (closeBtn) { S.chestOpen = false; paintChestDock(); return; }
    const cardNode = ev.target.closest('#chestDock [data-card]');
    if (cardNode) { op({ type: 'chestTake', card: cardNode.dataset.card }); }
  }

  function openGiveNpc(kind) {
    const st = S.st; if (!st) return;
    const n = (st.npcs || []).find((x) => x.key === kind);
    if (!n) return toast('这里没有人');
    if (!n.alive) return toast(n.name + ' 已经倒下了');
    if (!n.want) return toast('他今天没有想要的东西');
    const have = (st.me.hand || []).filter((c) => c && c.kind === n.want.kind && c.key === n.want.key);
    if (!have.length) return toast('你手里没有「' + n.want.name + '」');
    const need0 = Math.max(1, n.want.count || 1), done0 = Math.min(need0, n.want.done || 0);
    const tip = need0 > 1 ? '他要 ' + need0 + ' 件，已经收到 ' + done0 + ' 件。' : '交给他能回 1 点血。';
    showModal('<h3>交给 ' + esc(n.name) + '</h3><p>他想要「' + esc(n.want.name) + '」，' + tip + '</p>' +
      have.map((c) => '<button class="ghost" data-act="npcGive" data-card="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('') +
      '<div class="modal-row"><button data-act="closeModal">再想想</button></div>');
  }

  function initDrag() {
    document.addEventListener('pointerdown', function (e) {
      const lc = e.target.closest && e.target.closest('.loot-card');
      if (!lc) return;
      S.lootDrag = lc.getAttribute('data-loot');
    }, true);
    document.addEventListener('pointerdown', (e) => {
      const cardEl = e.target.closest('#meHand .card[data-card]');
      if (!cardEl || !S.st || !S.st.me) return;
      const c = (S.st.me.hand || []).find((x) => x && x.id === cardEl.dataset.card);
      if (!c) return;
      dragSt = { id: c.id, kind: c.kind, key: c.key, name: c.name, x0: e.clientX, y0: e.clientY, kicked: false };
      cardEl.setPointerCapture && cardEl.setPointerCapture(e.pointerId);
    });

    document.addEventListener('pointermove', (e) => {
      if (!dragSt) return;
      const dx = e.clientX - dragSt.x0, dy = e.clientY - dragSt.y0;
      if (!dragSt.kicked && Math.hypot(dx, dy) < 6) return;
      if (!dragSt.kicked) {
        dragSt.kicked = true;
        const c = (S.st.me.hand || []).find((x) => x && x.id === dragSt.id) || { name: '' };
        dragGhost = ghostFor(c);
        document.body.classList.add('dragging');
      }
      moveGhost(e.clientX, e.clientY);
      const now = Date.now();
      if (now - lastEmit > 60) {
        lastEmit = now;
        S.sock.emit('island:drag', {
          id: dragSt.id,
          cardName: ((S.st.me.hand || []).find((x) => x && x.id === dragSt.id) || {}).name || '',
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight
        });
      }
      /* 高亮目标图纸 */
      const under = document.elementFromPoint(e.clientX, e.clientY);
      document.querySelectorAll('.card.drop-ok').forEach((n) => n.classList.remove('drop-ok'));
      const over = under && under.closest ? under.closest('#meHand .card[data-card]') : null;
      if (over && over.dataset.card !== dragSt.id && dragSt.kind === 'material') {
        const t = (S.st.me.hand || []).find((x) => x && x.id === over.dataset.card);
        if (t && t.kind === 'blueprint') over.classList.add('drop-ok');
      }
    });

    document.addEventListener('pointerup', (e) => {
    if (S.lootDrag) {
      const under2 = document.elementFromPoint(e.clientX, e.clientY);
      const id = S.lootDrag; S.lootDrag = null;
      if (under2 && under2.closest('#meHand')) { op({ type: 'lootTake', card: id }); }
    }
      if (!dragSt) return;
      const st = dragSt;
      dragSt = null;
      clearGhost();
      document.body.classList.remove('dragging');
      document.querySelectorAll('.card.drop-ok').forEach((n) => n.classList.remove('drop-ok'));
      if (!st.kicked) return;
      S.suppressClick = true;
      setTimeout(() => { S.suppressClick = false; }, 250);
      dropAction(e.clientX, e.clientY, st);
    });
  }

  /* ---------- v128：交付框里的牌按住可以拖回自己手里（交易确认前） ---------- */
  let boxDrag = null;
  document.addEventListener('pointerdown', function (ev) {
    const st = S.st;
    if (!st || st.phase !== 'trade') return;
    const c = ev.target.closest && ev.target.closest('[data-box] .card[data-card]');
    if (!c) return;
    clearFxGhost();
    boxDrag = { id: c.dataset.card, box: c.closest('[data-box]').dataset.box, x: ev.clientX, y: ev.clientY, ghost: null };
  }, true);
  document.addEventListener('pointermove', function (ev) {
    if (!boxDrag) return;
    if (!boxDrag.ghost && Math.hypot(ev.clientX - boxDrag.x, ev.clientY - boxDrag.y) > 6) {
      const dv = document.createElement('div');
      dv.className = 'fx-txt';
      dv.textContent = '↩';
      boxDrag.ghost = fxGhostEl(dv);
    }
    if (boxDrag.ghost) { boxDrag.ghost.style.left = ev.clientX + 'px'; boxDrag.ghost.style.top = ev.clientY + 'px'; }
  }, true);
  document.addEventListener('pointerup', function (ev) {
    if (!boxDrag) return;
    const d = boxDrag; boxDrag = null;
    const moved = !!d.ghost;
    clearFxGhost();
    if (!moved) return;
    S.suppressClick = true; setTimeout(function () { S.suppressClick = false; }, 260);
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    if (under && under.closest && under.closest('#meHand')) {
      op({ type: 'tradeTake', pair: d.box, card: d.id });
    } else {
      toast('拖回自己的手牌区才能拿回来');
    }
  }, true);


  /* ================= v226 ================= */
  /* 「我需要什么」的小图标（交付页 / 分药窗用） */
  function wantBadgeId(st, id) {
    const p = ((st && st.players) || []).find(function (x) { return x && x.id === id; });
    return wantBadge(p);
  }


  /* v226：这一拳/这一矛实际能打多少（规则跟着服务端 fightAct 走） */
  function myDmg(action, monKey) {
    const me = (S.st && S.st.me) || {};
    const eq = me.equip || [];
    const hasPaw = eq.some(function (e) { return e && e.key === 'bearpaw'; });
    let d = 0;
    if (action === 'punch') d = 1 + (hasPaw ? 2 : 0);
    else if (action === 'stone') d = 2 + (me.charId === 'ranger' ? 1 : 0);
    else if (action === 'hammer') d = 2;
    else if (action === 'spear') d = 5;
    if (me.charId === 'haft' && d > 0) d += 1 + (action === 'spear' ? 1 : 0);
    if (me.charId === 'vill' && d > 0 && (monKey === 'cat' || monKey === 'hound' || monKey === 'ox')) d *= 2;
    if (d > 0 && Number(me.inspire || 0) > 0) d += 1;
    const cat = S.st && S.st.cat;
    if (d > 0 && cat && cat.follow === me.id) d += 1;
    return d;
  }

  /* v226：天还没亮透就不给「搜索」——等「清晨」这行字飘走 */
  function dawnHold(st) {
    if (!st || st.phase !== 'search') return false;
    if (S.dawnReady === st.day) return false;
    const key = 'd' + st.day;
    if (!S.dawnHold || S.dawnHold.key !== key) S.dawnHold = { key: key, at: Date.now() };
    if (document.getElementById('openSeq')) return true;   /* 大字还在天上 */
    return Date.now() - S.dawnHold.at < 2400;              /* 没赶上大字：给天空 2.4 秒亮完 */
  }

  /* v226：别人在自己视角里看不出「谁在分药」——给一个不挡操作的提示框 */
  function paintMedWait(st) {
    const dn = (st && st.dawn) || {};
    /* v233：没人手上真有药时（dawn.empty）不弹「正在分配药品」 */
    const wait = !!(st && st.phase === 'dawn' && dn.step === 'med' && dn.pid && !dn.empty && st.me && dn.pid !== st.me.id);
    let n = document.getElementById('medWait');
    if (n && n.parentNode) n.parentNode.removeChild(n);
    if (true) return; /* v233：小框已废弃，统一用全屏遮罩 */
    if (!wait) { if (n && n.parentNode) n.parentNode.removeChild(n); return; }
    if (!n) {
      n = document.createElement('div');
      n.id = 'medWait';
      n.className = 'medwait';
      document.body.appendChild(n);
    }
    const txt = '「' + (dn.name || '队友') + '」正在分配药品…';
    if (n.textContent !== txt) n.textContent = txt;
  }

  /* v226：怪物区复用节点（不再整块重建），挨打动画才留得住 */
  function paintMonsters(mz, st) {
    const mons = (st.fight && st.fight.monsters) || [];
    let lab = mz.querySelector(':scope > .cz-lab');
    const labelTxt = '怪物区 · 第 ' + st.fight.round + ' 轮 · 右键野怪选择打法';
    if (!lab) {
      lab = document.createElement('div');
      lab.className = 'cz-lab';
      mz.insertBefore(lab, mz.firstChild);
    }
    if (lab.textContent !== labelTxt) lab.textContent = labelTxt;
    let wrap = mz.querySelector(':scope > .mons-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'mons-wrap';
      mz.appendChild(wrap);
    }
    const seen = {};
    mons.forEach(function (m, i) {
      const rIdx = Math.floor(i / 3);
      let row = wrap.children[rIdx];
      if (!row) {
        row = document.createElement('div');
        row.className = 'mons-row';
        wrap.appendChild(row);
      }
      seen[m.id] = 1;
      let node = row.querySelector('.mon[data-mon="' + m.id + '"]');
      if (!node) {
        node = document.createElement('div');
        node.className = 'mon';
        node.setAttribute('data-mon', m.id);
        node.innerHTML = '<div class="mface"></div><div class="mname"></div>' +
          '<div class="mrow"><span class="mhp2"></span><span class="matk2"></span></div>';
        row.appendChild(node);
      } else if (node.parentNode !== row) {
        row.appendChild(node);
      }
      node.classList.toggle('dead', m.hp <= 0);
      node.classList.toggle('sel', S.selMon === m.id);
      node.setAttribute('data-mname', m.name);
      node.setAttribute('data-mtag', '❤ ' + m.hp + '/' + m.maxHp + ' · ⚔ ' + m.dmg + (m.special ? ' · ' + m.special : ''));
      const pic = monPic(m) || '';
      const face = node.querySelector('.mface');
      const wantPic = pic || String(MON_FACE[m.key] || '👹');
      if (face.getAttribute('data-pic') !== wantPic) {
        face.innerHTML = pic
          ? '<img class="mon-img" src="' + pic + '" alt="" onerror="this.remove()">'
          : (MON_FACE[m.key] || '👹');
        face.setAttribute('data-pic', wantPic);
      }
      const nm = node.querySelector('.mname');
      if (nm.textContent !== m.name) nm.textContent = m.name;
      const hp2 = node.querySelector('.mhp2');
      const hpTxt = '❤ ' + Math.max(0, m.hp);
      if (hp2.textContent !== hpTxt) hp2.textContent = hpTxt;
      const at2 = node.querySelector('.matk2');
      const atTxt = '⚔ ' + m.dmg;
      if (at2.textContent !== atTxt) at2.textContent = atTxt;
    });
    wrap.querySelectorAll('.mon').forEach(function (n) {
      if (!seen[n.getAttribute('data-mon')]) n.remove();
    });
    Array.prototype.slice.call(wrap.children).forEach(function (row) {
      if (!row.children.length) row.remove();
    });
    mz.querySelectorAll(':scope > .cz-empty').forEach(function (n) { n.remove(); });
  }

  /* ---------- v128：右键自己 → 我需要什么 ---------- */
  document.addEventListener('contextmenu', function (ev) {
    const me = S.st && S.st.me;
    if (!me) return;
    const self = ev.target.closest && ev.target.closest('#me, .seat-strip[data-p="' + me.id + '"]');
    if (!self) return;
    ev.preventDefault();
    document.querySelectorAll('.want-menu').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    const box = document.createElement('div');
    box.className = 'want-menu';
    const items = ['clean', 'heal', 'wood', 'grass', 'stone', 'iron'];
    box.innerHTML = '<div class="wm-lab">我需要…</div>' + items.map(function (k) {
      return '<button class="wm-btn' + (me.want === k ? ' on' : '') + '" data-want-pick="' + k + '">' +
        '<img src="' + WANT_ICON[k] + '" alt="">' + WANT_NAME[k] + '</button>';
    }).join('') + '<button class="wm-btn" data-want-pick="">不需要</button>';
    document.body.appendChild(box);
    box.style.left = Math.max(6, Math.min(window.innerWidth - 190, ev.clientX)) + 'px';
    box.style.top = Math.max(6, Math.min(window.innerHeight - 280, ev.clientY)) + 'px';
    box.addEventListener('click', function (e2) {
      const b = e2.target.closest('[data-want-pick]');
      if (!b) return;
      if (box.parentNode) box.parentNode.removeChild(box);
      op({ type: 'want', key: b.getAttribute('data-want-pick') || '' });
    });
  });

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', (e) => {
    if (S.suppressClick) return;
    const takeNode = e.target.closest('.eatbox [data-take]');
    if (takeNode) { toast('按住这张牌拖回自己的手牌区，就能拿回来'); return; }
    const cardNode = e.target.closest('[data-card]');
    const pickNode = e.target.closest('[data-pick]');
    if (pickNode && S.st && S.st.phase === 'trade') {
      const pid2 = pickNode.dataset.pick;
      if (S.st.isleOffer) {
        S.isleSel = S.isleSel || [];
        const ix = S.isleSel.indexOf(pid2);
        if (ix >= 0) S.isleSel.splice(ix, 1); else S.isleSel.push(pid2);
        S.sel = null;
      } else {
        S.sel = (S.sel === pid2 ? null : pid2);
      }
      try { render(S.st); } catch (e2) {}
      return;
    }
    const isleBoxNode = e.target.closest('[data-isle-box]');
    if (isleBoxNode && S.st && S.st.phase === 'trade' && S.st.isleOffer) {
      const needN = isleNeedCount(S.st.isleOffer);
      if ((S.isleSel || []).length !== needN) { toast('先挑好要交的 ' + needN + ' 件东西'); return; }
      op({ type: 'isleDeal', cards: (S.isleSel || []).slice() });
      S.isleSel = null;
      return;
    }
    const actNode = e.target.closest('[data-act]');
    const monNode = e.target.closest('[data-mon]');
    const feastNode = e.target.closest('[data-feast]');
    const boxNode = e.target.closest('[data-box]');
    const npcNode = e.target.closest('[data-npc]');
    const groundNode = e.target.closest('[data-ground]');

    if (groundNode) {
      op({ type: 'groundTake', card: groundNode.dataset.ground });
      return;
    }

    /* 牧师需求框：点一下就交出手里第一张对得上的牌 */
    if (e.target.closest && e.target.closest('[data-want-box]')) {
      const st0 = S.st || {};
      const pr = (st0.npcs || []).filter((x) => x && x.key === 'priest' && x.alive && x.want)[0];
      if (!pr) return;
      const card = ((st0.me && st0.me.hand) || []).filter((c) => c && c.kind === pr.want.kind && c.key === pr.want.key)[0];
      if (!card) return toast('你手里没有「' + pr.want.name + '」');
      return op({ type: 'giveNpc', card: card.id });
    }

    /* 选中食物后，点锅里的空格把食物放进去 */
    const potEmpty = e.target.closest('.pot-in .pot-slot:not(.has-item)');
    if (potEmpty && S.st && S.st.phase === 'cook' && S.st.cookStep !== 'serve' && S.st.cookStep !== 'cooking') {
      const sel = S.sel ? ((S.st.me && S.st.me.hand) || []).find((x) => x && x.id === S.sel) : null;
      if (!sel) return toast('先点一张食物牌，再点锅里的空格');
      if (sel.kind !== 'food') return toast('锅里只能放食物');
      const pw = potEmpty.closest('[data-pot]');
      op({ type: 'cookPut', pot: pw ? Number(pw.dataset.pot) : 0, card: sel.id });
      S.sel = null;
      render(S.st);
      return;
    }

    if (actNode) {
      const a = actNode.dataset.act;
      if (a === 'closeModal') return closeModal();
      if (a === 'mealBuffsOk') { closeModal(); S.mealBufOpen = false; if (S.st) render(S.st); return; }
      if (a === 'nightBuildDone') return op({ type: 'nightBuildDone' });
      if (a === 'dawnNext') return op({ type: 'dawnNext' });
      if (a === 'skipsearch') return op({ type: 'skipsearch' });
      /* v178：乌姆的起床仪式框里「今天不改了」 */
      if (a === 'wxSkip') { closeModal(); return op({ type: 'dawnNext' }); }
    if (a === 'witchYes') { closeModal(); return op({ type: 'witch', accept: true }); }
    if (a === 'witchNo') { closeModal(); return op({ type: 'witch', accept: false }); }
    if (a === 'nightSearch') return op({ type: 'nightTake' });
    if (a === 'nightNext') return op({ type: 'nightNext' });
      if (a === 'nightTakeAll') { closeModal(); return op({ type: 'nightTake' }); }
      if (a === 'openMed') { S.medSel = { day: S.st.day, heal: [], clean: [] }; return openMedPanel(); }
      if (a === 'medToggle') {
        const key = actNode.dataset.key, tid = actNode.dataset.target;
        const st0 = S.st || {};
        if (!S.medSel || S.medSel.day !== st0.day) S.medSel = { day: st0.day, heal: [], clean: [] };
        const arr = S.medSel[key] || (S.medSel[key] = []);
        const cnt0 = ((st0.me && st0.me.hand) || []).filter(function (x) { return x && x.kind === 'item' && x.key === key; }).length;
        const i0 = arr.indexOf(tid);
        if (i0 >= 0) arr.splice(i0, 1);
        else {
          if (arr.length >= cnt0) { toast('你只有 ' + cnt0 + ' 瓶' + (key === 'heal' ? '回血药物' : '清创药物')); return; }
          arr.push(tid);
        }
        return openMedPanel();
      }
      if (a === 'medGo') {
        const s2 = S.medSel || { heal: [], clean: [] };
        const items = [];
        (s2.heal || []).forEach(function (t) { items.push({ key: 'heal', target: t }); });
        (s2.clean || []).forEach(function (t) { items.push({ key: 'clean', target: t }); });
        if (!items.length) return toast('至少选一个人');
        closeModal();
        S.medSel = null;
        op({ type: 'medicineBatch', items: items });
        /* v155：清晨分完药就往下走 */
        if (S.st && S.st.phase === 'dawn') op({ type: 'dawnNext' });
        return;
      }
      if (a === 'hendler') return op({ type: 'hendler' });
      if (a === 'search') return op({ type: 'search' });
      if (a === 'advance') return op({ type: 'advance' });
      if (a === 'isleDeal') {
        const needN = isleNeedCount((S.st && S.st.isleOffer) || {});
        if ((S.isleSel || []).length !== needN) return toast('先挑好要交的 ' + needN + ' 件东西');
        op({ type: 'isleDeal', cards: (S.isleSel || []).slice() });
        S.isleSel = null;
        return;
      }
      if (a === 'isleRefuse') { S.isleSel = null; return op({ type: 'isleRefuse' }); }
      if (a === 'tradeok') return op({ type: 'tradeOk', pair: actNode.dataset.pair });
      if (a === 'fillslot') return fillSlot(Number(actNode.dataset.slot));
      if (a === 'doFurnace') { closeModal(); return op({ type: 'furnace', card: actNode.dataset.card }); }
      if (a === 'furnaceLight') return;
      if (a === 'furnaceTake') return op({ type: 'furnaceTake' });
      if (a === 'makeupDone') return op({ type: 'makeupDone' });
      if (a === 'cookok') return op({ type: 'cookOk' });
      if (a === 'jbPick') {
        S.jbPick = S.jbPick || [];
        const jid = actNode.dataset.card;
        /* v210：农夫这两类牌点不上，当场说明原因 */
        const jbNow = (S.st && S.st.myJob) || {};
        if (jbNow.charId === 'farmer') {
          const cNow = ((S.st.me && S.st.me.hand) || []).find((x) => x && x.id === jid) || {};
          if (cNow.kind === 'food') { toast('不能浪费食物'); return; }
          if (cNow.key === 'junk') { toast('要保护环境'); return; }
        }
        const i2 = S.jbPick.indexOf(jid);
        if (i2 >= 0) S.jbPick.splice(i2, 1);
        else {
          const jb2 = (S.st && S.st.myJob) || {};
          const max = ({ doc: 2, farmer: 3, chef: 2, mad: 3 })[jb2.charId] || 3;
          if (S.jbPick.length >= max) { toast('最多选 ' + max + ' 张'); return; }
          S.jbPick.push(jid);
        }
        S.jbShown = null;
        renderJob(S.st);
        return;
      }
      if (a === 'jbGo') {
        const ids2 = S.jbPick || [];
        if (!ids2.length) return toast('先选牌');
        return op({ type: 'jobpick', cards: ids2 });
      }
      if (a === 'jbOk') { S.jbShown = null; S.jbPick = []; S.jbOpen = false; closeModal(); return op({ type: 'jobok' }); }
      if (a === 'jbSkip') { S.jbShown = null; S.jbPick = []; S.jbOpen = false; closeModal(); return op({ type: 'jobskip' }); }
      if (a === 'rsPick') {
        S.rsPick = S.rsPick || [];
        const id = actNode.dataset.card;
        const i = S.rsPick.indexOf(id);
        if (i >= 0) S.rsPick.splice(i, 1);
        else {
          /* v176：点满两张就停住，不乱踢掉前面选的 */
          if (S.rsPick.length >= 2) { toast('最多选两张'); return; }
          const h = ((S.st && S.st.me && S.st.me.hand) || []).find((x) => x.id === id);
          if (h && h.kind !== 'blueprint' && h.kind !== 'material' && h.kind !== 'food') {
            toast('只能放图纸 + 材料/食物'); return;
          }
          S.rsPick.push(id);
        }
        S.rsShown = null;
        renderResearch(S.st);
        return;
      }
      if (a === 'rsGo') {
        const ids = S.rsPick || [];
        if (ids.length !== 2) return toast('先选两张牌');
        return op({ type: 'research', cards: ids });
      }
      if (a === 'rsSkip' || a === 'rsTake') { S.rsShown = null; S.rsPick = []; closeModal(); return op({ type: 'researchOk' }); }
    if (a === 'serveok') return op({ type: 'serveOk' });
      if (a === 'fateYes') { closeModal(); return op({ type: 'fate', accept: true }); }
      if (a === 'fateNo') { closeModal(); return op({ type: 'fate', accept: false }); }
      if (a === 'night') return openNight();
      if (a === 'nightSleep') { closeModal(); try { SFX.harp(); } catch (e) {} return op({ type: 'night', mode: 'sleep' }); }
      if (a === 'nightMat') { closeModal(); try { SFX.harp(); } catch (e) {} return op({ type: 'night', mode: 'sleep', mat: true }); }
      if (a === 'startGame') { return op({ type: 'start' }); }
      if (a === 'setmode') { return op({ type: 'setmode', mode: actNode.dataset.mode || 'trio' }); }
      if (a === 'nightOut') { closeModal(); S.askingNight = true; return op({ type: 'nightAsk' }); }
      if (a === 'nightOutDirect') { closeModal(); return op({ type: 'night', mode: 'out' }); }
    if (a === 'nightOutUmb') { closeModal(); return op({ type: 'night', mode: 'out', umb: true }); }
    if (a === 'discardDone') return op({ type: 'discardDone' });
      if (a === 'npcGive') { closeModal(); return op({ type: 'giveNpc', card: actNode.dataset.card }); }
    if (a === 'sailYes') { closeModal(); return op({ type: 'boat' }); }
      if (a === 'medicine') return op({ type: 'medicine', key: actNode.dataset.key || '' });
      if (a === 'boat') return op({ type: 'boat' });
      if (a === 'reset') { closeModal(); return op({ type: 'reset' }); }
      if (a === 'punch' || a === 'stone' || a === 'spear' || a === 'auto') {
        return op({ type: 'fight', action: a, target: S.selMon });
      }
    }

    if (monNode && S.st && S.st.fight) {
      S.selMon = monNode.dataset.mon;
      render(S.st);
      return;
    }

    if (npcNode && !actNode) { openGiveNpc(npcNode.dataset.npc); return; }

    if (actNode && actNode.dataset.act === 'takeChest') {
      return op({ type: 'chestTake', card: actNode.dataset.card });
    }

    if (actNode && actNode.dataset.act === 'medPick') {
      closeModal();
      return op({ type: 'medicine', card: actNode.dataset.card, target: actNode.dataset.target });
    }

    if (feastNode) return op({ type: 'eat', feast: feastNode.dataset.feast });

    if (boxNode && S.st && S.st.phase === 'trade') {
      if (!S.sel) return toast('先点一张手牌');
      const pair = boxNode.dataset.box;
      op({ type: 'tradeAdd', pair, card: S.sel });
      S.sel = null;
      return;
    }

    if (cardNode) {
      const id = cardNode.dataset.card;
      const st = S.st;
      if (!st || !st.me) return;
      const c = (st.me.hand || []).find((x) => x && x.id === id);
      if (cardNode.closest('[data-box]')) {
        op({ type: 'tradeTake', pair: cardNode.closest('[data-box]').dataset.box, card: id });
        return;
      }
      if (c && c.kind === 'equip') { op({ type: 'equipItem', card: c.id }); return; }
      if (st.phase === 'discard' && c) { op({ type: 'discard', card: c.id }); return; }
      if ((st.phase === 'build' || st.phase === 'nightbuild' || (st.me && st.me.makeupBuild && !st.me.makeupDone)) && c) {
        if (c.kind === 'blueprint') {
          const bmats = (c.rec && c.rec.mats) || {};
          const bdel = c.deliv || {};
          const needTxt = Object.keys(bmats)
            .filter((k) => (bmats[k] || 0) - (bdel[k] || 0) > 0)
            .map((k) => (MAT_NAME[k] || k) + '×' + Math.max(0, (bmats[k] || 0) - (bdel[k] || 0)));
          toast(needTxt.length ? '还要 ' + needTxt.join('、') + '，把材料拖到这张图纸上' : '材料已经齐了，塞最后一片就会自动造出来');
          return;
        }
        if (c.kind === 'material' && c.key === 'wood' && st.common && st.common.furnace && st.common.furnace.built) return openFurnace(c);
        toast('建造阶段');
        return;
      }
      if (st.phase === 'cook' && c && c.kind === 'food') {
        /* v165：单击只选中；同一张在 460ms 内被点第二下＝双击，直接丢进锅
           （不能靠原生 dblclick——第一次点击里的 render() 会把这张牌重建，dblclick 就打不中了） */
        const now = Date.now();
        const lc = S.cookClick;
        if (lc && lc.id === id && now - lc.t < 460) {
          S.cookClick = null;
          S.sel = null;
          S.suppressDbl = now + 600;
          op({ type: 'cookPut', card: id });
          return;
        }
        S.cookClick = { id: id, t: now };
        S.sel = (S.sel === id ? null : id);
        render(st);
        return;
      }
      if (st.phase === 'trade' && st.trade) {
        S.sel = (S.sel === id ? null : id);
        render(st);
        return;
      }
      S.sel = (S.sel === id ? null : id);
      render(st);
    }
  });

  /* v162：烹饪阶段双击食材＝直接放进锅里（单击只是选中）。
     双击非食物一律放不进去；锅满时服务端会顶掉最早一份并退还原主。 */
  document.addEventListener('dblclick', function (e) {
    const st = S.st;
    if (!st || !st.me || st.phase !== 'cook' || st.cookStep === 'serve' || st.cookStep === 'cooking') return;
    if (S.suppressDbl && Date.now() < S.suppressDbl) return;
    const cardNode = e.target.closest && e.target.closest('[data-card]');
    if (!cardNode) return;
    const id = cardNode.dataset.card;
    const c = (st.me.hand || []).find((x) => x && x.id === id);
    if (!c) return;
    e.preventDefault();
    e.stopPropagation();
    if (c.kind !== 'food') {
      S.sel = null;
      render(st);
      toast('这个不能下锅');
      return;
    }
    op({ type: 'cookPut', card: id });
    S.sel = null;
    render(st);
  }, true);

  /* 右键野怪：像三国杀送花/砸鸡蛋那样弹一个圆形小菜单 */
  document.addEventListener('contextmenu', (e) => {
    const mon = e.target.closest && e.target.closest('[data-mon]');
    document.querySelectorAll('.fight-menu, .mon-menu').forEach((n) => n.remove());
    if (!mon || !S.st || !S.st.fight) return;
    e.preventDefault();
    S.selMon = mon.dataset.mon;
    /* 先量位置再 render —— render 会重建怪物节点，旧节点脱离文档后 rect 全是 0 */
    const mrect = mon.getBoundingClientRect();
    render(S.st);
    const f = S.st.fight, mine = S.st.me || {};
    const myTurn = !(f.acted || []).includes(mine.id) && !f.settling;
    const hasStone = (mine.hand || []).some((c) => c && c.kind === 'material' && c.key === 'stone');
    const hasSpear = (mine.equip || []).some((c) => c && c.key === 'spear' && (!c.maxDur || c.dur > 0));
    const hammer = (mine.equip || []).find((c) => c && c.key === 'warhammer' && (!c.maxDur || c.dur > 0));
    const hasPaw = (mine.equip || []).some((c) => c && c.key === 'bearpaw');
    const box = document.createElement('div');
    box.className = 'fight-menu';
    /* v226：显示「我这一下真能打多少」，不再写死 2 伤 / 5 伤 */
    const monKey = ((f.monsters || []).find((x) => x.id === S.selMon) || {}).key || '';
    const opts = [
      hammer
        ? { k: 'hammer', img: 'icons/warhammer.png', label: '战锤', sub: myDmg('hammer', monKey) + ' 伤 · ' + (hammer.dur || 0) + '/5', off: false }
        : { k: 'punch', ic: '✊', label: '拳头', sub: myDmg('punch', monKey) + ' 伤', off: false },
      { k: 'stone', img: 'icons/stone.png', label: '石头', sub: myDmg('stone', monKey) + ' 伤', off: !hasStone },
      { k: 'spear', img: 'icons/spear.png', label: '长矛', sub: myDmg('spear', monKey) + ' 伤', off: !hasSpear },
    ];
    box.innerHTML = opts.map((o) => '<button class="fbtn' + (myTurn && !o.off ? '' : ' cool') + '" data-fight="' + o.k + '" type="button" title="' + o.label + ' · ' + (o.off ? '现在用不了' : o.sub) + '">' +
      (o.img ? '<img src="' + o.img + '" alt="">' : '<b class="femo">' + o.ic + '</b>') +
      '<em class="fsub">' + (o.off ? '无' : o.sub) + '</em></button>').join('');
    document.body.appendChild(box);
    /* 半圆环：上面那排怪 → 弧在头顶上方；下面那排怪 → 弧在脚下 */
    const r = mrect;
    const R = 74;
    const mons = Array.prototype.slice.call(document.querySelectorAll('[data-mon]'));
    const tops = mons.map((m) => m.getBoundingClientRect().top);
    const botts = mons.map((m) => m.getBoundingClientRect().bottom);
    const minTop = tops.length ? Math.min.apply(null, tops) : r.top;
    const maxBot = botts.length ? Math.max.apply(null, botts) : r.bottom;
    /* 与最上面那只比：明显更低 = 下排 → 弧在下；同排 → 弧在上 */
    const lowerRow = (r.top - minTop) > Math.max(10, r.height * 0.45);
    let up = !lowerRow;
    if (up && r.top - R - 40 < 6) up = false;
    if (!up && r.bottom + R + 40 > window.innerHeight - 4) up = true;
    const cx = r.left + r.width / 2;
    const cy = up ? r.top - 6 : r.bottom + 6;
    const btns = box.querySelectorAll('.fbtn');
    for (let i = 0; i < btns.length; i++) {
      const deg = btns.length === 1 ? 90 : (165 - (150 * i) / (btns.length - 1));
      const rad = deg * Math.PI / 180;
      const x = cx + R * Math.cos(rad);
      const y = cy - (up ? 1 : -1) * R * Math.sin(rad);
      btns[i].style.left = Math.round(x) + 'px';
      btns[i].style.top = Math.round(y) + 'px';
    }
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-fight]');
      if (!b) return;
      if (b.classList.contains('cool')) { toast(myTurn ? '这个现在用不了' : (f.settling ? '伤害结算中…' : '这一轮你已经出手了')); return; }
      box.remove();
      op({ type: 'fight', action: b.dataset.fight, target: S.selMon });
    });
  });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('.fight-menu, .mon-menu, .want-menu')) document.querySelectorAll('.fight-menu, .mon-menu, .want-menu').forEach((n) => n.remove());
  }, true);

  /* 进房前：缺名字/房间号就弹窗要 */
  function bootstrap() {
    if (!S.code) {
      S.code = String(prompt('房间号？') || '').trim().toUpperCase();
    }
    if (!S.name) {
      S.name = String(prompt('你的名字？') || '玩家').trim().slice(0, 16);
    }
    if (!S.code) { location.href = 'index.html'; return; }
    el('roomChip').textContent = '房间 ' + S.code;
    connect();
  }

  /* v128：调试入口（只在 ?dbg=1 时挂到 window，供自动化自测用） */
  if (qs.get('dbg') === '1') {
    window.__island = { S: S, op: op, render: render, el: el, showModal: showModal, closeModal: closeModal, openMedPanel: openMedPanel,
      /* v161：自测用（只在 ?dbg=1 下挂载，正常游戏不暴露） */
      setDayWeather: setDayWeather, dawnSkyShow: dawnSkyShow, dayBannerStack: dayBannerStack, phaseAnchor: phaseAnchor, phaseIntro: phaseIntro, openNight: openNight,
      /* v168：自测用（乌姆改判演出 / 常驻环境层 / 角色面板去重） */
      ambientWeather: ambientWeather, playWeatherFx: playWeatherFx, umWeatherShow: umWeatherShow, roleUI: roleUI,
      /* v206：自测用 */ dropAction: dropAction, SFXW: SFXW, seatHTML: seatHTML, buffChips: buffChips, cardHTML: cardHTML };
  }

  /* v142：搜索阶段自动推进的倒计时刷新 */
  setInterval(function () {
    const st = S.st;
    if (!st || !st.searchAutoAt) return;
    const btn = document.querySelector('#meActions [data-autocd]');
    if (!btn) return;
    const left = Math.max(0, Math.ceil((st.searchAutoAt - Date.now()) / 1000));
    btn.textContent = '结束搜索（' + left + '）';
  }, 400);

  initDrag();
  bootstrap();
})();