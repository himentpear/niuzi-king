import rules from '../config/rules.json' with { type: 'json' };
import catalog from '../config/catalog.json' with { type: 'json' };

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}

export const RULES = deepFreeze(rules);
export const CATALOG = deepFreeze(catalog);

const SLOTS = ['a', 'b', 'c'];
const ZONE_EPSILON = 1e-12;

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

// 用户原设定的展示文案；数值逻辑不依赖这里。
const NPC_NAMES = Object.freeze([
  '王铁柱', '赵日天', '龙傲天', '李狗蛋', '二狗子', '张伟', '翠花', '铁蛋',
  '富贵', '来福', '建国', '建军', '援朝', '跃进', '卫星', '大壮', '狗剩',
  '铁牛', '傻根', '二愣', '三炮', '四喜', '五魁', '六子', '七叔', '八两',
  '九斤', '十全', '隔壁老王', '村口二狗', '健身房教练', '楼下保安', '相亲对象',
  '高中同桌', '公司领导', '外卖小哥', '网管小刘', '前任的现男友', '广场舞大爷',
  '包工头', '托尼老师', '驾校教练', '小区保安', '网吧大神', '宿舍老六', '食堂阿姨',
  '快递小哥', '夜班保安', '澡堂搓背师傅', '网吧包夜冠军', '隔壁班体育生', '小区棋王',
]);

function random(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    fail('INVALID_RANDOM', '随机源必须返回 [0, 1) 内的有限数。');
  }
  return value;
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

export function volume(player) {
  if (!player || !positive(player.length) || !positive(player.diameter)) {
    fail('INVALID_STATS', '长度和直径必须是正的有限数。');
  }
  const value = Math.PI * player.diameter ** 2 * player.length / 4;
  if (!positive(value)) fail('INVALID_STATS', '体积超出有效数值范围。');
  return value;
}

function normalWithin(mean, sigma, min, max, rng) {
  for (let attempts = 0; attempts < 1024; attempts += 1) {
    const z = Math.sqrt(-2 * Math.log(1 - random(rng)))
      * Math.cos(2 * Math.PI * random(rng));
    const value = mean + sigma * z;
    if (value >= min && value <= max && positive(value)) return value;
  }
  fail('RANDOM_EXHAUSTED', '随机抽样多次超出允许区间，请重试。');
}

function profile(userId, username, length, diameter, now) {
  return {
    userId, username, length, diameter,
    // TODO(USER_DESIGN): 初始配色是展示默认值，玩家可在身份证栏目免费改。
    colors: { a: '#d98f7d', b: '#c08260', c: '#7d4f3b' },
    equipped: { a: null, b: null, c: null },
    owned: [], createdAt: now, updatedAt: now, version: 1,
  };
}

export function newPlayer(userId, username, rng = Math.random, now = Date.now()) {
  if (typeof userId !== 'string' || !userId || typeof username !== 'string' || !username) {
    fail('INVALID_PLAYER', '玩家 ID 与用户名不能为空。');
  }
  const sample = (config) => normalWithin(config.mean, config.sigma, config.min, config.max, rng);
  return profile(userId, username, sample(RULES.initial.length), sample(RULES.initial.diameter), now);
}

export function createOpponent(player, rng = Math.random) {
  volume(player);
  const sample = (mean) => normalWithin(
    mean, mean * RULES.pve.relativeSigma,
    mean * RULES.pve.minRatio, mean * RULES.pve.maxRatio, rng,
  );
  const length = sample(player.length);
  const diameter = sample(player.diameter);
  // TODO(USER_DESIGN): 对手名池是展示默认值，可随时增删。
  const names = NPC_NAMES;
  const name = `${names[Math.floor(random(rng) * names.length)]}${100 + Math.floor(random(rng) * 900)}`;
  const npc = profile('npc', name, length, diameter, Date.now());
  for (const slot of SLOTS) {
    npc.colors[slot] = `#${Math.floor(random(rng) * 0x1000000).toString(16).padStart(6, '0')}`;
    const choices = [null, ...CATALOG.filter((item) => item.slot === slot)];
    const selected = choices[Math.floor(random(rng) * choices.length)];
    if (selected) {
      npc.owned.push(selected.id);
      npc.equipped[slot] = selected.id;
    }
  }
  return npc;
}

function dice(count, rng) {
  const all = Array.from({ length: count }, () => Math.floor(random(rng) * 6) + 1);
  const kept = [...all].sort((a, b) => b - a).slice(0, RULES.battle.keptDice);
  return { all, kept, total: kept.reduce((sum, die) => sum + die, 0) };
}

export function resolveBattle(a, b, rng = Math.random, forcedWinnerKey = null) {
  const va = volume(a);
  const vb = volume(b);
  if (!a.userId || !b.userId || a.userId === b.userId) {
    fail('INVALID_OPPONENT', '换个人吧，自己打自己不算本事。');
  }
  const ratio = Math.max(va, vb) / Math.min(va, vb);
  const tier = RULES.battle.tiers.find(({ maxRatio }) => maxRatio === null || ratio <= maxRatio);
  const rolls = {
    a: dice(va >= vb ? tier.dice : 3, rng),
    b: dice(vb > va ? tier.dice : 3, rng),
  };
  const after = { a: structuredClone(a), b: structuredClone(b) };
  const draw = forcedWinnerKey === 'draw'
    ? true
    : (forcedWinnerKey === 'a' || forcedWinnerKey === 'b')
      ? false
      : rolls.a.total === rolls.b.total;
  if (draw) {
    // TODO(USER_DESIGN): A tie provisionally ends the match with no transfer.
    return { winnerId: null, draw: true, rolls, deltas: { length: 0, diameter: 0 }, after };
  }
  const winnerKey = (forcedWinnerKey === 'a' || forcedWinnerKey === 'b')
    ? forcedWinnerKey
    : (rolls.a.total > rolls.b.total ? 'a' : 'b');
  const loserKey = winnerKey === 'a' ? 'b' : 'a';
  const winner = after[winnerKey];
  const loser = after[loserKey];
  const fraction = () => RULES.battle.rewardMin
    + random(rng) * (RULES.battle.rewardMax - RULES.battle.rewardMin);
  const deltas = { length: loser.length * fraction(), diameter: loser.diameter * fraction() };
  winner.length += deltas.length;
  winner.diameter += deltas.diameter;
  loser.length -= deltas.length;
  loser.diameter -= deltas.diameter;
  volume(winner);
  volume(loser);
  return { winnerId: winner.userId, draw: false, rolls, deltas, after };
}

export function scoreQte(positions, centers = Array(RULES.qte.stages).fill((RULES.qte.centerMin + RULES.qte.centerMax) / 2)) {
  const qte = RULES.qte;
  if (!Array.isArray(positions) || positions.length !== qte.stages
    || !Array.isArray(centers) || centers.length !== qte.stages) {
    fail('INVALID_QTE', '每次小游戏需要三个阶段的位置及目标中心。');
  }
  const stages = positions.map((position, index) => {
    const center = centers[index];
    if (!Number.isFinite(center) || center < qte.centerMin || center > qte.centerMax
      || (position !== null && (!Number.isFinite(position) || position < 0 || position > 1))) {
      fail('INVALID_QTE', '小游戏位置或目标中心无效。');
    }
    const distance = position === null ? null : Math.abs(position - center);
    let multiplier = 0;
    if (distance !== null) {
      if (distance <= qte.doubleRadius + ZONE_EPSILON) multiplier = 2;
      else if (distance <= qte.greenRadius + ZONE_EPSILON) multiplier = 1;
      else if (distance <= qte.grayRadius + ZONE_EPSILON) multiplier = 0.5;
    }
    return { position, center, distance, multiplier, points: qte.stageWeights[index] * multiplier };
  });
  const score = stages.reduce((sum, stage) => sum + stage.points, 0);
  return { stages, score, volumeMultiplier: 1 + (score - qte.passScore) / qte.volumeDivisor };
}

export function applyVolumeMultiplier(player, multiplier) {
  volume(player);
  if (!positive(multiplier)) fail('INVALID_MULTIPLIER', '体积倍率必须是正的有限数。');
  const result = structuredClone(player);
  const scale = Math.cbrt(multiplier);
  result.length *= scale;
  result.diameter *= scale;
  volume(result);
  return result;
}

function findItem(itemId) {
  const item = CATALOG.find(({ id }) => id === itemId);
  if (!item) fail('UNKNOWN_ITEM', '美容院没这件货。');
  return item;
}

export function buyCosmetic(player, itemId) {
  const item = findItem(itemId);
  const currentVolume = volume(player);
  if (player.owned.includes(item.id)) fail('ALREADY_OWNED', '这件你已经有了，别重复剁手。');
  if (!positive(item.price) || currentVolume <= item.price) {
    fail('INSUFFICIENT_VOLUME', '体积不够。先去打胶或者找人 PK 攒一点，再来消费。');
  }
  const updated = applyVolumeMultiplier(player, (currentVolume - item.price) / currentVolume);
  updated.owned.push(item.id);
  return { player: updated, cost: item.price, item };
}

export function equipCosmetic(player, slot, itemId) {
  if (!SLOTS.includes(slot)) fail('INVALID_SLOT', '装饰部位无效。');
  if (itemId !== null) {
    const item = findItem(itemId);
    if (item.slot !== slot) fail('INVALID_SLOT', '这件装饰不属于当前部位。');
    if (!player.owned.includes(item.id)) fail('NOT_OWNED', '先付体积，再谈装备。');
  }
  const result = structuredClone(player);
  result.equipped[slot] = itemId;
  return result;
}

export function rankPlayers(players, metric = 'volume', order = 'desc') {
  if (!['volume', 'length', 'diameter'].includes(metric)) fail('INVALID_METRIC', '排行指标无效。');
  if (!['asc', 'desc'].includes(order)) fail('INVALID_ORDER', '排行顺序无效。');
  const direction = order === 'asc' ? 1 : -1;
  return players.map((player, index) => ({ player, index, value: metric === 'volume' ? volume(player) : player[metric] }))
    .sort((a, b) => direction * (a.value - b.value) || a.index - b.index)
    .map(({ player }, index) => ({
      rank: index + 1, userId: player.userId, username: player.username,
      length: player.length, diameter: player.diameter, volume: volume(player),
      colors: structuredClone(player.colors), equipped: structuredClone(player.equipped),
    }));
}
