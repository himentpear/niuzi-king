// 牛子大王 · 共享文案与配色。
// 这里放客户端和测试都会用到的展示文案，避免 UI 与规则说明各说各话。

export const SLOT_LABELS = Object.freeze({ a: '龟头', b: '茎部', c: '阴囊' });
export const SLOT_HINTS = Object.freeze({ a: '顶端', b: '杆身', c: '底座' });
export const SLOT_ORDER = Object.freeze(['a', 'b', 'c']);

// 默认配色按部位区分：龟头偏粉、茎部偏肉、阴囊偏深。
export const DEFAULT_COLORS = Object.freeze({
  a: '#d98f7d',
  b: '#c08260',
  c: '#7d4f3b',
});

// 用户原设定的打胶结算评语。边界按“90–100 神清气爽、75–90 心满意足”等区间取整。
export function qteFeedback(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return '傻逼你给自己撸废了';
  if (value > 100) return '你已经飘飘欲仙！！！';
  if (value >= 90) return '你现在神清气爽';
  if (value >= 75) return '你现在心满意足';
  if (value >= 60) return '你现在不再那么饥渴';
  if (value >= 40) return '你给自己撸得很疼';
  if (value >= 20) return '你给自己撸破皮了';
  return '傻逼你给自己撸废了';
}

export function qteMoodTone(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 40) return 'bad';
  if (value >= 90) return 'good';
  return '';
}

// 单段命中后的即时反馈，和最终评语分开，避免打胶过程太干。
export function qteHitFeedback(multiplier) {
  if (multiplier === 2) return '正中靶心，双倍';
  if (multiplier === 1) return '绿色命中，稳';
  if (multiplier === 0.5) return '擦到灰区，半分';
  return '红色区域，白给了';
}

export function battleVerdict(draw, winnerName) {
  return draw ? '平局，谁也没占到便宜。' : `${winnerName} 赢了，牛子当场膨胀。`;
}
