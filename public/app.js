// 시타델 교실판 — 화면 전환과 시작·교사·학생 화면
import { h, clear, toast, store, closeModal, modalOpen } from './dom.js';
import { Conn } from './net.js';
import { ASSET_BY_ID } from './shared/assets.js';
import { MIN_PLAYERS, MAX_PLAYERS, nim } from './shared/data.js';
import { renderRoom, resetRoomUi, actBtn } from './game.js';
import { openHelp } from './help.js';

const app = document.getElementById('app');
const bg = id => ({ '--bg': `url(/${ASSET_BY_ID[id].file})` });
const S = { conn: null, code: null, as: null, state: null, teacherPlay: false, roomId: null };

// ── 모션 줄이기 ────────────────────────────────────────
const applyMotion = () => document.body.classList.toggle('reduce-motion', !!store.get('reduceMotion', false));
applyMotion();
const motionBtn = () => h('button', { class: 'btn small ghost', 'aria-pressed': store.get('reduceMotion', false) ? 'true' : 'false',
  onclick: () => { store.set('reduceMotion', !store.get('reduceMotion', false)); applyMotion(); render(); } }, store.get('reduceMotion', false) ? '모션 줄이기: 켬' : '모션 줄이기: 끔');

// ── 경로 ──────────────────────────────────────────────
function go(path, replace) {
  if (location.pathname !== path) history[replace ? 'replaceState' : 'pushState'](null, '', path);
  route();
}
window.addEventListener('popstate', route);
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute('href')); }
});

function teacherToken() {
  const t = store.get('teacher');
  if (!t || !t.token || Date.now() > t.exp) return null;
  return t.token;
}

function disconnect() {
  if (S.conn) S.conn.close();
  S.conn = null; S.state = null; S.code = null; S.as = null; S.drawn = false; route._render = null;
  setConn('');
}

function route() {
  closeModal();
  const p = location.pathname.replace(/\/+$/, '') || '/';
  let m;
  if (p === '/') { disconnect(); return paint(entryScreen()); }
  if (p === '/teacher') { disconnect(); return teacherToken() ? teacherHome() : paint(loginScreen()); }
  if ((m = p.match(/^\/teacher\/([A-Za-z0-9]{6})$/))) {
    if (!teacherToken()) return go('/teacher', true);
    return connect(m[1].toUpperCase(), 'teacher');
  }
  if ((m = p.match(/^\/join(?:\/([A-Za-z0-9]{6}))?$/))) { disconnect(); return joinScreen(m[1] ? m[1].toUpperCase() : ''); }
  if ((m = p.match(/^\/c\/([A-Za-z0-9]{6})$/))) {
    const code = m[1].toUpperCase();
    if (!store.get('student:' + code)) return go('/join/' + code, true);
    return connect(code, 'student');
  }
  paint(h('div', { class: 'scene', style: bg('background_entry') }, h('div', { class: 'hero' }, h('div', { class: 'panel' }, h('h2', null, '없는 페이지입니다.'), h('a', { href: '/', 'data-link': '' }, '처음 화면으로')))));
}

// 다시 그려도 입력칸의 글자·포커스·스크롤이 흐트러지지 않게 한다
function paint(node) {
  const active = document.activeElement;
  const focusId = active && active.id && app.contains(active) ? active.id : null;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const keep = {};
  for (const el of app.querySelectorAll('[data-keep]')) { if (el.value != null && el.tagName === 'INPUT') keep[el.dataset.keep] = el.value; }
  const logScroll = app.querySelector('.log')?.scrollTop;
  const y = window.scrollY;
  clear(app).appendChild(node);
  for (const el of app.querySelectorAll('[data-keep]')) if (keep[el.dataset.keep] != null) el.value = keep[el.dataset.keep];
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch { } } }
  if (logScroll != null && app.querySelector('.log')) app.querySelector('.log').scrollTop = logScroll;
  window.scrollTo(0, y);
}
function render() { route._render ? route._render() : route(); }

function setConn(kind) {
  const el = document.getElementById('conn');
  if (kind === 'lost') { el.hidden = false; el.textContent = '연결이 끊겼습니다. 다시 연결하는 중… (게임 상태는 그대로 보존됩니다)'; }
  else { el.hidden = true; }
}

function topbar(extra = []) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '/', 'data-link': '' }, h('img', { src: '/' + ASSET_BY_ID.emblem_city.file, alt: '', width: 34, height: 34 }), '시타델 교실판'),
    ...extra, h('span', { class: 'spacer' }),
    h('button', { class: 'btn small ghost', onclick: () => openHelp() }, '규칙 도움말'), motionBtn());
}

// ── 시작 화면 ──────────────────────────────────────────
function entryScreen() {
  const codeIn = h('input', { class: 'input code', id: 'entry-code', maxlength: 6, placeholder: 'ABC123', autocomplete: 'off', 'aria-label': '클래스 코드 6자리', 'data-keep': 'entry-code' });
  const submit = e => { e.preventDefault(); const c = codeIn.value.trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(c)) { toast('클래스 코드는 6자리입니다.', '선생님이 알려 준 코드를 확인하세요.'); return; } go('/join/' + c); };
  return h('div', { class: 'scene', style: bg('background_entry') },
    h('div', { class: 'hero' }, h('div', { class: 'hero-inner' },
      h('img', { class: 'emblem', src: '/' + ASSET_BY_ID.emblem_city.file, alt: ASSET_BY_ID.emblem_city.alt, width: 110, height: 110 }),
      h('h1', null, '시타델 교실판'),
      h('p', { class: 'lead' }, '안개 낀 성곽 도시에서 비밀 역할을 고르고, 금화를 모아 가장 아름다운 도시를 세우세요. 선생님이 클래스를 열면 학생들은 여러 게임방에서 함께 끝까지 플레이합니다.'),
      h('div', { class: 'hero-actions' },
        h('section', { class: 'panel stack' }, h('h2', null, '학생: 클래스 참여'),
          h('form', { class: 'stack', onsubmit: submit },
            h('div', { class: 'field' }, h('label', { for: 'entry-code' }, '선생님이 알려 준 클래스 코드'), codeIn),
            h('button', { class: 'btn primary big', type: 'submit', style: { width: '100%' } }, '참여하기'))),
        soloPanel(),
        h('section', { class: 'panel stack' }, h('h2', null, '선생님으로 시작'),
          h('p', { class: 'muted' }, '클래스를 만들고, 학생 명단과 방장을 관리하고, 게임방을 엽니다.'),
          h('a', { class: 'btn big', href: '/teacher', 'data-link': '', style: { width: '100%' } }, '교사 로그인'))),
      h('div', { class: 'features' },
        h('div', null, h('b', null, '4~7명 한 방'), '여러 게임방을 동시에'),
        h('div', null, h('b', null, '비밀 역할 8종'), '암살자부터 장군까지'),
        h('div', null, h('b', null, '건물 68장'), '기본 54장 + 특수 14장'),
        h('div', null, h('b', null, '끊겨도 괜찮아요'), '다시 들어오면 같은 자리')),
      h('p', { class: 'small', style: { marginTop: '18px' } }, h('button', { class: 'btn small ghost', onclick: () => openHelp() }, '규칙 먼저 읽어 보기'), ' ', motionBtn()))));
}

// 메인 화면의 혼자서 하기: 클래스 코드 없이 봇과 바로 한 판
function soloPanel() {
  const last = store.get('lastSolo');
  const nameIn = h('input', { class: 'input', id: 'solo-name', maxlength: 12, placeholder: '예: 별빛기사', autocomplete: 'nickname', 'data-keep': 'solo-name', value: store.get('soloName', '') });
  const sel = h('select', { class: 'input', id: 'solo-bots', 'aria-label': '함께할 봇 수' }, [3, 4, 5, 6].map(n => h('option', { value: n, selected: n === 3 }, `봇 ${n}명 (${n + 1}인 게임)`)));
  const btn = h('button', { class: 'btn teal big', type: 'submit', style: { width: '100%' } }, '봇과 바로 시작');
  const submit = async e => {
    e.preventDefault();
    btn.disabled = true;
    try {
      const name = nameIn.value.trim() || '여행자';
      store.set('soloName', name);
      const r = await fetch('/api/solo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, bots: Number(sel.value) }) });
      const d = await r.json();
      if (!r.ok) { toast(d.error, d.next); return; }
      store.set('student:' + d.code, d.cred);
      store.set('lastSolo', { code: d.code, at: Date.now() });
      go('/c/' + d.code);
    } catch { toast('서버에 연결하지 못했습니다.', '인터넷 연결을 확인하고 다시 시도하세요.'); }
    finally { btn.disabled = false; }
  };
  const canResume = last && Date.now() - last.at < 23 * 3600e3 && store.get('student:' + last.code);
  return h('section', { class: 'panel stack' }, h('h2', null, '혼자서 하기'),
    h('p', { class: 'muted' }, '클래스 코드 없이 봇들과 바로 한 판. 규칙을 익히기에 좋아요.'),
    h('form', { class: 'stack', onsubmit: submit },
      h('div', { class: 'field' }, h('label', { for: 'solo-name' }, '내 이름 (선택)'), nameIn),
      h('div', { class: 'field' }, h('label', { for: 'solo-bots' }, '함께할 봇'), sel),
      btn),
    canResume ? h('a', { class: 'btn small', href: '/c/' + last.code, 'data-link': '' }, '하던 혼자 게임 이어하기') : null);
}

// ── 교사 로그인 ────────────────────────────────────────
function loginScreen() {
  const email = h('input', { class: 'input', id: 'login-email', type: 'email', autocomplete: 'username', required: true, 'data-keep': 'login-email' });
  const pw = h('input', { class: 'input', id: 'login-pw', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn primary big', type: 'submit', style: { width: '100%' } }, '로그인');
  const submit = async e => {
    e.preventDefault();
    btn.disabled = true;
    try {
      const r = await fetch('/api/teacher/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.value, password: pw.value }) });
      const d = await r.json();
      if (!r.ok) { toast(d.error, d.next); return; }
      store.set('teacher', { token: d.token, exp: Date.now() + d.hours * 3600e3 - 60e3 });
      go('/teacher', true);
    } catch { toast('서버에 연결하지 못했습니다.', '인터넷 연결을 확인하고 다시 시도하세요.'); }
    finally { btn.disabled = false; }
  };
  return h('div', { class: 'scene', style: bg('background_class_lobby') }, topbar(),
    h('div', { class: 'hero', style: { minHeight: 'calc(100dvh - 60px)' } },
      h('form', { class: 'panel stack', style: { width: 'min(440px, 100%)', textAlign: 'left' }, onsubmit: submit },
        h('h1', { style: { fontSize: '1.8rem' } }, '교사 로그인'),
        h('p', { class: 'muted' }, '교사 권한은 서버에서 인증한 계정에만 주어집니다.'),
        h('div', { class: 'field' }, h('label', { for: 'login-email' }, '아이디(이메일)'), email),
        h('div', { class: 'field' }, h('label', { for: 'login-pw' }, '비밀번호'), pw),
        btn)));
}

// ── 교사: 클래스 목록 ──────────────────────────────────
async function teacherHome() {
  const tok = teacherToken();
  const listBox = h('div', { class: 'stack' }, h('p', { class: 'muted' }, '불러오는 중…'));
  const nameIn = h('input', { class: 'input', id: 'class-name', maxlength: 30, placeholder: '예: 2학년 3반 보드게임', 'data-keep': 'class-name' });
  const create = async e => {
    e.preventDefault();
    const r = await fetch('/api/teacher/classes', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ name: nameIn.value }) });
    const d = await r.json();
    if (!r.ok) { if (r.status === 401) { store.del('teacher'); return go('/teacher', true); } toast(d.error, d.next); return; }
    go('/teacher/' + d.code);
  };
  const logout = () => { store.del('teacher'); go('/'); };
  route._render = null;
  paint(h('div', { class: 'scene', style: bg('background_class_lobby') }, topbar([h('button', { class: 'btn small', onclick: logout }, '로그아웃')]),
    h('div', { class: 'wrap' }, h('div', { class: 'dash' },
      h('section', { class: 'panel stack' }, h('h2', null, '새 클래스 만들기'),
        h('form', { class: 'stack', onsubmit: create }, h('div', { class: 'field' }, h('label', { for: 'class-name' }, '클래스 이름'), nameIn), h('button', { class: 'btn primary', type: 'submit' }, '클래스 만들기')),
        h('p', { class: 'small muted' }, '클래스마다 학생 참여 코드가 따로 만들어지고, 다른 클래스의 학생에게는 명단과 게임방이 보이지 않습니다.')),
      h('section', { class: 'panel stack' }, h('h2', null, '내 클래스'), listBox)))));
  try {
    const r = await fetch('/api/teacher/classes', { headers: { authorization: 'Bearer ' + tok } });
    if (r.status === 401) { store.del('teacher'); return go('/teacher', true); }
    const list = await r.json();
    clear(listBox).append(list.length ? h('ul', { class: 'list classlist' }, list.map(c => h('li', null,
      h('a', { class: 'btn grow', href: '/teacher/' + c.code, 'data-link': '' }, h('span', null, c.name), h('span', { class: 'badge' }, c.code)),
      h('button', { class: 'btn small ghost', 'aria-label': c.name + ' 삭제', onclick: async () => {
        if (!confirm(`「${c.name}」 클래스를 삭제할까요? 학생 명단과 게임방이 모두 사라지며 되돌릴 수 없습니다.`)) return;
        const r = await fetch('/api/teacher/classes/' + c.code, { method: 'DELETE', headers: { authorization: 'Bearer ' + tok } });
        if (r.ok) { toast('클래스를 삭제했습니다.', '', 'info'); teacherHome(); } else toast('삭제하지 못했습니다.', '다시 로그인한 뒤 시도하세요.');
      } }, '삭제'))))
      : h('p', { class: 'muted' }, '아직 만든 클래스가 없습니다. 왼쪽에서 클래스를 만드세요.'));
  } catch { clear(listBox).append(h('p', { class: 'why' }, '목록을 불러오지 못했습니다. 새로고침해 보세요.')); }
}

// ── 학생: 참여 ─────────────────────────────────────────
async function joinScreen(code) {
  route._render = null;
  if (code && store.get('student:' + code)) return go('/c/' + code, true);
  const codeIn = h('input', { class: 'input code', id: 'join-code', maxlength: 6, value: code, autocomplete: 'off', 'data-keep': 'join-code' });
  const nameIn = h('input', { class: 'input', id: 'join-name', maxlength: 12, placeholder: '예: 별빛기사', autocomplete: 'nickname', 'data-keep': 'join-name' });
  const info = h('p', { class: 'muted' }, code ? '클래스를 확인하는 중…' : '');
  const btn = h('button', { class: 'btn primary big', type: 'submit', style: { width: '100%' } }, '클래스에 들어가기');
  const submit = async e => {
    e.preventDefault();
    const c = codeIn.value.trim().toUpperCase();
    const name = nameIn.value.trim();
    if (!/^[A-Z0-9]{6}$/.test(c)) return toast('클래스 코드는 6자리입니다.', '선생님이 알려 준 코드를 확인하세요.');
    if (!name) return toast('표시 이름을 입력해야 합니다.', '친구들이 알아볼 수 있는 이름을 1~12자로 적어 주세요.');
    btn.disabled = true;
    const r = await fetch('/api/class/' + c);
    if (!r.ok) { btn.disabled = false; const d = await r.json().catch(() => ({})); return toast(d.error || '없는 클래스 코드입니다.', d.next || '코드를 다시 확인하세요.'); }
    S.pendingName = name;
    history.replaceState(null, '', '/c/' + c);
    connect(c, 'join');
  };
  paint(h('div', { class: 'scene', style: bg('background_class_lobby') }, topbar(),
    h('div', { class: 'hero', style: { minHeight: 'calc(100dvh - 60px)' } },
      h('form', { class: 'panel stack', style: { width: 'min(460px, 100%)', textAlign: 'left' }, onsubmit: submit },
        h('h1', { style: { fontSize: '1.8rem' } }, '클래스 참여'), info,
        h('div', { class: 'field' }, h('label', { for: 'join-code' }, '클래스 코드'), codeIn),
        h('div', { class: 'field' }, h('label', { for: 'join-name' }, '게임에서 쓸 표시 이름'), nameIn),
        h('p', { class: 'small muted' }, '이름은 친구들에게 보입니다. 이 기기에 참여 정보가 저장되어, 새로고침하거나 연결이 끊겨도 같은 학생으로 돌아옵니다.'),
        btn))));
  if (code) {
    try {
      const r = await fetch('/api/class/' + code);
      const d = await r.json();
      info.textContent = r.ok ? `「${d.name}」 클래스에 참여합니다.` : `${d.error} ${d.next}`;
      if (r.ok) nameIn.focus();
    } catch { info.textContent = '서버에 연결하지 못했습니다.'; }
  }
}

// ── 실시간 연결 ────────────────────────────────────────
function connect(code, as) {
  if (S.conn && S.code === code && (S.as === as || (S.as === 'join' && as === 'student'))) { render(); return; }
  disconnect();
  S.code = code; S.as = as;
  route._render = () => draw();
  paint(h('div', { class: 'scene', style: bg('background_class_lobby') }, topbar(), h('div', { class: 'wrap' }, h('div', { class: 'panel' }, '접속하는 중…'))));
  let joinName = S.pendingName;
  S.conn = new Conn(code, () => {
    if (as === 'teacher') return { as: 'teacher', token: teacherToken() };
    const cred = store.get('student:' + code);
    if (cred) return { as: 'student', sid: cred.sid, secret: cred.secret };
    return { as: 'join', name: joinName };
  }, {
    status: setConn,
    welcome: m => { if (m.cred) { store.set('student:' + code, m.cred); joinName = null; S.pendingName = null; S.as = 'student'; } },
    denied: m => {
      if (m.forget) store.del('student:' + code);
      toast(m.why, m.next);
      if (as === 'teacher') { store.del('teacher'); go('/teacher', true); }
      else go('/join/' + code, true);
    },
    state: m => { S.state = m; if (!modalOpen() || !S.drawn) draw(); else S.dirty = true; },
  });
}
// 모달이 열려 있으면 닫힐 때까지 다시 그리기를 미룬다(읽는 중 화면이 바뀌지 않게) — 단 내 차례·선택 변화는 즉시
const mo = new MutationObserver(() => { if (!modalOpen() && S.dirty) { S.dirty = false; draw(); } });
mo.observe(document.getElementById('modal-root'), { childList: true });

function draw() {
  const st = S.state;
  if (!st) return;
  S.drawn = true;
  if (S.as === 'teacher') return paint(teacherConsole(st));
  return paint(studentLobby(st));
}

// ── 교사 콘솔 ──────────────────────────────────────────
function teacherConsole(st) {
  const conn = S.conn;
  const link = `${location.origin}/join/${st.klass.code}`;
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what}를 복사했습니다.`, '', 'info'); } catch { toast('복사하지 못했습니다.', '직접 선택해 복사하세요.'); } };
  const room = st.room;
  // 선생님이 플레이어로 앉은 진행 중 게임: 플레이 화면으로 전환할 수 있다
  if (room && room.seated && room.status !== 'waiting' && S.teacherPlay) {
    return h('div', { class: 'scene dim', style: bg('background_game_table') },
      topbar([h('span', { class: 'badge' }, st.klass.name), h('button', { class: 'btn small', onclick: () => { S.teacherPlay = false; draw(); } }, '← 관리 화면으로')]),
      h('div', { class: 'wrap', style: { maxWidth: '1600px', paddingBottom: 0 } }, h('h2', null, room.title)),
      renderRoom({ room, conn, me: st.me, isTeacher: true, rerender: draw, onLeave: () => { S.teacherPlay = false; conn.request({ type: 'watch', roomId: null }); draw(); } }));
  }
  const titleIn = h('input', { class: 'input', id: 't-room-title', maxlength: 24, placeholder: '예: 달빛 성곽 1모둠', 'data-keep': 't-room-title' });
  const students = st.students || [];
  const roomById = Object.fromEntries(st.rooms.map(r => [r.id, r]));
  const roster = h('ul', { class: 'list', 'aria-label': '참여 학생 명단' }, students.length ? students.map(s => h('li', null,
    h('span', { class: 'dot' + (s.online ? ' on' : ''), 'aria-label': s.online ? '접속 중' : '접속 안 함' }),
    h('span', { class: 'nm grow' }, s.name, h('span', { class: 'small muted' }, ' #' + s.id.slice(-4))),
    s.room ? h('span', { class: 'badge' }, roomById[s.room]?.title || '게임방') : h('span', { class: 'small muted' }, '대기'),
    actBtn(s.host ? '방장 해제' : '방장 지정', s.host ? 'small on' : 'small', () => conn.request({ type: 'set_host', sid: s.id, on: !s.host })),
    h('button', { class: 'btn small ghost', 'aria-label': `${s.name} 명단에서 빼기`, onclick: async () => { if (confirm(`${s.name} 학생을 명단에서 뺄까요? 이 기기로 다시 참여하려면 이름을 새로 입력해야 합니다.`)) { try { await conn.request({ type: 'remove_student', sid: s.id }); } catch (e) { toast(e.why, e.next); } } } }, '✕')))
    : h('li', { class: 'muted' }, '아직 참여한 학생이 없습니다. 클래스 코드나 초대 링크를 알려 주세요.'));

  const roomCards = h('div', { class: 'roomgrid' }, st.rooms.length ? st.rooms.map(r => h('button', {
    class: 'roomcard' + (room && room.id === r.id ? ' active' : ''), type: 'button', 'aria-pressed': room && room.id === r.id ? 'true' : 'false',
    onclick: () => conn.request({ type: 'watch', roomId: r.id }).catch(e => toast(e.why, e.next)),
  },
  h('div', { class: 'row' }, statusBadge(r.status), r.practice ? h('span', { class: 'badge' }, '혼자 연습') : null, h('span', { class: 'small muted' }, r.status === 'playing' ? `${r.round}라운드` : '')),
  h('h3', null, r.title), h('div', { class: 'small' }, `방장: ${r.hostName} · ${r.count}/${r.max}명`),
  h('div', { class: 'seats' }, r.seats.map(s => h('span', { class: 'seat' }, h('span', { class: 'dot' + (s.online ? ' on' : '') }), s.name)))))
    : h('p', { class: 'muted' }, '아직 게임방이 없습니다. 위에서 직접 만들거나, 학생을 방장으로 지정하세요.'));

  let detail = null;
  if (room) {
    const hostSel = h('select', { class: 'input', id: 't-host-sel', 'aria-label': '방장 다시 지정' },
      h('option', { value: 'teacher', selected: room.host === 'teacher' }, '선생님'),
      room.seats.map(s => h('option', { value: s.id, selected: room.host === s.id }, s.name)));
    detail = h('section', { class: 'panel stack' },
      h('div', { class: 'row' }, h('h2', { class: 'grow', style: { margin: 0 } }, room.title), statusBadge(room.status),
        h('button', { class: 'btn small ghost', onclick: () => conn.request({ type: 'watch', roomId: null }) }, '닫기')),
      h('div', { class: 'row' }, h('label', { for: 't-host-sel' }, '방장'), hostSel,
        actBtn('방장 바꾸기', 'small', () => conn.request({ type: 'set_room_host', roomId: room.id, uid: hostSel.value })),
        h('span', { class: 'small muted' }, '방장 연결이 끊겨도 자동으로 넘어가지 않습니다. 왕관(게임 속 역할)과는 별개입니다.')),
      room.status !== 'waiting' && room.seated ? h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { S.teacherPlay = true; draw(); } }, '내 플레이 화면 열기'), h('span', { class: 'small muted' }, '선생님도 이 게임의 플레이어입니다.')) : null,
      room.status === 'playing' ? h('div', { class: 'row' }, actBtn('게임 강제 종료(방 닫기)', 'danger small', async () => { if (confirm('진행 중인 게임을 끝내고 방을 닫을까요? 되돌릴 수 없습니다.')) await conn.request({ type: 'close_room', roomId: room.id }); })) : null,
      room.status === 'finished' ? h('div', { class: 'row' }, actBtn('끝난 방 정리', 'small', () => conn.request({ type: 'close_room', roomId: room.id }))) : null,
      h('div', { class: 'teacher-room' }, renderRoom({ room, conn, me: st.me, isTeacher: true, rerender: draw, onLeave: () => conn.request({ type: 'watch', roomId: null }) })));
  }

  return h('div', { class: 'scene', style: bg('background_class_lobby') },
    topbar([h('a', { class: 'btn small', href: '/teacher', 'data-link': '' }, '← 클래스 목록'), h('span', { class: 'badge' }, '선생님')]),
    h('div', { class: 'wrap', style: { maxWidth: '1500px' } },
      h('h1', { style: { fontSize: 'clamp(1.5rem,3vw,2.2rem)' } }, st.klass.name),
      h('div', { class: 'dash' },
        h('div', { class: 'stack' },
          h('section', { class: 'panel stack' }, h('h2', null, '학생 참여 방법'),
            h('div', { class: 'codebox' }, h('span', { class: 'muted' }, '클래스 코드'), h('span', { class: 'code-big' }, st.klass.code), h('button', { class: 'btn small', onclick: () => copy(st.klass.code, '클래스 코드') }, '코드 복사')),
            h('div', { class: 'linkbox' }, link), h('button', { class: 'btn small', onclick: () => copy(link, '초대 링크') }, '초대 링크 복사')),
          h('section', { class: 'panel stack' }, h('div', { class: 'row' }, h('h2', { class: 'grow', style: { margin: 0 } }, '참여 학생'), h('span', { class: 'badge' }, `${students.filter(s => s.online).length}명 접속 / ${students.length}명`)),
            h('p', { class: 'small muted' }, '방장으로 지정한 학생만 게임방을 만들 수 있습니다. 같은 이름이어도 #번호로 구분됩니다.'),
            roster)),
        h('div', { class: 'stack' },
          h('section', { class: 'panel stack' }, h('h2', null, '게임방'),
            h('form', { class: 'row', onsubmit: e => { e.preventDefault(); const b = e.submitter; b.disabled = true; conn.request({ type: 'create_room', title: titleIn.value }).then(() => { titleIn.value = ''; }).catch(err => toast(err.why, err.next)).finally(() => { b.disabled = false; }); } },
              h('label', { class: 'sr', for: 't-room-title' }, '게임방 제목'), h('div', { class: 'grow' }, titleIn), h('button', { class: 'btn primary', type: 'submit' }, '방 만들기')),
            roomCards),
          detail,
          practicePanel(conn, '선생님이 직접 봇들과 한 판 해 보며 규칙을 익힐 수 있습니다. 시작하면 [내 플레이 화면 열기]로 들어가세요.')))));
}

function practicePanel(conn, note) {
  const sel = h('select', { class: 'input', id: 'practice-bots', style: { width: 'auto' }, 'aria-label': '함께할 봇 수' },
    [3, 4, 5, 6].map(n => h('option', { value: n, selected: n === 3 }, `봇 ${n}명 (${n + 1}인 게임)`)));
  return h('section', { class: 'panel stack' }, h('h2', null, '혼자 연습하기'),
    h('p', { class: 'small muted' }, note),
    h('div', { class: 'row' }, h('label', { for: 'practice-bots' }, '함께할 봇'), sel,
      actBtn('봇과 게임 시작', 'teal', () => conn.request({ type: 'create_practice', bots: Number(sel.value) }))),
    h('p', { class: 'small muted' }, '봇은 사람과 똑같이 자기 손패와 공개된 정보만 보고 판단합니다. 연습 게임은 다른 학생의 방 목록에 보이지 않습니다.'));
}

function statusBadge(s) {
  return h('span', { class: 'badge ' + s }, s === 'waiting' ? '대기 중' : s === 'playing' ? '진행 중' : '종료');
}

// ── 학생 로비 ──────────────────────────────────────────
function studentLobby(st) {
  const conn = S.conn;
  const me = st.me;
  const dismissed = store.get('dismissed', []);
  // 결과 화면: 방금 끝난 게임은 [로비로 돌아가기]를 누를 때까지 보여 준다
  if (!st.myRoom && st.lastFinished && !dismissed.includes(S.code + st.lastFinished) && (!st.room || st.room.id !== st.lastFinished)) {
    conn.request({ type: 'watch', roomId: st.lastFinished }).catch(() => { });
  }
  const room = st.room;
  if (room && (room.status !== 'finished' || !dismissed.includes(S.code + room.id))) {
    if (S.roomId !== room.id) { resetRoomUi(); S.roomId = room.id; }
    const leave = () => {
      store.set('dismissed', [...dismissed, S.code + room.id].slice(-30));
      conn.request({ type: 'watch', roomId: null }).catch(() => { });
      draw();
    };
    const scene = room.status === 'finished' ? 'background_results' : 'background_game_table';
    return h('div', { class: 'scene dim', style: bg(scene) },
      topbar([h('span', { class: 'badge' }, st.klass.name), h('span', { class: 'small' }, me.name), h('span', { class: 'small muted' }, '· ', room.title)]),
      renderRoom({ room, conn, me, isTeacher: false, rerender: draw, onLeave: leave, leaveLabel: st.klass.solo ? '한 판 더 하기 / 처음으로' : null }));
  }
  S.roomId = null;
  if (st.klass.solo) {
    return h('div', { class: 'scene', style: bg('background_class_lobby') },
      topbar([h('span', { class: 'badge' }, '혼자서 하기')]),
      h('div', { class: 'wrap stack', style: { maxWidth: '720px' } },
        h('section', { class: 'panel' }, h('div', { class: 'muted small' }, '혼자서 하기'), h('h1', { style: { fontSize: 'clamp(1.5rem,3vw,2.1rem)', margin: 0 } }, nim(me.name))),
        practicePanel(conn, '봇 수를 골라 한 판 더 해 보세요. 게임 기록은 24시간 동안 이 기기에서 이어 볼 수 있습니다.'),
        h('a', { class: 'btn', href: '/', 'data-link': '' }, '처음 화면으로')));
  }
  const titleIn = h('input', { class: 'input', id: 's-room-title', maxlength: 24, placeholder: '예: 달빛 성곽 1모둠', 'data-keep': 's-room-title' });
  const visible = st.rooms.filter(r => r.status !== 'finished');
  return h('div', { class: 'scene', style: bg('background_class_lobby') },
    topbar([h('span', { class: 'badge' }, st.klass.name)]),
    h('div', { class: 'wrap stack' },
      h('section', { class: 'panel row' },
        h('div', { class: 'grow' }, h('div', { class: 'muted small' }, `${st.klass.name} 클래스`), h('h1', { style: { fontSize: 'clamp(1.5rem,3vw,2.1rem)', margin: 0 } }, me.name, ' 님')),
        me.host ? h('span', { class: 'badge host' }, '방장으로 지정됨') : h('span', { class: 'small muted' }, '방 만들기는 선생님이 지정한 방장만 할 수 있어요.')),
      me.host ? h('section', { class: 'panel stack' }, h('h2', null, '새 게임방 만들기'),
        h('form', { class: 'row', onsubmit: e => { e.preventDefault(); const b = e.submitter; b.disabled = true; conn.request({ type: 'create_room', title: titleIn.value }).catch(err => toast(err.why, err.next)).finally(() => { b.disabled = false; }); } },
          h('label', { class: 'sr', for: 's-room-title' }, '게임방 제목'), h('div', { class: 'grow' }, titleIn), h('button', { class: 'btn primary', type: 'submit' }, '방 만들기')),
        h('p', { class: 'small muted' }, '방을 만들면 내가 첫 번째 자리에 앉고, 방장으로서 게임을 시작할 수 있습니다.')) : null,
      h('section', { class: 'panel stack' },
        h('h2', null, '게임방 목록'),
        h('p', { class: 'small muted' }, `대기 중이고 자리가 있는 방에 참가할 수 있습니다. 한 방에 ${MIN_PLAYERS}~${MAX_PLAYERS}명이 함께합니다.`),
        h('div', { class: 'roomgrid' }, visible.length ? visible.map(r => {
          const full = r.count >= r.max;
          const why = r.status === 'playing' ? '게임이 진행 중이라 새로 참가할 수 없습니다.' : full ? '자리가 가득 찼습니다.' : null;
          return h('article', { class: 'roomcard' },
            h('div', { class: 'row' }, statusBadge(r.status), r.practice ? h('span', { class: 'badge' }, '혼자 연습') : null, h('span', { class: 'small muted' }, `${r.count} / ${r.max}명`)),
            h('h3', null, r.title), h('div', { class: 'small' }, '방장: ', r.hostName),
            h('div', { class: 'seats' }, r.seats.map(s => h('span', { class: 'seat' }, s.name)), Array.from({ length: Math.max(0, MIN_PLAYERS - r.count) }, () => h('span', { class: 'seat empty' }, '빈자리'))),
            actBtn(why ? (r.status === 'playing' ? '진행 중' : '만석') : '참가하기', why ? '' : 'primary', () => conn.request({ type: 'join_room', roomId: r.id }), { disabled: !!why }),
            why ? h('p', { class: 'why' }, why, ' 다른 방을 골라 보세요.') : null);
        }) : h('p', { class: 'muted' }, '아직 열린 게임방이 없습니다. 선생님이나 방장이 방을 만들면 여기에 나타납니다.'))),
      practicePanel(conn, '친구들을 기다리는 동안, 또는 규칙을 익히고 싶을 때 봇들과 바로 한 판 할 수 있습니다. 방장이 아니어도 됩니다.')));
}

route();
