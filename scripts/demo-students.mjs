// 리허설용 가짜 학생: 클래스에 접속해 제목에 '자동'이 들어간 대기 방에 참가하고, 자기 차례면 봇 판단으로 진행한다.
// 연결이 끊기면 저장한 학생 정보로 같은 자리에 다시 접속한다(재접속 경로 확인용).
// 사용법: node scripts/demo-students.mjs <클래스코드> 이름1 이름2 ...   (BASE=wss://배포주소 로 원격도 가능)
import WebSocket from 'ws';
import fs from 'node:fs';
import { botFromView } from '../src/bots.js';

const BASE = process.env.BASE || 'ws://127.0.0.1:8790';
const [code, ...names] = process.argv.slice(2);
const CRED = '.demo-creds.json';
const creds = fs.existsSync(CRED) ? JSON.parse(fs.readFileSync(CRED, 'utf8')) : {};
const save = () => fs.writeFileSync(CRED, JSON.stringify(creds, null, 1));

function run(name) {
  const key = code + ':' + name;
  const ws = new WebSocket(`${BASE}/ws/${code}`);
  let uid, joining = false, lastV = -1;
  ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', ...(creds[key] ? { as: 'student', ...creds[key] } : { as: 'join', name }) })));
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.type === 'welcome') { uid = m.uid; if (m.cred) { creds[key] = m.cred; save(); } console.log(name, '접속', uid); }
    if (m.type === 'denied') { delete creds[key]; save(); }
    if (m.type !== 'state') return;
    if (!m.myRoom) {
      const r = m.rooms.find(r => r.status === 'waiting' && r.count < 7 && !r.practice && r.title.includes('자동'));
      if (r && !joining) { joining = true; ws.send(JSON.stringify({ type: 'join_room', roomId: r.id, rid: 'j' + Math.random() })); setTimeout(() => { joining = false; }, 1500); }
      return;
    }
    const g = m.room && m.room.game;
    if (!g || g.phase === 'ended') return;
    const actor = g.phase === 'selection' ? g.selection.picker : g.turn && g.turn.pid;
    if (actor !== uid || g.v === lastV) return;
    lastV = g.v;
    setTimeout(() => ws.send(JSON.stringify({ type: 'game', roomId: m.room.id, v: g.v, action: botFromView(g, uid), rid: 'g' + Math.random() })), 800);
  });
  ws.on('message', d => { const m = JSON.parse(d); if (m.type === 'error') { lastV = -1; } });
  ws.on('close', () => setTimeout(() => run(name), 1500));
  ws.on('error', () => { });
}
names.forEach(run);
