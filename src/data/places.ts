/**
 * 직접 정리한 주요 관광지 → 가까운 역·출구.
 * 카카오 로컬 API 결과는 저장할 수 없으므로(이용 정책) 자주 찾는 곳은 여기에 직접 둔다.
 * 출구 번호는 현장·공사 안내도로 검수 필요. 확실하지 않은 곳은 출구를 비워 둔다.
 */
import type { Place } from '@/lib/types';

/** region: 역이 있는 권역 (없으면 수도권). 같은 이름의 역이 여러 도시에 있을 수 있어 권역으로 고른다. */
type RawPlace = [id: string, stationKo: string, exit: string | undefined, name: Place['name'], aliases?: string[], region?: string];

export const RAW_PLACES: RawPlace[] = [
  ['gyeongbokgung-palace', '경복궁', '5', { ko: '경복궁(궁궐)', en: 'Gyeongbokgung Palace', ja: '景福宮', zh: '景福宫', es: 'Palacio Gyeongbokgung', fr: 'Palais Gyeongbokgung' }, ['국립고궁박물관', '국립민속박물관']],
  ['myeongdong-street', '명동', '6', { ko: '명동 거리', en: 'Myeongdong Shopping Street', ja: '明洞', zh: '明洞', es: 'Calle comercial Myeongdong', fr: 'Rue commerçante de Myeongdong' }, ['명동성당', 'Myeongdong Cathedral']],
  ['n-seoul-tower', '명동', '3', { ko: 'N서울타워(남산)', en: 'N Seoul Tower (Namsan)', ja: 'Nソウルタワー', zh: 'N首尔塔', es: 'Torre N Seúl', fr: 'Tour N Séoul' }, ['남산타워', 'Namsan Tower', '남산케이블카', '南山']],
  ['namdaemun-market', '회현', '5', { ko: '남대문시장', en: 'Namdaemun Market', ja: '南大門市場', zh: '南大门市场', es: 'Mercado Namdaemun', fr: 'Marché Namdaemun' }, ['숭례문', 'Sungnyemun']],
  ['insadong', '안국', '6', { ko: '인사동', en: 'Insa-dong', ja: '仁寺洞', zh: '仁寺洞', es: 'Insadong', fr: 'Insadong' }, ['쌈지길', 'Ssamziegil']],
  ['bukchon', '안국', '2', { ko: '북촌한옥마을', en: 'Bukchon Hanok Village', ja: '北村韓屋村', zh: '北村韩屋村', es: 'Aldea Bukchon Hanok', fr: 'Village Bukchon Hanok' }],
  ['changdeokgung', '안국', '3', { ko: '창덕궁', en: 'Changdeokgung Palace', ja: '昌徳宮', zh: '昌德宫', es: 'Palacio Changdeokgung', fr: 'Palais Changdeokgung' }],
  ['deoksugung', '시청', '2', { ko: '덕수궁', en: 'Deoksugung Palace', ja: '徳寿宮', zh: '德寿宫', es: 'Palacio Deoksugung', fr: 'Palais Deoksugung' }, ['서울광장', 'Seoul Plaza']],
  ['ddp', '동대문역사문화공원', '1', { ko: '동대문디자인플라자(DDP)', en: 'Dongdaemun Design Plaza (DDP)', ja: '東大門デザインプラザ', zh: '东大门设计广场', es: 'Dongdaemun Design Plaza', fr: 'Dongdaemun Design Plaza' }],
  ['gwangjang-market', '종로5가', '8', { ko: '광장시장', en: 'Gwangjang Market', ja: '広蔵市場', zh: '广藏市场', es: 'Mercado Gwangjang', fr: 'Marché Gwangjang' }],
  ['hongdae', '홍대입구', '9', { ko: '홍대 거리', en: 'Hongdae Street', ja: '弘大ストリート', zh: '弘大街', es: 'Calle Hongdae', fr: 'Rue de Hongdae' }],
  ['ewha', '이대', '2', { ko: '이화여자대학교', en: 'Ewha Womans University', ja: '梨花女子大学', zh: '梨花女子大学', es: 'Universidad Ewha', fr: 'Université Ewha' }],
  ['lotte-world', '잠실', '4', { ko: '롯데월드', en: 'Lotte World', ja: 'ロッテワールド', zh: '乐天世界', es: 'Lotte World', fr: 'Lotte World' }],
  ['lotte-world-tower', '잠실', undefined, { ko: '롯데월드타워', en: 'Lotte World Tower', ja: 'ロッテワールドタワー', zh: '乐天世界塔', es: 'Lotte World Tower', fr: 'Lotte World Tower' }, ['서울스카이', 'Seoul Sky']],
  ['coex', '삼성', '5', { ko: '코엑스(별마당도서관)', en: 'COEX (Starfield Library)', ja: 'COEX', zh: 'COEX', es: 'COEX', fr: 'COEX' }, ['별마당도서관', 'Starfield']],
  ['garosugil', '신사', '8', { ko: '가로수길', en: 'Garosu-gil', ja: 'カロスキル', zh: '林荫道', es: 'Garosu-gil', fr: 'Garosu-gil' }],
  ['namsangol', '충무로', '4', { ko: '남산골한옥마을', en: 'Namsangol Hanok Village', ja: '南山コル韓屋村', zh: '南山谷韩屋村', es: 'Aldea Namsangol Hanok', fr: 'Village Namsangol Hanok' }],
  ['daehangno', '혜화', '2', { ko: '대학로', en: 'Daehak-ro', ja: '大学路', zh: '大学路', es: 'Daehak-ro', fr: 'Daehak-ro' }],
  ['seoul-forest', '뚝섬', '8', { ko: '서울숲', en: 'Seoul Forest', ja: 'ソウルの森', zh: '首尔林', es: 'Bosque de Seúl', fr: 'Forêt de Séoul' }],
  ['arts-center', '남부터미널', '5', { ko: '예술의전당', en: 'Seoul Arts Center', ja: '芸術の殿堂', zh: '艺术殿堂', es: 'Centro de Artes de Seúl', fr: 'Centre des arts de Séoul' }],
  ['national-museum', '이촌', '2', { ko: '국립중앙박물관', en: 'National Museum of Korea', ja: '国立中央博物館', zh: '国立中央博物馆', es: 'Museo Nacional de Corea', fr: 'Musée national de Corée' }],
  ['war-memorial', '삼각지', '12', { ko: '전쟁기념관', en: 'War Memorial of Korea', ja: '戦争記念館', zh: '战争纪念馆', es: 'Memorial de Guerra de Corea', fr: 'Mémorial de la guerre de Corée' }],
  ['seoul-grand-park', '대공원', '2', { ko: '서울대공원', en: 'Seoul Grand Park', ja: 'ソウル大公園', zh: '首尔大公园', es: 'Gran Parque de Seúl', fr: 'Grand parc de Séoul' }, ['서울동물원', 'Seoul Zoo']],
  ['tapgol', '종로3가', '1', { ko: '탑골공원', en: 'Tapgol Park', ja: 'タプコル公園', zh: '塔谷公园', es: 'Parque Tapgol', fr: 'Parc Tapgol' }],
  ['incheon-chinatown', '인천', '1', { ko: '인천 차이나타운', en: 'Incheon Chinatown', ja: '仁川チャイナタウン', zh: '仁川中华街', es: 'Barrio chino de Incheon', fr: 'Quartier chinois d’Incheon' }],
  ['hwaseong-fortress', '수원', undefined, { ko: '수원화성', en: 'Suwon Hwaseong Fortress', ja: '水原華城', zh: '水原华城', es: 'Fortaleza Hwaseong', fr: 'Forteresse Hwaseong' }],
  ['cheonggyecheon', '종각', undefined, { ko: '청계천', en: 'Cheonggyecheon Stream', ja: '清渓川', zh: '清溪川', es: 'Arroyo Cheonggyecheon', fr: 'Ruisseau Cheonggyecheon' }],
  ['gwanghwamun', '경복궁', undefined, { ko: '광화문광장', en: 'Gwanghwamun Square', ja: '光化門広場', zh: '光化门广场', es: 'Plaza Gwanghwamun', fr: 'Place Gwanghwamun' }, ['광화문', 'Gwanghwamun']],
  ['express-bus-terminal', '고속터미널', undefined, { ko: '서울고속버스터미널', en: 'Seoul Express Bus Terminal', ja: 'ソウル高速バスターミナル', zh: '首尔高速巴士客运站', es: 'Terminal de autobuses exprés', fr: 'Gare routière express' }],

  // ── 부산 · 대구 · 광주 · 대전 (출구 번호는 현장 확인 전이라 비워 둠)
  ['haeundae-beach', '해운대', undefined, { ko: '해운대해수욕장', en: 'Haeundae Beach', ja: '海雲台海水浴場', zh: '海云台海水浴场', 'zh-TW': '海雲台海水浴場', es: 'Playa de Haeundae', fr: 'Plage de Haeundae' }, ['해운대', 'Haeundae'], '부산권'],
  ['gwangalli-beach', '광안', undefined, { ko: '광안리해수욕장', en: 'Gwangalli Beach', ja: '広安里海水浴場', zh: '广安里海水浴场', 'zh-TW': '廣安里海水浴場', es: 'Playa de Gwangalli', fr: 'Plage de Gwangalli' }, ['광안대교', 'Gwangan Bridge'], '부산권'],
  ['jagalchi-market', '자갈치', undefined, { ko: '자갈치시장', en: 'Jagalchi Fish Market', ja: 'チャガルチ市場', zh: '札嘎其市场', 'zh-TW': '札嘎其市場', es: 'Mercado de pescado Jagalchi', fr: 'Marché aux poissons Jagalchi' }, ['BIFF광장', '국제시장'], '부산권'],
  ['gamcheon-village', '토성', undefined, { ko: '감천문화마을', en: 'Gamcheon Culture Village', ja: '甘川文化村', zh: '甘川文化村', 'zh-TW': '甘川文化村', es: 'Aldea cultural Gamcheon', fr: 'Village culturel de Gamcheon' }, ['Gamcheon'], '부산권'],
  ['seomyeon', '서면', undefined, { ko: '서면 번화가', en: 'Seomyeon', ja: '西面', zh: '西面', 'zh-TW': '西面', es: 'Seomyeon', fr: 'Seomyeon' }, [], '부산권'],
  ['dongseongno', '중앙로', undefined, { ko: '동성로', en: 'Dongseong-ro', ja: '東城路', zh: '东城路', 'zh-TW': '東城路', es: 'Dongseong-ro', fr: 'Dongseong-ro' }, ['Dongseongno'], '대구권'],
  ['seomun-market', '서문시장', undefined, { ko: '서문시장', en: 'Seomun Market', ja: '西門市場', zh: '西门市场', 'zh-TW': '西門市場', es: 'Mercado Seomun', fr: 'Marché Seomun' }, [], '대구권'],
  ['suseong-lake', '수성못', undefined, { ko: '수성못', en: 'Suseong Lake', ja: '寿城池', zh: '寿城池', 'zh-TW': '壽城池', es: 'Lago Suseong', fr: 'Lac Suseong' }, [], '대구권'],
  ['acc-gwangju', '문화전당', undefined, { ko: '국립아시아문화전당', en: 'Asia Culture Center', ja: '国立アジア文化殿堂', zh: '国立亚洲文化殿堂', 'zh-TW': '國立亞洲文化殿堂', es: 'Centro de Cultura Asiática', fr: 'Centre culturel asiatique' }, ['ACC', '5·18민주광장', '충장로'], '광주'],
  ['yangdong-market', '양동시장', undefined, { ko: '양동시장', en: 'Yangdong Market', ja: '良洞市場', zh: '良洞市场', 'zh-TW': '良洞市場', es: 'Mercado Yangdong', fr: 'Marché Yangdong' }, [], '광주'],
  ['sungsimdang', '중앙로', undefined, { ko: '성심당 본점(은행동)', en: 'Sungsimdang Bakery', ja: '聖心堂', zh: '圣心堂', 'zh-TW': '聖心堂', es: 'Panadería Sungsimdang', fr: 'Boulangerie Sungsimdang' }, ['성심당', '은행동', '으능정이'], '대전'],
  ['yuseong-spa', '유성온천', undefined, { ko: '유성온천', en: 'Yuseong Hot Springs', ja: '儒城温泉', zh: '儒城温泉', 'zh-TW': '儒城溫泉', es: 'Aguas termales de Yuseong', fr: 'Sources chaudes de Yuseong' }, [], '대전'],
];
