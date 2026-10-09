// 도움말 — 규칙 요약, 역할, 건물, 점수, 교실용 변경 규칙
import { h, openModal, clear } from './dom.js';
import { ROLES, DISTRICTS, DISTRICT_TYPES, TYPE_ORDER, DISCARD_TABLE, RULES_EDITION, TIMING_KO } from './shared/data.js';
import { roleCard, districtCard, typeChip } from './cards.js';

const SECTIONS = {
  flow: ['게임 진행', () => [
    h('p', null, '도시에 건물 7개를 먼저 짓는 것이 목표처럼 보이지만, 승리는 ', h('b', null, '최종 점수'), '로 정합니다. 매 라운드는 두 단계로 진행됩니다.'),
    h('h3', null, '① 역할 선택 단계 (좌석 순서)'),
    h('p', null, '왕관 보유자부터 왼쪽(좌석 순서)으로 돌아가며 역할 카드를 몰래 한 장씩 고릅니다. 다른 사람은 누가 무엇을 골랐는지 알 수 없고, 고르기를 마쳤는지만 보입니다.'),
    h('table', null,
      h('tr', null, h('th', null, '인원'), h('th', null, '공개 제외'), h('th', null, '비공개 제외'), h('th', null, '비고')),
      Object.entries(DISCARD_TABLE).map(([n, t]) => h('tr', null, h('td', null, n + '명'), h('td', null, t.faceUp + '장'), h('td', null, t.faceDown + '장'),
        h('td', null, n === '7' ? '7번째 사람은 남은 1장과 비공개 제외 카드 중 하나를 고릅니다.' : '마지막 사람이 남긴 카드는 비공개로 버립니다.')))),
    h('p', null, '왕(4번)은 공개 제외 카드가 될 수 없습니다. 나오면 다른 카드로 바꾸고 왕은 다시 섞습니다.'),
    h('h3', null, '② 행동 단계 (역할 번호순)'),
    h('p', null, '1번 암살자부터 8번 장군까지 번호순으로 부르고, 그 역할을 고른 사람이 공개하고 차례를 진행합니다.'),
    h('ul', null,
      h('li', null, h('b', null, '자원 모으기(필수): '), '금화 2개를 받거나, 건물 카드 2장을 보고 1장을 가집니다(나머지는 덱 맨 아래로).'),
      h('li', null, h('b', null, '건설(선택): '), '비용만큼 금화를 내고 건물 1개를 짓습니다. 같은 이름의 건물은 다시 지을 수 없습니다(채석장 예외). 건축가는 최대 3개.'),
      h('li', null, h('b', null, '능력: '), '역할 능력과 특수 건물 효과는 정해진 때(정해지지 않았다면 차례 중 언제든) 한 번씩 씁니다. 종류별 수입은 건설 전에 받을지 후에 받을지 고를 수 있습니다.')),
    h('p', null, '금화 수와 손패 장수는 모두에게 공개되지만, 손패의 내용은 본인만 볼 수 있습니다. 버리거나 파괴된 카드는 덱 맨 아래로 돌아갑니다.'),
    h('h3', null, '게임 종료'),
    h('p', null, '누군가 건물 7개로 도시를 완성하면 ', h('b', null, '그 라운드를 끝까지 진행한 뒤'), ' 게임이 끝납니다. 먼저 완성한 사람이 자동으로 이기지는 않습니다.'),
  ]],
  roles: ['역할 8종', () => [
    h('p', { class: 'muted' }, '카드를 누르면 크게 보고 자세한 설명을 읽을 수 있습니다.'),
    h('div', { class: 'rolegrid' }, ROLES.map(r => h('div', { class: 'stack', style: { width: '100%' } }, roleCard(r.id), h('p', { class: 'small' }, r.short)))),
  ]],
  districts: ['건물', () => [
    h('p', null, '건물은 다섯 종류이며 색과 아이콘으로 구분합니다: ', TYPE_ORDER.map(t => [typeChip(t), ' '])),
    h('p', null, '기본 건물 17종 54장(같은 건물은 같은 그림을 쓰지만 카드는 한 장 한 장 구분됩니다)과 첫 게임 권장 특수 건물 14장, 모두 68장을 씁니다.'),
    h('table', null, h('tr', null, h('th', null, '건물'), h('th', null, '종류'), h('th', null, '비용'), h('th', null, '수량'), h('th', null, '효과')),
      DISTRICTS.map(d => h('tr', null, h('td', null, `${d.ko} (${d.en})`), h('td', null, DISTRICT_TYPES[d.type].ko), h('td', null, d.cost), h('td', null, d.count + '장'),
        h('td', null, d.text ? `[${TIMING_KO[d.timing]}] ${d.text}` : '—')))),
  ]],
  score: ['점수', () => [
    h('ul', null,
      h('li', null, '도시에 있는 건물 비용의 합계만큼 점수'),
      h('li', null, '귀족·종교·상업·군사·특수 다섯 종류를 모두 가지면 +3점'),
      h('li', null, '가장 먼저 건물 7개로 도시를 완성하면 +4점'),
      h('li', null, '게임이 끝날 때 도시를 완성했지만 처음이 아니면 +2점'),
      h('li', null, '특수 건물 점수(용의 문, 황실 보물고, 지도의 방, 조각상, 소원의 우물)')),
    h('p', null, '동점이면 마지막 라운드에 더 높은 번호의 역할을 공개한 사람이 이깁니다. 결과 화면에서 항목별 계산 근거를 볼 수 있습니다.'),
  ]],
  classroom: ['교실용 변경', () => [
    h('p', null, h('b', null, '기준 규칙: '), RULES_EDITION, '. 4~7인, 기본 역할 8종, 기본 건물 54장 + 첫 게임 권장 특수 건물 14장.'),
    h('ul', null,
      h('li', null, h('b', null, '첫 왕관 보유자: '), '원래 규칙은 가장 나이가 많은 사람이지만, 나이 정보를 모으지 않기 위해 앱이 무작위로 정합니다. 이후 왕관은 왕의 능력에 따라서만 옮겨집니다.'),
      h('li', null, h('b', null, '방장과 왕관은 다릅니다: '), '선생님이 지정한 방장은 게임방을 관리하는 사람이고, 왕관 보유자는 게임 속 역할입니다. 왕관이 옮겨져도 방장은 바뀌지 않습니다.'),
      h('li', null, h('b', null, '유령 구역: '), '게임이 끝날 때 원하는 종류로 셀 수 있는데, 앱이 점수가 가장 높아지는 종류를 자동으로 골라 줍니다.'),
      h('li', null, h('b', null, '왕관 가져오기: '), '왕은 차례 중 반드시 왕관을 가져와야 하므로, 앱은 왕이 공개되는 순간 바로 왕관을 옮깁니다.'),
      h('li', null, h('b', null, '자동 턴 넘김 없음: '), '시간 제한이 없고, 연결이 끊겨도 차례를 넘기거나 비밀 역할을 공개하지 않습니다. 다시 접속하면 같은 자리로 돌아옵니다.'),
      h('li', null, h('b', null, '동점 판정: '), '암살당해 역할을 공개하지 못한 사람은 동점 판정에서 가장 낮게 봅니다. 단, 암살당한 왕은 라운드 끝에 공개되므로 4번으로 셉니다.')),
    h('p', { class: 'small muted' }, '2~3인 규칙, 9번 역할과 추가 역할, 구판의 8개 건물 종료 조건과 구판 특수 건물 효과는 쓰지 않습니다.'),
  ]],
};

export function openHelp(start = 'flow') {
  const body = h('div', { class: 'help' });
  const content = h('div');
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const show = key => {
    for (const b of tabs.children) { const on = b.dataset.k === key; b.classList.toggle('primary', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
    clear(content).append(...[].concat(SECTIONS[key][1]()));
  };
  for (const [k, [label]] of Object.entries(SECTIONS)) tabs.append(h('button', { class: 'btn small', role: 'tab', dataset: { k }, onclick: () => show(k) }, label));
  body.append(tabs, content);
  openModal('규칙 도움말', body, { width: '960px' });
  show(start);
}
