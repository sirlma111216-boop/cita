// 실제 서버(로컬 wrangler dev 또는 배포본)에 여러 학생·교사 연결을 만들어 전체 흐름을 검증한다.
// 사용법: BASE=http://127.0.0.1:8790 EMAIL=... PASSWORD=... node scripts/e2e.mjs
import WebSocket from 'ws';
import { botFromView } from '../src/bots.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8790';
const WSB = BASE.replace(/^http/, 'ws');
const EMAIL = process.env.EMAIL, PASSWORD = process.env.PASSWORD;
let pass = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✔', msg); } else { failN++; console.log('  ✖', msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (path, opts = {}) => { const r = await fetch(BASE + path, opts); return { status: r.status, body: await r.json().catch(() => ({})) }; };

class Client {
  constructor(code, hello, label) {
    this.code = code; this.hello = hello; this.label = label; this.state = null; this.waiters = new Map(); this.raws = []; this.denied = null;
  }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`${WSB}/ws/${this.code}`);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'hello', ...this.hello })));
      this.ws.on('message', d => {
        const m = JSON.parse(d.toString());
        if (m.type === 'welcome') { this.uid = m.uid; if (m.cred) { this.cred = m.cred; this.hello = { as: 'student', ...m.cred }; } res(this); }
        else if (m.type === 'denied') { this.denied = m; res(this); }
        else if (m.type === 'state') { this.state = m; this.raws.push({ v: m.room?.game?.v, raw: d.toString(), room: m.room?.id }); }
        else if (m.rid && this.waiters.has(m.rid)) { const q = this.waiters.get(m.rid); q.shift()(m); if (!q.length) this.waiters.delete(m.rid); }
      });
      this.ws.on('error', rej);
    });
  }
  req(msg, rid) {
    rid = rid || Math.random().toString(36).slice(2);
    return new Promise(res => { if (!this.waiters.has(rid)) this.waiters.set(rid, []); this.waiters.get(rid).push(res); this.ws.send(JSON.stringify({ ...msg, rid })); });
  }
  close() { this.ws.close(); }
}

async function until(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(40); }
  return null;
}

async function playRoom(clients, roomId, label, checks = {}) {
  // 사람 학생들도 봇 판단 함수로 자동 진행 (각자 자기 시야만 사용)
  const t0 = Date.now();
  let actions = 0, lastLog = Date.now();
  while (Date.now() - t0 < 420000) {
    if (Date.now() - lastLog > 15000) {
      lastLog = Date.now();
      const gx = clients[0].state?.room?.game;
      console.log(`    … ${label}: ${actions}회 행동, ${gx?.round}라운드 ${gx?.phase} 차례=${gx?.phase === 'selection' ? gx.selection.picker : gx?.turn?.pid} v=${gx?.v}`);
    }
    // 끝난 방은 활성 방에서 빠지므로, 실제 화면처럼 결과 보기(watch)를 요청한다
    const fin = clients.find(c => c.state?.lastFinished === roomId && c.state.room?.id !== roomId);
    if (fin) { await fin.req({ type: 'watch', roomId }); await until(() => fin.state.room?.id === roomId); return fin.state.room.game; }
    const anyState = clients[0].state;
    const g = anyState?.room?.id === roomId ? anyState.room.game : null;
    if (g && g.phase === 'ended') return g;
    let acted = false;
    for (const c of clients) {
      const st = c.state;
      if (!st?.room || st.room.id !== roomId || !st.room.game) continue;
      const gv = st.room.game;
      if (gv.phase === 'ended') return gv;
      const actor = gv.phase === 'selection' ? gv.selection.picker : gv.turn?.pid;
      if (actor !== c.uid) continue;
      if (checks.onSelection && gv.phase === 'selection') checks.onSelection(c, gv);
      if (checks.onTurn && gv.phase === 'turns' && !gv.turn.gathered && !gv.turn.choosing) { const used = await checks.onTurn(c, gv); if (used) { checks.onTurn = null; actions++; continue; } }
      const a = botFromView(gv, c.uid);
      const r = await c.req({ type: 'game', roomId, v: gv.v, action: a });
      if (r.type === 'error') {
        if (process.env.DEBUG) console.log('    ! 거절', c.label, JSON.stringify(a), r.why);
        const fb = gv.phase === 'selection' ? { type: 'pick', role: gv.selection.options[0] } : gv.turn.pendingDraw ? { type: 'keep', card: gv.turn.pendingDraw[0] } : gv.turn.gathered ? { type: 'end_turn' } : { type: 'gather_gold' };
        await c.req({ type: 'game', roomId, v: gv.v, action: fb });
      }
      actions++; acted = true;
      await until(() => c.state.room?.game?.v > gv.v || c.state.room?.game?.phase === 'ended', 4000);
    }
    if (!acted) await sleep(80);
  }
  throw new Error(label + ' 시간 초과');
}

(async () => {
  console.log('▶ 교사 인증');
  ok((await api('/api/teacher/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: 'wrong-password' }) })).status === 401, '틀린 비밀번호는 거부');
  ok((await api('/api/teacher/classes', { method: 'POST', body: '{"name":"x"}' })).status === 401, '토큰 없이 클래스 생성 불가');
  ok((await api('/api/teacher/classes', { method: 'POST', headers: { authorization: 'Bearer forged.token' }, body: '{"name":"x"}' })).status === 401, '위조 토큰 거부');
  const login = await api('/api/teacher/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  ok(login.status === 200 && login.body.token, '올바른 계정으로 로그인');
  const auth = { authorization: 'Bearer ' + login.body.token, 'content-type': 'application/json' };
  const A = (await api('/api/teacher/classes', { method: 'POST', headers: auth, body: JSON.stringify({ name: '검증 클래스 A' }) })).body;
  const B = (await api('/api/teacher/classes', { method: 'POST', headers: auth, body: JSON.stringify({ name: '검증 클래스 B' }) })).body;
  ok(/^[A-Z2-9]{6}$/.test(A.code) && A.code !== B.code, `클래스 생성 (${A.code}, ${B.code})`);
  ok((await api('/api/class/' + A.code)).body.name === '검증 클래스 A', '학생용 클래스 확인');
  ok((await api('/api/class/ZZZZZZ')).status === 404, '없는 코드는 404');

  console.log('▶ 학생 참여와 명단');
  const T = await new Client(A.code, { as: 'teacher', token: login.body.token }, 'T').connect();
  const fakeT = await new Client(A.code, { as: 'teacher', token: 'abc.def' }, 'fake').connect();
  ok(fakeT.denied, '가짜 교사 토큰으로는 교사 연결 불가');
  const names = ['하늘', '바다', '하늘', '<img src=x onerror=alert(1)>', '별', '달', '숲', '돌', '샘'];
  const S = [];
  for (let i = 0; i < names.length; i++) S.push(await new Client(A.code, { as: 'join', name: names[i] }, 's' + i).connect());
  await sleep(400);
  ok(T.state.students.length === names.length, `교사 명단에 ${names.length}명 표시`);
  ok(S[0].uid !== S[2].uid, '같은 이름 학생도 서로 다른 ID');
  ok(!T.state.students.some(s => /[<>]/.test(s.name)), '이름의 꺾쇠(HTML) 제거: ' + T.state.students[3].name);
  ok(T.state.students.every(s => s.online), '접속 상태 표시');
  const SB = await new Client(B.code, { as: 'join', name: '다른반' }, 'b').connect();
  const cross = await new Client(A.code, { as: 'student', ...SB.cred }, 'cross').connect();
  ok(cross.denied, '다른 클래스 학생 정보로는 이 클래스에 접속 불가');

  console.log('▶ 방장 지정과 방 만들기 권한');
  let r = await S[0].req({ type: 'create_room', title: '몰래 만든 방' });
  ok(r.type === 'error', '방장이 아닌 학생의 방 생성 차단: ' + r.why);
  await T.req({ type: 'set_host', sid: S[0].uid, on: true });
  r = await S[0].req({ type: 'create_room', title: '달빛 성곽 1모둠' });
  ok(r.type === 'ok', '지정된 방장이 제목 있는 방 생성');
  await sleep(200);
  const room1 = S[0].state.rooms.find(x => x.title === '달빛 성곽 1모둠');
  ok(room1 && room1.host === S[0].uid && room1.count === 1, '방장이 첫 자리에 앉음');
  ok(SB.state.rooms.length === 0, '다른 클래스 학생에게는 방이 보이지 않음');
  ok(!('students' in S[1].state), '학생에게는 교사용 명단이 내려가지 않음');

  console.log('▶ 동시 입장과 정원');
  const joins = await Promise.all(S.slice(1, 8).map(c => c.req({ type: 'join_room', roomId: room1.id })));
  ok(joins.filter(j => j.type === 'ok').length === 6 && joins.filter(j => j.type === 'error').length === 1, '7명이 동시에 들어오면 6명만 성공(정원 7)');
  await sleep(200);
  ok(S[0].state.rooms.find(x => x.id === room1.id).count === 7, '정원 초과 없음');
  const seated = S[0].state.room.seats.map(x => x.id);
  const outsider = S.slice(1, 9).find(c => !seated.includes(c.uid));
  r = await outsider.req({ type: 'create_room', title: 'x' });
  ok(r.type === 'error', '방장 아닌 학생은 여전히 방 생성 불가');
  // 한 학생 한 방
  await T.req({ type: 'create_room', title: '선생님 방' });
  await sleep(200);
  const room2 = T.state.rooms.find(x => x.title === '선생님 방');
  r = await S[1].req({ type: 'join_room', roomId: room2.id });
  ok(r.type === 'error', '이미 방에 있는 학생은 다른 방에 동시에 참가 불가');
  r = await S[1].req({ type: 'start_game', roomId: room1.id });
  ok(r.type === 'error', '방장이 아닌 학생은 게임 시작 불가');

  console.log('▶ 동시에 마지막 자리 다투기 (봇으로 6자리 채운 뒤 2명이 동시 입장)');
  for (let i = 0; i < 6; i++) await T.req({ type: 'add_bot', roomId: room2.id });
  const last2 = [outsider, S[8]];
  const race = await Promise.all(last2.map(c => c.req({ type: 'join_room', roomId: room2.id })));
  ok(race.filter(x => x.type === 'ok').length === 1, '마지막 1자리에 2명이 동시 입장 → 1명만 성공');
  await sleep(200);
  const loser = last2[race.findIndex(x => x.type === 'error')];
  const winner = last2[race.findIndex(x => x.type === 'ok')];

  console.log('▶ 7인 게임 시작');
  r = await S[0].req({ type: 'start_game', roomId: room1.id });
  ok(r.type === 'ok', '방장이 7인 게임 시작');
  await until(() => S[0].state.room?.game);
  const g0 = S[0].state.room.game;
  ok(g0.players.length === 7 && g0.players.every(p => p.gold === 2 && p.handCount === 4), '모두 금화 2개·손패 4장');
  r = await S[8 === 8 ? 8 : 8].req({ type: 'join_room', roomId: room1.id });
  ok(r.type === 'error', '진행 중인 방에는 새 플레이어 참가 불가');
  const room1Clients = S.filter(c => g0.players.some(p => p.id === c.uid));

  // 중복 요청: 같은 rid 로 두 번 보내도 한 번만 처리
  await until(() => room1Clients.some(c => c.state.room.game.selection?.picker === c.uid));
  let seventhOk = null, dupOk = null, staleOk = null;
  const game1 = playRoom(room1Clients, room1.id, '7인 게임', {
    onSelection: (c, gv) => { if (gv.selection.step === 6) seventhOk = gv.selection.options.length === 2 && gv.selection.seventhRule; },
    // 같은 rid 로 두 번 동시에 보내기 + 이전 버전으로 한 번 더 보내기
    onTurn: async (c, gv) => {
      const before = gv.players.find(p => p.id === c.uid).gold;
      const rid = 'dup-' + Date.now();
      const msg = { type: 'game', roomId: room1.id, v: gv.v, action: { type: 'gather_gold' } };
      const [a1, a2] = await Promise.all([c.req(msg, rid), c.req(msg, rid)]);
      const r3 = await c.req(msg);
      await until(() => c.state.room.game.v > gv.v);
      const after = c.state.room.game.players.find(p => p.id === c.uid).gold;
      dupOk = a1.type === 'ok' && a2.type === 'ok' && after - before === 2;
      staleOk = r3.type === 'error' ? r3.why : null;
      return true;
    },
  });

  // 교사 관리 화면은 공개 정보만
  await T.req({ type: 'watch', roomId: room1.id });
  await sleep(300);
  ok(T.state.room.game && !T.state.room.game.me, '교사(비참가)는 손패·내 역할 없이 공개 정보만');

  // 재접속: 한 학생 연결을 끊었다가 같은 신원으로 복귀
  await sleep(1500);
  const victim = room1Clients[3];
  const beforeHandLen = victim.state.room.game.me.hand.length;
  victim.close();
  await sleep(500);
  ok(T.state.students.find(s => s.id === victim.uid).online === false, '연결이 끊긴 학생은 접속 끊김으로 표시');
  await victim.connect();
  await until(() => victim.state.room?.id === room1.id);
  ok(victim.state.room.seated && victim.state.room.game.me && victim.state.room.game.me.hand.length >= 0, '재접속하면 같은 자리·손패로 복귀');
  ok(Math.abs(victim.state.room.game.me.hand.length - beforeHandLen) <= 4, '손패가 유지됨');

  const end1 = await game1;
  ok(end1.phase === 'ended' && end1.result.rows.length === 7, `7인 게임 끝까지 진행 (${end1.round}라운드)`);
  ok(dupOk === true, '같은 요청(rid) 동시 재전송은 한 번만 처리 (금화 +2)');
  ok(!!staleOk, '이전 화면 버전의 요청은 거부: ' + staleOk);
  ok(seventhOk === true, '7인 마지막 선택자는 2장 중 선택');
  ok(end1.result.rows.every(rw => rw.total === rw.items.reduce((s, x) => s + x.pts, 0)), '점수 항목 합계 일치');

  console.log('▶ 비밀 정보 노출 검사 (모든 네트워크 응답)');
  const handAt = {};
  for (const c of room1Clients) for (const x of c.raws) {
    if (x.room !== room1.id || x.v == null) continue;
    const st = JSON.parse(x.raw); const me = st.room.game.me;
    if (me) (handAt[x.v] ||= {})[c.uid] = me.hand;
  }
  let leaks = 0, checked = 0, keyLeaks = 0;
  for (const c of [...room1Clients, T]) for (const x of c.raws) {
    if (x.room !== room1.id || x.v == null) continue;
    checked++;
    { const mm = x.raw.replace(/"me":\{"id":"[^"]+","hand":/g, '').match(/"(faceDown|pool|chosen|deck|hand)":(?!\d)/); if (mm) { keyLeaks++; if (keyLeaks === 1) console.log('    필드:', mm[0], x.raw.slice(Math.max(0, x.raw.indexOf(mm[0]) - 80), x.raw.indexOf(mm[0]) + 60)); } }
    const hands = handAt[x.v] || {};
    for (const [pid, hand] of Object.entries(hands)) {
      if (pid === c.uid) continue;
      for (const card of hand) if (x.raw.includes('"' + card + '"')) leaks++;
    }
  }
  ok(checked > 50 && leaks === 0, `상대 손패 카드 ID 노출 없음 (${checked}개 응답 검사)`);
  ok(keyLeaks === 0, '덱·비공개 제외·다른 사람 선택 정보 필드 없음');

  console.log('▶ 봇 방');
  r = await T.req({ type: 'start_game', roomId: room2.id });
  ok(r.type === 'ok', '교사가 봇 6 + 학생 1 방을 시작');
  await until(() => winner.state.room?.game);
  const end2 = await playRoom([winner], room2.id, '봇 방');
  ok(end2.phase === 'ended', `봇 6명과의 게임 완료 (${end2.round}라운드)`);

  console.log('▶ 혼자 연습 모드');
  r = await loser.req({ type: 'create_practice', bots: 3 });
  ok(r.type === 'ok', '방장이 아닌 학생도 봇과 연습 시작');
  await until(() => loser.state.room?.practice);
  ok(!S[1].state.rooms.some(x => x.practice), '다른 학생 목록에는 연습 게임이 안 보임');
  ok(T.state.rooms.some(x => x.practice), '교사는 연습 게임을 볼 수 있음');
  const end3 = await playRoom([loser], loser.state.room.id, '연습');
  ok(end3.phase === 'ended' && end3.players.length === 4, `봇 3명과 4인 연습 완료 (${end3.round}라운드)`);

  console.log('▶ 진행 중 방장 해제');
  await T.req({ type: 'set_host', sid: S[0].uid, on: false });
  await sleep(200);
  ok(S[0].state.me.host === false, '방장 해제 반영');

  for (const c of [T, ...S, SB]) try { c.close(); } catch { }
  console.log(`\n결과: 통과 ${pass} · 실패 ${failN}`);
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
