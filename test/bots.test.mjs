import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, RuleError } from '../src/engine.js';
import { botAction } from '../src/bots.js';

function rngOf(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('봇만으로 4~7인 게임이 끝까지 진행되고, 봇의 행동은 규칙 위반이 거의 없다', () => {
  let errors = 0, actions = 0, rounds = [];
  for (const n of [4, 5, 6, 7]) for (let s = 1; s <= 25; s++) {
    const rng = rngOf(s * 31 + n);
    const g = createGame(Array.from({ length: n }, (_, i) => ({ id: 'bot_' + i, name: '봇' + i })), rng);
    let steps = 0;
    while (g.phase !== 'ended' && steps < 5000) {
      const actor = g.phase === 'selection' ? g.sel.order[g.sel.step] : g.turn.pid;
      const a = botAction(g, actor, rng);
      actions++;
      try { act(g, actor, a, rng); }
      catch (e) { if (!(e instanceof RuleError)) throw e; errors++; act(g, actor, g.turn && g.turn.gathered ? { type: 'end_turn' } : { type: 'gather_gold' }, rng); }
      steps++;
    }
    assert.equal(g.phase, 'ended', `${n}인 시드 ${s} 종료 실패`);
    rounds.push(g.round);
  }
  assert.ok(errors / actions < 0.01, `봇 규칙 위반 비율 ${errors}/${actions}`);
  const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
  assert.ok(avg > 4 && avg < 14, '평균 라운드 수가 자연스러움: ' + avg);
  console.log('평균 라운드', avg.toFixed(1), '위반', errors, '/', actions);
});
