// 연습용 봇 — 사람 플레이어와 똑같이 viewFor(자기 시야)만 보고 판단한다(남의 손패·미공개 역할을 엿보지 않음).
// 한 번 부를 때 행동 하나를 돌려준다. 서버가 이 행동을 사람의 요청과 같은 act() 로 검증해 처리한다.
import { viewFor } from './engine.js';
import { ROLES, ROLE_BY_ID, DISTRICT_BY_ID, COMPLETE_CITY } from '../public/shared/data.js';

const defOf = c => DISTRICT_BY_ID[c.split('#')[0]];
export const BOT_NAMES = ['봇 아델', '봇 브란', '봇 세린', '봇 도윈', '봇 에다', '봇 펠릭', '봇 그웬', '봇 하롤'];
export const isBot = id => typeof id === 'string' && id.startsWith('bot_');

const pickOne = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

function costFor(me, card) {
  const d = defOf(card);
  const f = me.city.some(c => c.startsWith('factory#'));
  return d.type === 'unique' && d.id !== 'factory' && f ? Math.max(0, d.cost - 1) : d.cost;
}
function buildable(me, hand, card) {
  const d = defOf(card);
  if (me.city.some(c => c.startsWith(d.id + '#')) && !me.city.some(c => c.startsWith('quarry#'))) return false;
  return true;
}

export function botAction(g, pid, rnd = Math.random) {
  return botFromView(viewFor(g, pid), pid, rnd);
}

// 플레이어 시야(view)만으로 다음 행동을 고른다
export function botFromView(v, pid, rnd = Math.random) {
  const me = v.players.find(p => p.id === pid);
  const hand = v.me.hand;

  // ── 역할 고르기 ──
  if (v.phase === 'selection') {
    const opts = v.selection.options || [];
    const count = t => me.city.filter(c => defOf(c).type === t || defOf(c).id === 'school_of_magic').length;
    const richest = Math.max(...v.players.filter(p => p.id !== pid).map(p => p.gold));
    const leaderCity = Math.max(...v.players.filter(p => p.id !== pid).map(p => p.city.length));
    const affordable = hand.filter(c => buildable(me, hand, c) && costFor(me, c) <= me.gold + 2).length;
    const score = {
      assassin: 1.3 + (leaderCity >= 5 ? 0.6 : 0),
      thief: 1.0 + (richest >= 4 ? 1 : 0),
      magician: hand.length === 0 ? 2.6 : affordable === 0 ? 1.6 : 0.6,
      king: 1.2 + count('noble') * 0.8,
      bishop: 0.9 + count('religious') * 0.8 + (me.city.length >= 5 ? 0.6 : 0),
      merchant: 1.4 + count('trade') * 0.8,
      architect: (hand.length >= 2 && me.gold >= 3 ? 2.2 : 0.8),
      warlord: 0.9 + count('military') * 0.8 + (leaderCity >= 6 ? 0.8 : 0),
    };
    let best = opts[0], bs = -1;
    for (const o of opts) { const s = (score[o] || 1) + rnd() * 0.9; if (s > bs) { bs = s; best = o; } }
    return { type: 'pick', role: best };
  }

  const t = v.turn;
  if (!t || t.pid !== pid) return null;
  const role = ROLE_BY_ID[t.role];

  if (t.pendingDraw) {
    const scoreCard = c => (buildable(me, hand, c) ? 10 : 0) + (costFor(me, c) <= me.gold + 2 ? defOf(c).cost : -defOf(c).cost);
    const keep = [...t.pendingDraw].sort((a, b) => scoreCard(b) - scoreCard(a))[0];
    return { type: 'keep', card: keep };
  }

  // 역할 능력(대상 지목형)은 먼저
  const faceUp = v.faceUp || [];
  if (!t.used.power) {
    if (t.role === 'assassin') {
      const cand = ROLES.filter(r => r.id !== 'assassin' && !faceUp.includes(r.id)).map(r => r.id);
      const pref = cand.filter(r => ['architect', 'merchant', 'king', 'warlord'].includes(r));
      return { type: 'assassinate', role: pickOne(pref.length && rnd() < 0.7 ? pref : cand, rnd) };
    }
    if (t.role === 'thief') {
      const cand = ROLES.filter(r => !['assassin', 'thief'].includes(r.id) && r.id !== v.killed && !faceUp.includes(r.id)).map(r => r.id);
      const pref = cand.filter(r => ['merchant', 'king', 'architect', 'bishop'].includes(r));
      if (cand.length) return { type: 'steal', role: pickOne(pref.length && rnd() < 0.7 ? pref : cand, rnd) };
    }
    if (t.role === 'magician') {
      const others = v.players.filter(p => p.id !== pid).sort((a, b) => b.handCount - a.handCount);
      const junk = hand.filter(c => !buildable(me, hand, c) || defOf(c).cost > me.gold + 4);
      if (others[0] && others[0].handCount > hand.length + 1) return { type: 'magic_swap', target: others[0].id };
      if (junk.length) return { type: 'magic_redraw', cards: junk };
    }
  }

  if (t.role === 'merchant' && !t.used.extra) return { type: 'merchant_extra' };
  if (t.role === 'architect' && !t.used.extra) return { type: 'architect_draw' };

  if (!t.gathered) {
    const cheapest = Math.min(...hand.filter(c => buildable(me, hand, c)).map(c => costFor(me, c)), 99);
    const wantCards = hand.length === 0 || (cheapest === 99) || (hand.length < 2 && me.gold >= cheapest + 1);
    return { type: wantCards ? 'gather_cards' : 'gather_gold' };
  }

  // 연구소: 지을 수 없는 카드를 금화로
  if (me.city.some(c => c.startsWith('laboratory#')) && !t.used.lab) {
    const junk = hand.find(c => !buildable(me, hand, c));
    if (junk) return { type: 'lab', card: junk };
  }

  // 건설: 짓고 싶은 카드가 수입 종류와 같으면 짓고 나서 수입, 아니면 수입 먼저
  const options = hand.filter(c => buildable(me, hand, c)).sort((a, b) => defOf(b).cost - defOf(a).cost);
  const incomeLeft = role.income && !t.used.income;
  const incomeNow = incomeLeft ? me.city.filter(c => defOf(c).type === role.income || defOf(c).id === 'school_of_magic').length : 0;
  if (t.built < t.limit) {
    for (const c of options) {
      const cost = costFor(me, c);
      if (defOf(c).id === 'thieves_den') {
        const spare = hand.filter(x => x !== c && x !== options[1]);
        const short = Math.max(0, cost - me.gold);
        if (short <= spare.length && cost <= me.gold + spare.length) return { type: 'build', card: c, payCards: spare.slice(0, short) };
        continue;
      }
      if (cost <= me.gold) {
        if (incomeLeft && defOf(c).type !== role.income && incomeNow > 0) return { type: 'income' };
        return { type: 'build', card: c };
      }
      if (incomeLeft && cost <= me.gold + incomeNow) return { type: 'income' };
    }
  }
  if (incomeLeft) return { type: 'income' };

  if (t.role === 'warlord' && !t.used.power) {
    const targets = [];
    for (const p of v.players) {
      if (p.id === pid || p.city.length >= COMPLETE_CITY || t.protected === p.id) continue;
      for (const c of p.city) {
        if (defOf(c).id === 'keep') continue;
        const price = Math.max(0, defOf(c).cost - 1);
        if (price <= me.gold && (price <= 1 || p.city.length >= 5)) targets.push({ p, c, w: p.city.length * 2 + defOf(c).cost - price });
      }
    }
    targets.sort((a, b) => b.w - a.w);
    if (targets[0]) return { type: 'destroy', target: targets[0].p.id, card: targets[0].c };
  }

  if (me.city.some(c => c.startsWith('smithy#')) && !t.used.smithy && me.gold >= 4 && hand.length <= 1) return { type: 'smithy' };
  return { type: 'end_turn' };
}
