// 카드 그리기 — 비용·제목·종류 아이콘·테두리는 그림이 아니라 UI 로 표시한다.
import { h, openModal } from './dom.js';
import { ROLE_BY_ID, DISTRICT_BY_ID, DISTRICT_TYPES, TIMING_KO } from './shared/data.js';
import { roleArt, districtArt, ASSET_BY_ID } from './shared/assets.js';

export const defOf = cardId => DISTRICT_BY_ID[cardId.split('#')[0]];
export const img = (asset, cls) => h('img', { src: '/' + asset.file, alt: asset.alt, loading: 'lazy', decoding: 'async', width: 640, height: 960, class: cls });

export function districtCard(cardId, opts = {}) {
  const d = defOf(cardId);
  const t = DISTRICT_TYPES[d.type];
  const el = h(opts.tag || 'button', {
    class: `card t-${d.type}` + (opts.mini ? ' mini' : '') + (opts.cls ? ' ' + opts.cls : ''),
    type: 'button', style: opts.w ? { '--w': opts.w } : null,
    'aria-label': `${d.ko}, ${t.ko} 건물, 비용 ${d.cost}` + (opts.state ? `, ${opts.state}` : ''),
    'aria-pressed': opts.selected ? 'true' : null,
    onclick: opts.onclick || (() => zoomDistrict(cardId, opts.zoomActions)),
  },
  h('div', { class: 'art' }, img(districtArt(d.id))),
  h('div', { class: 'shade' }),
  h('div', { class: 'cost', 'aria-hidden': 'true' }, d.cost),
  h('img', { class: 'ticon', src: '/' + t.icon, alt: '', 'aria-hidden': 'true' }),
  h('div', { class: 'name' }, d.ko, opts.mini ? null : h('span', { class: 'sub' }, t.ko + (d.type === 'unique' ? ' · 효과' : ''))),
  opts.flag ? h('span', { class: 'flag' }, opts.flag) : null);
  if (opts.selected) el.classList.add('selected');
  return el;
}

export function roleCard(roleId, opts = {}) {
  const r = ROLE_BY_ID[roleId];
  const el = h('button', {
    class: 'card role' + (opts.cls ? ' ' + opts.cls : ''), type: 'button', style: opts.w ? { '--w': opts.w } : null,
    'aria-label': `${r.rank}번 ${r.ko}` + (opts.state ? `, ${opts.state}` : ''),
    'aria-pressed': opts.selected ? 'true' : null,
    onclick: opts.onclick || (() => zoomRole(roleId)),
  },
  h('div', { class: 'art' }, img(roleArt(r.id))),
  h('div', { class: 'shade' }),
  h('div', { class: 'rank', 'aria-hidden': 'true' }, r.rank),
  h('div', { class: 'name' }, r.ko, h('span', { class: 'sub' }, r.en)),
  opts.flag ? h('span', { class: 'flag' }, opts.flag) : null);
  if (opts.selected) el.classList.add('selected');
  return el;
}

export function backCard(kind = 'district', label) {
  const a = ASSET_BY_ID[kind === 'role' ? 'card_back_character' : 'card_back_district'];
  return h('div', { class: 'card back', role: 'img', 'aria-label': label || a.alt },
    h('div', { class: 'art' }, img(a)), label ? h('div', { class: 'shade' }) : null, label ? h('div', { class: 'name' }, label) : null);
}

export function typeChip(type) {
  const t = DISTRICT_TYPES[type];
  return h('span', { class: 'typechip', style: { '--tcol': t.color } }, h('img', { src: '/' + t.icon, alt: '' }), t.ko);
}

export function zoomDistrict(cardId, actions) {
  const d = defOf(cardId);
  const t = DISTRICT_TYPES[d.type];
  const art = districtArt(d.id);
  const big = districtCard(cardId, { tag: 'div', onclick: () => {} });
  openModal(d.ko, h('div', { class: 'zoom' }, big,
    h('div', null,
      h('dl', null,
        h('dt', null, '영문 원명'), h('dd', null, d.en),
        h('dt', null, '종류'), h('dd', null, typeChip(d.type)),
        h('dt', null, '건설 비용'), h('dd', null, `금화 ${d.cost}개 (점수 ${d.cost}점)`),
        h('dt', null, '덱 수량'), h('dd', null, `${d.count}장`),
        d.timing ? h('dt', null, '발동 시점') : null, d.timing ? h('dd', null, TIMING_KO[d.timing]) : null),
      d.text ? h('p', { class: 'panel tight parch' }, d.text) : h('p', { class: 'muted' }, `특수 효과가 없는 ${t.ko} 건물입니다. ${t.ko} 건물은 해당 종류의 수입 능력에 쓰입니다.`),
      h('p', { class: 'small muted' }, art.alt),
      actions ? h('div', { class: 'stack' }, actions) : null)), { width: '820px' });
}

export function zoomRole(roleId, actions) {
  const r = ROLE_BY_ID[roleId];
  openModal(`${r.rank}번 ${r.ko}`, h('div', { class: 'zoom' }, roleCard(roleId, { onclick: () => {} }),
    h('div', null,
      h('p', null, h('b', null, r.short)),
      h('ul', null, r.detail.map(x => h('li', null, x))),
      r.income ? h('p', null, '수입 종류: ', typeChip(r.income)) : null,
      h('p', { class: 'small muted' }, `영문 원명 ${r.en} · 행동 순서 ${r.rank}번째`),
      actions ? h('div', { class: 'stack' }, actions) : null)), { width: '820px' });
}
