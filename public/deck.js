// ==========================================================================
// 牛子大王 · 杀戮尖塔式回合制卡牌 + 肉鸽牌组构筑引擎 (Slay the Niuzi Deckbuilder)
// 结合玩家真实尺寸（长度/直径/体积）与穿戴的 18 款美容院护具，动态生成属性与专属流派卡牌。
// ==========================================================================

export const CARD_TYPES = Object.freeze({
  attack: { label: '攻击', color: '#c42828', badge: '⚔️ 攻击' },
  skill:  { label: '技能', color: '#1d569e', badge: '🛡️ 技能' },
  power:  { label: '能力', color: '#b87e11', badge: '🔥 能力' },
  relic:  { label: '护具技', color: '#6b2fa8', badge: '👑 护具专属' },
});

// 基础牌库与肉鸽可构筑卡池
export const CARD_POOL = Object.freeze({
  // ---- 初始基础牌 ----
  'strike-jab': {
    id: 'strike-jab',
    name: '迎面寸劲抽',
    type: 'attack',
    cost: 1,
    rarity: 'starter',
    anim: 'jab',
    baseDamage: 8,
    scaling: 'length',
    desc: '快速甩动顶端抽击对手，造成 {dmg} 点伤害。',
  },
  'strike-heavy': {
    id: 'strike-heavy',
    name: '泰山压顶砸',
    type: 'attack',
    cost: 2,
    rarity: 'starter',
    anim: 'heavy',
    baseDamage: 16,
    scaling: 'diameter',
    weak: 1,
    desc: '跃起全力下劈，造成 {dmg} 点重击伤害，并令对手【萎靡】1 回合（攻击力 -25%）。',
  },
  'guard-harden': {
    id: 'guard-harden',
    name: '海绵体硬化',
    type: 'skill',
    cost: 1,
    rarity: 'starter',
    anim: 'guard',
    baseBlock: 8,
    scaling: 'diameter',
    desc: '瞬间充血硬化表皮，获得 {blk} 点护盾。',
  },
  'skill-edge': {
    id: 'skill-edge',
    name: '寸止蓄力',
    type: 'skill',
    cost: 0,
    rarity: 'starter',
    anim: 'buff',
    energyGain: 1,
    draw: 1,
    strength: 1,
    desc: '屏息寸止引而不发：本回合获得 +1⚡ 精力，【刚猛】+1，并抽 1 张牌。',
  },

  // ---- 肉鸽进阶卡池 (普通 / 罕见 / 稀有) ----
  'flurry-whip': {
    id: 'flurry-whip',
    name: '疾风乱披风',
    type: 'attack',
    cost: 1,
    rarity: 'common',
    anim: 'flurry',
    baseDamage: 4,
    hits: 3,
    scaling: 'length',
    desc: '化作残影连续抽打 3 次，每次造成 {dmg} 点伤害（受【刚猛】与长度加成 3 次）。',
  },
  'armor-break': {
    id: 'armor-break',
    name: '破防顶心杵',
    type: 'attack',
    cost: 1,
    rarity: 'common',
    anim: 'jab',
    baseDamage: 7,
    vulnerable: 2,
    scaling: 'diameter',
    desc: '直捣黄龙震碎防线，造成 {dmg} 点伤害，施加 2 层【破绽】（受击伤害 +50%）。',
  },
  'iron-bell': {
    id: 'iron-bell',
    name: '金钟缩阳功',
    type: 'skill',
    cost: 2,
    rarity: 'uncommon',
    anim: 'guard',
    baseBlock: 16,
    retainBlock: 1,
    scaling: 'diameter',
    desc: '收缩蓄势固若金汤，获得 {blk} 点护盾，且下回合开始时护盾不会清空。',
  },
  'taunt-shake': {
    id: 'taunt-shake',
    name: '威慑螺旋抖',
    type: 'skill',
    cost: 1,
    rarity: 'common',
    anim: 'buff',
    baseBlock: 6,
    vulnerable: 1,
    weak: 1,
    desc: '霸气抖动震慑全场，获得 {blk} 点护盾，令对手同时陷入 1 层【破绽】与 1 层【萎靡】。',
  },
  'body-slam': {
    id: 'body-slam',
    name: '吨位全身撞',
    type: 'attack',
    cost: 1,
    rarity: 'uncommon',
    anim: 'heavy',
    baseDamage: 5,
    damageFromBlock: true,
    desc: '以当前护盾值化为吨位重砸，造成 {dmg}（+当前护盾值）点巨额伤害！',
  },
  'vampire-drain': {
    id: 'vampire-drain',
    name: '精元虹吸缠',
    type: 'attack',
    cost: 2,
    rarity: 'rare',
    anim: 'heavy',
    baseDamage: 12,
    lifesteal: 0.5,
    scaling: 'length',
    desc: '凶狠缠绕汲取元气，造成 {dmg} 点伤害，并恢复 50% 伤害值的充血度(HP)。',
  },
  'overcharge-power': {
    id: 'overcharge-power',
    name: '海绵体超载',
    type: 'power',
    cost: 1,
    rarity: 'uncommon',
    anim: 'buff',
    strength: 3,
    thorns: 2,
    desc: '能力牌：本场战斗永久获得【刚猛】+3 与【倒刺】+2，牛子模型持续充血膨胀！',
  },
  'second-wind': {
    id: 'second-wind',
    name: '深蹲回春术',
    type: 'skill',
    cost: 1,
    rarity: 'uncommon',
    anim: 'buff',
    heal: 10,
    draw: 2,
    desc: '场边紧急深蹲提肛，立即恢复 10 点充血度(HP)，并连抽 2 张牌。',
  },
  'all-out-burst': {
    id: 'all-out-burst',
    name: '破釜沉舟一击',
    type: 'attack',
    cost: 2,
    rarity: 'rare',
    anim: 'heavy',
    baseDamage: 25,
    selfDamage: 4,
    vulnerable: 2,
    scaling: 'diameter',
    desc: '赌上尊严的极限重炮！造成 {dmg} 点毁天灭地伤害并施加 2 层【破绽】，自身反震损失 4 HP。',
  },
  'relentless-combo': {
    id: 'relentless-combo',
    name: '永动连环杵',
    type: 'attack',
    cost: 0,
    rarity: 'rare',
    anim: 'flurry',
    baseDamage: 4,
    hits: 2,
    draw: 1,
    scaling: 'length',
    desc: '0 费神技：快速连戳 2 次各造成 {dmg} 点伤害，并抽 1 张牌。',
  },
});

// 18 款美容院护具对应的专属流派卡牌（穿戴对应护具即自动加入先发牌组！）
export const COSMETIC_CARDS = Object.freeze({
  'a-cone': {
    id: 'cos-a-cone', name: '尖锥破甲钻', type: 'relic', cost: 1, anim: 'jab',
    baseDamage: 11, ignoreBlock: true, vulnerable: 1,
    desc: '【圆锥形专属】无视对手护盾直接贯穿造成 {dmg} 点真实伤害，并施加 1 层【破绽】。',
  },
  'a-sphere': {
    id: 'cos-a-sphere', name: '圆球流星锤', type: 'relic', cost: 1, anim: 'heavy',
    baseDamage: 10, baseBlock: 6,
    desc: '【圆球形专属】攻守兼备的饱满重击，造成 {dmg} 点伤害并获得 {blk} 点护盾。',
  },
  'a-heart': {
    id: 'cos-a-heart', name: '芳心纵火击', type: 'relic', cost: 1, anim: 'buff',
    baseDamage: 8, heal: 8, weak: 2,
    desc: '【爱心形专属】魅惑一击造成 {dmg} 点伤害，恢复 8 点 HP，令对手【萎靡】2 回合。',
  },
  'a-hook': {
    id: 'cos-a-hook', name: '夺命弯钩拉', type: 'relic', cost: 1, anim: 'flurry',
    baseDamage: 6, hits: 2, stealBlock: true, draw: 1,
    desc: '【弯钩形专属】勾拽连击 2 次各造成 {dmg} 点伤害，击碎对手护盾并抽 1 张牌。',
  },
  'a-face': {
    id: 'cos-a-face', name: '人面凝视杀', type: 'relic', cost: 1, anim: 'buff',
    baseBlock: 10, vulnerable: 2, weak: 2,
    desc: '【立体人面专属】深渊对视令对手精神恍惚，获得 {blk} 点护盾并施加 2 层【破绽】与【萎靡】。',
  },
  'a-rocket': {
    id: 'cos-a-rocket', name: '火箭头升空撞', type: 'relic', cost: 2, anim: 'heavy',
    baseDamage: 22, strength: 2,
    desc: '【火箭头专属】点火冲刺造成 {dmg} 点爆破伤害，并永久提升【刚猛】+2！',
  },
  'a-urchin': {
    id: 'cos-a-urchin', name: '海胆千针爆', type: 'relic', cost: 1, anim: 'flurry',
    baseDamage: 4, hits: 3, thorns: 4,
    desc: '【海胆刺球专属】发射 3 波刺针各造成 {dmg} 点伤害，并获得 4 层【倒刺】反伤。',
  },
  'b-spindle': {
    id: 'cos-b-spindle', name: '纺锤卸力旋', type: 'relic', cost: 1, anim: 'guard',
    baseBlock: 13, draw: 2,
    desc: '【纺锤形专属】流体力学卸力，获得 {blk} 点护盾并抽 2 张牌。',
  },
  'b-veins': {
    id: 'cos-b-veins', name: '青筋暴起诀', type: 'relic', cost: 1, anim: 'buff',
    strength: 4, energyGain: 1, heal: 5,
    desc: '【青筋凸起专属】血管怒张战力飙升！【刚猛】+4，恢复 5 HP，本回合 +1⚡ 精力。',
  },
  'b-texture': {
    id: 'cos-b-texture', name: '颗粒摩擦震', type: 'relic', cost: 1, anim: 'flurry',
    baseDamage: 5, hits: 3, weak: 1,
    desc: '【疱疹遍布专属】高频颗粒摩擦 3 次各造成 {dmg} 点伤害，施加 1 层【萎靡】。',
  },
  'b-spikes': {
    id: 'cos-b-spikes', name: '狼牙棒重扫', type: 'relic', cost: 2, anim: 'heavy',
    baseDamage: 18, thorns: 5, vulnerable: 1,
    desc: '【狼牙棒专属】霸道横扫造成 {dmg} 点伤害，获得 5 层【倒刺】并施加 1 层【破绽】。',
  },
  'b-spring': {
    id: 'cos-b-spring', name: '弹簧蓄力弹', type: 'relic', cost: 1, anim: 'flurry',
    baseDamage: 7, hits: 2, energyGain: 1,
    desc: '【弹簧形专属】弹性势能连弹 2 次各造成 {dmg} 点伤害，并返还 +1⚡ 精力！',
  },
  'b-lettering': {
    id: 'cos-b-lettering', name: 'NAMCHIEH 敕令', type: 'relic', cost: 1, anim: 'buff',
    baseDamage: 9, baseBlock: 9, strength: 2,
    desc: '【铭文专属】真名解放！造成 {dmg} 点伤害，获得 {blk} 点护盾，【刚猛】+2。',
  },
  'c-sparse': {
    id: 'cos-c-sparse', name: '清爽疾步闪', type: 'relic', cost: 0, anim: 'guard',
    baseBlock: 7, draw: 2,
    desc: '【黑毛稀疏专属】0 费轻装上阵，获得 {blk} 点护盾并连抽 2 张牌。',
  },
  'c-fluffy': {
    id: 'cos-c-fluffy', name: '绒毛缓冲垫', type: 'relic', cost: 1, anim: 'guard',
    baseBlock: 14, heal: 6,
    desc: '【黑毛茸茸专属】厚实保暖缓冲，获得 {blk} 点护盾并恢复 6 点充血度(HP)。',
  },
  'c-lush': {
    id: 'cos-c-lush', name: '丛林野性咆哮', type: 'relic', cost: 1, anim: 'buff',
    strength: 3, baseBlock: 8, thorns: 3,
    desc: '【黑毛葱茏专属】旺盛生命力爆发！【刚猛】+3，获得 {blk} 点护盾与 3 层【倒刺】。',
  },
  'c-fins': {
    id: 'cos-c-fins', name: '尾翼超音速冲', type: 'relic', cost: 1, anim: 'jab',
    baseDamage: 13, draw: 2,
    desc: '【火箭尾翼专属】气动稳定高速突刺，造成 {dmg} 点伤害并抽 2 张牌。',
  },
  'c-huge': {
    id: 'cos-c-huge', name: '巨物霸体震地', type: 'relic', cost: 2, anim: 'heavy',
    baseDamage: 16, baseBlock: 12, vulnerable: 2,
    desc: '【超级巨大专属】压倒性视觉冲击！造成 {dmg} 点伤害，获得 {blk} 点护盾，施加 2 层【破绽】。',
  },
});

// 根据玩家三维数值计算战斗面板属性
export function deriveCombatStats(player) {
  const length = Number(player?.length) || 12;
  const diameter = Number(player?.diameter) || 3.5;
  const vol = Math.PI * diameter * diameter * length / 4;
  const maxHp = Math.max(60, Math.round(72 + Math.sqrt(vol) * 3.2));
  const lengthBonus = Math.round((length - 10) * 0.45);
  const diameterBonus = Math.round((diameter - 3.0) * 1.6);
  return {
    maxHp,
    lengthBonus: Math.max(-2, lengthBonus),
    diameterBonus: Math.max(-2, diameterBonus),
    volume: vol,
  };
}

// 构筑玩家初始套牌（10 张基础/进阶卡 + 已穿戴护具专属卡 + 肉鸽连胜战利品卡）
export function buildPlayerDeck(player, draftedCardIds = []) {
  const deck = [
    'strike-jab', 'strike-jab', 'strike-jab',
    'strike-heavy',
    'flurry-whip',
    'armor-break',
    'guard-harden', 'guard-harden', 'guard-harden',
    'skill-edge',
  ];
  const equipped = player?.equipped || {};
  for (const slot of ['a', 'b', 'c']) {
    const itemId = equipped[slot];
    if (itemId && COSMETIC_CARDS[itemId]) {
      deck.push(`cos:${itemId}`);
    }
  }
  for (const id of draftedCardIds) {
    if (getCardTemplate(id)) deck.push(id);
  }
  return deck.map((cardId, idx) => ({
    uid: `card-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    cardId,
  }));
}

export function getCardTemplate(cardId) {
  if (typeof cardId === 'string' && cardId.startsWith('cos:')) {
    return COSMETIC_CARDS[cardId.slice(4)] || null;
  }
  return CARD_POOL[cardId] || null;
}

// 计算某张牌在当前战斗状态下的实际伤害与护盾数值
export function evaluateCardNumbers(cardId, attacker, defender) {
  const tpl = getCardTemplate(cardId);
  if (!tpl) return { damage: 0, block: 0, hits: 1, desc: '' };

  let dmg = tpl.baseDamage || 0;
  if (dmg > 0 || tpl.damageFromBlock) {
    if (tpl.scaling === 'length') dmg += attacker.stats.lengthBonus;
    if (tpl.scaling === 'diameter') dmg += attacker.stats.diameterBonus;
    if (tpl.damageFromBlock) dmg += attacker.block;
    dmg += attacker.strength;
    if (attacker.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (defender && defender.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    dmg = Math.max(1, dmg);
  }

  let blk = tpl.baseBlock || 0;
  if (blk > 0) {
    blk += Math.max(0, Math.round(attacker.stats.diameterBonus * 0.8));
    blk = Math.max(1, blk);
  }

  const hits = tpl.hits || 1;
  const desc = (tpl.desc || '')
    .replace('{dmg}', hits > 1 ? `${dmg}×${hits}` : String(dmg))
    .replace('{blk}', String(blk));

  return { damage: dmg, block: blk, hits, desc, tpl };
}

// 生成敌方下一回合的意图（致敬杀戮尖塔头顶意图预告）
export function rollEnemyIntent(enemy, turnNumber = 1) {
  const baseDmg = Math.max(6, Math.round(9 + enemy.stats.lengthBonus * 0.7 + enemy.stats.diameterBonus * 0.8));
  const baseBlk = Math.max(6, Math.round(8 + enemy.stats.diameterBonus));
  const roll = (turnNumber * 37 + Math.floor(Math.random() * 100)) % 5;

  if (roll === 0) {
    return {
      kind: 'attack',
      anim: 'jab',
      title: '迎面猛抽',
      icon: '⚔️',
      damage: baseDmg,
      hits: 1,
      summary: `意图：造成 ${baseDmg + enemy.strength} 点伤害`,
    };
  }
  if (roll === 1) {
    const hitDmg = Math.max(3, Math.round(baseDmg * 0.48));
    return {
      kind: 'multi',
      anim: 'flurry',
      title: '疾风三连抽',
      icon: '💥',
      damage: hitDmg,
      hits: 3,
      summary: `意图：连续攻击 ${hitDmg + enemy.strength} × 3 次`,
    };
  }
  if (roll === 2) {
    return {
      kind: 'defend_buff',
      anim: 'guard',
      title: '海绵体蓄力硬化',
      icon: '🛡️',
      block: baseBlk + 2,
      strength: 2,
      summary: `意图：获得 ${baseBlk + 2} 护盾并提升【刚猛】+2`,
    };
  }
  if (roll === 3) {
    const heavyDmg = Math.round(baseDmg * 1.45);
    return {
      kind: 'heavy_debuff',
      anim: 'heavy',
      title: '破防泰山压顶',
      icon: '🩸',
      damage: heavyDmg,
      hits: 1,
      vulnerable: 1,
      summary: `意图：重击 ${heavyDmg + enemy.strength} 点伤害 + 施加【破绽】`,
    };
  }
  return {
    kind: 'attack_block',
    anim: 'jab',
    title: '攻守兼备顶撞',
    icon: '⚡',
    damage: Math.round(baseDmg * 0.85),
    hits: 1,
    block: Math.round(baseBlk * 0.75),
    summary: `意图：造成 ${Math.round(baseDmg * 0.85) + enemy.strength} 伤害 + ${Math.round(baseBlk * 0.75)} 护盾`,
  };
}

// 肉鸽获胜后随机抽取 3 张战利品卡牌供玩家三选一
export function rollDraftRewards(player) {
  const candidates = [
    'flurry-whip', 'armor-break', 'iron-bell', 'taunt-shake',
    'body-slam', 'vampire-drain', 'overcharge-power', 'second-wind',
    'all-out-burst', 'relentless-combo',
  ];
  // 也可随机刷出稀有护具招式体验卡
  const cosKeys = Object.keys(COSMETIC_CARDS);
  if (cosKeys.length) {
    const randomCos = cosKeys[Math.floor(Math.random() * cosKeys.length)];
    candidates.push(`cos:${randomCos}`);
  }
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}
