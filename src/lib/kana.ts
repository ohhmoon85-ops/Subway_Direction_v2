/**
 * 일본어 가타카나·히라가나로 친 역명 찾기 (예: アングク → 안국, ミョンドン → 명동).
 *
 * 일본어 역명 자료는 일부 역에만 있으므로, 모든 역의 한글 이름에서 "일본식 발음"을 자동으로 만들고
 * 이용자가 친 가나도 같은 로마자로 바꿔 비교한다. 두 쪽을 같은 규칙(훈령식에 가까운 단순 로마자)으로 맞추는 것이 핵심이다.
 *   안국 → an + guku → "anguku"      アングク → a n gu ku → "anguku"
 *   서울 → so + uru  → "souru"       ソウル   → so u ru   → "souru"
 * 완벽한 표기 변환이 아니라 검색용이므로, 조금 다른 표기(ッ 유무 등)는 오타 허용으로 잡는다.
 */

// ── 가나 → 로마자 ────────────────────────────────────────────

const KANA: Record<string, string> = {
  ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o',
  カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko',
  ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go',
  サ: 'sa', シ: 'si', ス: 'su', セ: 'se', ソ: 'so',
  ザ: 'za', ジ: 'zi', ズ: 'zu', ゼ: 'ze', ゾ: 'zo',
  タ: 'ta', チ: 'ti', ツ: 'tu', テ: 'te', ト: 'to',
  ダ: 'da', ヂ: 'zi', ヅ: 'zu', デ: 'de', ド: 'do',
  ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no',
  ハ: 'ha', ヒ: 'hi', フ: 'hu', ヘ: 'he', ホ: 'ho',
  バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo',
  パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po',
  マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo',
  ヤ: 'ya', ユ: 'yu', ヨ: 'yo',
  ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro',
  ワ: 'wa', ヲ: 'o', ン: 'n', ヴ: 'bu',
};
const SMALL_Y: Record<string, string> = { ャ: 'a', ュ: 'u', ョ: 'o' };
const SMALL_V: Record<string, string> = { ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o' };

export function hasKana(s: string): boolean {
  return /[ぁ-ゖァ-ヺ]/.test(s);
}

/** 히라가나 → 가타카나 */
function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 가나 → 단순 로마자. 가나가 아닌 글자는 버린다. */
export function kanaToRomaji(input: string): string {
  let out = '';
  for (const c of toKatakana(input.normalize('NFKC'))) {
    if (KANA[c]) {
      out += KANA[c];
    } else if (SMALL_Y[c]) {
      // キャ → kya, チョ → tyo : 앞 글자의 i를 y로
      out = out.endsWith('i') ? `${out.slice(0, -1)}y${SMALL_Y[c]}` : out + SMALL_Y[c];
    } else if (SMALL_V[c]) {
      const v = SMALL_V[c];
      if (out.endsWith('u')) out = `${out.slice(0, -1)}w${v}`; // クァ → kwa, ウォ → wo, ウィ → wi
      else if (out.endsWith('i')) out = `${out.slice(0, -1)}y${v}`; // チェ → tye, ジェ → zye
      else if (/[eo]$/.test(out)) out = out.slice(0, -1) + v; // ティ → ti, トゥ → tu
      else out += v;
    }
    // ッ(작은 츠)·ー(장음)·그 밖의 글자는 버린다
  }
  return out;
}

// ── 한글 → 일본식 로마자 ─────────────────────────────────────

const L = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const V = ['a', 'e', 'ya', 'ye', 'o', 'e', 'yo', 'ye', 'o', 'wa', 'we', 'we', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'u', 'ui', 'i'];
// 받침: ㄴ·ㅇ → ン, ㅁ → ム, ㄱ → ク, ㄹ → ル, ㅂ → プ, 나머지 → ッ(버림)
const T = ['', 'ku', 'ku', 'ku', 'n', 'n', 'n', '', 'ru', 'ku', 'mu', 'ru', 'ru', 'ru', 'pu', 'ru', 'mu', 'pu', 'pu', '', '', 'n', '', '', 'ku', '', 'pu', ''];
/** 이 받침 뒤의 ㄱ·ㄷ·ㅂ·ㅈ은 일본어 표기에서 탁음이 된다 (없음·ㄴ·ㄹ·ㅁ·ㅇ) */
const VOICING_T = new Set([0, 4, 8, 16, 21]);

function onset(l: number, voiced: boolean, v: string): string {
  const c = L[l];
  switch (c) {
    case 'g':
      return (voiced ? 'g' : 'k') + v;
    case 'kk':
    case 'k':
      return 'k' + v;
    case 'd':
    case 'tt':
    case 't': {
      const b = c === 'd' && voiced ? 'd' : 't';
      return v === 'i' ? `${b}i` : b + v; // 디 → ティ(ti)
    }
    case 'b':
      return (voiced ? 'b' : 'p') + v;
    case 'pp':
    case 'p':
      return 'p' + v;
    case 's':
    case 'ss':
      return 's' + v;
    case 'j':
    case 'jj':
    case 'ch': {
      // 자 → チャ(tya) / 정자 → チョンジャ(tyon zya)
      const b = c === 'j' && voiced ? 'z' : 't';
      if (v === 'i') return `${b}i`;
      if (v.startsWith('y') || v.startsWith('w')) return b + v;
      return `${b}y${v}`;
    }
    case 'r':
      return 'r' + v;
    case 'n':
      return 'n' + v;
    case 'm':
      return 'm' + v;
    case 'h':
      return 'h' + v;
    default: // ㅇ
      return v === 'ui' ? 'wi' : v;
  }
}

/** 한글 역명 → 일본식 로마자 (안국 → anguku, 명동 → myondon) */
/** 탁음·반탁음 차이를 없앤다 (ジ/チ, グ/ク, ド/ト, ブ/プ). 한국어의 유성음화는 표기가 들쭉날쭉해서 검색에서는 같게 본다. */
export function foldVoicing(r: string): string {
  return r.replace(/g/g, 'k').replace(/d/g, 't').replace(/[bp]/g, 'p').replace(/z/g, 't');
}

export function hangulToJaRomaji(ko: string): string {
  let out = '';
  let prevT = 0;
  let first = true;
  for (const ch of ko) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) {
      first = true; // 한글이 아닌 글자(괄호·숫자)는 건너뛰고 새 낱말로 본다
      prevT = 0;
      continue;
    }
    const l = Math.floor(code / 588);
    const v = V[Math.floor((code % 588) / 28)];
    const tt = code % 28;
    const voiced = !first && VOICING_T.has(prevT);
    // ㅢ: 낱말 첫머리의 '의'만 ウィ(의정부 → wi), 그 밖에는 イ(여의도 → yoido, 희 → hi)
    const vv = v === 'ui' && !(L[l] === '' && first) ? 'i' : v;
    out += onset(l, voiced, vv) + T[tt];
    prevT = tt;
    first = false;
  }
  return out;
}
