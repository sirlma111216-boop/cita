// 시타델 규칙 엔진 — 서버에서만 실행한다. 게임 상태의 최종 판정은 여기서 한다.
// 상태는 JSON 으로 저장할 수 있는 순수 객체이고, act() 는 검증 → 변경 → 이벤트 기록만 한다.
import {
  ROLES, ROLE_BY_ID, ROLE_BY_RANK, DISTRICTS, DISTRICT_BY_ID, DISCARD_TABLE, TYPE_ORDER, DISTRICT_TYPES,
  MIN_PLAYERS, MAX_PLAYERS, COMPLETE_CITY, START_GOLD, START_HAND, josa, nim,
} from '../public/shared/data.js';

// ── 난수 ───────────────────────────────────────────────
export function defaultRng() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── 오류 ───────────────────────────────────────────────
// 오류 메시지는 "왜 안 되는지" + "지금 할 수 있는 것"을 함께 담는다.
export class RuleError extends Error {
  constructor(why, next) { super(why); this.why = why; this.next = next || ''; }
}
const fail = (why, next) => { throw new RuleError(why, next); };

// ── 카드 인스턴스 ──────────────────────────────────────
// 같은 그림을 쓰는 같은 건물 여러 장도 인스턴스 ID 로 구분한다. 예: "manor#3"
export const defOf = cardId => DISTRICT_BY_ID[cardId.split('#')[0]];
const nameOf = cardId => defOf(cardId).ko;
function buildDeck(rng) {
  const deck = [];
  for (const d of DISTRICTS) for (let i = 1; i <= d.count; i++) deck.push(`${d.id}#${i}`);
  return shuffle(deck, rng);
}

// ── 생성 ───────────────────────────────────────────────
// players: [{ id, name }] — 배열 순서가 좌석 순서(왼쪽 방향)다.
export function createGame(players, rng = defaultRng) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS)
    fail(`게임은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이 필요합니다.`, '참가자 수를 맞춘 뒤 다시 시작하세요.');
  const deck = buildDeck(rng);
  const ps = players.map((p, i) => ({
    id: p.id, name: p.name, seat: i, gold: START_GOLD, hand: deck.splice(0, START_HAND), city: [],
  }));
  const g = {
    v: 1, round: 0, phase: 'selection', players: ps, deck,
    crown: Math.floor(rng() * ps.length), // 교실용 변경: 나이 대신 무작위로 첫 왕관 보유자를 정한다
    firstComplete: null, endTriggered: false, log: [], seq: 0, result: null,
  };
  log(g, `게임을 시작합니다. 앱이 무작위로 정한 첫 왕관 보유자는 ${nim(ps[g.crown].name)}입니다.`);
  startRound(g, rng);
  return g;
}

function log(g, text, to) {
  g.seq += 1;
  const e = { n: g.seq, r: g.round, text };
  if (to !== undefined) e.to = to; // 특정 플레이어에게만 보이는 기록
  g.log.push(e);
  if (g.log.length > 400) g.log.splice(0, g.log.length - 400);
}

const P = (g, id) => g.players.find(p => p.id === id);
const idx = (g, id) => g.players.findIndex(p => p.id === id);

// ── 라운드 시작: 역할 제외와 선택 순서 ───────────────────
function startRound(g, rng) {
  g.round += 1;
  g.phase = 'selection';
  const n = g.players.length;
  const t = DISCARD_TABLE[n];
  const pile = shuffle(ROLES.map(r => r.id), rng);
  const faceUp = [];
  // 공개 제외: 왕(4번)이 나오면 다른 카드로 바꾸고 왕은 다시 섞는다
  while (faceUp.length < t.faceUp) {
    const c = pile.shift();
    if (c === 'king') {
      pile.splice(Math.floor(rng() * (pile.length + 1)), 0, c); // 섞어 넣기
      // 왕만 남는 일은 없다(최소 5장이 남음)
      continue;
    }
    faceUp.push(c);
  }
  const faceDown = pile.splice(Math.floor(rng() * pile.length), 1)[0];
  const order = [];
  for (let k = 0; k < n; k++) order.push(g.players[(g.crown + k) % n].id);
  g.sel = { faceUp, faceDown, pool: pile, order, step: 0, chosen: {}, discardedEnd: [] };
  g.turn = null;
  g.killed = null;
  g.robbed = null;
  g.revealed = {}; // roleId -> playerId (호출되어 공개된 역할만)
  g.calledRank = 0;
  log(g, `${g.round}라운드 역할 선택을 시작합니다.` +
    (faceUp.length ? ` 공개 제외: ${faceUp.map(r => ROLE_BY_ID[r].ko).join(', ')}.` : '') +
    ' 비공개 제외 1장.');
}

// 현재 선택자가 고를 수 있는 역할 (7인 마지막 선택 예외 포함)
export function selectableRoles(g) {
  if (g.phase !== 'selection') return [];
  const s = g.sel;
  const n = g.players.length;
  if (n === 7 && s.step === 6) return [...s.pool, s.faceDown];
  return [...s.pool];
}

// ── 행동 처리 ──────────────────────────────────────────
// act(g, playerId, action) → 상태를 직접 바꾼다. 실패하면 RuleError.
export function act(g, pid, a, rng = defaultRng) {
  if (!a || typeof a.type !== 'string') fail('알 수 없는 요청입니다.', '화면을 새로고침해 보세요.');
  if (g.phase === 'ended') fail('게임이 이미 끝났습니다.', '결과 화면에서 점수를 확인하세요.');
  const me = P(g, pid);
  if (!me) fail('이 게임의 플레이어가 아닙니다.', '공개된 도시와 기록은 볼 수 있습니다.');

  if (a.type === 'pick') return pick(g, me, a, rng);
  if (g.phase !== 'turns') fail('지금은 역할 선택 단계입니다.', '역할 선택이 끝날 때까지 기다리세요.');
  const t = g.turn;
  if (!t || t.pid !== pid) {
    const cur = t ? P(g, t.pid) : null;
    fail('지금은 내 차례가 아닙니다.', cur ? `${ROLE_BY_ID[t.role].ko}(${nim(cur.name)})의 행동이 끝나기를 기다리세요. 그동안 도시와 규칙을 살펴볼 수 있습니다.` : '');
  }
  const handler = HANDLERS[a.type];
  if (!handler) fail('알 수 없는 행동입니다.', '화면의 버튼으로 행동해 주세요.');
  if (t.pendingDraw && a.type !== 'keep') fail('뽑은 카드 중 가질 카드를 먼저 골라야 합니다.', '화면에 펼쳐진 카드 중 하나를 고르세요.');
  handler(g, me, t, a, rng);
  g.v += 1;
}

function pick(g, me, a, rng) {
  if (g.phase !== 'selection') fail('지금은 역할을 고르는 단계가 아닙니다.', '행동 단계 안내를 따라 주세요.');
  const s = g.sel;
  if (s.order[s.step] !== me.id) {
    const who = P(g, s.order[s.step]);
    fail('아직 내가 역할을 고를 차례가 아닙니다.', `${nim(who.name)}이 고르는 중입니다. 차례가 오면 선택할 수 있습니다.`);
  }
  const options = selectableRoles(g);
  if (!options.includes(a.role)) fail('그 역할은 지금 고를 수 없습니다.', '화면에 펼쳐진 역할 중 하나를 고르세요.');
  const n = g.players.length;
  if (n === 7 && s.step === 6) {
    // 7번째 플레이어: 남은 1장 + 비공개 제외 1장 중 하나를 고르고 나머지는 비공개로 버린다
    const other = options.find(r => r !== a.role);
    s.pool = [];
    s.faceDown = other;
  } else {
    s.pool = s.pool.filter(r => r !== a.role);
  }
  s.chosen[me.id] = a.role;
  s.step += 1;
  log(g, `${nim(me.name)}이 역할을 골랐습니다.`);
  log(g, `나의 역할: ${ROLE_BY_ID[a.role].ko}`, me.id);
  if (s.step >= n) {
    // 마지막 선택자의 남은 카드는 비공개로 버린다
    s.discardedEnd = s.pool.slice();
    s.pool = [];
    g.phase = 'turns';
    log(g, '역할 선택이 끝났습니다. 왕관 보유자가 1번부터 역할을 호출합니다.');
    g.calledRank = 0;
    callNext(g, rng);
  }
  g.v += 1;
}

const holderOf = (g, role) => {
  for (const [pid, r] of Object.entries(g.sel.chosen)) if (r === role) return pid;
  return null;
};

// 다음 역할 호출. 아무도 없거나 암살당한 역할은 같은 문장으로 넘어간다(소유자를 드러내지 않음).
function callNext(g, rng) {
  while (g.calledRank < 8) {
    g.calledRank += 1;
    const role = ROLE_BY_RANK[g.calledRank];
    const pid = holderOf(g, role.id);
    if (!pid || g.killed === role.id) {
      log(g, `${role.rank}번 ${josa(role.ko, '을를')} 불렀지만 아무도 나서지 않았습니다.`);
      continue;
    }
    beginTurn(g, pid, role.id);
    return;
  }
  endRound(g, rng);
}

function beginTurn(g, pid, roleId) {
  const p = P(g, pid);
  const role = ROLE_BY_ID[roleId];
  g.revealed[roleId] = pid;
  g.turn = {
    pid, role: roleId, gathered: false, pendingDraw: null, built: 0,
    limit: roleId === 'architect' ? 3 : 1,
    used: {}, // income, extra, power(능력), lab, smithy
  };
  log(g, `${role.rank}번 ${role.ko} — ${nim(p.name)}이 역할을 공개했습니다.`);
  // 도둑질: 대상 역할이 공개되는 순간, 자원을 모으기 전에 처리
  if (g.robbed === roleId) {
    const thiefId = holderOf(g, 'thief');
    const thief = thiefId && P(g, thiefId);
    if (thief) {
      const amt = p.gold;
      p.gold = 0; thief.gold += amt;
      log(g, `도둑이 ${nim(p.name)}의 금화 ${amt}개를 모두 가져갔습니다.`);
    }
  }
  // 왕: 공개되는 즉시 왕관을 가져온다 (규칙상 반드시 가져와야 함)
  if (roleId === 'king') takeCrown(g, pid, '왕이 왕관을 가져왔습니다.');
}

function takeCrown(g, pid, msg) {
  const i = idx(g, pid);
  if (g.crown !== i) { g.crown = i; log(g, `${msg} 이제 왕관 보유자는 ${nim(P(g, pid).name)}입니다.`); }
  else log(g, `${msg} ${nim(P(g, pid).name)}이 계속 왕관을 가집니다.`);
}

function endRound(g, rng) {
  g.turn = null;
  // 암살당한 왕: 라운드가 끝날 때 왕의 후계자로서 왕관을 받는다
  if (g.killed === 'king') {
    const kp = holderOf(g, 'king');
    if (kp) {
      g.revealed.king = kp;
      g.kingHeir = kp;
      log(g, `라운드가 끝났습니다. 암살당한 왕은 ${nim(P(g, kp).name)}이었습니다.`);
      takeCrown(g, kp, '왕의 후계자가 왕관을 받습니다.');
    }
  }
  if (g.endTriggered) { finish(g); return; }
  g.kingHeir = null;
  startRound(g, rng);
}

// ── 차례 중 행동 ───────────────────────────────────────
const has = (p, districtId) => p.city.some(c => c.startsWith(districtId + '#'));
const drawN = (g, n) => g.deck.splice(0, n);
const toBottom = (g, cards) => { g.deck.push(...cards); };
function needGathered(t) { if (!t.gathered) fail('먼저 자원을 모아야 합니다.', '금화 2개 받기 또는 카드 2장 보고 1장 고르기 중 하나를 고르세요.'); }

function typeCount(p, type) {
  let n = 0;
  for (const c of p.city) {
    const d = defOf(c);
    if (d.type === type || d.id === 'school_of_magic') n++; // 마법 학교: 수입 능력에서 원하는 종류로 센다
  }
  return n;
}

const HANDLERS = {
  gather_gold(g, me, t) {
    if (t.gathered) fail('이번 차례에는 이미 자원을 모았습니다.', '건설하거나 능력을 쓰거나 차례를 마치세요.');
    me.gold += 2; t.gathered = true;
    log(g, `${nim(me.name)}이 금화 2개를 받았습니다.`);
  },
  gather_cards(g, me, t) {
    if (t.gathered) fail('이번 차례에는 이미 자원을 모았습니다.', '건설하거나 능력을 쓰거나 차례를 마치세요.');
    const drawn = drawN(g, 2);
    t.gathered = true;
    if (drawn.length === 0) { log(g, `${nim(me.name)}이 카드를 뽑으려 했지만 덱이 비어 있습니다.`); return; }
    if (has(me, 'library') || drawn.length === 1) {
      me.hand.push(...drawn);
      log(g, `${nim(me.name)}이 카드 ${drawn.length}장을 뽑아 모두 가졌습니다${drawn.length > 1 ? '(도서관)' : ''}.`);
      log(g, `뽑은 카드: ${drawn.map(nameOf).join(', ')}`, me.id);
      return;
    }
    t.pendingDraw = drawn;
    log(g, `${nim(me.name)}이 카드 2장을 보고 1장을 고르는 중입니다.`);
  },
  keep(g, me, t, a) {
    if (!t.pendingDraw) fail('고를 카드가 없습니다.', '다른 행동을 하세요.');
    if (!t.pendingDraw.includes(a.card)) fail('펼쳐진 카드 중에서 골라야 합니다.', '화면에 펼쳐진 카드 중 하나를 누르세요.');
    me.hand.push(a.card);
    const rest = t.pendingDraw.filter(c => c !== a.card);
    toBottom(g, rest);
    t.pendingDraw = null;
    log(g, `${nim(me.name)}이 카드 1장을 가지고 나머지는 덱 맨 아래로 돌려놓았습니다.`);
    log(g, `가진 카드: ${nameOf(a.card)}`, me.id);
  },
  build(g, me, t, a) {
    needGathered(t);
    if (t.built >= t.limit)
      fail(`이번 차례의 건설 한도(${t.limit}개)를 모두 썼습니다.`, '능력을 쓰거나 차례를 마치세요.');
    const card = a.card;
    if (!me.hand.includes(card)) fail('손패에 없는 카드입니다.', '내 손패에서 지을 건물을 고르세요.');
    const d = defOf(card);
    if (has(me, d.id) && !has(me, 'quarry'))
      fail(`이미 도시에 ${josa(d.ko, '이가')} 있어 같은 건물을 또 지을 수 없습니다.`, '다른 건물을 고르세요. (채석장이 있으면 가능)');
    let cost = d.cost;
    if (d.type === 'unique' && d.id !== 'factory' && has(me, 'factory')) cost = Math.max(0, cost - 1);
    // 도둑 소굴: 비용의 일부 또는 전부를 손패로
    let payCards = [];
    if (Array.isArray(a.payCards) && a.payCards.length) {
      if (d.id !== 'thieves_den') fail('손패로 비용을 낼 수 있는 건물은 도둑 소굴뿐입니다.', '금화로 비용을 내세요.');
      payCards = [...new Set(a.payCards)];
      if (payCards.includes(card)) fail('지으려는 도둑 소굴 자체로는 비용을 낼 수 없습니다.', '다른 손패를 고르세요.');
      if (payCards.some(c => !me.hand.includes(c))) fail('손패에 없는 카드로는 낼 수 없습니다.', '내 손패에서 고르세요.');
      if (payCards.length > cost) fail(`비용(${cost})보다 많은 카드를 낼 수 없습니다.`, `카드를 ${cost}장 이하로 고르세요.`);
    }
    const goldNeed = cost - payCards.length;
    if (me.gold < goldNeed)
      fail(`금화가 부족합니다. ${d.ko}의 비용은 ${cost}이고, 가진 금화는 ${me.gold}개입니다.`,
        '수입 능력을 먼저 쓰거나, 더 싼 건물을 고르거나, 차례를 마치세요.');
    me.gold -= goldNeed;
    me.hand = me.hand.filter(c => c !== card && !payCards.includes(c));
    if (payCards.length) toBottom(g, payCards);
    me.city.push(card);
    t.built += 1;
    log(g, `${nim(me.name)}이 ${josa(d.ko, '을를')} 지었습니다(비용 ${d.cost})` +
      (payCards.length ? ` — 손패 ${payCards.length}장과 금화 ${goldNeed}개를 냈습니다.` : cost !== d.cost ? ` — 공방 덕분에 금화 ${cost}개만 냈습니다.` : '.'));
    if (me.city.length >= COMPLETE_CITY && g.firstComplete === null) {
      g.firstComplete = me.id;
      g.endTriggered = true;
      log(g, `${nim(me.name)}이 처음으로 건물 ${COMPLETE_CITY}개의 도시를 완성했습니다! 이번 라운드가 끝나면 게임이 끝납니다.`);
    }
  },
  income(g, me, t) {
    const role = ROLE_BY_ID[t.role];
    if (!role.income) fail(`${role.ko}에게는 건물 종류별 수입 능력이 없습니다.`, '다른 행동을 하세요.');
    if (t.used.income) fail('이번 차례에 이미 수입을 받았습니다.', '건설하거나 차례를 마치세요.');
    const n = typeCount(me, role.income);
    me.gold += n; t.used.income = true;
    log(g, `${nim(me.name)}이 ${DISTRICT_TYPES[role.income].ko} 건물 수입으로 금화 ${n}개를 받았습니다.`);
  },
  merchant_extra(g, me, t) {
    if (t.role !== 'merchant') fail('상인만 쓸 수 있는 능력입니다.', '');
    if (t.used.extra) fail('이번 차례에 이미 추가 금화를 받았습니다.', '다른 행동을 하세요.');
    me.gold += 1; t.used.extra = true;
    log(g, `${nim(me.name)}(상인)이 추가 금화 1개를 받았습니다.`);
  },
  architect_draw(g, me, t) {
    if (t.role !== 'architect') fail('건축가만 쓸 수 있는 능력입니다.', '');
    if (t.used.extra) fail('이번 차례에 이미 추가 카드를 받았습니다.', '다른 행동을 하세요.');
    const drawn = drawN(g, 2);
    me.hand.push(...drawn); t.used.extra = true;
    log(g, `${nim(me.name)}(건축가)이 건물 카드 ${drawn.length}장을 추가로 받았습니다.`);
    if (drawn.length) log(g, `받은 카드: ${drawn.map(nameOf).join(', ')}`, me.id);
  },
  assassinate(g, me, t, a) {
    if (t.role !== 'assassin') fail('암살자만 쓸 수 있는 능력입니다.', '');
    if (t.used.power) fail('이번 차례에 이미 암살할 역할을 지목했습니다.', '다른 행동을 하세요.');
    const r = ROLE_BY_ID[a.role];
    if (!r || r.id === 'assassin') fail('암살자 자신을 제외한 역할을 지목해야 합니다.', '2번~8번 역할 중 하나를 고르세요.');
    g.killed = r.id; t.used.power = true;
    log(g, `암살자가 ${r.rank}번 ${josa(r.ko, '을를')} 지목했습니다. 그 역할은 이번 라운드 차례를 건너뜁니다.`);
  },
  steal(g, me, t, a) {
    if (t.role !== 'thief') fail('도둑만 쓸 수 있는 능력입니다.', '');
    if (t.used.power) fail('이번 차례에 이미 도둑질할 역할을 지목했습니다.', '다른 행동을 하세요.');
    const r = ROLE_BY_ID[a.role];
    if (!r || r.id === 'assassin' || r.id === 'thief') fail('암살자와 도둑 자신은 지목할 수 없습니다.', '3번~8번 역할 중 하나를 고르세요.');
    if (r.id === g.killed) fail('암살당한 역할은 도둑질할 수 없습니다.', '암살당하지 않은 다른 역할을 고르세요.');
    g.robbed = r.id; t.used.power = true;
    log(g, `도둑이 ${r.rank}번 ${josa(r.ko, '을를')} 지목했습니다. 그 역할이 공개되면 금화를 모두 빼앗깁니다.`);
  },
  magic_swap(g, me, t, a) {
    if (t.role !== 'magician') fail('마술사만 쓸 수 있는 능력입니다.', '');
    if (t.used.power) fail('이번 차례에 이미 마술사 능력을 썼습니다.', '다른 행동을 하세요.');
    const other = P(g, a.target);
    if (!other || other.id === me.id) fail('손패를 바꿀 다른 플레이어를 골라야 합니다.', '다른 플레이어 한 명을 고르세요.');
    [me.hand, other.hand] = [other.hand, me.hand];
    t.used.power = true;
    log(g, `마술사 ${nim(me.name)}이 ${nim(other.name)}과 손패 전체를 맞바꿨습니다. (${me.hand.length}장 ↔ ${other.hand.length}장)`);
  },
  magic_redraw(g, me, t, a) {
    if (t.role !== 'magician') fail('마술사만 쓸 수 있는 능력입니다.', '');
    if (t.used.power) fail('이번 차례에 이미 마술사 능력을 썼습니다.', '다른 행동을 하세요.');
    const cards = [...new Set(Array.isArray(a.cards) ? a.cards : [])];
    if (!cards.length) fail('버릴 카드를 1장 이상 골라야 합니다.', '손패에서 버릴 카드를 고르세요.');
    if (cards.some(c => !me.hand.includes(c))) fail('손패에 없는 카드는 버릴 수 없습니다.', '내 손패에서 고르세요.');
    me.hand = me.hand.filter(c => !cards.includes(c));
    toBottom(g, cards);
    const drawn = drawN(g, cards.length);
    me.hand.push(...drawn);
    t.used.power = true;
    log(g, `마술사 ${nim(me.name)}이 카드 ${cards.length}장을 덱 맨 아래로 버리고 ${drawn.length}장을 새로 뽑았습니다.`);
    log(g, `새로 뽑은 카드: ${drawn.map(nameOf).join(', ')}`, me.id);
  },
  destroy(g, me, t, a) {
    if (t.role !== 'warlord') fail('장군만 쓸 수 있는 능력입니다.', '');
    if (t.used.power) fail('이번 차례에 이미 건물을 파괴했습니다.', '다른 행동을 하세요.');
    const target = P(g, a.target);
    if (!target) fail('대상 플레이어를 찾을 수 없습니다.', '도시를 다시 골라 주세요.');
    if (!target.city.includes(a.card)) fail('그 도시에 없는 건물입니다.', '도시에 지어진 건물을 고르세요.');
    const why = destroyBlock(g, target, a.card);
    if (why) fail(why, '다른 도시나 건물을 고르세요.');
    const d = defOf(a.card);
    const price = Math.max(0, d.cost - 1);
    if (me.gold < price) fail(`금화가 부족합니다. ${josa(d.ko, '을를')} 파괴하려면 금화 ${price}개가 필요하고, 가진 금화는 ${me.gold}개입니다.`, '수입을 먼저 받거나 더 싼 건물을 고르세요.');
    me.gold -= price;
    target.city = target.city.filter(c => c !== a.card);
    toBottom(g, [a.card]);
    t.used.power = true;
    log(g, `장군 ${nim(me.name)}이 금화 ${price}개를 내고 ${nim(target.name)}의 ${josa(d.ko, '을를')} 파괴했습니다. 그 카드는 덱 맨 아래로 돌아갑니다.`);
  },
  lab(g, me, t, a) {
    if (!has(me, 'laboratory')) fail('도시에 연구소가 없습니다.', '');
    if (t.used.lab) fail('연구소는 차례마다 한 번만 쓸 수 있습니다.', '다른 행동을 하세요.');
    if (!me.hand.includes(a.card)) fail('손패에 있는 카드 1장을 골라야 합니다.', '버릴 카드를 고르세요.');
    me.hand = me.hand.filter(c => c !== a.card);
    toBottom(g, [a.card]);
    me.gold += 2; t.used.lab = true;
    log(g, `${nim(me.name)}이 연구소에서 카드 1장을 버리고 금화 2개를 받았습니다.`);
  },
  smithy(g, me, t) {
    if (!has(me, 'smithy')) fail('도시에 대장간이 없습니다.', '');
    if (t.used.smithy) fail('대장간은 차례마다 한 번만 쓸 수 있습니다.', '다른 행동을 하세요.');
    if (me.gold < 2) fail(`금화가 부족합니다. 대장간은 금화 2개가 필요하고, 가진 금화는 ${me.gold}개입니다.`, '다른 행동을 하세요.');
    me.gold -= 2;
    const drawn = drawN(g, 3);
    me.hand.push(...drawn); t.used.smithy = true;
    log(g, `${nim(me.name)}이 대장간에서 금화 2개를 내고 카드 ${drawn.length}장을 뽑았습니다.`);
    if (drawn.length) log(g, `뽑은 카드: ${drawn.map(nameOf).join(', ')}`, me.id);
  },
  end_turn(g, me, t, a, rng) {
    needGathered(t);
    log(g, `${nim(me.name)}(${ROLE_BY_ID[t.role].ko})이 차례를 마쳤습니다.`);
    g.turn = null;
    callNext(g, rng);
  },
};

// 시험용: 역할을 직접 정해 행동 단계로 넘어간다
export function __forceRoles(g, map, rng = defaultRng) {
  g.sel.chosen = { ...map };
  g.sel.step = g.players.length;
  g.sel.pool = [];
  g.phase = 'turns';
  g.calledRank = 0;
  callNext(g, rng);
}

// 장군이 파괴할 수 없는 이유 (없으면 null)
export function destroyBlock(g, target, card) {
  if (target.city.length >= COMPLETE_CITY) return `${nim(target.name)}의 도시는 완성되어(건물 ${COMPLETE_CITY}개 이상) 파괴할 수 없습니다.`;
  const bishopPid = g.revealed.bishop;
  if (bishopPid === target.id && g.killed !== 'bishop') return `${nim(target.name)}은 이번 라운드의 주교라서 장군의 능력으로부터 보호받습니다.`;
  if (defOf(card).id === 'keep') return '아성은 장군이 파괴할 수 없습니다.';
  return null;
}

// ── 종료와 점수 ────────────────────────────────────────
export function scorePlayer(g, p) {
  const ids = p.city.map(c => defOf(c).id);
  const base = p.city.reduce((s, c) => s + defOf(c).cost, 0);
  const complete = p.city.length >= COMPLETE_CITY;
  const first = g.firstComplete === p.id;
  const hasCrown = g.players[g.crown].id === p.id;
  const haunted = ids.includes('haunted_quarter');
  const options = haunted ? ['unique', ...TYPE_ORDER.filter(x => x !== 'unique')] : [null];
  let best = null;
  for (const hq of options) {
    const types = new Set();
    let uniques = 0;
    for (const id of ids) {
      const d = DISTRICT_BY_ID[id];
      const tp = id === 'haunted_quarter' ? hq : d.type;
      types.add(tp);
      if (tp === 'unique') uniques++;
    }
    const items = [{ key: 'base', label: '건물 비용 합계', pts: base, why: p.city.map(c => `${nameOf(c)} ${defOf(c).cost}`).join(' + ') || '건물 없음' }];
    const allTypes = TYPE_ORDER.every(x => types.has(x));
    items.push({ key: 'types', label: '5종류 완성 보너스', pts: allTypes ? 3 : 0,
      why: allTypes ? '귀족·종교·상업·군사·특수를 모두 갖춤' + (haunted && hq !== 'unique' ? ` (유령 구역을 ${josa(DISTRICT_TYPES[hq].ko, '로')} 셈)` : '')
        : '없는 종류: ' + TYPE_ORDER.filter(x => !types.has(x)).map(x => DISTRICT_TYPES[x].ko).join(', ') });
    items.push({ key: 'first', label: '최초 도시 완성', pts: first ? 4 : 0, why: first ? '가장 먼저 건물 7개를 완성' : '해당 없음' });
    items.push({ key: 'complete', label: '도시 완성(최초 아님)', pts: complete && !first ? 2 : 0, why: complete && !first ? '게임 종료 시 건물 7개 이상' : '해당 없음' });
    const extras = [];
    if (ids.includes('dragon_gate')) extras.push({ label: '용의 문', pts: 2, why: '추가 2점' });
    if (ids.includes('imperial_treasury')) extras.push({ label: '황실 보물고', pts: p.gold, why: `남은 금화 ${p.gold}개` });
    if (ids.includes('map_room')) extras.push({ label: '지도의 방', pts: p.hand.length, why: `남은 손패 ${p.hand.length}장` });
    if (ids.includes('statue')) extras.push({ label: '조각상', pts: hasCrown ? 5 : 0, why: hasCrown ? '게임 종료 시 왕관 보유' : '왕관이 없음' });
    if (ids.includes('wishing_well')) extras.push({ label: '소원의 우물', pts: uniques, why: `특수 건물 ${uniques}개` + (haunted && hq !== 'unique' ? ' (특수로 세지 않은 유령 구역 제외)' : '') });
    for (const e of extras) items.push({ key: 'unique', ...e, label: '특수 건물: ' + e.label });
    const total = items.reduce((s, x) => s + x.pts, 0);
    if (!best || total > best.total) best = { total, items, hauntedAs: hq };
  }
  return best;
}

function finish(g) {
  g.phase = 'ended';
  g.turn = null;
  const rankOf = pid => {
    // 동점 판정: 마지막 라운드에 공개한 역할의 순위. 암살당해 공개하지 못한 역할은 0(단, 라운드 끝에 공개된 왕은 4).
    for (const [role, who] of Object.entries(g.revealed)) if (who === pid) return ROLE_BY_ID[role].rank;
    return 0;
  };
  const rows = g.players.map(p => {
    const s = scorePlayer(g, p);
    return { id: p.id, name: p.name, total: s.total, items: s.items, city: p.city.slice(), gold: p.gold, hand: p.hand.length,
      lastRank: rankOf(p.id), lastRole: Object.entries(g.revealed).find(([, w]) => w === p.id)?.[0] || null };
  });
  rows.sort((a, b) => b.total - a.total || b.lastRank - a.lastRank);
  let place = 0;
  rows.forEach((r, i) => {
    if (i === 0 || r.total !== rows[i - 1].total || r.lastRank !== rows[i - 1].lastRank) place = i + 1;
    r.place = place;
  });
  const top = rows[0];
  const tiedTop = rows.filter(r => r.total === top.total);
  g.result = {
    rows, winners: rows.filter(r => r.place === 1).map(r => r.id),
    tieNote: tiedTop.length > 1 ? `최고 점수 ${top.total}점 동점 — 마지막 라운드에 공개한 역할의 순위가 높은 사람이 이깁니다.` : '',
  };
  log(g, `게임이 끝났습니다. 승자: ${rows.filter(r => r.place === 1).map(r => r.name).join(', ')} (${top.total}점)`);
}

// ── 플레이어별 시야 ────────────────────────────────────
// 허용된 정보만 담는다. 상대 손패·미공개 역할·비공개 제외 카드·덱 순서는 절대 넣지 않는다.
export function viewFor(g, viewerId) {
  const me = viewerId ? P(g, viewerId) : null;
  const s = g.sel;
  const revealedBy = {};
  for (const [role, pid] of Object.entries(g.revealed || {})) revealedBy[pid] = role;
  const v = {
    v: g.v, round: g.round, phase: g.phase,
    crown: g.players[g.crown].id,
    deckCount: g.deck.length,
    firstComplete: g.firstComplete, endTriggered: g.endTriggered,
    players: g.players.map(p => ({
      id: p.id, name: p.name, seat: p.seat, gold: p.gold, handCount: p.hand.length,
      city: p.city.slice(), role: revealedBy[p.id] || null,
      picked: g.phase === 'selection' ? !!s.chosen[p.id] : true,
    })),
    killed: g.killed, robbed: g.robbed, calledRank: g.calledRank,
    log: g.log.filter(e => e.to === undefined || e.to === viewerId).slice(-120).map(e => ({ n: e.n, r: e.r, text: e.text, mine: e.to !== undefined })),
  };
  if (g.phase === 'selection') {
    v.selection = {
      faceUp: s.faceUp.slice(), step: s.step, picker: s.order[s.step], order: s.order.slice(),
      seventhRule: g.players.length === 7 && s.step === 6,
    };
    if (me && s.order[s.step] === me.id) v.selection.options = selectableRoles(g);
  } else if (s) {
    v.faceUp = s.faceUp.slice();
  }
  if (g.turn) {
    const t = g.turn;
    v.turn = { pid: t.pid, role: t.role, gathered: t.gathered, built: t.built, limit: t.limit, used: { ...t.used }, choosing: !!t.pendingDraw };
    if (me && t.pid === me.id && t.pendingDraw) v.turn.pendingDraw = t.pendingDraw.slice();
    if (me && t.pid === me.id) {
      const bishopPid = g.revealed.bishop;
      v.turn.protected = bishopPid && g.killed !== 'bishop' ? bishopPid : null;
    }
  }
  if (me) {
    v.me = { id: me.id, hand: me.hand.slice(), role: s && s.chosen[me.id] || null };
  }
  if (g.phase === 'ended') v.result = g.result;
  return v;
}
