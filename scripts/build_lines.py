# -*- coding: utf-8 -*-
"""방향 알리미+ 전국 지하철 노선 데이터 생성기

입력: 국가철도공단 도시광역철도 역사정보(XLSX), 노선정보(XLSX)
출력: out/stations.json, out/lines.json, out/report.md

사용법: python3 build_lines.py 역사정보.xlsx 노선정보.xlsx
"""
import sys, re, json, math, collections, os
import openpyxl

STA_XLSX, LINE_XLSX = sys.argv[1], sys.argv[2]
OUT = 'out'
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- 이름 정규화
ALIAS = {'디엠시': '디지털미디어시티', '송도달비축제공원': '송도달빛축제공원',
         '서울': '서울역', '교대앞': '교대',
         # 노선정보 파일이 옛 역명을 쓰는 경우 → 현재 역명
         '신길온천': '능길', '성서공단': '성서산업단지', '성당못': '서부정류장'}

# 원본 좌표 오류 수정 (권역, 역명) -> (위도, 경도)
COORD_FIX = {('수도권', '양원'): (37.606596, 127.076218)}

# 가까이 있지만 환승역이 아닌 같은 이름의 역 (노선별로 따로 둠)
SEPARATE = {('수도권', '신촌')}
SEPARATE_HINT = {('GYEONGUI-JUNGANG', '신촌'): 'I4108', ('SEOUL-2', '신촌'): 'S1102'}

def norm(s):
    s = str(s).strip()
    s = re.sub(r'\(.*?\)', '', s, flags=re.S)
    s = re.sub(r'\s+', '', s)
    if s.endswith('역') and len(s) > 2 and s not in ('서울역', '부산역'):
        s = s[:-1]
    return ALIAS.get(s, s)

def region_of(code):
    code = str(code)
    if code[1:3] in ('11', '41', '28', '44'):
        return '수도권'
    if code[1:3] in ('26', '48'):
        return '부산권'
    if code[1:3] == '27':
        return '대구권'
    if code[1:3] == '29':
        return '광주'
    if code[1:3] == '30':
        return '대전'
    return '?'

# ---------------------------------------------------------------- 역 데이터
ws = openpyxl.load_workbook(STA_XLSX, read_only=True).worksheets[0]
STA = list(ws.iter_rows(values_only=True))[1:]
by_name = collections.defaultdict(list)          # (권역, 이름) -> 원자료 행들
for r in STA:
    if r[1] is None:
        continue
    by_name[(region_of(r[2]), norm(r[1]))].append(r)

# ---------------------------------------------------------------- 노선 데이터(순서 목록)
ws = openpyxl.load_workbook(LINE_XLSX, read_only=True).worksheets[0]
LINES_RAW = list(ws.iter_rows(values_only=True))[1:]

def seq(code, name_contains=None):
    """노선정보 파일의 정거장구성을 역 이름 목록으로."""
    for r in LINES_RAW:
        nm = str(r[1]).strip()
        ok = name_contains is None or (nm.startswith(name_contains[1:]) if name_contains.startswith('=')
                                       else name_contains in nm)
        if r[0] == code and ok:
            items = re.split(r'[,+]', str(r[4]).replace('"', ''))
            out = []
            for it in items:
                it = it.strip()
                if not it:
                    continue
                m = re.match(r'^[A-Z]?\d+(?:-\d+)?-(.+)$', it)
                out.append(norm(m.group(1) if m else it))
            return out
    raise KeyError(code)

def S(text):
    return [norm(x) for x in text.split(',')]

# ---------------------------------------------------------------- 이용자용 노선 정의
# 노선마다 구간(segments). kind: line(양방향) / loop(순환, 끝 역 다음은 첫 역) /
#   oneway_loop(한 방향 순환: 마지막 역 다음은 첫 역, 반대 방향 없음)
L = []
def line(id_, ko, en, color, region, operator, segments, note=''):
    L.append(dict(id=id_, name_ko=ko, name_en=en, color=color, region=region,
                  operator=operator, segments=segments, note=note))
def seg(name, stations, kind='line'):
    return dict(name=name, kind=kind, stations=stations)

gyeongwon = seq('I4102')                      # 청량리 → 연천
gyeongbu = [s for s in seq('I4101', '경부') if s not in ('광명', '서동탄')]
line('SEOUL-1', '1호선', 'Line 1', '#0052A4', '수도권', '서울교통공사·한국철도공사', [
    seg('본선 (연천 ↔ 신창)', list(reversed(gyeongwon)) + seq('I4101', '1호선')[1:] + gyeongbu[1:]),
    seg('경인선 (구로 ↔ 인천)', ['구로'] + seq('I1101')),
    seg('광명 셔틀 (금천구청 ↔ 광명)', ['금천구청', '광명']),
    seg('서동탄 (병점 ↔ 서동탄)', ['병점', '서동탄']),
])
l2 = seq('S1102', '2호선')
line('SEOUL-2', '2호선', 'Line 2', '#00A84D', '수도권', '서울교통공사', [
    seg('순환선 (내선·외선)', l2, 'loop'),
    seg('성수지선 (성수 ↔ 신설동)', ['성수'] + seq('S1121')),
    seg('신정지선 (신도림 ↔ 까치산)', ['신도림'] + seq('S1122')),
])
line('SEOUL-3', '3호선', 'Line 3', '#EF7C1C', '수도권', '서울교통공사·한국철도공사', [
    seg('대화 ↔ 오금', list(reversed(seq('I4106'))) + seq('I1103')[1:]),
])
anguac = seq('I4103')
anguac = anguac[:anguac.index('범계') + 1] + ['금정'] + anguac[anguac.index('범계') + 1:]
line('SEOUL-4', '4호선', 'Line 4', '#00A5DE', '수도권', '서울교통공사·한국철도공사·남양주도시공사', [
    seg('진접 ↔ 오이도', seq('I4104') + seq('I1104') + anguac),
])
l5 = seq('S1105')
cut = l5.index('둔촌동')
line('SEOUL-5', '5호선', 'Line 5', '#996CAC', '수도권', '서울교통공사', [
    seg('본선 (방화 ↔ 하남검단산)', l5[:cut]),
    seg('마천 방면 (강동 ↔ 마천)', ['강동'] + l5[cut:]),
])
l6 = seq('S1106')
i = l6.index('새절')
line('SEOUL-6', '6호선', 'Line 6', '#CD7C2F', '수도권', '서울교통공사', [
    seg('응암순환 (응암 → 역촌 → … → 구산 → 응암, 한 방향)', l6[:i], 'oneway_loop'),
    seg('응암 ↔ 신내', ['응암'] + l6[i:]),
], note='응암순환은 응암에서 출발해 구산을 거쳐 응암으로 돌아오는 한 방향 구간')
line('SEOUL-7', '7호선', 'Line 7', '#747F00', '수도권', '서울교통공사·인천교통공사', [
    seg('장암 ↔ 석남', seq('S1107', '수도권') + seq('S1107', '=도시철도 7호선')),
])
line('SEOUL-8', '8호선', 'Line 8', '#E6186C', '수도권', '서울교통공사·구리도시공사·남양주도시공사', [
    seg('별내 ↔ 모란', S('별내,다산,동구릉,구리,장자호수공원') + seq('S1108')),
])
line('SEOUL-9', '9호선', 'Line 9', '#BDB092', '수도권', '서울시메트로9호선', [
    seg('개화 ↔ 중앙보훈병원', seq('S1109')),
], note='급행 정차역은 운행정보로 2단계에 반영')
bundang = seq('I28K1', '분당')
bundang.remove('이매')
bundang.insert(bundang.index('야탑') + 1, '이매')
suin = seq('I28K1', '수인')
# 실제 열차는 사리 → 한대앞 ~ 오이도(4호선과 같은 선로) → 달월 로 운행 (운행정보로 확인)
k = suin.index('사리')
suin = suin[:k + 1] + S('한대앞,중앙,고잔,초지,안산,능길,정왕,오이도') + suin[k + 1:]
line('SUIN-BUNDANG', '수인분당선', 'Suin-Bundang Line', '#F5A200', '수도권', '한국철도공사', [
    seg('청량리 ↔ 인천', ['청량리', '왕십리'] + bundang + suin),
], note='급행은 2단계')
line('SINBUNDANG', '신분당선', 'Shinbundang Line', '#D4003B', '수도권', '신분당선', [
    seg('신사 ↔ 광교', seq('I11D1')),
])
gj = S('임진강,운천,문산,파주,월롱,금촌,금릉,운정,야당,탄현,일산,풍산,백마,곡산,대곡,능곡,행신,강매,한국항공대,수색,디지털미디어시티,가좌,'
       '홍대입구,서강대,공덕,효창공원앞,용산,이촌,서빙고,한남,옥수,응봉,왕십리,청량리,회기,중랑,상봉,망우,양원,구리,도농,양정,덕소,도심,'
       '팔당,운길산,양수,신원,국수,아신,오빈,양평,원덕,용문,지평')
line('GYEONGUI-JUNGANG', '경의중앙선', 'Gyeongui-Jungang Line', '#77C4A3', '수도권', '한국철도공사', [
    seg('본선 (임진강 ↔ 지평)', gj),
    seg('서울역 방면 (가좌 ↔ 서울역)', S('가좌,신촌,서울역')),
], note='급행은 2단계')
gc = seq('I41K2')
line('GYEONGCHUN', '경춘선', 'Gyeongchun Line', '#0C8E72', '수도권', '한국철도공사', [
    seg('청량리 ↔ 춘천', S('청량리,회기,중랑,상봉,망우') + gc),
    seg('광운대 ↔ 상봉', S('광운대,상봉')),
])
line('GYEONGGANG', '경강선', 'Gyeonggang Line', '#003DA5', '수도권', '한국철도공사', [
    seg('판교 ↔ 여주', seq('I41K5')),
])
line('SEOHAE', '서해선', 'Seohae Line', '#81A914', '수도권', '한국철도공사', [
    seg('일산 ↔ 원시', S('일산,풍산,백마,곡산,대곡,능곡') + seq('I41WS')),
])
line('AREX', '공항철도', 'AREX', '#0090D2', '수도권', '공항철도', [
    seg('서울역 ↔ 인천공항2터미널', seq('I28A1')),
], note='직통열차는 서울역·인천공항만 정차')
line('UI-SINSEOL', '우이신설선', 'Ui-Sinseol Line', '#B0CE18', '수도권', '우이신설경전철', [
    seg('북한산우이 ↔ 신설동', seq('L11UI'))])
line('SILLIM', '신림선', 'Sillim Line', '#6789CA', '수도권', '남서울경전철', [
    seg('샛강 ↔ 관악산', seq('L11SL'))])
line('GIMPO-GOLD', '김포골드라인', 'Gimpo Goldline', '#A17800', '수도권', '김포골드라인', [
    seg('양촌 ↔ 김포공항', seq('L41G1'))])
line('UIJEONGBU', '의정부경전철', 'U Line', '#FDA600', '수도권', '의정부경량전철', [
    seg('발곡 ↔ 탑석', seq('L41U1'))])
line('EVERLINE', '용인에버라인', 'Everline', '#6FB245', '수도권', '용인경전철', [
    seg('기흥 ↔ 전대·에버랜드', seq('L41E1'))])
line('INCHEON-1', '인천 1호선', 'Incheon Line 1', '#7CA8D5', '수도권', '인천교통공사', [
    seg('계양 ↔ 송도달빛축제공원', seq('S2801'))])
line('INCHEON-2', '인천 2호선', 'Incheon Line 2', '#ED8B00', '수도권', '인천교통공사', [
    seg('검단오류 ↔ 운연', seq('S2802'))])
line('INCHEON-MAGLEV', '인천공항 자기부상철도', 'Incheon Airport Maglev', '#FFCD12', '수도권', '인천국제공항공사', [
    seg('인천공항1터미널 ↔ 용유', seq('S28M1'))], note='운행 여부 확인 필요')
# 부산권
line('BUSAN-1', '부산 1호선', 'Busan Line 1', '#F06A00', '부산권', '부산교통공사', [seg('다대포해수욕장 ↔ 노포', seq('S2601'))])
line('BUSAN-2', '부산 2호선', 'Busan Line 2', '#81BF48', '부산권', '부산교통공사', [seg('장산 ↔ 양산', seq('S2602'))])
line('BUSAN-3', '부산 3호선', 'Busan Line 3', '#BB8C00', '부산권', '부산교통공사', [seg('수영 ↔ 대저', seq('S2603'))])
line('BUSAN-4', '부산 4호선', 'Busan Line 4', '#217DCB', '부산권', '부산교통공사', [seg('미남 ↔ 안평', seq('L2604'))])
line('BUSAN-GIMHAE', '부산김해경전철', 'Busan-Gimhae LRT', '#8652A1', '부산권', '부산김해경전철', [seg('사상 ↔ 가야대', seq('L48B1'))])
line('DONGHAE', '동해선', 'Donghae Line', '#0054A6', '부산권', '한국철도공사', [seg('부전 ↔ 태화강', seq('I26K6'))])
# 대구권·광주·대전
line('DAEGU-1', '대구 1호선', 'Daegu Line 1', '#D93F5C', '대구권', '대구교통공사', [seg('설화명곡 ↔ 하양', seq('S2701'))])
line('DAEGU-2', '대구 2호선', 'Daegu Line 2', '#00AA80', '대구권', '대구교통공사', [seg('문양 ↔ 영남대', seq('S2702'))])
line('DAEGU-3', '대구 3호선', 'Daegu Line 3', '#FFB100', '대구권', '대구교통공사', [seg('칠곡경대병원 ↔ 용지', seq('S2703'))])
line('DAEGYEONG', '대경선', 'Daegyeong Line', '#3E7DC1', '대구권', '한국철도공사', [seg('구미 ↔ 경산', seq('I27K7'))])
line('GWANGJU-1', '광주 1호선', 'Gwangju Line 1', '#009088', '광주', '광주교통공사', [seg('녹동 ↔ 평동', seq('S2901'))])
line('DAEJEON-1', '대전 1호선', 'Daejeon Line 1', '#007448', '대전', '대전교통공사', [seg('판암 ↔ 반석', seq('S3001'))])

# ---------------------------------------------------------------- 역 확정 (권역+이름, 멀리 떨어진 동명이역은 분리)
def dist_km(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

stations = {}       # id -> 역 정보
problems = []

def station_id(region, name, line_id, prev_coord):
    rows = by_name.get((region, name))
    if not rows:
        problems.append(f'역 데이터에 없음: [{region}] {name} ({line_id})')
        sid = f'{region}:{name}'
        stations.setdefault(sid, dict(id=sid, name_ko=name, name_en=None, name_hanja=None,
                                      lat=None, lng=None, region=region, lines=[], operators=[], missing=True))
        return sid, None
    # 동명이역: 좌표가 1.5km 넘게 떨어진 묶음은 서로 다른 역
    groups = []
    for r in rows:
        if r[9] is None:
            continue
        c = COORD_FIX.get((region, name), (float(r[9]), float(r[10])))
        if (region, name) in COORD_FIX and f'좌표 수정: {name}' not in problems:
            problems.append(f'좌표 수정: {name} (원본 좌표가 다른 지역을 가리켜 바로잡음)')
        for g in groups:
            if (region, name) in SEPARATE and g['rows'][0][2] != r[2]:
                continue
            if dist_km(g['c'], c) < 1.5:
                g['rows'].append(r); break
        else:
            groups.append(dict(c=c, rows=[r]))
    if not groups:
        problems.append(f'좌표 없음: [{region}] {name}')
        return f'{region}:{name}', None
    hint = SEPARATE_HINT.get((line_id, name))
    if hint:
        groups.sort(key=lambda g: g['rows'][0][2] != hint)
    elif len(groups) > 1 and prev_coord:
        groups.sort(key=lambda g: dist_km(g['c'], prev_coord))
    g = groups[0]
    sid = f'{region}:{name}' if len(groups) == 1 else f'{region}:{name}@{g["rows"][0][2]}'
    r0 = g['rows'][0]
    st = stations.setdefault(sid, dict(id=sid, name_ko=name, name_en=r0[4], name_hanja=r0[5],
                                       lat=round(g['c'][0], 6), lng=round(g['c'][1], 6),
                                       region=region, lines=[], operators=[]))
    if len(groups) > 1:
        st['disambiguation'] = f'같은 이름의 다른 역이 있음 ({len(groups)}곳)'
    for r in g['rows']:
        if r[11] and r[11] not in st['operators']:
            st['operators'].append(r[11])
    return sid, g['c']

out_lines = []
for ln in L:
    segs = []
    for sg in ln['segments']:
        ids, prev = [], None
        for nm in sg['stations']:
            sid, c = station_id(ln['region'], nm, ln['id'], prev)
            if c and prev and dist_km(prev, c) > 8:
                problems.append(f'역 간 거리 {dist_km(prev, c):.1f}km — 순서 확인: {ln["name_ko"]} {stations[ids[-1]]["name_ko"]} → {nm}')
            if ids and ids[-1] == sid:
                continue
            ids.append(sid)
            prev = c or prev
            if ln['id'] not in stations[sid]['lines']:
                stations[sid]['lines'].append(ln['id'])
        dup = [x for x, n in collections.Counter(ids).items() if n > 1]
        if dup:
            problems.append(f'구간 안 중복 역: {ln["name_ko"]} {sg["name"]} {dup}')
        segs.append(dict(name=sg['name'], kind=sg['kind'], stations=ids))
    out_lines.append(dict(id=ln['id'], name_ko=ln['name_ko'], name_en=ln['name_en'], color=ln['color'],
                          region=ln['region'], operator=ln['operator'], note=ln['note'], segments=segs))

# 같은 이름 다른 역 표시명
for st in stations.values():
    if 'disambiguation' in st:
        ln = next(l for l in out_lines if l['id'] == st['lines'][0])
        st['display_ko'] = f'{st["name_ko"]}({ln["name_ko"]})'

json.dump(sorted(stations.values(), key=lambda s: s['id']), open(f'{OUT}/stations.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
json.dump(out_lines, open(f'{OUT}/lines.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 보고서
rep = ['# 노선 데이터 생성 보고서', '',
       f'- 노선 {len(out_lines)}개, 역 {len(stations)}개 (환승역은 1개로 셈)', '']
rep.append('| 권역 | 노선 | 구간 | 역 수 |')
rep.append('| --- | --- | --- | --- |')
for l in out_lines:
    n = len({s for sg in l['segments'] for s in sg['stations']})
    rep.append(f'| {l["region"]} | {l["name_ko"]} | {len(l["segments"])} | {n} |')
rep += ['', '## 확인할 점', ''] + [f'- {p}' for p in problems] + \
       ['- GTX-A: 원본 데이터에 없음 → 수동 추가 필요']
open(f'{OUT}/report.md', 'w', encoding='utf-8').write('\n'.join(rep))
print('\n'.join(rep))
