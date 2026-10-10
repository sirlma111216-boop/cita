// 진입점 — 정적 파일은 ASSETS 가, /api 와 /ws 는 이 Worker 가 처리한다.
import { verifyPassword, signToken, verifyToken, isCode, cleanText, randomCode } from './auth.js';
export { Registry } from './registry.js';
export { ClassRoom } from './classroom.js';

const TOKEN_HOURS = 12;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const err = (status, why, next = '') => json({ error: why, next }, status);
const registry = env => env.REGISTRY.get(env.REGISTRY.idFromName('global'));
const classroom = (env, code) => env.CLASSROOM.get(env.CLASSROOM.idFromName(code));

async function teacherFrom(req, env) {
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = await verifyToken(env.SESSION_SECRET, tok);
  return p && p.sub === 'teacher' ? p : null;
}

async function readJson(req) {
  try { return await req.json(); } catch { return {}; }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    // 실시간 연결: /ws/<클래스 코드>
    if (path.startsWith('/ws/')) {
      const code = path.slice(4).toUpperCase();
      if (!isCode(code)) return err(400, '클래스 코드 형식이 올바르지 않습니다.', '6자리 코드를 다시 확인하세요.');
      if (req.headers.get('upgrade') !== 'websocket') return err(426, '실시간 연결이 필요합니다.');
      return classroom(env, code).fetch(req);
    }

    if (path === '/api/teacher/login' && req.method === 'POST') {
      const b = await readJson(req);
      const reg = registry(env);
      const chk = await (await reg.fetch('https://r/login-check')).json();
      if (chk.locked) return err(429, '로그인 실패가 너무 많아 잠시 잠겼습니다.', `${chk.waitMin}분 뒤에 다시 시도하세요.`);
      const emailOk = typeof b.email === 'string' && b.email.trim().toLowerCase() === String(env.TEACHER_EMAIL || '').toLowerCase();
      const passOk = await verifyPassword(String(b.password || ''), env.TEACHER_PASS_HASH);
      if (!emailOk || !passOk) {
        await reg.fetch('https://r/login-fail', { method: 'POST', body: '{}' });
        return err(401, '아이디 또는 비밀번호가 맞지 않습니다.', '입력한 내용을 확인하고 다시 시도하세요.');
      }
      await reg.fetch('https://r/login-ok', { method: 'POST', body: '{}' });
      const token = await signToken(env.SESSION_SECRET, { sub: 'teacher', exp: Date.now() + TOKEN_HOURS * 3600e3 });
      return json({ token, hours: TOKEN_HOURS });
    }

    if (path === '/api/teacher/classes') {
      if (!(await teacherFrom(req, env))) return err(401, '교사 로그인이 필요합니다.', '다시 로그인하세요.');
      if (req.method === 'GET') return json(await (await registry(env).fetch('https://r/classes')).json());
      if (req.method === 'POST') {
        const b = await readJson(req);
        const name = cleanText(b.name, 30);
        if (!name) return err(400, '클래스 이름을 입력해야 합니다.', '예: 2학년 3반');
        const item = await (await registry(env).fetch('https://r/create', { method: 'POST', body: JSON.stringify({ name }) })).json();
        await classroom(env, item.code).fetch('https://c/init', { method: 'POST', body: JSON.stringify(item) });
        return json(item);
      }
    }

    const dm = path.match(/^\/api\/teacher\/classes\/([A-Za-z0-9]{6})$/);
    if (dm && req.method === 'DELETE') {
      if (!(await teacherFrom(req, env))) return err(401, '교사 로그인이 필요합니다.', '다시 로그인하세요.');
      const code = dm[1].toUpperCase();
      await classroom(env, code).fetch('https://c/destroy', { method: 'POST' });
      await registry(env).fetch('https://r/remove', { method: 'POST', body: JSON.stringify({ code }) });
      return json({ ok: true });
    }

    // 혼자서 하기: 클래스 코드 없이 봇과 바로 한 판 (교사 목록에 등록하지 않는 1인 전용 공간)
    if (path === '/api/solo' && req.method === 'POST') {
      const b = await readJson(req);
      const code = randomCode();
      const room = classroom(env, code);
      await room.fetch('https://c/init', { method: 'POST', body: JSON.stringify({ code, name: '혼자서 하기', createdAt: Date.now(), solo: true }) });
      const r = await room.fetch('https://c/solo-start', { method: 'POST', body: JSON.stringify({ name: b.name, bots: b.bots }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return err(400, d.error || '혼자서 하기를 시작하지 못했습니다.', d.next || '잠시 뒤 다시 시도하세요.');
      return json(d);
    }

    // 학생 참여 화면: 코드가 맞는지와 클래스 이름만 알려 준다
    const m = path.match(/^\/api\/class\/([A-Za-z0-9]{6})$/);
    if (m && req.method === 'GET') {
      const code = m[1].toUpperCase();
      if (!isCode(code)) return err(404, '없는 클래스 코드입니다.', '선생님이 알려 준 코드를 다시 확인하세요.');
      const r = await classroom(env, code).fetch('https://c/info');
      if (r.status !== 200) return err(404, '없는 클래스 코드입니다.', '선생님이 알려 준 코드를 다시 확인하세요.');
      return json(await r.json());
    }

    if (path.startsWith('/api/')) return err(404, '알 수 없는 요청입니다.');
    return env.ASSETS.fetch(req);
  },
};
