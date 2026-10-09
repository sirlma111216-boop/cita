// 시타델 교실판 — 용어표·카드 데이터 (서버와 브라우저가 함께 쓴다)
// 기준: Citadels (2016 Edition) 현행 규칙서 zc01 (© 2021 Z-Man Games) 첫 게임 권장 구성
// 한국어 명칭 · 영문 원명 · 내부 식별자를 한 곳에서 관리한다.

export const RULES_EDITION = 'Citadels (2016 Edition) 현행 영문 규칙서 zc01, 첫 게임 권장 구성';

export const DISTRICT_TYPES = {
  noble:     { id: 'noble',     ko: '귀족', en: 'Noble',     color: '#c5a058', icon: 'icons/icon_noble.svg' },
  religious: { id: 'religious', ko: '종교', en: 'Religious', color: '#729ecd', icon: 'icons/icon_religious.svg' },
  trade:     { id: 'trade',     ko: '상업', en: 'Trade',     color: '#6bac8d', icon: 'icons/icon_trade.svg' },
  military:  { id: 'military',  ko: '군사', en: 'Military',  color: '#c0605a', icon: 'icons/icon_military.svg' },
  unique:    { id: 'unique',    ko: '특수', en: 'Unique',    color: '#9b7bc4', icon: 'icons/icon_unique.svg' },
};
export const TYPE_ORDER = ['noble', 'religious', 'trade', 'military', 'unique'];

// 기본 역할 8종 (순위 = 행동 순서)
export const ROLES = [
  { id: 'assassin',  rank: 1, ko: '암살자', en: 'Assassin',
    short: '역할 하나를 지목해 암살합니다. 암살당한 역할은 이번 라운드 차례를 건너뜁니다.',
    detail: [
      '자기 차례 중 언제든 다른 역할 하나를 지목합니다(플레이어가 아니라 역할을 지목).',
      '암살당한 역할이 호출되면 그 플레이어는 조용히 차례 전체를 건너뛰며, 역할 카드도 공개하지 않습니다.',
      '아무도 고르지 않은 역할을 지목했다면 아무 일도 일어나지 않습니다.',
    ] },
  { id: 'thief',     rank: 2, ko: '도둑', en: 'Thief',
    short: '역할 하나를 지목합니다. 그 역할이 공개되는 즉시 그 플레이어의 금화를 모두 가져옵니다.',
    detail: [
      '자기 차례 중 언제든 다른 역할 하나를 지목합니다.',
      '1번 암살자, 암살당한 역할, 자기 자신(도둑)은 지목할 수 없습니다.',
      '지목된 역할이 호출되어 공개되는 순간, 그 플레이어가 자원을 모으기 전에 금화를 전부 가져옵니다.',
    ] },
  { id: 'magician',  rank: 3, ko: '마술사', en: 'Magician',
    short: '다른 플레이어와 손패 전체를 맞바꾸거나, 원하는 장수를 버리고 같은 수만큼 새로 뽑습니다.',
    detail: [
      '둘 중 하나를 한 번 할 수 있습니다.',
      '① 다른 플레이어 한 명과 손패 전체를 교환합니다. 내 손패가 0장이면 상대 손패를 그대로 가져옵니다.',
      '② 손패에서 원하는 만큼 덱 맨 아래로 버리고, 버린 수만큼 덱에서 뽑습니다.',
    ] },
  { id: 'king',      rank: 4, ko: '왕', en: 'King', income: 'noble',
    short: '왕관을 가져옵니다. 귀족 건물마다 금화 1개를 받습니다.',
    detail: [
      '공개되는 즉시 왕관을 가져옵니다. 남은 라운드의 호출과 다음 라운드의 첫 역할 선택을 맡습니다.',
      '자기 차례에 한 번, 내 도시의 귀족 건물 수만큼 금화를 받습니다(건설 전후 원하는 때).',
      '암살당하면 차례를 건너뛰지만, 라운드가 끝날 때 왕의 후계자로서 왕관을 받습니다.',
      '왕은 공개 제외 카드가 될 수 없습니다.',
    ] },
  { id: 'bishop',    rank: 5, ko: '주교', en: 'Bishop', income: 'religious',
    short: '종교 건물마다 금화 1개를 받습니다. 이번 라운드에 장군이 내 건물에 능력을 쓸 수 없습니다.',
    detail: [
      '자기 차례에 한 번, 내 도시의 종교 건물 수만큼 금화를 받습니다(건설 전후 원하는 때).',
      '이번 라운드 동안 8번 장군은 내 도시의 건물을 파괴할 수 없습니다.',
      '단, 주교가 암살당했다면 이 보호는 적용되지 않습니다.',
    ] },
  { id: 'merchant',  rank: 6, ko: '상인', en: 'Merchant', income: 'trade',
    short: '상업 건물마다 금화 1개를 받습니다. 추가로 금화 1개를 더 받습니다.',
    detail: [
      '자기 차례에 한 번, 내 도시의 상업 건물 수만큼 금화를 받습니다(건설 전후 원하는 때).',
      '어떤 방식으로 자원을 모았는지와 상관없이 금화 1개를 추가로 받습니다.',
    ] },
  { id: 'architect', rank: 7, ko: '건축가', en: 'Architect',
    short: '건물 카드 2장을 추가로 받습니다. 이번 차례에 건물을 최대 3개까지 지을 수 있습니다.',
    detail: [
      '어떤 방식으로 자원을 모았는지와 상관없이 건물 카드 2장을 추가로 받습니다.',
      '이번 차례의 건설 한도는 3개입니다.',
    ] },
  { id: 'warlord',   rank: 8, ko: '장군', en: 'Warlord', income: 'military',
    short: '군사 건물마다 금화 1개를 받습니다. 비용보다 1 적은 금화를 내고 건물 1개를 파괴할 수 있습니다.',
    detail: [
      '자기 차례에 한 번, 내 도시의 군사 건물 수만큼 금화를 받습니다(건설 전후 원하는 때).',
      '건물 하나를 골라 (비용 − 1)만큼 금화를 내고 파괴할 수 있습니다. 비용 1인 건물은 무료입니다.',
      '건물이 7개 이상인 완성된 도시, 살아 있는 주교의 도시, 아성(Keep)은 파괴할 수 없습니다.',
      '자기 도시의 건물도 파괴할 수 있습니다. 파괴된 건물은 덱 맨 아래로 돌아갑니다.',
    ] },
];
export const ROLE_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r]));
export const ROLE_BY_RANK = Object.fromEntries(ROLES.map(r => [r.rank, r]));

// 기본 건물 17종 54장 (규칙서: 종교 11, 군사 11, 귀족 12, 상업 20)
// 특수 건물 14장 (첫 게임 권장 목록)
export const DISTRICTS = [
  { id: 'temple',      ko: '신전',       en: 'Temple',       type: 'religious', cost: 1, count: 3 },
  { id: 'church',      ko: '교회',       en: 'Church',       type: 'religious', cost: 2, count: 3 },
  { id: 'monastery',   ko: '수도원',     en: 'Monastery',    type: 'religious', cost: 3, count: 3 },
  { id: 'cathedral',   ko: '대성당',     en: 'Cathedral',    type: 'religious', cost: 5, count: 2 },
  { id: 'watchtower',  ko: '감시탑',     en: 'Watchtower',   type: 'military',  cost: 1, count: 3 },
  { id: 'prison',      ko: '감옥',       en: 'Prison',       type: 'military',  cost: 2, count: 3 },
  { id: 'barracks',    ko: '병영',       en: 'Barracks',     type: 'military',  cost: 3, count: 3 },
  { id: 'fortress',    ko: '요새',       en: 'Fortress',     type: 'military',  cost: 5, count: 2 },
  { id: 'tavern',      ko: '선술집',     en: 'Tavern',       type: 'trade',     cost: 1, count: 5 },
  { id: 'market',      ko: '시장',       en: 'Market',       type: 'trade',     cost: 2, count: 4 },
  { id: 'trading_post',ko: '교역소',     en: 'Trading Post', type: 'trade',     cost: 2, count: 3 },
  { id: 'docks',       ko: '부두',       en: 'Docks',        type: 'trade',     cost: 3, count: 3 },
  { id: 'harbor',      ko: '항구',       en: 'Harbor',       type: 'trade',     cost: 4, count: 3 },
  { id: 'town_hall',   ko: '시청',       en: 'Town Hall',    type: 'trade',     cost: 5, count: 2 },
  { id: 'manor',       ko: '영주 저택',  en: 'Manor',        type: 'noble',     cost: 3, count: 5 },
  { id: 'castle',      ko: '성',         en: 'Castle',       type: 'noble',     cost: 4, count: 4 },
  { id: 'palace',      ko: '궁전',       en: 'Palace',       type: 'noble',     cost: 5, count: 3 },

  { id: 'dragon_gate', ko: '용의 문',     en: 'Dragon Gate',       type: 'unique', cost: 6, count: 1, timing: 'end',
    text: '게임이 끝날 때 2점을 추가로 얻습니다.' },
  { id: 'factory',     ko: '공방',        en: 'Factory',           type: 'unique', cost: 5, count: 1, timing: 'passive',
    text: '다른 특수 건물을 지을 때 금화를 1개 덜 냅니다.' },
  { id: 'haunted_quarter', ko: '유령 구역', en: 'Haunted Quarter', type: 'unique', cost: 2, count: 1, timing: 'end',
    text: '게임이 끝날 때, 원하는 건물 종류 하나로 셉니다. (앱이 가장 유리한 종류를 자동으로 고릅니다)' },
  { id: 'imperial_treasury', ko: '황실 보물고', en: 'Imperial Treasury', type: 'unique', cost: 5, count: 1, timing: 'end',
    text: '게임이 끝날 때 가진 금화 1개마다 1점을 추가로 얻습니다.' },
  { id: 'keep',        ko: '아성',        en: 'Keep',              type: 'unique', cost: 3, count: 1, timing: 'passive',
    text: '8번 장군은 아성에 능력을 쓸 수 없습니다(파괴 불가).' },
  { id: 'laboratory',  ko: '연구소',      en: 'Laboratory',        type: 'unique', cost: 5, count: 1, timing: 'turn',
    text: '내 차례마다 한 번, 손패 1장을 버리고 금화 2개를 받을 수 있습니다.' },
  { id: 'library',     ko: '도서관',      en: 'Library',           type: 'unique', cost: 6, count: 1, timing: 'gather',
    text: '자원을 모을 때 카드 뽑기를 고르면, 뽑은 카드를 모두 가집니다.' },
  { id: 'map_room',    ko: '지도의 방',   en: 'Map Room',          type: 'unique', cost: 5, count: 1, timing: 'end',
    text: '게임이 끝날 때 손패 1장마다 1점을 추가로 얻습니다.' },
  { id: 'quarry',      ko: '채석장',      en: 'Quarry',            type: 'unique', cost: 5, count: 1, timing: 'passive',
    text: '내 도시에 이미 있는 건물과 같은 이름의 건물을 지을 수 있습니다.' },
  { id: 'school_of_magic', ko: '마법 학교', en: 'School of Magic', type: 'unique', cost: 6, count: 1, timing: 'income',
    text: '건물 종류에 따라 자원을 얻는 능력을 쓸 때, 원하는 종류로 셉니다.' },
  { id: 'smithy',      ko: '대장간',      en: 'Smithy',            type: 'unique', cost: 5, count: 1, timing: 'turn',
    text: '내 차례마다 한 번, 금화 2개를 내고 카드 3장을 뽑을 수 있습니다.' },
  { id: 'statue',      ko: '조각상',      en: 'Statue',            type: 'unique', cost: 3, count: 1, timing: 'end',
    text: '게임이 끝날 때 왕관을 가지고 있으면 5점을 추가로 얻습니다.' },
  { id: 'thieves_den', ko: '도둑 소굴',   en: "Thieves' Den",      type: 'unique', cost: 6, count: 1, timing: 'build',
    text: '건설 비용의 일부 또는 전부를 금화 대신 손패로 낼 수 있습니다(카드 1장 = 금화 1개).' },
  { id: 'wishing_well',ko: '소원의 우물', en: 'Wishing Well',      type: 'unique', cost: 5, count: 1, timing: 'end',
    text: '게임이 끝날 때 내 도시의 특수 건물(소원의 우물 포함) 1개마다 1점을 추가로 얻습니다.' },
];
export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));

// 인원별 역할 제외 수 (규칙서 표: 8개 역할 사용 시)
export const DISCARD_TABLE = {
  4: { faceUp: 2, faceDown: 1 },
  5: { faceUp: 1, faceDown: 1 },
  6: { faceUp: 0, faceDown: 1 },
  7: { faceUp: 0, faceDown: 1 }, // 7번째 플레이어 특별 규칙
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;
export const COMPLETE_CITY = 7;
export const START_GOLD = 2;
export const START_HAND = 4;

export const TIMING_KO = {
  end: '게임 종료 시 점수', passive: '항상 적용', turn: '내 차례마다 한 번',
  gather: '자원 모으기', income: '수입 능력', build: '건설할 때',
};

// 한국어 조사: 받침 유무로 을/를, 이/가, 은/는, 과/와, (으)로를 고른다
export function josa(word, pair) {
  const s = String(word);
  const c = s.charCodeAt(s.length - 1);
  const isHangul = c >= 0xac00 && c <= 0xd7a3;
  const jong = isHangul ? (c - 0xac00) % 28 : 0;
  if (pair === '로') return s + (isHangul && jong !== 0 && jong !== 8 ? '으로' : '로');
  const [a, b] = { 을를: ['을', '를'], 이가: ['이', '가'], 은는: ['은', '는'], 과와: ['과', '와'] }[pair];
  return s + (isHangul ? (jong ? a : b) : a + '(' + b + ')');
}
// 이름 뒤 '님' (이미 '님'으로 끝나면 붙이지 않음: 선생님)
export const nim = name => (String(name).endsWith('님') ? name : name + '님');
