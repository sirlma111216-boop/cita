// 이미지 자산 명세 — 자산 ID · 파일 경로 · 용도 · 화면 비율 · 대체 텍스트 · 연결된 역할/건물 ID
// 원본(PNG)은 assets-src/original/ 에 보존하고, 웹 배포용 WebP 는 scripts/optimize-images.mjs 로 public/img/ 에 만든다.
import { ROLES, DISTRICTS } from './data.js';

const list = [
  { id: 'background_entry',       file: 'img/background_entry.webp',       use: '시작 화면 배경',        ratio: '16:9', alt: '안개 낀 달빛 아래의 성곽 도시 전경' },
  { id: 'background_class_lobby', file: 'img/background_class_lobby.webp', use: '교사·학생 로비 배경',    ratio: '16:9', alt: '촛불이 켜진 오래된 석조 회랑' },
  { id: 'background_game_table',  file: 'img/background_game_table.webp',  use: '게임 화면·대기실 배경',  ratio: '16:9', alt: '지도가 펼쳐진 중세의 게임 탁자' },
  { id: 'background_results',     file: 'img/background_results.webp',     use: '결과 화면 배경',        ratio: '16:9', alt: '새벽빛에 물든 완성된 도시' },
  { id: 'card_back_character',    file: 'img/card_back_character.webp',    use: '비공개 역할 카드 뒷면',  ratio: '2:3',  alt: '역할 카드 뒷면' },
  { id: 'card_back_district',     file: 'img/card_back_district.webp',     use: '건물 덱·비공개 손패 뒷면', ratio: '2:3', alt: '건물 카드 뒷면' },
  { id: 'emblem_city',            file: 'img/emblem_city.webp',            use: '서비스 상징',            ratio: '1:1',  alt: '도시 문장' },
  { id: 'token_crown',            file: 'img/token_crown.webp',            use: '왕관 보유자 표시',       ratio: '1:1',  alt: '왕관' },
  { id: 'token_gold',             file: 'img/token_gold.webp',             use: '금화 표시',             ratio: '1:1',  alt: '금화' },
  { id: 'icon_noble',     file: 'icons/icon_noble.svg',     use: '귀족 건물 종류 아이콘', ratio: '1:1', alt: '귀족', link: 'noble' },
  { id: 'icon_religious', file: 'icons/icon_religious.svg', use: '종교 건물 종류 아이콘', ratio: '1:1', alt: '종교', link: 'religious' },
  { id: 'icon_trade',     file: 'icons/icon_trade.svg',     use: '상업 건물 종류 아이콘', ratio: '1:1', alt: '상업', link: 'trade' },
  { id: 'icon_military',  file: 'icons/icon_military.svg',  use: '군사 건물 종류 아이콘', ratio: '1:1', alt: '군사', link: 'military' },
  { id: 'icon_unique',    file: 'icons/icon_unique.svg',    use: '특수 건물 종류 아이콘', ratio: '1:1', alt: '특수', link: 'unique' },
];
for (const r of ROLES) {
  list.push({ id: 'character_' + r.id, file: `img/character_${r.id}.webp`, use: '역할 카드 일러스트', ratio: '2:3',
    alt: `${r.ko}(${r.en}) 역할 일러스트`, link: r.id });
}
for (const d of DISTRICTS) {
  list.push({ id: 'district_' + d.id, file: `img/district_${d.id}.webp`, use: d.type === 'unique' ? '특수 건물 카드 일러스트' : '기본 건물 카드 일러스트',
    ratio: '2:3', alt: `${d.ko}(${d.en}) 건물 일러스트`, link: d.id });
}

export const ASSETS = list;
export const ASSET_BY_ID = Object.fromEntries(list.map(a => [a.id, a]));
export const roleArt = id => ASSET_BY_ID['character_' + id];
export const districtArt = id => ASSET_BY_ID['district_' + id];
