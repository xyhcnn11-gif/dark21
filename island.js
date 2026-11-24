'use strict';
/* ============================================================
   荒岛 21 天（island 模式）—— 独立命名空间 /island
   三人合作：21 天内造出船离开「瓦格」，否则全员失败
   ============================================================ */

const WEATHER = [
  /* name, w, sp(探索点), food(饱食度消耗), tag */
  { key: 'clear', name: '晴朗', w: 50, sp: 3, food: 2 },
  { key: 'rain', name: '下雨', w: 20, sp: 1, food: 1 },
  { key: 'fog', name: '雾天', w: 10, sp: 2, food: 3 },
  { key: 'storm', name: '雷雨', w: 10, sp: 0, food: 1 },
  { key: 'hot', name: '炎日', w: 10, sp: 2, food: 2 },
];
const WMAP = Object.fromEntries(WEATHER.map((x) => [x.key, x]));

/* 卡池大类权重 */
const CAT_CN = { food: '食物', material: '材料', blueprint: '图纸', human: '人物', monster: '野怪' };
const CAT = { food: 0.34, material: 0.34, blueprint: 0.236, human: 0.0352, monster: 0.0488 };

/* 食材 */
const FOODS = [
  { key: 'carrot', name: '胡萝卜', cal: 1, w: 55 },
  { key: 'fish', name: '鱼', cal: 2, w: 20 },
  { key: 'meat', name: '大肉', cal: 3, w: 10 },
  /* v234：浆果 —— 饱食 +0，但下锅能锁住食物精华（那一锅不会变粑粑），还能进火炉烤成烤浆果 */
  { key: 'berry', name: '浆果', cal: 0, w: 10, berry: true,
    tip: '可以放入锅中，和其他食物一起烹饪。能锁住食物的精华。' },
  /* v234：盐改成搜得到（5%），其它规则不变 */
  { key: 'salt', name: '盐', cal: 0, w: 5, noCook: true },
  /* 烤浆果：只能用浆果在火炉里烤出来 */
  { key: 'roasted', name: '烤浆果', cal: 1, w: 0, noSearch: true, noCook: true, instant: true,
    tip: '多吃水果对身体好。' },
];
/* 材料 */
const MATS = [
  { key: 'stone', name: '石头', w: 30 },
  { key: 'grass', name: '草', w: 30 },
  { key: 'wood', name: '木头', w: 30 },
  { key: 'iron', name: '铁', w: 10 },
];
/* 图纸（19 种，权重是相对值：合计 143；v225 调过火炉/回血/清创/鱼叉） */
const BLUEPRINTS = [
  { key: 'furnace', name: '火炉', w: 10 },
  { key: 'telescope', name: '望远镜', w: 6 },
  { key: 'mat', name: '草席', w: 6 },
  { key: 'torch', name: '火把', w: 15 },
  { key: 'spear', name: '长矛', w: 15 },
  { key: 'shelter', name: '草棚', w: 6 },
  { key: 'umbrella', name: '雨伞', w: 6 },
  { key: 'chest', name: '箱子', w: 6 },
  { key: 'shield', name: '盾牌', w: 10 },
  { key: 'junk', name: '垃圾', w: 10 },
  { key: 'heal', name: '回血药物', w: 9 },
  { key: 'clean', name: '清创药物', w: 9 },
  { key: 'boat', name: '船', w: 3 },
  { key: 'bonfire', name: '篝火', w: 2 },
  { key: 'harpoon', name: '鱼叉', w: 6 },
  { key: 'pot', name: '锅', w: 6 },
  { key: 'axe', name: '斧头', w: 6 },
  { key: 'warhammer', name: '战锤', w: 6 },
  { key: 'treehole', name: '树洞', w: 6 },
];
/* 人物 */
const HUMANS = [
  { key: 'priest', name: '牧师', w: 25 },
  { key: 'warrior', name: '战士', w: 25 },
  { key: 'child', name: '小女孩', w: 25 },
  { key: 'fate', name: '命运卡', w: 25, cat: 'fate' },
];
/* 野怪模板 */
const MONSTERS = {
  hound: { key: 'hound', name: '猎狗', hp: 8, dmg: 2 },
  cat: { key: 'cat', name: '猫', hp: 6, dmg: 1, wound: 2 / 3 },
  snake: { key: 'snake', name: '蛇', hp: 7, dmg: 1, venom: true },
  bear: { key: 'bear', name: '狗熊', hp: 13, dmg: 2, immune1: true },
  ox: { key: 'ox', name: '肉牛', hp: 14, dmg: 0, ox: true },
  rat: { key: 'rat', name: '老鼠', hp: 4, dmg: 1, evade2: true },
  ratking: { key: 'ratking', name: '鼠王', hp: 4, dmg: 1, evade2: true, king: true },
  /* v234：兔子与绵羊 —— 跟着野怪一起冒出来的小动物。不还手，挨完一轮就叫一声跑掉 */
  rabbit: { key: 'rabbit', name: '兔子', hp: 4, dmg: 0, prey: true },
  sheep: { key: 'sheep', name: '绵羊', hp: 6, dmg: 0, prey: true },
};
const MON_W = [
  { key: 'hound', w: 34 }, { key: 'cat', w: 24 }, { key: 'snake', w: 20 },
  { key: 'bear', w: 11.2 }, { key: 'ox', w: 8 }, { key: 'ratking', w: 12 },
];
/* v168/v179：第 1、2 天除肉牛（ox）外所有野怪不进池；同时 catWeights 已把野怪整类权重
   压到「肉牛原本的绝对概率」，所以肉牛不会被放大成必然出现。第 3 天起恢复正常。
   bearOk 决定狗熊在不在池里（抽卡第 8 天、自然生成第 15 天）。 */
function monPool(room, bearOk) {
  const early = (((room && room.day) || 1) <= 2);
  return MON_W.filter((x) => (x.key !== 'bear' || bearOk) && (!early || x.key === 'ox'));
}
/* 老鼠掉 1 块大肉的概率：先定 10%，以后想调只改这里 */
const RAT_DROP = 0.10;

/* 配方（图纸 key -> {mats:{stone,grass,wood,iron,charcoal}, dur, place}） */
const RECIPES = {
  furnace: { name: '火炉', mats: { stone: 3 }, place: 'common' },
  telescope: { name: '望远镜', mats: { grass: 1, iron: 1 }, place: 'equip', dur: 4 },
  mat: { name: '草席', mats: { grass: 3 }, place: 'equip', dur: 5 },
  torch: { name: '火把', mats: { grass: 1, wood: 1 }, place: 'equip', dur: 4 },
  spear: { name: '长矛', mats: { wood: 2, stone: 1 }, place: 'equip', dur: 4 },
  shelter: { name: '草棚', mats: { wood: 2, grass: 2 }, place: 'common', dur: 3 },
  umbrella: { name: '雨伞', mats: { wood: 1, grass: 2 }, place: 'equip', dur: 4 },
  chest: { name: '箱子', mats: { wood: 3 }, place: 'common' },
  shield: { name: '盾牌', mats: { iron: 1, wood: 1 }, place: 'equip', dur: 2 },
  heal: { name: '回血药物', mats: { grass: 1 }, place: 'use' },
  clean: { name: '清创药物', mats: { grass: 1 }, place: 'use' },
  boat: { name: '船', mats: { iron: 1, wood: 2, grass: 1 }, place: 'common' },
  bonfire: { name: '篝火', mats: { charcoal: 4 }, place: 'common' },
  harpoon: { name: '鱼叉', mats: { molten: 1, wood: 1 }, place: 'equip' },
  pot: { name: '锅', mats: { wood: 1, stone: 2 }, place: 'build', pot: true },
  axe: { name: '斧头', mats: { wood: 1, stone: 2 }, place: 'equip', dur: 6 },
  warhammer: { name: '战锤', mats: { stone: 2, grass: 1, wood: 1 }, place: 'equip', dur: 5 },
  treehole: { name: '树洞', mats: { wood: 2, grass: 1 }, place: 'common', treehole: true },
};

/* ---- 每座岛的壁纸位置（管理员用方向键调） ---- */
const BG_FILE = require('path').join(__dirname, 'data', 'isl-bg.json');
let BGPOS = {};
try { BGPOS = JSON.parse(require('fs').readFileSync(BG_FILE, 'utf8')) || {}; } catch (e) { BGPOS = {}; }
function saveBgPos() {
  try {
    const fs = require('fs');
    fs.mkdirSync(require('path').dirname(BG_FILE), { recursive: true });
    fs.writeFileSync(BG_FILE, JSON.stringify(BGPOS, null, 2), 'utf8');
  } catch (e) { console.error('bgpos save', e && e.message); }
}

const ISLANDS = [
  { key: 'wague', name: '瓦格岛', mods: {} },
  { key: 'aisen', name: '埃森岛', mods: { food: 0.10 } },
  { key: 'stov', name: '斯托夫岛', mods: { material: 0.10 } },
  { key: 'caixinong', name: '采希农岛', mods: { blueprint: 0.10 } },
  { key: 'barbaris', name: '巴尔巴里斯岛', mods: { monster: 0.10 } },
];

const MAX_HAND = 6;
function handLimit(p) { return Math.max(0, Number(p.handLimit) || MAX_HAND); }

/* v136：成品「垃圾」不占手牌上限，每人最多 2 张，永远排在手里最后 */
function isJunkCard(c) { return !!c && c.kind === 'item' && c.key === 'junk'; }
function isJunkId(r, id) { return isJunkCard(r.cards.get(id)); }
function junkCount(r, p) { let n = 0; for (const id of (p.hand || [])) if (isJunkId(r, id)) n++; return n; }
function handCardCount(r, p) { let n = 0; for (const id of (p.hand || [])) if (!isJunkId(r, id)) n++; return n; }
/* 收拾手牌：多出来的垃圾丢进弃牌堆，垃圾永远排在最后（新摸的牌自然落在垃圾前面） */
function tidyJunk(r, p) {
  if (!p || !Array.isArray(p.hand)) return;
  const real = [], junk = [];
  for (const id of p.hand) (isJunkId(r, id) ? junk : real).push(id);
  const extra = junk.slice(2);
  p.hand = real.concat(junk.slice(0, 2));
  if (extra.length) {
    for (const id of extra) r.discard.push(id);
    addLog(r, PN(p) + ' 手里只能留 2 张「垃圾」，多出来的 ' + extra.length + ' 张丢进了弃牌堆');
  }
}
const MAX_HP = 5;
const START_HP = 4;
const MAX_SAT = 5;
const START_SAT = 3;

/* ===== 模式：单人 / 双人 / 三人（三人 = 原版数值） ===== */
const MODES = {
  solo: {
    key: 'solo', name: '单人', need: 1,
    maxHp: 10, startHp: 8, maxSat: 10, startSat: 6, handMax: 12,
    spMul: 2, foodMul: 2,
    mon: { rat: 2, ratking: 2, cat: 3, hound: 5, snake: 4, bear: 7, ox: 7 },
  },
  duo: {
    key: 'duo', name: '双人', need: 2,
    maxHp: 6, startHp: 6, maxSat: 6, startSat: 4, handMax: 8,
    spAdd: 1, foodAdd: 1,
    mon: { rat: 3, ratking: 3, cat: 4, hound: 6, snake: 5, bear: 10, ox: 11 },
  },
  trio: {
    key: 'trio', name: '三人', need: 3,
    maxHp: 5, startHp: 4, maxSat: 5, startSat: 3, handMax: 6,
    spAdd: 0, foodAdd: 0,
    mon: { rat: 4, ratking: 4, cat: 6, hound: 8, snake: 7, bear: 13, ox: 14 },
  },
};

/* ===== v186：难度分级 =====
   baby 宝宝版 / easy 简单版（现在的数值）/ bleak 渺茫版 / nightmare 噩梦版（暂未开放）
   mouse：夜里小老鼠的概率与行为 gift=送礼、thief=偷东西 */
const DIFFS = {
  baby: {
    key: 'baby', name: '宝宝版',
    tip: '很温柔的海：生命、饱食、手牌上限都是 +1，野怪倒下一定会留下东西，小老鼠只会给你送东西。',
    bonus: { hp: 1, sat: 1, hand: 1 },
    monDrop: 'always',
    mouse: { p: 0.15, kind: 'gift' },
    fatigue: 0,
    poop: { two: 0, one: 0 },
  },
  easy: {
    key: 'easy', name: '简单版',
    tip: '原来的瓦格：饿肚子、躲野怪，偶尔有小老鼠来叼走一点东西。',
    mouse: { p: 0.06, kind: 'thief' },
    fatigue: 0.06,
    poop: { two: 0.05, one: 0.40 },
  },
  bleak: {
    key: 'bleak', name: '渺茫版',
    tip: '食物会放坏：每过一夜新鲜度掉一半，两夜就烂光（饱食值不变）。小老鼠也更常来，连锅和箱子都会啃。',
    foodRot: true,
    mouse: { p: 0.15, kind: 'thief', bold: true },
    summonMul: 2,   /* v226：渺茫版老鼠招小弟（含鼠王）概率翻倍 */
    fatigue: 0.10,
    poop: { two: 0.10, one: 0.60 },
  },
  nightmare: {
    key: 'nightmare', name: '噩梦版', locked: true,
    tip: '还没开放。',
    fatigue: 0.05,
    poop: { two: 0.20, one: 0.80 },
  },
};
const DIFF_ORDER = ['baby', 'easy', 'bleak', 'nightmare'];

function roomDiff(r) {
  const d = DIFFS[(r && r.diff) || 'easy'];
  return d || DIFFS.easy;
}
function diffOf(r) { return roomDiff(r).key; }
function isBaby(r) { return diffOf(r) === 'baby'; }

/* 模式数值 + 难度加成：宝宝版全体 +1 */
function roomCfg(r) {
  const cfg = roomMode(r);
  const b = roomDiff(r).bonus;
  if (!b) return cfg;
  return Object.assign({}, cfg, {
    maxHp: cfg.maxHp + (b.hp || 0),
    startHp: cfg.startHp + (b.hp || 0),
    maxSat: cfg.maxSat + (b.sat || 0),
    startSat: cfg.startSat + (b.sat || 0),
    handMax: cfg.handMax + (b.hand || 0),
  });
}

/* ===== v91：可选角色 ===== */
const CHARS = [
  { id: 'um', name: '乌姆', title: '老奶奶', tip: '一个慈祥的老奶奶。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '起床时能试着改变今天的天气（其他人会看到「老奶奶正在试图改变天气」）。' },
  { id: 'haft', name: '哈夫特', title: '骑士', tip: '貌似很有力量。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 4,
    skill: '造成的任何伤害 +1；长矛是他的趁手兵器，再 +1（长矛 5→7）。' },
  { id: 'tixi', name: '缇西', title: '古风女子', tip: '一个有目标的角色。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '睡前预测明天想找的类别（食物/材料/图纸），第二天会优先找到这一类。' },
  { id: 'fei', name: '费', title: '精灵', tip: '好运常在，常伴我身。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '命运卡的增益概率 50%→60%；物品用坏的概率整体 -10%；抽牌绝不会抽到野怪。' },
  { id: 'hendler', name: '亨德勒', title: '商人', tip: '商人的头脑很开阔。', hpMax: 5, hpStart: 4, satMax: 6, satStart: 3,
    skill: '搜索阶段可以点自己头像多摸 2 张牌，代价是当天饱食消耗 +1。' },
  { id: 'weier', name: '韦尔', title: '守卫', tip: '他似乎很可靠。', hpMax: 6, hpStart: 5, satMax: 5, satStart: 4,
    skill: '开局自带一面圣盾牌（耐久 3），直接装在装备区。' },
  { id: 'qiubi', name: '丘比', title: '胖子', tip: '末日，吃饱才是最重要的。', hpMax: 5, hpStart: 5, satMax: 7, satStart: 7,
    skill: '免疫一次饥饿（挨饿那一次不掉血，直接抵消）；每天结算饱食消耗时有 33% 概率少吃 1 点。' },
  { id: 'sai', name: '赛', title: '神明', tip: '……', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '手牌上限 +2。' },
  { id: 'mengdi', name: '蒙迪肯特', title: '乞丐', tip: '别丢下我。或许你可以来一点。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 4,
    skill: '每天搜索结束后，给每个人额外塞一张「垃圾」（不替换别人抽到的牌）。' },
  { id: 'aqizan', name: '阿齐赞', title: '工匠', tip: '这些拿去，那些拿来。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '造出物品必定返还 1 个材料，另有 10% 再返还 1 个随机材料。' },
  { id: 'gelart', name: '格莱尔特', title: '学者', tip: '知识就是力量。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    /* v176：研制 = 一张图纸 + 任意一张材料/食物（选两张后开始），文案与规则跟着改 */
    skill: '建造阶段大家造完后，他可以放一张图纸 + 任意一张材料或食物开始研制，得到随机食物/材料/图纸（必定不是投进去的那两张）；有 0.5% 概率直接产出成品。' },
  { id: 'doc', name: '阿茨', title: '医生', tip: '请别打扰医生。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '建造阶段大家造完后，他可以用 1 草 + 石头/木头 研制药品（只有他自己知道研制出了什么）。' },
  { id: 'psyc', name: '艾泽廷', title: '心理学家', tip: '你想…赢？', hpMax: 5, hpStart: 4, satMax: 5, satStart: 4,
    skill: '比常人多 1 点饱食度；别人还在猜命运人物带来什么的时候，他一眼就能看出来。' },
  { id: 'vill', name: '多夫', title: '村民', tip: '你问我每天做什么？除草，打牌，还有睡觉。', hpMax: 5, hpStart: 4, satMax: 6, satStart: 4,
    skill: '家畜亲和（不会掉落）：对猫、狗、牛的伤害翻倍。' },
  { id: 'farmer', name: '迪', title: '农夫', tip: '一起斗地主吗？我是说动作游戏。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '建造阶段可以把最多 3 个材料转化为食物，每一个都有 50% 会失败。' },
  { id: 'mad', name: '韦斯恩沙夫特勒', title: '疯狂科学家', tip: '快一点。我的小家伙们想见见世面！', hpMax: 5, hpStart: 3, satMax: 5, satStart: 3,
    skill: '开局少 1 点生命；建造阶段选 3 张牌做转化，可能失败、可能招来野怪，也可能造出善良的生灵帮你打架。' },
  { id: 'stud', name: '梅德', title: '学生', tip: '大家加油！', hpMax: 5, hpStart: 4, satMax: 5, satStart: 2,
    skill: '搜索阶段可以「跳过搜索」，全体队友获得鼓舞（伤害 +1）直到第二天清晨。' },
  { id: 'dong', name: 'key比西', title: '冬', tip: '我喜欢独行。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '夜晚外出有 50% 的概率不消耗饱食度。' },
  { id: 'chef', name: '皮蛋', title: '厨师', tip: '灵丹妙药？不需要的。吃我做的菜胜过灵丹妙药。', hpMax: 5, hpStart: 4, satMax: 5, satStart: 5,
    skill: '开局饱食度是满的；建造阶段可以把草做成盐，盐能让盛宴变成「丰盛的」。' },
  { id: 'ranger', name: '塔塔玛', title: '游侠', tip: '我从来没离开。', hpMax: 6, hpStart: 5, satMax: 5, satStart: 3,
    skill: '扔石头打怪的伤害 +1，并且有 2/3 的概率能把石头捡回来。' },
  { id: 'unk1', name: '？？？', disp: '？？？', title: '', locked: true, tip: '？？？', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '还没写好的人。' },
  { id: 'unk2', name: '？？？', disp: '？？？', title: '', locked: true, tip: '？？？', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '还没写好的人。' },
  { id: 'unk3', name: '？？？', disp: '？？？', title: '', locked: true, tip: '？？？', hpMax: 5, hpStart: 4, satMax: 5, satStart: 3,
    skill: '还没写好的人。' }
];
const CHAR_MAP = {};
CHARS.forEach((c) => { CHAR_MAP[c.id] = c; });

/* 三人模式基础面板——角色面板都是相对它的增减量 */
const BASE_PANEL = { hpMax: 5, hpStart: 4, satMax: 5, satStart: 3 };
function charDelta(ch) {
  return {
    hpMax: (ch.hpMax == null ? BASE_PANEL.hpMax : ch.hpMax) - BASE_PANEL.hpMax,
    hpStart: (ch.hpStart == null ? BASE_PANEL.hpStart : ch.hpStart) - BASE_PANEL.hpStart,
    satMax: (ch.satMax == null ? BASE_PANEL.satMax : ch.satMax) - BASE_PANEL.satMax,
    satStart: (ch.satStart == null ? BASE_PANEL.satStart : ch.satStart) - BASE_PANEL.satStart
  };
}

/* v127：换角色前先把这个角色留下的一切撤干净（临时标记 / buff / 角色专属物品），
   否则上一个角色的技能和物品会串到新角色身上 */
const CHAR_MARKS = ['satImmune', 'qiubiUsed', 'feiEquip', 'tixiPick', 'tixiPickTonight',
  'tixiUsedToday', 'hendlerToday', 'umbUsedDay', 'satSpent', 'eatGain'];
function resetCharState(p) {
  if (!p) return;
  for (const k of CHAR_MARKS) { if (k in p) delete p[k]; }
  p.satBuff = 0;
  p.wound = 0;
  p.venom = 0;
  p.ghost = 0;
  p.worm = 0;
  /* 角色发的专属物品（韦尔的圣盾牌）有 charItem 标记，自己造的不受影响 */
  if (Array.isArray(p.equip)) p.equip = p.equip.filter((e) => !(e && e.charItem));
}

function applyCharStats(p, cfg) {
  const ch = CHAR_MAP[p.charId];
  /* 幂等：一律从「模式基础面板 + 本角色增减量」重算，绝不在当前值上累加 */
  resetCharState(p);
  p.maxHp = cfg.maxHp;
  p.hp = Math.min(cfg.maxHp, cfg.startHp);
  p.satMax = cfg.maxSat;
  p.sat = Math.min(cfg.maxSat, cfg.startSat);
  p.handLimit = cfg.handMax;
  if (ch) {
    const d = charDelta(ch);
    p.maxHp = Math.max(1, cfg.maxHp + d.hpMax);
    p.satMax = Math.max(1, cfg.maxSat + d.satMax);
    p.hp = Math.min(p.maxHp, Math.max(0, cfg.startHp + d.hpStart));
    p.sat = Math.min(p.satMax, Math.max(0, cfg.startSat + d.satStart));
  }
  /* 角色专属：手牌上限 / 免疫饥饿 / 开局圣盾牌——只有当前角色才有 */
  if (p.charId === 'sai') p.handLimit += 2;
  if (p.charId === 'qiubi') p.satImmune = true;
  /* v194：厨师开局饱食度是满的 */
  if (p.charId === 'chef') p.sat = p.satMax;
  if (p.charId === 'weier') {
    p.equip = (Array.isArray(p.equip) ? p.equip : []).filter((e) => e && !e.charItem);
    p.equip.push({ id: uid('e'), key: 'shield', name: '圣盾', pic: 'holyshield', dur: 3, maxDur: 3, charItem: p.charId });
  }
}

function roomMode(r) { return MODES[r && r.mode] || MODES.trio; }
/* 选模式（或开局）时按模式把数值应用到每个玩家身上 */
function applyModeStats(r) {
  const cfg = roomCfg(r);
  /* 模式一变，所有人都从模式基础面板 + 各自角色重新算（applyCharStats 幂等，不会累加） */
  for (const p of r.players.values()) applyCharStats(p, cfg);
  for (const n of r.npcs || []) {
    const st = npcStat(r, n.key);
    const ratio = n.maxHp ? (n.hp / n.maxHp) : 1;
    n.maxHp = st.hp;
    n.hp = Math.max(1, Math.round(st.hp * ratio));
    n.maxSat = st.satMax;
    n.sat = Math.min(n.maxSat, Number(n.sat) || n.maxSat);
  }
  /* v135：开局（确认角色/点开始）就把每个人的颜色定下来，之后一直不变 */
  assignPlayerColors(r);
  assignChestColors(r);
}

function monHp(r, key) {
  const t = roomMode(r).mon || {};
  return Number(t[key]) || (MONSTERS[key] ? MONSTERS[key].hp : 5);
}
let NSP = null;
let ROOMS = null;   // io.of('/island')，供模块级函数安全 emit
const PHASES = ['search', 'trade', 'build', 'cook', 'night'];
const PHASE_NAME = { search: '搜索', trade: '交付', build: '建造', cook: '烹饪', night: '夜晚', nightbuild: '夜晚建造', fight: '战斗', discard: '弃牌', loot: '拾取遗物', morning: '清晨', over: '结束' };

let SEQ = 0;
const uid = (p) => p + (++SEQ).toString(36) + Math.random().toString(36).slice(2, 5);

function pickW(list) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let v = Math.random() * total;
  for (const it of list) { v -= it.w; if (v <= 0) return it; }
  return list[list.length - 1];
}

function makeCard(kind, extra) {
  const c = Object.assign({ id: uid('c'), kind, up: true }, extra || {});
  return c;
}

/* 图纸保底：长矛/盾牌按「曾经获得过图纸」永久解锁；船按全队当前持有合计 3 张 */
function markBpSeen(r, key) {
  if (!r || !key) return;
  if (!r.bpSeen) r.bpSeen = {};
  r.bpSeen[key] = true;
}

function blueprintWeights(room, opts) {
  const list = BLUEPRINTS.map((b) => ({ key: b.key, name: b.name, w: b.w }));
  if (!room) return list;
  const day = Math.max(1, Number(room.day) || 1);
  const ignore = !!(opts && opts.ignoreHistory);
  if (!ignore) {
    for (const p of room.players.values()) {
      if ((p.equip || []).some((e) => e.key === 'spear')) markBpSeen(room, 'spear');
      if ((p.equip || []).some((e) => e.key === 'shield')) markBpSeen(room, 'shield');
    }
    let boatHeld = 0;
    for (const p of room.players.values()) {
      for (const id of (p.hand || [])) {
        const c = room.cards.get(id);
        if (c && c.kind === 'blueprint' && (c.key === 'boat' || c.bp === 'boat')) boatHeld++;
      }
    }
    if (boatHeld >= 3) markBpSeen(room, 'boat');
  }
  const seen = ignore ? {} : (room.bpSeen || {});
  const byKey = {};
  for (const it of list) byKey[it.key] = it;
  const bump = (key, rate, fromDay, label) => {
    if (!byKey[key] || day < fromDay) return;
    const mul = Math.min(20, 1 + rate * (day - fromDay + 1));
    if (mul <= 1) return;
    byKey[key].w = Math.round(byKey[key].w * mul * 100) / 100;
    /* v215：概率调整只在后台算，不再写进日志/公告 */
  };
  if (!seen.spear) bump('spear', 0.10, 3, '长矛');
  if (!seen.shield) bump('shield', 0.10, 5, '盾牌');
  if (!seen.boat) bump('boat', 0.03, 15, '船');
  return list;
}

function cardByKind(kind, room) {
  if (kind === 'food') {
    const f = pickW(FOODS);
    return makeCard('food', { key: f.key, name: f.name, cal: f.cal, instant: !!f.instant, tip: f.tip || '' });
  }
  if (kind === 'material') {
    const m = pickW(MATS);
    return makeCard('material', { key: m.key, name: m.name });
  }
  if (kind === 'blueprint') {
    const b = pickW(blueprintWeights(room));
    markBpSeen(room, b.key);
    return makeCard('blueprint', { key: b.key, name: b.key === 'junk' ? '垃圾' : b.name, bp: b.key });
  }
  if (kind === 'human') {
    /* 命运事件不落成卡牌：返回 kind=fate，由抽卡处直接触发 */
    const FATE = { key: 'fate', name: '命运', w: 25, cat: 'fate' };
    const day = (room && room.day) || 1;
    const taken = new Set(((room && room.npcs) || []).filter((n) => n && n.alive !== false).map((n) => n.key));
    /* 第 3 天以前船上没人跟来，只会遇到命运事件 */
    const pool = day >= 3 ? HUMANS.filter((h) => h.cat === 'fate' || !taken.has(h.key)) : [FATE];
    const h = pickW(pool.length ? pool : [FATE]);
    if (h.cat === 'fate' || (day < 3)) return makeCard('fate', { key: 'fate', name: '命运' });
    return makeCard('human', { key: h.key, name: h.name, npc: h.key });
  }
  if (kind === 'monster') {
    /* 抽卡出狗熊：第 8 天（第 2 周）起才可能；第 1 周永远没有它（池里不带它，不是保底） */
    const day = (room && room.day) || 1;
    const bearOk = day >= 8;
    /* v168：第 1、2 天池里只剩肉牛（见 monPool），权重归零而非抽到退回 */
    const m = pickW(monPool(room, bearOk));
    return makeCard('monster', { key: m.key, name: m.key === 'ox' ? '肉牛' : '野怪·' + MONSTERS[m.key].name, mon: m.key });
  }
  return makeCard('material', { key: 'wood', name: '木头' });
}

/* 当天卡池权重：雨天食材 +10%，炎日 -10%，岛屿再叠 */
function catWeights(room) {
  const w = { food: CAT.food, material: CAT.material, blueprint: CAT.blueprint, human: CAT.human, monster: CAT.monster };
  const wk = WMAP[room.weather[room.day - 1]];
  if (wk && wk.key === 'rain') w.food += 0.10;
  if (wk && wk.key === 'hot') w.food -= 0.10;
  const isl = ISLANDS.find((x) => x.key === room.islandKey) || ISLANDS[0];
  for (const k of Object.keys(isl.mods || {})) w[k] += isl.mods[k];
  /* 归一化 */
  const rest = ['material', 'blueprint', 'human', 'monster'];
  const restSum = rest.reduce((s, k) => s + w[k], 0);
  const target = Math.max(0.02, 1 - w.food);
  for (const k of rest) w[k] = w[k] / restSum * target;
  /* v179：第 1、2 天其他野怪不进了，但**肉牛不能被放大**——
     肉牛只保留它原本在野怪里的占比（8 / 全部野怪权重），
     让出来的那部分概率按比例分给食物/材料/图纸/人物（每个都略微上调）。 */
  if (((room && room.day) || 1) <= 2) {
    const oxW = (MON_W.find((x) => x.key === 'ox') || { w: 8 }).w;
    const tot = MON_W.reduce((a, x) => a + x.w, 0);
    const keep = w.monster * (oxW / tot);
    const freed = w.monster - keep;
    w.monster = keep;
    const cats = ['food', 'material', 'blueprint', 'human'];
    const ssum = cats.reduce((a, k) => a + w[k], 0) || 1;
    for (const k of cats) w[k] += freed * (w[k] / ssum);
  }
  return w;
}

function drawCard(room, p) {
  const w = catWeights(room);
  /* 精灵：永远不抽到野怪；缇西：当天第一张，想找的类别权重翻倍 */
  if (p && p.charId === 'fei') w.monster = 0.00001;
  if (p && p.charId === 'tixi' && p.tixiPick && !p.tixiUsedToday && w[p.tixiPick] != null) {
    w[p.tixiPick] = w[p.tixiPick] * 2;
    p.tixiUsedToday = true;
    if (p.tixiPick) addLog(room, PN(p) + ' 按昨天的打算去找「' + CAT_CN[p.tixiPick] + '」');
  }
  const list = Object.keys(w).map((k) => ({ key: k, w: Math.max(0.001, w[k]) * 1000 }));
  const kind = pickW(list).key;
  return cardByKind(kind, room);
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }


const NPC_HP = { priest: 3, warrior: 5, child: 2 };
/* 模式会影响 NPC：单人整体翻倍；双人 战士 +3、牧师/小女孩 +2，饱食上限 8 */
function npcStat(r, key) {
  const base = NPC_HP[key] || 3;
  const mode = (roomMode(r) || {}).key || 'trio';
  let hp = base, satMax = 5;
  if (mode === 'solo') { hp = base * 2; satMax = 10; }
  else if (mode === 'duo') { hp = base + (key === 'warrior' ? 3 : 2); satMax = 8; }
  return { hp: hp, satMax: satMax };
}
const NPC_NAME = { priest: '牧师', warrior: '战士', child: '小女孩' };

/* 三个 NPC 位置：左下 n0、中右 n1、右上 n2，按加入顺序随机挑空位 */
const NPC_SLOTS = ['n0', 'n1', 'n2'];
function npcSlot(r) {
  const used = new Set((r.npcs || []).map((n) => n.slot));
  const free = NPC_SLOTS.filter((k) => !used.has(k));
  return free[Math.floor(Math.random() * free.length)] || 'n2';
}

function newIslandRoom(opts) {
  const weather = new Array(21).fill('clear');
  const r = {
    island: '瓦格岛',
    code: String(opts.code || '').toUpperCase().slice(0, 12),
    createdAt: Date.now(),
    day: 1,
    weather,
    mode: (opts && opts.mode) || 'trio',
    diff: (opts && opts.diff) || 'easy',
    islandKey: 'wague',
    players: new Map(),
    order: [],
    phase: 'morning',
  potSlots: [[], []],
    hostId: null,
    log: [],
    monsterDays: [],          // 本周固定野怪日（1..21 的天序号）
    weekScheduled: 0,
    pendingFight: null,       // 待进入战斗的怪物
    fateQ: [],                // 命运卡队列（同时出现多张时排队逐个判定）
    fight: null,
    trade: null,              // {pairs: {key: {a,b,okA,okB}}, eq: {E<id>: {装备}}}
    isleOffer: null,          // v227：外岛交付 {id,fromName,need[],give[],done}
    cook: null,               // {put:{pid:{cardId}}, ok:{pid}, ready:[]}
    round: 1,
    discard: [],
    ground: [],               // 地图中间的地面拾取区（肉牛掉落等）
    nightW: 'clear',
    stat: { wins: 0, escaped: false },
    ships: [],                /* v160：每造出一艘船就多一条可撤离的船（{id,by,byName,takenBy}） */
    bonfireWinDay: 0,         /* v160：篝火建成后，第二天白天直接胜利 */
    bonfireByName: '',
    ended: null,
    lastActive: Date.now(),
    cards: new Map(),         // id -> card
    common: {
      pot: { built: true, food: null },
      furnace: { built: false, topCard: null, outCard: null, burning: false, lit: false },
      bonfire: { built: false, hp: 3, maxHp: 3 },
      shelter: { built: false, dur: 0 },
      chest: { built: false, slots: [], owner: null },
      treehole: { built: false },
      boat: { built: false },
      feasts: [],             // 公共就餐区（{id,cal,owner}）
    },
    npcs: [],                 // {key,name,seat,side,pid,alive,hp,maxHp,atk,task}
    cat: null,                // v194 小猫咪：{arrived,born,feed:{pid:n},gift:{from,card}}
    treeFed: {},              // v194 小猫咪的投喂记录 {pid:n}
  };
  return r;
}

/* 同名重连：把旧 socket id 换成新 id，别把交易/战斗/NPC 的引用弄断 */
function remapId(r, from, to) {
  if (!from || !to || from === to) return;
  if (r.trade && r.trade.pairs) {
    for (const pr of Object.values(r.trade.pairs)) {
      if (pr.a === from) pr.a = to;
      if (pr.b === from) pr.b = to;
    }
  }
  if (r.fight && Array.isArray(r.fight.order)) {
    r.fight.order = r.fight.order.map((x) => (x === from ? to : x));
  }
  if (r.cook) {
    if (r.cook.put && from in r.cook.put) { r.cook.put[to] = r.cook.put[from]; delete r.cook.put[from]; }
    if (r.cook.ok && from in r.cook.ok) { r.cook.ok[to] = r.cook.ok[from]; delete r.cook.ok[from]; }
  }
  (r.npcs || []).forEach((n) => { if (n.pid === from) n.pid = to; });
}

/* ---------------- 玩家 ---------------- */
const BUFF_META = {
  ghost: { name: '恶鬼附体', eff: '今天消耗的食物加倍', img: 'buff_ghost' },
  worm: { name: '寄生虫', eff: '每天结束 -1 生命', img: '' },
  wound: { name: '伤口', eff: '今天不能外出搜索', img: 'buff_wound' },
  venom: { name: '蛇毒', eff: '今天消耗的食物加倍', img: 'buff_venom' },
  snake: { name: '蛇毒（重伤）', eff: '今天受到的伤害翻倍', img: 'buff_venom' },
  hunger: { name: '饥饿', eff: '明天再挨饿就会死亡', img: 'buff_hunger' },
  noeat: { name: '不能进食', eff: '暂时吃不下东西', img: 'buff_noeat' },
  taunt: { name: '嘲讽', eff: '怪物会优先攻击带嘲讽的人', img: 'buff_taunt' },
  inspire: { name: '鼓舞', eff: '伤害 +1，持续一回合', img: 'buff_inspire' },
};

function buffsOf(p) {
  const out = [];
  if (p.satImmune) out.push({ key: 'satimmune', name: '免疫饥饿', eff: '可以挡下一次饥饿（不掉血也不挂 buff）', img: '', days: 1, max: 1, good: 1 });
  /* v178：饥饿 buff 也要像别的负面 buff 一样挂在角色身上（灰色鸡腿图标） */
  if (Number(p.satBuff || 0) > 0) {
    out.push({ key: 'hunger', name: '饥饿', eff: '明天再挨饿就会死亡', img: 'buff_hunger', days: Number(p.satBuff), max: Math.max(2, Number(p.satBuff)) });
  }
  /* 嘲讽：谁手上有盾牌，谁就顶着嘲讽，怪物优先打他 */
  if ((p.equip || []).some((e) => e.key === 'shield' && (!e.maxDur || e.dur > 0))) {
    out.push({ key: 'taunt', name: '嘲讽', eff: '怪物会优先攻击带嘲讽的人', img: 'buff_taunt', days: 1, max: 1 });
  }
  /* 鼓舞：伤害 +1，持续一回合 */
  if (Number(p.inspire || 0) > 0) {
    out.push({ key: 'inspire', name: '鼓舞', eff: '伤害 +1，持续一回合', img: 'buff_inspire', days: Number(p.inspire), max: Math.max(1, Number(p.inspire)) });
  }
  /* 疲劳：搜索阶段结束时随机挂上，饱食度满了才会消失 */
  if (p.fatigue) {
    out.push({ key: 'fatigue', name: '疲劳', eff: '探索点数 -1，吃饱了才会好', img: '', days: 1, max: 1 });
  }
  /* v213/v234：村民「家畜亲和」常驻 —— 对猫、牛、兔、羊的伤害翻倍（狗不算） */
  if (p && p.charId === 'vill') {
    out.push({ key: 'beastfriend', name: '家畜亲和', eff: '对猫、牛、兔、羊的伤害翻倍', img: 'buff_fam', days: 0, max: 0, good: 1, perm: true });
  }
  /* v234：骑士装上长矛后「人枪合一」——长枪伤害 +2（5 + 2 = 7） */
  if (p && p.charId === 'haft' && hasEquip(p, 'spear')) {
    out.push({ key: 'onespear', name: '人枪合一', eff: '长枪的伤害 +2', img: 'buff_spear', days: 0, max: 0, good: 1, perm: true });
  }
  /* v234：游侠「扔石头」 */
  if (p && p.charId === 'ranger') {
    out.push({ key: 'stoneplus', name: '扔石头的伤害 +1', eff: '扔石头的伤害 +1', img: 'buff_stone', days: 0, max: 0, good: 1, perm: true, tip: '扔石头的伤害 +1' });
  }
  /* v234：精灵「好运常在」 */
  if (p && p.charId === 'fei') {
    out.push({ key: 'lucky', name: '好运常在', eff: '好运常在', img: 'buff_luck', days: 0, max: 0, good: 1, perm: true, tip: '好运常在' });
  }
  for (const k of ['ghost', 'worm', 'wound', 'venom', 'snake']) {
    const d = Number(p[k] || 0);
    if (d > 0) out.push({ key: k, name: BUFF_META[k].name, eff: BUFF_META[k].eff, img: BUFF_META[k].img, days: d, max: Number(p[k + 'Max'] || d) });
  }
  return out;
}

/* v195：清掉一个负面 buff（「丰盛的」有几率压下去） */
function clearBuff(r, p) {
  if (!p) return null;
  for (const k of ['venom', 'ghost', 'wound', 'snake', 'worm']) {
    if (Number(p[k] || 0) > 0) {
      const name = (BUFF_META[k] || {}).name || k;
      p[k] = 0;
      p[k + 'Max'] = 0;
      return name;
    }
  }
  if (Number(p.satBuff || 0) > 0) { p.satBuff = 0; return '饥饿'; }
  if (p.fatigue) { p.fatigue = false; return '疲劳'; }
  return null;
}

/* 加一个 buff（同种刷新天数而不是叠加） */
function addBuff(r, p, key, days, why) {
  if (!p || !BUFF_META[key]) return;
  const d = Math.max(1, Number(days) || 1);
  const cur = Number(p[key] || 0);
  p[key] = Math.max(cur, d);
  p[key + 'Max'] = Math.max(Number(p[key + 'Max'] || 0), d);
  if (why) addLog(r, PN(p) + ' 获得「' + BUFF_META[key].name + '」：' + why);
}

function newIslandPlayer(r, id, name, seat) {
  const cfg = roomCfg(r);
  const p = {
    id, name, seat,
    hp: cfg.startHp, maxHp: cfg.maxHp,
    sat: cfg.startSat, satMax: cfg.maxSat, handLimit: cfg.handMax,
    satBuff: 0,          // 饥饿 buff（下次再挨饿直接死亡）
    fatigue: false,      // 随机疲劳：搜索阶段结束按难度概率抽，饱食度满了才消失
    wound: 0,            // 伤口：次日不能搜索、之后探索 -1
    venom: 0,            // 蛇毒剩余天数（食量翻倍）
    snake: 0,            // v157：蛇毒（重伤）剩余天数：受到的伤害翻倍
    ghost: 0,            // 恶鬼附体：食量翻倍
    worm: 0,             // 寄生虫：每天 -1 生命
    hand: [],
    equip: [],           // [{id,key,name,dur,maxDur}]
    eaten: 0,
    searchedToday: false,
    tradeBox: [],        // 交付阶段：我放在自己框里的卡
    mealBox: [],         // 烹饪：我投入的卡
  eatBox: [],          // 烹饪：已经放进我进食框的盛宴
  serveOk: false,      // 烹饪：我确认吃饭了
  eatGain: 0,          // 上一顿回了多少饱食（前端做跳动动画）
    knownWeather: 2,
    outTonight: false,
    makeupBuild: false,   // 夜里外出：第二天先补一次建造
    makeupDone: true,
    sleepMat: false,
    alive: true,
    joinedAt: Date.now(),
  };
  r.players.set(id, p);
  return p;
}

/* 中央播报（抽到 NPC / 翻出怪物 / 倒下），客户端弹 2 秒后飘进日志 */
function pushFeed(r, kind, text, tone) {
  if (!r.feed) r.feed = [];
  r.feed.push({ id: uid('fd'), kind: kind, text: text, tone: tone || '', t: Date.now() });
  if (r.feed.length > 12) r.feed.splice(0, r.feed.length - 12);
}

function addLog(r, msg, tone) {
  /* v226：日志带上「第几天」—— 导出的 txt 以前全挤在第一天 */
  const rec = { t: Date.now(), day: r.day, msg: msg };
  if (tone) rec.tone = tone;
  r.log.push(rec);
  if (r.log.length > 120) r.log.splice(0, r.log.length - 120);
}

/* v164：四类产出各配一条音效，走现有广播让全房间每人各播一遍。
   kind：horn=图纸成品、bubble=学者研究、clank=火炉出炉、snare=锅做出菜。
   只是音效，不改任何数值；同一秒同类只播一次（客户端去重）。 */
function craftSfx(r, kind) {
  if (!r || !kind) return;
  if (!Array.isArray(r.sfxEvents)) r.sfxEvents = [];
  r.sfxEvents.push({ kind: kind, at: Date.now() });
  if (r.sfxEvents.length > 8) r.sfxEvents.splice(0, r.sfxEvents.length - 8);
}

/* ---------------- 天气 / 周 ---------------- */
/* 每周固定野怪日：第 1 周 65% 抽 1 天，第 2 周 50%，第 3 周 20% */
function monsterDayCount(week) {
  const oneDayRate = week >= 3 ? 0.20 : (week === 2 ? 0.50 : 0.65);
  return Math.random() < oneDayRate ? 1 : 2;
}

/* v232：哪天没排过天气就补一次——望远镜要提前看 5 天，跨周也要看得到 */
function ensureWeather(r, day) {
  if (!(day >= 1 && day <= 21)) return null;
  if (!r.weather[day - 1]) r.weather[day - 1] = (day === 1) ? 'clear' : pickW(WEATHER).key;
  return r.weather[day - 1];
}

function scheduleWeek(r) {
  const week = Math.ceil(r.day / 7);
  if (r.weekScheduled >= week) return;
  r.weekScheduled = week;
  const start = (week - 1) * 7;
  for (let d = 0; d < 7; d++) {
    const day = start + d + 1;
    if (day > 21) break;
    if (!r.weather[day - 1]) r.weather[day - 1] = (day === 1) ? 'clear' : pickW(WEATHER).key;
  }
  /* 本周固定野怪日：1~2 天；全局前 4 天不刷 */
  const cands = [];
  for (let d = 0; d < 7; d++) {
    const day = start + d + 1;
    if (day < 5 || day > 21) continue;
    cands.push(day);
  }
  r.monsterDays = r.monsterDays.filter((d) => d >= start + 1);
  if (cands.length) {
    const n = monsterDayCount(week);
    shuffle(cands);
    for (let i = 0; i < Math.min(n, cands.length); i++) r.monsterDays.push(cands[i]);
    r.monsterDays.sort((a, b) => a - b);
  }
  addLog(r, '第 ' + week + ' 周开始。天气只能提前知道一天，明天的天气看顶栏。');
  if (r.monsterDays.includes(r.day + 1)) addLog(r, '明天会有野怪出没，小心。');
}

function todayWeather(r) { return WMAP[r.weather[r.day - 1]] || WMAP.clear; }

/* v168：老奶奶（乌姆）改天气 = 「失败累积」
   - 房间级成功率存在 r.umWxRate：初始 0.10，失败一次 +0.01（上限 1），成功一次复位 0.10
   - 跨天不清零，直到成功；重开房间是新的房间对象，自然回到 0.10
   - 概率只活在服务端：不写日志、不进公告、不上 UI、不进 toast */
function umPickWeather(r, p, want) {
  const from = todayWeather(r).key || 'clear';
  const rate = (typeof r.umWxRate === 'number' && r.umWxRate > 0) ? r.umWxRate : 0.10;
  const ok = Math.random() < rate;
  r.umWxRate = ok ? 0.10 : Math.min(1, rate + 0.01);
  if (ok) {
    r.weather[r.day - 1] = want.key;
    r.wxDone = { by: PN(p), from: from, to: want.key, ok: true, at: Date.now() };
    addLog(r, '老奶奶成功了！今天变成了「' + want.name + '」', 'gold');
    pushFeed(r, 'wx', PN(p) + ' 改变了天气：「' + want.name + '」', 'gold');
  } else {
    r.wxDone = { by: PN(p), from: from, to: want.key, ok: false, at: Date.now() };
    addLog(r, '老奶奶没能改变今天的天气', 'red');
  }
  return { ok: ok, rate: r.umWxRate };
}

/* 夜晚天气：晴 50%，雨/雾/雷雨 各 1/6（合计 50%），与白天、次日都无关 */
const NIGHT_W = [
  { key: 'clear', name: '晴', w: 0.5, sp: 3, food: 2 },
  { key: 'rain', name: '雨', w: 1 / 6, sp: 1, food: 1 },
  { key: 'fog', name: '雾', w: 1 / 6, sp: 2, food: 3 },
  { key: 'storm', name: '雷雨', w: 1 / 6, sp: 0, food: 1 },
];

function rollNightWeather() {
  let x = Math.random();
  for (const w of NIGHT_W) { if (x < w.w) return w.key; x -= w.w; }
  return 'clear';
}

function nightWeather(r) {
  if (!r.nightW) r.nightW = rollNightWeather();
  return NIGHT_W.find((w) => w.key === r.nightW) || NIGHT_W[0];
}

/* v157：蛇毒（重伤）期间，玩家受到的伤害翻倍 */
function playerDmg(p, n) {
  const base = Number(n) || 0;
  if (!p || base <= 0) return base;
  return Number(p.snake || 0) > 0 ? base * 2 : base;
}

/* v157：夜晚外出额外掷一次 25% 特殊事件（五项各 5%，互斥；75% 什么都不发生） */
const NIGHT_EVENTS = [
  { key: 'cat', w: 0.05 },
  { key: 'snake', w: 0.05 },
  { key: 'dog', w: 0.05 },
  { key: 'spring', w: 0.05 },
  { key: 'gift', w: 0.05 },
];
function rollNightEvent() {
  let x = Math.random();
  for (const e of NIGHT_EVENTS) { if (x < e.w) return e.key; x -= e.w; }
  return null;
}
function nightSpecialEvent(r, p) {
  const k = rollNightEvent();
  if (!k) return null;
  if (k === 'cat') {
    addBuff(r, p, 'wound', 2, '外出时被猫抓伤，伤口未愈，明天没法搜索');
  } else if (k === 'snake') {
    addBuff(r, p, 'snake', 2, '外出时被蛇咬了一口，蛇毒未清，今天受到的伤害翻倍');
  } else if (k === 'dog') {
    p.hp = Math.max(0, p.hp - 1);
    addLog(r, PN(p) + ' 外出时被野狗扑了一下，生命 -1（' + p.hp + '/' + (p.maxHp || MAX_HP) + '）', 'red');
    if (p.hp <= 0) killPlayer(r, p);
  } else if (k === 'spring') {
    p.hp = Math.min(p.maxHp || MAX_HP, p.hp + 1);
    addLog(r, PN(p) + ' 找到一眼圣泉，喝了一口，生命 +1（' + p.hp + '/' + (p.maxHp || MAX_HP) + '）', 'gold');
  } else if (k === 'gift') {
    const keys = Object.keys(RECIPES).filter((x) => RECIPES[x].place === 'equip');
    const key = keys[Math.floor(Math.random() * keys.length)];
    const rec = RECIPES[key];
    const c = makeCard('equip', { key, name: rec.name, dur: rec.dur || 0, maxDur: rec.dur || 0 });
    r.cards.set(c.id, c);
    p.hand.push(c.id);
    addLog(r, PN(p) + ' 在草丛里捡到一件别人落下的成品：' + rec.name + '（已经放进手牌）', 'green');
  }
  return k;
}

/* v224：夜里撞上野兽 —— 不再排进明天的战斗，当场掷一次遭遇结果
   2/5 躲开（没被打到）、1/5 直接扣血、1/5 中毒、1/5 受伤（都只压明天一天） */
const NIGHT_MON_TXT = {
  escape: [
    '{m} 的脚步声就在旁边 —— 赶紧钻进岩缝里，等它走远了才敢出来。',
    '{m} 在附近嗅了两圈，火把的余味把它引到别处去了。',
    '远远看见 {m} 的影子，贴着崖壁一动不动，它从身边过去了。',
    '扔出一块石头把 {m} 引开，自己绕了另一条路回来。',
    '爬到一棵歪脖子树上躲着，{m} 在下面转了半天，最后走开了。',
  ],
  hurt: [
    '{m} 从背后撞过来，人摔在礁石上，生命 -{d}（现在 {hp}/{mx}）',
    '{m} 扑了一下，肩膀被撕开一道口子，生命 -{d}（现在 {hp}/{mx}）',
    '跟 {m} 拉扯的时候被划了一爪子，生命 -{d}（现在 {hp}/{mx}）',
    '{m} 咬住火把一甩，人也跟着摔出去，生命 -{d}（现在 {hp}/{mx}）',
    '{m} 从草丛里窜出来撞在腰上，生命 -{d}（现在 {hp}/{mx}）',
  ],
  poison: [
    '{m} 身上的一根毒刺扎进小腿，伤口发黑 —— 中毒了，明天受到的伤害翻倍。',
    '被 {m} 咬了一口，毒顺着血管往上走 —— 中毒了，明天受到的伤害翻倍。',
    '{m} 擦身而过，脖子上忽然一阵发麻 —— 中毒了，明天受到的伤害翻倍。',
    '拽回来的枝条上沾着 {m} 的毒液，手一麻 —— 中毒了，明天受到的伤害翻倍。',
  ],
  wound: [
    '{m} 抓了一道，血止住了但伤口还张着 —— 明天没法搜索。',
    '被 {m} 顶了一下，肋骨生疼，喘口气都费劲 —— 明天没法搜索。',
    '{m} 甩尾扫到腿上，皮开肉绽 —— 明天没法搜索。',
    '好不容易甩开 {m}，腿上却留下一个深口子 —— 明天没法搜索。',
  ],
};
function nightMonRoll() {
  const x = Math.random();
  if (x < 0.4) return 'escape';
  if (x < 0.6) return 'hurt';
  if (x < 0.8) return 'poison';
  return 'wound';
}
function nightMonsterEncounter(r, p, monKey, forceKey) {
  const mname = monKey === 'ox' ? '肉牛' : (((MONSTERS || {})[monKey] || {}).name || '野兽');
  const kind = forceKey || nightMonRoll();
  const pool = NIGHT_MON_TXT[kind] || NIGHT_MON_TXT.escape;
  const line = pool[Math.floor(Math.random() * pool.length)];
  const fill = (txt, d) => String(txt)
    .replace(/\{m\}/g, mname)
    .replace(/\{d\}/g, String(d || 1))
    .replace(/\{hp\}/g, String(p.hp))
    .replace(/\{mx\}/g, String(p.maxHp || MAX_HP));
  if (kind === 'hurt') {
    const d = playerDmg(p, 1);
    p.hp = Math.max(0, p.hp - d);
    addLog(r, PN(p) + ' 夜里撞上【' + mname + '】：' + fill(line, d), 'red');
    if (p.hp <= 0) killPlayer(r, p);
  } else if (kind === 'poison') {
    addLog(r, PN(p) + ' 夜里撞上【' + mname + '】：' + fill(line), 'red');
    addBuff(r, p, 'snake', 2, '');   /* 叙事已经在上面那条彩色日志里说清楚了 */
  } else if (kind === 'wound') {
    addLog(r, PN(p) + ' 夜里撞上【' + mname + '】：' + fill(line), 'red');
    addBuff(r, p, 'wound', 2, '');   /* 叙事已经在上面那条彩色日志里说清楚了 */
  } else {
    addLog(r, PN(p) + ' 夜里撞上【' + mname + '】：' + fill(line));
  }
  return kind;
}

/* 外出能带回来的探索点：晴天 3、雾 2、雨/雷雨 1；雨天带雨伞按晴天算 */
function nightPoints(r, withUmbrella) {
  const w = nightWeather(r);
  if (w.key === 'rain' && withUmbrella) return w.sp + 1;
  return w.sp;
}

/* ---------------- 阶段推进 ---------------- */
/* v215：「船」图纸第 20 天保底 —— 全队手里都没有、也还没造出船，就给手牌最少的人一张 */
function boatBlueprintGuarantee(r) {
  if (!r || r.ended) return;
  if (Number(r.day) < 20) return;
  if ((r.ships || []).length) return;
  const alive = [...r.players.values()].filter((p) => p && p.alive && !p.escaped);
  if (!alive.length) return;
  const isBoat = (c) => !!c && c.kind === 'blueprint' && (c.key === 'boat' || c.bp === 'boat');
  const held = alive.some((p) => (p.hand || []).some((id) => isBoat(r.cards.get(id))));
  if (held) return;
  alive.sort((a, b) => ((a.hand || []).length - (b.hand || []).length));
  const who = alive[0];
  const c = makeCard('blueprint', { key: 'boat', name: '船', bp: 'boat' });
  r.cards.set(c.id, c);
  who.hand.push(c.id);
  markBpSeen(r, 'boat');
  addLog(r, '第 20 天了，船还没造出来 —— ' + PN(who) + ' 手里多了一张「船」的图纸', 'gold');
}
function startDay(r) {
  r.research = null;
  r.job = null;
  r.jobs = {};
  for (const pl of r.players.values()) { pl.researchDone = false; pl.craftDone = false; pl.inspire = 0; }
  /* v194：小猫咪把前一天收下的东西送给别人 */
  catDawnGift(r);
  if (r.day > 21) return endGame(r, 'lose', '21 天到，没能逃出瓦格');
  scheduleWeek(r);
  r.phase = 'search';
  clearSearchAuto(r);
  r.trade = null;
  r.isleOffer = null;
  r.cook = null;
  r.pendingFight = null;
  r.fight = null;
  r.fixedSpawned = false;
  r.stormDone = false;
  /* v232：望远镜每天 2/3 概率掉一点耐久（一共 4 点，用坏了预报就没了） */
  for (const tp of r.players.values()) {
    if (!tp.alive) continue;
    const tel = (tp.equip || []).find((e) => e.key === 'telescope' && (!e.maxDur || e.dur > 0));
    if (tel) wearItem(r, tp, tel, '望远镜');
  }
  r.nightW = rollNightWeather();
  r.wxAsk = null;
  r.tixiAsk = null;
  for (const p of r.players.values()) {
    p.searchedToday = false;
    p.tixiUsedToday = false;
    p.hendlerToday = false;
    p.tixiPickTonight = false;
    p.umbUsedDay = false;
    p.tradeBox = [];
    p.mealBox = [];
    /* v177：夜里外出回来已经在「夜晚建造阶段」建过了，白天不再补一次建造
       （不再有补建造的提示，也没有补建造的功能） */
    p.makeupBuild = false;
    p.makeupDone = true;
    p.outTonight = false;
    p.sleepMat = false;
    /* v213：昨晚睡了草席 → 今天探索 +1（今天用完再清掉） */
    p.matSleep = !!p.matNextDay;
    p.matNextDay = false;
    p.nightDone = false;
    p.cookOk = false;
    p.satSpent = 0;
    if (p.worm > 0) {
      p.hp = Math.max(1, p.hp - 1);
      addLog(r, PN(p) + ' 被寄生虫折腾，- 1 生命');
    }
    if (p.wound > 0) p.wound = Math.max(0, p.wound - 1);
    /* v173：老奶奶起床改天气从「第二天清晨」才开始（第一天开局那次不算，别在第一天就弹她的框） */
    if (p.charId === 'um' && p.alive && r.day >= 2) r.wxAsk = { pid: p.id, name: PN(p), done: false };
    if (p.venom > 0) p.venom = Math.max(0, p.venom - 1);
    if (p.snake > 0) p.snake = Math.max(0, p.snake - 1);
    if (p.ghost > 0) p.ghost = Math.max(0, p.ghost - 1);
    if (p.worm > 0) p.worm = Math.max(0, p.worm - 1);
    if (p.satBuff > 0) p.satBuff = Math.max(0, p.satBuff - 1);
  }
  /* NPC 每日回报 */
  npcDaily(r);
  addLog(r, '第 ' + r.day + ' 天（第 ' + Math.ceil(r.day / 7) + ' 周）· ' + todayWeather(r).name + '：探索点 ' + explorePoints(r) + '，消耗饱食度 ' + foodCost(r));
  /* v215：到第 20 天手里还是没有「船」图纸 —— 保证能撤离，直接塞给手牌最少的人 */
  boatBlueprintGuarantee(r);
  /* v234：昨天巫婆说的「明天翻倍 / 明天没有」今天生效 */
  if (r.drawMulNext && r.drawMulNext.day === r.day) r.drawMul = r.drawMulNext;
  else if (r.drawMul && r.drawMul.day !== r.day) r.drawMul = null;
  r.drawMulNext = null;
  if (r.drawMul && r.drawMul.day === r.day) {
    addLog(r, '（' + r.drawMul.why + '：今天的探索点 ×' + r.drawMul.mul + '）', 'gold');
  }
  witchRoll(r);
  /* v234：跟着萨图离开的人，清晨先叫回来（交付阶段一开始也会再结算一次） */
  satuReturn(r);
  /* v155：起床后先分药、再等乌姆改天气，最后才进搜索 */
  dawnStart(r);
}

/* ---------- v155：清晨三步（分药 → 乌姆改天气 → 搜索） ---------- */
function medCardsOf(r, p) {
  return (p.hand || []).map((id) => r.cards.get(id)).filter((c) => c && c.kind === 'item' && (c.key === 'heal' || c.key === 'clean'));
}
function clearDawn(r) {
  r.dawn = null;
  if (r.dawnT) { clearTimeout(r.dawnT); r.dawnT = null; }
}
function dawnArm(r, ms) {
  if (r.dawnT) { clearTimeout(r.dawnT); r.dawnT = null; }
  const dayAt = r.day;
  r.dawnT = setTimeout(() => {
    r.dawnT = null;
    try {
      if (!r || r.ended || r.phase !== 'dawn' || r.day !== dayAt) return;
      dawnNext(r);
      broadcastAll(r);
    } catch (err) {}
  }, ms || 1000);
}
function enterSearchPhase(r) {
  clearDawn(r);
  r.phase = 'search';
  addLog(r, '进入搜索阶段');
  armSearchAuto(r);
  broadcastAll(r);
}
function dawnMedStep(r) {
  const holders = [...r.players.values()].filter((p) => p.alive && medCardsOf(r, p).length);
  if (holders.length) {
    r.dawn = { step: 'med', pid: holders[0].id, name: PN(holders[0]), holders: holders.map((p) => p.id), at: Date.now() };
    addLog(r, '清晨第二步：' + PN(holders[0]) + ' 正在给药（其他人等着，发完再看天气）');
  } else {
    r.dawn = { step: 'med', pid: '', name: '', holders: [], at: Date.now(), empty: true };
    addLog(r, '清晨第二步：今天没有人需要给药，直接跳过');
    dawnArm(r, 1000);
  }
}
function dawnStart(r) {
  clearDawn(r);
  r.phase = 'dawn';
  /* v234：老巫婆天亮就来（10%），她走了才分药 */
  if (r.witch && !r.witch.done) {
    r.dawn = { step: 'witch', pid: r.witch.pid, name: r.witch.name, holders: [], at: Date.now() };
    addLog(r, '清晨第一步：老巫婆拄着拐杖站在 ' + r.witch.name + ' 床边，说要给（他/她）试试新研制的魔法');
  } else {
    dawnMedStep(r);
  }
  broadcastAll(r);
}
function dawnNext(r) {
  if (!r || r.phase !== 'dawn') return;
  if (r.dawn && r.dawn.step === 'witch') {
    /* 还在等他回答 —— 巫婆不走，谁也别想动 */
    if (r.witch && !r.witch.done) return;
    dawnMedStep(r);
    broadcastAll(r);
    return;
  }
  if (r.dawn && r.dawn.step === 'med') {
    if (r.wxAsk && !r.wxAsk.done) {
      r.dawn = { step: 'wx', pid: r.wxAsk.pid, name: r.wxAsk.name, holders: [], at: Date.now() };
      addLog(r, '清晨第二步：' + r.wxAsk.name + ' 正在试图改变天气（其他人等着）');
      broadcastAll(r);
      return;
    }
    enterSearchPhase(r);
    return;
  }
  enterSearchPhase(r);
}
/* v234：老巫婆 —— 每天清晨 10% 来访，随机面见一位玩家 */
function witchRoll(r) {
  r.witch = null;
  if (r.day < 2) return;
  if (Math.random() >= 0.10) return;
  const alive = [...r.players.values()].filter((p) => p.alive && !p.away);
  if (!alive.length) return;
  const who = alive[Math.floor(Math.random() * alive.length)];
  r.witch = { pid: who.id, name: PN(who), done: false, at: Date.now() };
  pushFeed(r, 'witch', '老巫婆来了，径直走向 ' + PN(who), 'fate');
  /* 怕那个人掉线/发呆：90 秒不回答就当她走了，别把全桌卡死 */
  if (r.witchT) { clearTimeout(r.witchT); r.witchT = null; }
  const wRef = r.witch;
  r.witchT = setTimeout(() => {
    r.witchT = null;
    try {
      if (!r || r.ended || r.witch !== wRef || wRef.done) return;
      wRef.done = true;
      wRef.accept = false;
      addLog(r, '老巫婆等了半天没等到 ' + wRef.name + ' 回话，嘟囔一句就走了', 'dim');
      if (r.phase === 'dawn') dawnNext(r);
      broadcastAll(r);
    } catch (err) {}
  }, 90000);
}
function witchAnswer(r, p, accept) {
  if (!r.witch) return '老巫婆已经走了';
  if (r.witch.done) return '你已经回答过老巫婆了';
  if (r.witch.pid !== p.id) return '老巫婆找的是 ' + r.witch.name;
  const w = r.witch;
  w.done = true;
  w.accept = !!accept;
  if (r.witchT) { clearTimeout(r.witchT); r.witchT = null; }
  if (!accept) {
    addLog(r, PN(p) + ' 拒绝了老巫婆的魔法');
    if (Math.random() < 0.25) {
      p.hp -= 1;
      addLog(r, '老巫婆脸色一沉，抬手就是一下：' + PN(p) + ' -1 生命', 'red');
      if (p.hp <= 0) killPlayer(r, p);
    } else {
      addLog(r, '老巫婆耸耸肩，嘟囔着「不识货」，拄着拐杖走了');
    }
  } else {
    const good = Math.random() < 0.5;
    if (good) {
      r.drawMul = { day: r.day, mul: 0, why: '巫婆的魔法' };
      r.drawMulNext = { day: r.day + 1, mul: 2, why: '巫婆的魔法' };
      addLog(r, '一滴药水下去，' + PN(p) + ' 一整天都昏昏沉沉 —— 全队今天一张卡都抽不到，明天翻倍抽卡', 'gold');
    } else {
      r.drawMul = { day: r.day, mul: 2, why: '巫婆的魔法' };
      r.drawMulNext = { day: r.day + 1, mul: 0, why: '巫婆的魔法' };
      addLog(r, '药水入口是甜的 —— 全队今天翻倍抽卡，但明天一张也抽不到', 'gold');
    }
  }
  dawnNext(r);
  broadcastAll(r);
  return null;
}
function dawnNextBy(r, p) {
  if (r.phase === 'dawn' && r.dawn && r.dawn.step === 'witch' && r.witch && !r.witch.done) {
    return '老巫婆还在等 ' + r.witch.name + ' 回答';
  }
  if (r.phase !== 'dawn' || !r.dawn) return '现在不是清晨';
  if (r.dawn.step === 'med') {
    if (r.dawn.pid && r.dawn.pid !== p.id) {
      const h = r.players.get(r.dawn.pid);
      if (h && h.alive && medCardsOf(r, h).length) return '现在是 ' + r.dawn.name + ' 在给药，等他发完';
    }
    dawnNext(r);
    return null;
  }
  if (r.dawn.step === 'wx') {
    if (r.dawn.pid && r.dawn.pid !== p.id) return (r.dawn.name || '乌姆') + ' 正在试图改变天气，等他选完';
    if (r.wxAsk && !r.wxAsk.done) {
      r.wxAsk.done = true;
      addLog(r, PN(p) + ' 放弃了改变天气');
    }
    dawnNext(r);
    return null;
  }
  dawnNext(r);
  return null;
}

function explorePoints(r, forP) {
  const w = todayWeather(r);
  const cfg = roomMode(r);
  /* 雷雨天固定：不受模式加成影响 */
  if (w.key === 'storm') return 0;
  let sp = Math.round(w.sp * (cfg.spMul || 1)) + (cfg.spAdd || 0);
  return Math.max(0, sp);
}

function hasEquip(p, key) { return (p.equip || []).some((e) => e.key === key && (!e.maxDur || e.dur > 0)); }

/* 白天用伞：雨天/炎日 +1 探索点（纯计算，不扣耐久；只有真去搜索才扣一次） */
function umbrellaDay(r, p) {
  const w = todayWeather(r);
  if (w.key !== 'rain' && w.key !== 'hot') return 0;
  if (p.umbUsedDay) return 0;
  const u = (p.equip || []).find((e) => e.key === 'umbrella' && (!e.maxDur || e.dur > 0));
  return u ? 1 : 0;
}

/* 真正用掉一次伞（每天最多一次） */
function useUmbrellaDay(r, p) {
  if (!umbrellaDay(r, p)) return 0;
  p.umbUsedDay = true;
  const u = (p.equip || []).find((e) => e.key === 'umbrella' && (!e.maxDur || e.dur > 0));
  if (u && u.maxDur) wearItem(r, p, u, '雨伞');
  return 1;
}

/* 随机疲劳：每次搜索阶段结束按难度概率抽；饱食度满了才会消失，存在期间探索点数 -1 */
function fatigueRate(r) {
  const d = roomDiff(r) || {};
  return Number(d.fatigue || 0);
}
/* v216：这一锅会变成几份「粑粑」（0 / 1 / 2）——难度越高越容易 */
function rollPoop(r) {
  const cfg = (roomDiff(r) || {}).poop || {};
  const two = Number(cfg.two || 0), one = Number(cfg.one || 0);
  if (!(two > 0) && !(one > 0)) return 0;
  if (two > 0 && Math.random() < two) return 2;
  if (one > 0 && Math.random() < one) return 1;
  return 0;
}
function rollFatigue(r) {
  const rate = fatigueRate(r);
  if (!(rate > 0)) return;
  for (const p of r.players.values()) {
    if (!p.alive || p.fatigue) continue;
    if (Math.random() < rate) {
      p.fatigue = true;
      addLog(r, PN(p) + ' 累得不行，挂上了「疲劳」（探索点数 -1，吃饱了才会好）', 'red');
    }
  }
}
function clearFatigueIfFull(r, p) {
  if (!p || !p.fatigue) return;
  if (Number(p.sat || 0) >= Number(p.satMax || 0)) {
    p.fatigue = false;
    addLog(r, PN(p) + ' 吃饱了，缓过来了，「疲劳」消失');
  }
}

function playerExplorePoints(r, p) {
  /* 伤口：今天搜索数量固定为 0，任何增益（睡草席、雨伞、岛屿修正）都不能加回来 */
  if (p.wound > 0) return 0;
  if (p.away) return 0;
  let sp = explorePoints(r, p);
  if (p.matSleep) sp += 1;
  sp += umbrellaDay(r, p);
  if (p.fatigue) sp -= 1;
  /* v234：巫婆的魔法 —— 今天 0 张或翻倍 */
  if (r.drawMul && r.drawMul.day === r.day) sp = Math.round(sp * Number(r.drawMul.mul));
  return Math.max(0, sp);
}

function foodCost(r, p) {
  const w = todayWeather(r);
  const cfg = roomMode(r);
  /* 雷雨天固定吃 1 点，不受模式加成 */
  let f = (w.key === 'storm') ? 1 : (Math.round(w.food * (cfg.foodMul || 1)) + (cfg.foodAdd || 0));
  if (p && (p.venom > 0 || p.ghost > 0)) f *= 2;
  return f;
}

/* 任意天气在当前模式下的真实数值（与底部玩家面板同一套算法，预报也用它） */
function weatherValues(r, w) {
  const cfg = roomMode(r);
  const key = (w && w.key) || 'clear';
  const sp = (key === 'storm') ? 0 : Math.max(0, Math.round((w.sp || 0) * (cfg.spMul || 1)) + (cfg.spAdd || 0));
  const food = (key === 'storm') ? 1 : (Math.round((w.food || 1) * (cfg.foodMul || 1)) + (cfg.foodAdd || 0));
  return { sp: sp, food: food };
}

/* ---------------- v195 建造阶段的私人作业：医生 / 农夫 / 厨师 / 疯狂科学家 ---------------- */
const CRAFT_ROLE = { doc: '医生', farmer: '农夫', chef: '厨师', mad: '疯狂科学家' };
const CRAFT_NEED = { doc: 2, farmer: 3, chef: 2, mad: 3 };

function craftPending(r) {
  const list = [];
  for (const p of r.players.values()) {
    if (p && p.alive && CRAFT_ROLE[p.charId] && !p.craftDone) list.push(p);
  }
  return list;
}
/* v213：每个人一个作业，大家同时开工、各做各的 */
function jobsList(r) {
  if (!r.jobs) r.jobs = {};
  return Object.keys(r.jobs).map((k) => r.jobs[k]).filter(Boolean);
}
function jobOf(r, p) {
  return (r.jobs && p && r.jobs[p.id]) || null;
}
function jobCards(r, ids) {
  return (ids || []).map((id) => r.cards.get(String(id))).filter(Boolean);
}
function jobValid(job, cards) {
  if (!job) return false;
  const own = (c) => c && c.kind;
  if (job.charId === 'doc') {
    return cards.length === 2 &&
      cards.some((c) => own(c) === 'material' && c.key === 'grass') &&
      cards.some((c) => own(c) === 'material' && (c.key === 'stone' || c.key === 'wood'));
  }
  if (job.charId === 'farmer') {
    return cards.length >= 1 && cards.length <= 3 &&
      cards.every((c) => c && c.key !== 'junk' && c.kind !== 'food');
  }
  if (job.charId === 'chef') {
    return cards.length >= 1 && cards.length <= 2 && cards.every((c) => own(c) === 'material' && c.key === 'grass');
  }
  if (job.charId === 'mad') return cards.length === 3;
  return false;
}
function jobReason(job, cards) {
  if (!job || job.charId !== 'farmer') return '';
  for (const c of cards) {
    if (!c) continue;
    if (c.key === 'junk') return '这破坏环境';
    if (c.kind === 'food') return '不能浪费食物';
  }
  if (cards.length < 1) return '先挑一份要埋的东西';
  if (cards.length > 3) return '一次最多埋三份';
  return '';
}
function giveCardTo(r, p, card) {
  r.cards.set(card.id, card);
  p.hand.push(card.id);
}
function newSalt() { return makeCard('food', { key: 'salt', name: '盐', cal: 0, noCook: true, seasoned: true }); }
function newMed(key) {
  return key === 'heal'
    ? makeCard('item', { key: 'heal', name: '回血药物' })
    : makeCard('item', { key: 'clean', name: '清创药物' });
}
function spawnHelper(r, key) {
  const t = MONSTERS[key] || MONSTERS.hound;
  r.helpers = r.helpers || [];
  if (r.helpers.length >= 2) return null;
  const h = { id: uid('h'), key: key, name: t.name, hp: Math.max(2, monHp(r, key)), maxHp: Math.max(2, monHp(r, key)), dmg: Math.max(1, t.dmg) };
  r.helpers.push(h);
  return h;
}
/* 医生：一瓶药。只有医生自己知道成的是什么 */
function docResult(cards) {
  const partner = cards.map((c) => c.key).find((k) => k === 'stone' || k === 'wood');
  const roll = Math.random();
  /* v213：草 + 石头 = 回血 70% / 清创 30%；草 + 木头 = 回血 30% / 清创 70% */
  if (partner === 'stone') return { ok: true, key: roll < 0.70 ? 'heal' : 'clean' };
  return { ok: true, key: roll < 0.30 ? 'heal' : 'clean' };
}
/* v231：农夫翻土四等分 —— 1/4 空手、1/4 胡萝卜、1/4 鱼、1/4 大肉 */
function farmerRoll() {
  const x = Math.random();
  if (x < 0.25) return 'none';
  if (x < 0.5) return 'carrot';
  if (x < 0.75) return 'fish';
  return 'meat';
}
function resolveJob(r, p, job, cards) {
  const got = [];
  if (job.charId === 'doc') {
    const res = docResult(cards);
    if (res.ok) { const c = newMed(res.key); giveCardTo(r, p, c); got.push({ name: c.name, mine: true }); }
    return {
      ok: res.ok,
      mine: got,
      /* 别人只看到这句，看不到成没成 */
      publicMsg: '「' + PN(p) + ' 正在研制药物。」'
    };
  }
  if (job.charId === 'farmer') {
    for (const c of cards) {
      /* v231：四等分 —— 1/4 什么都没有、1/4 胡萝卜、1/4 鱼、1/4 大肉 */
      const key = farmerRoll();
      if (key === 'none') { got.push({ name: c.name, fail: true }); continue; }
      const f = FOODS.find((x) => x.key === key);
      const card = makeCard('food', { key: f.key, name: f.name, cal: f.cal });
      giveCardTo(r, p, card);
      got.push({ name: card.name });
    }
    const win = got.filter((g) => !g.fail).length;
    return {
      ok: win > 0,
      mine: got,
      publicMsg: '「' + PN(p) + ' 正在处理废物。」'
    };
  }
  if (job.charId === 'chef') {
    cards.forEach((c, idx) => {
      const must = cards.length === 2 && idx === 0;
      if (must || Math.random() < 0.5) { const sc = newSalt(); giveCardTo(r, p, sc); got.push({ name: '盐' }); }
      else got.push({ name: '盐', fail: true });
    });
    const win = got.filter((g) => !g.fail).length;
    return {
      ok: win > 0,
      mine: got,
      publicMsg: win > 0
        ? '「盐粒在' + PN(p) + ' 的锅里噼啪作响。」'
        : '「' + PN(p) + ' 叹了口气：这点草熬不出盐来。」'
    };
  }
  /* 疯科：v213 —— 1/3 失败、1/3 跳出野怪、1/3 造出善良生灵 */
  const roll = Math.random();
  if (roll < 1 / 3) {
    return { ok: false, mine: [], kind: 'fail', publicMsg: '「' + PN(p) + ' 的机器吐出一股黑烟：什么都没剩下。」' };
  }
  const species = ['bear', 'ox', 'snake', 'hound'];
  const table = [];
  species.forEach((k) => { for (let i = 0; i < 10; i++) table.push(k); });
  for (let i = 0; i < 20; i++) { table.push('rat'); table.push('cat'); }
  const pick = table[Math.floor(Math.random() * table.length)];
  if (roll < 2 / 3) {
    return { ok: false, mine: [], kind: 'monster', mon: pick, publicMsg: '「' + PN(p) + ' 的机器轰地一声炸开，里头爬出个活物…」' };
  }
  const h = spawnHelper(r, pick);
  return {
    ok: true,
    mine: h ? [{ name: '善良的' + h.name }] : [],
    kind: 'helper',
    publicMsg: h ? '「' + PN(p) + ' 的机器里走出了一只善良的' + h.name + '，站在我们这边。」' : '「' + PN(p) + ' 的机器空了：位置已经站满。」'
  };
}
/* 别人看到的一句话（不剧透结果） */
function jobMsg(p) {
  if (p.charId === 'farmer') return '「' + PN(p) + ' 正在处理废物。」';
  if (p.charId === 'doc') return '「' + PN(p) + ' 正在研制药物。」';
  if (p.charId === 'chef') return '「' + PN(p) + ' 在锅边熬着什么。」';
  return '「' + PN(p) + ' 在机器前忙活着。」';
}
function openNextJob(r) {
  if (!r.jobs) r.jobs = {};
  const opened = [];
  for (const q of craftPending(r)) {
    if (r.jobs[q.id]) continue;
    r.jobs[q.id] = { pid: q.id, name: PN(q), charId: q.charId, role: CRAFT_ROLE[q.charId], stage: 'pick', need: CRAFT_NEED[q.charId], out: null, msg: jobMsg(q) };
    opened.push(PN(q) + '（' + CRAFT_ROLE[q.charId] + '）');
  }
  if (opened.length) addLog(r, '建造阶段开始：' + opened.join('、') + ' 各自忙起来了，其他人先等着', 'gold');
  return opened.length > 0;
}
function doJob(r, p, ids) {
  const job = jobOf(r, p);
  if (!job) return '现在没有要忙的事';
  if (job.stage !== 'pick') return '已经做好了';
  const cards = jobCards(r, ids);
  if (cards.length !== (ids || []).length) return '有一张牌不在了';
  if (!cards.every((c) => (p.hand || []).includes(c.id))) return '这几张牌不在你手里';
  const why = jobReason(job, cards);
  if (why) return why;
  if (!jobValid(job, cards)) return '这几张牌不合适';
  job.stage = 'making';
  p.hand = p.hand.filter((id) => !(ids || []).map(String).includes(String(id)));
  cards.forEach((c) => c.zone = 'making');
  broadcastAll(r);
  setTimeout(() => {
    const me = r.players.get(p.id);
    if (!me) return;
    if (!jobOf(r, me) || jobOf(r, me) !== job) return;
    const res = resolveJob(r, me, job, cards);
    cards.forEach((c) => r.cards.delete(c.id));
    job.stage = 'result';
    job.out = { ok: res.ok, mine: res.mine, kind: res.kind || 'ok' };
    job.msg = res.publicMsg || '';
    if (res.publicMsg) addLog(r, res.publicMsg, res.ok ? 'gold' : 'red');
    if (res.kind === 'monster') job.mon = res.mon;
    craftSfx(r, 'bubble');
    broadcastAll(r);
  }, 2600);
  return null;
}

/* ---------------- 学者「格莱尔特」：研制物品 ---------------- */
function scholarOf(r) {
  return [...r.players.values()].find((x) => x.alive && x.charId === 'gelart') || null;
}
function researchKeyUsed(keys, key, kind) {
  return keys.some((k) => k.key === key && k.kind === kind);
}
/* 研制产出单件：随机食物/材料/图纸，绝不与投入的那两张重复 */
function researchProduceOne(r, keys) {
  const pools = {
    food: FOODS.filter((f) => !researchKeyUsed(keys, f.key, 'food')),
    material: MATS.filter((m) => !researchKeyUsed(keys, m.key, 'material')),
    blueprint: BLUEPRINTS.filter((b) => !researchKeyUsed(keys, b.key, 'blueprint'))
  };
  const kinds = ['food', 'material', 'blueprint'].filter((k) => pools[k].length);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const it = pools[kind][Math.floor(Math.random() * pools[kind].length)];
  if (kind === 'food') return { kind: 'food', key: it.key, name: it.name, cal: it.cal };
  if (kind === 'material') return { kind: 'material', key: it.key, name: it.name };
  return { kind: 'blueprint', key: it.key, name: it.key === 'junk' ? '垃圾' : it.name, bp: it.key };
}
/* 研制产出：50% 出 1 件，50% 出 2 件（两件不一定相同，但都不会是投进去的那两张）；
   另有 0.5% 的小概率直接出成品装备 */
function researchProduce(r, keys) {
  if (Math.random() < 0.005) {
    const eqs = BLUEPRINTS.filter((b) => ((RECIPES[b.key] || {}).place === 'equip'));
    const poolE = eqs.length ? eqs : BLUEPRINTS;
    const b = poolE[Math.floor(Math.random() * poolE.length)];
    const recE = RECIPES[b.key] || {};
    return [{ kind: 'equip', key: b.key, name: recE.name || b.name, dur: recE.dur || 3, maxDur: recE.dur || 3 }];
  }
  const n = Math.random() < 0.5 ? 1 : 2;
  const list = [];
  for (let i = 0; i < n; i++) list.push(researchProduceOne(r, keys));
  return list;
}
function doResearch(r, p, ids) {
  if (r.phase !== 'build') return '不在建造阶段';
  if (!r.research || r.research.stage !== 'pick') return '现在不是研制的时候';
  if (r.research.pid !== p.id) return '只有格莱尔特能研制';
  if (!Array.isArray(ids) || ids.length !== 2) return '要选两张牌（一张图纸 + 任意一张材料/食物）';
  const c1 = r.cards.get(ids[0]), c2 = r.cards.get(ids[1]);
  if (!c1 || !c2) return '没有这两张牌';
  if (!p.hand.includes(ids[0]) || !p.hand.includes(ids[1])) return '牌不在手里';
  if (c1.kind !== 'blueprint' && c2.kind !== 'blueprint') return '至少要放一张图纸';
  /* v176：图纸之外那张只能是材料或食物 */
  const other = c1.kind === 'blueprint' ? c2 : c1;
  if (other.kind !== 'material' && other.kind !== 'food') return '图纸之外那张要放材料或食物';
  const keys = [{ key: c1.key, kind: c1.kind }, { key: c2.key, kind: c2.kind }];
  [c1, c2].forEach((c) => {
    p.hand.splice(p.hand.indexOf(c.id), 1);
    r.cards.delete(c.id);
  });
  const outs = researchProduce(r, keys);
  const out = {
    list: outs,
    names: outs.map((o) => o.name),
    name: outs.map((o) => o.name).join('」「'),
    kind: outs.length === 1 ? outs[0].kind : 'multi'
  };
  r.research = { pid: p.id, name: PN(p), stage: 'making', out: out };
  addLog(r, PN(p) + ' 把「' + (c1.name || '') + '」和「' + (c2.name || '') + '」投入研制…', 'gold');
  broadcastAll(r);
  setTimeout(() => {
    const sch = r.players.get(p.id);
    if (!sch) return;
    const got = [];
    outs.forEach((o) => {
      if (o.kind === 'equip') {
        sch.equip = sch.equip || [];
        sch.equip.push({ key: o.key, name: o.name, dur: o.dur, maxDur: o.maxDur });
        got.push(o.name);
        addLog(r, PN(sch) + ' 研制出了成品「' + o.name + '」，直接装上了！', 'gold');
        return;
      }
      const card = makeCard(o.kind, o.kind === 'blueprint'
        ? { key: o.key, name: o.name, bp: o.key }
        : (o.kind === 'food' ? { key: o.key, name: o.name, cal: o.cal } : { key: o.key, name: o.name }));
      if (card.kind === 'blueprint') markBpSeen(r, card.key);
      r.cards.set(card.id, card);
      sch.hand.push(card.id);
      got.push(card.name);
      addLog(r, PN(sch) + ' 研制出了一张「' + card.name + '」', 'gold');
    });
    if (got.length >= 2) addLog(r, PN(sch) + ' 这次一锅出了两样东西：「' + got.join('」「') + '」', 'gold');
    r.research.out = Object.assign({}, out, { name: got.join('」「'), names: got });
    sch.researchDone = true;
    r.research.stage = 'result';
    if (got.length) craftSfx(r, 'bubble');
    broadcastAll(r);
  }, 2600);
  return null;
}
/* ---------------- v194：树洞与小猫咪 ---------------- */
function hasTreehole(r) { return !!(r.common && r.common.treehole && r.common.treehole.built); }
/* 猫为什么跟着谁：按「谁喂得多」加权，喂得越多越可能跟着 */
function pickCatOwner(r) {
  const list = [...r.players.values()].filter((x) => x.alive && !x.escaped);
  if (!list.length) return null;
  const fed = r.treeFed || {};
  const w = list.map((x) => ({ id: x.id, w: 1 + (Number(fed[x.id]) || 0) * 3 }));
  const tot = w.reduce((a, b) => a + b.w, 0);
  let v = Math.random() * tot;
  for (const it of w) { v -= it.w; if (v <= 0) return it.id; }
  return w[0].id;
}
const CAT_FOOD_P = { carrot: 0.10, fish: 0.30, meat: 0.30 };
/* 就餐阶段：把食物放到树洞门口 */
function feedCat(r, p, cardId) {
  if (!hasTreehole(r)) return '还没有树洞';
  if (r.phase !== 'cook') return '只有在就餐的时候才能喂它';
  const c = r.cards.get(cardId);
  if (!c) return '没有这张牌';
  if (!p.hand.includes(cardId)) return '牌不在你手里';
  if (c.kind !== 'food') return '树洞只收食物';
  const pr = CAT_FOOD_P[c.key] || 0;
  p.hand.splice(p.hand.indexOf(cardId), 1);
  r.cards.delete(cardId);
  addLog(r, PN(p) + ' 把「' + c.name + '」放在了树洞门口');
  if (Math.random() < pr) {
    r.treeFed[p.id] = (Number(r.treeFed[p.id]) || 0) + 1;
    if (!r.cat) {
      r.cat = { arrived: true, born: Date.now(), follow: p.id, gift: null };
      addLog(r, '树洞里有动静…一只小猫咪探出头，蹭了蹭 ' + PN(p) + ' 的裤脚，跟着他走了。', 'gold');
      craftSfx(r, 'bubble');
    } else {
      addLog(r, '小猫咪把「' + c.name + '」叼进了树洞，尾巴摇得很欢。', 'gold');
      if (Math.random() < 0.5) r.cat.follow = pickCatOwner(r) || r.cat.follow;
    }
  } else {
    addLog(r, '食物放了一整天，树洞门口什么也没有。', 'red');
  }
  broadcastAll(r);
  return null;
}
/* 就餐阶段：给猫一件东西，第二天清晨它会叼给另一个玩家 */
function giveCatGift(r, p, cardId) {
  if (!r.cat) return '现在还没有小猫咪';
  if (r.phase !== 'cook' && r.phase !== 'trade') return '现在不能给它东西';
  const c = r.cards.get(cardId);
  if (!c || !p.hand.includes(cardId)) return '牌不在你手里';
  if (r.cat.gift) return '小猫咪手里已经有一件东西了';
  const info = { kind: c.kind, key: c.key, name: c.name, cal: c.cal, bp: c.bp };
  p.hand.splice(p.hand.indexOf(cardId), 1);
  r.cards.delete(cardId);
  r.cat.gift = { from: p.id, fromName: PN(p), card: info };
  addLog(r, PN(p) + ' 把「' + c.name + '」交给了小猫咪，它叼住就跑开了。');
  broadcastAll(r);
  return null;
}
/* 第二天清晨：猫把东西送给别人 */
function catDawnGift(r) {
  if (!r.cat || !r.cat.gift) return;
  const g = r.cat.gift;
  r.cat.gift = null;
  const others = [...r.players.values()].filter((x) => x.alive && !x.escaped && x.id !== g.from);
  if (!others.length) return;
  const to = others[Math.floor(Math.random() * others.length)];
  const card = makeCard(g.card.kind, g.card);
  if (card.kind === 'blueprint') markBpSeen(r, card.key);
  r.cards.set(card.id, card);
  to.hand.push(card.id);
  addLog(r, '清晨，小猫咪把「' + card.name + '」叼到了 ' + PN(to) + ' 脚边（' + g.fromName + ' 给的）。', 'gold');
}

/* 饥饿结算：饱食度不足 -> 掉血/死亡 */
/* v114 统一耐久：每次使用都有 2/3 概率掉 1 点耐久（精灵「费」有 3/4 概率不掉） */
function wearItem(r, p, item, label) {
  if (!item) return true;
  const keep = (p && p.charId === 'fei') ? 0.75 : (1 / 3);
  if (Math.random() < keep) {
    addLog(r, PN(p) + ' 使用了「' + label + '」，很幸运，耐久没有降低');
    return true;
  }
  item.dur = Math.max(0, (Number(item.dur) || 0) - 1);
  if (item.dur <= 0) {
    addLog(r, PN(p) + ' 使用了「' + label + '」，耐久 -1，用坏了', 'red');
    if (Array.isArray(p.equip)) p.equip = p.equip.filter((x) => x !== item);
    return false;
  }
  addLog(r, PN(p) + ' 使用了「' + label + '」，耐久 -1（剩 ' + item.dur + '）');
  return true;
}

function applyHunger(r, p, cost) {
  p.sat -= cost;
  if (p.sat >= 0) return true;
  /* 丘比：常驻的金色「免疫饥饿」挡下一次 */
  if (p.satImmune) {
    p.satImmune = false;
    p.qiubiUsed = true;
    p.sat = 0;
    addLog(r, PN(p) + ' 的「免疫饥饿」挡下了这一次饥饿', 'gold');
    return true;
  }
  const over = -p.sat;
  p.sat = 0;
  if (p.satBuff > 0) {
    p.hp = 0;
    p.alive = false;
    addLog(r, PN(p) + ' 在饥饿中倒下了（已经有饥饿 buff 还继续挨饿）', 'red');
    checkPartyWipe(r);
    return false;
  }
  p.satBuff = 2;
  if (over >= 3) {
    p.hp -= 1;
    r.hungerAt = Date.now();   /* v171：这一次掉血是饿的，客户端放肚子打鸣 */
    addLog(r, PN(p) + ' 饿到饱食 ' + (-over) + '，获得饥饿 buff（2 天），生命 -1', 'red');
    if (Math.random() < 1 / 3) {
      p.hp -= 1;
      r.hungerAt = Date.now();
      addLog(r, PN(p) + ' 饥饿难耐，又掉了一点血', 'red');
    }
  } else {
    addLog(r, PN(p) + ' 有点饿了（获得饥饿 buff，2 天），这一次没掉血');
  }
  if (p.hp <= 0) { killPlayer(r, p); }
  return p.alive;
}

/* v151：怪物卡 / 命运卡「抽到就结算」——结算完这张卡从任何容器里彻底消失，
   绝不进手牌、不留在牌堆、也不进弃牌堆。返回 true 表示这张卡已经被消费掉。 */
function settleInstantCard(r, p, c) {
  if (!c) return false;
  if (c.kind === 'monster') {
    if (!r.pendingFight) r.pendingFight = [];
    r.pendingFight.push(c.mon);
    const mname = (c.mon === 'ox' ? '肉牛' : ((MONSTERS[c.mon] || {}).name || '野怪'));
    const mline = PN(p) + ' 翻出了怪物卡【' + mname + '】';
    addLog(r, mline, 'red');
    pushFeed(r, 'monster', mline, 'red');
    r.cards.delete(c.id);
    return true;
  }
  if (c.kind === 'fate') {
    r.cards.delete(c.id);
    openFate(r, p);
    return true;
  }
  return false;
}

/* v151：兜底清扫——把任何残留的怪物卡 / 命运卡从所有容器里抹掉
   （老存档、其他抽卡点都可能漏一张） */
function purgeInstantCards(r) {
  if (!r || !r.cards) return;
  const bad = new Set();
  for (const it of r.cards) {
    const c = it[1];
    if (c && (c.kind === 'monster' || c.kind === 'fate')) bad.add(it[0]);
  }
  if (!bad.size) return;
  const dropIds = (arr) => {
    if (!Array.isArray(arr)) return;
    for (let i = arr.length - 1; i >= 0; i--) if (bad.has(arr[i])) arr.splice(i, 1);
  };
  for (const p of r.players.values()) {
    dropIds(p.hand); dropIds(p.nightLoot); dropIds(p.mealBox); dropIds(p.tradeBox);
    if (Array.isArray(p.eatBox)) {
      for (let i = p.eatBox.length - 1; i >= 0; i--) if (p.eatBox[i] && bad.has(p.eatBox[i].id)) p.eatBox.splice(i, 1);
    }
  }
  dropIds(r.ground); dropIds(r.discard);
  if (r.loot && Array.isArray(r.loot.items)) dropIds(r.loot.items);
  if (r.common && r.common.chest && Array.isArray(r.common.chest.slots)) dropIds(r.common.chest.slots);
  if (r.trade && r.trade.pairs) {
    for (const pr of Object.values(r.trade.pairs)) { dropIds(pr.cardsA); dropIds(pr.cardsB); }
  }
  for (const list of (r.potSlots || [])) {
    if (!Array.isArray(list)) continue;
    for (let i = list.length - 1; i >= 0; i--) if (list[i] && bad.has(list[i].id)) list.splice(i, 1);
  }
  if (r.common && r.common.furnace) {
    if (bad.has(r.common.furnace.topCard)) r.common.furnace.topCard = null;
    if (bad.has(r.common.furnace.outCard)) r.common.furnace.outCard = null;
  }
  for (const id of bad) r.cards.delete(id);
}

/* ---------------- 搜索 ---------------- */
function doSearch(r, p) {
  if (r.phase !== 'search') return '现在不是搜索阶段';
  if (p.searchedToday) return '今天已经搜索过了';
  if (!p.alive) return '你已经倒下';
  if (p.away) return '你还在萨图的营地，回营地之后才能搜索';
  if (p.wound > 0) return '你有伤口，今天不能外出搜索';
  useUmbrellaDay(r, p);
  const sp = playerExplorePoints(r, p);
  const cost = foodCost(r, p);
  const w = todayWeather(r);
  /* 雷雨：先扣血（草棚可挡）；一天只结算一次 */
  if (w.key === 'storm' && !r.stormDone) {
    r.stormDone = true;
    if (r.common.shelter.built && r.common.shelter.dur > 0) {
      if (Math.random() < 1 / 3) {
        addLog(r, '草棚挡住了雷雨，很幸运，耐久没有降低');
      } else {
        r.common.shelter.dur -= 1;
        addLog(r, '草棚挡住了雷雨，耐久 -1（剩 ' + r.common.shelter.dur + '）');
        if (r.common.shelter.dur <= 0) { r.common.shelter.built = false; addLog(r, '草棚被雷雨打坏了'); }
      }
    } else {
      /* v137：打雷天——手里有雨伞的人举伞挡雷，免疫自己那一份伤害（伞会磨损） */
      let hurt = 0, saved = 0;
      for (const q of r.players.values()) {
        if (!q.alive) continue;
        const umb = (q.equip || []).find((e) => e.key === 'umbrella' && (!e.maxDur || e.dur > 0));
        if (umb) {
          saved++;
          addLog(r, PN(q) + ' 举着雨伞挡住了雷电，没有受伤', 'gold');
          if (umb.maxDur) wearItem(r, q, umb, '雨伞');
          continue;
        }
        hurt++;
        q.hp -= playerDmg(q, 1);
        if (q.hp <= 0) { killPlayer(r, q); }
      }
      if (hurt) addLog(r, '雷雨天，' + hurt + ' 人生命 -1');
      if (!hurt && saved) addLog(r, '雷雨天，雨伞挡住了所有雷电');
    }
  }
  /* v151：雷雨里当场倒下的人不再继续摸牌（手上东西已经掉在地上了） */
  if (!p.alive) { broadcastAll(r); return null; }
  /* 白天消耗的饱食度先记着，日终统一结算 */
  p.satSpent = (p.satSpent || 0) + cost;
  p.searchedToday = true;
  const drawn = [];
  let overSeen = false;
  for (let i = 0; i < sp; i++) {
    const c = drawCard(r, i === 0 ? p : null);
    r.cards.set(c.id, c);
    drawn.push(c);
    if (settleInstantCard(r, p, c)) {
      /* 怪物 / 命运：当场结算，卡本身随即销毁 */
      drawn.pop();
    } else if (c.kind === 'human' && c.npc) {
      /* v151：人物卡落地变成同伴，卡本身也销毁，别在牌堆里留着 */
      spawnNpcFromCard(r, p, c.npc);
      r.cards.delete(c.id);
      drawn.pop();
    } else {
      p.hand.push(c.id);
      if (handCardCount(r, p) > handLimit(p)) overSeen = true;
    }
  }
  if (drawn.length) addLog(r, PN(p) + ' 搜索到 ' + drawn.map((c) => c.name).join('、') + '（探索点 ' + sp + '）');
  emitTo(p.id, 'island:sfx', { t: 'search', items: drawn.map((c) => ({ id: c.id, kind: c.kind, key: c.key || c.mon || '' })) });
  if (overSeen) addLog(r, PN(p) + ' 手牌超过 ' + handLimit(p) + ' 张了（现在 ' + handCardCount(r, p) + ' 张，垃圾不算）——手牌可以超，等搜索阶段结束统一检查再弃');
  return null;
}

function allSearched(r) {
  /* 倒下的人不用搜；带伤口的人今天根本搜不了，也算“已处理”，否则全队永远推不动阶段 */
  return [...r.players.values()].every((p) => !p.alive || p.away || p.searchedToday || (p.wound || 0) > 0);
}

/* v142：所有人都搜索完 -> 6 秒后自动进入下一阶段（也可以提前点「结束搜索」） */
const SEARCH_AUTO_MS = 6000;
function clearSearchAuto(r) {
  r.searchAutoAt = 0;
  if (r.searchAutoT) { clearTimeout(r.searchAutoT); r.searchAutoT = null; }
}
function searchReady(r) {
  if (r.witch && !r.witch.done) return '老巫婆还在跟 ' + r.witch.name + ' 说话';
  if (r.satu && r.satu.stage === 'trade') return '萨图的临时交付还没结束';
  if (!r || r.ended) return false;
  if (r.phase !== 'search') return false;
  if (!r.started) return false;
  if (r.fight) return false;
  if (!allSearched(r)) return false;
  if (r.fate || (Array.isArray(r.fateQ) && r.fateQ.length)) return false;
  if (r.wxAsk && !r.wxAsk.done) return false;
  if (r.tixiAsk && !r.tixiAsk.done) return false;
  return true;
}
function autoAdvanceSearch(r) {
  if (r.phase !== 'search') return;
  r.adv = null;
  if ([...r.players.values()].some((x) => x.alive && x.charId === 'mengdi')) {
    for (const q of r.players.values()) {
      if (!q.alive) continue;
      const jc = makeCard('item', { key: 'junk', name: '垃圾' });
      r.cards.set(jc.id, jc);
      q.hand.push(jc.id);
    }
    addLog(r, '蒙迪肯特的乞讨：每个人手里多了一张「垃圾」', 'gold');
  }
  advancePhase(r);
}
function armSearchAuto(r) {
  if (!searchReady(r)) { if (r.searchAutoAt) clearSearchAuto(r); return; }
  if (r.searchAutoAt) return;
  r.searchAutoAt = Date.now() + SEARCH_AUTO_MS;
  addLog(r, '所有人都搜索完了，' + (SEARCH_AUTO_MS / 1000) + ' 秒后自动进入下一阶段（也可以现在就点「结束搜索」）');
  const dayAt = r.day;
  r.searchAutoT = setTimeout(() => {
    r.searchAutoT = null;
    try {
      if (!r || r.day !== dayAt || r.ended) { r.searchAutoAt = 0; return; }
      if (!searchReady(r)) { r.searchAutoAt = 0; return; }
      r.searchAutoAt = 0;
      addLog(r, '所有人都搜索完了，自动进入下一阶段', 'gold');
      autoAdvanceSearch(r);
      broadcastAll(r);
    } catch (err) {
      try { r.searchAutoAt = 0; } catch (_) {}
    }
  }, SEARCH_AUTO_MS);
  if (r.searchAutoT && r.searchAutoT.unref) r.searchAutoT.unref();
}

/* 抽到人物卡 -> NPC 来临（跟随抽到的人） */
/* v195：心理学家看穿命运人物会带来什么 */
const FATE_INFO = {
  lake: '拉客：可能替你回 1~2 点生命，也可能抽你 1~2 点生命。',
  lucki: '拉奇：手牌上限可能 +1，也可能 -1。',
  snope: '丝诺皮：可能拿走你一件东西（箱子里的也算），也可能送你一件。',
  gade: '盖德：带全队换一座岛。',
  satu: '野人萨图：他的营地需要帮忙。答应的话会立刻开一场交付，然后你跟着他离开几天。'
};
const FATE_NPCS = [
  { key: 'lake', name: '拉客' },    // 命：回血 / 扣血
  { key: 'lucki', name: '拉奇' },   // 手牌上限 +1 / -1
  { key: 'snope', name: '丝诺皮' }, // 物品：拿你一件 / 送你一件（箱子里的也拿）
  { key: 'gade', name: '盖德' },    // 带全队换岛
  { key: 'satu', name: '野人萨图' }, // v234：营地缺人手，跟着他走几天
];

/* v213：心理学家看穿这一次命运人物到底会给什么 / 拿什么 */
function fateInsight(f, p) {
  if (!f || !p) return '';
  const th = p.charId === 'fei' ? 0.6 : 0.5;
  const roll = (f.rolls || {})[p.id] || { r1: 0.9, r2: 0.9 };
  const up1 = roll.r1 < th, up2 = roll.r2 < th;
  const nm = f.name || '他';
  if (f.key === 'lake') {
    const n = up1 ? 1 : 2;
    return up2 ? ('本次' + nm + '会替你回 ' + n + ' 点生命') : ('本次' + nm + '会抽走你 ' + n + ' 点生命');
  }
  if (f.key === 'lucki') return up1 ? ('本次' + nm + '会让你的手牌上限 +1') : ('本次' + nm + '会让你的手牌上限 -1');
  if (f.key === 'snope') return up1 ? ('本次' + nm + '会从你身上拿走一件东西') : ('本次' + nm + '会送你一件东西');
  if (f.key === 'gade') return '本次' + nm + '会带全队换一座岛';
  return '';
}

/* 抽到命运卡：只报「谁来了」，干什么不预告 */
function openFate(r, p, forceKey) {
  const npc = forceKey ? (FATE_NPCS.find((x) => x.key === forceKey) || FATE_NPCS[0])
    : FATE_NPCS[Math.floor(Math.random() * FATE_NPCS.length)];
  const alive = [...r.players.values()].filter((x) => x.alive && !x.away).map((x) => x.id);
  /* 盖德换岛 / 野人萨图：只有翻出来的那个人决定；其他三个：在场所有人都能各自选 */
  const deciders = (npc.key === 'gade' || npc.key === 'satu') ? [p.id] : (alive.length ? alive : [p.id]);
  const ft = { id: uid('ft'), key: npc.key, name: npc.name, pid: p.id, pname: PN(p), pcolor: p.color || '', deciders: deciders, done: {}, accepted: {}, rolls: {} };
  /* v213：先把这次的结果掷好（心理学家能提前看到，结算也用同一份） */
  for (const id of deciders) ft.rolls[id] = { r1: Math.random(), r2: Math.random() };
  r.fateQ = Array.isArray(r.fateQ) ? r.fateQ : [];
  r.fateQ.push(ft);
  if (r.fate) {
    /* 同时翻出两张以上：后到的排队，绝不覆盖正在处理的那张 */
    addLog(r, '「' + npc.name + '」也来了，前面还有 ' + (r.fateQ.length - 1) + ' 位命运人物，先排队', 'fate');
    broadcastAll(r);
    return;
  }
  r.fate = ft;
  if (npc.key === 'gade') addLog(r, PN(p) + ' 翻出了「' + npc.name + '」，' + npc.name + ' 正在迎接 ' + PN(p) + '（只有他能决定）', 'fate');
  else addLog(r, '「' + npc.name + '」来了（' + PN(p) + ' 翻出）——每个人都可以选择接受或拒绝', 'fate');
  broadcastAll(r);
}

/* ---------------- v234：野人萨图（临时交付 → 离队 → 归来） ---------------- */
/* 随机成品：从「造出来就能用」的装备里挑一件，耐久随机 */
function randGearCard(r, forceKey) {
  const keys = Object.keys(RECIPES).filter((k) => RECIPES[k].place === 'equip' && (RECIPES[k].dur || 0) > 0);
  const key = forceKey && RECIPES[forceKey] ? forceKey : keys[Math.floor(Math.random() * keys.length)];
  const rec = RECIPES[key];
  const maxDur = Math.max(1, Number(rec.dur || 1));
  return makeCard('equip', { key, name: rec.name, dur: 1 + Math.floor(Math.random() * maxDur), maxDur });
}
function randBlueprintCard() {
  const b = BLUEPRINTS.filter((x) => x.cat !== 'fate');
  const bp = b[Math.floor(Math.random() * b.length)];
  return makeCard('blueprint', { key: bp.key, name: bp.key === 'junk' ? '垃圾' : bp.name, bp: bp.key });
}
function giveToHand(r, p, card) {
  if (!card) return null;
  r.cards.set(card.id, card);
  p.hand.push(card.id);
  return card.name;
}
function startSatuTrade(r, pid) {
  const p = r.players.get(pid);
  if (!p || !p.alive) return;
  r.satu = { pid: p.id, name: PN(p), stage: 'trade', fromPhase: r.phase };
  r.phase = 'trade';
  initTrade(r);
  addLog(r, '萨图说营地缺人手 —— ' + PN(p) + ' 答应了，先跟大家把手里的东西换一换（临时交付）', 'gold');
  broadcastAll(r);
}
function satuDepart(r) {
  const pid = r.satu && r.satu.pid;
  const p = pid && r.players.get(pid);
  if (!p || !p.alive) { r.satu = null; return; }
  const x = Math.random();
  const backIn = x < 0.5 ? 1 : (x < 0.75 ? 2 : 3);
  /* 自己的东西暂时消失（回来时原样还给他） */
  p.awayPack = { hand: (p.hand || []).slice(), equip: (p.equip || []).slice() };
  p.hand = [];
  p.equip = [];
  p.away = { since: r.day, backDay: r.day + backIn };
  r.satu = { pid: p.id, name: PN(p), stage: 'away', backDay: p.away.backDay };
  addLog(r, PN(p) + ' 把东西都收好，跟着萨图走了 —— 营地那边的活干完才会回来（约 ' + backIn + ' 天）', 'gold');
  pushFeed(r, 'satu', PN(p) + ' 跟着野人萨图离开了营地', 'fate');
  broadcastAll(r);
}
/* 归来：在交付阶段开始时叫他回来（单人模式没有交付阶段，就在清晨叫） */
function satuReturn(r) {
  const back = [...r.players.values()].filter((p) => p.alive && p.away && r.day >= p.away.backDay);
  for (const p of back) satuComeBack(r, p);
  if (r.satu && r.satu.stage === 'away' && !(r.players.get(r.satu.pid) || {}).away) r.satu = null;
}
function satuComeBack(r, p) {
  const pack = p.awayPack || { hand: [], equip: [] };
  p.hand = (pack.hand || []).slice();
  p.equip = (pack.equip || []).slice();
  p.awayPack = null;
  p.away = null;
  const got = [];
  const add = (c) => { const nm = giveToHand(r, p, c); if (nm) got.push(nm); };
  const evs = ['ox', 'farm', 'hound', 'sport', 'revolt', 'boat'];
  const ev = evs[Math.floor(Math.random() * evs.length)];
  let story = '';
  if (ev === 'ox') {
    p.hp = Math.max(0, p.hp - 1);
    p.sat = 0;
    for (let i = 0; i < 3; i++) add(makeCard('food', { key: 'meat', name: '大肉', cal: 3 }));
    add(randBlueprintCard());
    story = '帮着萨图去镇压了一头蛮牛，被顶了一下（生命 -1、饱食度归零），扛回来三块大肉和一张图纸';
  } else if (ev === 'farm') {
    p.sat = Math.min(p.satMax || MAX_SAT, 2);
    for (let i = 0; i < 2; i++) add(makeCard('food', { key: 'carrot', name: '胡萝卜', cal: 1 }));
    add(randGearCard(r));
    story = '在村民的田里帮着收庄稼（没受伤，饱食度只有 2），换来两根胡萝卜和一件成品';
  } else if (ev === 'hound') {
    p.hp = Math.max(0, p.hp - 2);
    p.sat = p.satMax || MAX_SAT;
    add(randGearCard(r, 'spear'));
    addBuff(r, p, 'inspire', 3, '跟着萨图打猎狗，血脉贲张');
    story = '跟着他们去打猎狗（打了两天猎狗，生命 -2，吃饱了回来），带回来一根长矛';
  } else if (ev === 'sport') {
    p.sat = 0;
    for (let i = 0; i < 3; i++) {
      if (i === 0 && Math.random() < 0.5) add(randGearCard(r));
      else add(randBlueprintCard());
    }
    story = '参加了他们的大生产运动会（饱食度归零），抱回来三张图纸';
  } else if (ev === 'revolt') {
    p.hp = 1;
    p.sat = 1;
    add(randGearCard(r, 'shield'));
    add(makeCard('material', { key: 'charcoal', name: '木炭' }));
    add(makeCard('material', { key: 'charcoal', name: '木炭' }));
    if (Math.random() < 0.5) add(randGearCard(r));
    story = '真去参加了他们的农民起义（生命和饱食度都只剩 1），带回一面盾牌和两块木炭';
  } else {
    p.sat = Math.max(0, (p.sat || 0) - 2);
    if (r.common && r.common.boat) { r.common.boat.built = true; r.common.boat.builtAt = Date.now(); }
    story = '半路把野人开的那条船抢了回来（饱食度 -2）—— 我们有一条完整的船了';
  }
  if (p.hp <= 0) { killPlayer(r, p); }
  const line = PN(p) + ' 从萨图的营地回来了：' + story + '（原本的东西也带回来了）';
  addLog(r, line, 'gold');
  pushFeed(r, 'satu', line, 'gold');
  if (got.length) addLog(r, PN(p) + ' 带回来的：' + got.join('、'), 'gold');
  broadcastAll(r);
}

/* 斯诺皮：拿走一件东西（手牌/装备/箱子都算）或送来一件 */
function snopeTake(r, p) {
  const pool = [];
  for (const id of p.hand) if (r.cards.get(id)) pool.push({ from: 'hand', id });
  for (const e of p.equip || []) pool.push({ from: 'equip', id: e.id, name: e.name });
  const chest = (r.common && r.common.chest) || null;
  if (chest && chest.slots) {
    for (const id of chest.slots) if (id && r.cards.get(id)) pool.push({ from: 'chest', id });
  }
  if (!pool.length) return '';
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick.from === 'hand') {
    const i = p.hand.indexOf(pick.id);
    if (i >= 0) p.hand.splice(i, 1);
    const c = r.cards.get(pick.id);
    r.cards.delete(pick.id);
    return '拿走了「' + (c ? c.name : '一张牌') + '」';
  }
  if (pick.from === 'equip') {
    p.equip = (p.equip || []).filter((x) => x.id !== pick.id);
    return '拿走了你的「' + (pick.name || '装备') + '」';
  }
  const ci = chest.slots.indexOf(pick.id);
  chest.slots[ci] = null;
  const c = r.cards.get(pick.id);
  r.cards.delete(pick.id);
  return '从箱子里拿走了「' + (c ? c.name : '一件东西') + '」';
}

function snopeGive(r, p) {
  const roll = Math.random();
  const out = [];
  if (roll < 0.4) {
    const f = pickW(FOODS);
    out.push(makeCard('food', { key: f.key, name: f.name, cal: f.cal }));
  } else if (roll < 0.8) {
    const m = pickW(MATS);
    out.push(makeCard('material', { key: m.key, name: m.name }));
    if (Math.random() < 0.5) out.push(makeCard('material', { key: m.key, name: m.name }));
  } else {
    const b = BLUEPRINTS.filter((x) => x.cat !== 'fate');
    const bp = b[Math.floor(Math.random() * b.length)];
    out.push(makeCard('blueprint', { key: bp.key, name: bp.key === 'junk' ? '垃圾' : bp.name, bp: bp.key }));
  }
  const got = [];
  for (const c of out) {
    /* v133：手牌不设上限，直接给他 */
    r.cards.set(c.id, c);
    p.hand.push(c.id);
    got.push(c.name);
  }
  return got.length ? ('送来了「' + got.join('」「') + '」') : '这次什么也没送';
}

/* 命运队列：当前这位处理完，把下一位顶上来（中途不吞卡） */
function fateNext(r) {
  r.fateQ = Array.isArray(r.fateQ) ? r.fateQ : [];
  const cur = r.fate;
  if (cur) {
    const i = r.fateQ.findIndex((x) => x && x.id === cur.id);
    if (i >= 0) r.fateQ.splice(i, 1);
    else r.fateQ.shift();
  }
  r.fate = r.fateQ[0] || null;
  if (r.fate) {
    const f = r.fate;
    if (f.key === 'gade') addLog(r, '「' + f.name + '」正在迎接 ' + (f.pname || '有人') + '（只有他能决定）', 'fate');
    else addLog(r, '「' + f.name + '」来了（' + (f.pname || '有人') + ' 翻出）——每个人都可以选择接受或拒绝', 'fate');
  }
}

/* 接受 / 拒绝：每个人各自选，都选完了才结算 */
function fateAnswer(r, p, accept) {
  const f = r.fate;
  if (!f) return '现在没有命运卡';
  if ((f.deciders || []).indexOf(p.id) < 0) {
    return f.key === 'gade' ? ((f.pname || '玩家') + ' 正在迎接' + f.name + '，其他人等着就好') : '这次不是你来决定';
  }
  if (f.done[p.id]) return '你已经选过了';
  f.done[p.id] = true;
  f.accepted[p.id] = !!accept;
  addLog(r, PN(p) + (accept ? ' 接受了 ' : ' 拒绝了 ') + f.name);
  const ids = f.deciders || [];
  if (!ids.every((id) => f.done[id])) { broadcastAll(r); return null; }
  /* 全部选完：接受的人各自结算 */
  const yes = ids.filter((id) => f.accepted[id]);
  const key = f.key, name = f.name;
  fateNext(r);
  r.fateRes = {};
  if (!yes.length) addLog(r, '这次没人迎接 ' + name, 'fate');
  for (const id of yes) {
    const x = r.players.get(id);
    if (x && x.alive) applyFate(r, x, key, name, (f.rolls || {})[id]);
  }
  /* 拒绝的人也给一条结果 */
  for (const id of ids) {
    if (f.accepted[id]) continue;
    const x = r.players.get(id);
    if (!x) continue;
    r.fateRes[id] = r.fateRes[id] || { name: x.name, lines: [] };
    if (!r.fateRes[id].lines.length) r.fateRes[id].lines.push('拒绝了，什么也没发生');
  }
  /* 人人都能看到刚才发生了什么 */
  Object.keys(r.fateRes).forEach((id) => {
    const rec = r.fateRes[id];
    if (!rec || !rec.lines.length) return;
    const bad = rec.lines.some((t) => /-|\u4e22|\u88ab\u62ff\u8d70|\u964d/.test(t) && !/\+1/.test(t));
    addLog(r, rec.name + ' 因 ' + name + '：' + rec.lines.join('，'), bad ? 'red' : 'fate');
  });
  r.fateResults = { at: Date.now(), name: name, key: key, byId: r.fateRes };
  /* v234：萨图 —— 有人答应，就立刻开一场额外交付 */
  if (r.satuPending && !r.fight) {
    const sp = r.satuPending;
    r.satuPending = null;
    startSatuTrade(r, sp.pid);
  }
  broadcastAll(r);
  return null;
}

function applyFate(r, p, key, name, roll) {
  const th = p.charId === 'fei' ? 0.6 : 0.5;
  const r1 = (roll && typeof roll.r1 === 'number') ? roll.r1 : Math.random();
  const r2 = (roll && typeof roll.r2 === 'number') ? roll.r2 : Math.random();
  const up1 = r1 < th, up2 = r2 < th;
  /* 记下这个人被命运人物改变了什么，前端在弹窗下面给他看 */
  r.fateRes = r.fateRes || {};
  const rec = (r.fateRes[p.id] = r.fateRes[p.id] || { name: PN(p), lines: [] });
  const note = (t) => { if (t) rec.lines.push(String(t)); };
  if (key === 'lake') {
    const n = up1 ? 1 : 2;
    if (up2) {
      p.hp = Math.min(p.maxHp, p.hp + n);
      addLog(r, name + ' 迎接了 ' + PN(p) + '，生命 +' + n + '（现在 ' + p.hp + '）', 'fate');
      note('生命 +' + n + '（现在 ' + p.hp + ' / ' + p.maxHp + '）');
    } else {
      p.hp = Math.max(0, p.hp - n);
      addLog(r, name + ' 迎接了 ' + PN(p) + '，生命 -' + n + '（现在 ' + p.hp + '）', 'fate');
      note('生命 -' + n + '（现在 ' + p.hp + ' / ' + p.maxHp + '）');
      if (p.hp <= 0) killPlayer(r, p);
    }
  } else if (key === 'lucki') {
    if (up1) {
      p.handLimit = handLimit(p) + 1;
      addLog(r, name + ' 迎接了 ' + PN(p) + '，手牌上限提到 ' + p.handLimit, 'fate');
      note('手牌上限 +1（现在 ' + p.handLimit + '）');
    } else {
      p.handLimit = Math.max(0, handLimit(p) - 1);
      const over = p.hand.length - p.handLimit;
      addLog(r, name + ' 迎接了 ' + PN(p) + '，手牌上限降到 ' + p.handLimit, 'fate');
      note('手牌上限 -1（现在 ' + p.handLimit + '）');
      if (over > 0) {
        for (let i = 0; i < over; i++) {
          const id = p.hand.pop();
          const c = id && r.cards.get(id);
          if (c) { r.cards.delete(id); r.discard.push(id); }
        }
        addLog(r, PN(p) + ' 手牌超出上限，丢了 ' + over + ' 张');
        note('丢掉 ' + over + ' 张手牌（超出上限）');
      }
    }
  } else if (key === 'snope') {
    if (up1) {
      const what = snopeTake(r, p);
      addLog(r, name + ' 迎接了 ' + PN(p) + '，' + (what || '翻了一圈什么也没拿到'), 'fate');
      note(what ? ('被拿走 ' + what.replace(/^拿走了/, '').replace(/^从箱子里拿走了/, '箱子里的')) : '什么也没被拿走');
    } else {
      const gave = snopeGive(r, p);
      addLog(r, name + ' 迎接了 ' + PN(p) + '，' + gave, 'fate');
      note(gave);
    }
  } else if (key === 'satu') {
    /* v234：接受 → 等这张命运结算完，立刻开一场临时交付，交付完他就跟着萨图走了 */
    r.satuPending = { pid: p.id, name: PN(p) };
    addLog(r, PN(p) + ' 答应了萨图，先去他们的营地帮几天忙（先把手里的东西跟大家换一换）', 'fate');
    note('跟着萨图去营地帮忙，交付结束后离队');
  } else if (key === 'gade') {
    const others = ISLANDS.filter((x) => x.key !== r.islandKey);
    const to = others[Math.floor(Math.random() * others.length)];
    r.islandKey = to.key;
    r.island = to.name;
    r.islandChangedAt = Date.now();
    addLog(r, name + ' 迎接了 ' + PN(p) + '，我们出发前往「' + to.name + '」！', 'gold');
    note('前往「' + to.name + '」');
  }
}

function spawnNpcFromCard(r, p, key) {
  if (!['priest', 'warrior', 'child'].includes(key)) return null;
  /* 已经倒下的旧记录先清掉，允许同一位同伴再被抽到（复活） */
  const revived = (r.npcs || []).some((n) => n.key === key && n.alive === false);
  r.npcs = (r.npcs || []).filter((n) => !(n.key === key && n.alive === false));
  const aliveNpcs = r.npcs.filter((n) => n.alive !== false);
  if (aliveNpcs.length >= 3) { addLog(r, PN(p) + ' 遇到了 ' + (NPC_NAME[key] || key) + '，但岛上已经没有空位了'); return null; }
  if (aliveNpcs.some((n) => n.key === key)) { addLog(r, PN(p) + ' 遇到了又一位 ' + (NPC_NAME[key] || key) + '，但岛上已经有同伴了'); return null; }
  const npc = { id: 'npc_' + (r.npcSeq = (r.npcSeq || 0) + 1), key, name: NPC_NAME[key] || key, slot: npcSlot(r), seat: p.seat, pid: p.id, alive: true, hp: npcStat(r, key).hp, maxHp: npcStat(r, key).hp, sat: npcStat(r, key).satMax, maxSat: npcStat(r, key).satMax, atk: 3 };
  if (key === 'priest') npc.want = rollPriestWant();
  r.npcs.push(npc);
  const NPC_LINE = {
    priest: '太好了，受伤了有人能处理了！',
    warrior: '我们的安危有救了！',
    child: '这么小的孩子也在岛上，得护着点',
  };
  const nline = PN(p) + ' 抽出了' + npc.name + '——' + (revived ? '他（她）又回来了！' : (NPC_LINE[key] || '岛上来人了'));
  addLog(r, nline, 'gold');
  pushFeed(r, 'npc', nline, 'gold');
  emitTo(p.id, 'island:sfx', { t: 'npc', key });
  return npc;
}

/* ---------------- v227：外岛交付（每天 10% 概率在交付阶段刷一笔） ---------------- */
const ISLE_FOOD_KEYS = ['carrot', 'fish', 'meat'];
const ISLE_MAT_KEYS = ['wood', 'stone', 'grass', 'iron'];
const ISLE_ITEM_KEYS = ['heal', 'clean', 'torch', 'spear', 'axe', 'warhammer', 'mat', 'umbrella', 'shield', 'harpoon'];
const ISLE_BP_KEYS = ['torch', 'spear', 'mat', 'umbrella', 'chest', 'shield', 'heal', 'clean', 'pot', 'axe', 'warhammer', 'treehole', 'harpoon', 'telescope', 'furnace', 'bonfire'];
const ISLE_OFFER_RATE = 0.10;

function isleIslandName(key) {
  const it = ISLANDS.find((x) => x.key === key);
  return (it && it.name) || '瓦格岛';
}
function isleNameOf(kind, key) {
  if (kind === 'blueprint') { const b = BLUEPRINTS.find((x) => x.key === key); return (b && b.name) || '图纸'; }
  if (kind === 'npc') return ({ child: '小女孩', priest: '牧师', warrior: '战士' })[key] || '同伴';
  const f = FOODS.find((x) => x.key === key); if (f) return f.name;
  const m = MATS.find((x) => x.key === key); if (m) return m.name;
  const rec = RECIPES[key]; if (rec) return rec.name;
  return '东西';
}
function isleEntry(kind, key, qty) {
  return { kind: kind, key: key, qty: Math.max(1, Number(qty) || 1), name: isleNameOf(kind, key) };
}
function isleKindOf(key) {
  if (FOODS.some((x) => x.key === key)) return 'food';
  if (MATS.some((x) => x.key === key)) return 'material';
  return 'item';
}
function isleTotals(list) { return (list || []).reduce((n, x) => n + (Number(x.qty) || 0), 0); }

/* 把 total 份拆成 1~2 项（尽量两种不同的东西） */
function isleSplit(keys, total) {
  const t = Math.max(1, Math.min(9, Number(total) || 1));
  if (t === 1 || Math.random() < 0.42) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    return [isleEntry(isleKindOf(k), k, t)];
  }
  const a = 1 + Math.floor(Math.random() * (t - 1));
  const b = t - a;
  let k1 = keys[Math.floor(Math.random() * keys.length)];
  let k2 = keys[Math.floor(Math.random() * keys.length)];
  let guard = 0;
  while (k2 === k1 && guard++ < 30) k2 = keys[Math.floor(Math.random() * keys.length)];
  const out = [isleEntry(isleKindOf(k1), k1, a)];
  if (b > 0) out.push(isleEntry(isleKindOf(k2), k2, b));
  return out;
}

function genIsleOffer(r) {
  const others = ISLANDS.filter((x) => x.key !== r.islandKey);
  const them = others[Math.floor(Math.random() * others.length)] || ISLANDS[0];
  const offer = { id: uid('io'), fromKey: them.key, fromName: them.name, need: [], give: [], done: false, at: Date.now() };
  const roll = Math.random();
  if (roll < 0.60) {
    /* 食物 <-> 材料 */
    const foodFirst = Math.random() < 0.5;
    const giveKeys = foodFirst ? ISLE_MAT_KEYS : ISLE_FOOD_KEYS;
    const needKeys = foodFirst ? ISLE_FOOD_KEYS : ISLE_MAT_KEYS;
    const giveN = 1 + Math.floor(Math.random() * 3);
    offer.give = isleSplit(giveKeys, giveN);
    const gt = isleTotals(offer.give);
    const far = Math.random() < 0.20;
    const nt = far
      ? Math.max(1, gt + (Math.random() < 0.5 ? 2 : -2) - Math.floor(Math.random() * 2))
      : Math.max(1, gt + (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : -1)));
    offer.need = isleSplit(needKeys, nt);
  } else if (roll < 0.90) {
    /* 图纸 <-> 物品（1 张图纸 ≈ 2 件东西：10% 一件 / 70% 两件 / 20% 三件） */
    const bpFirst = Math.random() < 0.5;
    const bpKey = ISLE_BP_KEYS[Math.floor(Math.random() * ISLE_BP_KEYS.length)];
    const bp = isleEntry('blueprint', bpKey, 1);
    const r2 = Math.random();
    const cnt = r2 < 0.10 ? 1 : (r2 < 0.80 ? 2 : 3);
    const pool = ISLE_FOOD_KEYS.concat(ISLE_MAT_KEYS);
    const items = isleSplit(pool, cnt);
    if (bpFirst) { offer.need = [bp]; offer.give = items; }
    else { offer.give = [bp]; offer.need = items; }
  } else {
    /* 古怪：NPC / 船图纸 / 成品篝火 / 篝火图纸 */
    const cn = Math.random();
    let give;
    if (cn < 0.45) give = [isleEntry('npc', ['child', 'priest', 'warrior'][Math.floor(Math.random() * 3)], 1)];
    else if (cn < 0.65) give = [isleEntry('blueprint', 'boat', 1)];
    else if (cn < 0.85) give = [isleEntry('item', 'bonfire', 1)];
    else give = [isleEntry('blueprint', 'bonfire', 1)];
    offer.give = give;
    offer.need = isleSplit(ISLE_FOOD_KEYS.concat(ISLE_MAT_KEYS), 2 + Math.floor(Math.random() * 3));
  }
  return offer;
}

/* 我手上某件东西（手牌或装备）的「它能当什么交出去」 */
function ownedEquipEntry(p, id) {
  const sid = String(id || '');
  if (sid.slice(0, 1) !== 'E') return null;
  return (p.equip || []).find((e) => e.id === sid.slice(1)) || null;
}
function ownedDesc(r, p, id) {
  const sid = String(id || '');
  if (sid.slice(0, 1) === 'E') {
    const e = ownedEquipEntry(p, sid);
    if (!e) return null;
    return { kind: 'equip', key: e.key, name: e.name };
  }
  const c = r.cards.get(sid);
  if (!c) return null;
  const kind = c.kind === 'blueprint' ? 'blueprint'
    : (c.kind === 'food' ? 'food'
      : (c.kind === 'material' ? 'material' : (c.kind === 'equip' ? 'equip' : 'item')));
  return { kind: kind, key: c.key || c.bp || '', name: c.name };
}
/* 从手牌/装备里拿走（返回是否成功） */
function takeOwned(r, p, id) {
  const sid = String(id || '');
  if (sid.slice(0, 1) === 'E') {
    const e = ownedEquipEntry(p, sid);
    if (!e) return false;
    p.equip = (p.equip || []).filter((x) => x !== e);
    return true;
  }
  const i = (p.hand || []).indexOf(sid);
  if (i < 0) return false;
  p.hand.splice(i, 1);
  return true;
}
/* 需求项能不能被他交的这件东西满足（图纸可以用成品顶） */
function isleFit(need, d) {
  if (!need || !d) return false;
  if (need.kind === 'blueprint') return d.key === need.key;
  if (need.kind === 'food') return d.kind === 'food' && d.key === need.key;
  if (need.kind === 'material') return d.kind === 'material' && d.key === need.key;
  if (need.kind === 'item') return (d.kind === 'item' || d.kind === 'equip') && d.key === need.key;
  return false;
}
function isleNeedText(of) {
  return (of.need || []).map((x) => x.name + '×' + x.qty).join('、');
}
function isleGiveText(of) {
  return (of.give || []).map((x) => x.name + '×' + x.qty).join('、');
}
/* 把对方给的东西发下去 */
function isleGiveOut(r, p, of) {
  for (const g of (of.give || [])) {
    for (let i = 0; i < (Number(g.qty) || 1); i++) {
      if (g.kind === 'npc') { try { spawnNpcFromCard(r, p, g.key); } catch (err) {} continue; }
      if (g.kind === 'blueprint') {
        const rec = RECIPES[g.key] || {};
        const c = makeCard('blueprint', { key: g.key, name: rec.name || g.name, bp: g.key });
        r.cards.set(c.id, c);
        p.hand.push(c.id);
        continue;
      }
      if (g.kind === 'equip') {
        const rec = RECIPES[g.key] || {};
        p.equip = p.equip || [];
        p.equip.push({ id: uid('e'), key: g.key, name: rec.name || g.name, dur: rec.dur || 0, maxDur: rec.dur || 0 });
        continue;
      }
      const f = FOODS.find((x) => x.key === g.key);
      const c = makeCard(g.kind === 'food' ? 'food' : 'item', { key: g.key, name: (f && f.name) || g.name, cal: f ? f.cal || 0 : 0 });
      r.cards.set(c.id, c);
      p.hand.push(c.id);
    }
  }
}

function isleDeal(r, p, ids) {
  if (r.phase !== 'trade') return '不在交付阶段';
  const of = r.isleOffer;
  if (!of || of.done) return '现在没有外岛交付';
  if (!p || !p.alive) return '你已经倒下了';
  const want = [];
  for (const nd of (of.need || [])) for (let i = 0; i < nd.qty; i++) want.push(nd);
  const list = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
  if (!list.length) return '先挑好要交的东西';
  if (list.length !== want.length) return '要交 ' + want.length + ' 件（它要 ' + isleNeedText(of) + '）';
  const descs = list.map((id) => ownedDesc(r, p, id));
  if (descs.some((d) => !d)) return '有东西不在你身上';
  const usedFlags = new Array(list.length).fill(false);
  for (const nd of want) {
    let hit = -1;
    for (let i = 0; i < descs.length; i++) {
      if (usedFlags[i]) continue;
      if (isleFit(nd, descs[i])) { hit = i; break; }
    }
    if (hit < 0) return '这些不是它要的（它要 ' + isleNeedText(of) + '）';
    usedFlags[hit] = true;
  }
  /* 真的拿走 + 真的给 */
  for (const id of list) if (!takeOwned(r, p, id)) return '有东西不在你身上';
  isleGiveOut(r, p, of);
  of.done = true;
  addLog(r, PN(p) + ' 和「' + of.fromName + '」做成了一笔外岛交付：' + isleNeedText(of) + ' 换 ' + isleGiveText(of), 'gold');
  emitTo(p.id, 'island:sfx', { t: 'coin' });
  return null;
}

function isleRefuse(r, p) {
  if (r.phase !== 'trade') return '不在交付阶段';
  const of = r.isleOffer;
  if (!of || of.done) return '现在没有外岛交付';
  of.done = true;
  addLog(r, PN(p) + ' 摆摆手，「' + of.fromName + '」的小船开走了', '');
  return null;
}

/* ---------------- 交易 ---------------- */
function pairKey(a, b) { return [a, b].sort().join('|'); }
/* v227：交付框里的东西可能是装备（id 以 E 开头，放在 r.trade.eq 里） */
function tradeCardView(r, id) {
  const sid = String(id || '');
  if (sid.slice(0, 1) !== 'E') return cardView(r, sid);
  const e = ((r.trade && r.trade.eq) || {})[sid];
  if (!e) return null;
  return { id: sid, kind: 'equip', key: e.key, name: e.name, dur: e.dur, maxDur: e.maxDur, up: true, eq: 1 };
}
function initTrade(r) {
  /* v234：交付阶段一开始，离队的人先结算「回来」 */
  satuReturn(r);
  r.trade = { pairs: {}, eq: {} };
  r.isleOffer = (Math.random() < ISLE_OFFER_RATE) ? genIsleOffer(r) : null;
  if (r.isleOffer) addLog(r, '海面上飘来一条小船 —— 「' + r.isleOffer.fromName + '」想和我们做一笔交付', 'gold');
  const list = [...r.players.values()].filter((p) => p.alive && !p.away);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      r.trade.pairs[pairKey(list[i].id, list[j].id)] = {
        a: list[i].id, b: list[j].id,
        cardsA: [], cardsB: [], okA: false, okB: false,
      };
    }
  }
}

function addToTrade(r, p, pairId, cardId) {
  if (r.phase !== 'trade' || !r.trade) return '不在交付阶段';
  const pr = r.trade.pairs[pairId];
  if (!pr) return '没有这个交易对';
  if (p.id !== pr.a && p.id !== pr.b) return '不是你的交易';
  if (pr.okA || pr.okB) return '已经确认了，不能再改';
  const side = p.id === pr.a ? 'A' : 'B';
  const own = side === 'A' ? pr.cardsA : pr.cardsB;
  if (own.length >= 4) return '最多放 4 张';
  const sid = String(cardId || '');
  const eq = ownedEquipEntry(p, sid);
  if (sid.slice(0, 1) === 'E') {
    if (!eq) return '这件东西不在你身上';
    p.equip = (p.equip || []).filter((x) => x !== eq);
    r.trade.eq[sid] = eq;
    own.push(sid);
    return null;
  }
  if (!p.hand.includes(sid)) return '你没有这张牌';
  const idx = p.hand.indexOf(sid);
  p.hand.splice(idx, 1);
  own.push(sid);
  return null;
}

function takeBackTrade(r, p, pairId, cardId) {
  if (r.phase !== 'trade' || !r.trade) return '不在交付阶段';
  const pr = r.trade.pairs[pairId];
  if (!pr) return '没有这个交易对';
  if (pr.okA || pr.okB) return '已经确认了，不能再改';
  const side = p.id === pr.a ? 'A' : 'B';
  const own = side === 'A' ? pr.cardsA : pr.cardsB;
  const sid = String(cardId || '');
  const i = own.indexOf(sid);
  if (i < 0) return '不是你的牌';
  own.splice(i, 1);
  if (sid.slice(0, 1) === 'E') {
    const e = (r.trade.eq || {})[sid];
    if (e) { p.equip = p.equip || []; p.equip.push(e); delete r.trade.eq[sid]; }
  } else {
    p.hand.push(sid);
  }
  return null;
}

function confirmTrade(r, p, pairId) {
  if (r.phase !== 'trade' || !r.trade) return '不在交付阶段';
  const pr = r.trade.pairs[pairId];
  if (!pr) return '没有这个交易对';
  if (pr.cardsA.length !== pr.cardsB.length) return '两边卡数不等，不能交易';
  if (p.id === pr.a) pr.okA = true;
  else if (p.id === pr.b) pr.okB = true;
  else return '不是你的交易';
  if (pr.okA && pr.okB) {
    const A = r.players.get(pr.a), B = r.players.get(pr.b);
    const give = (to, ids) => {
      for (const raw of ids) {
        const sid = String(raw);
        if (sid.slice(0, 1) === 'E') {
          const e = (r.trade.eq || {})[sid];
          if (e) { to.equip = to.equip || []; to.equip.push(e); delete r.trade.eq[sid]; }
        } else {
          to.hand.push(sid);
        }
      }
    };
    give(A, pr.cardsB);
    give(B, pr.cardsA);
    pr.cardsA = []; pr.cardsB = [];
    pr.done = true;
    addLog(r, A.name + ' 与 ' + B.name + ' 完成了一次交付');
  }
  return null;
}

function allTradesDone(r) {
  if (!r.trade) return true;
  return Object.values(r.trade.pairs).every((pr) => pr.done || (pr.okA && pr.okB));
}

/* ---------------- 建造 ---------------- */
function buildableBlueprints(p) {
  return p.hand.map((id) => id).filter((id) => true);
}


/* 装备卡（例如掉落的熊掌）：从手牌直接装到装备区 */
function equipFromHand(r, p, cardId) {
  if (!p || !p.alive) return '你已经倒下了';
  const idx = p.hand.indexOf(cardId);
  if (idx < 0) return '这张牌不在手里';
  const c = r.cards.get(cardId);
  if (!c || c.kind !== 'equip') return '这不是装备';
  p.hand.splice(idx, 1);
  r.cards.delete(cardId);
  p.equip = p.equip || [];
  p.equip.push({ id: uid('e'), key: c.key, name: c.name, dur: c.dur || 0, maxDur: c.maxDur || 0 });
  addLog(r, PN(p) + ' 装上了「' + c.name + '」', 'gold');
  return null;
}

/* 图纸完成：材料已交齐，直接出成品 */
function finishBuild(r, p, bp) {
  const rec = RECIPES[bp.bp];
  if (!rec) return '这张图纸暂时用不了';
  const i = p.hand.indexOf(bp.id);
  if (i >= 0) p.hand.splice(i, 1);
  r.cards.delete(bp.id);
  if (rec.place === 'equip') {
    p.equip.push({ id: uid('i'), key: bp.bp, name: rec.name, dur: rec.dur || 0, maxDur: rec.dur || 0 });
    addLog(r, PN(p) + ' 造出了 ' + rec.name);
  } else if (rec.place === 'use') {
    const c = makeCard('item', { key: bp.bp, name: rec.name });
    r.cards.set(c.id, c);
    p.hand.push(c.id);
    addLog(r, PN(p) + ' 做出了 ' + rec.name);
  } else {
    if (bp.bp === 'shelter') { r.common.shelter.built = true; r.common.shelter.dur = 3; r.common.shelter.builtAt = Date.now(); }
    else if (bp.bp === 'furnace') r.common.furnace.built = true;
    else if (bp.bp === 'bonfire') { r.common.bonfire.built = true; r.common.bonfire.hp = 3; r.bonfireNight = true; r.bonfireWinDay = r.day + 1; r.bonfireByName = PN(p); }
    else if (bp.bp === 'chest') { r.common.chest.built = true; r.common.chest.slots = []; r.common.chest.owner = p.id; r.common.chest.builtAt = Date.now(); }
    else if (bp.bp === 'boat') {
      r.common.boat.built = true; r.common.boat.builtAt = Date.now();
      /* v160：一艘船一个撤离按钮 */
      if (!Array.isArray(r.ships)) r.ships = [];
      r.ships.push({ id: uid('ship'), by: p.id, byName: PN(p), takenBy: null, at: Date.now() });
      addLog(r, PN(p) + ' 造好了第 ' + r.ships.length + ' 艘船', 'gold');
    }
    else if (bp.bp === 'pot') { r.extraPots = Math.min(2, (r.extraPots || 0) + 1); }
    else if (bp.bp === 'treehole') {
      r.common.treehole.built = true;
      r.common.treehole.builtAt = Date.now();
      addLog(r, PN(p) + ' 造好了一个树洞，把食物放在门口也许会引来什么', 'gold');
    }
    addLog(r, PN(p) + ' 造出了 ' + rec.name + '（放在中间）');
  }
  /* 阿齐赞（工匠）：造完必返还 1 个材料，另有 10% 再返还 1 个随机材料 */
  if (p.charId === 'aqizan') {
    const keys = Object.keys(rec.mats || {});
    if (keys.length) {
      const give = (k) => {
        const mm = MATS.find((x) => x.key === k) || { key: k, name: k };
        const cc = makeCard('material', { key: mm.key, name: mm.name });
        r.cards.set(cc.id, cc);
        p.hand.push(cc.id);
        return mm.name;
      };
      const g1 = give(keys[0]);
      let txt = PN(p) + '（工匠）造完收回了一份' + g1;
      if (Math.random() < 0.1) txt += '，还多捡到一份' + give(keys[Math.floor(Math.random() * keys.length)]);
      addLog(r, txt, 'gold');
    }
  }
  /* v164：图纸成品 → 全员号角（纯音效，不动任何数值；只这一处用号角） */
  craftSfx(r, 'horn');
  return null;
}
function doBuild(r, p, bpCardId, consume) {
  if (r.phase !== 'build' && r.phase !== 'nightbuild' && !p.makeupBuild) return '不在建造阶段';
  if (r.research && r.research.pid !== p.id) return (r.research.name || '学者') + ' 还在炼药，等他确认后大家再动手';
  const bp = r.cards.get(bpCardId);
  if (!bp || bp.kind !== 'blueprint') return '不是图纸';
  if (!p.hand.includes(bpCardId)) return '图纸不在手里';
  const rec = RECIPES[bp.bp];
  if (!rec) return '这张图纸暂时用不了';
  bp.deliv = bp.deliv || {};
  const need = rec.mats;
  for (const k of Object.keys(need)) {
    let want = need[k] - (bp.deliv[k] || 0);
    while (want > 0) {
      const id = p.hand.find((x) => { const c = r.cards.get(x); return c && c.key === k && (c.kind === 'material' || c.molten); });
      if (!id) return '材料不够：还需要 ' + want + ' 个' + ({ stone: '石头', grass: '草', wood: '木头', iron: '铁', charcoal: '木炭', molten: '铁水' }[k] || k);
      p.hand.splice(p.hand.indexOf(id), 1); r.cards.delete(id);
      bp.deliv[k] = (bp.deliv[k] || 0) + 1;
      want -= 1;
    }
  }
  return finishBuild(r, p, bp);
}

/* 拖一张材料卡到图纸上：材料消失、图纸那一格亮起来 */
function doDeliver(r, p, matId, bpId) {
  if (r.phase !== 'build' && r.phase !== 'nightbuild' && !p.makeupBuild) return '不在建造阶段';
  if (r.research && r.research.pid !== p.id) return (r.research.name || '学者') + ' 还在炼药，等他确认后大家再动手';
  const mat = r.cards.get(matId), bp = r.cards.get(bpId);
  if (!mat || (mat.kind !== 'material' && !mat.molten)) return '这不是材料';
  if (!bp || bp.kind !== 'blueprint') return '这不是图纸';
  if (!p.hand.includes(matId) || !p.hand.includes(bpId)) return '卡不在手里';
  const rec = RECIPES[bp.bp];
  if (!rec) return '这张图纸暂时用不了';
  const need = rec.mats[mat.key] || 0;
  bp.deliv = bp.deliv || {};
  const cur = bp.deliv[mat.key] || 0;
  if (need <= 0) return '这张图纸不需要' + mat.name;
  if (cur >= need) return '这种材料已经塞满了';
  p.hand.splice(p.hand.indexOf(matId), 1);
  r.cards.delete(matId);
  bp.deliv[mat.key] = cur + 1;
  /* v226：塞材料的碎公告不再显示，只有真正造出成品才播报 */
  const done = Object.keys(rec.mats).every((k) => (bp.deliv[k] || 0) >= rec.mats[k]);
  if (!done) return null;
  return finishBuild(r, p, bp);
}

/* ---------------- 烹饪 ---------------- */
/* 火炉：木头→木炭、草→垃圾、铁→铁水（隔天变铁） */
const FURNACE_RECIPE = { wood: 'charcoal', grass: 'junk', iron: 'molten', berry: 'roasted' };

/* 按配方产出：木头→木炭、草→垃圾、铁→铁水 */
function furnaceProductOf(c) {
  const out = FURNACE_RECIPE[c.key];
  if (!out) return null;
  if (out === 'roasted') return makeCard('food', { key: 'roasted', name: '烤浆果', cal: 1, instant: true, tip: '多吃水果对身体好。' });
  if (out === 'junk') return makeCard('item', { key: 'junk', name: '垃圾' });
  if (out === 'molten') return makeCard('item', { key: 'molten', name: '铁水', molten: true });
  const cn = { charcoal: '木炭', molten: '铁水', junk: '垃圾' };
  return makeCard('material', { key: out, name: (MATS.find((m) => m.key === out) || {}).name || cn[out] || out });
}

/* 真正把炉子上那份烧出来（手动点燃 / 建造阶段自动结算共用） */
function furnaceBurnNow(r, why) {
  const f = r.common.furnace;
  if (!f || !f.topCard) return null;
  const id = f.topCard;
  const c = r.cards.get(id);
  f.topCard = null;
  f.burning = false;
  f.lit = false;
  if (!c) return null;
  const made = furnaceProductOf(c);
  r.cards.delete(id);
  if (!made) return null;
  r.cards.set(made.id, made);
  f.outCard = made.id;
  addLog(r, (why || '火炉') + '：' + c.name + ' → ' + made.name);
  craftSfx(r, 'clank');
  return made;
}

function furnaceConvert(r, p, cardId) {
  const f = r.common.furnace;
  if (!f || !f.built) return '火炉还没造出来';
  if (f.burning) return '火炉正在烧，等这一份出来';
  if (f.topCard) return '火炉里已经有东西了，等建造阶段自动结算';
  if (f.outCard) return '火炉下面的东西还没取走';
  const c = r.cards.get(cardId);
  if (!c) return '没有这张卡';
  if (!p.hand.includes(cardId)) return '这张卡不在你手里';
  if (!FURNACE_RECIPE[c.key]) return '火炉只能烧木头、草、铁和浆果';
  p.hand.splice(p.hand.indexOf(cardId), 1);
  c.zone = 'furnace';
  f.topCard = cardId;
  f.lit = false;
  f.burning = false;
  addLog(r, PN(p) + ' 把「' + c.name + '」放进了火炉，建造阶段会自动烧好（不用点火）');
  /* v159：火炉不再手动点燃，只在建造阶段自动烧一次 */
  if (r.phase === 'build' || r.phase === 'nightbuild') {
    setTimeout(function () {
      try {
        if (!f || f.burning || !f.topCard) return;
        if (r.phase !== 'build' && r.phase !== 'nightbuild') return;
        const made = furnaceBurnNow(r, '火炉自动烧好');
        if (made) {
          addLog(r, '火炉把「' + made.name + '」烧好了，在炉子下面');
          broadcastAll(r);
        }
      } catch (err) {}
    }, 700);
  }
  return null;
}

/* 进入建造阶段：炉子里放好的料统一结算（每份按原配方产出） */
function furnaceSettleBuild(r) {
  const f = r.common && r.common.furnace;
  if (!f || !f.built || !f.topCard || f.burning) return;
  const c = r.cards.get(f.topCard);
  if (!c) { f.topCard = null; return; }
  const made = furnaceBurnNow(r, '熔炉开始工作');
  if (made) addLog(r, '熔炉进入建造阶段，统一结算完成（' + made.name + ' 在炉子下面）');
}

function furnaceTake(r, p) {
  const f = r.common.furnace;
  if (!f || !f.built) return '火炉还没造出来';
  if (!f.outCard) return '火炉里没有东西';
  /* v133：手牌不设上限，火炉里的东西随时能拿 */
  const c = r.cards.get(f.outCard);
  if (!c) { f.outCard = null; return null; }
  c.zone = 'hand';
  p.hand.push(c.id);
  f.outCard = null;
  f.topCard = null;
  addLog(r, PN(p) + ' 从火炉里取出了「' + c.name + '」');
  return null;
}

/* 铁水隔天变铁 */
function moltenToIron(r) {
  for (const c of r.cards.values()) {
    if (c && c.molten) {
      c.molten = false;
      c.key = 'iron';
      c.name = '铁';
      c.kind = 'material';
      addLog(r, '一晚上的冷却，「铁水」凝固成了「铁」');
    }
  }
}

function putCook(r, p, cardId, potIdx) {
  if (r.phase !== 'cook') return '不在烹饪阶段';
  if (r.cookStep === 'serve' || r.cookStep === 'cooking') return '锅已经用过了，这一轮不能再放';
  const c = r.cards.get(cardId);
  if (!c) return '没有这张卡';
  if (c.kind !== 'food') return '只能放食物';
  if (!p.hand.includes(cardId)) return '食物不在手里';
  if (!Array.isArray(r.potSlots)) r.potSlots = [[], []];
  const potN = 1 + (r.extraPots || 0);
  while (r.potSlots.length < potN) r.potSlots.push([]);
  /* 指定锅；不指定就找第一口还有空位的 */
  let pi = Number(potIdx);
  if (!(pi >= 0 && pi < potN)) pi = -1;
  if (pi < 0) { for (let k = 0; k < potN; k++) if ((r.potSlots[k] || []).length < 2) { pi = k; break; } }
  if (pi < 0) pi = 0;
  const slots = r.potSlots[pi] || (r.potSlots[pi] = []);
  /* 这口锅已经两格了：把最早的那份顶下来，还给原来的人 */
  if (slots.length >= 2) {
    const old = slots.shift();
    const op = r.players.get(old.owner) || p;
    cardBackTo(r, op, old.id);
    const oc = r.cards.get(old.id);
    const oname = oc ? oc.name : '食材';
    addLog(r, PN(p) + ' 顶下了 ' + PN(op) + ' 的「' + oname + '」，东西退回了他手里', 'fate');
    pushFeed(r, 'cook', PN(p) + ' 顶下了 ' + PN(op) + ' 的「' + oname + '」', 'gold');
  }
  p.hand.splice(p.hand.indexOf(cardId), 1);
  slots.push({ owner: p.id, id: cardId });
  return null;
}

/* 开火前：点锅里某一格，把这一格食材退回放它的人手里 */
function takePotSlot(r, p, potIdx, slotIdx, cardId) {
  if (r.phase !== 'cook') return '不在烹饪阶段';
  if (r.cookStep === 'serve' || r.cookStep === 'cooking') return '锅已经开火了，食材拿不回来了';
  const pi = Number(potIdx);
  if (!(pi >= 0 && pi < (1 + (r.extraPots || 0)))) return '没有这口锅';
  let usePi = pi;
  if (cardId) {
    const found = (r.potSlots || []).findIndex((list) => (list || []).some((x) => x.id === cardId));
    if (found >= 0) usePi = found;
  }
  const slots = (r.potSlots && r.potSlots[usePi]) || [];
  const si = Number(slotIdx);
  const it = (cardId && slots.find((x) => x.id === cardId)) || (si >= 0 ? slots[si] : null) || slots[slots.length - 1];
  if (!it) return '这一格是空的';
  if (it.owner !== p.id) return '这不是你放的食材';
  slots.splice(slots.indexOf(it), 1);
  cardBackTo(r, p, it.id);
  const c = r.cards.get(it.id);
  addLog(r, PN(p) + ' 从第' + (usePi + 1) + '口锅里拿回了「' + (c ? c.name : '食材') + '」');
  return null;
}

/* 开火前：把自己放进锅里的食材拿回手里（按顺序从最后放的开始拿） */
function takeCook(r, p, potIdx) {
  if (r.phase !== 'cook') return '不在烹饪阶段';
  if (r.cookStep === 'serve' || r.cookStep === 'cooking') return '锅已经开火了，食材拿不回来了';
  if (!Array.isArray(r.potSlots)) r.potSlots = [[], []];
  const potN = 1 + (r.extraPots || 0);
  let pi = Number(potIdx);
  const order = [];
  if (pi >= 0 && pi < potN) order.push(pi);
  else for (let k = potN - 1; k >= 0; k--) order.push(k);
  for (const k of order) {
    const slots = r.potSlots[k] || [];
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].owner !== p.id) continue;
      const it = slots.splice(i, 1)[0];
      cardBackTo(r, p, it.id);
      const c = r.cards.get(it.id);
      addLog(r, PN(p) + ' 从第' + (k + 1) + '口锅里拿回了「' + (c ? c.name : '食材') + '」');
      return null;
    }
  }
  return '锅里没有你放的食材';
}

function confirmCook(r, p) {
  if (r.phase !== 'cook') return '不在烹饪阶段';
  if (r.cookStep === 'serve') return '锅已经出锅了，先把自己那份吃了';
  p.cookOk = true;
  /* v234：跟着萨图离队的人不算「还没确认做饭」 */
  const alive = [...r.players.values()].filter((x) => x.alive && !x.away);
  const needOk = Math.min(2, Math.max(1, alive.length));
  if (alive.filter((x) => x.cookOk).length >= needOk) {
    r.cookStep = 'cooking';
    r.cookReadyAt = Date.now() + 3000;
    addLog(r, '锅开始翻腾了，等它把食材煮出来。');
    broadcastAll(r);
    setTimeout(function () {
      try {
        if (r.cookStep !== 'cooking') return;
        const DISH_PAIRS = {
          'carrot|fish': { key: 'carrot_fish', name: '胡萝卜鱼佳肴', cal: 4 },
          'fish|meat': { key: 'meat_fish', name: '肉鱼佳肴', cal: 6 },
          'carrot|meat': { key: 'carrot_meat', name: '胡萝卜肉佳肴', cal: 5 }
        };
        /* v203：厨师在场时，普通盛宴有 15% 机会「爆」成含该食材的搭配佳肴 */
        const chefHere = [...r.players.values()].find((x) => x.alive && x.charId === 'chef') || null;
        const CRIT_PAIRS = {
          carrot: ['carrot|fish', 'carrot|meat'],
          fish: ['carrot|fish', 'fish|meat'],
          meat: ['fish|meat', 'carrot|meat'],
          grass: ['carrot|fish', 'carrot|meat']
        };
        const critDish = (dk) => {
          if (!chefHere) return null;
          const list = CRIT_PAIRS[dk] || [];
          if (!list.length) return null;
          if (Math.random() >= 0.15) return null;
          return DISH_PAIRS[list[Math.floor(Math.random() * list.length)]] || null;
        };
        const madeFeasts = [];
        const pushFeast = (arr, owner, cal, nm, key, dk) => {
          let f = { id: uid('f'), cal, owner, name: nm, key, dish: dk };
          if (String(nm || '').indexOf('佳肴') < 0) {
            const hit2 = critDish(dk);
            if (hit2) {
              f = { id: uid('f'), cal: hit2.cal, owner, name: hit2.name, key: hit2.key, dish: hit2.key, crit: true };
              addLog(r, '「' + String(nm || '').replace(/盛宴$/, '') + '」下锅后竟变成了 ' + hit2.name + '（每份 +' + hit2.cal + '）', 'gold');
            }
          }
          arr.push(f);
          r.common.feasts.push(f);
          madeFeasts.push(f);
        };
        /* 全桌食材按放入顺序摊平，每口锅吃 2 格 */
        const potN = 1 + (r.extraPots || 0);
        if (!Array.isArray(r.potSlots)) r.potSlots = [[], []];
        while (r.potSlots.length < potN) r.potSlots.push([]);
        r.potDishes = [];
        let made = 0;
        let berryPots = 0;
        for (let pi = 0; pi < potN; pi++) {
          const pair = (r.potSlots[pi] || []).map((x) => ({ owner: x.owner, c: r.cards.get(x.id) })).filter((x) => x.c);
          const hasBerry = pair.some((x) => x.c.key === 'berry');
          if (hasBerry) berryPots++;
          const dishes = [];
          if (pair.length === 2) {
            const ks = pair.map((x) => x.c.key || 'meat').sort();
            const hit = DISH_PAIRS[ks.join('|')];
            if (hit && Math.random() < 0.10) {
              const nSpecial = Math.random() < 0.5 ? 1 : 2;
              for (let k = 0; k < nSpecial; k++) pushFeast(dishes, pair[0].owner, hit.cal, hit.name, hit.key, hit.key);
              for (let k = nSpecial; k < 4; k++) {
                const c = pair[(k - nSpecial) % 2].c;
                pushFeast(dishes, pair[0].owner, c.cal || 1, c.name + '盛宴', c.key || '', c.key || 'meat');
              }
              addLog(r, '第' + (pi + 1) + '口锅香味扑鼻：' + hit.name + ' ×' + nSpecial + '（每份 +' + hit.cal + '），另外 ' + (4 - nSpecial) + ' 份是普通佳肴', 'gold');
            } else {
              for (const x of pair) {
                /* v234：浆果是「锁鲜」用的，本身不出菜 */
                if (x.c.key === 'berry') continue;
                for (let k = 0; k < 2; k++) pushFeast(dishes, x.owner, x.c.cal || 1, x.c.name + '盛宴', x.c.key || '', x.c.key || 'meat');
              }
            }
          } else if (pair.length === 1) {
            /* v234：锅里只有浆果 = 什么也煮不出来 */
            if (pair[0].c.key !== 'berry') {
              for (let k = 0; k < 2; k++) pushFeast(dishes, pair[0].owner, pair[0].c.cal || 1, pair[0].c.name + '盛宴', pair[0].c.key || '', pair[0].c.key || 'meat');
            }
          }
          /* v234：这一锅用了浆果 —— 50% 多烤出一份「烤浆果」 */
          if (hasBerry && Math.random() < 0.5) {
            /* v234：多烤出来的一份直接进锅主人的手牌，随时可以拿出来吃 */
            const ownerP = pair[0].owner;
            if (ownerP) {
              giveToHand(r, ownerP, makeCard('food', { key: 'roasted', name: '烤浆果', cal: 1, instant: true, tip: '多吃水果对身体好。' }));
              addLog(r, '浆果的汁水渗进锅里，多烤出了一份「烤浆果」，进了 ' + PN(ownerP) + ' 的手（拿起就能吃，+1 饱食）', 'gold');
            }
          }
          made += dishes.length;
          r.potDishes.push(dishes);
        }
        /* v216：锅里的东西可能坏了 —— 按难度把几份换成「粑粑」（吃了 -1 饱食）
           v234：只要这一锅加了浆果，就锁住精华、绝不会变粑粑 */
        const poopN = berryPots ? 0 : rollPoop(r);
        if (berryPots) addLog(r, '锅里加了浆果，食物的精华被锁住了——这一锅不会变坏', 'gold');
        if (poopN > 0 && madeFeasts.length) {
          const pool = madeFeasts.slice();
          let turned = 0;
          for (let k = 0; k < poopN && pool.length; k++) {
            const f = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
            f.name = '粑粑'; f.cal = -1; f.key = 'poop'; f.dish = 'poop'; f.poop = true; f.crit = false;
            turned++;
          }
          if (turned > 0) addLog(r, '锅里飘出一股怪味……这次有 ' + turned + ' 份变成了「粑粑」（吃了饱食 -1）', 'red');
        }
        for (const x of alive) {
          x.mealBox = [];
          x.cookOk = false;
          x.eatBox = [];
          x.serveOk = false;
        }
        r.potSlots = [[], []];
        r.cookStep = 'serve';
        addLog(r, '盛出来了，一共 ' + made + ' 份——拖给谁吃都行，放好点底下的「确认吃饭」。');
        if (made > 0) craftSfx(r, 'snare');
        broadcastAll(r);
      } catch (e) { console.error('cook tick', e && e.stack); }
    }, 3000);
  }
  return null;
}

/* 把一份盛宴放进自己的进食框（可以放多份） */
function eatTarget(r, toId, p) {
  const to = String(toId || p.id);
  const tPlayer = [...r.players.values()].find((x) => x.id === to && x.alive);
  if (tPlayer) return { who: tPlayer, isPlayer: true };
  const tNpc = (r.npcs || []).find((x) => x.id === to && x.alive);
  if (tNpc) return { who: tNpc, isPlayer: false };
  return null;
}

/* 手牌里的食物/食材直接投进某个人的进食框 */
function serveCard(r, p, cardId, toId) {
  if (r.phase !== 'cook') return '不在烹饪阶段';
  if (r.cookStep !== 'serve') return '锅还在煮 / 还没开始';
  const ci = p.hand.indexOf(cardId);
  if (ci < 0) return '你手里没有这张牌';
  const c = r.cards.get(cardId);
  if (!c) return '这张牌不存在';
  if (c.kind !== 'food' && !(c.kind === 'material' && c.key === 'grass')) return '这个不能吃（草可以吃，木铁不行）';
  const t = eatTarget(r, toId, p);
  if (!t) return '那里没有能吃饭的人';
  const box = t.who.eatBox || (t.who.eatBox = []);
  if (box.length >= 4) return '这个人的框放不下了（最多 4 份）';
  p.hand.splice(ci, 1);
  const cal = c.cal || 1;
  /* 生食的毛病不在这里掷：等就餐结束结算时才结算，放进去的人当场不知道结果 */
  box.push({ id: c.id, name: c.name, cal: cal, key: c.key || '', raw: true, risky: c.kind === 'food' && t.isPlayer });
  /* v127：牌继续留在 r.cards 里（zone=eat），绝不能删——删了之后一挪/一看就凭空消失 */
  c.zone = 'eat';
  if (!r.cards.has(c.id)) r.cards.set(c.id, c);
  addLog(r, PN(p) + ' 把 ' + c.name + ' 放进了 ' + (t.who.id === p.id ? '自己' : t.who.name) + ' 的用餐框');
  return null;
}

/* 把已经盛到某人用餐框里的那份拿回自己手里（只允许在 serve 阶段） */
function serveTake(r, p, boxId, itemId) {
  if (r.phase !== 'cook' || r.cookStep !== 'serve') return '现在不是用餐时间';
  const id = String(itemId || boxId || '');
  if (!id) return '没有这张牌';
  let it = null;
  const all = [...r.players.values(), ...(r.npcs || [])];
  for (const q of all) {
    const k = (q.eatBox || []).findIndex((x) => x && x.id === id);
    if (k >= 0) { it = q.eatBox[k]; q.eatBox.splice(k, 1); break; }
  }
  if (!it) return '框里没有这张牌';
  /* 生食：还没吃掉的牌回本人手牌；做好的菜：只能回盛宴框（生成区），绝不落到别处 */
  if (it.raw && r.cards.has(it.id)) {
    cardBackTo(r, p, it.id);
    addLog(r, PN(p) + ' 把 ' + it.name + ' 从用餐框拿回了手里');
  } else {
    if (!r.common.feasts.some((f) => f.id === it.id)) {
      r.common.feasts.push({ id: it.id, cal: it.cal, owner: p.id, name: it.name, key: it.key, dish: it.dish });
    }
    addLog(r, PN(p) + ' 把 ' + it.name + ' 从用餐框放回了盛宴框');
  }
  return null;
}

function eatTargetRaw(r, toId, p) {
  if (!toId || toId === p.id) return p;
  const n = (r.npcs || []).find((x) => x.id === toId || x.key === toId);
  if (n) return n;
  return r.players.get(toId) || null;
}

function serveFeast(r, p, feastId, toId) {
  if (r.phase !== 'cook') return '不在烹饪阶段';
  if (r.cookStep !== 'serve') return '锅还没开，先放食材点确认烹饪';
  const to = String(toId || p.id);
  const tPlayer = [...r.players.values()].find((x) => x.id === to && x.alive);
  const tNpc = (r.npcs || []).find((x) => x.id === to && x.alive);
  if (!tPlayer && !tNpc) return '那里没有能吃饭的人';
  const dest = tPlayer || tNpc;
  if (!dest.eatBox) dest.eatBox = [];
  if (dest.eatBox.length >= 4) return '他的就餐框已经放满 4 份了';
  /* 先从公共佳肴桌上找 */
  let f = null;
  const i = r.common.feasts.findIndex((x) => x.id === feastId);
  if (i >= 0) {
    f = r.common.feasts[i];
  } else {
    /* 不在桌上：可能已经放进某个人的就餐框里，直接挪过来 */
    const all = [...r.players.values(), ...(r.npcs || [])];
    for (const who of all) {
      const k = (who.eatBox || []).findIndex((x) => x.id === feastId);
      if (k >= 0) { f = who.eatBox[k]; who.eatBox.splice(k, 1); break; }
    }
    if (!f) {
      if (dest.eatBox.some((x) => x.id === feastId)) return null;
      return '这道菜已经下桌了（可能已经被吃掉或者过了夜）';
    }
  }
  const fi = r.common.feasts.findIndex((x) => x.id === feastId);
  if (fi >= 0) r.common.feasts.splice(fi, 1);
  (r.potDishes || []).forEach((list) => {
    const k = (list || []).findIndex((d) => d.id === feastId);
    if (k >= 0) list.splice(k, 1);
  });
  dest.eatBox.push(f);
  addLog(r, PN(p) + ' 把 ' + f.name + ' 放进了 ' + (dest.id === p.id ? '自己' : dest.name) + ' 的用餐框');
  return null;
}

/* 点「确认」：所有人都确认后统一结算饱食度，然后进夜晚 */
/* v195：把盐撒进盛宴 —— 桌上所有菜都变成「丰盛的」 */
function saltRich(r, p, feastId) {
  if (r.phase !== 'cook' || r.cookStep !== 'serve') return '锅还没开，先别撒盐';
  const saltId = (p.hand || []).map((id) => r.cards.get(id)).find((c) => c && c.kind === 'food' && c.key === 'salt' && String(c.id) === String(feastId === undefined ? '' : '') );
  /* feastId 可能直接是盐的 id（拖到餐桌上） */
  let salt = null;
  if (feastId) salt = r.cards.get(String(feastId));
  if (!salt || salt.key !== 'salt') {
    salt = (p.hand || []).map((id) => r.cards.get(id)).find((c) => c && c.kind === 'food' && c.key === 'salt') || null;
  }
  if (!salt) return '你手里没有盐';
  if (!(p.hand || []).includes(salt.id)) return '这包盐不在你手里';
  if (!(r.common.feasts || []).length) return '桌上还没有菜，盐撒不进去';
  p.hand = p.hand.filter((id) => id !== salt.id);
  r.cards.delete(salt.id);
  let n = 0;
  for (const f of r.common.feasts) {
    if (!f.rich) { f.rich = true; n++; }
    f.name = String(f.name || '').replace(/^丰盛的/, '');
    f.name = '丰盛的' + f.name;
  }
  addLog(r, PN(p) + ' 把「盐」撒进了盛宴，桌上的菜都变成了「丰盛的」（' + n + ' 份）', 'gold');
  craftSfx(r, 'clank');
  broadcastAll(r);
  return null;
}

function confirmServe(r, p) {
  if (r.phase !== 'cook') return '不在烹饪阶段';
  if (r.cookStep !== 'serve') return '锅还没开';
  if (p.serveOk) return null;
  p.serveOk = true;
  const alive = [...r.players.values()].filter((x) => x.alive);
  const needOk2 = Math.max(1, alive.length);
  if (alive.filter((x) => x.serveOk).length >= needOk2) finishMeal(r, alive);
  return null;
}

function finishMeal(r, alive) {
  /* 逐口结算：从第一个人开始，每人每 0.4 秒回 1 点饱食度，血条一下一下地跳 */
  const plan = [];
  const sick = [];
  /* v195：「丰盛的」每一份都各自判定一次 */
  const richLog = [];
  for (const x of alive) {
    for (const f of (x.eatBox || [])) {
      if (!f || !f.rich) continue;
      const nm = String(f.name || '菜');
      if (Math.random() < 0.20) { f.cal = (f.cal || 0) + 1; richLog.push(PN(x) + ' 吃到的「' + nm + '」格外顶饱（饱食度再 +1）'); }
      if (Math.random() < 0.09) {
        const before = x.hp;
        x.hp = Math.min(x.maxHp || MAX_HP, x.hp + 1);
        if (x.hp > before) richLog.push(PN(x) + ' 吃到的「' + nm + '」暖到了心里（生命 +1）');
      }
      if (Math.random() < 0.10) {
        const gone = clearBuff(r, x);
        if (gone) richLog.push(PN(x) + ' 吃到的「' + nm + '」压下了【' + gone + '】');
      }
      if (Math.random() < 0.01) {
        x.handLimit = (x.handLimit || 0) + 1;
        richLog.push(PN(x) + ' 吃到的「' + nm + '」让他长了点见识（手牌上限 +1）');
      }
    }
  }
  for (const line of richLog) addLog(r, line, 'fate');
  for (const x of alive) {
    let add = 0;
    const names = [];
    for (const f of (x.eatBox || [])) {
      if ((f.cal || 0) < 0) {
        /* v216：粑粑 —— 吃下去反而掉一点饱食 */
        x.sat = Math.max(0, Number(x.sat || 0) - 1);
        addLog(r, PN(x) + ' 吃到了「粑粑」，饱食 -1（' + x.sat + '/' + (x.satMax || MAX_SAT) + '）', 'red');
        if (f.raw && r.cards.has(f.id)) r.cards.delete(f.id);
        continue;
      }
      add += f.cal || 0; names.push(f.name);
      if (f.raw) {
        r.cards.delete(f.id);   /* 真被吃掉了：生食的牌这才销毁 */
        /* 生食的毛病在这里才结算：1/3 概率染上寄生虫或恶鬼附体 */
        if (f.risky && Math.random() < 1 / 3) {
          const key = Math.random() < 0.5 ? 'ghost' : 'worm';
          if (!sick.some((z) => z.who === x && z.key === key)) sick.push({ who: x, key: key });
        }
      }
    }
    x.eatBox = [];
    x.serveOk = false;
    x.eatGain = 0;
    if (add > 0) plan.push({ kind: 'p', who: x, total: add, left: add, names: names, said: false });
  }
  for (const n of (r.npcs || [])) {
    if (!n.alive || !(n.eatBox || []).length) continue;
    let add = 0;
    for (const f of n.eatBox) {
      if ((f.cal || 0) < 0) {
        n.sat = Math.max(0, Number(n.sat || 0) - 1);
        addLog(r, PN(n) + ' 吃到了「粑粑」，饱食 -1', 'red');
        continue;
      }
      add += f.cal || 0; if (f.raw) r.cards.delete(f.id);
    }
    n.eatBox = [];
    if (add > 0) plan.push({ kind: 'n', who: n, total: add, left: add, names: [], said: false });
  }
  /* 吃出毛病：先弹窗 + 写日志 + 该扣的血立刻扣 */
  if (sick.length) {
    const list = [];
    for (const z of sick) {
      const meta = BUFF_META[z.key];
      addBuff(r, z.who, z.key, 1, '吃了生食');
      let now = '';
      if (z.key === 'worm') {
        const before = z.who.hp;
        z.who.hp = Math.max(0, z.who.hp - 1);
        if (z.who.hp < before) now = '当场发作，生命 -1';
        addLog(r, PN(z.who) + ' 染上寄生虫，当场呕吐，生命 -1（' + z.who.hp + '/' + (z.who.maxHp || MAX_HP) + '）', 'red');
        if (z.who.hp <= 0) killPlayer(r, z.who);
      } else {
        addLog(r, PN(z.who) + ' 恶鬼附体：今天的食物消耗加倍', 'red');
      }
      list.push({ pid: z.who.id, name: PN(z.who), key: z.key, bname: meta.name, eff: meta.eff, now: now });
    }
    r.mealBuffs = { at: Date.now(), list: list };
  } else {
    r.mealBuffs = null;
  }
  r.cookStep = 'put';
  if (!plan.length) {
    addLog(r, '大家都吃饱了，天黑下来了');
    broadcastAll(r);
    advancePhase(r);
    return;
  }
  addLog(r, '开饭了，大家一口一口地吃…');
  broadcastAll(r);
  let idx = 0;
  const step = function () {
    try {
      if (!r.mealTicking) { r.mealTicking = true; }
      if (idx >= plan.length) {
        r.mealTicking = false;
        for (const it of plan) if (it.kind === 'p') it.who.eatGain = it.total;
        addLog(r, '大家都吃饱了，天黑下来了');
        broadcastAll(r);
        advancePhase(r);
        return;
      }
      const it = plan[idx];
      if (it.left <= 0) { idx += 1; setTimeout(step, 220); return; }
      if (!it.said) {
        it.said = true;
        if (it.kind === 'p') addLog(r, it.who.name + ' 吃下了 ' + (it.names.length ? it.names.join('、') : '饭') + '（饱食度 +' + it.total + '）');
        else addLog(r, it.who.name + ' 也吃上了（饱食度 +' + it.total + '）');
      }
      it.left -= 1;
      if (it.kind === 'p') {
        const before = it.who.sat;
        it.who.sat = Math.min(it.who.satMax || MAX_SAT, it.who.sat + 1);
        if (it.who.sat > before) it.who.eatGain = (it.who.eatGain || 0) + 1;
        if (it.who.sat >= (it.who.satMax || MAX_SAT)) it.left = 0;
      } else {
        it.who.sat = Math.min(it.who.maxSat || 5, (it.who.sat || 0) + 1);
        if (it.who.sat >= (it.who.maxSat || 5)) it.left = 0;
      }
      broadcastAll(r);
      setTimeout(step, 400);
    } catch (e) { console.error('meal tick', e); }
  };
  setTimeout(step, 400);
}

/* v234：烤浆果这类「拿起就能吃」的东西，直接吃掉 */
function eatInstantCard(r, p, id) {
  const c = r.cards.get(String(id || ''));
  if (!c) return '没有这张卡';
  const i = (p.hand || []).indexOf(c.id);
  if (i < 0) return '这张卡不在你手里';
  if (!c.instant) return '这个不能直接吃，得下锅或者烤一下';
  p.hand.splice(i, 1);
  r.cards.delete(c.id);
  p.sat = Math.min(p.satMax || MAX_SAT, p.sat + (c.cal || 0));
  clearFatigueIfFull(r, p);
  addLog(r, PN(p) + ' 吃了一份 ' + c.name + '（饱食度 +' + (c.cal || 0) + '）');
  if (c.key === 'roasted' && Math.random() < 0.05) {
    const nm = clearBuff(r, p);
    if (nm) addLog(r, '水果的酸甜把身上的「' + nm + '」压了下去', 'gold');
  }
  return null;
}

function eatFeast(r, p, feastId) {
  if (r.phase === 'cook' && r.cookStep === 'serve') return serveFeast(r, p, feastId);
  const i = r.common.feasts.findIndex((f) => f.id === feastId);
  if (i < 0) return '没有这份盛宴';
  const f = r.common.feasts[i];
  r.common.feasts.splice(i, 1);
  p.sat = Math.min(p.satMax || MAX_SAT, p.sat + f.cal);
  addLog(r, PN(p) + ' 吃了一份 ' + f.name + '（饱食度 +' + f.cal + '）');
  clearFatigueIfFull(r, p);
  return null;
}

/* ---------------- 夜晚 ---------------- */
function chooseNight(r, p, mode, useMat, useUmbrella) {
  if (r.phase !== 'night') return '现在不是夜晚';
  /* v160：队里有缇西时，所有人等她选完明天要找什么，才能进入夜晚行动 */
  if (r.tixiAsk && !r.tixiAsk.done) return '缇西还在想明天先找什么，等她选完';
  if (p.escaped) return '你已经撤离了';
  p.outTonight = mode === 'out';
  p.sleepMat = !!useMat;
  const wn = nightWeather(r);
  if (mode === 'out') {
    if (!hasEquip(p, 'torch')) return '没有火把，出不去';
    /* v152：火把耐久 4，每次外出按 wearItem 的 2/3 判定磨一点 */
    const torch = (p.equip || []).find((e) => e.key === 'torch' && (!e.maxDur || e.dur > 0));
    if (torch && torch.maxDur) wearItem(r, p, torch, '火把');
    const umbrella = !!useUmbrella && hasEquip(p, 'umbrella') && wn.key === 'rain';
    if (umbrella) {
      const u = (p.equip || []).find((e) => e.key === 'umbrella' && (!e.maxDur || e.dur > 0));
      if (u && u.maxDur) wearItem(r, p, u, '雨伞');
    }
    const sp = nightPoints(r, umbrella);
    const got = [];
    p.nightLoot = [];
    for (let i = 0; i < sp; i++) {
      const c = drawCard(r);
      r.cards.set(c.id, c);
      if (c.kind === 'monster') {
        /* v224：夜里撞上野兽不再排进明天的战斗，当场掷一次遭遇
           （2/5 躲开、1/5 扣血、1/5 中毒、1/5 受伤，负面都只压明天一天） */
        r.cards.delete(c.id);
        nightMonsterEncounter(r, p, c.mon);
        continue;
      }
      if (c.kind === 'fate') {
        /* v151：命运卡夜里抽到也当场结算，不进「带回来的东西」 */
        r.cards.delete(c.id);
        openFate(r, p);
        continue;
      }
      /* 先不塞进手牌：这一步是「选择带回来的东西」 */
      p.nightLoot.push(c.id);
      got.push(c.kind === 'blueprint' ? '一张【？？】图纸' : c.kind === 'item' ? '一件道具' : c.name);
    }
    /* 夜里出门等于又过一个白天：饱食度也累加，日终统一结算 */
    if (p.charId === 'dong' && Math.random() < 0.5) {
      addLog(r, PN(p) + ' 一个人走在夜里，一点也不觉得饿（不消耗饱食度）');
    } else {
      p.satSpent = (p.satSpent || 0) + (wn.food || 1);
    }
    if (wn.key === 'storm') {
      const sd = playerDmg(p, 1);
      p.hp = Math.max(0, p.hp - sd);
      addLog(r, PN(p) + ' 在雷雨夜外出，被雷劈了，生命 -' + sd + (sd > 1 ? '（蛇毒发作，伤害翻倍）' : ''));
      if (p.hp <= 0) { killPlayer(r, p); }
      if (!p.alive) {
        /* v151：倒在雷雨夜的人不再清点战利品（带回来的东西已经散在地上了） */
        p.nightLoot = [];
        p.nightMode = 'out';
        p.nightDone = true;
        if (allNightDone(r)) finishNight(r);
        return null;
      }
    }
    addLog(r, PN(p) + ' 举着火把在' + wn.name + '夜外出（探索点 ' + sp + (umbrella ? '·带雨伞' : '') + '，饱食 -' + (wn.food || 1) + '），带回 ' + (got.length ? got.join('、') : '空手'));
    /* v157：正常搜索照旧走完，之后再额外掷一次 25% 的特殊事件 */
    nightSpecialEvent(r, p);
    if (!p.alive) {
      p.nightLoot = [];
      p.nightMode = 'out';
      p.nightDone = true;
      if (allNightDone(r)) finishNight(r);
      return null;
    }
  } else if (useMat) {
    const matItem = p.equip.find((e) => e.key === 'mat');
    if (!matItem) return '没有草席';
    p.matSleep = true;
    p.matNextDay = true;   /* v213：这一晚的加成要留到第二天摸牌 */
    addLog(r, PN(p) + ' 睡了草席，明天探索 +1');
    /* v213：草席一共 5 次耐久，每次使用 2/3 概率消耗一次 */
    wearItem(r, p, matItem, '草席');
  }
  p.nightMode = p.outTonight ? 'out' : (p.sleepMat ? 'mat' : 'sleep');
  /* 外出的人要先「选择带回来的东西」，收下之后这一夜才算走完 */
  p.nightDone = !(p.nightLoot && p.nightLoot.length);
  if (p.nightLoot && p.nightLoot.length) addLog(r, PN(p) + ' 回来了，清点带的东西（' + p.nightLoot.length + ' 件），点「搜索」收进手牌');
  if (allNightDone(r)) finishNight(r);
  return null;
}

function allNightDone(r) {
  return [...r.players.values()].filter((x) => x.alive && !x.away).every((x) => x.nightDone);
}

/* 夜里点「搜索」：把搜到的东西直接收进手牌（不传 ids 就是全收下）。
   注意：这里不再顺手把 nightDone 置真——玩家还要再点一次「下个阶段」才进夜晚建造阶段。 */
function takeNightLoot(r, p, ids) {
  if (r.phase !== 'night') return '现在不是夜晚';
  const loot = (p.nightLoot || []).slice();
  if (!loot.length) return null;
  let pick = (Array.isArray(ids) && ids.length) ? loot.filter((id) => ids.indexOf(id) >= 0) : loot;
  if (!pick.length) pick = loot;
  const names = [];
  for (const id of pick) {
    if (p.hand.indexOf(id) < 0) p.hand.push(id);
    const c = r.cards.get(id);
    if (c) {
      c.zone = 'hand';
      names.push(c.kind === 'blueprint' ? '一张图纸' : c.name);
    }
    p.nightLoot.splice(p.nightLoot.indexOf(id), 1);
  }
  if (!p.nightLoot.length) p.nightLoot = [];
  addLog(r, PN(p) + ' 搜索带回 ' + pick.length + ' 件东西' + (names.length ? '（' + names.join('、') + '）' : '') + '，已经放进了手牌', 'green');
  return null;
}

/* 夜里点「下个阶段」：收好战利品、这一夜走完；全员都走完就进夜晚建造阶段 */
function nightNext(r, p) {
  if (r.phase !== 'night') return '现在不是夜晚';
  if (p.nightLoot && p.nightLoot.length) takeNightLoot(r, p, null);
  p.nightDone = true;
  addLog(r, PN(p) + ' 收拾好东西，准备进夜晚建造阶段');
  if (allNightDone(r)) finishNight(r);
  return null;
}

/* ---------------- 战斗 ---------------- */
function emitTo(pid, ev, data) {
  try { const sk = NSP && NSP.sockets.get(pid); if (sk) sk.emit(ev, data); } catch (e) {}
}

/* v195：善良生灵先上去和野怪打，纯随机出手，公告只报总伤害 */
function helperDuel(r, mons) {
  if (!(r.helpers || []).length) return mons;
  const ms = mons.slice();
  const hs = r.helpers.slice();
  let guard = 0;
  while (ms.length && hs.length && guard++ < 40) {
    const h = hs[Math.floor(Math.random() * hs.length)];
    const m = ms[Math.floor(Math.random() * ms.length)];
    m.hp -= Math.max(1, h.dmg || 1);
    if (m.hp <= 0) addLog(r, '善良的' + h.name + ' 咬死了野怪' + m.name, 'gold');
    if (!ms.length) break;
    const m2 = ms[Math.floor(Math.random() * ms.length)];
    if (!m2) break;
    const h2 = hs[Math.floor(Math.random() * hs.length)];
    h2.hp -= Math.max(1, m2.dmg || 1);
    if (h2.hp <= 0) { addLog(r, '善良的' + h2.name + ' 倒下了', 'red'); hs.splice(hs.indexOf(h2), 1); }
    ms.filter((x) => x.hp <= 0).forEach((x) => { const i = ms.indexOf(x); if (i >= 0) ms.splice(i, 1); });
  }
  r.helpers = hs;
  r.helperDuelAt = Date.now();
  if (!ms.length) addLog(r, '善良的生灵把野怪全部赶走了', 'gold');
  return ms;
}

function openNextJobDone(r) {
  if (r.job) return;
  openNextJob(r);
}

function startFight(r, mons, resume) {
  if (r.helpers && r.helpers.length) {
    const keep = helperDuel(r, mons.map((k) => ({ key: k, hp: monHp(r, k), dmg: (MONSTERS[k] || {}).dmg || 1, name: (MONSTERS[k] || {}).name || k })));
    if (!keep.length) { broadcastAll(r); return; }
    mons = keep.map((x) => x.key);
    r.helperPreDmg = keep.map((x) => ({ key: x.key, hp: x.hp }));
  }
  const list = mons.map((k) => {
    const t = MONSTERS[k];
    return { id: uid('m'), key: k, name: t.name, hp: monHp(r, k), maxHp: monHp(r, k), dmg: t.dmg, ox: !!t.ox, prey: !!t.prey, round: 1 };
  });
  /* v234：每次怪物来袭，30% 附带一只兔子、10% 附带一只绵羊 */
  const preyAdd = [];
  if (Math.random() < 0.30) preyAdd.push('rabbit');
  if (Math.random() < 0.10) preyAdd.push('sheep');
  for (const k of preyAdd) {
    const t = MONSTERS[k];
    list.push({ id: uid('m'), key: k, name: t.name, hp: monHp(r, k), maxHp: monHp(r, k), dmg: 0, prey: true, round: 1 });
  }
  r.fightFrom = r.phase; /* v137：记下开战前处于哪个阶段，打完要补做该阶段的收尾检查 */
  r.resumePhase = resume || 'build';
  r.fight = { monsters: list, turn: 0, order: [...r.players.values()].filter((p) => p.alive && !p.away).map((p) => p.id), round: 1, log: [], fx: [], fxSeq: 0, acted: [], pending: [], settling: false };
  r.phase = 'fight';
  addLog(r, '野怪出现：' + list.map((m) => m.name).join('、'));
  for (const k of preyAdd) {
    addLog(r, (k === 'rabbit' ? '草丛里还窜出来一只兔子' : '后面还跟着一只温顺的绵羊') + '（不还手，打不死就跑了）');
    for (const q of r.players.values()) emitTo(q.id, 'island:sfx', { t: 'prey', key: k });
  }
  for (const q of r.players.values()) emitTo(q.id, 'island:sfx', { t: 'fight', mons: list.map((m) => m.key) });
}

function endFight(r) {
  addLog(r, '战斗结束');
  const from = r.fightFrom || '';
  r.fightFrom = '';
  r.fight = null;
  /* v137：搜索阶段翻出怪物，打完仗才算搜索真正结束——这时必须补做一次手牌检查 */
  if (from === 'search') {
    const alive = [...r.players.values()].filter((x) => x.alive);
    if (alive.some((p) => overHand(r, p) > 0)) {
      for (const p of alive) p.discardDone = overHand(r, p) <= 0;
      r.phase = 'discard';
      r.nextPhase = r.resumePhase || 'trade';
      addLog(r, '搜索阶段结束：手牌超过上限的人弃到上限，然后点「弃牌结束」');
      return;
    }
  }
  r.phase = r.resumePhase || 'build';
  if (r.phase === 'build') furnaceSettleBuild(r);
  if (r.phase === 'trade' && !r.trade) initTrade(r);
  if (r.phase === 'night') {
    for (const p of r.players.values()) { p.nightDone = false; p.nightMode = ''; }
    addLog(r, '进入夜晚阶段');
  }
}

function fightAct(r, p, action, targetId) {
  const f = r.fight;
  if (!f) return '现在没有战斗';
  if (!p.alive) return '你已经倒下了';
  if (!f.acted) f.acted = [];
  if (!f.pending) f.pending = [];
  if (f.settling) return '伤害正在结算，等判定完';
  if (f.acted.includes(p.id)) return '这一轮你已经出手了';
  const tgt = f.monsters.find((m) => m.id === targetId && m.hp > 0) || f.monsters.find((m) => m.hp > 0);
  if (!tgt) return '已经没有目标';
  let dmg = 0;
  if (action === 'punch') dmg = 1 + ((p.equip || []).some((e) => e.key === 'bearpaw') ? 2 : 0);
  else if (action === 'stone') {
    const i = p.hand.findIndex((id) => { const cc = r.cards.get(id); return cc && cc.kind === 'material' && cc.key === 'stone'; });
    if (i < 0) return '没有石头';
    r.cards.delete(p.hand[i]); p.hand.splice(i, 1); dmg = 2 + (p.charId === 'ranger' ? 1 : 0);
  } else if (action === 'hammer') {
    const hm = p.equip.find((e) => e.key === 'warhammer' && (!e.maxDur || e.dur > 0));
    if (!hm) return '没有战锤';
    dmg = 2;
    wearItem(r, p, hm, '战锤');
  } else if (action === 'spear') {
    const sp = p.equip.find((e) => e.key === 'spear');
    if (!sp) return '没有长矛';
    dmg = 5;
    wearItem(r, p, sp, '长矛');
  } else return '未知动作';
  if (p.charId === 'haft' && dmg > 0) dmg += 1 + (action === 'spear' ? 1 : 0);
  /* v194：村民「家畜亲和」——对猫 / 狗 / 牛伤害翻倍 */
  if (p.charId === 'vill' && dmg > 0 && (tgt.key === 'cat' || tgt.key === 'ox' || tgt.key === 'rabbit' || tgt.key === 'sheep')) {
    dmg *= 2;
    addLog(r, '家畜亲和：对 ' + tgt.name + ' 的伤害翻倍');
  }
  /* v194：鼓舞（学生「跳过搜索」带来）伤害 +1 */
  if (dmg > 0 && Number(p.inspire || 0) > 0) dmg += 1;
  /* v194：小猫咪伴随出手 */
  if (dmg > 0 && r.cat && r.cat.follow === p.id) {
    dmg += 1;
    addLog(r, '小猫咪扑上去挠了一下（伤害 +1）');
  }
  const rangerBack = action === 'stone' && p.charId === 'ranger' && Math.random() < 2 / 3;
  if (tgt.key === 'bear' && dmg <= 1) { dmg = 0; addLog(r, PN(p) + ' 的拳头打在狗熊厚皮上没起作用'); }
  if ((tgt.key === 'rat' || tgt.key === 'ratking') && dmg >= 3) { addLog(r, tgt.name + ' 闪开了这一击（只有两点以下的伤害才打得中）'); dmg = 0; }
  f.acted.push(p.id);
  f.pending.push({ mon: tgt.id, n: dmg, by: p.id, key: tgt.key });
  if (rangerBack) {
    const sc = makeCard('material', { key: 'stone', name: '石头' });
    r.cards.set(sc.id, sc);
    p.hand.push(sc.id);
    addLog(r, PN(p) + ' 把扔出去的石头捡了回来');
  }
  const how = action === 'spear' ? '用长矛捅向' : (action === 'hammer' ? '用战锤砸向' : (action === 'stone' ? '扔石头砸向' : '一拳打向'));
  addLog(r, PN(p) + ' ' + how + ' ' + tgt.name + '（扣 ' + dmg + '，等所有人打完一起结算）');
  const aliveP = [...r.players.values()].filter((x) => x.alive);
  if (aliveP.every((x) => f.acted.includes(x.id))) scheduleSettle(r, f);
  else broadcastAll(r);
  return null;
}

/* 野怪掉落表：返回 [{kind, extra, name}]；roll 由调用方传入，便于单独统计验证 */
function monsterDrops(key, roll, broll) {
  const out = [];
  if (broll == null) broll = Math.random();
  if (key === 'ox') {
    /* 50% 两块 / 40% 一块 / 10% 三块 */
    const n = roll < 0.5 ? 2 : (roll < 0.9 ? 1 : 3);
    for (let i = 0; i < n; i++) out.push({ kind: 'food', extra: { key: 'meat', name: '大肉', cal: 3 }, name: '大肉' });
  } else if (key === 'cat') {
    if (roll < 0.5) out.push({ kind: 'food', extra: { key: 'fish', name: '鱼', cal: 2 }, name: '鱼' });
  } else if (key === 'snake') {
    /* 40% 空 / 50% 一个材料 / 10% 两个材料 */
    if (roll >= 0.4) {
      const n = roll < 0.9 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const m = MATS[Math.floor(Math.random() * MATS.length)];
        out.push({ kind: 'material', extra: { key: m.key, name: m.name }, name: m.name });
      }
    }
  } else if (key === 'hound') {
    /* 20% 大肉 / 20% 铁水 / 60% 空 */
    if (roll < 0.2) out.push({ kind: 'food', extra: { key: 'meat', name: '大肉', cal: 3 }, name: '大肉' });
    else if (roll < 0.4) out.push({ kind: 'item', extra: { key: 'molten', name: '铁水', molten: true }, name: '铁水' });
  } else if (key === 'bear') {
    if (roll < 0.1) out.push({ kind: 'equip', extra: { key: 'bearpaw', name: '熊掌' }, name: '熊掌' });
  } else if (key === 'rabbit') {
    if (roll < 0.3) out.push({ kind: 'food', extra: { key: 'meat', name: '大肉', cal: 3 }, name: '大肉' });
  } else if (key === 'sheep') {
    if (roll < 0.5) out.push({ kind: 'food', extra: { key: 'meat', name: '大肉', cal: 3 }, name: '大肉' });
  } else if (key === 'rat') {
    if (roll < RAT_DROP) out.push({ kind: 'food', extra: { key: 'meat', name: '大肉', cal: 3 }, name: '大肉' });
    /* v160：老鼠 5% 掉一张随机图纸 */
    if (broll < 0.05) out.push({ kind: 'blueprint', name: '图纸' });
  } else if (key === 'ratking') {
    /* v160：鼠王 10% 掉一张随机图纸 */
    if (broll < 0.10) out.push({ kind: 'blueprint', name: '图纸' });
  }
  return out;
}

function dropMonsterLoot(r, m) {
  if (!m) return;
  let list = monsterDrops(m.key, Math.random(), Math.random());
  /* v186 宝宝版：野怪倒下一定会留下东西（原本「空手」的怪也塞一件） */
  if (!list.length && isBaby(r)) {
    const r2 = Math.random();
    if (r2 < 0.45) list = [{ kind: 'food', extra: { key: 'meat', name: '大肉', cal: 3 }, name: '大肉' }];
    else if (r2 < 0.75) list = [{ kind: 'food', extra: { key: 'fish', name: '鱼', cal: 2 }, name: '鱼' }];
    else if (r2 < 0.95) { const mt = MATS[Math.floor(Math.random() * MATS.length)]; list = [{ kind: 'material', extra: { key: mt.key, name: mt.name }, name: mt.name }]; }
    else list = [{ kind: 'blueprint', name: '图纸' }];
  }
  if (!list.length) return;
  if (!Array.isArray(r.ground)) r.ground = [];
  const names = [];
  for (const spec of list) {
    /* v160：图纸走现有随机图纸逻辑（任意一张） */
    const card = spec.kind === 'blueprint' ? cardByKind('blueprint', r) : makeCard(spec.kind, spec.extra);
    if (!card) continue;
    r.cards.set(card.id, card);
    r.ground.push(card.id);
    names.push(card.name || spec.name || '东西');
  }
  if (!names.length) return;
  const same = names.every((n) => n === names[0]);
  const txt = same && names.length > 1 ? names.length + ' 块' + names[0] : names.join('、');
  addLog(r, m.name + '掉落了 ' + txt + '，落在中间的地上，谁都可以捡', 'gold');
  if (names.indexOf('熊掌') >= 0) addLog(r, '获得了【熊掌】：装到身上后，普通拳击伤害变成 3 点', 'gold');
}

/* 一轮所有人出手后：每 0.4 秒结算一下伤害，全部跳完再让怪物还手 */
function scheduleSettle(r, f) {
  if (!f || f.settling) return;
  f.settling = true;
  /* v138：骑士（战士）每一轮只追加一次平A——等所有人打完，随机挑一个本轮被攻击的目标 */
  for (const npc of r.npcs || []) {
    if (npc.key === 'warrior' && npc.alive) {
      const hitIds = [];
      (f.pending || []).forEach((x) => { if (hitIds.indexOf(x.mon) < 0) hitIds.push(x.mon); });
      const hitOnes = f.monsters.filter((m) => m.hp > 0 && hitIds.indexOf(m.id) >= 0);
      const pool = hitOnes.length ? hitOnes : f.monsters.filter((m) => m.hp > 0);
      if (pool.length) {
        const t = pool[Math.floor(Math.random() * pool.length)];
        f.pending.push({ mon: t.id, n: npc.atk, by: 'npc:' + npc.id, key: t.key });
        addLog(r, '战士跟着补了一刀（+ ' + npc.atk + '，打在 ' + t.name + ' 身上）');
      }
      break;
    }
  }
  broadcastAll(r);
  const q = (f.pending || []).slice();
  let i = 0;
  const dropFor = (m) => { dropMonsterLoot(r, m); };
  const finishRound = () => {
    try {
      f.pending = [];
      f.acted = [];
      if (f.monsters.every((m) => m.hp <= 0)) { endFight(r); broadcastAll(r); return; }
      setTimeout(() => {
        try {
          if (!r.fight || r.fight !== f) return;
          f.settling = false;
          f.round = (f.round || 1) + 1;
          monstersAct(r, f);
          if (f.monsters.every((m) => m.hp <= 0)) endFight(r);
          broadcastAll(r);
        } catch (e) { console.error('retal tick', e); }
      }, 1000);
    } catch (e) { console.error('finish round', e); }
  };
  const step = () => {
    try {
      if (!r.fight || r.fight !== f) return;
      if (i >= q.length) { finishRound(); return; }
      const hit = q[i++];
      const m = f.monsters.find((x) => x.id === hit.mon);
      if (m && m.hp > 0) {
        m.hp -= hit.n;
        f.fx.push({ id: ++f.fxSeq, kind: 'dmgMon', mon: m.id, key: m.key, n: hit.n });
        addLog(r, m.name + ' 受到了（扣 ' + hit.n + '）' + (m.hp <= 0 ? '，倒下了' : '，还剩 ' + m.hp + ' 血'), 'red');
        if (m.hp <= 0) dropFor(m);
      }
      broadcastAll(r);
      setTimeout(step, 400);
    } catch (e) { console.error('settle tick', e); }
  };
  setTimeout(step, 400);
}

/* 倒下：清空装备和状态，手牌交给弃牌堆 */
function checkPartyWipe(r) {
  if (r.ended) return false;
  const alive = [...r.players.values()].filter((x) => x.alive);
  if (!alive.length) return settleEnding(r);
  return false;
}

/* v160：把一个人的手牌 / 装备 / 夜里带回的东西全部散到公共地面（倒下和撤离共用） */
function scatterToGround(r, p) {
  if (!Array.isArray(r.ground)) r.ground = [];
  const dropped = [];
  if (Array.isArray(p.hand)) {
    for (const id of p.hand) {
      const c = r.cards.get(id);
      if (!c) continue;
      c.zone = 'ground';
      r.ground.push(id);
      dropped.push(c.name);
    }
    p.hand = [];
  }
  for (const e of (p.equip || [])) {
    if (!e) continue;
    const ec = makeCard('equip', { key: e.key, name: e.name, dur: Number(e.dur) || 0, maxDur: Number(e.maxDur) || 0 });
    if (!ec) continue;
    r.cards.set(ec.id, ec);
    ec.zone = 'ground';
    r.ground.push(ec.id);
    dropped.push(e.name);
  }
  if (Array.isArray(p.nightLoot)) {
    for (const id of p.nightLoot) {
      const c = r.cards.get(id);
      if (!c) continue;
      c.zone = 'ground';
      r.ground.push(id);
      dropped.push(c.name);
    }
    p.nightLoot = [];
  }
  p.equip = [];
  return dropped;
}

function killPlayer(r, p) {
  if (r.cat && r.cat.follow === p.id) {
    const nid = pickCatOwner(r);
    if (nid) {
      r.cat.follow = nid;
      addLog(r, '小猫咪在 ' + PN(p) + ' 身边叫了几声，跑去了 ' + PN(r.players.get(nid)) + ' 那边。', 'fate');
    } else {
      r.cat = null;
      addLog(r, '小猫咪钻回了树洞，再也没有出来。', 'fate');
    }
  }
  p.alive = false;
  p.hp = 0;
  p.wound = 0;
  p.venom = 0;
  p.cookOk = false;
  p.mealBox = [];
  p.eatBox = [];
  /* v151：倒下的人手牌 / 装备全部散落到公共拾取区（地图中间的地上），
     谁都能看见、谁都能点着捡走；捡起来的牌走正常进手牌的路子。 */
  const dropped = scatterToGround(r, p);
  p.discardDone = true;
  const dline = PN(p) + ' 倒下了（手牌和装备都散落在地上，谁都能捡）';
  addLog(r, dline, 'red');
  pushFeed(r, 'death', dline, 'red');
  if (dropped.length) addLog(r, PN(p) + ' 留下的东西落在中间的地上：' + dropped.join('、') + '（点一下就能捡）', 'gold');
  /* 全员倒下：直接判负，弹失败动画 */
  checkPartyWipe(r);
}

/* v160：点船 = 自己撤离。东西像倒下一样散到公共地面，撤离本身不立刻胜利，
   等所有人都“有了归属”（倒下或撤离）再结算。 */
function escapePlayer(r, p) {
  if (!r || r.ended) return '这一局已经结束了';
  if (!p || !p.alive || p.escaped) return '你现在不能撤离';
  const ships = Array.isArray(r.ships) ? r.ships : [];
  const ship = ships.find((s) => s && !s.takenBy);
  if (!ship) return '现在没有空船';
  ship.takenBy = p.id;
  ship.takenAt = Date.now();
  p.escaped = true;
  p.alive = false;
  p.hp = 0;
  p.cookOk = false;
  p.mealBox = [];
  p.eatBox = [];
  const dropped = scatterToGround(r, p);
  p.discardDone = true;
  addLog(r, PN(p) + ' 登上了船，离开了瓦格', 'gold');
  pushFeed(r, 'escape', PN(p) + ' 乘船撤离了', 'gold');
  if (dropped.length) addLog(r, PN(p) + ' 留下的东西落在中间的地上：' + dropped.join('、') + '（点一下就能捡）', 'gold');
  settleEnding(r);
  return null;
}

/* v160：所有人都有归属（倒下或撤离）后才结算 */
function settleEnding(r) {
  if (!r || r.ended) return true;
  const ps = [...r.players.values()];
  if (!ps.length) return false;
  if (ps.some((x) => x.alive)) return false;
  const esc = ps.filter((x) => x.escaped);
  if (esc.length) {
    const names = esc.map((x) => PN(x)).join('、');
    endGame(r, 'win', names + ' 乘船离开了瓦格');
    return true;
  }
  endGame(r, 'lose', '全员倒下');
  return true;
}

function monstersAct(r, f) {
  /* v234：改成一只一只还手，每只之间隔 0.3 秒，不能一股脑全出来 */
  const queue = f.monsters.filter((m) => m.hp > 0);
  let qi = 0;
  const actOne = (m) => {
    /* v234：兔子/绵羊不还手 —— 挨完一轮就叫一声跑掉（没有掉落物） */
    if (m.prey) {
      f.fx.push({ id: ++f.fxSeq, kind: 'fleeMon', mon: m.id, key: m.key });
      addLog(r, m.name + ' 叫了一声，撒腿就跑掉了（没被打死，没有掉落）');
      for (const q of r.players.values()) emitTo(q.id, 'island:sfx', { t: 'flee', key: m.key });
      m.hp = 0;
      return;
    }
    if (m.key === 'ox') {
      if (f.round === 2) addLog(r, '肉牛叫了一声');
      if (f.round >= 3) { addLog(r, '肉牛逃走了'); m.hp = 0; return; }
    }
    const aliveP = [...r.players.values()].filter((p) => p.alive && !p.away);
    const aliveN = (r.npcs || []).filter((n) => n.alive);
    /* 玩家和 NPC 一起进池子；有持盾者就只从持盾者里选（玩家/NPC 同权） */
    const shieldedP = aliveP.filter((p) => (p.equip || []).some((e) => e.key === 'shield'));
    const shieldedN = aliveN.filter((n) => (n.equip || []).some((e) => e.key === 'shield'));
    const shielded = shieldedP.concat(shieldedN);
    let pool = [];
    if (shielded.length) pool = shielded;
    else if (m.key === 'ox') pool = aliveP.slice();
    else pool = aliveP.concat(aliveN);
    if (!pool.length) return;
    const tgt = pool[Math.floor(Math.random() * pool.length)];
    f.fx.push({ id: ++f.fxSeq, kind: 'atkMon', mon: m.id, key: m.key, n: m.dmg });
    if (tgt && !r.players.has(tgt.id)) {
      /* NPC：挨打、扣血、没血就死 */
      const dmg0 = m.dmg;
      tgt.hp -= dmg0;
      f.fx.push({ id: ++f.fxSeq, kind: 'hitNpc', target: tgt.name, to: tgt.id, n: dmg0, mon: m.id, key: m.key });
      addLog(r, m.name + ' 攻击 ' + tgt.name + '，- ' + dmg0 + ' 生命');
      if (tgt.hp < 0) { tgt.hp = 0; tgt.alive = false; tgt.deadDay = r.day; startLoot(r, tgt); addLog(r, tgt.name + ' 倒下了'); }
      return;
    }
    let dmg = m.dmg;
    const sh = tgt.equip.find((e) => e.key === 'shield');
    if (sh && dmg > 0) {
      if (Math.random() < 1 / 3) {
        f.fx.push({ id: ++f.fxSeq, kind: 'blocked', target: tgt.id, mon: m.id, key: m.key });
        addLog(r, tgt.name + ' 的盾牌挡下了这一击');
        return;
      }
      const shOk = wearItem(r, tgt, sh, '盾牌');
      addLog(r, tgt.name + ' 的盾牌吸收了伤害');
      if (shOk) return;
      addLog(r, tgt.name + ' 的盾牌碎了，这一击打在身上');
    }
    const snakeHit = Number(tgt.snake || 0) > 0 && dmg > 0;
    if (snakeHit) dmg = dmg * 2;
    tgt.hp -= dmg;
    f.fx.push({ id: ++f.fxSeq, kind: 'hitPlayer', target: tgt.id, n: dmg, mon: m.id, key: m.key });
    addLog(r, m.name + ' 攻击 ' + tgt.name + '，- ' + dmg + ' 生命' + (snakeHit ? '（蛇毒发作，伤害翻倍）' : ''));
      if (m.key === 'cat' && Math.random() < 2 / 3) addBuff(r, tgt, 'wound', 2, '被抓伤了，今天不能外出搜索');
      if (m.key === 'snake') addBuff(r, tgt, 'venom', 3, '中毒了，这几天消耗的食物加倍');
    if (tgt.hp <= 0) { killPlayer(r, tgt); }
  };
  const step = () => {
    try {
      if (!r || r.fight !== f || r.ended) return;
      if (qi >= queue.length) { broadcastAll(r); return; }
      const m = queue[qi++];
      if (m && m.hp > 0) actOne(m);
      if (!r || r.fight !== f) { broadcastAll(r); return; }
      broadcastAll(r);
      if (qi >= queue.length) return;
      setTimeout(step, 320);
    } catch (e) { console.error('mon act', e); }
  };
  setTimeout(step, 320);
}

/* 阶段结束掷野怪：随机 20%（4 阶段各 5%）+ 固定日的野怪 */
/* 狗熊两套窗口：抽卡（翻牌 / 卡池）第 8 天起就可能有；自然生成（阶段结束随机、固定日）
   要到第 15 天才会出。前 7 天（第 1 周）任何来源都没有狗熊。 */
function bearOkAt(r, src) {
  const day = r.day || 1;
  return day >= (src === 'natural' ? 15 : 8);
}
function drawMonKey(r, src) {
  const bearOk = bearOkAt(r, src);
  const pool = monPool(r, bearOk);
  const c = drawCard(r);
  if (c.kind === 'monster' && (c.mon !== 'bear' || bearOk)) return c.mon;
  return pickW(pool).key;
}

function rollMonster(r, stage) {
  /* 野怪第 5 天起才会出现 */
  if ((r.day || 1) < 5) return false;
  let spawn = false;
  /* 突发野怪概率按周递增：第1周每阶段 2%，第2周 3%，第3周 4% */
  const wk = Math.min(3, Math.ceil((r.day || 1) / 7));
  const chance = wk <= 1 ? 0.02 : (wk === 2 ? 0.03 : 0.04);
  if (Math.random() < chance) spawn = true;
  if (r.monsterDays.includes(r.day) && !r.fixedSpawned) { spawn = true; r.fixedSpawned = true; }
  if (!spawn) return false;
  const week = Math.min(3, Math.ceil(r.day / 7));
  const list = [];
  /* 自然生成：狗熊要到第 15 天才可能出现 */
  for (let k = 0; k < week; k++) list.push(drawMonKey(r, 'natural'));
  applyMonsterSummons(r, list);
  startFight(r, list, r.nextPhase || 'build');
  return true;
}

/* 招小弟：鼠王 20% 招一只老鼠（招来的 10% 再招）；每多一只新老鼠 8% 再带一只；
   其他怪 5%（2.5% 老鼠 / 2.5% 鼠王）；老鼠总数上限 4 只 */
function applyMonsterSummons(r, list) {
  /* 老鼠（小弟）上限 4 只 */
  const mul = Number(roomDiff(r).summonMul) || 1;   /* v226：渺茫版 ×2 */
  const ratCount = () => list.filter((x) => x === 'rat').length;
  const addRat = (why) => {
    if (ratCount() >= 4) return false;
    list.push('rat');
    addLog(r, '【老鼠】来了' + (why ? '（' + why + '）' : ''), 'red');
    /* 每多一只新老鼠，有 8% 概率再带一只 */
    if (Math.random() < 0.08 * mul) addRat('老鼠又带来了同类');
    return true;
  };
  for (const k of list.slice()) {
    if (k === 'ratking') {
      /* 鼠王 20% 概率招一只老鼠；招来的老鼠有 10% 概率再招一只 */
      if (Math.random() < 0.20 * mul) {
        if (addRat('鼠王招来的')) { if (Math.random() < 0.10 * mul) addRat('小弟又招来的'); }
        const rline = '并且招来了老鼠【老鼠】×' + ratCount();
        addLog(r, rline, 'red');
        pushFeed(r, 'monster', rline, 'red');
      }
    } else if (k !== 'rat') {
      /* 其他怪：5% —— 2.5% 老鼠 / 2.5% 鼠王 */
      const roll = Math.random();
      if (roll < 0.025 * mul) { addRat('别的怪叫来的'); }
      else if (roll < 0.05 * mul) { list.push('ratking'); addLog(r, '还跟来了一只【鼠王】', 'red'); }
    }
  }
}

/* ---------------- NPC ---------------- */
/* 牧师可能想要：食材、材料、图纸、做出来的物品；绝不会要野怪卡或人物卡 */
function priestWantPool() {
  const pool = [];
  for (const f of FOODS) {
    if (f.noSearch) continue;   /* v217：盐搜不到，牧师不会要 */
    pool.push({ kind: 'food', key: f.key, name: f.name });
  }
  for (const m of MATS) pool.push({ kind: 'material', key: m.key, name: m.name });
  for (const b of BLUEPRINTS) {
    if (b.cat === 'fate') continue;
    pool.push({ kind: 'blueprint', key: b.key, name: b.key === 'junk' ? '垃圾' : b.name });
  }
  for (const b of BLUEPRINTS) {
    if (b.cat === 'fate') continue;
    pool.push({ kind: 'item', key: b.key, name: b.name });
  }
  return pool;
}

/* v217：牧师每天只要一件东西，数量恒为 1 */
function wantCount() {
  return 1;
}

function rollPriestWant() {
  const pool = priestWantPool();
  const byKind = {};
  for (const it of pool) (byKind[it.kind] = byKind[it.kind] || []).push(it);
  /* v217：食物 / 材料 / 图纸 / 成品 各 25%，再在类别里等概率挑一件 */
  const kinds = ['food', 'material', 'blueprint', 'item'].filter((k) => (byKind[k] || []).length);
  const kind = kinds[Math.floor(Math.random() * kinds.length)] || 'food';
  const list = byKind[kind] || [{ kind: 'food', key: 'fish', name: '鱼' }];
  const it = list[Math.floor(Math.random() * list.length)];
  return { kind: it.kind, key: it.key, name: it.name, count: wantCount(it), done: 0, by: [] };
}
function npcDaily(r) {
  for (const npc of r.npcs) {
    if (!npc.alive) continue;
    /* NPC 也吃饭：每天最多消耗 2 点。饱食 0 只是饿得发慌，不掉血不死；
       只有被饿成负数才会当场阵亡。 */
    if (typeof npc.sat !== 'number') npc.sat = 5;
    /* v144：NPC 每天消耗 = 当天天气的饱食消耗，最多 2 点（天气要 3 点也只吃 2 点） */
    const npcCost = Math.min(2, Math.max(1, Number(todayWeather(r).food) || 1));
    npc.sat = npc.sat - npcCost;
    if (npc.sat < 0) {
      npc.sat = 0;
      npc.alive = false;
      npc.deadDay = r.day;
      addLog(r, '「' + npc.name + '」饿得撑不住了，倒了下去…… NPC 少了一位', 'red');
      continue;
    }
    if (npc.sat === 0) addLog(r, '「' + npc.name + '」今天吃了 ' + npcCost + ' 点饱食度，饿得发慌，但还撑得住');
    if (npc.key === 'child') {
      const roll = Math.random();
      const owner = r.players.get(npc.pid) || [...r.players.values()][0];
      let c = null, label = '';
      if (roll < 0.30) { c = cardByKind('food', r); label = '食物'; }
      else if (roll < 0.60) { c = cardByKind('material', r); label = '材料'; }
      else if (roll < 0.80) { c = cardByKind('blueprint', r); label = '图纸'; }
      else if (roll < 0.90) { const b = pickW(BLUEPRINTS); c = makeCard('item', { key: b.key, name: b.name }); label = '道具'; }
      else {
        /* v168：第 1、2 天小女孩不会带回除肉牛以外的野怪 */
        const early = ((r.day || 1) <= 2);
        const mk = pickW(early ? MON_W.filter((x) => x.key === 'ox') : MON_W).key;
        if (!r.pendingFight) r.pendingFight = [];
        r.pendingFight.push(mk);
        addLog(r, '小女孩脸色发白地跑回来：后面跟来了一只' + MONSTERS[mk].name + '！');
      }
      if (c) {
        r.cards.set(c.id, c);
        if (owner) owner.hand.push(c.id);
        addLog(r, '小女孩带回了「' + c.name + '」（' + label + '），交给了 ' + (owner ? owner.name : '大家'));
      }
    }
    if (npc.key === 'priest') {
      npc.want = rollPriestWant();
      addLog(r, '牧师今天需要「' + npc.want.name + ' ×' + npc.want.count + '」（交齐给他就能回血）');
    }
    if (npc.key === 'warrior') npc.atk = 3;
  }
}

/* ---------------- 结算 ---------------- */
/* v153 重新开局：只把点按钮的那个人放进一个全新的空房间，其他人一律请回大厅。
   房间号可以沿用，但状态全部清空、只剩他一个人。 */
function restartRoom(r, who) {
  const nr = newIslandRoom({ code: r.code, mode: r.mode });
  nr.mode = r.mode;
  nr.island = r.island || nr.island;
  nr.islandKey = r.islandKey || nr.islandKey;
  nr.started = false;
  nr.picking = false;
  nr.phase = 'morning';
  nr.day = 1;
  nr.ended = null;
  nr.order = [];
  nr.hostId = null;
  if (who && who.id) {
    newIslandPlayer(nr, who.id, who.name, 0);
    nr.order.push(who.id);
    nr.hostId = who.id;
  }
  addLog(nr, '重新开局：房间已经重置，现在只有你一个人在岛上。请重新选择角色，点「开始游戏」发牌。', 'gold');
  return nr;
}

/* v232：这一局完了，把下一局的房号算出来（888 → 889） */
function nextCodeOf(code) {
  const m = String(code || '').match(/^(.*?)(\d+)$/);
  if (!m) return String(code || '').slice(0, 10) + 'B';
  return (m[1] + (Number(m[2]) + 1)).slice(0, 12);
}

function endGame(r, result, why) {
  r.phase = 'over';
  r.ended = { result, why, at: Date.now() };
  r.nextCode = nextCodeOf(r.code);
  addLog(r, (result === 'win' ? '胜利：' : '失败：') + why);
}

/* ---------------- 弃牌阶段：夜里带回来的牌超过手牌上限就要弃到上限 ---------------- */
function overHand(r, p) { return handCardCount(r, p) - handLimit(p); }

/* 把牧师想要的那张牌交给他：给他回 1 血，33% 概率其他伤员也回 1 血 */
function giveNpc(r, p, cardId) {
  const npc = (r.npcs || []).find((n) => n.key === 'priest' && n.alive);
  if (!npc) return '牧师不在';
  if (!npc.want) return '牧师今天没有想要的';
  const i = p.hand.indexOf(String(cardId));
  if (i < 0) return '这张牌不在你手里';
  const c = r.cards.get(cardId);
  if (!c) return '这张牌不存在';
  const w = npc.want;
  if (c.kind !== w.kind || c.key !== w.key) return '牧师想要的是「' + w.name + '」';
  const need = Math.max(1, w.count || 1);
  if ((w.done || 0) >= need) return '牧师已经收够了';
  p.hand.splice(i, 1);
  c.zone = 'npc';
  c.owner = npc.key;
  w.done = (w.done || 0) + 1;
  w.by = w.by || [];
  if (!w.by.some((x) => x.id === p.id)) w.by.push({ id: p.id, name: PN(p) });
  addLog(r, PN(p) + ' 把「' + w.name + '」交给了牧师（' + w.done + '/' + need + '）');
  if (w.done < need) return null;

  /* v149：收齐了 → ①随机给一名交过东西的玩家回 1 血 ②有概率再治一名伤员 ③有概率给所有人回 1 血 */
  const contributors = w.by.slice();
  npc.want = null;
  npc.received = (npc.received || 0) + need;
  const healOne = (q, why, quiet) => {
    if (!q || !q.alive) return false;
    const max = q.maxHp || 5;
    if ((q.hp | 0) >= max) return false;
    const before = q.hp;
    q.hp = Math.min(max, q.hp + 1);
    if (!quiet) addLog(r, PN(q) + ' 回血 ' + before + ' → ' + q.hp + (why ? '（' + why + '）' : ''), 'gold');
    return true;
  };
  const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
  const givers = contributors.map((x) => r.players.get(x.id)).filter((q) => q && q.alive);
  let healedOne = false;
  if (givers.length) healedOne = healOne(pickOne(givers), '牧师感谢他送来的东西');
  if (!healedOne) addLog(r, '牧师收下了东西，点了点头。');
  const hurtPool = () => [...r.players.values(), ...(r.npcs || [])]
    .filter((q) => q.alive && q !== npc && (q.hp | 0) < (q.maxHp || 5));
  if (Math.random() < 0.4) {
    const list = hurtPool();
    if (list.length) healOne(pickOne(list), '牧师顺手处理了他的伤口');
  }
  if (Math.random() < 0.18) {
    const all = [...r.players.values(), ...(r.npcs || [])].filter((q) => q.alive && q !== npc);
    let n = 0;
    for (const q of all) if (healOne(q, '', true)) n++;
    if (n) addLog(r, '牧师把大家的伤都看了一遍：所有人回 1 血', 'gold');
  }
  return null;
}

function finishNight(r) {
  /* 正确顺序：选夜晚行动 → 收带回来的东西 → 夜晚建造阶段 → 才结束这一天 */
  /* 兜底：进夜晚建造阶段之前，谁手里还有没拿的战利品就直接塞进他的牌里 */
  [...r.players.values()].forEach((x) => {
    const lo = (x.nightLoot || []).slice();
    if (!lo.length) return;
    lo.forEach((id) => {
      if (x.hand.indexOf(id) < 0) x.hand.push(id);
      const c = r.cards.get(id);
      if (c) c.zone = 'hand';
    });
    addLog(r, PN(x) + ' 把夜里带回的 ' + lo.length + ' 件东西收进了手牌');
    x.nightLoot = [];
  });
  /* v154：今晚没有任何人外出，就没有「夜里回来的人」要建造——直接天亮，
     不黑屏、也不用任何人点「结束建造」 */
  const outs = [...r.players.values()].filter((x) => x.alive && x.nightMode === 'out').map((x) => x.id);
  if (!outs.length) {
    addLog(r, '今晚没有人外出，直接天亮');
    r.phase = 'night';
    nextDay(r);
    return;
  }
  r.phase = 'nightbuild';
  /* v154：夜晚建造只服务于外出回来的人；没外出的人视为已经同意，不挡阶段推进 */
  r.nightBuildDone = [...r.players.values()]
    .filter((x) => x.alive && x.nightMode !== 'out')
    .map((x) => x.id);
  r.mealBuffs = r.mealBuffs || null;
  addLog(r, '进入夜晚建造阶段（只有外出回来的人需要收工，其他人视为已同意跳过）');
  broadcastAll(r);
}

/* 夜晚建造阶段：建造完了（或跳过）→ 这一天才结束 */
function nightBuildFinish(r, p) {
  if (r.phase !== 'nightbuild') return '现在不是夜晚建造阶段';
  if (!Array.isArray(r.nightBuildDone)) r.nightBuildDone = [];
  if (r.nightBuildDone.indexOf(p.id) < 0) r.nightBuildDone.push(p.id);
  const alive = [...r.players.values()].filter((x) => x.alive);
  if (alive.every((x) => r.nightBuildDone.indexOf(x.id) >= 0)) {
    addLog(r, '夜深了，这一天的建造收工');
    r.phase = 'night';
    nextDay(r);
  } else {
    const left = alive.filter((x) => r.nightBuildDone.indexOf(x.id) < 0).length;
    addLog(r, PN(p) + ' 建造完了，还等 ' + left + ' 位队友');
  }
  return null;
}

/* 弃牌结束：回到 search 之后的正常流程（交付） */
function afterDiscard(r) {
  const aliveOver = [...r.players.values()].filter((x) => x.alive && overHand(r, x) > 0);
  if (aliveOver.length) {
    for (const x of aliveOver) x.discardDone = false;
    addLog(r, '还有人手牌超过上限，弃到上限才能继续');
    return;
  }
  const to = r.nextPhase || 'trade';
  if (to === 'trade') initTrade(r);
  if (to === 'cook') { r.cook = { ok: {} }; r.cookStep = 'put'; }
  if (to === 'build') furnaceSettleBuild(r);
  r.phase = to;
  addLog(r, '进入' + PHASE_NAME[to] + '阶段');
}

function doDiscard(r, p, cardId) {
  if (r.phase !== 'discard') return '现在不是弃牌阶段';
  const i = p.hand.indexOf(String(cardId));
  if (i < 0) return '这张牌不在你手里';
  const c = r.cards.get(cardId);
  p.hand.splice(i, 1);
  if (c) { c.zone = 'discard'; r.discard.push(c.id); addLog(r, PN(p) + ' 弃掉了 ' + (c.kind === 'blueprint' ? '一张【？？】图纸' : c.name)); }
  p.discardDone = overHand(r, p) <= 0;
  if ([...r.players.values()].filter((x) => x.alive).every((x) => x.discardDone)) afterDiscard(r);
  return null;
}

/* v189：神明（赛）的专属能力——弃牌阶段，只要手没满，可以从弃牌堆把牌捡回手里 */
function doDiscardTake(r, p, cardId) {
  if (r.phase !== 'discard') return '现在不是弃牌阶段';
  if (!p || p.charId !== 'sai') return '只有神明能把弃牌堆的牌拿回来';
  if (!p.alive) return '神明已经倒下了';
  if ((p.hand || []).length >= handLimit(p)) return '手牌已经到上限了（' + handLimit(p) + ' 张）';
  const id = String(cardId || '');
  const idx = (r.discard || []).indexOf(id);
  if (idx < 0) return '弃牌堆里没有这张牌';
  const c = r.cards.get(id);
  if (!c) return '弃牌堆里没有这张牌';
  r.discard.splice(idx, 1);
  c.zone = 'hand';
  p.hand.push(id);
  addLog(r, PN(p) + ' 从弃牌堆拿回了「' + (c.kind === 'blueprint' ? '图纸' : (c.name || '牌')) + '」（手牌 ' + p.hand.length + '/' + handLimit(p) + '）', 'fate');
  broadcastAll(r);
  return null;
}

/* 弃牌阶段把牌塞进锅里临时存放（锅上两个位置） */
function storeToPot(r, p, cardId) {
  if (r.phase !== 'discard') return '现在不是弃牌阶段';
  const i = p.hand.indexOf(cardId);
  if (i < 0) return '这张牌不在你手里';
  const c = r.cards.get(cardId);
  if (!c) return '没有这张牌';
  if (c.kind !== 'food' && !(c.kind === 'material' && c.key === 'grass')) return '锅里只能放食物（草也可以）';
  let used = 0;
  for (const other of r.players.values()) used += (other.mealBox || []).length;
  if (used >= 2) return '锅上只有两个位置，已经放满了';
  p.hand.splice(i, 1);
  p.mealBox = p.mealBox || [];
  p.mealBox.push(cardId);
  c.zone = 'pot';
  addLog(r, PN(p) + ' 把「' + c.name + '」先放进了锅里');
  p.discardDone = overHand(r, p) <= 0;
  broadcastAll(r);
  return null;
}

/* 弃牌阶段把牌塞进熔炉（熔炉一个位置，放上去就开始烧） */
function storeToFurnace(r, p, cardId) {
  if (r.phase !== 'discard') return '现在不是弃牌阶段';
  const f = r.common.furnace;
  if (!f || !f.built) return '还没有造好熔炉';
  if (f.burning || f.topCard || f.outCard) return '熔炉上已经有一份了';
  const i = p.hand.indexOf(cardId);
  if (i < 0) return '这张牌不在你手里';
  const c = r.cards.get(cardId);
  if (!c) return '没有这张牌';
  if (!FURNACE_RECIPE[c.key]) return '熔炉只烧木头（变木炭）、草（变垃圾）、铁（变铁水）、浆果（变烤浆果）';
  p.hand.splice(i, 1);
  c.zone = 'furnace';
  f.topCard = cardId;
  f.by = p.id;
  f.burning = false;
  f.lit = false;
  addLog(r, PN(p) + ' 往熔炉里放了「' + c.name + '」，点「点燃」才会开始烧（或等建造阶段自动结算）');
  p.discardDone = overHand(r, p) <= 0;
  broadcastAll(r);
  return null;
}

/* 队友倒下后插进来的战利品阶段 */
function startLoot(r, npc) {
  const items = [];
  for (let i = 0; i < 2; i++) {
    const c = drawCard(r);
    if (c && c.kind !== 'fate') { r.cards.set(c.id, c); items.push(c.id); }
  }
  (npc.eatBox || []).forEach((f) => { if (f && f.id) items.push(f.id); });
  if (!items.length) return;
  r.loot = { name: npc.name, items: items, back: r.phase };
  [...r.players.values()].forEach((x) => { x.lootOk = false; });
  r.phase = 'loot';
  addLog(r, npc.name + ' 倒下了，留下的东西散在地上，大家分了吧');
  broadcastAll(r);
}

/* 地面拾取：谁点谁拿，不检查手牌上限，立刻进手牌 */
/* v221：天亮时把地上没被捡走的东西全部清掉（掉落物只留到第二天刷新） */
function clearGround(r) {
  if (!Array.isArray(r.ground) || !r.ground.length) return;
  const names = [];
  for (const id of r.ground.slice()) {
    const c = r.cards.get(id);
    if (c) names.push(c.name || '东西');
    purgeCard(r, id);
  }
  r.ground = [];
  if (names.length) {
    addLog(r, '天亮了，地上剩下的 ' + names.length + ' 件东西（' + names.join('、') + '）被潮水冲走了', 'red');
  }
}

function groundTake(r, p, cardId) {
  if (!Array.isArray(r.ground) || !r.ground.length) return '地上没有东西';
  const i = r.ground.indexOf(cardId);
  if (i < 0) return '这块已经被人捡走了';
  const c = r.cards.get(cardId);
  r.ground.splice(i, 1);
  if (!c) return '这块已经被人捡走了';
  c.zone = 'hand';
  p.hand.push(cardId);
  addLog(r, PN(p) + ' 捡起了地上的「' + c.name + '」', 'gold');
  return null;
}

function lootTake(r, p, cardId) {
  if (r.phase !== 'loot' || !r.loot) return '现在没有东西可以分';
  const i = r.loot.items.indexOf(cardId);
  if (i < 0) return '这份已经被拿走了';
  /* v133：手牌不设上限 */
  r.loot.items.splice(i, 1);
  const c = r.cards.get(cardId);
  if (c) { c.zone = 'hand'; p.hand.push(cardId); addLog(r, PN(p) + ' 拿走了「' + c.name + '」'); }
  if (!r.loot.items.length) finishLoot(r);
  else broadcastAll(r);
  return null;
}

function lootOk(r, p) {
  if (r.phase !== 'loot' || !r.loot) return '现在没有东西可以分';
  p.lootOk = true;
  const alive = [...r.players.values()].filter((x) => x.alive);
  if (!r.loot.items.length || alive.every((x) => x.lootOk)) finishLoot(r);
  else broadcastAll(r);
  return null;
}

function finishLoot(r) {
  const back = (r.loot && r.loot.back) || 'search';
  r.loot = null;
  r.phase = back;
  [...r.players.values()].forEach((x) => { x.lootOk = false; });
  broadcastAll(r);
}

function discardDone(r, p) {
  if (r.phase !== 'discard') return '现在不是弃牌阶段';
  if (overHand(r, p) > 0) return '还有 ' + overHand(r, p) + ' 张牌没弃掉';
  p.discardDone = true;
  if ([...r.players.values()].filter((x) => x.alive).every((x) => x.discardDone)) afterDiscard(r);
  return null;
}

function settleHunger(r) {
  for (const p of r.players.values()) {
    if (!p.alive) { p.satSpent = 0; continue; }
    let cost = p.satSpent || 0;
    p.satSpent = 0;
    /* 丘比（胖子）：每天结算饱食度时，有 33% 概率少吃 1 点 */
    if (cost > 0 && p.charId === 'qiubi' && Math.random() < 1 / 3) {
      cost -= 1;
      addLog(r, PN(p) + ' 的胖肚子帮他省下 1 点饱食消耗（今天少吃一点）', 'gold');
    }
    if (cost > 0) applyHunger(r, p, cost);
  }
}

/* ================= v186：食物耐久（渺茫版）+ 夜里的小老鼠 ================= */
const FOOD_FRESH_MAX = 100;  /* v219：新鲜度 0~100，和饱食值完全无关 */
const FOOD_FRESH_STEP = 50;  /* 每过一夜掉一半新鲜度 */

function markShatter(r, c) {
  if (!r || !c) return;
  if (!Array.isArray(r.shatterEvents)) r.shatterEvents = [];
  r.shatterEvents.push({ id: c.id, name: c.name || '食物', at: Date.now() });
  if (r.shatterEvents.length > 8) r.shatterEvents.splice(0, r.shatterEvents.length - 8);
}

/* 把一张卡从玩家的各个容器里彻底抹掉 */
function purgeCard(r, id) {
  if (!r || !id) return null;
  const c = r.cards.get(id) || null;
  for (const p of r.players.values()) {
    if (Array.isArray(p.hand)) p.hand = p.hand.filter((x) => x !== id);
    if (Array.isArray(p.nightLoot)) p.nightLoot = p.nightLoot.filter((x) => x !== id);
  }
  const ch = r.common && r.common.chest;
  if (ch && Array.isArray(ch.slots)) ch.slots = ch.slots.map((sl) => (sl && sl.id === id ? null : sl));
  if (Array.isArray(r.ground)) r.ground = r.ground.filter((x) => x !== id);
  if (Array.isArray(r.discard)) r.discard = r.discard.filter((x) => x !== id);
  r.cards.delete(id);
  return c;
}

/* 每过一夜，食物少一半新鲜度：第一夜 100% → 50%，第二夜就彻底坏掉消失（饱食值不受影响） */
function freshPct(c) {
  if (!c) return 0;
  if (c.fresh == null) return FOOD_FRESH_MAX;
  return Math.max(0, Math.min(FOOD_FRESH_MAX, Number(c.fresh) || 0));
}

function rotFoods(r) {
  if (!roomDiff(r).foodRot) return;
  const shatter = [];
  const rotOne = (c, who) => {
    const before = freshPct(c);
    const after = before - FOOD_FRESH_STEP;
    c.fresh = Math.max(0, after);
    if (c.fresh <= 0) { shatter.push({ c }); return; }
    addLog(r, (who ? PN(who) + ' 手里的' : '箱子里的') + '「' + (c.name || '食物') + '」没那么新鲜了：新鲜度 ' + before + '% → ' + c.fresh + '%', 'red');
  };
  for (const p of r.players.values()) {
    if (!p.alive) continue;
    for (const id of (p.hand || []).slice()) {
      const c = r.cards.get(id);
      if (!c || c.kind !== 'food') continue;
      rotOne(c, p);
    }
    /* 箱子里的食物一样会坏 */
    const chest = r.common && r.common.chest;
    if (chest && Array.isArray(chest.slots)) {
      for (const sl of chest.slots) {
        if (!sl || !sl.id) continue;
        const c = r.cards.get(sl.id);
        if (!c || c.kind !== 'food') continue;
        rotOne(c, null);
      }
    }
  }
  for (const it of shatter) {
    markShatter(r, it.c);
    purgeCard(r, it.c.id);
    addLog(r, '「' + (it.c.name || '食物') + '」彻底不新鲜了，烂成渣，被海风吹走了', 'red');
  }
}

/* 随机造一件东西给玩家（小老鼠送礼用） */
function makeRandomThing(r) {
  const roll = Math.random();
  if (roll < 0.42) {
    const f = pickW(FOODS);
    return makeCard('food', { key: f.key, name: f.name, cal: f.cal });
  }
  if (roll < 0.78) {
    const m = MATS[Math.floor(Math.random() * MATS.length)];
    return makeCard('material', { key: m.key, name: m.name });
  }
  if (roll < 0.92) return cardByKind('blueprint', r);
  return makeCard('item', { key: 'molten', name: '铁水', molten: true });
}

const MOUSE_NAME = '小老鼠';

/* v220：夜鼠偷东西时目标区域的权重池——手牌 / 箱子 / 公共建筑 等权重 */
function mousePool(hasHand, chestCount, commonList) {
  const pool = [];
  if (hasHand) pool.push({ k: 'hand', w: 1 });
  if (chestCount > 0) pool.push({ k: 'chest', w: 1 });
  if (commonList && commonList.length) pool.push({ k: 'common', w: 1 });
  return pool;
}

/* v223：养了猫以后，老鼠出现的概率下降 5.5%（所有难度通用） */
const CAT_MOUSE_CUT = 0.055;
function mouseChance(r) {
  const d = roomDiff(r);
  const m = d.mouse;
  if (!m) return 0;
  const catHome = !!(r.cat && r.cat.arrived);
  return Math.max(0, Number(m.p || 0) - (catHome ? CAT_MOUSE_CUT : 0));
}

/* 夜里的那只小老鼠：简单/渺茫是来偷东西的，宝宝版是来送礼的 */
function nightMouse(r) {
  const d = roomDiff(r);
  const m = d.mouse;
  const p = mouseChance(r);
  if (!m || Math.random() >= p) return;
  const alive = [...r.players.values()].filter((x) => x.alive);
  if (!alive.length) return;

  if (m.kind === 'gift') {
    /* 宝宝版：叼来一件东西，随便塞给谁（手牌满了就放地上） */
    const who = alive[Math.floor(Math.random() * alive.length)];
    const card = makeRandomThing(r);
    if (!card) return;
    r.cards.set(card.id, card);
    const limit = Number(who.handLimit) || 99;
    if ((who.hand || []).length < limit) {
      who.hand.push(card.id);
      card.zone = 'hand';
      addLog(r, '夜里，一只' + MOUSE_NAME + '从洞口探出头，把一张「' + (card.name || '东西') + '」推到 ' + PN(who) + ' 手边，又跑了', 'green');
    } else {
      if (!Array.isArray(r.ground)) r.ground = [];
      r.ground.push(card.id);
      addLog(r, '夜里，一只' + MOUSE_NAME + '叼来一张「' + (card.name || '东西') + '」，' + PN(who) + ' 手里已经放不下，它就丢在了营地中间', 'green');
    }
    return;
  }

  /* 偷东西：先决定偷哪里（v220：手牌 / 箱子 / 公共建筑 三者等权重） */
  const chest = r.common && r.common.chest;
  const chestCards = (chest && chest.built && Array.isArray(chest.slots))
    ? chest.slots.filter((sl) => sl && sl.id && r.cards.get(sl.id)) : [];
  const builtCommon = ['shelter', 'chest', 'boat', 'furnace'].filter((k) => r.common && r.common[k] && r.common[k].built);
  if (m.bold && builtCommon.length) builtCommon.push('pot');
  const hasHand = alive.some((p) => (p.hand || []).length);

  const pool = mousePool(hasHand, chestCards.length, builtCommon);
  if (!pool.length) return;
  const where = pickW(pool).k;

  if (where === 'hand') {
    const withCards = alive.filter((p) => (p.hand || []).length);
    const who = withCards[Math.floor(Math.random() * withCards.length)];
    const id = who.hand[Math.floor(Math.random() * who.hand.length)];
    const c = r.cards.get(id);
    const nm = (c && c.name) || '东西';
    purgeCard(r, id);
    addLog(r, '一只' + MOUSE_NAME + '从缝里钻进来，叼走了 ' + PN(who) + ' 的「' + nm + '」，只留下一串爪印', 'red');
    return;
  }

  if (where === 'chest') {
    const sl = chestCards[Math.floor(Math.random() * chestCards.length)];
    const c = r.cards.get(sl.id);
    const nm = (c && c.name) || '东西';
    purgeCard(r, sl.id);
    addLog(r, '一只' + MOUSE_NAME + '钻进了箱子，把「' + nm + '」拖走了', 'red');
    return;
  }

  /* 公共建筑被啃坏 */
  const key = builtCommon[Math.floor(Math.random() * builtCommon.length)];
  const NAMES = { shelter: '草棚', chest: '箱子', boat: '船', furnace: '火炉', pot: '锅' };
  const nm2 = NAMES[key] || key;
  if (key === 'chest') {
    for (const sl of (r.common.chest.slots || [])) {
      if (sl && sl.id) {
        const c = r.cards.get(sl.id);
        if (c) { markShatter(r, c); }
        purgeCard(r, sl.id);
      }
    }
    r.common.chest.slots = [];
    r.common.chest.built = false;
    addLog(r, '夜里一阵窸窣，一只' + MOUSE_NAME + '把箱子啃散了，箱子里的东西散了一地（都没有了）', 'red');
    return;
  }
  if (key === 'pot') {
    r.common.pot = { built: true, food: null, broken: true };
    addLog(r, '一只' + MOUSE_NAME + '把锅啃漏了，锅不能用了', 'red');
    return;
  }
  if (key === 'boat') {
    const ship = (r.ships || [])[Math.floor(Math.random() * (r.ships || []).length)];
    if (ship) {
      r.ships = (r.ships || []).filter((x) => x !== ship);
      addLog(r, '一只' + MOUSE_NAME + '把船上的绳子啃断了，船被海带走了', 'red');
      return;
    }
  }
  r.common[key].built = false;
  addLog(r, '一只' + MOUSE_NAME + '把「' + nm2 + '」啃坏了，' + nm2 + '不能用了', 'red');
}

function nextDay(r) {
  if (r.ended) return;
  settleHunger(r);
  if (r.ended) return;
  moltenToIron(r);
  /* v186：食物放坏（渺茫版）+ 夜里的小老鼠（三个难度都有，行为不同） */
  try { rotFoods(r); } catch (e) { console.error('rotFoods', e); }
  try { nightMouse(r); } catch (e) { console.error('nightMouse', e); }
  try { clearGround(r); } catch (e) { console.error('clearGround', e); }
  r.day += 1;
  if (r.day > 21) { endGame(r, 'lose', '21 天到了，没能离开瓦格'); return; }
  /* v160：篝火建成的当晚仍然照常夜袭；只要能活到第二天白天，篝火直接判胜利 */
  if (r.common && r.common.bonfire && r.common.bonfire.built && r.bonfireWinDay && r.day >= r.bonfireWinDay) {
    const who = r.bonfireByName || '有人';
    endGame(r, 'win', who + ' 搭起了篝火，他们不会被无边际的黑暗吞没');
    return;
  }
  startDay(r);
}

/* 结束阶段时，把还没确认的东西还回本人手里，不要凭空消失 */
function cardBackTo(r, p, id) {
  if (!p || !id) return;
  if (!Array.isArray(p.hand)) p.hand = [];
  if (!p.hand.includes(id)) p.hand.push(id);
  const c = (r && r.cards) ? r.cards.get(id) : null;
  if (c) c.zone = 'hand';
}
function returnUnconfirmed(r, phase) {
  /* 交付：交易框里没成交的牌，各自退回本人手里 */
  if (r.trade && r.trade.pairs) {
    for (const pr of Object.values(r.trade.pairs)) {
      if (!pr || pr.done) continue;
      const A = r.players.get(pr.a), B = r.players.get(pr.b);
      for (const id of pr.cardsA || []) cardBackTo(r, A, id);
      for (const id of pr.cardsB || []) cardBackTo(r, B, id);
      pr.cardsA = []; pr.cardsB = []; pr.okA = false; pr.okB = false;
    }
  }
  /* 建造 / 烹饪：图纸上塞的材料、锅里的食材 */
  for (const p of r.players.values()) {
    if (!Array.isArray(p.hand)) continue;
    if (Array.isArray(p.tradeBox) && p.tradeBox.length) p.tradeBox = [];
    for (const id of p.hand.slice()) {
      const c = r.cards.get(id);
      if (!c || !c.deliv) continue;
      /* 交付给图纸的材料是永久的，不再退回 */
      continue;
      // eslint-disable-next-line no-unreachable
      for (const k of Object.keys(c.deliv)) {
        const n = Number(c.deliv[k] || 0);
        if (!n) continue;
        const meta = MATS.find((m) => m.key === k);
        for (let i = 0; i < n; i++) {
          const m = makeCard('material', { key: k, name: meta ? meta.name : k });
          r.cards.set(m.id, m);
          p.hand.push(m.id);
        }
        addLog(r, PN(p) + ' 塞进图纸的「' + (meta ? meta.name : k) + ' ×' + n + '」退回了手里');
      }
      c.deliv = {};
    }
    if (Array.isArray(p.mealBox) && p.mealBox.length) {
      for (const id of p.mealBox) cardBackTo(r, p, id);
      p.mealBox = [];
    }
    if (phase === 'cook') {
      /* v127：还没吃掉的牌不许凭空消失——生食回手牌，做好的菜回公共佳肴桌 */
      for (const it of (p.eatBox || [])) {
        if (!it) continue;
        if (it.raw && r.cards.has(it.id)) cardBackTo(r, p, it.id);
        else r.common.feasts.push({ id: it.id, cal: it.cal, owner: p.id, name: it.name, key: it.key, dish: it.dish });
      }
      p.eatBox = [];
      p.serveOk = false;
      p.cookOk = false;
    }
  }
  if (phase === 'trade' && r.trade) r.trade = null;
}

/* 单人模式没有「交付」阶段 */
function phaseList(r) {
  return ((roomMode(r) || {}).need === 1) ? PHASES.filter((x) => x !== 'trade') : PHASES;
}

function advancePhase(r) {
  clearSearchAuto(r);
  /* v234：萨图的临时交付收摊 —— 他跟着萨图走，然后回到原来的阶段 */
  if (r.satu && r.satu.stage === 'trade' && r.phase === 'trade') {
    const from = r.satu.fromPhase || 'search';
    returnUnconfirmed(r, r.phase);
    r.trade = null;
    satuDepart(r);
    r.phase = from;
    if (from === 'search') armSearchAuto(r);
    addLog(r, '临时交付结束，回到' + (PHASE_NAME[from] || from) + '阶段');
    broadcastAll(r);
    return;
  }
  const list = phaseList(r);
  const i = list.indexOf(r.phase);
  if (i < 0) return;
  const next = list[i + 1];
  if (!next) return;
  returnUnconfirmed(r, r.phase);
  if (r.phase === 'search' && r.pendingFight && r.pendingFight.length) {
    const mons = r.pendingFight;
    r.pendingFight = null;
    startFight(r, mons, next);
    return;
  }
  if (r.phase === 'search') {
    const alive = [...r.players.values()].filter((x) => x.alive);
    if (alive.some((p) => overHand(r, p) > 0)) {
      for (const p of alive) p.discardDone = overHand(r, p) <= 0;
      r.phase = 'discard';
      r.nextPhase = next;
      addLog(r, '搜索阶段结束：手牌超过上限的人弃到上限，然后点「弃牌结束」');
      return;
    }
  }
  if (r.phase === 'build' && next === 'cook') {
    /* v138：学者的炼药锅在建造阶段一开始就架好了；他没确认之前，谁点「结束建造」都先等一下 */
    const sch = scholarOf(r);
    if (sch && !sch.researchDone) return;
    if (r.research && r.research.stage === 'result') r.research = null;
    /* v195/v213：医生 / 农夫 / 厨师 / 疯科 同时开工，都没收完结果就不能结束建造 */
    const jsNow = jobsList(r);
    if (jsNow.length) {
      if (jsNow.some((j) => j.stage !== 'result')) { openNextJob(r); return; }
      jsNow.forEach((j) => { const pl = r.players.get(j.pid); if (pl) pl.craftDone = true; });
      r.jobs = {};
    }
    if (craftPending(r).length) { openNextJob(r); return; }
  }
  /* v133：手牌上限只在「搜索阶段结束」检查一次；交付 / 建造 / 烹饪阶段允许超上限 */
  if (r.phase === 'search' || r.phase === 'trade' || r.phase === 'build' || r.phase === 'cook') {
    r.nextPhase = next;
    if (rollMonster(r, r.phase)) return;
    /* 搜索阶段真正结束时，才按难度概率抽「疲劳」 */
    if (r.phase === 'search' && next !== 'search') rollFatigue(r);
  }
  if (next === 'trade') initTrade(r);
  if (next === 'build') {
    /* v138：建造阶段一开始，学者格莱尔特直接架起炼药锅；他确认之前别人不能动牌 */
    const schB = scholarOf(r);
    if (schB && schB.alive && !schB.researchDone) {
      r.research = { pid: schB.id, name: PN(schB), stage: 'pick', out: null };
      addLog(r, '建造阶段开始：' + PN(schB) + ' 立刻架起炼药锅开始炼造，大家等他确认后再动手', 'gold');
    }
    openNextJob(r);
  }
  if (next === 'cook') { r.cook = { ok: {} }; r.cookStep = 'put'; r.potSlots = [[], []]; }
  if (next === 'night') {
    /* 吃完饭：缇西想好明天先找哪一类 */
    r.tixiAsk = null;
    for (const q of r.players.values()) {
      if (q.alive && q.charId === 'tixi' && !q.tixiPickTonight) r.tixiAsk = { pid: q.id, name: PN(q), done: false };
    }
    /* 没吃完的盛宴到天黑就坏了，清掉，避免下一天还能点到旧牌 */
    r.common.feasts = [];
    r.potDishes = [];
    for (const p of r.players.values()) { p.nightDone = false; p.nightMode = ''; }
    if (r.common.bonfire.built && r.bonfireNight) {
      r.bonfireNight = false;
      startFight(r, ['hound', 'hound', 'cat', 'bear'], 'night');
      return;
    }
  }
  if (next === 'build') furnaceSettleBuild(r);
  r.phase = next;
  addLog(r, '进入' + PHASE_NAME[next] + '阶段');
  broadcastAll(r);
}


/* 箱子：公共的，谁都能放谁都能拿 */
/* 箱子：4 格，每格最多叠 2 张同类；格 i 占 slots[2i]、slots[2i+1] */
function chestCell(ch, i) {
  ch.slots = ch.slots || [];
  return [ch.slots[i * 2], ch.slots[i * 2 + 1]].filter(Boolean);
}
function chestCompact(ch) {
  /* v134c：定长 8 位（4 格 × 2），空格留 null，绝不把后面的东西往前挤 */
  ch.slots = ch.slots || [];
  while (ch.slots.length < 8) ch.slots.push(null);
  ch.slots.length = 8;
}

/* ---------------- v134 箱子分格归属 ---------------- */
const CHEST_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'black'];
const CHEST_COLOR_CN = { red: '红', orange: '橙', yellow: '黄', green: '绿', blue: '蓝', purple: '紫', white: '白', black: '黑' };
function chestColorOf(p) {
  if (!p) return '';
  if (p.color) p.chestColor = p.color;
  if (!p.chestColor) p.chestColor = CHEST_COLORS[Math.floor(Math.random() * CHEST_COLORS.length)];
  return p.chestColor;
}

/* v135：每个玩家的颜色开局就定好（八色随机、互不重复）。凡是标注这个人的地方（座位、交付框、箱子格、名字）都用它。 */
function assignPlayerColors(r) {
  const list = [...r.players.values()];
  const used = {};
  list.forEach((p) => { if (p.color) used[p.color] = 1; });
  const pool = CHEST_COLORS.filter((c) => !used[c]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  list.forEach((p) => {
    if (p.color) return;
    p.color = pool.length ? pool.shift() : CHEST_COLORS[Math.floor(Math.random() * CHEST_COLORS.length)];
  });
  return used;
}
function assignChestColors(r) {
  const used = {};
  const list = [...r.players.values()];
  assignPlayerColors(r);
  list.forEach((p) => { if (p.color) p.chestColor = p.color; if (p.chestColor) used[p.chestColor] = 1; });
  const pool = CHEST_COLORS.filter((c) => !used[c]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  list.forEach((p) => { if (!p.chestColor && pool.length) p.chestColor = pool.shift(); });
  return used;
}
/* v158：田字 4 格位置永久固定。左列（0 上 / 2 下）= 箱子主人，右列上格 1、下格 3 = 另外两人。
   归属在箱子造好（或第一次用到）时就写进 ch.ownerMap，之后不再随谁在线、谁进出而重排。 */
function chestOwners(r) {
  const ch = (r.common && r.common.chest) || {};
  const alive = [...r.players.values()].filter(Boolean).sort((a, b) => (Number(a.seat) || 0) - (Number(b.seat) || 0));
  const compute = () => {
    const builder = ch.owner ? r.players.get(ch.owner) : null;
    const first = builder || alive[0] || null;
    const others = alive.filter((x) => !first || x.id !== first.id);
    const m = [null, null, null, null];
    if (first) { m[0] = first.id; m[2] = first.id; }
    if (others[0]) m[1] = others[0].id; else if (first) m[1] = first.id;
    if (others[1]) m[3] = others[1].id; else if (others[0]) m[3] = others[0].id; else if (first) m[3] = first.id;
    return m;
  };
  /* 箱子还没造出来：只是预览，不写死 */
  if (!ch.built) return compute();
  /* 造好之后才定格；只有「后来才进房、还没有自己格子的人」会触发补一次 */
  let need = !Array.isArray(ch.ownerMap) || ch.ownerMap.length !== 4;
  if (!need) {
    const have = {};
    ch.ownerMap.forEach((id) => { if (id) have[id] = 1; });
    if (alive.some((x) => !have[x.id])) need = true;
  }
  if (need) ch.ownerMap = compute();
  /* 主人已经离开这个房间：那一格变成无主（谁都能拿，东西不会卡死在箱子里） */
  return ch.ownerMap.map((pid) => (pid && r.players.get(pid) ? pid : null));
}
function chestOwnerName(r, pid) {
  if (!pid) return '—';
  const p = r.players.get(pid);
  return p ? p.name : '—';
}
function chestCellIndexOf(ch, cardId) {
  const idx = (ch.slots || []).indexOf(cardId);
  return idx < 0 ? -1 : Math.floor(idx / 2);
}
function chestPut(r, p, cardId, cellIdx) {
  const c = r.cards.get(cardId);
  if (!c) return "没有这张卡";
  if (!p.hand.includes(cardId)) return "卡不在你手里";
  const ch = r.common.chest;
  if (!ch.built) return "箱子还没造出来";
  ch.slots = ch.slots || [];
  chestCompact(ch);
  const owners = chestOwners(r);
  const mine = [0, 1, 2, 3].filter((i) => owners[i] === p.id);
  if (!mine.length) return '箱子里没有你的格子';
  let putAt = -1;
  const tryCell = (i) => {
    if (mine.indexOf(i) < 0) return false;
    const cell = chestCell(ch, i);
    if (cell.length === 0) { putAt = i * 2; return true; }
    if (cell.length < 2) {
      const oc = r.cards.get(cell[0]);
      if (oc && oc.key === c.key) { putAt = i * 2 + cell.length; return true; }
    }
    return false;
  };
  const want = (cellIdx === undefined || cellIdx === null || cellIdx === '') ? NaN : Number(cellIdx);
  if (Number.isFinite(want)) {
    if (mine.indexOf(want) < 0) return '这是「' + chestOwnerName(r, owners[want]) + '」的格子，你只能动自己的';
    if (!tryCell(want)) {
      const cell = chestCell(ch, want);
      if (cell.length >= 2) return '这一格已经放满 2 张了';
      const oc = r.cards.get(cell[0]);
      return '这一格只能放同一种东西（现在放的是「' + ((oc && oc.name) || '别的东西') + '」）';
    }
  } else {
    for (const i of mine) { if (putAt >= 0) break; tryCell(i); }
  }
  if (putAt < 0) return '你那边（' + mine.length + ' 格）已经放满了';
  p.hand.splice(p.hand.indexOf(cardId), 1);
  while (ch.slots.length < putAt) ch.slots.push(null);
  ch.slots[putAt] = cardId;
  chestCompact(ch);
  addLog(r, PN(p) + ' 把 ' + c.name + ' 放进了自己的箱子格');
  return null;
}
function chestTake(r, p, cardId) {
  const ch = r.common.chest;
  if (!ch.built) return "箱子还没造出来";
  const i = (ch.slots || []).indexOf(cardId);
  if (i < 0) return "箱子里没有这张";
  const owners = chestOwners(r);
  const cellI = Math.floor(i / 2);
  const own = owners[cellI];
  const op2 = own ? r.players.get(own) : null;
  if (own !== p.id && op2 && op2.alive) {
    return '这是「' + op2.name + '」的格子，只有' + op2.name + '自己能拿';
  }
  /* v133：手牌不设上限，箱子里的东西随时能拿 */
  const c = r.cards.get(cardId);
  ch.slots[i] = null;
  chestCompact(ch);
  p.hand.push(cardId);
  addLog(r, PN(p) + " 从箱子里拿出了 " + (c ? c.name : "一张牌") + (own !== p.id ? ('（' + chestOwnerName(r, own) + '倒下后留下的）') : ''));
  return null;
}

/* 早上用药品：目标可以是玩家或同伴 */
/* 鱼叉 / 斧头：搜索阶段点一下就有收获 */
function useTool(r, p, key) {
  if (!p.alive) return '你已经倒下';
  if (r.phase !== 'search') return '只能在搜索阶段使用';
  if (p.searchedToday) return '今天已经搜索过了';
  const tool = (p.equip || []).find((e) => e.key === key && (!e.maxDur || e.dur > 0));
  if (!tool) return '你身上没有这个工具';
  const gotList = key === 'harpoon'
    ? [makeCard('food', { key: 'fish', name: '鱼', cal: 2 })]
    : [makeCard('material', { key: 'wood', name: '木头' })];
  let extraName = '';
  if (key === 'axe' && Math.random() < 0.5) {
    /* v152：斧头 50% 概率额外带回一个别的材料（不会是木头） */
    const pool = MATS.filter((m) => m.key !== 'wood');
    const m = pool[Math.floor(Math.random() * pool.length)];
    if (m) {
      const extra = makeCard('material', { key: m.key, name: m.name });
      gotList.push(extra);
      extraName = m.name;
    }
  }
  for (const got of gotList) {
    r.cards.set(got.id, got);
    p.hand.push(got.id);
  }
  p.satSpent = (p.satSpent || 0) + foodCost(r, p);
  p.searchedToday = true;
  if (key === 'harpoon') {
    addLog(r, PN(p) + ' 用鱼叉叉到一条鱼', 'gold');
  } else {
    addLog(r, PN(p) + ' 用斧头砍到一块木头' + (extraName ? '，还顺手捡到一个「' + extraName + '」' : ''), 'gold');
  }
  emitTo(p.id, 'island:sfx', { t: 'search', items: gotList.map((c) => ({ kind: c.kind, key: c.key })) });
  if (tool.maxDur) wearItem(r, p, tool, key === 'axe' ? '斧头' : '鱼叉');
  broadcastAll(r);
  return null;
}

/* 药：只能在白天刚起床（当天还没搜索）时用 */
function useMedicineOp(r, p, key, cardId, targetId) {
  if (!p.alive) return '你已经倒下了';
  if (r.phase !== 'search' && r.phase !== 'dawn') return '药只能在白天刚起床的时候用';
  if (p.searchedToday) return '今天已经出门搜索过了，药要刚起床时用';
  const want = key || '';
  let idx = -1;
  if (cardId && p.hand.indexOf(cardId) >= 0) idx = p.hand.indexOf(cardId);
  if (idx < 0) idx = p.hand.findIndex((id) => { const c = r.cards.get(id); return c && c.kind === 'item' && (!want || c.key === want) && (c.key === 'heal' || c.key === 'clean'); });
  if (idx < 0) return '手里没有这种药';
  const c = r.cards.get(p.hand[idx]);
  if (c.key === 'heal') {
    let tgt = p;
    if (targetId) tgt = r.players.get(targetId) || (r.npcs || []).find((n) => n.key === targetId || n.id === targetId) || p;
    if (!tgt || !tgt.alive) return '找不到这个人';
    if (tgt.hp >= (tgt.maxHp || MAX_HP)) return '他是满血的，不用吃药';
    tgt.hp = Math.min(tgt.maxHp || MAX_HP, tgt.hp + 1);
    addLog(r, PN(p) + ' 给 ' + (tgt.id === p.id ? '自己' : tgt.name) + ' 用了回血药物，生命 +1（' + tgt.hp + '/' + (tgt.maxHp || MAX_HP) + '）', 'gold');
  } else if (c.key === 'clean') {
    let tgt = p;
    if (targetId) tgt = r.players.get(targetId) || (r.npcs || []).find((n) => n.key === targetId || n.id === targetId) || p;
    if (!tgt) return '找不到这个人';
    const order = ['worm', 'wound', 'venom', 'snake', 'ghost'];
    const hit = order.find((k) => Number(tgt[k] || 0) > 0);
    if (!hit) return '他身上没有负面效果';
    tgt[hit] = 0;
    if (tgt[hit + 'Max']) tgt[hit + 'Max'] = 0;
    addLog(r, PN(p) + ' 给 ' + (tgt.id === p.id ? '自己' : tgt.name) + ' 用了清创药物，消除了「' + BUFF_META[hit].name + '」', 'gold');
  }
  r.cards.delete(c.id);
  p.hand.splice(idx, 1);
  return null;
}

function useMedicine(r, p, cardId, targetId) {
  const c = r.cards.get(cardId);
  if (!c || c.kind !== "item") return "没有这张药";
  if (!p.hand.includes(cardId)) return "药不在你手里";
  if (c.key !== "heal") return "这张不能加血";
  let tgt = r.players.get(targetId);
  if (!tgt) tgt = (r.npcs || []).find((n) => n.key === targetId);
  if (!tgt) return "找不到这个对象";
  if (!tgt.alive) return "他已经倒下了";
  if (tgt.hp >= (tgt.maxHp || 5)) return "他是满血的";
  tgt.hp = Math.min(tgt.maxHp || 5, tgt.hp + 1);
  p.hand.splice(p.hand.indexOf(cardId), 1);
  r.cards.delete(cardId);
  addLog(r, PN(p) + " 给 " + tgt.name + " 用了 " + c.name);
  return null;
}

/* 早上批量用药：一次可以点好几个人（有几瓶就能选几个人） */
function useMedicineBatch(r, p, items) {
  if (!p.alive) return '你已经倒下了';
  if (r.phase !== 'search' && r.phase !== 'dawn') return '药只能在白天刚起床的时候用';
  if (p.searchedToday) return '今天已经出门搜索过了，药要刚起床时用';
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return '至少选一个人用药才确定';
  const cnt = {};
  (p.hand || []).forEach((id) => { const c = r.cards.get(id); if (c && c.kind === 'item' && (c.key === 'heal' || c.key === 'clean')) cnt[c.key] = (cnt[c.key] || 0) + 1; });
  const use = {};
  for (const it of list) {
    const key = String((it && it.key) || '');
    if (key !== 'heal' && key !== 'clean') return '没有这种药';
    use[key] = (use[key] || 0) + 1;
    if (use[key] > (cnt[key] || 0)) return '「' + (key === 'heal' ? '回血药物' : '清创药物') + '」不够用了';
  }
  for (const it of list) {
    const key = String(it.key || '');
    const tid = String(it.target || '');
    const tgt = r.players.get(tid) || (r.npcs || []).find((n) => n.id === tid || n.key === tid) || p;
    const e = useMedicineOp(r, p, key, null, tgt.id || tgt.key || p.id);
    if (e) return e;
  }
  return null;
}

/* 所有可以回血的对象（3 个玩家 + 3 个同伴） */
function healTargets(r) {
  const out = [...r.players.values()].map((p) => ({ id: p.id, name: PN(p), hp: p.hp, maxHp: p.maxHp, alive: p.alive, kind: "player" }));
  (r.npcs || []).forEach((n) => out.push({ id: n.key, name: n.name, hp: n.hp, maxHp: n.maxHp || 5, alive: n.alive, kind: "npc" }));
  return out;
}

/* ---------------- 视图 ---------------- */
function furnaceCardView(r, id) {
  const c = id ? r.cards.get(id) : null;
  return c ? { id: c.id, key: c.key, name: c.name, kind: c.kind } : null;
}

function cardView(r, id) {
  const c = r.cards.get(id);
  if (!c) return null;
  return { id: c.id, kind: c.kind, key: c.key, name: c.name, cal: c.cal, fresh: (c.kind === 'food' ? freshPct(c) : undefined), bp: c.bp, rec: (c.kind === 'blueprint' ? (RECIPES[c.bp] || null) : undefined), deliv: (c.kind === 'blueprint' ? (c.deliv || null) : undefined), mon: c.mon, npc: c.npc, instant: !!c.instant, tip: c.tip || '' };
}

/* 望远镜：任何人造出来全队都能看未来 5 天（最多到第 21 天） */
function telescopeState(r) {
  const holders = [...r.players.values()].filter((p) => p.alive && hasEquip(p, 'telescope'));
  const built = holders.length > 0;
  const days = [];
  if (built) {
    for (let k = 1; k <= 5; k++) {
      const day = r.day + k;
      if (day > 21) break;
      const w = WMAP[ensureWeather(r, day)] || WMAP.clear;
      const wv = weatherValues(r, w);
      days.push({ day: day, key: w.key, name: w.name, sp: wv.sp, food: wv.food, mon: (r.monsterDays || []).includes(day) });
    }
  }
  return { built: built, owner: holders.map((p) => PN(p)).join('、'), days: days };
}

function viewFor(r, me) {
  assignChestColors(r);
  /* v136：收拾手牌——垃圾固定排在最后，每人最多留 2 张 */
  for (const q of r.players.values()) tidyJunk(r, q);
  const today = todayWeather(r);
  const week = Math.ceil(r.day / 7);
  const start = (week - 1) * 7;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = start + i + 1;
    days.push({ day, w: day <= 21 && day <= r.day + 1 ? r.weather[day - 1] : null, passed: day < r.day, today: day === r.day, mon: day <= r.day + 1 && r.monsterDays.includes(day) });
  }
  /* v232：队伍里有人装备望远镜，全队都能看 5 天 */
  const telMine = !!(me && hasEquip(me, 'telescope'));
  const witchView = (r.witch && !r.witch.done)
    ? { pid: r.witch.pid, name: r.witch.name, mine: r.witch.pid === me.id }
    : null;
  const know = telMine ? 6 : 2;
  const forecast = [];
  for (let k = 0; k < know; k++) {
    const day = r.day + k;
    if (day > 21) break;
    const wv = WMAP[ensureWeather(r, day)] || WMAP.clear;
    forecast.push({ day, key: wv.key, name: wv.name });
  }
  return {
    code: r.code,
    nextCode: r.nextCode || null,
    satu: r.satu ? { name: r.satu.name, stage: r.satu.stage, backDay: r.satu.backDay || 0 } : null,
    witch: witchView,
    drawMul: (r.drawMul && r.drawMul.day === r.day) ? { mul: r.drawMul.mul, why: r.drawMul.why } : null,
    started: !!r.started,
    picking: !!r.picking,
    /* v164：四类产出音效一起广播（带时间戳的数组，避免不同 kind 同秒互相覆盖；客户端按 kind+at 去重） */
    sfx: (r.sfxEvents || []).filter((e) => e && (Date.now() - e.at) < 8000).map((e) => ({ kind: e.kind, at: e.at })),
    /* v171：饥饿掉血的时刻（客户端据此把这一下掉血换成「肚子打鸣」，不是雷声） */
    hungerAt: (r.hungerAt && (Date.now() - r.hungerAt) < 8000) ? r.hungerAt : 0,
    /* v186：昨晚碎掉的食物卡（客户端拿它放「裂开」动画） */
    shatter: (r.shatterEvents || []).filter((e) => e && (Date.now() - e.at) < 9000).map((e) => ({ id: e.id, name: e.name, at: e.at })),
    research: (r.research && r.phase === 'build') ? {
      pid: r.research.pid, name: r.research.name, stage: r.research.stage,
      out: r.research.out ? { name: r.research.out.name, kind: r.research.out.kind } : null
    } : null,
    myJob: (() => {
      const jb = (r.phase === 'build') ? jobOf(r, me) : null;
      if (!jb) return null;
      return {
        pid: jb.pid, name: jb.name, charId: jb.charId, role: jb.role,
        stage: jb.stage, need: jb.need, msg: jb.msg || '',
        out: jb.out ? { ok: !!jb.out.ok, mine: (jb.out.mine || []).map((g) => ({ name: g.name, fail: !!g.fail })), kind: jb.out.kind } : null
      };
    })(),
    jobs: (r.phase === 'build') ? jobsList(r).map((jb) => ({ pid: jb.pid, name: jb.name, role: jb.role, charId: jb.charId, stage: jb.stage })) : [],
    helpers: (r.helpers || []).map((h) => ({ id: h.id, key: h.key, name: h.name, hp: h.hp, maxHp: h.maxHp })),
    treehole: hasTreehole(r),
    cat: r.cat ? {
      follow: r.cat.follow,
      followName: (r.players.get(r.cat.follow) || {}).name || '',
      gift: r.cat.gift ? { fromName: r.cat.gift.fromName, name: r.cat.gift.card.name } : null
    } : null,
    wxAsk: (r.wxAsk && !r.wxAsk.done) ? { pid: r.wxAsk.pid, name: r.wxAsk.name } : null,
    wxDone: r.wxDone || null,
    tixiAsk: (r.tixiAsk && !r.tixiAsk.done) ? { pid: r.tixiAsk.pid, name: r.tixiAsk.name } : null,
    playerCount: r.players.size,
    mode: r.mode,
    modeName: roomMode(r).name,
    diff: roomDiff(r).key,
    diffName: roomDiff(r).name,
    diffTip: roomDiff(r).tip,
    diffs: DIFF_ORDER.map((k) => ({ key: k, name: DIFFS[k].name, tip: DIFFS[k].tip, locked: !!DIFFS[k].locked, active: roomDiff(r).key === k })),
    modeNeed: roomMode(r).need,
    chars: CHARS.map((c) => Object.assign({}, c, { d: charDelta(c) })),
    charId: (me && me.charId) || '',
    modeCfg: {
      maxHp: roomCfg(r).maxHp, maxSat: roomCfg(r).maxSat, handMax: roomCfg(r).handMax,
      startHp: roomCfg(r).startHp, startSat: roomCfg(r).startSat,
      spMul: roomMode(r).spMul || 1, spAdd: roomMode(r).spAdd || 0,
      foodMul: roomMode(r).foodMul || 1, foodAdd: roomMode(r).foodAdd || 0,
    },
    isHost: !!(me && r.hostId === me.id),
    day: r.day, week, days, forecast,
    phase: r.phase, phaseName: PHASE_NAME[r.phase] || r.phase,
    dawn: r.dawn ? { step: r.dawn.step, pid: r.dawn.pid, name: r.dawn.name, holders: r.dawn.holders || [] } : null,
    searchAutoAt: r.searchAutoAt || 0, searchAutoMs: SEARCH_AUTO_MS,
    island: (ISLANDS.find((x) => x.key === r.islandKey) || ISLANDS[0]).name,
    today: { key: today.key, name: today.name, sp: explorePoints(r), food: foodCost(r, me) },
    night: telMine ? (function () { const n = nightWeather(r); return { key: n.key, name: n.name, sp: n.sp, food: n.food }; })() : null,
    telescope: telescopeState(r),
    myPoints: me ? playerExplorePoints(r, me) : 0,
    myFoodCost: me ? foodCost(r, me) : 0,
    me: me ? playerView(r, me, me) : null,
    players: [...r.players.values()].map((p) => playerView(r, p, me)),
    trade: r.trade ? { pairs: Object.entries(r.trade.pairs).map(([key, pr]) => ({
      key, a: pr.a, b: pr.b, cardsA: pr.cardsA.map((id) => tradeCardView(r, id)).filter(Boolean),
      cardsB: pr.cardsB.map((id) => tradeCardView(r, id)).filter(Boolean), okA: pr.okA, okB: pr.okB, done: !!pr.done,
    })) } : null,
    isleOffer: (function () {
      const of = r.isleOffer;
      if (!of || of.done) return null;
      const ours = (ISLANDS.find((x) => x.key === r.islandKey) || ISLANDS[0]).name;
      return {
        id: of.id, fromName: of.fromName, myName: ours,
        need: (of.need || []).map((x) => ({ kind: x.kind, key: x.key, name: x.name, qty: x.qty })),
        give: (of.give || []).map((x) => ({ kind: x.kind, key: x.key, name: x.name, qty: x.qty })),
      };
    })(),
    myEquip: (me ? (me.equip || []).map((e) => ({ id: 'E' + e.id, kind: 'equip', key: e.key, name: e.name, dur: e.dur, maxDur: e.maxDur })) : []),
    cook: r.cook ? { ok: r.cook.ok } : null,
    cookStep: r.cookStep || 'put',
    buffs: buffsOf(me || {}),
    feed: (r.feed || []).slice(-6),
    fate: r.fate ? { id: r.fate.id, key: r.fate.key, name: r.fate.name, pid: r.fate.pid, pname: r.fate.pname || '', pcolor: r.fate.pcolor || '', gade: r.fate.key === 'gade', insight: (me && me.charId === 'psyc') ? fateInsight(r.fate, me) : '', mine: (r.fate.deciders || []).indexOf(me && me.id) >= 0, decided: !!(me && r.fate.done && r.fate.done[me.id]), left: (r.fate.deciders || []).filter((id) => !(r.fate.done || {})[id]).length, queued: Math.max(0, (r.fateQ || []).length - 1) } : null,
    island: r.island || '',
    bgPos: BGPOS[r.island] || { x: 50, y: 50, dim: 0 },
  fateResults: r.fateResults || null,
    loot: r.loot ? { name: r.loot.name, items: r.loot.items.map((id) => cardView(r, id)).filter(Boolean), ok: !!(me && me.lootOk) } : null,
    ground: (r.ground || []).map((id) => cardView(r, id)).filter(Boolean),
  feasts: r.common.feasts.map((f) => ({ id: f.id, name: f.name, cal: f.cal, owner: f.owner, key: f.key || '', dish: f.dish || '', rich: !!f.rich })),
    cookReadyAt: r.cookStep === 'cooking' ? (r.cookReadyAt || 0) : 0,
    potCount: 1 + (r.extraPots || 0),
    potFoods: (r.potSlots || []).map((list) => (list || []).filter((x) => r.cards.get(x.id)).map((x) => Object.assign(cardView(r, x.id) || {}, { _who: ((r.players.get(x.owner) || {}).name || ''), _owner: x.owner }))),
    potDishes: (r.potDishes || []).map((list) => (list || []).filter((d) => r.common.feasts.some((f) => f.id === d.id)).map((d) => ({ id: d.id, name: d.name, cal: d.cal, key: d.key || '', dish: d.dish || '' }))),
    takeDiscard: !!(me && me.alive && me.charId === 'sai' && r.phase === 'discard' && (me.hand || []).length < handLimit(me)),
    discardCards: (r.discard || []).slice(-24).map((id) => { const c = r.cards.get(id); return c ? { id, name: c.kind === 'blueprint' ? '图纸' : (c.name || '牌'), label: c.kind === 'blueprint' ? '图纸' : (c.name || '牌') } : null; }).filter(Boolean),
    common: {
      furnace: Object.assign({}, r.common.furnace, { topCard: furnaceCardView(r, r.common.furnace && r.common.furnace.topCard), outCard: furnaceCardView(r, r.common.furnace && r.common.furnace.outCard) }), bonfire: r.common.bonfire, shelter: r.common.shelter,
      chest: (function () {
        const ch = r.common.chest || {};
        const owners = chestOwners(r);
        const cells = [0, 1, 2, 3].map((i) => {
          const pid = owners[i] || '';
          const own = pid ? r.players.get(pid) : null;
          const color = own ? chestColorOf(own) : '';
          return {
            i: i, pid: pid, name: own ? own.name : '—',
            color: color, colorCn: CHEST_COLOR_CN[color] || '',
            mine: !!(own && me && own.id === me.id),
            alive: !!(own && own.alive),
            /* v158：别人还活着时，他的格子你看不到里面放了什么 */
            hidden: !!(own && own.alive && me && own.id !== me.id),
            count: chestCell(ch, i).length,
            items: (own && own.alive && me && own.id !== me.id) ? [] : chestCell(ch, i).map((id) => cardView(r, id)).filter(Boolean),
          };
        });
        return { built: !!ch.built, owner: ch.owner || '', ownerName: chestOwnerName(r, ch.owner), cells: cells, slots: ch.slots || [] };
      })(),
      boat: r.common.boat,
      ships: (r.ships || []).map((s) => ({ id: s.id, by: s.by, byName: s.byName, takenBy: s.takenBy || '' })),
    },
    chestItems: (function () {
      /* v158：只把「我能看到的格子」里的东西发出来 */
      const ch0 = r.common.chest || {};
      const owners0 = chestOwners(r);
      const out = [];
      for (let i = 0; i < 4; i++) {
        const pid = owners0[i];
        const own = pid ? r.players.get(pid) : null;
        const hide = !!(own && own.alive && me && own.id !== me.id);
        if (hide) continue;
        chestCell(ch0, i).forEach((id) => { const v = cardView(r, id); if (v) out.push(v); });
      }
      return out;
    })(),
    healTargets: healTargets(r),
    mealBuffs: r.mealBuffs || null,
    npcs: (r.npcs || []).filter((n) => n && (n.alive !== false || n.deadDay === r.day)).map((n) => (Object.assign({
      id: n.id || ('npc_' + (n.slot || 0)), eat: (n.eatBox || []).map((f) => ({ id: f.id, name: f.name, cal: f.cal, key: f.key || '', raw: !!f.raw })), slot: n.slot, key: n.key, name: n.name, seat: n.seat, side: n.side, alive: n.alive, hp: n.hp, maxHp: n.maxHp, sat: n.sat, maxSat: n.maxSat, want: n.want || null }))),
    fight: r.fight ? {
      monsters: r.fight.monsters.map((m) => ({ id: m.id, name: m.name, key: m.key, hp: m.hp, maxHp: m.maxHp, dmg: m.dmg })),
      acted: (r.fight.acted || []).slice(), settling: !!r.fight.settling, round: r.fight.round || 1,
      turn: r.fight.order[r.fight.turn] || null, round: r.fight.round,
      fx: (r.fight.fx || []).slice(-20),
    } : null,
    pendingFight: (r.pendingFight || []).map((k) => (MONSTERS[k] ? MONSTERS[k].name : '野怪')),
    coinFx: r.coinFx || null,
    log: r.log.slice(-14),
    allLog: r.log.map((x) => ({ day: x.day, at: x.at, msg: x.msg, tone: x.tone || '' })),
    ended: r.ended,
  };
}

/* 显示名：选了角色之后共用一个角色名 */
function PN(p) {
  return (CHAR_MAP[p.charId] || {}).name || p.name;
}

function playerView(r, p, me) {
  return {
    id: p.id, name: PN(p), seat: p.seat, color: p.color || '', colorCn: CHEST_COLOR_CN[p.color] || '',
    charId: p.charId || '',
    tixiPick: p.tixiPick || '',
    hendlerToday: !!p.hendlerToday,
    tixiPickTonight: !!p.tixiPickTonight, pickOk: !!p.pickOk, charName: (CHAR_MAP[p.charId] || {}).name || '',
    charDisp: (CHAR_MAP[p.charId] || {}).disp || (CHAR_MAP[p.charId] || {}).name || '',
    charTitle: (CHAR_MAP[p.charId] || {}).title || '',
    charSkill: (CHAR_MAP[p.charId] || {}).skill || '',
    hp: p.hp, maxHp: p.maxHp, sat: p.sat, maxSat: (p.satMax || MAX_SAT), buffs: buffsOf(p), satImmune: !!p.satImmune, matSleep: !!p.matSleep,
    hungerBuff: p.satBuff > 0, wound: p.wound, venom: p.venom, snake: p.snake,
    alive: p.alive, escaped: !!p.escaped, points: playerExplorePoints(r, p), cost: foodCost(r, p),
    searched: !!p.searchedToday, nightDone: !!p.nightDone, cookOk: !!p.cookOk,
    handCount: handCardCount(r, p), handLimit: handLimit(p), junkCount: junkCount(r, p), junkMax: 2, discardDone: !!p.discardDone,
    satSpent: p.satSpent || 0,
    hand: p.id === (me && me.id) ? (function () {
      const real = [], junk = [];
      for (const id of p.hand) (isJunkId(r, id) ? junk : real).push(id);
      return real.concat(junk).map((id) => cardView(r, id));
    })() : null,
    equip: p.equip.map((e) => ({ id: e.id, key: e.key, name: e.name, dur: e.dur, maxDur: e.maxDur })),
    nightMode: p.nightMode || '', tradeBox: p.tradeBox || [], mealBox: p.mealBox || [], meal: (p.mealBox || []).map((id) => cardView(r, id)).filter(Boolean),
    want: p.want || '',
    nightLoot: p.id === (me && me.id) ? (p.nightLoot || []).map((id) => cardView(r, id)).filter(Boolean) : null,
    nightBuildDone: (r.nightBuildDone || []).indexOf(p.id) >= 0,
    serveOk: !!p.serveOk, eat: (p.eatBox || []).map((f) => ({ id: f.id, name: f.name, cal: f.cal, key: f.key || '', raw: !!f.raw, dish: f.dish || '' })), eatGain: Number(p.eatGain || 0),
    makeupBuild: !!p.makeupBuild, makeupDone: !p.makeupBuild || !!p.makeupDone,
    isMe: !!(me && me.id === p.id),
    away: !!p.away, awayBack: p.away ? p.away.backDay : 0,
  };
}

/* ---------------- 挂载 ---------------- */
function broadcastAll(r) {
  try {
    if (!NSP) return;
    /* 重开一局后旧房间的定时器/收尾逻辑不能把旧状态盖回客户端 */
    if (ROOMS && ROOMS.get(r.code) && ROOMS.get(r.code) !== r) return;
    purgeInstantCards(r);
    for (const p of r.players.values()) {
      const sk = NSP.sockets.get(p.id);
      if (sk) sk.emit('island:state', viewFor(r, p));
    }
  } catch (e) {}
}

function attach(io) {
  const nsp = io.of('/island');
  NSP = nsp;
  const rooms = new Map();
  ROOMS = rooms;
  /* v156：心跳脉冲。房间安静（没人操作）时服务端本来不发任何消息，前端 25 秒收不到状态
     就以为卡死、自己断开重连，表现成「经常断线」。每 10 秒发一个轻量 pulse 即可。 */
  setInterval(() => {
    try { if (NSP) NSP.emit('island:pulse', { t: Date.now() }); } catch (_) {}
  }, 10000).unref();

  function broadcast(r) {
    if (rooms.get(r.code) !== r) return;
    for (const p of r.players.values()) {
      const s = nsp.sockets.get(p.id);
      if (s) s.emit('island:state', viewFor(r, p));
    }
  }
  function err(s, msg) { if (s) s.emit('island:err', msg); }

  nsp.on('connection', (s) => {
    s.on('island:join', (data) => {
      const intent = String((data && data.intent) || 'create');
      const code = String((data && data.code) || '').trim().toUpperCase().slice(0, 12);
      const name = String((data && data.name) || '玩家').trim().slice(0, 16) || '玩家';
      const dev = String((data && data.dev) || '').slice(0, 40);
      if (!code) return err(s, '请输入房间号');
      let r = rooms.get(code);
      if (!r && intent === 'join') { return err(s, '房间 ' + code + ' 不存在，可能是房号打错了，或者房间已经关了'); }
      /* v232：intent=auto —— 房间在就进，不在就由第一个点进来的人开房 */
      if (!r) {
        r = newIslandRoom({ code, diff: (data && data.diff) || 'easy' });
        rooms.set(code, r);
        r.hostId = s.id;
        startDay(r);
      }
      if (r.ended) return err(s, '这局已经结束了');
      const alive = [...r.players.values()];
      /* v232：先按设备认人（换了角色名也认得），认不出来再退回按名字 */
      const prev = (dev ? alive.find((p) => p.dev === dev) : null) || alive.find((p) => PN(p) === name);
      if (prev) {
        const oldId = prev.id;
        const wasHost = r.hostId === oldId;
        r.players.delete(oldId); r.order = r.order.filter((x) => x !== oldId);
        prev.id = s.id; if (dev) prev.dev = dev; r.players.set(s.id, prev);
        r.order.push(s.id);
        remapId(r, oldId, s.id);
        if (wasHost) r.hostId = s.id;
      } else {
        if (alive.filter((p) => p.alive).length >= 3) return err(s, '这个房间已经三个人满了');
        if (alive.length >= 3) return err(s, '座位上已经有三个人了');
        const seat = [0, 1, 2].find((k) => !alive.some((p) => p.seat === k));
        if (seat === undefined) return err(s, '房间满了');
        newIslandPlayer(r, s.id, name, seat);
        const np0 = r.players.get(s.id);
        if (np0 && dev) np0.dev = dev;
        r.order.push(s.id);
        addLog(r, name + ' 登上了岛');
      }
      r.lastActive = Date.now();
      s.emit('island:joined', { code, seat: r.players.get(s.id).seat });
      broadcast(r);
    });

    s.on('island:drag', (d) => {
      const code = String((s.data && s.data.code) || '').toUpperCase();
      const r = rooms.get(code);
      if (!r || !d) return;
      const me = r.players.get(s.id);
      if (!me) return;
      s.to(r.code).emit('island:drag', {
        by: s.id, name: me.name,
        x: Number(d.x) || 0, y: Number(d.y) || 0,
        id: String(d.id || ''), name2: String(d.cardName || '')
      });
    });

    s.on('island:op', (op) => {
      const code = String((op && op.code) || '').toUpperCase();
      const r = rooms.get(code);
      if (!r) return err(s, '房间不存在');
      const p = r.players.get(s.id);
      if (!p) return err(s, '你不在这个房间');
      const t = op && op.type;
      let e = null;
      const dbgOp = String(t || '').indexOf('dev') === 0;
      /* 倒下的人也要能点「重新开局」：全灭结局时所有人都是倒下状态 */
      if (!p.alive && !dbgOp && t !== 'join' && t !== 'restart') return err(s, '你已经倒下了，只能看着');
      if (t === 'setmode') {
        const want = String(op.mode || 'trio');
        if (r.hostId !== s.id) e = '只有房主能选模式';
        else if (r.started) e = '已经开局了，不能再改模式';
        else if (!MODES[want]) e = '没有这个模式';
        else if (r.players.size > MODES[want].need) e = MODES[want].name + '模式最多 ' + MODES[want].need + ' 人，现在已经有 ' + r.players.size + ' 人了';
        else {
          r.mode = want;
          applyModeStats(r);
          addLog(r, '模式：「' + MODES[want].name + '」（手牌上限 ' + MODES[want].handMax + '，生命 ' + MODES[want].startHp + '/' + MODES[want].maxHp + '，饱食 ' + MODES[want].startSat + '/' + MODES[want].maxSat + '）');
        }
      }
      if (t === 'pickchar') {
        const cid = String(op.char || '');
        const ch = CHAR_MAP[cid];
        if (r.started) e = '已经开局了，不能再换角色';
        else if (!r.picking) e = '等房主点「开始游戏」再选角色';
        else if (!ch) e = '没有这个角色';
        else if (ch.locked) e = '这个角色还不能选';
        else if ([...r.players.values()].some((x) => x.id !== p.id && x.charId === cid)) e = '「' + ch.name + '」已经被人选走了';
        else {
          /* 换角色：先把上一个角色留下的一切清干净，再按新角色重算面板 */
          resetCharState(p);
          p.charId = cid;
          p.pickOk = false;
          applyCharStats(p, roomCfg(r));
          addLog(r, '「' + ch.name + '」上岛了');
        }
      }
      if (t === 'beginpick') {
        if (r.hostId !== s.id) e = '只有房主能开始';
        else if (r.started) e = '已经开始了';
        else if (r.players.size < roomMode(r).need) e = '「' + roomMode(r).name + '」要 ' + roomMode(r).need + ' 人才能开始（现在 ' + r.players.size + ' 人）';
        else {
          [...r.players.values()].forEach((x) => { x.pickOk = false; });
          r.picking = true;
          addLog(r, '房主开始了，请选择你的角色');
        }
      }
      if (t === 'confirmpick') {
        if (r.started) e = '已经开始了';
        else if (!p.charId) e = '先选一个角色';
        else {
          p.pickOk = true;
          const ps = [...r.players.values()];
          const need = roomMode(r).need;
          if (ps.length >= need && ps.every((x) => x.charId && x.pickOk)) {
            applyModeStats(r);
            r.started = true;
            r.picking = false; /* v139：开局后退出选角色阶段（否则客户端的受击特效/音效会被当成选人阶段屏蔽） */
            r.phase = 'search';
            addLog(r, '全员确认，' + (roomMode(r).name || '') + '模式开局');
            startDay(r);
          }
        }
      }
      if (t === 'start') {
        if (r.hostId !== s.id) e = '只有房主能开始';
        else if (r.started) e = '已经开始了';
        else if (r.players.size < roomMode(r).need) e = '「' + roomMode(r).name + '」要 ' + roomMode(r).need + ' 人才能开始（现在 ' + r.players.size + ' 人）';
        else {
          const noPick = [...r.players.values()].find((x) => !x.charId);
          const noOk = [...r.players.values()].find((x) => !x.pickOk);
          if (noPick) e = noPick.name + ' 还没选角色';
          else if (noOk) e = noOk.name + ' 还没确认角色';
          else {
          applyModeStats(r);
          r.started = true;
          r.picking = false; /* v139：同上 */
          r.phase = 'search';
          addLog(r, PN(p) + ' 开始了这一局');
          startDay(r);
          }
        }
      } else if (t === 'search') e = doSearch(r, p);
      else if (t === 'advance') {
        if (r.phase === 'dawn') e = '清晨还没过完：先分药 / 等乌姆改天气，然后才开始搜索';
        if (!e && (r.fate || (Array.isArray(r.fateQ) && r.fateQ.length))) e = '有人仍然和命运人物正在对话，等他选完再说';
        if (!e && r.wxAsk && !r.wxAsk.done) e = (r.wxAsk.name || '老奶奶') + ' 还在看天气，等她选完再进下一阶段';
        if (!e && r.tixiAsk && !r.tixiAsk.done) e = '缇西还在想明天去哪儿，等她选完再进下一阶段';
        else if (r.phase === 'search' && !allSearched(r)) e = '还有队友没搜索';
        /* 交付阶段不再强制：不交易也能直接进下一阶段 */
        else if (r.phase === 'cook' && r.cookStep === 'serve' && [...r.players.values()].filter((x) => x.alive && x.serveOk).length < Math.min(2, [...r.players.values()].filter((x) => x.alive).length)) e = '还要等队友确认吃饭';
        else if (r.phase === 'cook' && r.cookStep !== 'serve' && [...r.players.values()].filter((x) => x.alive && x.cookOk).length < Math.min(2, [...r.players.values()].filter((x) => x.alive).length)) e = '还要等队友确认烹饪';
        else if (r.phase === 'night') e = '先选睡觉还是外出';
        else if (r.phase === 'nightbuild') e = '夜晚建造阶段：建完（或点跳过）才行';
        else if (p.makeupBuild && !p.makeupDone) e = '夜里外出回来，先把补的那次建造做完（或点「跳过建造」）';
        else {
          /* 进下一阶段需要至少两个人点（一1个人时就是1） */
          const aliveN = [...r.players.values()].filter((x) => x.alive).length;
          const need = Math.min(2, Math.max(1, aliveN));
          if (!r.adv || r.adv.phase !== r.phase) r.adv = { phase: r.phase, ids: [] };
          if (r.adv.ids.indexOf(p.id) < 0) r.adv.ids.push(p.id);
          if (r.adv.ids.length >= need) {
            r.adv = null;
            if (r.phase === 'search' && [...r.players.values()].some((x) => x.alive && x.charId === 'mengdi')) {
              for (const q of r.players.values()) {
                if (!q.alive) continue;
                const jc = makeCard('item', { key: 'junk', name: '垃圾' });
                r.cards.set(jc.id, jc);
                q.hand.push(jc.id);
              }
              addLog(r, '蒙迪肯特的乞讨：每个人手里多了一张「垃圾」', 'gold');
            }
            advancePhase(r);
          } else {
            addLog(r, PN(p) + ' 想进入下一阶段，还差 ' + (need - r.adv.ids.length) + ' 人点一下');
          }
        }
      }
      else if (t === 'wxpick') {
        if (!r.wxAsk || r.wxAsk.done) e = '现在不用选天气';
        else if (r.wxAsk.pid !== p.id) e = '这不是你的天气选择';
        else {
          const want = WMAP[String(op.key || '')];
          if (!want) e = '不认识的天气';
          else {
            r.wxAsk.done = true;
            /* v168：失败累积的判定与日志都在 umPickWeather 里，概率只活在服务端 */
            umPickWeather(r, p, want);
          }
          if (r.phase === 'dawn') dawnNext(r);
        }
      }
      else if (t === 'tixipick') {
        const cat = String(op.cat || '');
        if (p.charId !== 'tixi') e = '只有缇西能这么做';
        else if (CAT_CN[cat] == null) e = '请选择食物 / 材料 / 图纸';
        else {
          p.tixiPick = cat;
          p.tixiPickTonight = true;
          if (r.tixiAsk) r.tixiAsk.done = true;
          addLog(r, PN(p) + ' 睡前打定主意：明天先找「' + CAT_CN[cat] + '」', 'fate');
        }
      }
      else if (t === 'hendler') {
        /* v225：商人「做生意」（搜索阶段一个明确按钮）
           1/3 扣 2 点饱食、2/3 扣 1 点，饱食当场扣掉（晚上不再重复结算），一定换到两张牌 */
        if (p.charId !== 'hendler') e = '只有亨德勒能这么做';
        else if (r.phase !== 'search') e = '只能在搜索阶段做生意';
        else if (p.hendlerToday) e = '今天已经做过生意了';
        else if (!p.alive) e = '你已经倒下';
        else {
          const cost = Math.random() < (1 / 3) ? 2 : 1;
          p.hendlerToday = true;
          p.sat = (Number(p.sat) || 0) - cost;   /* 立刻扣，日终不再扣第二次 */
          for (let i = 0; i < 2; i++) {
            const c = drawCard(r);
            r.cards.set(c.id, c);
            if (settleInstantCard(r, p, c)) continue;
            p.hand.push(c.id);
          }
          r.coinFx = { at: Date.now(), pid: p.id, name: PN(p), cost: cost };
          addLog(r, PN(p) + ' 做起生意来：饱食 -' + cost + '（现在 ' + p.sat + '），换到两张牌', 'gold');
          /* 全桌都能看到金币抛起来 */
          for (const q of r.players.values()) {
            try { emitTo(q.id, 'island:sfx', { t: 'coin', name: PN(p), cost: cost }); } catch (er) {}
          }
        }
      }
      else if (t === 'tradeAdd') e = addToTrade(r, p, op.pair, op.card);
      else if (t === 'tradeTake') e = takeBackTrade(r, p, op.pair, op.card);
      else if (t === 'tradeOk') e = confirmTrade(r, p, op.pair);
      else if (t === 'isleDeal') e = isleDeal(r, p, op.cards);
      else if (t === 'isleRefuse') e = isleRefuse(r, p);
      else if (t === 'deliver') e = doDeliver(r, p, String(op.card || ''), String(op.bp || ''));
      else if (t === 'build') e = doBuild(r, p, op.card, op.use);
      else if (t === 'catfeed') e = feedCat(r, p, op.card);
      else if (t === 'catgift') e = giveCatGift(r, p, op.card);
      else if (t === 'skipsearch') {
        if (p.charId !== 'stud') e = '只有学生能跳过搜索';
        else if (r.phase !== 'search') e = '现在不是搜索阶段';
        else if (p.searchedToday) e = '今天已经搜索过了，鼓舞和搜索只能选一个';
        else {
          /* 只是自己跳过这一天的搜索，全队拿到鼓舞 */
          p.searchedToday = true;
          for (const q of r.players.values()) if (q.alive) q.inspire = 1;
          addLog(r, PN(p) + ' 喊了一声「大家加油！」，全体队友获得【鼓舞】（伤害 +1，直到明天清晨）', 'gold');
          broadcastAll(r);
        }
      }
      else if (t === 'research') e = doResearch(r, p, op.cards);
      else if (t === 'researchOk') {
        if (r.research && (r.research.stage === 'result' || r.research.stage === 'pick')) {
          const sch = r.players.get(r.research.pid);
          if (sch) sch.researchDone = true;
          r.research = null;
          broadcastAll(r);
        }
      }
      else if (t === 'jobpick') e = doJob(r, p, op.cards || []);
      else if (t === 'jobok') {
        const jbOk = jobOf(r, p);
        if (!jbOk) e = '现在没有你的事';
        else {
          if (jbOk.out && jbOk.out.kind === 'monster' && jbOk.mon) {
            const mon = jbOk.mon;
            delete r.jobs[p.id];
            p.craftDone = true;
            startFight(r, [mon], 'build');
            broadcastAll(r);
            return;
          }
          delete r.jobs[p.id];
          p.craftDone = true;
          openNextJob(r);
          broadcastAll(r);
        }
      }
      else if (t === 'jobskip') {
        const jbSkip = jobOf(r, p);
        if (!jbSkip) e = '现在没有你的事';
        else if (jbSkip.stage === 'making') e = '已经动手了，等它做完';
        else {
          const nm = jbSkip.name || PN(p);
          delete r.jobs[p.id];
          p.craftDone = true;
          addLog(r, nm + ' 这次不动手了，直接跳过', 'gold');
          openNextJob(r);
          broadcastAll(r);
        }
      }
      else if (t === 'saltRich') e = saltRich(r, p, op.feast || op.card);
      else if (t === 'saltFest') e = saltRich(r, p, op.card);
      else if (t === 'saltOnDish') e = saltRich(r, p, op.feast || op.card);
      else if (t === 'furnace') e = furnaceConvert(r, p, op.card);
      else if (t === 'makeupDone') {
        if (!p.makeupBuild || p.makeupDone) e = '现在不用补建造';
        else { p.makeupDone = true; p.makeupBuild = false; addLog(r, PN(p) + ' 补完了夜里外出欠下的那次建造'); }
      }
      else if (t === 'furnaceTake') e = furnaceTake(r, p);
      else if (t === 'cookPut') e = putCook(r, p, op.card, Number(op.pot));
      else if (t === 'cookOk') e = confirmCook(r, p);
      else if (t === 'eat') e = eatFeast(r, p, op.feast);
    else if (t === 'eatcard') e = eatInstantCard(r, p, op.id);
    else if (t === 'witch') e = witchAnswer(r, p, !!op.accept);
      else if (t === 'fate') e = fateAnswer(r, p, !!op.accept);
      else if (t === 'devserve') {
        /* 调试：直接进入用餐阶段（看就餐区排版） */
        r.phase = 'cook';
        r.cookStep = 'serve';
        r.potDishes = [[]];
        const aliveD = [...r.players.values()].filter((x) => x.alive);
        for (const x of aliveD) { x.mealBox = []; x.cookOk = false; x.eatBox = []; x.serveOk = false; }
        broadcastAll(r);
      }
      else if (t === 'devfeed') { pushFeed(r, 'monster', String(op.text || '玩家一 翻出了怪物卡【狗熊】'), String(op.tone || 'red')); }
      else if (t === 'devfate') { openFate(r, p, String(op.key || '')); }
      else if (t === 'devwitch') {
      const wk = op.pid ? r.players.get(String(op.pid)) : p;
      if (!wk) e = '没这个人';
      else {
        r.witch = { pid: wk.id, name: PN(wk), done: false, at: Date.now() };
        r.dawn = { step: 'witch', pid: wk.id, name: PN(wk), holders: [], at: Date.now() };
        r.phase = 'dawn';
        addLog(r, '（调试）老巫婆找上了 ' + PN(wk));
      }
    }
    else if (t === 'devbuff') { addBuff(r, p, String(op.key || 'ghost'), Number(op.days || 1), '（调试）'); }
      else if (t === 'serve') e = op.card ? serveCard(r, p, op.card, op.to) : serveFeast(r, p, op.feast, op.to);
      else if (t === 'serveOk') e = confirmServe(r, p);
      else if (t === 'serveTake') e = serveTake(r, p, String(op.box || ''), String(op.id || ''));
      else if (t === 'nightTake') e = takeNightLoot(r, p, op.ids);
      else if (t === 'nightNext') e = nightNext(r, p);
      else if (t === 'nightBuildDone') e = nightBuildFinish(r, p);
      else if (t === 'dawnNext') e = dawnNextBy(r, p);
      else if (t === 'medicineBatch') e = useMedicineBatch(r, p, op.items);
      else if (t === 'want') {
        const WANT_OK = { clean: 1, heal: 1, wood: 1, grass: 1, stone: 1, iron: 1 };
        const k = String(op.key || '');
        if (k && !WANT_OK[k]) e = '没有这个需求';
        else { p.want = k; }
      }
      else if (t === 'night') e = chooseNight(r, p, op.mode, op.mat, op.umb);
      else if (t === 'nightAsk') {
        /* 只有真决定出门才把天气抖出来 */
        const wn = nightWeather(r);
        s.emit('island:nightw', { key: wn.key, name: wn.name, sp: nightPoints(r, hasEquip(p, 'umbrella')), food: wn.food || 1, umb: hasEquip(p, 'umbrella') });
        e = null;
      }
      else if (t === 'discardTake') {
        e = doDiscardTake(r, p, op.card || op.id);
      }
      else if (t === 'discard') {
        if (op.to === 'pot') e = storeToPot(r, p, op.card);
        else if (op.to === 'furnace') e = storeToFurnace(r, p, op.card);
        else e = doDiscard(r, p, op.card);
      }
      else if (t === 'lootTake') e = lootTake(r, p, op.card);
      else if (t === 'lootOk') e = lootOk(r, p);
      else if (t === 'devloot') {
        const npc = (r.npcs || []).find((n) => n.alive !== false) || (r.npcs || [])[0];
        if (!npc) e = '岛上没有同伴';
        else { npc.alive = false; npc.deadDay = r.day; startLoot(r, npc); }
      }
      else if (t === 'discardDone') e = discardDone(r, p);
      else if (t === 'fight') e = fightAct(r, p, op.action, op.target);
      else if (t === 'devfight') { const mk = String(op.key || 'hound'); if (!MONSTERS[mk]) e = '没有这种怪'; else startFight(r, [mk], r.phase || 'build'); }
    else if (t === 'devmons') {
      const ks = String(op.key || 'ratking').split(',').map((x) => x.trim()).filter(Boolean);
      if (ks.some((x) => !MONSTERS[x])) e = '没有这种怪';
      else { const list = ks.slice(); if (op.summon !== false) applyMonsterSummons(r, list); startFight(r, list, r.phase || 'build'); }
    }
      else if (t === 'devphase') {
        /* 调试：强制跳到某个阶段，并清掉进行中的战斗 */
        r.fight = null; r.pendingFight = null;
        const to = String(op.phase || 'build');
        if (PHASES.indexOf(to) >= 0 || to === 'discard' || to === 'loot') {
          if (to === 'build') furnaceSettleBuild(r);
          r.phase = to;
          if (to === 'build') openNextJob(r);
          if (to === 'trade') { r.trade = null; initTrade(r); }
          if (to === 'cook') { r.cook = { ok: {} }; r.cookStep = 'put'; }
          addLog(r, '（调试）跳到' + (PHASE_NAME[to] || to) + '阶段');
        }
      }
      else if (t === 'devhendlerreset') {
        /* 调试：把「今天已经做过生意」清掉，供分布测试反复调用 */
        for (const q of r.players.values()) q.hendlerToday = false;
        addLog(r, '（调试）清掉今天做过生意');
      }
      else if (t === 'devday') {
        r.day = Math.max(1, Math.min(21, Number(op.day) || 1));
        addLog(r, '（调试）设为第 ' + r.day + ' 天');
        broadcastAll(r);
      }
      else if (t === 'devskip') { advancePhase(r); }
      else if (t === 'bgpos') {
        if (r.hostId === p.id) {
          const isl = String(op.isl || r.island || '');
          const nx = Math.max(0, Math.min(100, Math.round(Number(op.x))));
          const ny = Math.max(0, Math.min(100, Math.round(Number(op.y))));
          const nd = Math.max(-0.35, Math.min(0.42, Number(op.dim) || 0));
          BGPOS[isl] = { x: nx, y: ny, dim: Math.round(nd * 100) / 100 };
          saveBgPos();
          broadcastAll(r);
        }
      }
  else if (t === 'devheal') {
    /* 调试：给某个玩家/伯伯加血或饱食，用于验证“谁回谁跳” */
    const who = String(op.who || 'me');
    const n = Number(op.n == null ? 1 : op.n);
    const which = String(op.field || 'hp');
    const applyIt = (obj) => {
      if (!obj) return;
      if (which === 'sat') obj.sat = Math.max(0, Math.min(Number(obj.satMax || obj.maxSat || 5), Number(obj.sat || 0) + n));
      else obj.hp = Math.max(0, Math.min(Number(obj.maxHp || 5), Number(obj.hp || 0) + n));
    };
    if (who === 'me') applyIt(p);
    else if (who.indexOf('npc') === 0) {
      const slot = String(op.slot || who);
      const np = (r.npcs || []).find((x) => String(x.slot || '').replace(/^n/, 'npc') === slot || x.id === who);
      applyIt(np);
    } else {
      const other = r.players && r.players.get ? r.players.get(who) : null;
      applyIt(other);
    }
    broadcastAll(r);
  }
      else if (t === 'devdraw') {
        const n = Math.max(1, Math.min(20000, Number(op.n) || 1000));
        const cnt = {};
        for (let i = 0; i < n; i++) {
          const c = drawCard(r, p);
          const kk = c.kind + (c.kind === 'monster' ? ':' + (c.mon || '') : '');
          cnt[kk] = (cnt[kk] || 0) + 1;
        }
        e = null;
        r.devDraw = cnt;
        addLog(r, '抽了 ' + n + ' 张：' + JSON.stringify(cnt));
        broadcastAll(r);
      }
      else if (t === 'devmouse') { try { nightMouse(r); } catch (er) { e = '小老鼠出错：' + er.message; } }
      else if (t === 'devdiff') {
        if (DIFFS[op.diff]) { r.diff = op.diff; applyModeStats(r); addLog(r, '难度切到「' + DIFFS[op.diff].name + '」'); }
        else e = '没有这个难度';
      }
      else if (t === 'devmouserate') {
        /* v223：调试 —— 抽样老鼠出现率（op.cat = true 时临时给房间挂一只猫） */
        const n = Math.max(1, Math.min(20000, Number(op.n || 4000)));
        const hadCat = r.cat;
        if (op.cat) r.cat = r.cat || { arrived: true, born: Date.now(), follow: p.id, gift: null };
        const p0 = mouseChance(r);
        let hit = 0;
        for (let i = 0; i < n; i++) if (Math.random() < p0) hit++;
        if (!op.cat) r.cat = hadCat;
        addLog(r, '抽老鼠出现 ' + n + ' 次：' + JSON.stringify({ cat: !!op.cat, p: +p0.toFixed(4), pct: +(hit / n * 100).toFixed(2) }));
        broadcastAll(r);
      }
      else if (t === 'devnightmon') {
        /* v224：调试 —— 抽样夜间遭遇结果分布 */
        const n = Math.max(1, Math.min(20000, Number(op.n || 4000)));
        const hit = { escape: 0, hurt: 0, poison: 0, wound: 0 };
        for (let i = 0; i < n; i++) hit[nightMonRoll()]++;
        addLog(r, '抽夜间遭遇 ' + n + ' 次：' + JSON.stringify(hit));
        broadcastAll(r);
      }
      else if (t === 'devnightmonone') {
        /* v224：调试 —— 指定一种遭遇结果，真的作用在自己身上 */
        const k = nightMonsterEncounter(r, p, String(op.mon || 'hound'), String(op.key || ''));
        addLog(r, '调试：夜间遭遇结果 ' + k);
        broadcastAll(r);
      }
      else if (t === 'devground') {
        /* v221：调试 —— 往地上扔 N 张，用来验证「天亮清空」 */
        const n = Math.max(1, Math.min(12, Number(op.n || 2)));
        if (!Array.isArray(r.ground)) r.ground = [];
        for (let i = 0; i < n; i++) {
          const card = makeRandomThing(r) || makeCard('material', { key: 'wood', name: '木头' });
          r.cards.set(card.id, card);
          r.ground.push(card.id);
        }
        addLog(r, '调试：地上扔了 ' + n + ' 件东西');
        broadcastAll(r);
      }
      else if (t === 'devmouseroll') {
        /* v220：调试 —— 抽样「手牌/箱子/公共建筑」的目标命中分布 */
        const n = Math.max(1, Math.min(20000, Number(op.n || 1000)));
        const pool = mousePool(true, 2, ['shelter', 'chest', 'boat', 'furnace']);
        const hit = {};
        for (let i = 0; i < n; i++) { const k = pickW(pool).k; hit[k] = (hit[k] || 0) + 1; }
        addLog(r, '抽夜鼠目标 ' + n + ' 次：' + JSON.stringify(hit));
        broadcastAll(r);
      }
      else if (t === 'devIsle') {
        const N = Math.max(1, Math.min(20000, Number(op.n) || 1000));
        let foodMat = 0, bp = 0, odd = 0, smallGap = 0;
        const cntDist = { 1: 0, 2: 0, 3: 0 };
        for (let i = 0; i < N; i++) {
          const of = genIsleOffer(r);
          const all = of.need.concat(of.give);
          const nTot = of.need.reduce((a, x) => a + x.qty, 0);
          const gTot = of.give.reduce((a, x) => a + x.qty, 0);
          if (Math.abs(nTot - gTot) <= 1) smallGap++;
          const isOdd = all.some((x) => x.kind === 'npc' || x.key === 'bonfire' || x.key === 'boat');
          const isBp = all.some((x) => x.kind === 'blueprint');
          if (isOdd) odd++;
          else if (isBp) {
            bp++;
            const items = all.filter((x) => x.kind !== 'blueprint');
            const c = items.reduce((a2, x) => a2 + x.qty, 0);
            cntDist[c] = (cntDist[c] || 0) + 1;
          } else foodMat++;
        }
        addLog(r, '外岛抽样 ' + N + ' 次：' + JSON.stringify({ foodMat, bp, odd, smallGap, cntDist }));
      }
      else if (t === 'devIsleRate') {
        const N = Math.max(1, Math.min(20000, Number(op.n) || 2000));
        const keepTrade = r.trade, keepOffer = r.isleOffer, keepLog = r.log.length;
        let hit = 0;
        for (let i = 0; i < N; i++) { initTrade(r); if (r.isleOffer) hit++; }
        r.trade = keepTrade; r.isleOffer = keepOffer;
        if (r.log.length > keepLog) r.log.length = keepLog;
        addLog(r, '外岛出现率 ' + N + ' 次：' + JSON.stringify({ hit, rate: hit / N }));
      }
      else if (t === 'devIsleBp') {
        r.isleOffer = { id: uid('io'), fromName: '斯托夫岛', myName: isleIslandName(r.island),
          need: [isleEntry('blueprint', 'torch', 1)], give: [isleEntry('material', 'wood', 2)], day: r.day, done: false };
        addLog(r, '已放置测试用外岛交付（要火把图纸，给 2 木头）');
      }
      else if (t === 'devIsleEq') {
        r.isleOffer = { id: uid('io'), fromName: '埃森岛', myName: isleIslandName(r.island),
          need: [isleEntry('item', 'spear', 1)], give: [isleEntry('material', 'iron', 2)], day: r.day, done: false };
        addLog(r, '已放置测试用外岛交付（要长矛，给 2 铁）');
      }
      else if (t === 'devfarmerroll') {
      const n = Math.max(1, Math.min(20000, Number(op.n) || 2000));
      const cnt = { none: 0, carrot: 0, fish: 0, meat: 0 };
      for (let i = 0; i < n; i++) cnt[farmerRoll()] += 1;
      addLog(r, '抽农夫翻土 ' + n + ' 次：' + JSON.stringify(cnt));
    }
    else if (t === 'devwantroll') {
        /* v218：调试 —— 直接抽 N 次牧师需求，看类别/数量分布 */
        const n = Math.max(1, Math.min(20000, Number(op.n || 1000)));
        const kinds = {}, counts = {};
        for (let i = 0; i < n; i++) {
          const w = rollPriestWant();
          kinds[w.kind] = (kinds[w.kind] || 0) + 1;
          counts[w.count] = (counts[w.count] || 0) + 1;
        }
        r.devWant = { n, kinds, counts };
        addLog(r, '抽牧师需求 ' + n + ' 次：' + JSON.stringify(kinds) + ' / ' + JSON.stringify(counts));
        broadcastAll(r);
      }
      else if (t === 'devfatroll') {
        const n = Math.max(1, Math.min(20000, Number(op.n || 1000)));
        let hit = 0;
        for (let i = 0; i < n; i++) { p.fatigue = false; rollFatigue(r); if (p.fatigue) hit++; }
        p.fatigue = false;
        r.devFat = { diff: roomDiff(r), rate: fatigueRate(r), n, hit, pct: +(hit / n * 100).toFixed(3) };
        addLog(r, '抽疲劳 ' + n + ' 次：' + JSON.stringify(r.devFat));
        broadcastAll(r);
      }
      else if (t === 'devfatigue') { p.fatigue = op.on === false ? false : true; addLog(r, '调试：' + PN(p) + ' 疲劳 ' + (p.fatigue ? '已挂上' : '已解除')); }
      else if (t === 'devsatset') { p.sat = Math.max(0, Math.min(Number(p.satMax || 10), Number(op.sat || 0))); clearFatigueIfFull(r, p); }
      else if (t === 'devhunger') { if (op.sat != null) p.sat = Number(op.sat); applyHunger(r, p, Math.max(1, Number(op.n || 1))); }
      else if (t === 'devtelwear') {
        const tel = (p.equip || []).find((x) => x.key === 'telescope' && (!x.maxDur || x.dur > 0));
        if (!tel) e = '没有望远镜';
        else {
          const n = Math.max(1, Number(op.n || 10));
          const d0 = tel.dur;
          let drops = 0;
          let tries = 0;
          for (let i = 0; i < n; i++) {
            tries++;
            const before = tel.dur;
            if (!(p.equip || []).includes(tel)) break;
            wearItem(r, p, tel, '望远镜');
            if (tel.dur < before) drops++;
          }
          addLog(r, '调试：望远镜耐久抽样 ' + JSON.stringify({ from: d0, to: tel.dur, drops: drops, tries: tries, n: n }));
        }
      }
      else if (t === 'devend') { endGame(r, op.win === false ? 'lose' : 'win', String(op.why || '全员离岛')); broadcastAll(r); }
      else if (t === 'devstats') {
        const cnt = {};
        for (let i = 0; i < 3000; i++) { const c = drawCard(r); cnt[c.kind] = (cnt[c.kind] || 0) + 1; }
        emitTo(p.id, 'island:stats', { data: JSON.stringify({ kind: cnt }) });
      }
      else if (t === 'devhuman') {
        const seen = {};
        for (let i = 0; i < 40; i++) { const c = cardByKind('human', r); seen[c.key] = (seen[c.key] || 0) + 1; }
        emitTo(p.id, 'island:stats', { data: JSON.stringify({ human: seen, npcs: (r.npcs || []).map((n) => n.key) }) });
      }
      else if (t === 'devover') { const n = Math.max(1, Number(op.n || 2)); for (let i = 0; i < n; i++) { const cc = makeCard('material', { key: 'stone', name: '石头' }); r.cards.set(cc.id, cc); p.hand.push(cc.id); } addLog(r, '（调试）手牌塞到 ' + p.hand.length + ' 张'); }
      else if (t === 'devequip') {
        const ek = String(op.key || 'warhammer'); const erec = RECIPES[ek];
        if (!erec || erec.place !== 'equip') e = '不是装备';
        else { p.equip.push({ id: uid('e'), key: ek, name: erec.name, dur: erec.dur || 0, maxDur: erec.dur || 0 }); broadcastAll(r); }
      }
      else if (t === 'devbuild') { const bk = String(op.key || ''); if (r.common[bk]) { r.common[bk].built = true; r.common[bk].dur = r.common[bk].dur || 3; r.common[bk].builtAt = Date.now() + (Number(op.seq || 0)); if (bk === 'chest' && !r.common.chest.owner) r.common.chest.owner = p.id; broadcastAll(r); } }
      else if (t === 'devgive') {
        /* 调试：发一张图纸 / 材料 / 食物到手牌 */
        const kind = op.kind || 'blueprint';
        const k = String(op.key || '');
        let c = null;
        if (kind === 'blueprint') {
          const b = BLUEPRINTS.find((x) => x.key === k);
          if (b) { c = makeCard('blueprint', { key: b.key, name: b.name, bp: b.key }); markBpSeen(r, b.key); }
        } else if (kind === 'material') {
          const m = MATS.find((x) => x.key === k);
          if (m) c = makeCard('material', { key: m.key, name: m.name });
        } else if (kind === 'food') {
          const f = FOODS.find((x) => x.key === k);
          if (f) c = makeCard('food', { key: f.key, name: f.name, cal: f.cal, instant: !!f.instant, tip: f.tip || '' });
        } else if (kind === 'equip') {
          const b = BLUEPRINTS.find((x) => x.key === k);
          const rec = b ? RECIPES[b.key] : null;
          if (b && rec && rec.place === 'equip') {
            p.equip.push({ id: uid('e'), key: b.key, name: b.name, dur: rec.dur || 0, maxDur: rec.dur || 0 });
            e = false;
          }
        } else if (kind === 'item') {
          const b = BLUEPRINTS.find((x) => x.key === k);
          if (b) c = makeCard('item', { key: b.key, name: b.name });
          else if (k === 'heal' || k === 'clean' || k === 'junk') {
            c = makeCard('item', { key: k, name: k === 'heal' ? '回血药物' : (k === 'clean' ? '清创药物' : '垃圾') });
          }
        }
        if (c) {
          r.cards.set(c.id, c);
          /* v133：手牌不设上限 */
          p.hand.push(c.id);
        } else if (e !== false) e = '未知的调试卡：' + kind + ':' + k;
      }
      else if (t === 'equipItem') e = equipFromHand(r, p, String(op.card || ''));
      else if (t === 'devday') {
        r.day = Math.max(1, Math.min(21, Number(op.day) || 1));
        r.week = Math.ceil(r.day / 7);
        scheduleWeek(r);
        addLog(r, '（调试）跳到第 ' + r.day + ' 天');
        broadcastAll(r);
      }
      else if (t === 'devweight') {
        const w = blueprintWeights(r).map((x) => ({ key: x.key, w: x.w }));
        const tot = w.reduce((acc, x) => acc + x.w, 0);
        const sp = w.find((x) => x.key === 'spear');
        const sh = w.find((x) => x.key === 'shield');
        const bt = w.find((x) => x.key === 'boat');
        emitTo(p.id, 'island:stats', { data: JSON.stringify({ day: r.day, seen: r.bpSeen || {}, total: tot, spear: sp && sp.w, shield: sh && sh.w, boat: bt && bt.w, spearPct: sp ? sp.w / tot : 0, shieldPct: sh ? sh.w / tot : 0, boatPct: bt ? bt.w / tot : 0 }) });
      }
      else if (t === 'devbpstat') {
        const n = Math.max(100, Math.min(200000, Number(op.n) || 20000));
        const cnt = {};
        for (let i = 0; i < n; i++) { const b = pickW(blueprintWeights(r, { ignoreHistory: true })); cnt[b.key] = (cnt[b.key] || 0) + 1; }
        emitTo(p.id, 'island:stats', { data: JSON.stringify({ day: r.day, n: n, spearPct: (cnt.spear || 0) / n, shieldPct: (cnt.shield || 0) / n, boatPct: (cnt.boat || 0) / n }) });
      }
      else if (t === 'devfoodstat') {
        const n = Math.max(100, Math.min(200000, Number(op.n) || 20000));
        const cnt = {};
        let tip = '';
        for (let i = 0; i < n; i++) {
          const c = cardByKind('food', r, p);
          cnt[c.key] = (cnt[c.key] || 0) + 1;
          if (c.tip) tip = c.tip;
        }
        emitTo(p.id, 'island:stats', { data: JSON.stringify({ n: n, cnt: cnt, carrotPct: (cnt.carrot || 0) / n, fishPct: (cnt.fish || 0) / n, meatPct: (cnt.meat || 0) / n, berryPct: (cnt.berry || 0) / n, saltPct: (cnt.salt || 0) / n, berryTip: tip }) });
      }
      else if (t === 'devweeks') {
        const n = Math.max(100, Math.min(20000, Number(op.n) || 2000));
        const out = {};
        for (const wk of [1, 2, 3]) {
          let one = 0;
          for (let i = 0; i < n; i++) if (monsterDayCount(wk) === 1) one++;
          out['w' + wk] = one / n;
        }
        emitTo(p.id, 'island:stats', { data: JSON.stringify({ n: n, oneDayRate: out }) });
      }
      else if (t === 'devdropstat') {
        const n = Math.max(100, Math.min(100000, Number(op.n) || 10000));
        const out = {};
        for (const mk of ['ox', 'cat', 'snake', 'hound', 'bear', 'rat']) {
          let drops = 0, cards = 0;
          for (let i = 0; i < n; i++) { const l = monsterDrops(mk, Math.random()); if (l.length) drops++; cards += l.length; }
          out[mk] = { dropRate: drops / n, avgCards: cards / n };
        }
        emitTo(p.id, 'island:stats', { data: JSON.stringify({ n: n, monsters: out }) });
      }
      else if (t === 'devpaw') {
        const pc = makeCard('equip', { key: 'bearpaw', name: '熊掌' });
        r.cards.set(pc.id, pc);
        p.hand.push(pc.id);
        addLog(r, '（调试）拿到一张熊掌');
      }
      else if (t === 'devnight') { r.nightW = String(op.key || 'clear'); e = null; }
      else if (t === 'devwx') { const wk = String(op.key || 'storm'); if (!WMAP[wk]) e = '没有这种天气'; else { r.weather[r.day - 1] = wk; broadcastAll(r); e = null; } }
      else if (t === 'chestPut') e = chestPut(r, p, String(op.card || ''), op.cell);
      else if (t === 'chestTake') e = chestTake(r, p, String(op.card || ''));
      else if (t === 'devspawnnpc') { spawnNpcFromCard(r, p, String(op.key || 'priest')); }
      else if (t === 'devnpc') {
        const k = String(op.key || 'priest');
        if (!(r.npcs || []).some((n) => n.key === k)) {
          r.npcs.push({ id: 'npc_' + (r.npcSeq = (r.npcSeq || 0) + 1), key: k, name: { priest: '牧师', warrior: '战士', child: '小女孩' }[k] || k, slot: npcSlot(r), seat: 1, pid: p.id, alive: true, hp: npcStat(r, k).hp, maxHp: npcStat(r, k).hp, sat: npcStat(r, k).satMax, maxSat: npcStat(r, k).satMax, atk: 3, want: k === 'priest' ? rollPriestWant() : null });
        }
      }
      else if (t === 'devfate') { openFate(r, p, String(op.key || '')); }
      else if (t === 'devwant') {
        const pr = (r.npcs || []).find((n) => n.key === 'priest');
        if (pr) {
          const w = op.key
            ? (() => { const it = priestWantPool().filter((x) => x.key === String(op.key))[0]; return { kind: it.kind, key: it.key, name: it.name, count: wantCount(it), done: 0, by: [] }; })()
            : rollPriestWant();
          pr.want = w;
          addLog(r, '牧师今天需要「' + w.name + ' ×' + w.count + '」（交齐给他就能回血）');
        }
      }
      else if (t === 'giveNpc') e = giveNpc(r, p, String(op.card || ''));
      else if (t === 'medicine') e = useMedicineOp(r, p, String(op.key || ''), String(op.card || ''), String(op.target || ''));
      else if (t === 'usetool') e = useTool(r, p, String(op.key || ''));
      else if (t === 'boat') e = escapePlayer(r, p);
      else if (t === 'reset') { if (r.hostId === s.id) { rooms.delete(code); return s.emit('island:reset'); } }
      else if (t === 'restart') {
        if (!r.ended) e = '这局还没结束';
        else {
          /* v153：其他人全部踢出这个房间（断开座位），只留点按钮的人 */
          for (const pid of [...r.players.keys()]) {
            if (pid === p.id) continue;
            const sk = nsp.sockets.get(pid);
            if (sk) sk.emit('island:kicked', { msg: '房主重新开局了，这一局已经结束。' });
          }
          const nr = restartRoom(r, p);
          rooms.set(code, nr);
          return broadcast(nr);
        }
      }
      else if (t === 'cookTake') e = takeCook(r, p, Number(op.pot));
      else if (t === 'potTake') e = takePotSlot(r, p, Number(op.pot), Number(op.slot), String(op.card || ''));
      else if (t === 'groundTake') e = groundTake(r, p, String(op.card || ''));
      if (e) err(s, e);
      if (!e) { try { armSearchAuto(r); } catch (_) {} }
      broadcast(r);
    });

    s.on('disconnect', () => { /* 保留座位，靠同名重连接管 */ });
  });
  return { rooms };
}

function hasRoom(code) {
  const k = String(code || '').trim().toUpperCase();
  return !!(ROOMS && ROOMS.get(k));
}

module.exports = { attach, WEATHER, PHASES, hasRoom, CHARS, __test: { drawCard, drawMonKey, monPool, umPickWeather, cardByKind, bearOkAt, rollMonster, researchProduce, settleHunger, npcDaily, newIslandRoom, newIslandPlayer, makeCard, killPlayer, purgeInstantCards, settleInstantCard, uid, useTool, wearItem, chooseNight, RECIPES, BLUEPRINTS, startDay, dawnStart, dawnNext, dawnNextBy, enterSearchPhase, medCardsOf, rollNightEvent, nightSpecialEvent, playerDmg, NIGHT_EVENTS, NIGHT_W, monsterDrops, dropMonsterLoot, escapePlayer, settleEnding, scatterToGround, rollNightWeather } };