// 클래스 하나 = Durable Object 하나. 학생 명단, 게임방들, 진행 중인 게임 상태를 함께 보관한다.
// Durable Object 는 요청을 하나씩 처리하므로, 방 입장·시작·역할 선택이 동시에 와도 순서대로 판정된다.
// 각 처리기는 검사와 변경 사이에 await 를 두지 않는다(정원 초과·중복 처리 방지).
import { DurableObject } from 'cloudflare:workers';
import { verifyToken, sha256, randomId, cleanText } from './auth.js';
import { createGame, act, viewFor, RuleError } from './engine.js';
import { MIN_PLAYERS, MAX_PLAYERS } from '../public/shared/data.js';
import { botAction, isBot, BOT_NAMES } from './bots.js';

const TEACHER = 'teacher';
const MAX_STUDENTS = 120;
const MAX_ROOMS = 40;

class UserError extends Error {
  constructor(why, next = '') { super(why); this.why = why; this.next = next; }
}
const no = (why, next) => { throw new UserError(why, next); };

export class ClassRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.recent = new Map(); // uid -> Map(rid -> 응답) : 같은 요청 재전송을 한 번만 처리
    ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get('meta')) || null;
      this.rooms = {};
      const all = await ctx.storage.list({ prefix: 'room:' });
      for (const [, r] of all) this.rooms[r.id] = r;
    });
    this.botTimers = {};
    ctx.blockConcurrencyWhile(async () => { this.kickBots(); });
  }

  saveMeta() { this.ctx.storage.put('meta', this.meta); }
  saveRoom(r) { this.ctx.storage.put('room:' + r.id, r); }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      const b = await req.json();
      if (!this.meta) {
        this.meta = { code: b.code, name: b.name, createdAt: b.createdAt, students: {}, roomSeq: 0 };
        this.saveMeta();
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === '/destroy' && req.method === 'POST') {
      for (const w of this.ctx.getWebSockets()) { this.send(w, { type: 'denied', why: '선생님이 이 클래스를 삭제했습니다.', next: '선생님께 새 클래스 코드를 받으세요.', forget: true }); try { w.close(4002, 'deleted'); } catch { } }
      for (const t of Object.values(this.botTimers)) clearTimeout(t);
      this.botTimers = {};
      await this.ctx.storage.deleteAll();
      this.meta = null; this.rooms = {};
      return Response.json({ ok: true });
    }
    if (url.pathname === '/info') {
      if (!this.meta) return new Response('none', { status: 404 });
      return Response.json({ code: this.meta.code, name: this.meta.name });
    }
    if (req.headers.get('upgrade') === 'websocket') {
      if (!this.meta) return new Response('없는 클래스입니다.', { status: 404 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ uid: null, role: null, watch: null });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }

  // ── 소켓 ─────────────────────────────────────────────
  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const att = ws.deserializeAttachment() || {};
    if (msg.type === 'ping') { ws.send('{"type":"pong"}'); return; }
    if (msg.type === 'hello') { await this.hello(ws, msg); return; }
    if (!att.uid) { this.send(ws, { type: 'error', rid: msg.rid, why: '먼저 접속 확인이 필요합니다.', next: '화면을 새로고침하세요.' }); return; }

    // 같은 요청(rid) 재전송은 처음 응답을 그대로 돌려준다
    const rid = typeof msg.rid === 'string' ? msg.rid.slice(0, 40) : null;
    let seen = this.recent.get(att.uid);
    if (!seen) { seen = new Map(); this.recent.set(att.uid, seen); }
    if (rid && seen.has(rid)) { this.send(ws, seen.get(rid)); return; }

    let reply;
    try {
      this.handle(att, msg, ws);
      reply = { type: 'ok', rid };
    } catch (e) {
      if (e instanceof UserError || e instanceof RuleError) reply = { type: 'error', rid, why: e.why, next: e.next };
      else { console.error(e); reply = { type: 'error', rid, why: '서버에서 요청을 처리하지 못했습니다.', next: '잠시 뒤 다시 시도하세요.' }; }
    }
    if (rid) {
      seen.set(rid, reply);
      if (seen.size > 60) seen.delete(seen.keys().next().value);
    }
    this.send(ws, reply);
    if (reply.type === 'ok') this.broadcast();
  }

  async webSocketClose(ws) { this.broadcastSoon(); }
  async webSocketError(ws) { this.broadcastSoon(); }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* 끊긴 소켓 */ } }

  async hello(ws, msg) {
    const m = this.meta;
    let uid = null, role = null, cred = null;
    if (msg.as === 'teacher') {
      const p = await verifyToken(this.env.SESSION_SECRET, msg.token);
      if (!p || p.sub !== 'teacher') { this.send(ws, { type: 'denied', why: '교사 로그인이 만료되었거나 올바르지 않습니다.', next: '다시 로그인하세요.' }); return; }
      uid = TEACHER; role = 'teacher';
    } else if (msg.as === 'student') {
      const s = m.students[msg.sid];
      if (!s || s.secretHash !== (await sha256(String(msg.secret || '')))) {
        this.send(ws, { type: 'denied', why: '이 기기에 저장된 학생 정보를 이 클래스에서 찾을 수 없습니다.', next: '이름을 입력해 새로 참여하세요.', forget: true });
        return;
      }
      uid = s.id; role = 'student';
    } else if (msg.as === 'join') {
      const name = cleanText(msg.name, 12);
      if (!name) { this.send(ws, { type: 'denied', why: '표시 이름을 입력해야 합니다.', next: '1~12자로 이름을 적어 주세요.' }); return; }
      if (Object.keys(m.students).length >= MAX_STUDENTS) { this.send(ws, { type: 'denied', why: '이 클래스의 정원이 가득 찼습니다.', next: '선생님께 알려 주세요.' }); return; }
      const secret = randomId(24);
      const secretHash = await sha256(secret);
      const id = 's_' + randomId(9);
      m.students[id] = { id, name, secretHash, host: false, joinedAt: Date.now() };
      this.saveMeta();
      uid = id; role = 'student'; cred = { sid: id, secret };
    } else return;
    const att = ws.deserializeAttachment() || {};
    ws.serializeAttachment({ ...att, uid, role });
    this.send(ws, { type: 'welcome', uid, role, cred });
    this.broadcast();
  }

  // ── 요청 처리 (동기) ─────────────────────────────────
  handle(att, msg, ws) {
    const uid = att.uid;
    const isTeacher = att.role === 'teacher';
    const m = this.meta;
    const room = msg.roomId != null ? this.rooms[msg.roomId] : null;
    const needRoom = () => { if (!room) no('그 게임방을 찾을 수 없습니다.', '방 목록을 새로 확인하세요.'); return room; };
    const needTeacher = () => { if (!isTeacher) no('선생님만 할 수 있는 일입니다.', ''); };

    switch (msg.type) {
      case 'watch': { // 교사: 관리할 방을 고른다(공개 정보만) / 학생: 자신이 참가했던 끝난 방의 결과 보기
        if (!isTeacher && room && !room.seats.includes(uid)) no('참가했던 방의 결과만 볼 수 있습니다.', '');
        ws.serializeAttachment({ ...att, watch: room ? room.id : null });
        return;
      }
      case 'set_host': {
        needTeacher();
        const s = m.students[msg.sid];
        if (!s) no('그 학생을 찾을 수 없습니다.', '명단을 새로 확인하세요.');
        s.host = !!msg.on;
        this.saveMeta();
        return;
      }
      case 'remove_student': {
        needTeacher();
        const s = m.students[msg.sid];
        if (!s) no('그 학생을 찾을 수 없습니다.');
        const r = this.activeRoomOf(s.id);
        if (r && r.status === 'playing') no('진행 중인 게임의 플레이어는 명단에서 뺄 수 없습니다.', '게임이 끝난 뒤에 다시 시도하세요.');
        if (r) this.leaveSeat(r, s.id);
        delete m.students[s.id];
        this.saveMeta();
        for (const w of this.ctx.getWebSockets()) {
          const a = w.deserializeAttachment();
          if (a && a.uid === s.id) { this.send(w, { type: 'denied', why: '선생님이 명단에서 정리했습니다.', next: '다시 참여하려면 이름을 입력하세요.', forget: true }); try { w.close(4001, 'removed'); } catch {} }
        }
        return;
      }
      case 'create_room': {
        if (!isTeacher && !m.students[uid]?.host) no('방 만들기는 선생님이 지정한 방장만 할 수 있습니다.', '열려 있는 방에 참가하거나, 선생님께 방장 지정을 부탁하세요.');
        const title = cleanText(msg.title, 24);
        if (!title) no('게임방 제목을 입력해야 합니다.', '예: 달빛 성곽 1모둠 (최대 24자)');
        const open = Object.values(this.rooms).filter(r => r.status !== 'finished').length;
        if (open >= MAX_ROOMS) no('열린 게임방이 너무 많습니다.', '끝난 방을 정리한 뒤 다시 만드세요.');
        if (!isTeacher && this.activeRoomOf(uid)) no('이미 다른 게임방에 참가 중입니다.', '지금 방에서 나온 뒤에 새 방을 만드세요.');
        m.roomSeq += 1;
        const r = { id: 'r' + m.roomSeq, title, host: uid, createdAt: Date.now(), status: 'waiting', seats: [], names: {}, game: null };
        if (!isTeacher) { r.seats.push(uid); r.names[uid] = m.students[uid].name; }
        this.rooms[r.id] = r;
        this.saveRoom(r); this.saveMeta();
        if (isTeacher) ws.serializeAttachment({ ...att, watch: r.id });
        return;
      }
      case 'create_practice': { // 혼자 연습: 나 + 봇으로 바로 시작 (다른 학생의 방 목록에는 보이지 않음)
        if (this.activeRoomOf(uid)) no('이미 다른 게임방에 참가 중입니다.', '지금 방에서 나온 뒤에 연습을 시작하세요.');
        const nb = Math.round(Number(msg.bots));
        if (!(nb >= MIN_PLAYERS - 1 && nb <= MAX_PLAYERS - 1)) no(`봇은 ${MIN_PLAYERS - 1}~${MAX_PLAYERS - 1}명까지 고를 수 있습니다.`, '봇 수를 다시 고르세요.');
        const open = Object.values(this.rooms).filter(r => r.status !== 'finished').length;
        if (open >= MAX_ROOMS) no('열린 게임방이 너무 많습니다.', '선생님께 끝난 방 정리를 부탁하세요.');
        m.roomSeq += 1;
        const myName = isTeacher ? '선생님' : m.students[uid].name;
        const r = { id: 'r' + m.roomSeq, title: `${myName}의 연습 게임`, host: uid, practice: true, createdAt: Date.now(), status: 'waiting', seats: [uid], names: { [uid]: myName }, game: null };
        for (let i = 0; i < nb; i++) this.addBot(r);
        r.game = createGame(r.seats.map(id => ({ id, name: r.names[id] })));
        r.status = 'playing'; r.startedAt = Date.now();
        this.rooms[r.id] = r;
        this.saveRoom(r); this.saveMeta();
        if (isTeacher) ws.serializeAttachment({ ...att, watch: r.id });
        return;
      }
      case 'add_bot': case 'remove_bot': {
        const r = needRoom();
        if (!isTeacher && r.host !== uid) no('봇은 방장이나 선생님만 넣고 뺄 수 있습니다.', '');
        if (r.status !== 'waiting') no('대기 중인 방에서만 봇을 넣고 뺄 수 있습니다.', '');
        if (msg.type === 'add_bot') {
          if (r.seats.length >= MAX_PLAYERS) no(`자리가 가득 찼습니다(최대 ${MAX_PLAYERS}명).`, '');
          this.addBot(r);
        } else {
          const b = [...r.seats].reverse().find(isBot);
          if (!b) no('이 방에는 봇이 없습니다.', '');
          this.leaveSeat(r, b);
        }
        this.saveRoom(r);
        return;
      }
      case 'join_room': {
        const r = needRoom();
        if (r.status === 'playing') no('이미 게임이 진행 중인 방입니다. 진행 중에는 새로 참가할 수 없습니다.', '대기 중인 다른 방을 고르세요.');
        if (r.status === 'finished') no('이미 끝난 방입니다.', '대기 중인 다른 방을 고르세요.');
        if (r.seats.includes(uid)) return;
        if (isTeacher && r.host !== TEACHER) no('선생님은 직접 만든 방에만 플레이어로 참가할 수 있습니다.', '');
        if (r.practice) no('혼자 하는 연습 게임에는 참가할 수 없습니다.', '다른 방을 고르세요.');
        const cur = this.activeRoomOf(uid);
        if (cur) no(`이미 「${cur.title}」 방에 참가 중입니다. 한 번에 한 방에만 참가할 수 있습니다.`, '지금 방에서 나온 뒤에 참가하세요.');
        if (r.seats.length >= MAX_PLAYERS) no(`자리가 가득 찼습니다(최대 ${MAX_PLAYERS}명).`, '다른 방을 고르세요.');
        r.seats.push(uid);
        r.names[uid] = isTeacher ? '선생님' : m.students[uid].name;
        this.saveRoom(r);
        return;
      }
      case 'leave_room': {
        const r = needRoom();
        if (!r.seats.includes(uid)) return;
        if (r.status === 'playing') no('진행 중인 게임에서는 나갈 수 없습니다.', '연결이 끊겨도 다시 들어오면 같은 자리로 돌아옵니다.');
        if (r.status === 'waiting' && r.host === uid && !isTeacher) no('방장은 대기실을 나갈 수 없습니다.', '방을 없애려면 [방 닫기]를 누르세요.');
        this.leaveSeat(r, uid);
        return;
      }
      case 'close_room': {
        const r = needRoom();
        if (!isTeacher && r.host !== uid) no('방장이나 선생님만 방을 닫을 수 있습니다.', '');
        if (!isTeacher && r.status === 'playing') no('진행 중인 게임은 선생님만 닫을 수 있습니다.', '');
        delete this.rooms[r.id];
        this.ctx.storage.delete('room:' + r.id);
        return;
      }
      case 'set_room_host': { // 교사가 방장을 다시 정한다 (자동 승계는 하지 않음)
        needTeacher();
        const r = needRoom();
        if (msg.uid !== TEACHER && !r.seats.includes(msg.uid)) no('그 방의 참가자만 방장으로 정할 수 있습니다.', '');
        r.host = msg.uid;
        this.saveRoom(r);
        return;
      }
      case 'start_game': {
        const r = needRoom();
        if (!isTeacher && r.host !== uid) no('게임 시작은 방장만 할 수 있습니다.', '방장이 시작할 때까지 기다리세요.');
        if (r.status !== 'waiting') no('이미 시작했거나 끝난 방입니다.', '');
        if (r.seats.length < MIN_PLAYERS) no(`플레이어가 ${MIN_PLAYERS - r.seats.length}명 더 필요합니다(지금 ${r.seats.length}명, ${MIN_PLAYERS}~${MAX_PLAYERS}명).`, '친구들이 더 들어올 때까지 기다리세요.');
        // 좌석 순서 확정 = 참가 순서
        r.game = createGame(r.seats.map(id => ({ id, name: r.names[id] })));
        r.status = 'playing';
        r.startedAt = Date.now();
        this.saveRoom(r);
        return;
      }
      case 'game': {
        const r = needRoom();
        if (r.status === 'waiting' || !r.game) no('아직 게임이 시작되지 않았습니다.', '');
        if (!r.seats.includes(uid)) no('이 게임의 플레이어가 아닙니다.', '공개된 정보만 볼 수 있습니다.');
        // 화면이 최신 상태일 때만 처리 — 두 번 누르기·늦게 도착한 요청이 중복 처리되지 않게
        if (msg.v !== r.game.v) no('화면이 최신 상태가 아니어서 요청을 처리하지 않았습니다.', '방금 바뀐 화면을 확인하고 다시 눌러 주세요.');
        act(r.game, uid, msg.action || {});
        if (r.game.phase === 'ended') { r.status = 'finished'; r.endedAt = Date.now(); }
        this.saveRoom(r);
        return;
      }
      default:
        no('알 수 없는 요청입니다.', '화면을 새로고침하세요.');
    }
  }

  addBot(r) {
    let k = 1;
    while (r.seats.includes('bot_' + k)) k++;
    const id = 'bot_' + k;
    r.seats.push(id);
    r.names[id] = BOT_NAMES[(k - 1) % BOT_NAMES.length];
  }

  // 봇 차례면 잠깐 뒤에 행동한다. 사람과 똑같이 act() 로 검증한다.
  kickBots() {
    for (const r of Object.values(this.rooms)) {
      if (r.status !== 'playing' || !r.game || this.botTimers[r.id]) continue;
      const g = r.game;
      const actor = g.phase === 'selection' ? g.sel.order[g.sel.step] : g.turn && g.turn.pid;
      if (!isBot(actor)) continue;
      const delay = g.phase === "selection" ? 600 + Math.random() * 500 : 550 + Math.random() * 450;
      this.botTimers[r.id] = setTimeout(() => {
        delete this.botTimers[r.id];
        const room = this.rooms[r.id];
        if (!room || room.status !== 'playing') return;
        const gg = room.game;
        const who = gg.phase === 'selection' ? gg.sel.order[gg.sel.step] : gg.turn && gg.turn.pid;
        if (!isBot(who)) return;
        try { act(gg, who, botAction(gg, who)); }
        catch (e) {
          // 봇의 판단이 거절되면 가장 안전한 행동으로 넘어간다
          try {
            if (gg.phase === 'selection') act(gg, who, { type: 'pick', role: gg.sel.pool[0] || gg.sel.faceDown });
            else if (gg.turn.pendingDraw) act(gg, who, { type: 'keep', card: gg.turn.pendingDraw[0] });
            else act(gg, who, gg.turn.gathered ? { type: 'end_turn' } : { type: 'gather_gold' });
          } catch (e2) { console.error('bot stuck', e2); return; }
        }
        if (gg.phase === 'ended') { room.status = 'finished'; room.endedAt = Date.now(); }
        this.saveRoom(room);
        this.broadcast();
      }, delay);
    }
  }

  activeRoomOf(uid) {
    return Object.values(this.rooms).find(r => r.status !== 'finished' && r.seats.includes(uid)) || null;
  }
  leaveSeat(r, uid) {
    r.seats = r.seats.filter(x => x !== uid);
    delete r.names[uid];
    this.saveRoom(r);
  }

  // ── 상태 내려보내기 ──────────────────────────────────
  broadcastSoon() {
    if (this._t) return;
    this._t = setTimeout(() => { this._t = null; this.broadcast(); }, 300);
  }

  broadcast() {
    this.kickBots();
    const sockets = this.ctx.getWebSockets();
    const online = new Set();
    for (const w of sockets) { const a = w.deserializeAttachment(); if (a && a.uid) online.add(a.uid); }
    for (const w of sockets) {
      const a = w.deserializeAttachment();
      if (!a || !a.uid) continue;
      this.send(w, { type: 'state', ...this.viewFor(a, online) });
    }
  }

  roomSummary(r, online) {
    return {
      id: r.id, title: r.title, status: r.status, host: r.host,
      hostName: r.host === TEACHER ? '선생님' : (this.meta.students[r.host]?.name || r.names[r.host] || '(명단에 없음)'),
      count: r.seats.length, max: MAX_PLAYERS, min: MIN_PLAYERS,
      seats: r.seats.map(id => ({ id, name: r.names[id], online: isBot(id) || online.has(id), bot: isBot(id) })),
      practice: !!r.practice,
      round: r.game ? r.game.round : 0, createdAt: r.createdAt,
    };
  }

  viewFor(att, online) {
    const m = this.meta;
    const uid = att.uid;
    const isTeacher = att.role === 'teacher';
    const rooms = Object.values(this.rooms).sort((a, b) => b.createdAt - a.createdAt);
    const out = {
      klass: { code: m.code, name: m.name },
      me: isTeacher ? { id: TEACHER, name: '선생님', role: 'teacher' } : { id: uid, name: m.students[uid]?.name, role: 'student', host: !!m.students[uid]?.host },
      // 연습 게임은 본인과 선생님에게만 보인다
      rooms: rooms.filter(r => isTeacher || !r.practice || r.seats.includes(uid)).map(r => this.roomSummary(r, online)),
    };
    // 내가 앉아 있는 방(진행 중·대기 중·방금 끝난 방)
    const mine = rooms.find(r => r.status !== 'finished' && r.seats.includes(uid));
    if (mine) out.myRoom = mine.id;
    // 방금 끝난 게임(6시간 이내)은 결과를 다시 볼 수 있게 알려 준다. 결과 화면을 닫을지는 브라우저가 정한다.
    const done = rooms.find(r => r.status === 'finished' && r.seats.includes(uid) && Date.now() - (r.endedAt || 0) < 6 * 3600e3);
    if (done) out.lastFinished = done.id;
    if (isTeacher) {
      out.students = Object.values(m.students).map(s => {
        const r = this.activeRoomOf(s.id);
        return { id: s.id, name: s.name, host: s.host, online: online.has(s.id), room: r ? r.id : null, joinedAt: s.joinedAt };
      }).sort((a, b) => a.joinedAt - b.joinedAt);
    }
    // 방 상세: 학생은 자기가 앉은 방, 교사는 고른 방(또는 자신이 앉은 방)
    const detailId = isTeacher ? (att.watch || out.myRoom) : (out.myRoom || att.watch);
    const dr = detailId && this.rooms[detailId];
    if (dr) {
      const seated = dr.seats.includes(uid);
      out.room = { ...this.roomSummary(dr, online), seated };
      if (dr.game) out.room.game = viewFor(dr.game, seated ? uid : null);
    }
    return out;
  }
}
