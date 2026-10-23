import { cosmeticThumbnail } from './cosmetics.js';
import {
  DEFAULT_COLORS, SLOT_LABELS, battleVerdict, qteFeedback, qteHitFeedback, qteMoodTone,
} from './copy.js';
import {
  CARD_TYPES, deriveCombatStats, buildPlayerDeck, getCardTemplate,
  evaluateCardNumbers, rollEnemyIntent, rollDraftRewards,
} from './deck.js';

const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
const dialog = $('#overlay');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, className = '') => `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const number = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const volume = player => player ? Math.PI * Number(player.diameter) ** 2 * Number(player.length) / 4 : 0;
const colorsOf = player => ({ ...DEFAULT_COLORS, ...player?.colors });
const requestId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const NPC_STAGE_NAMES = ['铁拳阿虎', '深蹲彪哥', '钢枪老王', '金腰带泰森', '街头霸王龙', '健身房馆长', '夜场拳王', '大力水手'];

function createPreviewOpponent(basePlayer) {
  const baseLen = Number(basePlayer?.length) || 12;
  const baseDia = Number(basePlayer?.diameter) || 3.5;
  const ratioL = 0.85 + Math.random() * 0.32;
  const ratioD = 0.85 + Math.random() * 0.32;
  const slots = {
    a: ['a-cone', 'a-sphere', 'a-rocket', 'a-urchin', null][Math.floor(Math.random() * 5)],
    b: ['b-veins', 'b-spikes', 'b-spring', 'b-spindle', null][Math.floor(Math.random() * 5)],
    c: ['c-fluffy', 'c-lush', 'c-fins', 'c-huge', null][Math.floor(Math.random() * 5)],
  };
  const palette = [
    { a: '#d46a6a', b: '#b55b52', c: '#6e352c' },
    { a: '#c98a6b', b: '#a86e51', c: '#5e3a27' },
    { a: '#d99b82', b: '#bf7c63', c: '#784838' },
  ][Math.floor(Math.random() * 3)];
  return {
    userId: `npc-preview-${Date.now()}`,
    username: `${NPC_STAGE_NAMES[Math.floor(Math.random() * NPC_STAGE_NAMES.length)]}#${100 + Math.floor(Math.random() * 900)}`,
    length: Number((baseLen * ratioL).toFixed(2)),
    diameter: Number((baseDia * ratioD).toFixed(2)),
    colors: palette,
    equipped: slots,
  };
}

const state = {
  user: null, player: null, rules: {}, catalog: [], tab: 'arena', modal: null,
  authMode: 'login', authUsername: '', authError: '', pending: new Set(),
  players: [], playersLoaded: false, playersLoading: false, search: '', opponentId: null,
  leaderboard: [], leaderboardLoaded: false, leaderboardLoading: false, metric: 'volume', order: 'desc',
  battle: null, battleAnimating: false, qte: null, qteResult: null,
  motion: !prefersReducedMotion(), draftColors: null, ready: false, shopPreview: null,
  // 擂台与杀戮尖塔式肉鸽卡牌对战状态
  pvePreviewOpponent: null,
  draftedCards: [],
  winStreak: 0,
  combat: null,
  floaters: [],
};

let geometryControl = null;
let geometryToken = 0;
let shopGeometryControl = null;
let shopGeometryToken = 0;
let battleControl = null;
let battleToken = 0;
let mountedBattleSignature = '';
let toastTimer;
let qteFrame;
let battleTimer;
let rankingRequest = 0;
let returnFocus = null;

function loadSavedRunDeck(userId) {
  if (!userId) return { draftedCards: [], winStreak: 0 };
  try {
    const raw = localStorage.getItem(`niuzi_roguelike_${userId}`);
    if (!raw) return { draftedCards: [], winStreak: 0 };
    const parsed = JSON.parse(raw);
    return {
      draftedCards: Array.isArray(parsed.draftedCards) ? parsed.draftedCards.slice(0, 18) : [],
      winStreak: Number(parsed.winStreak) || 0,
    };
  } catch {
    return { draftedCards: [], winStreak: 0 };
  }
}

function saveRunDeck() {
  if (!state.user?.id) return;
  try {
    localStorage.setItem(`niuzi_roguelike_${state.user.id}`, JSON.stringify({
      draftedCards: state.draftedCards,
      winStreak: state.winStreak,
    }));
  } catch { /* ignore storage quota */ }
}

function toast(message, isError = false) {
  const element = $('#toast');
  element.textContent = message;
  element.className = `toast visible${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.className = 'toast'; }, 4200);
}

let floaterSeq = 0;
function spawnFloater(side, text, tone = 'damage', delayMs = 30) {
  const seq = ++floaterSeq;
  const jitterX = ((seq * 37) % 56) - 28;
  const jitterY = ((seq * 23) % 34) - 17;
  setTimeout(() => {
    const container = $('#combat-floaters');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `combat-floater side-${side} tone-${tone}`;
    el.style.setProperty('--fx', `${jitterX}px`);
    el.style.setProperty('--fy', `${jitterY}px`);
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }, Math.max(16, delayMs));
}

function triggerStageImpact(targetSide = 'b', intensity = 'normal', delayMs = 180) {
  if (prefersReducedMotion()) return;
  setTimeout(() => {
    const stage = $('.center-ring-stage');
    const flash = $('#stage-impact-flash');
    const hud = $(`[data-hud-side="${targetSide}"]`);
    const shakeClass = intensity === 'heavy' ? 'stage-shake-heavy' : intensity === 'light' ? 'stage-shake-light' : 'stage-shake-normal';
    if (stage) {
      stage.classList.remove('stage-shake-light', 'stage-shake-normal', 'stage-shake-heavy');
      void stage.offsetWidth;
      stage.classList.add(shakeClass);
      setTimeout(() => stage.classList.remove(shakeClass), 420);
    }
    if (flash) {
      flash.className = `stage-impact-flash active flash-${targetSide} flash-${intensity}`;
      setTimeout(() => { flash.className = 'stage-impact-flash'; }, 360);
    }
    if (hud && (intensity === 'normal' || intensity === 'heavy')) {
      hud.classList.remove('hud-hit-jolt');
      void hud.offsetWidth;
      hud.classList.add('hud-hit-jolt');
      setTimeout(() => hud.classList.remove('hud-hit-jolt'), 420);
    }
  }, Math.max(0, delayMs));
}

const pendingMutations = new Map();
let sessionEpoch = 0;
function changeSession(user, player) {
  ++sessionEpoch;
  state.user = user;
  const saved = loadSavedRunDeck(user?.id);
  state.draftedCards = saved.draftedCards;
  state.winStreak = saved.winStreak;
  setPlayer(player);
  state.battle = null;
  state.battleAnimating = false;
  state.combat = null;
  state.qte = null;
  state.qteResult = null;
  state.pending.clear();
  pendingMutations.clear();
}

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

async function api(path, body, options = {}) {
  let requestEpoch = sessionEpoch;
  const ensureCurrent = () => {
    if (requestEpoch !== sessionEpoch) throw Object.assign(new Error('账号已切换，本次响应已忽略。'), { code: 'STALE_SESSION' });
  };
  let mutationKey;
  if (body?.requestId) {
    const { requestId: ignored, ...payload } = body;
    mutationKey = `${state.user?.id || 'anonymous'}:${path}:${JSON.stringify(canonical(payload))}`;
    const receiptId = pendingMutations.get(mutationKey) || body.requestId;
    pendingMutations.set(mutationKey, receiptId);
    body = { ...body, requestId: receiptId };
  }
  let response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  } catch {
    ensureCurrent();
    throw new Error('连接暂时中断，请检查网络后重试。');
  }
  ensureCurrent();
  if (response.status === 401 && !options.allowUnauthorized) {
    changeSession(null, null); requestEpoch = sessionEpoch;
    state.modal = 'auth'; state.authMode = 'login';
  }
  let data;
  try { data = await response.json(); }
  catch { ensureCurrent(); throw new Error('服务暂时没有返回有效数据，请稍后重试。'); }
  ensureCurrent();
  if (mutationKey && response.status < 500) pendingMutations.delete(mutationKey);
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error?.message || `请求未完成（${response.status}）。`);
    error.code = data.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function setPlayer(player) {
  state.player = player || null;
  state.draftColors = player ? colorsOf(player) : null;
  if (player && !state.pvePreviewOpponent) {
    state.pvePreviewOpponent = createPreviewOpponent(player);
  }
  state.playersLoaded = false;
  state.leaderboardLoaded = false;
}

async function pending(key, action, successMessage) {
  if (state.pending.has(key)) return;
  const epoch = sessionEpoch;
  const isCurrent = () => epoch === sessionEpoch;
  state.pending.add(key);
  render();
  try {
    const completed = await action(isCurrent);
    if (completed !== false && successMessage) toast(successMessage);
  } catch (error) {
    if (isCurrent()) toast(error.message, true);
  } finally {
    if (isCurrent()) state.pending.delete(key);
    render();
  }
}

const isBusy = key => state.pending.has(key);
const anyGameBusy = () => ['logout', 'create', 'battle', 'colors', 'purchase', 'equip', 'qte-start', 'qte-finish'].some(isBusy);
const disabled = condition => condition ? ' disabled' : '';

// ==========================================================================
// 杀戮尖塔式回合制卡牌战斗状态机 (Turn-Based Card Combat Controller)
// ==========================================================================
function shuffleCards(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getActiveArenaOpponent() {
  if (state.combat?.enemy?.profile) return state.combat.enemy.profile;
  if (state.opponentId) {
    const found = state.players.find(p => p.userId === state.opponentId);
    if (found) return found;
  }
  if (!state.pvePreviewOpponent) {
    state.pvePreviewOpponent = createPreviewOpponent(state.player);
  }
  return state.pvePreviewOpponent;
}

function drawCards(combat, count) {
  for (let i = 0; i < count; i += 1) {
    if (combat.hand.length >= 8) break;
    if (combat.drawPile.length === 0) {
      if (combat.discardPile.length === 0) break;
      combat.drawPile = shuffleCards(combat.discardPile);
      combat.discardPile = [];
    }
    const nextCard = combat.drawPile.pop();
    if (nextCard) combat.hand.push(nextCard);
  }
}

function sync3DCombatPostures() {
  if (!battleControl || !state.combat) return;
  const c = state.combat;
  const postureA = c.status === 'victory' ? 'victory' : c.status === 'defeat' ? 'ko' : null;
  const postureB = c.status === 'victory' ? 'ko' : c.status === 'defeat' ? 'victory' : null;
  battleControl.setCombatState(
    { shield: c.fighter.block, strength: c.fighter.strength, posture: postureA },
    { shield: c.enemy.block, strength: c.enemy.strength, posture: postureB },
  );
}

function startCardCombat(kind = 'pve') {
  if (anyGameBusy()) return;
  if (kind === 'pvp' && !state.player) {
    toast('PVP 对决需要先在【牛子身份证】注册你专属的牛子！', true);
    return;
  }
  let opponentProfile;
  if (kind === 'pvp') {
    opponentProfile = state.players.find(p => p.userId === state.opponentId);
    if (!opponentProfile) {
      toast('请先在下方挑战名单中选择一位 PVP 对手！', true);
      return;
    }
  } else {
    opponentProfile = state.pvePreviewOpponent || createPreviewOpponent(state.player);
    state.pvePreviewOpponent = opponentProfile;
  }

  const playerProfile = state.player ? structuredClone(state.player) : {
    userId: 'guest-fighter',
    username: '试训红角拳手',
    length: 12.0,
    diameter: 3.5,
    colors: DEFAULT_COLORS,
    equipped: {},
  };

  const fStats = deriveCombatStats(playerProfile);
  const eStats = deriveCombatStats(opponentProfile);
  const fullDeck = buildPlayerDeck(playerProfile, state.draftedCards);

  const combat = {
    id: requestId(),
    kind,
    round: 1,
    status: 'active', // 'active' | 'enemy_turn' | 'victory' | 'defeat'
    settling: false,
    log: `🔔 第 1 回合敲钟开战！每回合拥有 3⚡ 精力，点击手牌向【${opponentProfile.username}】出招！`,
    fighter: {
      profile: playerProfile,
      stats: fStats,
      hp: fStats.maxHp,
      maxHp: fStats.maxHp,
      block: 0,
      retainBlock: 0,
      energy: 3,
      maxEnergy: 3,
      strength: 0,
      thorns: 0,
      vulnerable: 0,
      weak: 0,
    },
    enemy: {
      profile: structuredClone(opponentProfile),
      stats: eStats,
      hp: eStats.maxHp,
      maxHp: eStats.maxHp,
      block: 0,
      strength: 0,
      thorns: 0,
      vulnerable: 0,
      weak: 0,
      intent: null,
    },
    drawPile: shuffleCards(fullDeck),
    hand: [],
    discardPile: [],
    exhaustPile: [],
    rewardChoices: [],
    rewardPicked: false,
    serverSettlement: null,
  };

  combat.enemy.intent = rollEnemyIntent(combat.enemy, 1);
  drawCards(combat, 5);
  state.combat = combat;
  state.battle = null;
  render();
  setTimeout(() => {
    battleControl?.triggerAction('a', 'buff');
    battleControl?.triggerAction('b', 'guard');
    sync3DCombatPostures();
  }, 80);
}

function applyDamageToTarget(attacker, defender, rawDamage, defenderSide, ignoreBlock = false, delayMs = 190) {
  let dmg = Math.max(0, Math.round(rawDamage));
  let blocked = 0;
  if (!ignoreBlock && defender.block > 0) {
    blocked = Math.min(defender.block, dmg);
    defender.block -= blocked;
    dmg -= blocked;
  }
  if (dmg > 0) {
    defender.hp = Math.max(0, defender.hp - dmg);
    const isHeavy = dmg >= 15;
    spawnFloater(defenderSide, `-${dmg} ${isHeavy ? '💥暴击' : '💥'}`, isHeavy ? 'crit' : 'damage', delayMs);
    triggerStageImpact(defenderSide, isHeavy ? 'heavy' : 'normal', delayMs);
  } else if (blocked > 0) {
    spawnFloater(defenderSide, `🛡️ 格挡 ${blocked}`, 'block', delayMs);
    triggerStageImpact(defenderSide, 'light', delayMs);
  }

  // 荆棘倒刺反伤
  if (defender.thorns > 0 && attacker) {
    const thornDmg = defender.thorns;
    attacker.hp = Math.max(1, attacker.hp - thornDmg);
    const attackerSide = defenderSide === 'b' ? 'a' : 'b';
    spawnFloater(attackerSide, `🌵 倒刺 -${thornDmg}`, 'damage', delayMs + 140);
  }
  return { hpDamage: dmg, blocked };
}

async function concludeCardCombat(winnerSide) {
  const c = state.combat;
  if (!c || c.settling) return;
  c.settling = true;
  c.status = winnerSide === 'a' ? 'victory' : 'defeat';

  if (winnerSide === 'a') {
    state.winStreak += 1;
    c.rewardChoices = rollDraftRewards(state.player);
    c.log = `🏆 KO 绝杀！你击败了【${c.enemy.profile.username}】！正在同步赛场尺寸掠夺数据…`;
  } else {
    state.winStreak = 0;
    c.log = `💀 充血耗尽倒地！你在与【${c.enemy.profile.username}】的交锋中落败…`;
  }
  saveRunDeck();
  sync3DCombatPostures();
  render();

  // 与后端结算真实尺寸增减 (1% - 10% 长度与直径转移)
  try {
    const payload = {
      ...(c.kind === 'pvp' ? { opponentId: c.enemy.profile.userId } : {}),
      winnerSide,
      requestId: requestId(),
    };
    const data = await api(`/api/battles/${c.kind}`, payload);
    setPlayer(data.player);
    state.battle = data.battle;
    c.serverSettlement = data.battle;
    const before = data.battle.playerA;
    const after = data.battle.result?.after?.a;
    const lenDelta = after ? Number(after.length) - Number(before.length) : 0;
    const diaDelta = after ? Number(after.diameter) - Number(before.diameter) : 0;
    c.log = winnerSide === 'a'
      ? `🏆 擂台大捷！成功掠夺对手尺寸：长度 ${lenDelta >= 0 ? '+' : ''}${number(lenDelta)} cm，直径 ${diaDelta >= 0 ? '+' : ''}${number(diaDelta)} cm！请选择 1 张肉鸽战利品卡牌加入牌组！`
      : `💀 败北缩水：长度 ${lenDelta >= 0 ? '+' : ''}${number(lenDelta)} cm，直径 ${diaDelta >= 0 ? '+' : ''}${number(diaDelta)} cm。重整旗鼓再来一战！`;
  } catch (error) {
    toast(error.message, true);
  } finally {
    c.settling = false;
    render();
    if (c.kind === 'pvp') loadPlayers();
  }
}

async function playHandCard(uid) {
  const c = state.combat;
  if (!c || c.status !== 'active' || c.settling) return;
  const idx = c.hand.findIndex(entry => entry.uid === uid);
  if (idx === -1) return;

  const cardEntry = c.hand[idx];
  const { damage, block, hits, tpl } = evaluateCardNumbers(cardEntry.cardId, c.fighter, c.enemy);
  if (!tpl) return;
  if (c.fighter.energy < tpl.cost) {
    toast('⚡ 本回合精力不足，请出 0 费牌或点击【敲钟结束回合】！', true);
    return;
  }

  // 扣除精力并移出手牌
  c.fighter.energy -= tpl.cost;
  c.hand.splice(idx, 1);
  if (tpl.type === 'power') {
    c.exhaustPile.push(cardEntry);
  } else {
    c.discardPile.push(cardEntry);
  }

  // 触发 3D 牛子骨骼/顶点动画
  battleControl?.triggerAction('a', tpl.anim || 'jab', {
    blockedCompletely: damage > 0 && c.enemy.block >= damage * hits && !tpl.ignoreBlock,
  });

  const logs = [`你打出【${tpl.name}】`];
  const baseHitDelay = tpl.anim === 'heavy' ? 280 : 180;

  if (tpl.selfDamage) {
    c.fighter.hp = Math.max(1, c.fighter.hp - tpl.selfDamage);
    spawnFloater('a', `⚡ 反震 -${tpl.selfDamage}`, 'damage', 90);
  }

  if (tpl.stealBlock && c.enemy.block > 0) {
    c.enemy.block = 0;
    spawnFloater('b', '💥 护盾粉碎！', 'crit', baseHitDelay - 40);
  }

  let totalDealt = 0;
  if (damage > 0) {
    for (let h = 0; h < hits; h += 1) {
      const outcome = applyDamageToTarget(c.fighter, c.enemy, damage, 'b', tpl.ignoreBlock, baseHitDelay + h * 150);
      totalDealt += outcome.hpDamage;
    }
    logs.push(`造成 ${hits > 1 ? `${damage}×${hits}=${damage * hits}` : damage} 点打击`);
  }

  if (tpl.lifesteal && totalDealt > 0) {
    const healed = Math.max(1, Math.round(totalDealt * tpl.lifesteal));
    c.fighter.hp = Math.min(c.fighter.maxHp, c.fighter.hp + healed);
    spawnFloater('a', `❤️ 虹吸 +${healed}`, 'heal', baseHitDelay + 140);
  }

  if (block > 0) {
    c.fighter.block += block;
    spawnFloater('a', `🛡️ 护盾 +${block}`, 'block', 80);
    logs.push(`获得 ${block} 护盾`);
  }

  if (tpl.retainBlock) {
    c.fighter.retainBlock += tpl.retainBlock;
  }

  if (tpl.heal) {
    c.fighter.hp = Math.min(c.fighter.maxHp, c.fighter.hp + tpl.heal);
    spawnFloater('a', `❤️ 恢复 +${tpl.heal}`, 'heal', 110);
    logs.push(`恢复 ${tpl.heal} HP`);
  }

  if (tpl.energyGain) {
    c.fighter.energy += tpl.energyGain;
    spawnFloater('a', `⚡ 精力 +${tpl.energyGain}`, 'buff', 130);
  }

  if (tpl.strength) {
    c.fighter.strength += tpl.strength;
    spawnFloater('a', `💪 刚猛 +${tpl.strength}`, 'buff', 160);
    logs.push(`刚猛 +${tpl.strength}`);
  }

  if (tpl.thorns) {
    c.fighter.thorns += tpl.thorns;
    spawnFloater('a', `🌵 倒刺 +${tpl.thorns}`, 'buff', 190);
  }

  if (tpl.vulnerable) {
    c.enemy.vulnerable += tpl.vulnerable;
    spawnFloater('b', `💔 破绽 +${tpl.vulnerable}`, 'debuff', baseHitDelay + 90);
  }

  if (tpl.weak) {
    c.enemy.weak += tpl.weak;
    spawnFloater('b', `🥀 萎靡 +${tpl.weak}`, 'debuff', baseHitDelay + 120);
  }

  if (tpl.draw) {
    drawCards(c, tpl.draw);
    spawnFloater('a', `🎴 抽牌 +${tpl.draw}`, 'buff', 150);
  }

  c.log = `${logs.join('，')}！`;
  sync3DCombatPostures();

  if (c.enemy.hp <= 0) {
    await concludeCardCombat('a');
    return;
  }
  render();
}

async function endPlayerTurn() {
  const c = state.combat;
  if (!c || c.status !== 'active' || c.settling) return;
  c.status = 'enemy_turn';

  // 弃置当前手牌
  c.discardPile.push(...c.hand);
  c.hand = [];
  c.enemy.block = 0; // 敌方回合开始清空旧护盾

  const intent = c.enemy.intent || rollEnemyIntent(c.enemy, c.round);
  c.log = `⚠️ 对手【${c.enemy.profile.username}】施展【${intent.title}】！`;
  render();

  // 触发敌方 3D 牛子出招动画
  battleControl?.triggerAction('b', intent.anim || 'jab', {
    blockedCompletely: intent.damage > 0 && c.fighter.block >= (intent.damage + c.enemy.strength) * (intent.hits || 1),
  });

  await new Promise(resolve => setTimeout(resolve, 480));
  if (state.combat !== c) return;

  if (intent.damage) {
    const hits = intent.hits || 1;
    let perHit = intent.damage + c.enemy.strength;
    if (c.enemy.weak > 0) perHit = Math.floor(perHit * 0.75);
    if (c.fighter.vulnerable > 0) perHit = Math.floor(perHit * 1.5);
    perHit = Math.max(1, perHit);
    for (let i = 0; i < hits; i += 1) {
      applyDamageToTarget(c.enemy, c.fighter, perHit, 'a', false, 40 + i * 160);
    }
  }

  if (intent.block) {
    c.enemy.block += intent.block;
    spawnFloater('b', `🛡️ 护盾 +${intent.block}`, 'block', 60);
  }

  if (intent.strength) {
    c.enemy.strength += intent.strength;
    spawnFloater('b', `💪 刚猛 +${intent.strength}`, 'buff', 90);
  }

  if (intent.vulnerable) {
    c.fighter.vulnerable += intent.vulnerable;
    spawnFloater('a', `💔 破绽 +${intent.vulnerable}`, 'debuff', 130);
  }

  sync3DCombatPostures();

  if (c.fighter.hp <= 0) {
    await concludeCardCombat('b');
    return;
  }
  if (c.enemy.hp <= 0) {
    await concludeCardCombat('a');
    return;
  }

  // 进入下一回合
  c.round += 1;
  if (c.fighter.retainBlock > 0) {
    c.fighter.retainBlock -= 1;
  } else {
    c.fighter.block = 0;
  }
  if (c.fighter.vulnerable > 0) c.fighter.vulnerable -= 1;
  if (c.fighter.weak > 0) c.fighter.weak -= 1;
  if (c.enemy.vulnerable > 0) c.enemy.vulnerable -= 1;
  if (c.enemy.weak > 0) c.enemy.weak -= 1;

  c.fighter.energy = c.fighter.maxEnergy;
  c.enemy.intent = rollEnemyIntent(c.enemy, c.round);
  drawCards(c, 5);
  c.status = 'active';
  c.log = `🔔 第 ${c.round} 回合开始！精力已回满（3⚡），观察敌方头顶意图出牌！`;
  sync3DCombatPostures();
  render();
}

// ==========================================================================
// 视图渲染层 (Views & Templates)
// ==========================================================================
function renderNavigation() {
  $('#main-nav').innerHTML = [
    ['identity', 'card', '牛子身份证', 'WEIGH-IN · 01'],
    ['arena', 'play', '牛子游乐场', 'MAIN RING · 02'],
    ['ranking', 'trophy', '牛子排行榜', 'HALL OF FAME · 03']
  ].map(([tab, glyph, label, code]) => `<button class="nav-item${state.tab === tab ? ' active' : ''}" data-action="tab" data-tab="${tab}" aria-current="${state.tab === tab ? 'page' : 'false'}"><span class="nav-led" aria-hidden="true"></span>${icon(glyph)}<span class="nav-copy"><span>${label}</span><small class="nav-number">${code}</small></span></button>`).join('');
  $('#account-actions').innerHTML = state.user
    ? `<div class="fighter-badge"><span class="avatar" aria-hidden="true">${escapeHtml(state.user.username.slice(0, 1))}</span><span class="account-name">${escapeHtml(state.user.username)}</span></div><button class="button text" data-action="logout"${disabled(isBusy('logout'))}>${isBusy('logout') ? '退场中…' : '退出'}</button>`
    : `<button class="button outline small" data-action="auth" data-mode="login">拳手登录</button><button class="button small" data-action="auth" data-mode="register">注册账号 ${icon('arrow')}</button>`;
}

function pageHeader(title, subtitle, roundCode) {
  return `<header class="page-header"><div><div class="eyebrow">WNC OFFICIAL SANCTIONED ARENA</div><h1>${title}</h1>${subtitle ? `<p class="page-description">${subtitle}</p>` : ''}</div>${roundCode ? `<div class="page-number" aria-hidden="true">${roundCode}</div>` : ''}</header>`;
}

function renderIdentity() {
  const header = pageHeader('牛子身份证', '选手官方称重档案 · 3D 柔性骨骼动作检视与护具涂装中心', '01');
  if (!state.player) {
    return `${header}<section class="card empty-identity"><div class="empty-art" aria-hidden="true"><div class="ring-ropes-deco"><span></span><span></span><span></span></div>${icon('trophy')}<span class="empty-badge">WNC · HEAVYWEIGHT REGISTRATION</span></div><div class="empty-content"><div class="eyebrow">FIGHTER CONTRACT</div><h2>尚未签署拳台称重档案</h2><p>${state.user ? '尚未注册牛子。立即签署选手契约，随机生成初始量级并解锁专属肉鸽战斗牌组！' : '请先登录或注册账号，获取你的专属拳台称重铭牌与 3D 擂台展柜。'}</p>${state.user ? `<button class="button acid" data-action="create-player"${disabled(isBusy('create'))}>${icon('spark')}${isBusy('create') ? '称重登记中…' : '注册牛子'}</button>` : `<button class="button acid" data-action="auth" data-mode="register">立即入场登记 ${icon('arrow')}</button>`}</div></section>`;
  }
  const player = state.player;
  const colors = state.draftColors || colorsOf(player);
  const ownedCount = player.owned?.length || 0;
  const total = state.catalog.length || 18;
  const equippedNames = ['a', 'b', 'c'].map(slot => {
    const id = player.equipped?.[slot];
    const item = state.catalog.find(entry => entry.id === id);
    return `<span class="pill">${SLOT_LABELS[slot]}：${escapeHtml(item ? item.name : '原厂裸装')}</span>`;
  }).join('');
  return `${header}<div class="identity-grid identity-grid-v2"><section class="card stage-card anatomy-card"><div class="card-topline"><span class="section-label">${icon('spark')}牛子展示台 · 3D 柔性骨骼动作检视</span><span class="pill dark">${state.motion ? '● 环台旋转中' : '■ 已锁定视角'}</span></div><div class="anatomy-stage" data-stage><div class="ring-ropes" aria-hidden="true"><span></span><span></span><span></span></div><div class="corner-buckle red" aria-hidden="true">RED CORNER</div><div class="corner-buckle blue" aria-hidden="true">BLUE CORNER</div><div class="anatomy-viewport" data-anatomy aria-label="牛子3D模型展示"></div><div class="anatomy-legend">${['a', 'b', 'c'].map(slot => `<span><i style="background:${escapeHtml(colors[slot])}"></i>${SLOT_LABELS[slot]}</span>`).join('')}</div></div><div class="anim-test-strip" role="group" aria-label="牛子3D骨骼动作预览"><span class="tiny-label">动作预览：</span><button class="button outline small" data-action="test-anim" data-anim="jab">🥊 寸劲抽击</button><button class="button outline small" data-action="test-anim" data-anim="heavy">🔨 泰山压顶</button><button class="button outline small" data-action="test-anim" data-anim="flurry">🌪️ 疾风三连</button><button class="button outline small" data-action="test-anim" data-anim="buff">🔥 充血脉动</button><button class="button outline small" data-action="test-anim" data-anim="hit">💥 受击回弹</button></div><div class="anatomy-info"><div class="anatomy-metric"><span class="stat-label">长度 · REACH</span><strong>${number(player.length)}<small>cm</small></strong></div><div class="anatomy-metric"><span class="stat-label">直径 · CALIBER</span><strong>${number(player.diameter)}<small>cm</small></strong></div><div class="anatomy-metric"><span class="stat-label">体积 · WEIGHT</span><strong>${number(volume(player))}<small>cm³</small></strong></div><button class="button acid" data-action="shop">牛子美容院 ${icon('arrow')}</button></div><div class="stage-foot"><p class="stage-note">手势拖拽旋转 · 点击上方招式按钮可实时预览茎部弯曲、甩鞭与充血蠕动动画</p><button class="button outline small" data-action="motion" aria-pressed="${state.motion}">${state.motion ? 'Ⅱ 暂停旋转' : '▷ 开始旋转'}</button></div></section><div class="identity-details"><section class="card profile-card"><div class="profile-heading"><div><div class="eyebrow">FIGHTER LICENSE PLATE</div><h2 class="profile-title">${escapeHtml(player.username)}</h2><p class="profile-subtitle">WNC 认证选手 · 连胜记录 ${state.winStreak} 场 · 牌组 ${buildPlayerDeck(player, state.draftedCards).length} 张</p></div><div class="profile-stamp" aria-hidden="true">WNC<br>CERT</div></div><div class="main-stat"><strong>${number(volume(player))}</strong><span>cm³ 总量级</span></div><div class="stats-row"><div><div class="stat-label">有效臂展（刺击加成）</div><div class="stat-number">${number(player.length)}<small>cm</small></div></div><div><div class="stat-label">重拳口径（重击与护甲）</div><div class="stat-number">${number(player.diameter)}<small>cm</small></div></div></div><div class="profile-note">${equippedNames}</div></section><form id="colors-form" class="card color-card"><div class="card-topline"><span class="section-label">${icon('palette')}免费上色 · 战纹涂装台</span><span class="tiny-label">CORNERMAN PAINT KIT · 免费</span></div><div class="color-row">${['a', 'b', 'c'].map(slot => `<label class="color-field"><input type="color" name="${slot}" value="${escapeHtml(colors[slot])}" aria-label="${SLOT_LABELS[slot]}颜色"${disabled(anyGameBusy())}><span>${SLOT_LABELS[slot]}</span></label>`).join('')}</div><div class="inline-end"><p class="small-copy muted">龟头、茎部、阴囊三处护具各选一个战纹配色。</p><button class="button outline small" type="submit"${disabled(anyGameBusy())}>${isBusy('colors') ? '涂装中…' : '保存颜色'}</button></div></form><section class="collection-strip"><div class="collection-group">${icon('trophy')}<div><p class="collection-title">牛子衣柜 · 护具流派卡牌库</p><p class="collection-copy">已解锁 ${ownedCount} / ${total} 款护具（穿戴护具可自动激活专属神技卡）</p></div></div><button class="button acid" data-action="shop">去美容院 ${icon('arrow')}</button></section></div></div>`;
}

function opponentRows() {
  const ownId = state.user?.id;
  const players = state.players.filter(player => player.userId !== ownId && player.username.toLowerCase().includes(state.search.toLowerCase()));
  if (state.playersLoading) return '<div class="empty-state">正在读取可挑战拳手名单…</div>';
  if (!players.length) return `<div class="empty-state">${icon('user')}<strong>${state.search ? '未找到匹配拳手' : '暂无其他在线拳手'}</strong><span>可直接点击左侧【开始 PVE 肉鸽闯关】与街头陪练登台过招！</span></div>`;
  return players.map(player => `<button class="opponent${state.opponentId === player.userId ? ' selected' : ''}" data-action="select-opponent" data-id="${escapeHtml(player.userId)}"${disabled(anyGameBusy())}><span class="avatar">${escapeHtml(player.username.slice(0, 1))}</span><span class="opponent-info"><span class="opponent-name">${escapeHtml(player.username)}</span><span class="opponent-metrics">${number(volume(player))} cm³ &nbsp;·&nbsp; 长 ${number(player.length)} / 径 ${number(player.diameter)}</span></span><span class="selection-dot" aria-hidden="true"></span><span class="sr-only">${state.opponentId === player.userId ? '已选择' : '选择对手'}</span></button>`).join('');
}

function renderStatusPills(combatant) {
  const pills = [];
  if (combatant.block > 0) pills.push(`<span class="status-pill block">🛡️ 护盾 ${combatant.block}</span>`);
  if (combatant.strength > 0) pills.push(`<span class="status-pill buff">💪 刚猛 +${combatant.strength} (伤+${combatant.strength})</span>`);
  if (combatant.thorns > 0) pills.push(`<span class="status-pill buff">🌵 倒刺 ${combatant.thorns} (反伤${combatant.thorns})</span>`);
  if (combatant.vulnerable > 0) pills.push(`<span class="status-pill debuff">💔 破绽 ${combatant.vulnerable}回合 (受击+50%)</span>`);
  if (combatant.weak > 0) pills.push(`<span class="status-pill debuff">🥀 萎靡 ${combatant.weak}回合 (攻击-25%)</span>`);
  if (!pills.length) pills.push('<span class="status-pill muted-pill">● 状态平稳 · 无增减益</span>');
  return `<div class="combat-statuses">${pills.join('')}</div>`;
}

function renderCardNumChips(cardId, fighter, enemy) {
  const { damage, block, hits, tpl } = evaluateCardNumbers(cardId, fighter, enemy);
  if (!tpl) return '';
  const chips = [];
  if (damage > 0) {
    const baseRaw = tpl.baseDamage || 0;
    const isBoosted = damage > baseRaw;
    chips.push(`<span class="sts-num-chip dmg${isBoosted ? ' boosted' : ''}">⚔️ ${hits > 1 ? `${damage}×${hits}=${damage * hits}` : `${damage} 伤`}</span>`);
  }
  if (block > 0) {
    const isBoosted = block > (tpl.baseBlock || 0);
    chips.push(`<span class="sts-num-chip blk${isBoosted ? ' boosted' : ''}">🛡️ +${block} 盾</span>`);
  }
  if (tpl.strength) chips.push(`<span class="sts-num-chip buf">💪 刚猛+${tpl.strength}</span>`);
  if (tpl.thorns) chips.push(`<span class="sts-num-chip buf">🌵 倒刺+${tpl.thorns}</span>`);
  if (tpl.vulnerable) chips.push(`<span class="sts-num-chip deb">💔 破绽+${tpl.vulnerable}</span>`);
  if (tpl.weak) chips.push(`<span class="sts-num-chip deb">🥀 萎靡+${tpl.weak}</span>`);
  if (tpl.heal) chips.push(`<span class="sts-num-chip hel">❤️ +${tpl.heal} HP</span>`);
  if (tpl.energyGain) chips.push(`<span class="sts-num-chip nrg">⚡ +${tpl.energyGain} 精力</span>`);
  if (tpl.draw) chips.push(`<span class="sts-num-chip drw">🎴 抽+${tpl.draw}</span>`);
  return chips.length ? `<div class="sts-num-chips">${chips.join('')}</div>` : '';
}

function computeEnemyIntentBanner(enemy, fighter) {
  const intent = enemy?.intent;
  if (!intent) return { badgeClass: 'intent-jab', mainText: '⚔️ 意图：伺机待发', subText: '准备出招' };
  const parts = [];
  let totalIncoming = 0;
  if (intent.damage) {
    const hits = intent.hits || 1;
    let perHit = intent.damage + (enemy.strength || 0);
    if (enemy.weak > 0) perHit = Math.floor(perHit * 0.75);
    if (fighter?.vulnerable > 0) perHit = Math.floor(perHit * 1.5);
    perHit = Math.max(1, perHit);
    totalIncoming = perHit * hits;
    parts.push(hits > 1 ? `伤害 ${perHit}×${hits} = ${totalIncoming}` : `伤害 ${totalIncoming}`);
  }
  if (intent.block) parts.push(`护盾 +${intent.block}`);
  if (intent.strength) parts.push(`刚猛 +${intent.strength}`);
  if (intent.vulnerable) parts.push(`施加破绽 ${intent.vulnerable}`);

  let blockNote = '';
  if (totalIncoming > 0 && fighter) {
    const curBlock = fighter.block || 0;
    const netDmg = Math.max(0, totalIncoming - curBlock);
    blockNote = curBlock >= totalIncoming
      ? `✅ 当前护盾(${curBlock})已全额防住`
      : curBlock > 0
      ? `⚠️ 护盾抵消后仍受 ${netDmg} 点净伤`
      : `❗ 预计直击扣除 ${totalIncoming} HP`;
  } else {
    blockNote = intent.title || '敌方回合行动';
  }

  const badgeClass = intent.anim === 'heavy' ? 'intent-heavy' : intent.anim === 'guard' ? 'intent-defend' : intent.anim === 'buff' ? 'intent-buff' : 'intent-jab';
  return {
    badgeClass,
    mainText: `${intent.icon || '⚔️'} ${intent.title}：${parts.join(' · ')}`,
    subText: blockNote,
  };
}

function renderCombatHand(combat) {
  if (!combat.hand.length) {
    return '<div class="empty-hand-note">本回合手牌已全部打出，请点击右侧【🔔 敲钟结束回合】迎接对手出招！</div>';
  }
  return combat.hand.map((entry, idx) => {
    const { desc, tpl } = evaluateCardNumbers(entry.cardId, combat.fighter, combat.enemy);
    if (!tpl) return '';
    const canPlay = combat.status === 'active' && combat.fighter.energy >= tpl.cost;
    const typeInfo = CARD_TYPES[tpl.type] || CARD_TYPES.attack;
    const offset = idx - (combat.hand.length - 1) / 2;
    const rot = (offset * 2.6).toFixed(1);
    const lift = (Math.abs(offset) * 3.5).toFixed(1);
    return `<button class="sts-card type-${tpl.type} rarity-${tpl.rarity || 'common'}${canPlay ? ' playable' : ' unplayable'}" style="--card-rot:${rot}deg;--card-drop:${lift}px" data-action="play-card" data-uid="${escapeHtml(entry.uid)}"${disabled(!canPlay)}><div class="sts-card-top"><span class="sts-cost">${tpl.cost}</span><span class="sts-type-tag">${typeInfo.badge}</span></div><div class="sts-card-art"><span class="sts-anim-tag">${tpl.anim === 'heavy' ? '🔨 重劈暴击' : tpl.anim === 'flurry' ? '🌪️ 多段连抽' : tpl.anim === 'guard' ? '🛡️ 硬化固守' : tpl.anim === 'buff' ? '🔥 充血脉动' : '🥊 寸劲刺击'}</span></div><strong class="sts-card-title">${escapeHtml(tpl.name)}</strong>${renderCardNumChips(entry.cardId, combat.fighter, combat.enemy)}<p class="sts-card-desc">${escapeHtml(desc)}</p></button>`;
  }).join('');
}

function renderCombatOutcomeDeck(combat) {
  const isWin = combat.status === 'victory';
  const battle = combat.serverSettlement;
  let ledgerHtml = '';
  if (battle?.playerA && battle?.result?.after?.a) {
    const before = battle.playerA;
    const after = battle.result.after.a;
    const volBefore = volume(before);
    const volAfter = volume(after);
    const dLen = Number(after.length) - Number(before.length);
    const dDia = Number(after.diameter) - Number(before.diameter);
    const dVol = volAfter - volBefore;
    const fmtDelta = (val, unit) => `<span class="${val >= 0 ? 'delta-positive' : 'delta-negative'}">${val >= 0 ? '+' : ''}${number(val)} ${unit}</span>`;
    ledgerHtml = `
      <div class="plunder-ledger">
        <div class="plunder-cell">
          <span class="stat-label">📏 长度变化 · LENGTH</span>
          <strong>${number(before.length)} → ${number(after.length)} <small>cm</small></strong>
          ${fmtDelta(dLen, 'cm')}
        </div>
        <div class="plunder-cell">
          <span class="stat-label">⚙️ 直径变化 · CALIBER</span>
          <strong>${number(before.diameter)} → ${number(after.diameter)} <small>cm</small></strong>
          ${fmtDelta(dDia, 'cm')}
        </div>
        <div class="plunder-cell">
          <span class="stat-label">📦 总体积变化 · VOLUME</span>
          <strong>${number(volBefore, 1)} → ${number(volAfter, 1)} <small>cm³</small></strong>
          ${fmtDelta(dVol, 'cm³')}
        </div>
      </div>`;
  }
  return `<div class="combat-outcome-panel"><div class="outcome-header"><span class="pill dark">${isWin ? '🏆 KO 获胜 · 真实尺寸已掠夺' : '💀 战败倒地 · 尺寸受损'}</span><h3>${escapeHtml(combat.log)}</h3></div>${ledgerHtml}${isWin && combat.rewardChoices.length && !combat.rewardPicked ? `<div class="roguelike-draft-box"><div class="draft-header"><strong>🎁 肉鸽战利品三选一</strong><span>挑 1 张强力新卡永久加入你的连胜牌组（当前牌组 ${buildPlayerDeck(state.player, state.draftedCards).length} 张）</span><button class="button text small" data-action="skip-reward">跳过选牌</button></div><div class="draft-cards-row">${combat.rewardChoices.map(cardId => {
    const { desc, tpl } = evaluateCardNumbers(cardId, combat.fighter, combat.enemy);
    if (!tpl) return '';
    const typeInfo = CARD_TYPES[tpl.type] || CARD_TYPES.attack;
    return `<button class="sts-card draft-card type-${tpl.type} rarity-${tpl.rarity || 'common'} playable" data-action="pick-reward" data-card="${escapeHtml(cardId)}"><div class="sts-card-top"><span class="sts-cost">${tpl.cost}</span><span class="sts-type-tag">${typeInfo.badge}</span></div><strong class="sts-card-title">${escapeHtml(tpl.name)}</strong>${renderCardNumChips(cardId, combat.fighter, combat.enemy)}<p class="sts-card-desc">${escapeHtml(desc)}</p><span class="draft-pick-cta">➕ 收入牌组</span></button>`;
  }).join('')}</div></div>` : ''}<div class="outcome-actions"><button class="button acid" data-action="start-pve-combat">${icon('dice')}继续下一场 PVE 肉鸽擂台</button>${state.opponentId ? `<button class="button" data-action="start-pvp-combat">${icon('play')}再战该 PVP 对手</button>` : ''}<button class="button outline" data-action="exit-combat">返回赛场选人台</button></div></div>`;
}

function renderArena() {
  const needsPlayer = !state.player;
  const playerA = state.player || { username: '待命红角拳手', length: 12, diameter: 3.5, colors: DEFAULT_COLORS };
  const playerB = getActiveArenaOpponent();
  const c = state.combat;
  const derivedA = deriveCombatStats(playerA);
  const derivedB = deriveCombatStats(playerB);
  const fStats = c ? c.fighter : { stats: derivedA, hp: derivedA.maxHp, maxHp: derivedA.maxHp, block: 0, strength: 0, thorns: 0, vulnerable: 0, weak: 0 };
  const eStats = c ? c.enemy : { stats: derivedB, hp: derivedB.maxHp, maxHp: derivedB.maxHp, block: 0, strength: 0, thorns: 0, vulnerable: 0, weak: 0, intent: rollEnemyIntent({ stats: derivedB, strength: 0 }, 1) };
  const hpPctA = Math.max(0, Math.min(100, Math.round((fStats.hp / fStats.maxHp) * 100)));
  const hpPctB = Math.max(0, Math.min(100, Math.round((eStats.hp / eStats.maxHp) * 100)));
  const deckSize = state.player ? buildPlayerDeck(state.player, state.draftedCards).length : 10;
  const intentView = computeEnemyIntentBanner(eStats, fStats);

  return `${pageHeader('牛子游乐场', '中央 3D 宽幅八角擂台 · 杀戮尖塔式回合制卡牌出招 + 肉鸽牌组构筑', '02')}
  <section class="card arena-centerpiece-card" id="battle-result">
    <!-- 顶部大屏记分牌与红蓝角血条/三维战斗转化数值/意图 HUD -->
    <div class="ring-scoreboard-hud">
      <div class="fighter-hud corner-red-hud" data-hud-side="a">
        <div class="hud-top">
          <span class="corner-pill red">红角 · 挑战方</span>
          <strong class="hud-name">${escapeHtml(playerA.username)}</strong>
          <span class="hud-dims">📦 ${number(volume(playerA), 1)} cm³</span>
        </div>
        <div class="hp-bar-wrap">
          <div class="hp-bar-track" role="progressbar" aria-valuenow="${fStats.hp}" aria-valuemin="0" aria-valuemax="${fStats.maxHp}">
            <div class="hp-bar-fill red" style="width:${hpPctA}%"></div>
            <span class="hp-bar-label">❤️ 充血值 ${fStats.hp} / ${fStats.maxHp} (${hpPctA}%)</span>
          </div>
          ${fStats.block > 0 ? `<span class="block-shield" title="当前回合护盾值">🛡️ ${fStats.block}</span>` : ''}
        </div>
        <div class="hud-stat-chips">
          <span class="hud-chip" title="长度提升刺击与连抽卡牌伤害">📏 长 ${number(playerA.length)}cm <em>刺击+${fStats.stats.jabBonus}</em></span>
          <span class="hud-chip" title="直径提升重劈伤害与硬化护盾加成">⚙️ 径 ${number(playerA.diameter)}cm <em>重击+${fStats.stats.heavyBonus}/盾+${fStats.stats.guardBonus}</em></span>
        </div>
        ${renderStatusPills(fStats)}
      </div>

      <div class="ring-center-bell">
        <span class="round-placa">${c ? `ROUND ${String(c.round).padStart(2, '0')}` : 'RING READY'}</span>
        <span class="streak-badge">🔥 连胜 ${state.winStreak} 场</span>
        <div class="bell-quick-links">
          <button class="button text small" data-action="deck-modal">🃏 牌组 (${deckSize})</button>
          <button class="button text small" data-action="rules">📖 规则</button>
        </div>
      </div>

      <div class="fighter-hud corner-blue-hud" data-hud-side="b">
        <div class="hud-top">
          <span class="hud-dims">📦 ${number(volume(playerB), 1)} cm³</span>
          <strong class="hud-name">${escapeHtml(playerB.username)}</strong>
          <span class="corner-pill blue">蓝角 · 迎战方</span>
        </div>
        <div class="hp-bar-wrap">
          ${eStats.block > 0 ? `<span class="block-shield" title="对手当前护盾值">🛡️ ${eStats.block}</span>` : ''}
          <div class="hp-bar-track" role="progressbar" aria-valuenow="${eStats.hp}" aria-valuemin="0" aria-valuemax="${eStats.maxHp}">
            <div class="hp-bar-fill blue" style="width:${hpPctB}%"></div>
            <span class="hp-bar-label">❤️ 充血值 ${eStats.hp} / ${eStats.maxHp} (${hpPctB}%)</span>
          </div>
        </div>
        <div class="hud-stat-chips right">
          <span class="hud-chip">📏 长 ${number(playerB.length)}cm <em>刺击+${eStats.stats.jabBonus}</em></span>
          <span class="hud-chip">⚙️ 径 ${number(playerB.diameter)}cm <em>重击+${eStats.stats.heavyBonus}/盾+${eStats.stats.guardBonus}</em></span>
        </div>
        <div class="enemy-intent-row">
          <span class="intent-badge ${intentView.badgeClass}" title="对手下回合行动与预计精确数值">${escapeHtml(intentView.mainText)}</span>
          <span class="intent-desc">${escapeHtml(intentView.subText)}</span>
        </div>
        ${renderStatusPills(eStats)}
      </div>
    </div>

    <!-- 视觉中心：3D 宽幅八角拳击大擂台 -->
    <div class="center-ring-stage">
      <div class="ring-ropes" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="corner-buckle red" aria-hidden="true">RED · ${escapeHtml(playerA.username)}</div>
      <div class="corner-buckle blue" aria-hidden="true">BLUE · ${escapeHtml(playerB.username)}</div>
      <div id="stage-impact-flash" class="stage-impact-flash" aria-hidden="true"></div>
      <div id="combat-floaters" class="combat-floaters" aria-live="polite"></div>
      <div class="battle-arena main-ring-viewport" data-battle-stage aria-label="WNC 3D拳击擂台：双方牛子正面对决"></div>
      <div class="ring-log-banner" id="combat-log-banner">${escapeHtml(c ? c.log : (needsPlayer ? '请先前往【牛子身份证】注册你的牛子，即可登台出牌对决！' : '擂台就绪！点击下方【开始 PVE 肉鸽闯关】或选择【PVP 玩家对手】敲钟开战，也可点击动作按钮测试打击特效！'))}</div>
    </div>

    <!-- 擂台下方交互区：战斗中显示杀戮尖塔式手牌扇形区，待命时显示选人与特训控台 -->
    ${c ? (c.status === 'victory' || c.status === 'defeat' ? renderCombatOutcomeDeck(c) : `
      <div class="sts-combat-console">
        <div class="sts-console-bar">
          <div class="energy-and-piles">
            <div class="energy-orb" aria-label="当前精力">
              <strong>${c.fighter.energy}<small>/${c.fighter.maxEnergy}</small></strong>
              <span>⚡ 回合精力</span>
            </div>
            <button class="pile-badge clickable" data-action="deck-modal" title="点击查看完整牌组">
              🎴 抽牌堆 <strong>${c.drawPile.length}</strong> 张
            </button>
            <span class="pile-badge">
              📥 弃牌堆 <strong>${c.discardPile.length}</strong> 张
            </span>
            ${c.exhaustPile.length ? `<span class="pile-badge">🔥 已消耗 <strong>${c.exhaustPile.length}</strong></span>` : ''}
          </div>
          <div class="sts-console-actions">
            <button class="button text small" data-action="exit-combat">🏳️ 撤退</button>
            <button class="button acid end-turn-btn" data-action="combat-end-turn"${disabled(c.status !== 'active' || c.settling)}>
              🔔 敲钟结束回合
            </button>
          </div>
        </div>

        <div class="card-hand-tray" role="region" aria-label="当前回合手牌">
          ${renderCombatHand(c)}
        </div>
      </div>
    `) : `
      <div class="ring-lobby-console">
        <div class="lobby-warmup-bar">
          <span class="anim-test-label">🔥 擂台实景打击测试：</span>
          <button class="anim-btn" data-action="ring-anim" data-side="a" data-anim="jab">🥊 红角寸劲抽击</button>
          <button class="anim-btn" data-action="ring-anim" data-side="a" data-anim="heavy">🔨 红角泰山压顶</button>
          <button class="anim-btn" data-action="ring-anim" data-side="a" data-anim="flurry">🌪️ 红角疾风三连</button>
          <button class="anim-btn" data-action="ring-anim" data-side="a" data-anim="buff">💪 红角充血超载</button>
          <button class="anim-btn" data-action="ring-anim" data-side="b" data-anim="jab">🛡️ 蓝角反击演练</button>
        </div>
        <div class="arena-layout lobby-grid">
          <section class="card pvp-card pve-roguelike-panel">
            <div class="play-kicker">ROGUELIKE DECKBUILDER · 杀戮尖塔肉鸽模式</div>
            <h2 class="card-heading">🔥 PVE 肉鸽卡牌擂台赛</h2>
            <p class="card-description">与蓝角对手【${escapeHtml(playerB.username)}】展开回合制卡牌博弈！每场胜利不仅直接掠夺对手 1%–10% 真实尺寸，还能<strong>三选一构筑稀有招式卡</strong>！</p>
            <div class="lobby-cta-row">
              <div>
                <strong>当前蓝角陪练：${escapeHtml(playerB.username)}</strong>
                <div class="small-copy muted">长 ${number(playerB.length)} cm · 径 ${number(playerB.diameter)} cm · HP ${derivedB.maxHp}</div>
              </div>
              <div class="lobby-cta-buttons">
                <button class="button outline small" data-action="reroll-pve"${disabled(anyGameBusy())}>🎲 换个陪练</button>
                <button class="button acid" data-action="start-pve-combat"${disabled(anyGameBusy())}>${icon('spark')}敲钟开战 · PVE 卡牌对决</button>
              </div>
            </div>
            <div class="lobby-cta-row" style="margin-top:12px">
              <div>
                <strong>⚡ 打胶立式拳力机（QTE 特训）</strong>
                <div class="small-copy muted">三段式黄金靶心测力冲刺，单人冲分直接暴涨牛子体积。</div>
              </div>
              <button class="button outline small" data-action="qte-open"${disabled(needsPlayer || anyGameBusy())}>${icon('spark')}开始打胶</button>
            </div>
          </section>

          <section class="card pvp-card pvp-select-panel">
            <div class="play-kicker">RED VS BLUE · 真实玩家赌注挑战</div>
            <h2 class="card-heading">⚔️ PVP 选人约战台</h2>
            <p class="card-description">点选下方任意玩家即可将其牛子请上上方蓝角擂台，使用你构筑的肉鸽牌组正面对决并掠夺对方真实尺寸！</p>
            <div class="search-wrap"><label class="sr-only" for="opponent-search">搜索玩家用户名</label><input class="search-field" id="opponent-search" placeholder="输入对手拳台名号搜索…" value="${escapeHtml(state.search)}" autocomplete="off"></div>
            <div class="opponent-list" id="opponent-list">${opponentRows()}</div>
            <button class="button acid wide" data-action="start-pvp-combat"${disabled(needsPlayer || !state.opponentId || anyGameBusy())}>${icon('dice')}向选中玩家发起卡牌对决</button>
          </section>
        </div>
      </div>
    `}
  </section>`;
}

const metricNames = { volume: '体积', length: '长度', diameter: '直径' };
const metricValue = (player, metric) => metric === 'volume' ? volume(player) : Number(player[metric]);
const metricUnit = metric => metric === 'volume' ? 'cm³' : 'cm';

function renderRanking() {
  const players = state.leaderboard;
  return `${pageHeader('牛子排行榜', 'WNC 金腰带名人堂 · 全服拳手实时量级排位牌', '03')}<section class="card ranking-card"><div class="ranking-toolbar"><div class="segmented" role="group" aria-label="排行榜排序维度">${['volume', 'length', 'diameter'].map(metric => `<button data-action="metric" data-metric="${metric}" class="${state.metric === metric ? 'active' : ''}" aria-pressed="${state.metric === metric}">${metricNames[metric]}</button>`).join('')}</div><button class="button outline small" data-action="order">${state.order === 'desc' ? '↓ 从大到小' : '↑ 从小到大'}</button></div>${state.leaderboardLoading ? '<div class="empty-state">正在刷新赛场记分牌…</div>' : !players.length ? `<div class="empty-state">${icon('trophy')}<strong>暂无已注册玩家</strong></div>` : `<table class="ranking-table"><thead><tr><th scope="col">名次</th><th scope="col">玩家</th><th scope="col" class="secondary-metric">${state.metric === 'length' ? '体积 / cm³' : '长度 / cm'}</th><th scope="col" class="secondary-metric">${state.metric === 'diameter' ? '体积 / cm³' : '直径 / cm'}</th><th scope="col">${metricNames[state.metric]} ${state.order === 'desc' ? '↓' : '↑'}</th></tr></thead><tbody>${players.map((player, index) => `<tr class="${player.userId === state.user?.id ? 'mine' : ''}"><td><span class="rank-index${index < 3 ? ` top top-${index + 1}` : ''}">${String(index + 1).padStart(2, '0')}</span></td><td><span class="ranking-user"><span class="avatar">${escapeHtml(player.username.slice(0, 1))}</span><span><span class="rank-name">${escapeHtml(player.username)}${player.userId === state.user?.id ? '<span class="you-tag">我</span>' : ''}</span><span class="rank-mobile-details">长 ${number(player.length)} · 径 ${number(player.diameter)}</span></span></span></td><td class="secondary-metric">${number(metricValue(player, state.metric === 'length' ? 'volume' : 'length'))}</td><td class="secondary-metric">${number(metricValue(player, state.metric === 'diameter' ? 'volume' : 'diameter'))}</td><td><span class="metric-main">${number(metricValue(player, state.metric))}</span><span class="metric-unit">${metricUnit(state.metric)}</span></td></tr>`).join('')}</tbody></table><div class="ranking-bottom"><span>共 ${players.length} 位注册拳手</span><span>按${metricNames[state.metric]}${state.order === 'desc' ? '从大到小' : '从小到大'}排位</span></div>`}</section>`;
}

function authModal() {
  const registering = state.authMode === 'register';
  return `<div class="modal-header"><div><div class="eyebrow">FIGHTER CREDENTIALS</div><h2>${registering ? '注册账号' : '登录'}</h2></div>${closeButton()}</div>${state.authError ? `<div class="form-error" role="alert">${escapeHtml(state.authError)}</div>` : ''}<form id="auth-form"><label class="form-field"><span>用户名（拳台名号）</span><input name="username" autocomplete="username" maxlength="24" minlength="2" required value="${escapeHtml(state.authUsername)}" placeholder="用户名"${disabled(isBusy('auth'))}></label><label class="form-field"><span>密码（通行密钥）</span><input type="password" name="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="6" maxlength="128" required placeholder="至少 6 个字符"${disabled(isBusy('auth'))}></label><button class="button acid wide" type="submit"${disabled(isBusy('auth'))}>${isBusy('auth') ? '请稍候…' : registering ? '注册账号' : '登录'}${icon('arrow')}</button></form><p class="auth-switch">${registering ? '已经有账号？' : '还没有账号？'} <button data-action="auth-switch">${registering ? '登录' : '注册'}</button></p>`;
}

function closeButton() { return `<button class="icon-button" data-action="close-modal" aria-label="关闭窗口"${disabled(isBusy('qte-finish'))}>${icon('close')}</button>`; }

function shopModal() {
  const player = state.player;
  if (!player) return '';
  const owned = new Set(player.owned || []);
  const preview = state.catalog.find(item => item.id === state.shopPreview);
  return `<div class="modal-header"><div><div class="eyebrow">CHAMPIONSHIP PRO SHOP</div><h2>牛子美容院 · 护具与专属流派卡</h2><p class="modal-sub">购买护具消耗体积（长度与直径按立方根同比例缩减）；穿戴任意部位护具还会自动向你的战斗牌组注入一张【👑 护具专属神技卡】！</p></div>${closeButton()}</div><div class="shop-banner">当前可用量级：<strong>${number(volume(player))} cm³</strong> &nbsp;·&nbsp; 装备库收藏：<strong>${owned.size} / ${state.catalog.length}</strong> 款</div>${preview ? `<div class="shop-model-panel"><div class="shop-model anatomy-preview" data-shop-stage></div><div class="shop-preview-caption"><strong>${escapeHtml(preview.name)}</strong><span>${escapeHtml(preview.description || '')}</span></div></div>` : ''}${['a', 'b', 'c'].map(slot => `<section class="shop-group"><h3><span class="slot-tag">${SLOT_LABELS[slot]}</span> <span class="tiny-label">（${state.catalog.filter(item => item.slot === slot).length} 款定制护具）</span></h3><div class="shop-items">${state.catalog.filter(item => item.slot === slot).map(item => {
    const hasItem = owned.has(item.id);
    const equipped = player.equipped?.[slot] === item.id;
    const cosCard = getCardTemplate(`cos:${item.id}`);
    return `<article class="shop-item${equipped ? ' is-equipped' : ''}"><div class="shop-preview" aria-hidden="true">${cosmeticThumbnail(slot, item.id, colorsOf(player)[slot])}</div><strong>${escapeHtml(item.name)}</strong><p class="shop-desc">${escapeHtml(item.description || '')}${cosCard ? `<br><strong style="color:#6b2fa8">解锁卡牌：【${escapeHtml(cosCard.name)}】</strong>` : ''}</p><span class="price">${number(item.price ?? 10, 0)} <span class="muted">cm³</span></span><button class="button text small" data-action="preview-cosmetic" data-id="${escapeHtml(item.id)}" aria-label="预览${escapeHtml(item.name)}" aria-pressed="${state.shopPreview === item.id}">预览</button><button class="button${hasItem ? ' outline' : ' acid'}" data-action="${hasItem ? 'equip' : 'purchase'}" data-id="${escapeHtml(item.id)}" data-slot="${slot}"${disabled(equipped || anyGameBusy() || (!hasItem && volume(player) <= Number(item.price ?? 10)))}>${equipped ? '已装备' : hasItem ? '装备' : isBusy('purchase') ? '处理中…' : '购买'}</button></article>`;
  }).join('')}</div></section>`).join('')}${!state.catalog.length ? '<div class="empty-state">装饰目录暂未加载，请稍后重新打开。</div>' : ''}`;
}

function deckModal() {
  const player = state.player || { length: 12, diameter: 3.5 };
  const dummyFighter = { stats: deriveCombatStats(player), block: 0, strength: 0, weak: 0 };
  const fullDeck = buildPlayerDeck(state.player, state.draftedCards);
  return `<div class="modal-header"><div><div class="eyebrow">ROGUELIKE DECK INSPECTOR</div><h2>我的肉鸽战斗牌组（共 ${fullDeck.length} 张）</h2><p class="modal-sub">包含基础招式、已穿戴护具专属卡（👑）以及连胜三选一收入的肉鸽战利品卡。</p></div>${closeButton()}</div><div class="shop-banner">当前连胜：<strong>🔥 ${state.winStreak} 场</strong> &nbsp;·&nbsp; 已构筑战利品卡：<strong>${state.draftedCards.length} 张</strong> ${state.draftedCards.length ? `<button class="button text small" data-action="reset-run-deck" style="margin-left:10px">重置战利品卡</button>` : ''}</div><div class="deck-grid-view">${fullDeck.map(entry => {
    const { desc, tpl } = evaluateCardNumbers(entry.cardId, dummyFighter, null);
    if (!tpl) return '';
    const typeInfo = CARD_TYPES[tpl.type] || CARD_TYPES.attack;
    return `<div class="sts-card deck-view-card type-${tpl.type}"><div class="sts-card-top"><span class="sts-cost">${tpl.cost}</span><span class="sts-type-tag">${typeInfo.badge}</span></div><strong class="sts-card-title">${escapeHtml(tpl.name)}</strong><p class="sts-card-desc">${escapeHtml(desc)}</p></div>`;
  }).join('')}</div>`;
}

function qteModal() {
  const qte = state.qte;
  const result = state.qteResult;
  const top = `<div class="modal-header"><div><div class="eyebrow">HEAVY BAG POWER METER</div><h2>打胶</h2></div>${closeButton()}</div>`;
  if (result) {
    const change = (Number(result.volumeMultiplier) - 1) * 100;
    const stages = result.stages || [];
    const mood = qteFeedback(result.score);
    const tone = qteMoodTone(result.score);
    return `${top}<div class="qte-score"><strong>${number(result.score, 0)}</strong><span>分</span></div><p class="qte-verdict ${tone}">${escapeHtml(mood)}</p><div class="qte-breakdown">${[0, 1, 2].map(index => `<div>第 ${index + 1} 段<strong>${number(typeof stages[index] === 'number' ? stages[index] : stages[index]?.score ?? stages[index]?.points ?? 0, 0)}</strong></div>`).join('')}</div><div class="shop-banner"><strong class="${change >= 0 ? 'delta-positive' : 'delta-negative'}">体积 ${change >= 0 ? '+' : ''}${number(change)}%</strong><br>${number(result.volumeBefore)} → ${number(result.volumeAfter)} cm³</div><button class="button acid wide" data-action="qte-start"${disabled(anyGameBusy())}>${isBusy('qte-start') ? '准备中…' : '再试一次'}${icon('arrow')}</button>`;
  }
  if (!qte) return `${top}<p class="qte-intro">测力指针从上往下高速滑落，每回合出拳按一次；正中中央 6% 黄金靶心得分翻倍！</p><div class="shop-banner">第 1／2／3 回合基础分：<strong>20／30／50 分</strong><br>绿色 20% 靶区：全额得分 · 中央 6% 黄金区：双倍暴击<br>两侧各 10% 灰色缓冲带：半分 · 红色失误区：0 分<br>最终体积变化 =（总分 − 60）÷ 5 %</div><p class="qte-intro">支持鼠标点击、触屏拍击或键盘空格键；未出手回合记 0 分。</p><button class="button acid wide" data-action="qte-start"${disabled(anyGameBusy())}>${isBusy('qte-start') ? '准备中…' : '开始'}${icon('arrow')}</button>`;
  if (qte.submitted) return `${top}${qte.finishError ? `<p class="notice">${escapeHtml(qte.finishError)}</p><button class="button acid wide" data-action="${qte.restartAllowed ? 'qte-start' : 'qte-retry'}"${disabled(anyGameBusy())}>${qte.restartAllowed ? '重新开始' : '重试结算'}</button>` : '<div class="empty-state"><span class="loading-dot"></span><strong>测力机结算中…</strong></div>'}`;
  return `${top}<p class="qte-intro">瞄准绿色靶区重拳按下！命中中央高亮区触发双倍暴击。</p><div class="qte-live"><div class="qte-track" id="qte-track" aria-hidden="true"><div class="qte-zone gray" id="qte-gray"></div><div class="qte-zone green" id="qte-green"></div><div class="qte-zone center" id="qte-center"></div><div class="qte-pointer" id="qte-pointer"></div></div><div class="qte-controls"><p class="qte-stage-number" id="qte-number">01<span class="muted" style="font-size:20px"> / 03</span></p><p class="qte-stage-label" id="qte-label">第 1 段 · 20 分</p><button class="button acid" id="qte-hit" data-action="qte-hit">现在按下</button><p class="small-copy muted" id="qte-feedback" aria-live="polite" style="margin-top:12px">点击按钮 / 按空格</p><div class="qte-progress"><span id="qte-progress"></span></div><div class="qte-stage-dots" id="qte-stage-dots"><span></span><span></span><span></span></div></div></div>`;
}

function rulesModal() {
  return `<div class="modal-header"><div><div class="eyebrow">WNC OFFICIAL RULEBOOK</div><h2>游戏规则 · 卡牌肉鸽擂台版</h2></div>${closeButton()}</div><ul class="rule-list"><li><strong>三维与面板转化：</strong>体积 = π × 直径² × 长度 ÷ 4。体积决定你的擂台最大充血度（HP）；长度提升刺击/多段类卡牌伤害；直径提升重砸伤害与护盾加成。</li><li><strong>回合制卡牌对决（杀戮尖塔机制）：</strong>每回合恢复 3⚡ 精力并抽 5 张牌。观察蓝角对手头顶的<strong>【意图预告】</strong>合理分配进攻（⚔️）、硬化护盾（🛡️）与蓄力能力（🔥）。</li><li><strong>3D 柔性骨骼动作：</strong>打出不同卡牌时，擂台上的 3D 牛子会实时施展寸劲甩鞭、跃起暴扣、三连疾刺、充血蠕动与受击回弹动画。</li><li><strong>肉鸽牌组构筑 & 护具神技：</strong>每次获胜可从 3 张随机进阶/稀有卡中挑 1 张加入连胜牌组；在美容院穿戴任意部位护具还会自动激活对应的【👑 护具专属卡】。</li><li><strong>真实尺寸掠夺：</strong>击败对手（PVP 或 PVE）后，赢家直接拿走输家 1%–10% 的长度和直径！</li><li><strong>打胶测力机：</strong>三段权重 20／30／50，中央 6% 双倍，绿色 20% 全分，灰色 10% 半分，总分 60 及格，体积变化 =（总分 − 60）÷ 5 %。</li></ul>`;
}

function renderModal() {
  shopGeometryControl?.dispose();
  shopGeometryControl = null;
  ++shopGeometryToken;
  if (!state.modal) {
    if (dialog.open) dialog.close();
    dialog.innerHTML = '';
    return;
  }
  dialog.classList.toggle('large', state.modal === 'shop' || state.modal === 'deck');
  dialog.innerHTML = state.modal === 'auth' ? authModal()
    : state.modal === 'shop' ? shopModal()
    : state.modal === 'deck' ? deckModal()
    : state.modal === 'qte' ? qteModal()
    : rulesModal();
  if (state.modal === 'qte' && state.qte && !state.qte.submitted) state.qte.phase = -1;
  if (!dialog.open) {
    returnFocus = document.activeElement;
    dialog.showModal();
  }
  if (state.modal === 'shop') mountShopPreview();
}

function render() {
  renderNavigation();
  if (!state.ready) return;

  app.innerHTML = state.tab === 'identity' ? renderIdentity() : state.tab === 'arena' ? renderArena() : renderRanking();
  renderModal();
  mountStage();
  mountBattleStage();
}

async function mountStage() {
  geometryControl?.dispose();
  geometryControl = null;
  const token = ++geometryToken;
  const root = $('[data-anatomy]');
  if (!root || !state.player) return;
  try {
    const { mountAnatomy } = await import('/geometry.js');
    if (token !== geometryToken || !root.isConnected) return;
    const control = await mountAnatomy(root, { ...state.player, colors: state.draftColors || colorsOf(state.player) }, { motion: state.motion });
    if (token !== geometryToken || !root.isConnected) control.dispose();
    else {
      geometryControl = control;
      control.setColors(state.draftColors || colorsOf(state.player));
    }
  } catch {
    root.innerHTML = '<div class="empty-state">3D 预览暂不可用，数值与游戏功能仍可正常使用。</div>';
  }
}

function fighterSignature(p) {
  if (!p) return 'none';
  return `${p.userId || p.username}:${Number(p.length).toFixed(2)}:${Number(p.diameter).toFixed(2)}:${JSON.stringify(p.colors)}:${JSON.stringify(p.equipped)}`;
}

async function mountBattleStage() {
  const root = $('[data-battle-stage]');
  if (!root || state.tab !== 'arena') {
    battleControl?.dispose();
    battleControl = null;
    mountedBattleSignature = '';
    return;
  }

  const playerA = state.combat?.fighter?.profile || state.player || {
    userId: 'guest-fighter',
    username: '试训红角拳手',
    length: 12,
    diameter: 3.5,
    colors: DEFAULT_COLORS,
    equipped: {},
  };
  const playerB = getActiveArenaOpponent();
  const sig = `${fighterSignature(playerA)}|${fighterSignature(playerB)}`;

  // 如果对阵双方模型未变且已有存活的 WebGL 实例，直接复用 canvas 节点，保证 60fps 连续动画绝不闪烁重载！
  if (battleControl?.canvas && mountedBattleSignature === sig) {
    if (!root.contains(battleControl.canvas)) {
      root.innerHTML = '';
      root.append(battleControl.canvas);
    }
    battleControl.resize?.();
    sync3DCombatPostures();
    return;
  }

  battleControl?.dispose();
  battleControl = null;
  mountedBattleSignature = sig;
  const token = ++battleToken;
  try {
    const { mountDuel } = await import('/geometry.js');
    if (token !== battleToken || !root.isConnected) return;
    const control = await mountDuel(root, playerA, playerB, {
      animate: Boolean(state.combat),
      winnerId: state.combat?.status === 'victory' ? playerA.userId : state.combat?.status === 'defeat' ? playerB.userId : null,
    });
    if (token !== battleToken || !root.isConnected) {
      control.dispose();
    } else {
      battleControl = control;
      sync3DCombatPostures();
    }
  } catch (err) {
    console.error('mountDuel error:', err);
    root.innerHTML = '<div class="empty-state">3D 擂台暂不可用，卡牌战斗依然有效。</div>';
  }
}

async function mountShopPreview() {
  const token = shopGeometryToken;
  const root = $('[data-shop-stage]', dialog);
  const item = state.catalog.find(entry => entry.id === state.shopPreview);
  if (!root || !item || !state.player) return;
  const profile = { ...state.player, equipped: { ...state.player.equipped, [item.slot]: item.id } };
  try {
    const { mountAnatomy } = await import('/geometry.js');
    if (token !== shopGeometryToken || !root.isConnected) return;
    const control = await mountAnatomy(root, profile, { motion: state.motion });
    if (token !== shopGeometryToken || !root.isConnected) control.dispose();
    else shopGeometryControl = control;
  } catch {
    root.innerHTML = cosmeticThumbnail(item.slot, item.id, colorsOf(profile)[item.slot]);
  }
}

async function loadPlayers() {
  if (state.playersLoading) return;
  state.playersLoading = true;
  if (state.tab === 'arena') render();
  try {
    const data = await api('/api/players');
    state.players = data.players || [];
    state.playersLoaded = true;
    if (!state.players.some(player => player.userId === state.opponentId)) state.opponentId = null;
  } catch (error) { toast(error.message, true); }
  finally {
    state.playersLoading = false;
    if (state.tab === 'arena') render();
  }
}

async function loadRanking() {
  const token = ++rankingRequest;
  state.leaderboardLoading = true;
  if (state.tab === 'ranking') render();
  try {
    const data = await api(`/api/leaderboard?metric=${state.metric}&order=${state.order}`);
    if (token !== rankingRequest) return;
    state.leaderboard = data.players || [];
    state.leaderboardLoaded = true;
  } catch (error) { if (token === rankingRequest) toast(error.message, true); }
  finally {
    if (token === rankingRequest) {
      state.leaderboardLoading = false;
      if (state.tab === 'ranking') render();
    }
  }
}

function openModal(name) {
  if (name === 'shop') state.shopPreview = state.player?.equipped?.a || state.catalog[0]?.id || null;
  state.modal = name;
  renderModal();
}

function closeModal() {
  if (isBusy('qte-finish')) return;
  cancelAnimationFrame(qteFrame);
  if (state.modal === 'qte' && !state.qte?.submitted) {
    state.qte = null;
    state.qteResult = null;
  }
  state.modal = null;
  renderModal();
  if (returnFocus?.isConnected) returnFocus.focus();
}

function startQteLoop() {
  cancelAnimationFrame(qteFrame);
  const qte = state.qte;
  if (!qte) return;
  function tick() {
    if (state.qte !== qte || state.modal !== 'qte' || qte.submitted) return;
    const elapsed = performance.now() - qte.localStarted;
    const duration = Number(qte.durationMs) || 2500;
    if (elapsed >= duration * 3) { finishQte(qte); return; }
    const phase = Math.min(2, Math.floor(elapsed / duration));
    const position = (elapsed - phase * duration) / duration;
    if (qte.phase !== phase) {
      qte.phase = phase;
      const center = Number(qte.centers[phase]);
      for (const [id, halfWidth] of [['gray', .2], ['green', .1], ['center', .03]]) {
        const element = $(`#qte-${id}`);
        if (element) { element.style.top = `${(center - halfWidth) * 100}%`; element.style.height = `${halfWidth * 200}%`; }
      }
      $('#qte-number').innerHTML = `0${phase + 1}<span class="muted" style="font-size:20px"> / 03</span>`;
      $('#qte-label').textContent = `第 ${phase + 1} 段 · ${[20, 30, 50][phase]} 分`;
      $('#qte-hit').disabled = qte.positions[phase] !== null;
      $('#qte-hit').textContent = qte.positions[phase] !== null ? '已记录' : '现在按下';
      $('#qte-feedback').textContent = qte.positions[phase] !== null ? '本段已记录，等下一段' : '点击按钮 / 按空格';
      [...$('#qte-stage-dots').children].forEach((dot, index) => { dot.className = index < phase ? 'done' : index === phase ? 'current' : ''; });
    }
    const pointer = $('#qte-pointer');
    if (pointer) pointer.style.top = `${Math.min(position, .99) * 100}%`;
    const progress = $('#qte-progress');
    if (progress) progress.style.width = `${position * 100}%`;
    qteFrame = requestAnimationFrame(tick);
  }
  qteFrame = requestAnimationFrame(tick);
}

function hitQte() {
  const qte = state.qte;
  if (!qte || qte.submitted) return;
  const duration = Number(qte.durationMs) || 2500;
  const elapsed = performance.now() - qte.localStarted;
  const phase = Math.floor(elapsed / duration);
  if (phase < 0 || phase > 2 || qte.positions[phase] !== null) return;
  qte.positions[phase] = Math.min(1, Math.max(0, (elapsed - phase * duration) / duration));
  const difference = Math.abs(qte.positions[phase] - qte.centers[phase]);
  const multiplier = difference <= .03 + 1e-9 ? 2 : difference <= .1 + 1e-9 ? 1 : difference <= .2 + 1e-9 ? .5 : 0;
  if ($('#qte-hit')) { $('#qte-hit').disabled = true; $('#qte-hit').textContent = '已记录'; }
  if ($('#qte-feedback')) $('#qte-feedback').textContent = `${qteHitFeedback(multiplier)}，等下一段`;
}

async function startQte() {
  if (!state.player || anyGameBusy()) return;
  if (state.qte?.submitted && !state.qte.restartAllowed) { openModal('qte'); return; }
  const ownerId = state.user?.id;
  await pending('qte-start', async isCurrent => {
    const data = await api('/api/qte/start', { requestId: requestId() });
    if (!isCurrent() || state.user?.id !== ownerId) return false;
    state.qteResult = null;
    state.qte = { ...data.qte, positions: [null, null, null], phase: -1, localStarted: performance.now(), submitted: false, ownerId };
    state.modal = 'qte';
  });
  if (state.qte) startQteLoop();
}

async function finishQte(qte) {
  if (!qte || qte !== state.qte || isBusy('qte-finish') || qte.restartAllowed || (qte.submitted && !qte.finishError)) return;
  qte.submitted = true;
  qte.finishError = null;
  qte.finishRequestId ||= requestId();
  cancelAnimationFrame(qteFrame);
  await pending('qte-finish', async () => {
    try {
      const data = await api('/api/qte/finish', { qteId: qte.id, positions: qte.positions, requestId: qte.finishRequestId });
      if (state.qte !== qte || state.user?.id !== qte.ownerId) return;
      setPlayer(data.player);
      state.qteResult = data.result;
      state.qte = null;
    } catch (error) {
      if (state.qte === qte) {
        qte.finishError = error.message;
        qte.restartAllowed = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status) && error.code !== 'QTE_TOO_EARLY';
      }
      throw error;
    }
  });
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'tab') {
    state.tab = button.dataset.tab;
    history.replaceState(null, '', `#${state.tab}`);
    render();
    if (state.tab === 'arena' && !state.playersLoaded) loadPlayers();
    if (state.tab === 'ranking' && !state.leaderboardLoaded) loadRanking();
  } else if (action === 'auth') {
    state.authMode = button.dataset.mode || 'login'; state.authError = ''; openModal('auth');
  } else if (action === 'auth-switch') {
    state.authMode = state.authMode === 'login' ? 'register' : 'login'; state.authError = ''; renderModal();
  } else if (action === 'close-modal') closeModal();
  else if (action === 'logout') {
    await pending('logout', async isCurrent => {
      await api('/api/auth/logout', {});
      if (!isCurrent()) return false;
      changeSession(null, null);
      state.modal = null; state.tab = 'identity';
    }, '已退出账号');
  } else if (action === 'create-player') {
    await pending('create', async isCurrent => { const data = await api('/api/player/create', { requestId: requestId() }); if (!isCurrent()) return false; setPlayer(data.player); }, '牛子已注册，恭喜你成为有牛一族');
  } else if (action === 'motion') {
    state.motion = !state.motion;
    geometryControl?.setMotion(state.motion);
    button.textContent = state.motion ? 'Ⅱ 暂停旋转' : '▷ 开始旋转';
    button.setAttribute('aria-pressed', state.motion);
  } else if (action === 'test-anim') {
    geometryControl?.triggerAction(button.dataset.anim || 'jab');
  } else if (action === 'ring-anim') {
    const side = button.dataset.side || 'a';
    const anim = button.dataset.anim || 'jab';
    const targetSide = side === 'a' ? 'b' : 'a';
    battleControl?.triggerAction(side, anim);
    if (anim === 'heavy') {
      spawnFloater(targetSide, '-28 💥暴击', 'crit', 290);
      triggerStageImpact(targetSide, 'heavy', 290);
    } else if (anim === 'flurry') {
      spawnFloater(targetSide, '-9 💥', 'damage', 180);
      spawnFloater(targetSide, '-9 💥', 'damage', 330);
      spawnFloater(targetSide, '-11 💥暴击', 'crit', 480);
      triggerStageImpact(targetSide, 'normal', 220);
    } else if (anim === 'buff') {
      spawnFloater(side, '💪 刚猛 +3', 'buff', 120);
      triggerStageImpact(side, 'light', 120);
    } else {
      spawnFloater(targetSide, '-14 💥', 'damage', 190);
      triggerStageImpact(targetSide, 'normal', 190);
    }
  } else if (action === 'shop') openModal('shop');
  else if (action === 'deck-modal') openModal('deck');
  else if (action === 'reset-run-deck') {
    state.draftedCards = [];
    saveRunDeck();
    renderModal();
    toast('已重置连胜战利品卡，恢复精简初始套牌');
  } else if (action === 'preview-cosmetic') {
    state.shopPreview = button.dataset.id;
    renderModal();
    dialog.scrollTop = 0;
  } else if (action === 'rules') openModal('rules');
  else if (action === 'purchase') {
    await pending('purchase', async isCurrent => { const data = await api('/api/appearance/purchase', { itemId: button.dataset.id, requestId: requestId() }); if (!isCurrent()) return false; setPlayer(data.player); }, '购买成功，长度和直径一起缩了');
  } else if (action === 'equip') {
    await pending('equip', async isCurrent => { const data = await api('/api/appearance/equip', { slot: button.dataset.slot, itemId: button.dataset.id, requestId: requestId() }); if (!isCurrent()) return false; setPlayer(data.player); }, '护具装备成功，专属卡牌已注入牌组！');
  } else if (action === 'select-opponent') {
    state.opponentId = state.opponentId === button.dataset.id ? null : button.dataset.id;
    render();
  } else if (action === 'reroll-pve') {
    state.opponentId = null;
    state.pvePreviewOpponent = createPreviewOpponent(state.player);
    render();
    setTimeout(() => battleControl?.triggerAction('b', 'buff'), 100);
  } else if (action === 'start-pve-combat' || action === 'pve') {
    state.opponentId = null;
    state.pvePreviewOpponent = createPreviewOpponent(state.player);
    startCardCombat('pve');
  } else if (action === 'start-pvp-combat' || action === 'pvp') {
    startCardCombat('pvp');
  } else if (action === 'play-card') {
    playHandCard(button.dataset.uid);
  } else if (action === 'combat-end-turn') {
    endPlayerTurn();
  } else if (action === 'pick-reward') {
    const cardId = button.dataset.card;
    if (cardId && state.combat && !state.combat.rewardPicked) {
      state.draftedCards.push(cardId);
      state.combat.rewardPicked = true;
      saveRunDeck();
      const tpl = getCardTemplate(cardId);
      toast(`🃏 已将【${tpl?.name || '新卡牌'}】收入你的肉鸽牌组！`);
      render();
    }
  } else if (action === 'skip-reward') {
    if (state.combat) {
      state.combat.rewardPicked = true;
      render();
    }
  } else if (action === 'exit-combat') {
    state.combat = null;
    render();
  } else if (action === 'metric') { state.metric = button.dataset.metric; loadRanking(); }
  else if (action === 'order') { state.order = state.order === 'desc' ? 'asc' : 'desc'; loadRanking(); }
  else if (action === 'refresh-ranking') loadRanking();
  else if (action === 'qte-open') { if (!state.qte?.submitted) state.qteResult = null; openModal('qte'); }
  else if (action === 'qte-start') startQte();
  else if (action === 'qte-retry') finishQte(state.qte);
  else if (action === 'qte-hit') hitQte();
});

document.addEventListener('input', event => {
  if (event.target.id === 'opponent-search') {
    state.search = event.target.value;
    $('#opponent-list').innerHTML = opponentRows();
  }
  if (event.target.closest('#colors-form') && event.target.type === 'color') {
    state.draftColors = { ...(state.draftColors || colorsOf(state.player)), [event.target.name]: event.target.value };
    geometryControl?.setColors(state.draftColors);
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'auth-form') {
    event.preventDefault();
    if (isBusy('auth')) return;
    const fields = new FormData(event.target);
    const username = String(fields.get('username') || '').trim();
    const password = String(fields.get('password') || '');
    state.authUsername = username;
    state.authError = '';
    state.pending.add('auth');
    const epoch = sessionEpoch;
    renderModal();
    try {
      const data = await api(`/api/auth/${state.authMode}`, { username, password }, { allowUnauthorized: true });
      if (epoch !== sessionEpoch) return;
      changeSession(data.user, data.player);
      state.modal = null;
      toast(state.authMode === 'register' ? '账号已注册' : '登录成功');
      if (state.tab === 'arena') loadPlayers();
      if (state.tab === 'ranking') loadRanking();
    } catch (error) { if (epoch === sessionEpoch) state.authError = error.message; }
    finally { if (epoch === sessionEpoch) state.pending.delete('auth'); render(); }
  } else if (event.target.id === 'colors-form') {
    event.preventDefault();
    const fields = new FormData(event.target);
    const colors = Object.fromEntries(['a', 'b', 'c'].map(slot => [slot, fields.get(slot)]));
    await pending('colors', async isCurrent => { const data = await api('/api/appearance/colors', { colors, requestId: requestId() }); if (!isCurrent()) return false; setPlayer(data.player); }, '颜色已保存');
  }
});

document.addEventListener('keydown', event => {
  if (event.code === 'Space' && state.modal === 'qte' && state.qte && !state.qte.submitted && !event.repeat) {
    event.preventDefault(); hitQte();
  }
});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal();
});
window.addEventListener('hashchange', () => {
  const tab = location.hash.slice(1);
  if (!['identity', 'arena', 'ranking'].includes(tab) || tab === state.tab) return;
  state.tab = tab;
  render();
  if (tab === 'arena' && !state.playersLoaded) loadPlayers();
  if (tab === 'ranking' && !state.leaderboardLoaded) loadRanking();
});

async function initialize() {
  const epoch = sessionEpoch;
  const requestedTab = location.hash.slice(1);
  if (['identity', 'arena', 'ranking'].includes(requestedTab)) state.tab = requestedTab;
  renderNavigation();
  const outcomes = await Promise.allSettled([
    api('/api/config'),
    api('/api/me', undefined, { allowUnauthorized: true })
  ]);
  if (outcomes[0].status === 'fulfilled') {
    state.rules = outcomes[0].value.rules || {};
    state.catalog = outcomes[0].value.catalog || [];
  } else toast(outcomes[0].reason.message, true);
  if (outcomes[1].status === 'fulfilled' && epoch === sessionEpoch) {
    changeSession(outcomes[1].value.user || null, outcomes[1].value.player);
  } else if (outcomes[1].status === 'rejected' && epoch === sessionEpoch && outcomes[1].reason.status !== 401) toast(outcomes[1].reason.message, true);
  state.ready = true;
  render();
  if (state.tab === 'arena') loadPlayers();
  if (state.tab === 'ranking') loadRanking();
}

initialize();
