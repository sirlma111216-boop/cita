// 게임방 화면 — 대기실 · 역할 선택 · 게임 · 결과 (교사와 학생이 함께 쓴다)
import { h, toast, openModal, closeModal, store } from './dom.js';
import { ROLES, ROLE_BY_ID, ROLE_BY_RANK, DISTRICT_TYPES, MIN_PLAYERS, MAX_PLAYERS, COMPLETE_CITY, josa, nim } from './shared/data.js';
import { ASSET_BY_ID, districtArt } from './shared/assets.js';
import { districtCard, roleCard, backCard, defOf, zoomDistrict, zoomRole, img, typeChip } from './cards.js';
import { openHelp } from './help.js';

const icon = (id, cls, alt = '') => h('img', { src: '/' + ASSET_BY_ID[id].file, alt, class: cls, width: 64, height: 64 });
const roleName = id => ROLE_BY_ID[id].ko;
const ui = { mode: null, picks: [], key: '', pickRole: null, target: null, seenCity: new Set(), firstPaint: true };

// 버튼 → 요청. 응답을 기다리는 동안 버튼을 잠가 두 번 누르기를 막는다.
export function actBtn(label, cls, run, opts = {}) {
  const b = h('button', { class: 'btn ' + (cls || ''), type: 'button', disabled: opts.disabled, 'aria-describedby': opts.whyId }, label);
  b.addEventListener('click', async () => {
    if (b.disabled || b.classList.contains('busy')) return;
    b.classList.add('busy');
    try { await run(); } catch (e) { toast(e.why || '요청을 처리하지 못했습니다.', e.next); }
    finally { b.classList.remove('busy'); }
  });
  return b;
}

// ── 대기실 ─────────────────────────────────────────────
function waitingRoom(ctx) {
  const { room, conn, me, isTeacher } = ctx;
  const n = room.count;
  const isHost = room.host === me.id || isTeacher;
  const short = Math.max(0, MIN_PLAYERS - n);
  const reason = short ? `플레이어가 ${short}명 더 필요합니다. (지금 ${n}명 / ${MIN_PLAYERS}~${MAX_PLAYERS}명)` : '';
  const seats = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const s = room.seats[i];
    seats.push(s ? h('div', { class: 'seatbox' },
      h('div', { class: 'n' }, `${i + 1}번 자리` + (s.id === room.host ? ' · 방장' : '')),
      h('div', { class: 'row' }, h('span', { class: 'dot' + (s.online ? ' on' : ''), title: s.online ? '접속 중' : '연결 끊김' }), h('b', null, s.name), s.bot ? h('span', { class: 'badge' }, '봇') : null, s.id === me.id ? h('span', { class: 'badge' }, '나') : null))
      : h('div', { class: 'seatbox empty' }, i < MIN_PLAYERS ? `${i + 1}번 자리 (필수)` : `${i + 1}번 자리 (선택)`));
  }
  return h('div', { class: 'wrap' },
    h('div', { class: 'waiting' },
      h('section', { class: 'panel stack' },
        h('div', { class: 'row' }, h('span', { class: 'badge waiting' }, '대기 중'), h('span', { class: 'muted' }, '방장: ', room.hostName)),
        h('h1', { style: { fontSize: 'clamp(1.6rem,3.6vw,2.4rem)' } }, room.title),
        h('div', null, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', null, `참가자 ${n} / ${MAX_PLAYERS}명`), h('span', { class: 'muted small' }, `${MIN_PLAYERS}명부터 시작할 수 있어요`)),
          h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': MAX_PLAYERS, 'aria-valuenow': n, 'aria-label': '참가 인원' }, h('i', { style: { width: (n / MAX_PLAYERS * 100) + '%' } }))),
        h('div', { class: 'seatgrid' }, seats),
        h('p', { class: 'small muted' }, '자리 순서는 참가한 순서이며, 게임을 시작하면 그대로 확정됩니다. 역할을 고르는 순서는 이 좌석 순서를 따릅니다.'),
        h('div', { class: 'row' },
          isHost ? actBtn('게임 시작', 'primary big', () => conn.request({ type: 'start_game', roomId: room.id }), { disabled: !!short, whyId: 'start-why' }) : null,
          !isHost ? h('span', { class: 'muted' }, '방장이 게임을 시작할 때까지 기다려 주세요.') : null,
          room.seated && !(room.host === me.id && !isTeacher) ? actBtn('대기실 나가기', 'ghost', () => conn.request({ type: 'leave_room', roomId: room.id })) : null,
          isHost && n < MAX_PLAYERS ? actBtn('봇 추가', 'teal small', () => conn.request({ type: 'add_bot', roomId: room.id })) : null,
          isHost && room.seats.some(x => x.bot) ? actBtn('봇 빼기', 'small', () => conn.request({ type: 'remove_bot', roomId: room.id })) : null,
          isTeacher && !room.seated && room.host === 'teacher' && n < MAX_PLAYERS ? actBtn('선생님도 플레이어로 참가', 'teal', () => conn.request({ type: 'join_room', roomId: room.id })) : null,
          (room.host === me.id || isTeacher) ? actBtn('방 닫기', 'danger small', async () => { if (confirm('이 방을 닫을까요? 참가자들은 로비로 돌아갑니다.')) await conn.request({ type: 'close_room', roomId: room.id }); }) : null),
        isHost && short ? h('p', { class: 'why', id: 'start-why' }, '시작할 수 없는 이유: ' + reason + ' 친구들이 방 목록에서 이 방을 눌러 참가하거나, [봇 추가]로 빈자리를 채울 수 있습니다.') : null),
      h('section', { class: 'panel stack' },
        h('h2', null, '규칙 요약'),
        h('ol', { style: { paddingLeft: '1.2em', margin: 0 } },
          h('li', null, '각자 금화 2개와 건물 카드 4장으로 시작합니다. 첫 왕관 보유자는 앱이 무작위로 정합니다.'),
          h('li', null, '매 라운드 왕관 보유자부터 좌석 순서대로 역할 카드를 몰래 고릅니다.'),
          h('li', null, '1번 암살자부터 8번 장군까지 번호순으로 차례를 진행합니다.'),
          h('li', null, '차례에는 금화 2개 또는 카드 2장 중 1장을 받고, 건물을 1개 지을 수 있습니다.'),
          h('li', null, '누군가 건물 7개를 지으면 그 라운드를 끝으로 게임이 끝나고, 점수가 가장 높은 사람이 이깁니다.')),
        h('div', { class: 'cards', style: { justifyContent: 'center' } }, ['assassin', 'king', 'architect', 'warlord'].map(r => roleCard(r, { w: '96px' }))),
        h('button', { class: 'btn', onclick: () => openHelp('flow') }, '규칙 자세히 보기'))));
}

// ── 역할 호출 트랙 ─────────────────────────────────────
function callTrack(g) {
  const faceUp = g.selection ? g.selection.faceUp : (g.faceUp || []);
  return h('div', { class: 'calltrack', role: 'list', 'aria-label': '역할 호출 순서' }, ROLES.map(r => {
    const who = g.players.find(p => p.role === r.id);
    const out = faceUp.includes(r.id);
    const now = g.turn && g.turn.role === r.id;
    const done = g.phase === 'turns' && g.calledRank > r.rank || (g.phase === 'turns' && g.calledRank === r.rank && !now);
    const cls = 'callslot' + (out ? ' out' : '') + (now ? ' now' : '') + (done && !now ? ' done' : '');
    const label = out ? '공개 제외' : who ? who.name : r.ko;
    return h('button', { class: cls, role: 'listitem', type: 'button', onclick: () => zoomRole(r.id),
      'aria-label': `${r.rank}번 ${r.ko}` + (out ? ', 이번 라운드 공개 제외' : '') + (who ? `, ${nim(who.name)}이 공개` : '') + (now ? ', 지금 차례' : '') + (g.killed === r.id ? ', 암살 지목됨' : '') + (g.robbed === r.id ? ', 도둑 지목됨' : '') },
      img(ASSET_BY_ID['character_' + r.id]), h('span', { class: 'num' }, r.rank),
      g.killed === r.id ? h('span', { class: 'tag kill' }, '암살 지목') : null,
      g.robbed === r.id ? h('span', { class: 'tag rob' }, '도둑 지목') : null,
      out ? h('span', { class: 'tag' }, '공개 제외') : null,
      h('span', { class: 'lbl' }, r.ko, who ? h('br') : null, who ? who.name : null));
  }));
}

// ── 플레이어 판 ────────────────────────────────────────
function playerPanel(ctx, p) {
  const { g, room, me } = ctx;
  const online = room.seats.find(s => s.id === p.id)?.online;
  const isTurn = g.turn && g.turn.pid === p.id;
  const destroyMode = ui.mode === 'destroy';
  const complete = p.city.length >= COMPLETE_CITY;
  const protectedBishop = g.turn && g.turn.protected === p.id;
  const chips = p.city.map(c => {
    const d = defOf(c);
    const seenKey = p.id + c;
    const isNew = !ui.firstPaint && !ui.seenCity.has(seenKey);
    ui.seenCity.add(seenKey);
    let blocked = null;
    if (destroyMode) blocked = complete ? '완성된 도시' : protectedBishop ? '주교 보호' : d.id === 'keep' ? '아성' : null;
    return h('button', {
      class: `citychip t-${d.type}` + (destroyMode && !blocked ? ' target' : '') + (destroyMode && blocked ? ' blocked' : '') + (isNew ? ' new' : ''), type: 'button',
      'aria-label': `${d.ko}, ${DISTRICT_TYPES[d.type].ko}, 비용 ${d.cost}` + (destroyMode ? (blocked ? `, 파괴 불가: ${blocked}` : `, 파괴 비용 ${Math.max(0, d.cost - 1)}`) : ''),
      onclick: () => destroyMode ? destroyPrompt(ctx, p, c, blocked) : zoomDistrict(c),
    }, h('img', { src: '/' + districtArt(d.id).file, alt: '', width: 22, height: 22 }), h('span', { class: 'c' }, d.cost), d.ko);
  });
  return h('article', { class: 'pl' + (isTurn ? ' turn' : '') + (p.id === me.id ? ' me' : ''), 'aria-label': `${nim(p.name)}의 도시` },
    h('div', { class: 'pl-head' },
      h('span', { class: 'dot' + (online ? ' on' : ''), title: online ? '접속 중' : '연결 끊김', 'aria-label': online ? '접속 중' : '연결 끊김' }),
      h('span', { class: 'nm' }, p.name), p.id.startsWith('bot_') ? h('span', { class: 'badge', title: '연습용 봇 — 자기 손패와 공개 정보만 보고 판단합니다' }, '봇') : null, p.id === me.id ? h('span', { class: 'badge' }, '나') : null,
      g.crown === p.id ? icon('token_crown', 'crown', '왕관 보유자') : null,
      p.role ? h('span', { class: 'rolepill' }, `${ROLE_BY_ID[p.role].rank} ${roleName(p.role)}`) : null,
      g.phase === 'selection' ? h('span', { class: 'small muted' }, p.picked ? '역할 고름' : '') : null,
      room.host === p.id && !room.practice ? h('span', { class: 'badge host', title: '선생님이 지정한 게임방 관리자 (왕관과 다릅니다)' }, '방장') : null),
    h('div', { class: 'pl-stats' },
      h('span', { class: 'stat' }, icon('token_gold', '', '금화'), `금화 ${p.gold}`),
      h('span', { class: 'stat' }, '🂠 손패 ', p.handCount, '장'),
      h('span', { class: 'stat' }, '건물 ', p.city.length, ' / ', COMPLETE_CITY, complete ? ' · 완성' : '')),
    h('div', { class: 'city', style: { marginTop: '8px' } }, chips.length ? chips : h('span', { class: 'empty' }, '아직 지은 건물이 없습니다')));
}

// ── 장군 파괴 ──────────────────────────────────────────
function destroyPrompt(ctx, target, card, blocked) {
  const d = defOf(card);
  const price = Math.max(0, d.cost - 1);
  const mine = ctx.g.players.find(p => p.id === ctx.me.id);
  if (blocked) { toast(`${josa(d.ko, '은는')} 파괴할 수 없습니다 — ${blocked}.`, '파괴할 수 있는 건물(빨간 점선)을 고르세요.'); return; }
  const afford = mine.gold >= price;
  zoomDistrict(card, [
    h('p', null, `${nim(target.name)}의 ${josa(d.ko, '을를')} 금화 ${price}개로 파괴합니다. 파괴된 카드는 덱 맨 아래로 돌아갑니다.`),
    !afford ? h('p', { class: 'why' }, `금화가 부족합니다(가진 금화 ${mine.gold}개). 수입을 먼저 받거나 더 싼 건물을 고르세요.`) : null,
    actBtn(`파괴하기 (금화 ${price})`, 'danger', async () => { await ctx.game({ type: 'destroy', target: target.id, card }); ui.mode = null; closeModal(); }, { disabled: !afford }),
  ]);
}

// ── 안내 문장 ──────────────────────────────────────────
function guideText(ctx) {
  const { g, me, seated } = ctx;
  if (g.phase === 'selection') {
    const s = g.selection;
    const picker = g.players.find(p => p.id === s.picker);
    if (seated && s.picker === me.id) return [h('b', null, '내가 역할을 고를 차례입니다. '), '카드를 눌러 설명을 보고, 마음에 드는 역할을 확정하세요.' + (s.seventhRule ? ' (7인 특별 규칙: 남은 카드와 비공개 제외 카드 중에서 고릅니다)' : '')];
    if (seated && g.me.role) return [`나의 역할은 `, h('b', null, roleName(g.me.role)), `입니다. ${nim(picker.name)}이 고르는 중입니다.`];
    return [h('b', null, `${nim(picker.name)}`), '이 역할을 고르는 중입니다. 다른 사람이 고른 역할은 비밀입니다.'];
  }
  if (g.phase === 'turns' && g.turn) {
    const t = g.turn;
    const cur = g.players.find(p => p.id === t.pid);
    if (seated && t.pid === me.id) {
      if (t.pendingDraw) return [h('b', null, '뽑은 카드 2장 중 1장을 고르세요. '), '나머지는 덱 맨 아래로 돌아갑니다.'];
      if (!t.gathered) return [h('b', null, `내 차례입니다(${roleName(t.role)}). `), '먼저 자원을 모으세요: 금화 2개 또는 카드 2장 중 1장. 능력은 그 전에 써도 됩니다.'];
      if (t.built < t.limit) return [h('b', null, '건물을 지을 수 있습니다. '), `손패에서 지을 카드를 누르세요(이번 차례 ${t.built}/${t.limit}개). 다 했으면 [차례 마치기]를 누르세요.`];
      return [h('b', null, '이번 차례 건설을 마쳤습니다. '), '남은 능력을 쓰거나 [차례 마치기]를 누르세요.'];
    }
    return [h('b', null, `${t.role ? ROLE_BY_ID[t.role].rank + '번 ' + roleName(t.role) : ''} — ${nim(cur.name)}`), '의 차례입니다. 그동안 도시와 카드를 눌러 살펴볼 수 있습니다.'];
  }
  return '';
}

// ── 역할 선택 ──────────────────────────────────────────
function selectionPanel(ctx) {
  const { g, me, seated } = ctx;
  const s = g.selection;
  const order = s.order.map((pid, i) => {
    const p = g.players.find(x => x.id === pid);
    return h('span', { class: i < s.step ? 'done' : i === s.step ? 'now' : '' }, `${i + 1}. ${p.name}` + (i < s.step ? ' ✓' : i === s.step ? ' (고르는 중)' : ''));
  });
  const box = h('section', { class: 'panel choosebox' },
    h('h2', null, `${g.round}라운드 · 역할 선택`),
    h('div', { class: 'picked', 'aria-label': '역할 선택 순서' }, order),
    s.faceUp.length ? h('p', { class: 'small' }, '공개 제외: ', s.faceUp.map(roleName).join(', '), ' · 비공개 제외 1장') : h('p', { class: 'small muted' }, '공개 제외 없음 · 비공개 제외 1장'));
  if (seated && s.options) {
    if (!s.options.includes(ui.pickRole)) ui.pickRole = null;
    const grid = h('div', { class: 'rolegrid' }, ROLES.map(r => {
      const avail = s.options.includes(r.id);
      const fu = s.faceUp.includes(r.id);
      const sel = ui.pickRole === r.id;
      return roleCard(r.id, {
        cls: avail ? 'selectable pop' : 'disabled', selected: sel, flag: !avail ? (fu ? '공개 제외' : '고를 수 없음') : null,
        state: avail ? (sel ? '선택됨' : '선택 가능') : '사용 불가',
        onclick: () => {
          if (!avail) { zoomRole(r.id); return; }
          ui.pickRole = r.id; ctx.rerender();
        },
      });
    }));
    const chosen = ui.pickRole && ROLE_BY_ID[ui.pickRole];
    box.append(grid,
      chosen ? h('div', { class: 'panel tight parch' }, h('b', null, `${chosen.rank}번 ${chosen.ko}: `), chosen.short, h('ul', null, chosen.detail.map(x => h('li', null, x)))) : h('p', { class: 'muted' }, '역할 카드를 눌러 고르세요. 회색 카드는 이번 라운드에 고를 수 없는 역할입니다.'),
      h('div', { class: 'row' },
        actBtn(chosen ? `${josa(chosen.ko, '로')} 확정` : '역할을 먼저 고르세요', 'primary big', async () => { await ctx.game({ type: 'pick', role: ui.pickRole }); ui.pickRole = null; }, { disabled: !chosen }),
        chosen ? h('button', { class: 'btn', onclick: () => zoomRole(chosen.id) }, '카드 크게 보기') : null));
  } else if (seated && g.me.role) {
    box.append(h('div', { class: 'row' }, roleCard(g.me.role, { w: '120px' }), h('div', null, h('p', null, '이번 라운드 나의 역할'), h('h3', null, roleName(g.me.role)), h('p', { class: 'small muted' }, '다른 사람에게는 비밀입니다. 행동 단계에서 호출되면 공개됩니다.'))));
  } else {
    box.append(h('div', { class: 'cards' }, s.order.map((pid, i) => backCard('role', i < s.step ? '고름' : ''))));
  }
  return box;
}

// ── 내 차례 행동 ──────────────────────────────────────
function costFor(meP, card) {
  const d = defOf(card);
  const hasF = meP.city.some(c => c.startsWith('factory#'));
  return d.type === 'unique' && d.id !== 'factory' && hasF ? Math.max(0, d.cost - 1) : d.cost;
}
function buildBlock(ctx, card) {
  const { g, me } = ctx;
  const t = g.turn;
  const meP = g.players.find(p => p.id === me.id);
  if (!t || t.pid !== me.id) return '내 차례에만 지을 수 있습니다.';
  if (t.pendingDraw) return '뽑은 카드 중 하나를 먼저 고르세요.';
  if (!t.gathered) return '먼저 자원을 모아야 합니다.';
  if (t.built >= t.limit) return `이번 차례 건설 한도(${t.limit}개)를 다 썼습니다.`;
  const d = defOf(card);
  const dup = meP.city.some(c => c.startsWith(d.id + '#'));
  const quarry = meP.city.some(c => c.startsWith('quarry#'));
  if (dup && !quarry) return `도시에 이미 ${josa(d.ko, '이가')} 있습니다.`;
  const cost = costFor(meP, card);
  const canCards = d.id === 'thieves_den' ? g.me.hand.length - 1 : 0;
  if (meP.gold + Math.min(canCards, cost) < cost) return `금화가 부족합니다(비용 ${cost}, 가진 금화 ${meP.gold}).`;
  return null;
}

function denPrompt(ctx, card) {
  const meP = ctx.g.players.find(p => p.id === ctx.me.id);
  const cost = costFor(meP, card);
  const sel = new Set();
  const others = ctx.g.me.hand.filter(c => c !== card);
  const info = h('p', { class: 'guide' });
  const go = h('div');
  const refresh = () => {
    const goldNeed = cost - sel.size;
    info.textContent = `비용 ${cost}: 손패 ${sel.size}장 + 금화 ${goldNeed}개 (가진 금화 ${meP.gold}개)`;
    go.replaceChildren(actBtn('도둑 소굴 짓기', 'primary', async () => { await ctx.game({ type: 'build', card, payCards: [...sel] }); closeModal(); },
      { disabled: goldNeed > meP.gold || sel.size > cost }));
  };
  const grid = h('div', { class: 'cards' }, others.map(c => {
    const el = districtCard(c, { w: '96px', cls: 'selectable', onclick: () => { sel.has(c) ? sel.delete(c) : sel.add(c); el.classList.toggle('selected', sel.has(c)); el.setAttribute('aria-pressed', sel.has(c)); refresh(); } });
    return el;
  }));
  openModal('도둑 소굴: 비용을 손패로 내기', h('div', { class: 'stack' }, h('p', null, '금화 대신 낼 손패를 고르세요(카드 1장 = 금화 1개). 낸 카드는 덱 맨 아래로 돌아갑니다.'), grid, info, go));
  refresh();
}

function handCardActions(ctx, card) {
  const t = ctx.g.turn;
  const why = buildBlock(ctx, card);
  const meP = ctx.g.players.find(p => p.id === ctx.me.id);
  const d = defOf(card);
  const cost = costFor(meP, card);
  const acts = [];
  if (d.id === 'thieves_den' && !why) acts.push(h('button', { class: 'btn primary', onclick: () => denPrompt(ctx, card) }, `짓기 (비용 ${cost}, 손패로 일부 지불 가능)`));
  else acts.push(actBtn(`짓기 (금화 ${cost})`, 'primary', async () => { await ctx.game({ type: 'build', card }); closeModal(); }, { disabled: !!why }));
  if (why) acts.push(h('p', { class: 'why' }, '지금 지을 수 없는 이유: ' + why));
  if (cost !== d.cost) acts.push(h('p', { class: 'small muted' }, `공방 덕분에 금화 1개를 덜 냅니다. 점수는 원래 비용 ${d.cost}점입니다.`));
  const hasLab = meP.city.some(c => c.startsWith('laboratory#'));
  if (hasLab && t && t.pid === ctx.me.id && !t.used.lab && !t.pendingDraw)
    acts.push(actBtn('연구소: 이 카드를 버리고 금화 2개 받기', 'teal', async () => { await ctx.game({ type: 'lab', card }); closeModal(); }));
  return acts;
}

function myArea(ctx) {
  const { g, me } = ctx;
  const t = g.turn;
  const myTurn = g.phase === 'turns' && t && t.pid === me.id;
  const meP = g.players.find(p => p.id === me.id);
  const key = `${g.round}:${t ? t.role : ''}:${myTurn}`;
  if (ui.key !== key) { ui.key = key; ui.mode = null; ui.picks = []; ui.target = null; }
  const hand = g.me.hand;
  const redraw = ui.mode === 'redraw';
  const handEls = hand.map(c => {
    if (redraw) {
      const sel = ui.picks.includes(c);
      return districtCard(c, { cls: 'selectable', selected: sel, state: sel ? '버릴 카드로 선택됨' : '선택 가능', onclick: () => { ui.picks = sel ? ui.picks.filter(x => x !== c) : [...ui.picks, c]; ctx.rerender(); } });
    }
    const why = myTurn ? buildBlock(ctx, c) : null;
    return h('div', { class: 'handcard' },
      districtCard(c, { zoomActions: myTurn ? handCardActions(ctx, c) : null, onclick: myTurn ? () => zoomDistrict(c, handCardActions(ctx, c)) : null, state: myTurn ? (why ? '지금 지을 수 없음' : '지을 수 있음') : null }),
      myTurn && !why ? (defOf(c).id === 'thieves_den' ? h('button', { class: 'btn small primary', onclick: () => denPrompt(ctx, c) }, `짓기 ${costFor(meP, c)}`)
        : actBtn(`짓기 ${costFor(meP, c)}`, 'small primary', () => ctx.game({ type: 'build', card: c }))) : null);
  });

  const bar = h('div', { class: 'actions' });
  if (myTurn) {
    const role = ROLE_BY_ID[t.role];
    if (t.pendingDraw) {
      // 뽑은 카드 고르기
    } else {
      if (!t.gathered) {
        bar.append(actBtn('금화 2개 받기', 'primary', () => ctx.game({ type: 'gather_gold' })),
          actBtn(meP.city.some(c => c.startsWith('library#')) ? '카드 2장 뽑기(도서관: 모두 가짐)' : '카드 2장 보고 1장 고르기', 'primary', () => ctx.game({ type: 'gather_cards' })));
        bar.append(h('span', { class: 'sep' }));
      }
      if (role.income) {
        const n = meP.city.filter(c => defOf(c).type === role.income || defOf(c).id === 'school_of_magic').length;
        bar.append(actBtn(t.used.income ? `${DISTRICT_TYPES[role.income].ko} 수입 받음` : `${DISTRICT_TYPES[role.income].ko} 건물 수입 +${n}`, 'teal', () => ctx.game({ type: 'income' }), { disabled: t.used.income }));
      }
      if (t.role === 'merchant') bar.append(actBtn(t.used.extra ? '추가 금화 받음' : '상인: 추가 금화 +1', 'teal', () => ctx.game({ type: 'merchant_extra' }), { disabled: t.used.extra }));
      if (t.role === 'architect') bar.append(actBtn(t.used.extra ? '추가 카드 받음' : '건축가: 카드 2장 더 받기', 'teal', () => ctx.game({ type: 'architect_draw' }), { disabled: t.used.extra }));
      if (t.role === 'assassin' || t.role === 'thief') {
        const steal = t.role === 'thief';
        const targets = ROLES.filter(r => r.id !== 'assassin' && r.id !== t.role && !(steal && r.id === g.killed));
        bar.append(h('button', { class: 'btn teal', disabled: t.used.power, onclick: () => targetPrompt(ctx, steal, targets) },
          t.used.power ? (steal ? '도둑질 지목함' : '암살 지목함') : (steal ? '도둑: 훔칠 역할 지목' : '암살자: 암살할 역할 지목')));
      }
      if (t.role === 'magician' && !t.used.power) {
        bar.append(h('button', { class: 'btn teal', onclick: () => swapPrompt(ctx) }, '마술사: 손패 교환'),
          h('button', { class: 'btn teal' + (redraw ? ' on' : ''), onclick: () => { ui.mode = redraw ? null : 'redraw'; ui.picks = []; ctx.rerender(); } }, redraw ? '버리기 취소' : '마술사: 버리고 다시 뽑기'));
      }
      if (t.role === 'warlord' && !t.used.power) {
        const dm = ui.mode === 'destroy';
        bar.append(h('button', { class: 'btn danger' + (dm ? ' on' : ''), onclick: () => { ui.mode = dm ? null : 'destroy'; ctx.rerender(); } }, dm ? '파괴 취소' : '장군: 건물 파괴하기'));
      }
      if (meP.city.some(c => c.startsWith('smithy#'))) bar.append(actBtn(t.used.smithy ? '대장간 사용함' : '대장간: 금화 2 → 카드 3장', 'teal', () => ctx.game({ type: 'smithy' }), { disabled: t.used.smithy || meP.gold < 2 }));
      if (meP.city.some(c => c.startsWith('laboratory#')) && !t.used.lab) bar.append(h('span', { class: 'small muted' }, '연구소: 손패 카드를 눌러 버리기'));
      bar.append(h('span', { class: 'grow' }), actBtn('차례 마치기', 'primary', () => endTurn(ctx), { disabled: !t.gathered }));
    }
  }
  const parts = [];
  if (myTurn && t.pendingDraw) {
    parts.push(h('div', { class: 'guide' }, h('b', null, '가질 카드 1장을 고르세요. '), '고르지 않은 카드는 덱 맨 아래로 돌아갑니다.'),
      h('div', { class: 'cards', style: { justifyContent: 'center', margin: '10px 0' } }, t.pendingDraw.map(c => h('div', { class: 'handcard' },
        districtCard(c, { w: '150px', cls: 'selectable pop' }), actBtn('이 카드 가지기', 'primary', () => ctx.game({ type: 'keep', card: c }))))));
  }
  if (redraw) {
    parts.push(h('div', { class: 'guide row' }, h('span', { class: 'grow' }, `버릴 카드를 고르세요: ${ui.picks.length}장 선택 → 같은 수만큼 새로 뽑습니다.`),
      actBtn(`${ui.picks.length}장 버리고 다시 뽑기`, 'primary', async () => { await ctx.game({ type: 'magic_redraw', cards: ui.picks }); ui.mode = null; ui.picks = []; }, { disabled: !ui.picks.length })));
  }
  if (ui.mode === 'destroy') parts.push(h('div', { class: 'guide' }, h('b', null, '파괴할 건물을 고르세요. '), '위쪽 도시에서 빨간 점선 건물을 누르면 파괴 비용(비용 − 1)을 확인할 수 있습니다. 완성된 도시, 살아 있는 주교의 도시, 아성은 파괴할 수 없습니다.'));
  return h('section', { class: 'handbar stack', 'aria-label': '내 손패와 행동' },
    h('div', { class: 'row' },
      g.me.role ? h('button', { class: 'btn small ghost', onclick: () => zoomRole(g.me.role) }, `나의 역할: ${ROLE_BY_ID[g.me.role].rank}번 ${roleName(g.me.role)}`) : null,
      h('span', { class: 'stat' }, icon('token_gold', '', '금화'), `금화 ${meP.gold}`),
      h('span', { class: 'muted small' }, `손패 ${hand.length}장 · 손패 내용은 나만 볼 수 있습니다`)),
    ...parts,
    bar.childNodes.length ? bar : null,
    h('div', { class: 'cards scroll', 'aria-label': '내 손패' }, handEls.length ? handEls : h('p', { class: 'muted' }, '손패가 없습니다.')));
}

function targetPrompt(ctx, steal, targets) {
  const body = h('div', { class: 'stack' },
    h('p', null, steal ? '훔칠 역할을 고르세요. 그 역할이 공개되는 순간 그 사람의 금화를 모두 가져옵니다. (암살자, 암살당한 역할은 고를 수 없습니다)' : '암살할 역할을 고르세요. 그 역할은 이번 라운드 차례를 건너뜁니다. 사람이 아니라 역할을 지목합니다.'),
    h('div', { class: 'rolegrid' }, targets.map(r => {
      const out = (ctx.g.faceUp || []).includes(r.id);
      return h('div', { class: 'handcard' }, roleCard(r.id, { w: '120px', cls: out ? 'disabled' : '', flag: out ? '공개 제외' : null, onclick: () => zoomRole(r.id) }),
        actBtn(`${r.rank}번 ${r.ko} 지목`, steal ? 'primary small' : 'danger small', async () => { await ctx.game({ type: steal ? 'steal' : 'assassinate', role: r.id }); closeModal(); }));
    })),
    h('p', { class: 'small muted' }, '공개 제외된 역할은 이번 라운드에 아무도 갖고 있지 않습니다.'));
  openModal(steal ? '도둑: 역할 지목' : '암살자: 역할 지목', body, { width: '900px' });
}

function swapPrompt(ctx) {
  const others = ctx.g.players.filter(p => p.id !== ctx.me.id);
  openModal('마술사: 손패 전체 교환', h('div', { class: 'stack' },
    h('p', null, `내 손패 ${ctx.g.me.hand.length}장 전체를 고른 사람의 손패 전체와 맞바꿉니다.`),
    h('div', { class: 'targetgrid' }, others.map(p => actBtn(`${p.name} (손패 ${p.handCount}장)`, 'teal', async () => { await ctx.game({ type: 'magic_swap', target: p.id }); closeModal(); })))));
}

function endTurn(ctx) {
  const { g } = ctx;
  const t = g.turn;
  const meP = g.players.find(p => p.id === ctx.me.id);
  const left = [];
  const role = ROLE_BY_ID[t.role];
  if (role.income && !t.used.income) left.push('종류별 수입');
  if ((t.role === 'merchant' || t.role === 'architect') && !t.used.extra) left.push(t.role === 'merchant' ? '추가 금화' : '추가 카드 2장');
  if (['assassin', 'thief', 'magician', 'warlord'].includes(t.role) && !t.used.power) left.push(roleName(t.role) + ' 능력');
  if (t.built < t.limit && g.me.hand.some(c => !buildBlock(ctx, c))) left.push('건설');
  const go = () => ctx.game({ type: 'end_turn' });
  if (!left.length) return go();
  return new Promise(resolve => {
    openModal('차례를 마칠까요?', h('div', { class: 'stack' },
      h('p', null, '아직 하지 않은 것: ', h('b', null, left.join(', '))),
      h('p', { class: 'muted small' }, '능력은 쓰지 않아도 됩니다. 차례를 마치면 다음 역할을 부릅니다.'),
      h('div', { class: 'row' }, actBtn('그래도 차례 마치기', 'primary', async () => { closeModal(); await go(); resolve(); }), h('button', { class: 'btn', onclick: () => { closeModal(); resolve(); } }, '돌아가기'))));
    void meP;
  });
}

// ── 게임 화면 ──────────────────────────────────────────
function gameScreen(ctx) {
  const { g, me, room, isTeacher, seated } = ctx;
  const crown = g.players.find(p => p.id === g.crown);
  const phaseText = g.phase === 'selection' ? '역할 선택 단계' : g.phase === 'turns' ? '행동 단계' : '게임 종료';
  const logBox = h('div', { class: 'log', 'aria-live': 'polite' },
    [...g.log].reverse().map(e => h('div', { class: (e.mine ? 'mine' : '') + (/라운드 역할 선택을 시작/.test(e.text) ? ' round' : '') }, e.mine ? '🔒 ' : '', e.text)));
  const main = h('div', { class: 'game-main' },
    h('section', { class: 'panel tight stack' },
      h('div', { class: 'status' },
        h('span', { class: 'big' }, `${g.round}라운드 · ${phaseText}`),
        h('span', { class: 'stat' }, icon('token_crown', '', '왕관'), '왕관: ', crown.name),
        h('span', { class: 'stat' }, '덱 ', g.deckCount, '장'),
        g.endTriggered ? h('span', { class: 'badge playing' }, '도시 완성! 이번 라운드가 마지막') : null,
        !seated ? h('span', { class: 'badge' }, isTeacher ? '관리자 보기 · 공개 정보만' : '관전') : null),
      callTrack(g),
      h('div', { class: 'guide', role: 'status' }, guideText(ctx))),
    g.phase === 'selection' ? selectionPanel(ctx) : null,
    h('section', { class: 'players', 'aria-label': '플레이어들의 도시' }, g.players.map(p => playerPanel(ctx, p))));
  const side = h('aside', { class: 'game-side' },
    h('section', { class: 'panel tight' }, h('h3', null, '진행 기록'), h('p', { class: 'small muted' }, '공개된 행동만 기록됩니다. 🔒 표시는 나만 보는 기록입니다.'), logBox),
    h('section', { class: 'panel tight stack' }, h('h3', null, '도움말'),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => openHelp('flow') }, '진행'), h('button', { class: 'btn small', onclick: () => openHelp('roles') }, '역할'), h('button', { class: 'btn small', onclick: () => openHelp('districts') }, '건물'), h('button', { class: 'btn small', onclick: () => openHelp('score') }, '점수'))));
  const els = [main];
  if (seated && g.me) els.push(h('div', { class: 'game-hand' }, myArea(ctx)));
  els.push(side);
  ui.firstPaint = false;
  return h('div', { class: 'game' }, els);
}

// ── 결과 ───────────────────────────────────────────────
function resultsScreen(ctx) {
  const { g, onLeave } = ctx;
  const r = g.result;
  const winners = r.rows.filter(x => x.place === 1);
  return h('div', { class: 'wrap results stack' },
    h('section', { class: 'panel winner' },
      icon('token_crown', 'crown', '왕관'),
      h('h1', null, winners.map(w => nim(w.name)).join(', '), ' 승리!'),
      h('p', null, `${winners[0].total}점 · ${g.round}라운드 만에 게임이 끝났습니다.`),
      r.tieNote ? h('p', { class: 'small muted' }, r.tieNote) : null,
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary big', onclick: onLeave }, ctx.leaveLabel || '교실 로비로 돌아가기'))),
    h('section', { class: 'stack' },
      h('h2', null, '순위와 점수 계산'),
      r.rows.map(row => h('article', { class: 'panel result-row' + (row.place === 1 ? ' rank1' : '') },
        h('div', { class: 'result-head' },
          h('span', { class: 'place' }, row.place + '위'),
          h('div', { class: 'grow' }, h('h3', { style: { margin: 0 } }, row.name),
            h('div', { class: 'small muted' }, `금화 ${row.gold} · 손패 ${row.hand}장 · 마지막 역할: ${row.lastRole ? roleName(row.lastRole) : '공개 안 됨(암살)'}`)),
          h('span', { class: 'total' }, row.total, h('small', null, '점'))),
        h('div', { class: 'result-body' },
          h('ul', { class: 'items', 'aria-label': row.name + ' 점수 항목' }, row.items.map(it => h('li', { class: it.pts ? '' : 'zero' }, h('span', { class: 'lab' }, it.label), h('span', { class: 'w' }, it.why), h('b', null, it.pts > 0 ? '+' + it.pts : it.pts))),
            h('li', { class: 'sum' }, h('span', { class: 'lab' }, '합계'), h('span', { class: 'w' }), h('b', null, row.total))),
          h('div', { class: 'cards' }, row.city.map(c => districtCard(c, { mini: true }))))))));
}

export function renderRoom(ctx) {
  const room = ctx.room;
  if (room.status === 'waiting') return waitingRoom(ctx);
  const g = room.game;
  const full = { ...ctx, g, seated: room.seated && !!g.me };
  full.game = action => ctx.conn.request({ type: 'game', roomId: room.id, v: g.v, action });
  if (g.phase === 'ended') return resultsScreen(full);
  return gameScreen(full);
}
export function resetRoomUi() { ui.seenCity.clear(); ui.firstPaint = true; ui.mode = null; ui.pickRole = null; }
