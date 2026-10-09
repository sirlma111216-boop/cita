import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, viewFor, selectableRoles, scorePlayer, RuleError, __forceRoles, defOf } from '../src/engine.js';
import { DISTRICTS, ROLES } from '../public/shared/data.js';

function rngOf(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mk = (n, seed = 1) => createGame(Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: '학생' + i })), rngOf(seed));
const throwsRule = (fn, re) => assert.throws(fn, e => e instanceof RuleError && (!re || re.test(e.why)));
const P = (g, id) => g.players.find(p => p.id === id);

test('덱 구성: 기본 54장 + 특수 14장, 인스턴스 ID 는 모두 다르다', () => {
  const g = mk(4);
  const all = [...g.deck, ...g.players.flatMap(p => p.hand)];
  assert.equal(all.length, 68);
  assert.equal(new Set(all).size, 68);
  const basic = DISTRICTS.filter(d => d.type !== 'unique').reduce((s, d) => s + d.count, 0);
  assert.equal(basic, 54);
  const byType = t => DISTRICTS.filter(d => d.type === t).reduce((s, d) => s + d.count, 0);
  assert.deepEqual([byType('religious'), byType('military'), byType('noble'), byType('trade'), byType('unique')], [11, 11, 12, 20, 14]);
  assert.equal(all.filter(c => c.startsWith('manor#')).length, 5);
});

test('시작: 금화 2개, 손패 4장, 왕관은 무작위', () => {
  const crowns = new Set();
  for (let s = 1; s < 60; s++) {
    const g = mk(5, s);
    for (const p of g.players) { assert.equal(p.gold, 2); assert.equal(p.hand.length, 4); }
    crowns.add(g.crown);
  }
  assert.ok(crowns.size >= 4, '여러 좌석이 첫 왕관을 받아야 한다');
});

test('인원별 역할 제외 수와 왕 공개 제외 금지', () => {
  const expect = { 4: [2, 5], 5: [1, 6], 6: [0, 7], 7: [0, 7] };
  for (let s = 1; s <= 400; s++) {
    for (const n of [4, 5, 6, 7]) {
      const g = mk(n, s * 10 + n);
      assert.equal(g.sel.faceUp.length, expect[n][0]);
      assert.ok(!g.sel.faceUp.includes('king'), '왕은 공개 제외될 수 없다');
      assert.equal(selectableRoles(g).length, expect[n][1]);
      assert.equal(g.sel.order[0], g.players[g.crown].id, '왕관 보유자가 먼저 고른다');
    }
  }
});

test('4인 선택: 순서대로 고르고 남은 1장은 비공개로 버린다', () => {
  const g = mk(4, 7);
  throwsRule(() => act(g, g.sel.order[1], { type: 'pick', role: selectableRoles(g)[0] }), /차례가 아닙니다/);
  for (let k = 0; k < 4; k++) {
    const pid = g.sel.order[k];
    if (k < 4) assert.equal(viewFor(g, pid).selection.options.length, 5 - k);
    act(g, pid, { type: 'pick', role: selectableRoles(g)[0] });
  }
  assert.equal(g.phase, 'turns');
  assert.equal(g.sel.discardedEnd.length, 1);
});

test('7인 선택: 마지막 플레이어는 남은 1장과 비공개 제외 카드 중 고른다', () => {
  const g = mk(7, 3);
  const fd = g.sel.faceDown;
  for (let k = 0; k < 6; k++) act(g, g.sel.order[k], { type: 'pick', role: selectableRoles(g)[0] });
  const opts = viewFor(g, g.sel.order[6]).selection.options;
  assert.equal(opts.length, 2);
  assert.ok(opts.includes(fd));
  assert.equal(viewFor(g, g.sel.order[0]).selection.options, undefined, '다른 사람은 선택지를 볼 수 없다');
  act(g, g.sel.order[6], { type: 'pick', role: fd });
  assert.equal(g.sel.chosen[g.sel.order[6]], fd);
  assert.equal(g.phase, 'turns');
});

test('비밀 정보: 다른 사람 손패·미공개 역할·비공개 제외 카드가 시야에 없다', () => {
  const g = mk(5, 11);
  const v0 = JSON.stringify(viewFor(g, 'p0'));
  for (const p of g.players.slice(1)) for (const c of p.hand) assert.ok(!v0.includes(c), '상대 손패 카드 ID 노출');
  assert.ok(!v0.includes('"faceDown"'));
  for (const c of g.deck) assert.ok(!v0.includes(c), '덱 내용 노출');
  // 역할 선택 후 미공개 역할
  for (let k = 0; k < 5; k++) act(g, g.sel.order[k], { type: 'pick', role: selectableRoles(g)[0] });
  const teacher = viewFor(g, null);
  for (const p of teacher.players) {
    const role = g.sel.chosen[p.id];
    if (!g.revealed[role]) assert.equal(p.role, null);
  }
  assert.equal(teacher.me, undefined, '관리자 시야에는 손패가 없다');
  const tj = JSON.stringify(teacher);
  for (const p of g.players) for (const c of p.hand) assert.ok(!tj.includes(c));
});

// 역할을 지정해 행동 단계 시작
function scenario(n, roles, seed = 5) {
  const g = mk(n, seed);
  const map = {};
  roles.forEach((r, i) => { if (r) map['p' + i] = r; });
  __forceRoles(g, map, rngOf(seed));
  return g;
}
const gold = (g, pid) => act(g, pid, { type: 'gather_gold' });
const end = (g, pid) => act(g, pid, { type: 'end_turn' });

test('암살: 역할을 지목, 암살당한 역할은 건너뛰고 소유자를 드러내지 않는다', () => {
  const g = scenario(4, ['assassin', 'magician', 'king', 'merchant']);
  assert.equal(g.turn.pid, 'p0');
  act(g, 'p0', { type: 'assassinate', role: 'magician' });
  throwsRule(() => act(g, 'p0', { type: 'assassinate', role: 'king' }), /이미/);
  gold(g, 'p0'); end(g, 'p0');
  assert.equal(g.turn.pid, 'p2', '마술사(p1)는 건너뛰고 왕(p2) 차례');
  const logText = g.log.map(e => e.text).join('\n');
  assert.ok(!/학생1.*마술사|마술사.*학생1/.test(logText), '암살당한 마술사의 주인을 기록에 남기지 않는다');
  assert.equal(viewFor(g, 'p3').players.find(p => p.id === 'p1').role, null);
});

test('암살자는 자신을 지목할 수 없다', () => {
  const g = scenario(4, ['assassin', 'thief', 'king', 'bishop']);
  throwsRule(() => act(g, 'p0', { type: 'assassinate', role: 'assassin' }));
});

test('도둑: 대상 공개 즉시, 자원 획득 전에 금화를 모두 가져온다 / 암살자·암살당한 역할 금지', () => {
  const g = scenario(4, ['assassin', 'thief', 'king', 'merchant']);
  act(g, 'p0', { type: 'assassinate', role: 'king' });
  gold(g, 'p0'); end(g, 'p0');
  throwsRule(() => act(g, 'p1', { type: 'steal', role: 'assassin' }), /암살자/);
  throwsRule(() => act(g, 'p1', { type: 'steal', role: 'king' }), /암살당한/);
  throwsRule(() => act(g, 'p1', { type: 'steal', role: 'thief' }));
  act(g, 'p1', { type: 'steal', role: 'merchant' });
  gold(g, 'p1'); end(g, 'p1');
  // 왕은 암살당했으므로 상인 차례
  assert.equal(g.turn.pid, 'p3');
  assert.equal(P(g, 'p3').gold, 0, '상인의 금화 2개는 공개 즉시 도둑에게');
  assert.equal(P(g, 'p1').gold, 2 + 2 + 2);
  gold(g, 'p3');
  assert.equal(P(g, 'p3').gold, 2, '빼앗긴 뒤에 자원을 모은다');
});

test('왕관 승계: 살아 있는 왕은 공개 즉시, 암살당한 왕은 라운드 끝에 왕관을 받는다', () => {
  let g = scenario(4, ['bishop', 'king', 'merchant', 'warlord']);
  // 첫 차례는 왕(p1) — 주교(p0)보다 순위가 낮다
  assert.equal(g.turn.pid, 'p1');
  assert.equal(g.players[g.crown].id, 'p1');

  g = scenario(4, ['assassin', 'king', 'merchant', 'warlord'], 9);
  const before = g.crown;
  act(g, 'p0', { type: 'assassinate', role: 'king' });
  gold(g, 'p0'); end(g, 'p0');
  assert.equal(g.crown, before, '라운드 중에는 왕관이 옮겨지지 않는다');
  gold(g, 'p2'); end(g, 'p2');
  gold(g, 'p3'); end(g, 'p3');
  assert.equal(g.round, 2);
  assert.equal(g.players[g.crown].id, 'p1', '암살당한 왕의 후계자가 왕관을 받는다');
  assert.equal(g.sel.order[0], 'p1', '다음 라운드는 새 왕관 보유자부터 고른다');
});

test('주교 보호와 장군 파괴 (비용 −1, 완성 도시·아성 불가, 덱 맨 아래로)', () => {
  const g = scenario(4, ['bishop', 'merchant', 'architect', 'warlord']);
  P(g, 'p0').city = ['temple#1'];
  P(g, 'p1').city = ['castle#1', 'keep#1'];
  P(g, 'p2').city = ['manor#1', 'manor#2', 'tavern#1', 'temple#2', 'church#1', 'market#1', 'docks#1'];
  P(g, 'p3').gold = 10;
  gold(g, 'p0'); end(g, 'p0');
  gold(g, 'p1'); end(g, 'p1');
  gold(g, 'p2'); end(g, 'p2');
  throwsRule(() => act(g, 'p3', { type: 'destroy', target: 'p0', card: 'temple#1' }), /주교/);
  throwsRule(() => act(g, 'p3', { type: 'destroy', target: 'p2', card: 'manor#1' }), /완성/);
  throwsRule(() => act(g, 'p3', { type: 'destroy', target: 'p1', card: 'keep#1' }), /아성/);
  act(g, 'p3', { type: 'destroy', target: 'p1', card: 'castle#1' });
  assert.equal(P(g, 'p3').gold, 7, '성(4) 파괴 비용 3');
  assert.equal(g.deck[g.deck.length - 1], 'castle#1');
  throwsRule(() => act(g, 'p3', { type: 'destroy', target: 'p1', card: 'keep#1' }), /이미/);
});

test('암살당한 주교의 도시는 보호받지 못한다', () => {
  const g = scenario(4, ['assassin', 'bishop', 'merchant', 'warlord']);
  P(g, 'p1').city = ['temple#1'];
  act(g, 'p0', { type: 'assassinate', role: 'bishop' });
  gold(g, 'p0'); end(g, 'p0');
  gold(g, 'p2'); end(g, 'p2');
  act(g, 'p3', { type: 'destroy', target: 'p1', card: 'temple#1' });
  assert.equal(P(g, 'p1').city.length, 0);
});

test('건축가: 카드 2장 추가, 건설 한도 3 / 기본 건설 한도 1 / 같은 이름 금지', () => {
  const g = scenario(4, ['king', 'merchant', 'architect', 'warlord']);
  const k = P(g, 'p0');
  k.hand = ['manor#1', 'manor#2', 'tavern#1']; k.gold = 20;
  throwsRule(() => act(g, 'p0', { type: 'build', card: 'manor#1' }), /자원을 모아야/);
  gold(g, 'p0');
  act(g, 'p0', { type: 'build', card: 'manor#1' });
  throwsRule(() => act(g, 'p0', { type: 'build', card: 'tavern#1' }), /한도/);
  end(g, 'p0');
  gold(g, 'p1'); end(g, 'p1');
  const a = P(g, 'p2');
  a.hand = ['manor#2', 'manor#3', 'tavern#1', 'temple#1']; a.gold = 20;
  const handBefore = a.hand.length;
  act(g, 'p2', { type: 'architect_draw' });
  assert.equal(a.hand.length, handBefore + 2);
  gold(g, 'p2');
  act(g, 'p2', { type: 'build', card: 'manor#2' });
  throwsRule(() => act(g, 'p2', { type: 'build', card: 'manor#3' }), /같은 건물/);
  act(g, 'p2', { type: 'build', card: 'tavern#1' });
  act(g, 'p2', { type: 'build', card: 'temple#1' });
  assert.equal(a.city.length, 3);
});

test('종류별 수입은 건설 전후 원하는 때, 한 번만 (마법 학교 포함)', () => {
  const g = scenario(4, ['king', 'merchant', 'architect', 'warlord']);
  const k = P(g, 'p0');
  k.city = ['manor#1', 'school_of_magic#1']; k.hand = ['palace#1']; k.gold = 3;
  gold(g, 'p0');
  act(g, 'p0', { type: 'build', card: 'palace#1' });
  act(g, 'p0', { type: 'income' });
  assert.equal(k.gold, 3 + 2 - 5 + 3, '귀족 2 + 마법 학교 1');
  throwsRule(() => act(g, 'p0', { type: 'income' }), /이미/);
  end(g, 'p0');
  const m = P(g, 'p1');
  m.city = ['tavern#1']; m.gold = 0;
  act(g, 'p1', { type: 'merchant_extra' });
  act(g, 'p1', { type: 'income' });
  act(g, 'p1', { type: 'gather_cards' });
  assert.equal(m.gold, 2);
});

test('카드 뽑기: 2장 중 1장, 나머지는 덱 맨 아래 / 도서관은 모두 가진다', () => {
  const g = scenario(4, ['king', 'merchant', 'architect', 'warlord']);
  const top2 = g.deck.slice(0, 2);
  act(g, 'p0', { type: 'gather_cards' });
  assert.deepEqual(viewFor(g, 'p0').turn.pendingDraw, top2);
  assert.equal(viewFor(g, 'p1').turn.pendingDraw, undefined, '다른 사람은 뽑은 카드를 못 본다');
  throwsRule(() => act(g, 'p0', { type: 'end_turn' }), /먼저 골라야/);
  act(g, 'p0', { type: 'keep', card: top2[1] });
  assert.equal(g.deck[g.deck.length - 1], top2[0]);
  end(g, 'p0');
  P(g, 'p1').city = ['library#1'];
  const n = P(g, 'p1').hand.length;
  act(g, 'p1', { type: 'gather_cards' });
  assert.equal(P(g, 'p1').hand.length, n + 2);
});

test('마술사: 손패 교환 / 버리고 같은 수 뽑기', () => {
  const g = scenario(4, ['magician', 'king', 'architect', 'warlord']);
  const m = P(g, 'p0'), o = P(g, 'p2');
  const mh = m.hand.slice(), oh = o.hand.slice();
  act(g, 'p0', { type: 'magic_swap', target: 'p2' });
  assert.deepEqual(m.hand, oh); assert.deepEqual(o.hand, mh);
  throwsRule(() => act(g, 'p0', { type: 'magic_redraw', cards: [m.hand[0]] }), /이미/);
  const g2 = scenario(4, ['magician', 'king', 'architect', 'warlord'], 8);
  const m2 = P(g2, 'p0');
  const drop = m2.hand.slice(0, 2);
  act(g2, 'p0', { type: 'magic_redraw', cards: drop });
  assert.equal(m2.hand.length, 4);
  assert.deepEqual(g2.deck.slice(-2), drop);
});

test('특수 건물: 공방·도둑 소굴·연구소·대장간·채석장', () => {
  const g = scenario(4, ['king', 'merchant', 'architect', 'warlord']);
  const k = P(g, 'p0');
  k.city = ['factory#1', 'quarry#1', 'laboratory#1', 'smithy#1', 'manor#1'];
  k.hand = ['thieves_den#1', 'tavern#1', 'tavern#2', 'temple#1', 'manor#2'];
  k.gold = 2;
  gold(g, 'p0'); // 4
  act(g, 'p0', { type: 'lab', card: 'temple#1' }); // 6
  throwsRule(() => act(g, 'p0', { type: 'lab', card: 'tavern#1' }), /한 번/);
  act(g, 'p0', { type: 'smithy' }); // 4, +3장
  assert.equal(k.gold, 4);
  throwsRule(() => act(g, 'p0', { type: 'build', card: 'tavern#1', payCards: ['tavern#2'] }), /도둑 소굴뿐/);
  // 도둑 소굴 6 → 공방으로 5, 카드 2장 + 금화 3
  act(g, 'p0', { type: 'build', card: 'thieves_den#1', payCards: ['tavern#1', 'tavern#2'] });
  assert.equal(k.gold, 1);
  assert.ok(k.city.includes('thieves_den#1'));
  assert.ok(!k.hand.includes('tavern#1'));
  end(g, 'p0');
  // 채석장: 같은 이름 건설 허용
  const g2 = scenario(4, ['king', 'merchant', 'architect', 'warlord']);
  const a = P(g2, 'p0'); a.city = ['quarry#1', 'manor#1']; a.hand = ['manor#2']; a.gold = 5;
  gold(g2, 'p0');
  act(g2, 'p0', { type: 'build', card: 'manor#2' });
  assert.equal(a.city.filter(c => c.startsWith('manor')).length, 2);
});

test('점수: 비용 합계·5종류·최초/완성 보너스·특수 건물 점수·유령 구역 최적 선택', () => {
  const g = mk(4, 2);
  const [a, b] = g.players;
  a.city = ['manor#1', 'temple#1', 'tavern#1', 'watchtower#1', 'dragon_gate#1', 'map_room#1', 'wishing_well#1'];
  a.hand = ['castle#1', 'castle#2']; a.gold = 3;
  g.firstComplete = a.id;
  let s = scorePlayer(g, a);
  // 3+1+1+1+6+5+5 = 22, 5종류 3, 최초 4, 용의 문 2, 지도의 방 2, 소원의 우물 3 → 36
  assert.equal(s.total, 36);
  b.city = ['manor#2', 'temple#2', 'tavern#2', 'haunted_quarter#1', 'imperial_treasury#1', 'statue#1', 'castle#3'];
  b.gold = 4; b.hand = [];
  g.crown = 1;
  s = scorePlayer(g, b);
  // 3+1+1+2+5+3+4 = 19, 군사 없음 → 유령 구역을 군사로: 3 (특수는 보물고·조각상으로 이미 있음), 완성 2, 보물고 4, 조각상 5 → 33
  assert.equal(s.hauntedAs, 'military');
  assert.equal(s.total, 33);
});

test('종료: 7개 완성 후 라운드를 끝까지 진행, 먼저 완성해도 자동 승리 아님, 동점은 마지막 공개 역할 순위', () => {
  const g = scenario(4, ['assassin', 'king', 'merchant', 'warlord']);
  P(g, 'p0').city = ['manor#1', 'temple#1', 'tavern#1', 'watchtower#1', 'church#1', 'market#1'];
  P(g, 'p0').hand = ['prison#1']; P(g, 'p0').gold = 5;
  gold(g, 'p0');
  act(g, 'p0', { type: 'build', card: 'prison#1' });
  assert.equal(g.firstComplete, 'p0');
  end(g, 'p0');
  assert.equal(g.phase, 'turns', '라운드는 계속된다');
  // 다른 플레이어들이 동점이 되도록 맞춘다
  P(g, 'p3').city = ['palace#1', 'palace#2', 'castle#1', 'castle#2', 'fortress#1', 'cathedral#1', 'town_hall#1'];
  gold(g, 'p1'); end(g, 'p1');
  gold(g, 'p2'); end(g, 'p2');
  gold(g, 'p3'); end(g, 'p3');
  assert.equal(g.phase, 'ended');
  const r = g.result;
  assert.equal(r.rows.length, 4);
  const p0 = r.rows.find(x => x.id === 'p0'), p3 = r.rows.find(x => x.id === 'p3');
  assert.equal(p0.total, 12 + 4);
  assert.equal(p3.total, 33 + 2);
  assert.deepEqual(r.winners, ['p3']);
  throwsRule(() => act(g, 'p0', { type: 'gather_gold' }), /끝났습니다/);
});

test('동점 판정: 마지막 라운드에 더 높은 순위 역할을 공개한 사람이 이긴다', () => {
  const g = scenario(4, ['assassin', 'king', 'merchant', 'warlord']);
  g.endTriggered = true; g.firstComplete = 'pX';
  for (const p of g.players) { p.city = ['manor#1']; }
  for (const pid of ['p0', 'p1', 'p2', 'p3']) { gold(g, pid); end(g, pid); }
  assert.equal(g.phase, 'ended');
  assert.deepEqual(g.result.winners, ['p3']);
  assert.ok(g.result.tieNote);
});

test('차례가 아닌 사람의 행동과 잘못된 대상은 거부된다', () => {
  const g = scenario(4, ['king', 'merchant', 'architect', 'warlord']);
  throwsRule(() => act(g, 'p1', { type: 'gather_gold' }), /내 차례가 아닙니다/);
  throwsRule(() => act(g, 'p0', { type: 'build', card: P(g, 'p1').hand[0] }));
  throwsRule(() => act(g, 'p0', { type: 'steal', role: 'king' }), /도둑만/);
  throwsRule(() => act(g, 'nobody', { type: 'gather_gold' }), /플레이어가 아닙니다/);
});

// 무작위 봇으로 4~7인 게임을 끝까지 진행 — 멈추거나 규칙 위반으로 깨지지 않는지
function botStep(g, rng) {
  if (g.phase === 'selection') {
    const pid = g.sel.order[g.sel.step];
    const opts = selectableRoles(g);
    act(g, pid, { type: 'pick', role: opts[Math.floor(rng() * opts.length)] }, rng);
    return;
  }
  const t = g.turn; const me = P(g, t.pid);
  const tryAct = a => { try { act(g, me.id, a, rng); return true; } catch (e) { if (!(e instanceof RuleError)) throw e; return false; } };
  if (t.pendingDraw) { tryAct({ type: 'keep', card: t.pendingDraw[0] }); return; }
  const roleTargets = ROLES.map(r => r.id);
  if (!t.used.power) {
    if (t.role === 'assassin') tryAct({ type: 'assassinate', role: roleTargets[1 + Math.floor(rng() * 7)] });
    if (t.role === 'thief') tryAct({ type: 'steal', role: roleTargets[2 + Math.floor(rng() * 6)] });
    if (t.role === 'magician' && rng() < 0.5) tryAct({ type: 'magic_swap', target: g.players[Math.floor(rng() * g.players.length)].id });
    if (t.role === 'warlord') { const o = g.players[Math.floor(rng() * g.players.length)]; if (o.city.length) tryAct({ type: 'destroy', target: o.id, card: o.city[0] }); }
  }
  if (!t.gathered) { tryAct(rng() < 0.6 ? { type: 'gather_gold' } : { type: 'gather_cards' }); return; }
  tryAct({ type: 'income' }); tryAct({ type: 'merchant_extra' }); tryAct({ type: 'architect_draw' });
  for (const c of me.hand.slice()) tryAct({ type: 'build', card: c });
  tryAct({ type: 'end_turn' });
}

test('무작위 봇: 4~7인 게임이 끝까지 진행되고 점수가 계산된다 (각 30판)', () => {
  for (const n of [4, 5, 6, 7]) {
    for (let s = 1; s <= 30; s++) {
      const rng = rngOf(s * 97 + n);
      const g = createGame(Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: '봇' + i })), rng);
      let steps = 0;
      while (g.phase !== 'ended' && steps < 20000) { botStep(g, rng); steps++; }
      assert.equal(g.phase, 'ended', `${n}인 시드 ${s}: 게임이 끝나지 않음`);
      const cards = [...g.deck, ...g.players.flatMap(p => [...p.hand, ...p.city])];
      assert.equal(cards.length, 68, '카드가 사라지거나 늘지 않는다');
      assert.equal(new Set(cards).size, 68);
      assert.ok(g.result.rows.every(r => r.total === r.items.reduce((a, b) => a + b.pts, 0)));
    }
  }
});
