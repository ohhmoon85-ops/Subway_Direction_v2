# 방향 알리미+ v2 (전국 지하철 방향 안내)

승강장 갈림길 기둥의 QR 표지를 찍고 목적지를 넣으면 **"이 표지를 마주 보고 ◀ 왼쪽 · 2번째 역 · 종각"** 을 알려 주는 휴대폰 웹 서비스입니다.
왼쪽·오른쪽은 기둥 QR로 들어왔을 때만 알려 주고, QR 없이 들어오면 "○○ 방면 · ○번째 역 · 다음 역"으로 안내합니다.
앱 설치 없이 열리며(PWA), 기획서 2판(2026-11-17)을 기준으로 만들었습니다.

- 기술: Next.js 15 (App Router) · TypeScript · Supabase(PostgreSQL) · Vercel
- 노선 데이터: 전국 도시철도 36개 노선 · 939개 역 (서울·수도권 전 노선 + 부산·대구·광주·대전, 국가철도공단 데이터 2026-06-30 기준, `src/data/stations.json`·`lines.json`, 만드는 법은 `scripts/README.md`)
- 화면 언어: 한국어 · 영어 · 일본어 · 중국어(간체·번체) · 스페인어 · 프랑스어 (휴대폰 언어 하나로 표시)
- 시험용 기둥 표지: 서울역(1·4호선), 시청(1·2호선), 강남(2호선), 충무로(3·4호선), 부산 서면(1·2호선)

## v2에서 바뀐 점 (기획서 2판 10장 "고칠 것" + "아직 확인 못 한 것")

| 구분 | 내용 | 위치 · 시험 |
| --- | --- | --- |
| 고칠 점 1 | 환승 경로의 큰 카드가 환승역만 보여 목적지로 오해됨 → **"환승역" 표시 + "정자에서 신분당선으로 갈아타세요" + 최종 도착역** (화면 낭독 문장에도) | `GuideApp.tsx` `GuideCard`, `lib/guide-text.ts` · `tests/v2-fixes.test.ts` |
| 고칠 점 2 | 1개 역일 때 "1번째 역 / 수원 / 다음 역: 수원" 중복 → **"다음 역에서 내리세요"**, 다음 역 줄 생략 (7개 언어) | `lib/i18n.ts` `nthNext` |
| 고칠 점 3 | 검색 목록의 노선 배지(신분당·수인분당)가 세로로 쪼개짐 → 배지 줄바꿈 금지, 배지 칸 넓힘 | `globals.css` `.line-badge`, `.badges` |
| 고칠 점 4 | 외국어 화면의 한글 노선 배지 → **라틴 약자**(SB·SBD·GJ·A…), 탭 제목도 고른 언어로, 영어·스페인어·프랑스어 **단수형**("1 stop") | `network-data.ts` `BADGE_ABBR`, `i18n.ts` `badgeText`·`ONE` |
| 고칠 점 5 | '자주 찾는 곳'이 서울 관광지로 고정 → **출발역 권역 기준** (부산·대구·광주·대전 관광지·주요 역 추가) | `lib/search.ts` `POPULAR`, `data/places.ts` |
| F6 · 3장 | **목적지 유지**: QR 없이 결과를 보다가 기둥 QR을 찍거나, 환승역에서 QR을 다시 찍으면 목적지를 다시 묻지 않고 바로 좌·우 안내 (휴대폰에 90분 보관, "다른 곳 찾기"·도착 시 삭제) | `lib/active-dest.ts` · `tests/qr-flow.test.ts` |
| F7 | **반대편 승강장 표지**: 표지가 한 방향만 가리키는데 반대 방향이 필요하면 "이 승강장이 아닙니다 · 반대편 ○○ 방면 승강장으로 건너가세요" (갈래가 나뉘는 역에서는 단정하지 않음) | `lib/guide-view.ts` `oppositePlatform` |
| F10 | **오프라인 안내**: 화면을 한 번 열면 노선 데이터·계산 코드를 휴대폰에 저장(서비스 워커), 망이 끊기면 휴대폰에서 같은 규칙으로 계산 | `lib/offline.ts`, `public/sw.js` · `tests/offline.test.ts` |

오프라인에서 안 되는 것: 주소 검색(카카오), 관리자가 추가한 역명 별칭, 환승역 표지의 좌·우(그곳 QR을 찍으면 됨), 통계 전송.

---

## 1. 구현 범위 (기획서 기능 번호 기준)

| 번호 | 기능 | 상태 | 위치 |
| --- | --- | --- | --- |
| F1 | QR 진입 (`/s/표지ID?sig=…`), 지점 이름·표지 사진 | ✅ | `src/app/s/[id]` |
| F2 | 휴대폰 언어로 화면 언어 자동 선택, 화면에서 바꾸기 | ✅ | `src/lib/i18n.ts` |
| F3 | 역명 자동완성 + 다국어 역명 사전(표기·별칭·오타 허용), 후보 여럿이면 선택 | ✅ | `src/lib/search.ts` |
| F4 | 장소·주소 → 가까운 역·출구 (주요 관광지 직접 정리 + 카카오 로컬 API) | ✅ | `src/data/places.ts`, `src/lib/kakao.ts` |
| F5 | 표지와 같은 색 큰 화살표 + 몇 번째 역 + 역명(이용자 언어·한국어) | ✅ | `src/components/GuideApp.tsx` |
| F6 | 환승 안내, 환승역에 등록된 표지가 있으면 그 표지 기준 좌·우까지 | ✅ | `src/lib/route.ts` |
| F7 | 청각: 모든 안내 문자 + 필담 화면 / 시각: 화면 낭독 한 문장, 큰 글씨·고대비 | ✅ | `WritingPad.tsx`, `globals.css` |
| F8 | "탑승했어요" → 한 정거장 전 화면·진동 알림, 화면 꺼짐 방지 | ✅ (평균 역간 시간 기준) | `RideView.tsx` |
| F9 | 서명된 표지 ID만 인정(HMAC), 아니면 경고 | ✅ | `src/lib/qr-sign.ts` |
| F10 | 현장 등록 도구: 다음 역만 고르면 방향 자동, 다른 관리자 승인 후 활성화 | ✅ | `src/app/admin` |
| F11 | 익명 통계 (스캔·언어·목적지·성공률·만족도·검색 실패어) | ✅ | `src/app/admin/stats` |
| F12~F18 | 음성 입력, 실시간 연동, 수어 영상, 출구 모드, 오프라인 계산, 촉지·NFC | 2·3단계 | — |

### 개정 기획서(전국 서비스, 2026-11-15) 기준 현황

| 번호 | 기능 | 상태 | 비고 |
| --- | --- | --- | --- |
| F1 | 현재 역 확인: 현재 위치 → 직전 위치(휴대폰에 30분) → 직접 선택. 찾으면 바로 출발역으로 정하고, 예외일 때만 후보 2~3개 | ✅ | `src/lib/location.ts`의 `originDecision` |
| F2 | QR 진입 + 서명 + 위치 대조 (오차를 빼고 300m 넘게 떨어지면 경고, 5분 넘은 위치로는 경고 안 함) | ✅ | 기둥별 고유 QR(A 방식) 전제 |
| F3·F4·F5·F6·F8·F12 | 언어 자동, 목적지·음성 입력, 방향 안내, 환승, 장애인 지원, 관리자 도구 | ✅ | 전국 데이터. 관광지·자주 찾는 곳은 수도권만 |
| F7 | 급행·분기 | 부분 | 1호선만 |
| F9 | 하차 알림 | 부분 | 평균 역간 시간 기준, 시간표 연동 전 |
| F10 | 오프라인 노선 계산 | ✅ (v2) | `src/lib/offline.ts` — 망이 끊기면 휴대폰에서 계산 |
| S0 | 첫 화면 "내 위치로 시작" + "도시·노선·역 고르기" (`/go?pick=line`). 위치 권한을 이미 허용했으면 열자마자 S1으로 | ✅ | 한 탭에서 한 번만 넘김(로고로 돌아오면 그대로). 다른 도시는 "준비 중" |
| S1 | 어디로 가세요? — 상단 "출발 ○○역 · 바꾸기", 입력창 자동 커서, 최근 간 곳 3개, 자주 찾는 곳 | ✅ | 최근 간 곳은 휴대폰(`dap_recent`)에만 저장 |
| — | 전국 노선 데이터(공공데이터포털), 도시 구분 | ⏳ | 6장 데이터 연동 필요 |

**위치 원칙(10장):** 가까운 역 계산은 휴대폰에서 합니다. 서버는 역 좌표만 내려보내고 위치를 받지 않습니다(예전 `/api/nearby`는 삭제). 직전 위치는 `localStorage`의 `dap_last_fix`에 최대 30분 보관하고, 위치 권한을 끄면 지웁니다. 첫 화면·표지 화면을 열 때 위치 권한이 **이미 허용된 경우에만** 조용히 저장합니다(새로 묻지 않음). 기준값(300m, 30분, 분당 80m 반경 확대)은 `location.ts` 맨 위에 모여 있으니 현장 시험 후 조정하세요.

**출발역을 물어보는 경우(5장, 예외만):** 위치 오차 100m 초과 · 반경 300m 안에 역 2개 이상 · 10분 넘은 직전 위치 · 반경 안에 역이 없음. 이때만 S1 상단에 후보 2~3개를 보여 한 번 누르게 합니다. 환승역의 노선은 묻지 않습니다(경로 계산이 고름). 값은 `CONFIRM_ACCURACY_M`, `CROWD_RADIUS_M`, `CONFIRM_AGE_MS`.

**주의 — 보안 헤더:** `next.config.mjs`의 `Permissions-Policy`가 `geolocation=()`·`microphone=()`이면 위치·음성 입력이 권한 창도 없이 실패합니다. `(self)`로 두고, `tests/headers.test.ts`가 이를 지킵니다.

**공용 QR·링크:** `/go?from=<역ID>`는 그 역을 출발역으로 바로 엽니다(역 입구 안내문용). `/go?pick=line`은 노선에서 고르기를 펼친 채로 엽니다.

**전국 데이터 규칙:**
- **역 ID**: 수도권 1~4호선 역은 시제품 때 ID 그대로(`city-hall`) → QR 표지·Supabase·통계가 깨지지 않습니다. 그 밖의 역은 영어 이름 slug, 다른 권역은 접두어(`busan-city-hall`), 같은 권역 동명이역은 노선 접미어(`sinchon-gyeongui-jungang-line`). JSON 키(`수도권:시청`)와는 `stationIdFromKey`·`stationKeyFromId`로 바꿉니다. 영어 역명이 바뀌면 ID가 바뀌니, 데이터 갱신 뒤 `tests/data-integrity.test.ts`로 확인하세요.
- **노선 ID**: 수도권 1~9호선 `1`~`9`, 나머지는 JSON 노선 ID(`BUSAN-1`). 예전 갈래 ID `1G`·`2S`·`2J`는 표지를 읽을 때 `1`·`2`로 바꿉니다(`store.ts`의 `normalizeSign`).
- **갈래**: 같은 노선의 갈래 이동은 경로 비용에 환승 벌점이 없습니다. 다만 열차가 이어 달리지 않는 곳(셔틀·지선, 분기역에서 되돌아가는 경로: 구일→구로→가산디지털단지, 길동→강동→둔촌동)은 안내를 그 역에서 나눠 "갈아타기"로 보여 줍니다(`route.ts`의 `mustChangeTrain`).
- **한 방향 순환**(6호선 응암순환)은 응암→역촌→…→구산→응암 방향으로만 잇습니다.
- **이름이 다른 환승역**: 4호선 총신대입구 ↔ 7호선 이수는 데이터에서 다른 역이라 `TRANSFER_LINKS`로 환승을 잇습니다.
- **권역**: 다른 권역 역은 이어지지 않아 "다른 도시의 역이에요"로 안내합니다. 검색은 출발 권역을 먼저 보여 줍니다.

**관리자 도구(8장):** 표지 목록·상태(정상·훼손·교체 필요·철거), 방향 매핑 수정(사유·수정자 기록, 이전 버전 복구), 다국어 임시 공지, 역명 사전 관리, 통계, 표지 인쇄(파랑 ◀ · 주황 ▶ · QR · 점자 자리, 브라우저 인쇄로 PDF 저장). 권한 3단계: 운영자 · 현장 등록자 · 공사 열람자. 2단계 인증(TOTP) 지원.

**품질 기준(6·9장):** `tests/answer-table.test.ts`에 사람이 노선도로 센 정답표 25건, `tests/invariants.test.ts`에 모든 표지 × 모든 역(약 1,000건)의 "방향이 뒤집힐 수 없는" 규칙 검사. **`npm run build`는 시험을 먼저 돌리고, 하나라도 틀리면 Vercel 배포가 멈춥니다.**

---

## 2. 내 컴퓨터에서 실행

Node.js 20 이상이 필요합니다. (Vercel은 프로젝트 설정의 Node 버전을 사용)

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 정답표 자동 시험
```

- 첫 화면의 "시연용 표지"를 누르면 QR을 찍은 것과 같은 화면이 열립니다. 휴대폰으로 보려면 같은 와이파이에서 `http://내PC주소:3000`.
- 관리자: `http://localhost:3000/admin` — 로컬에서는 시연 계정이 자동으로 생깁니다.
  `admin / admin1234`(운영자), `field1`·`field2 / field1234`(현장 등록자), `metro / viewer1234`(공사 열람자)
- 로컬 데이터는 `.data/db.json`에 저장됩니다 (Git에 올라가지 않음).

---

## 3. GitHub → Vercel 배포

Vercel 서버에는 파일을 저장할 수 없어서, 표지·이력·통계는 **Supabase**(무료 요금제로 충분)에 저장합니다.

### ① Supabase 준비 (5분)
1. https://supabase.com 에서 새 프로젝트를 만듭니다. 리전은 **Northeast Asia (Seoul)** 를 고르세요.
2. 왼쪽 메뉴 **SQL Editor** → `supabase/schema.sql` 내용을 붙여 넣고 **Run**.
3. **Project Settings → API**에서 `Project URL`과 `service_role` 키를 복사해 둡니다. (service_role 키는 절대 공개하지 마세요.)

### ② 비밀값 만들기
```bash
# 관리자 비밀번호 해시 (사람마다 한 번씩)
npm run hash-password -- 원하는비밀번호
# 무작위 비밀키 (QR_SECRET, SESSION_SECRET 용으로 두 번)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### ③ GitHub에 올리기
```bash
git init
git add .
git commit -m "방향 알리미+ v2"
git branch -M main
git remote add origin https://github.com/ohhmoon85-ops/Subway_Direction_v2.git
git push -u origin main
```
`.env`, `.data/`, `node_modules/`는 `.gitignore`로 제외됩니다. 저장소는 **비공개(Private)** 로 만드는 것을 권합니다(특허 출원 전 공개 주의 — 기획서 12장).

### ④ Vercel에서 가져오기
1. https://vercel.com → **Add New… → Project** → GitHub 저장소 선택 (Framework: Next.js 자동 인식).
2. **Environment Variables**에 아래 값을 넣고 **Deploy**.

| 이름 | 값 | 필수 |
| --- | --- | --- |
| `QR_SECRET` | ②에서 만든 무작위 값 | ✅ |
| `SESSION_SECRET` | ②에서 만든 다른 무작위 값 | ✅ |
| `ADMIN_USERS` | `admin:operator:<해시>;kim:field:<해시>;lee:field:<해시>;metro:viewer:<해시>` | ✅ |
| `SUPABASE_URL` | ①의 Project URL | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ①의 service_role 키 | ✅ |
| `PUBLIC_BASE_URL` | QR에 넣을 주소 (예: `https://dap.example.kr`). 없으면 Vercel 기본 도메인 | 선택 |
| `KAKAO_REST_API_KEY` | 카카오 디벨로퍼스 REST 키 (주소 검색) | 선택 |
| `SHOW_DEMO` | `false`면 첫 화면의 시연 표지 목록을 숨김 | 선택 |

3. 이후에는 `main`에 push할 때마다 자동으로 시험 → 빌드 → 배포됩니다. GitHub Actions(`.github/workflows/test.yml`)도 push·PR마다 시험을 돌립니다.

> ⚠️ **`QR_SECRET`을 바꾸면 이미 인쇄한 모든 표지의 QR이 "확인되지 않은 QR"이 됩니다.** 처음 정한 값을 안전한 곳에 보관하세요.
> ⚠️ **QR에 들어갈 주소(도메인)도 표지 인쇄 전에 확정하세요.** 나중에 바꾸면 표지를 다시 붙여야 합니다.

**2단계 인증 켜기(권장):** Base32 비밀키(예: `JBSWY3DPEHPK3PXP` 형식, 16~32자)를 만들어 인증 앱(Google Authenticator 등)에 등록하고, `ADMIN_USERS`의 해당 계정 끝에 `:비밀키`를 붙입니다.

---

## 4. 현장 등록 절차 (표지 1장)

1. 현장 등록자 A가 휴대폰으로 `/admin` 로그인 → **＋ 새 표지 (현장)**
2. 역 고르기, 지점 이름 입력 → 표지를 붙일 벽을 **마주 보고** 사진 찍기
3. "내 왼쪽으로 가면 타는 열차의 **다음 역**", 오른쪽도 같은 방식으로 고르기 → 노선·방면은 자동
4. 등록자 B가 같은 자리에서 화면을 보고 **현장 확인 완료 · 승인** (A는 자기 표지를 승인할 수 없음)
5. **표지 인쇄(PDF)** → 부착 → 휴대폰으로 직접 찍어 확인 → **부착 확인 완료**

방향을 고치면 자동으로 다시 "승인 대기"가 되어 2인 확인을 다시 거칩니다. 모든 수정은 사유와 함께 이력에 남고, 이전 버전으로 복구할 수 있습니다.

---

## 5. 폴더 구조

```
src/
  data/stations.json     전국 역 939개 (이름·좌표·권역·노선)
  data/lines.json        전국 노선 36개 (색·구간별 역 순서, kind: line/loop/oneway_loop)
  data/network-data.ts   위 JSON → 앱 역 ID·노선 ID, 이름 다른 환승역, 1호선 운행 계통(행선지)·급행역
  data/legacy-stations.ts 시제품 1~4호선 역 ID·일본어·중국어 역명 (ID 호환용, 자동 생성)
  data/station-coords.ts 역 좌표 (stations.json에서)
  data/places.ts         주요 관광지 → 역·출구
  data/seed-signs.ts     시범역 시연 표지 4장
  lib/route.ts           경로·좌우·정거장 수 계산 (핵심 로직, AI 미사용)
  lib/services.ts        1호선 "○○행만 타세요" / 급행 주의
  lib/search.ts          다국어 역명 사전 검색
  lib/i18n.ts            6개 언어 화면 문구 (번역 검수 시 이 파일만 수정)
  lib/store.ts           Supabase / 로컬 파일 저장소
  lib/qr-sign.ts         QR 서명
  lib/auth.ts            관리자 인증·세션·TOTP
  app/s/[id]             이용자 화면 (S1~S4)
  app/admin              관리자 도구
tests/                   정답표·불변식·검색·보안 시험
scripts/                 비밀번호 해시, 서명 URL, 정답표 CSV 내보내기
supabase/schema.sql      DB 스키마
```

`npm run answer-table` → 표지 × 모든 역의 전체 안내 결과를 `answer-table.csv`로 뽑습니다. 현장 담당자가 검토하는 정답표 초안으로 쓰세요.

---

## 6. 실제 운영 전에 꼭 확인할 것

이 시제품의 데이터 일부는 공공데이터 대조 전 **가정값·초안**입니다.

1. **시연 표지의 왼쪽/오른쪽 배정** (`seed-signs.ts`) — 현장 조사 전 가정값입니다. 실제 표지는 현장 등록 도구로 새로 등록하세요.
2. **노선 데이터** — `scripts/report.md`의 확인할 점(GTX-A 없음, 인천공항 자기부상철도 운행 여부, 급행·직통 미반영)을 보세요. 일본어·중국어 역명은 1~4호선 주요 역만 있고 나머지는 영어로 대신합니다.
3. **일본어·중국어 역명** — 주요 역만 넣었고 나머지는 영어 표기로 대신합니다. 공식 다국어 역명과 대조하고 번역 검수를 받아야 합니다. 화면 문구(`i18n.ts`)도 원어민 검수가 필요합니다.
4. **관광지 출구 번호** (`places.ts`) — 현장 안내도로 확인해 주세요.
5. **1호선 행선지·급행역** (`network-data.ts`의 `LINE1_SERVICES`) — 코레일 운행표로 확인해 주세요. 급행역 목록에 없으면 "일반 열차를 타세요"를 띄우는데, 일반 열차는 모든 역에 서므로 이 안내가 틀릴 위험은 없습니다.
6. **하차 알림 시간** — 공공 시간표 연동 전이라 노선별 평균 역간 시간(`RideView.tsx`의 `SEC_PER_STOP`)으로 추정합니다. 어긋나면 이용자가 "+1" 버튼으로 맞춥니다. 시범 운영에서 보정하거나 서울교통공사 시간표 API로 바꾸세요.
7. **아이폰** — 웹 브라우저가 진동을 지원하지 않아 화면 점멸·큰 문자로 알립니다. 카카오톡·네이버 앱 안 브라우저에서도 꼭 시험하세요(9장).
