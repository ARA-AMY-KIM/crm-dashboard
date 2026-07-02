# CRM Admin 신규 구축 현황 대시보드 (스쿼드 대시보드)

> 최종 업데이트: 2026년 6월 10일
> Jira 이니셔티브: PNB-628 (ajnetworks.atlassian.net)
> 배포 URL: https://crm-admin-dashboard.netlify.app (루트 `/`)
> 작업 파일: `src/App.jsx`, `netlify/functions/jira.js`

---

## 개요

PNB-628 이니셔티브 하위의 **CRM Admin 신규 구축** 작업 전체 진행 현황을 보여주는 대시보드.
이니셔티브 → 에픽 → 작업 티켓 → 하위 작업의 4계층을 한 화면에 펼쳐, 카테고리별·상태별 진행률을 실시간 집계한다.

같은 Netlify 프로젝트 안에서 **루트 경로(`/`)는 이 스쿼드 대시보드**, **하위 경로(`/chapter/`)는 기획챕터 대시보드**로 분리 운영된다. 두 대시보드는 환경변수(`JIRA_EMAIL`, `JIRA_API_TOKEN`)만 공유하고 코드·데이터 조회 로직은 완전히 별개다.

| 구분 | 스쿼드 대시보드 (본 문서) | 챕터 대시보드 |
|---|---|---|
| 경로 | `/` (루트) | `/chapter/` |
| 프론트엔드 | `src/App.jsx` (React) | `public/chapter/index.html` (단일 HTML) |
| API 함수 | `netlify/functions/jira.js` | `netlify/functions/chapter.js` |
| 조회 기준 | PNB-628 하위 전체 (계층 구조) | 5인 담당자 기준 (CRM·PNB·CON) |
| 엔드포인트 | `?type=all` / `?type=refresh` | `?type=chapter` / `?type=refresh` |

---

## 파일 구조

```
crm-dashboard/
├── index.html                 # 루트 진입점 (#root → src/main.jsx)
├── src/
│   ├── main.jsx               # React 엔트리
│   └── App.jsx                # 스쿼드 대시보드 전체 (단일 컴포넌트, 소스 원본)
├── netlify/
│   └── functions/
│       ├── jira.js            # 스쿼드 대시보드용 API (본 문서)
│       └── chapter.js         # 챕터 대시보드용 API
├── dist/                      # 빌드 산출물 (npm run build 시 생성, 배포 대상)
├── netlify.toml               # publish=dist, command=npm run build, functions=netlify/functions
└── package.json
```

> ⚠️ 소스 원본은 `src/App.jsx` 한 곳뿐이다. `dist/` 내 번들(`assets/index-*.js`)은 빌드 산출물이므로 직접 수정 금지 — 다음 빌드 때 덮어써진다.

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 프론트엔드 | React 19 + Vite (단일 컴포넌트 `App.jsx`, 인라인 스타일) |
| 백엔드 | Netlify Functions (Node.js, CommonJS `exports.handler`) |
| 데이터 소스 | Jira REST API v3 (`/search/jql`, nextPageToken 페이지네이션) |
| 빌드 | Vite (`npm run build` → `dist/`) |
| 배포 | Netlify CLI (`npx netlify-cli deploy --prod`), siteId `51065dd1-…` |
| 인증 | 환경변수 `JIRA_EMAIL`, `JIRA_API_TOKEN` (챕터와 공유) |

---

## 배포 방법

```powershell
cd C:\Users\a\OneDrive\Desktop\crm-dashboard
npm run build
npx netlify-cli deploy --prod
```

> `src/App.jsx` 수정 후 **반드시 `npm run build` 실행.**
> `netlify deploy`는 기본적으로 빌드를 다시 돌리지 않고 현재 `dist/`를 업로드하므로, 빌드를 건너뛰면 React 수정이 반영되지 않는다. (챕터 대시보드와 동일한 함정)

---

## jira.js — API 함수

### 엔드포인트
```
GET /.netlify/functions/jira?type=all       # 전체 데이터 조회 (에픽+작업+하위작업)
GET /.netlify/functions/jira?type=refresh    # 캐시 초기화
```
> `type` 값이 `all`/`refresh`가 아니면 400 (`"type=all 필요"`) 반환.

### 조회 순서 (3단계 계층 조회)

**1단계 — 에픽**
```
issueType=Epic AND parent=PNB-628 ORDER BY created ASC
필드: summary, status, assignee, customfield_10054
```
> `customfield_10054`는 에픽 단위 PNB-UPGRADE 제외 판정을 위해 조회한다(2026-06-30 추가).

**2단계 — 작업 티켓** (1단계 에픽 키들을 부모로)
```
issueType in (작업,Story,Task) AND parent in (<에픽키들>) ORDER BY parent ASC
필드: summary, status, assignee, parent, resolutiondate, duedate,
      customfield_10056, issuetype, customfield_10054
```

**3단계 — 하위 작업** (2단계 작업 키들을 부모로)
```
issueType in subTaskIssueTypes() AND parent in (<작업키들>) ORDER BY parent ASC
필드: summary, status, assignee, parent, issuetype, resolutiondate,
      customfield_10056, duedate
```

> 에픽이 0개면 빈 결과(`{epics:[],tasks:[],subtasks:[]}`)를 즉시 반환한다.

### 핵심 필드 매핑
| Jira 필드 | 의미 | 비고 |
|---|---|---|
| 에픽 `summary` | `[카테고리]` 태그 + 에픽명 | 카테고리 판정 근거 |
| `customfield_10054` | 컴포넌트/라벨 배열 | `PNB-UPGRADE` 포함 시 대시보드 제외 |
| `duedate` | 기한 (시스템 필드) | ※ 과거 `customfield_10501`이었으나 변경됨 |
| `customfield_10056` | 시작일/생성일 | 프론트의 `created` |
| `resolutiondate` | 처리완료일 | 완료 티켓의 `✓ 날짜` 표시 |

### 카테고리 매핑 (에픽 summary 태그 기반)
`[업체 관리]` → 업체 관리 / `[상품 관리]` → 상품 관리 / `[운영 관리]` → 운영 관리 / `[개발 설정]` → 개발 설정 / `[어드민 운영]` → 어드민 운영 / `[공통]` → 공통 / 그 외([기반작업] 등) → 기타

> 2026-07-01 재분류: 기존 `[시스템 관리]`가 Jira에서 `[상품 관리]`·`[개발 설정]`으로 분리됨. 코드에 `[시스템 관리]` 인식은 방어적으로 남아 있으나 현재 사용 에픽 없음.

**칩 정렬(고정 순서):** `CAT_ORDER`로 전체 · 업체 관리 · 상품 관리 · 운영 관리 · 개발 설정 · 어드민 운영 · 공통 · 기타 순 고정. 목록에 없는 카테고리가 생기면 뒤에 자동 추가. 카테고리 추가 시 `getCategoryFromSummary`(인식), `CAT_C`(색상), `CAT_ORDER`(정렬) **세 곳** 갱신 필요.

### 하위 작업 타입
`Planning`, `Design`, `BE`, `FE`, `QA`, `bug(QA)` — 프론트에서 `TYPE_ORDER`로 고정 순서 정렬·중복 제거 후 태그 노출.

### 캐싱
- Function 인스턴스 메모리 캐시 10분 (`CACHE_TTL`)
- `type=refresh` 호출 시 `cache=null`로 강제 초기화
- Netlify Function 인스턴스별 독립 캐시 (인스턴스가 다르면 캐시 미공유)

---

## App.jsx — 프론트엔드

### 데이터 가공
- `epics`: summary에서 카테고리 추출(`getCategoryFromSummary`) + 표시명 정제(`getEpicDisplayName`은 `[Page]` 및 모든 `[...]` 태그 제거)
- `tasks`: **`customfield_10054`에 `PNB-UPGRADE` 포함 시 제외**, 부모(`parent.key`)를 `epicKey`로 매핑
- `subtaskMap`: 하위 작업을 부모 작업 키 기준으로 그룹핑

### 헤더 레이아웃 (2026-06-30 개편)
- 상단 제목 줄: 좌측 `PNB-628`·제목, **우측 맨 끝에 상태 표시(⟳ 불러오는 중 / ✓ 실시간·캐시 시각 / 에러) + 새로고침 버튼** 묶음. (기존엔 진행률 아래에 있던 것을 우측 상단으로 이동)
- 진행률 행: **좌측에 완료율 % 크게(42px) 강조 + 우측 진행바 + 그 아래 요약 한 줄.** 요약 = `290 / 357 완료 · 에픽 28개 · 작업 58개 · 하위작업 299개 · 작업+하위 기준`. 하위작업 수는 `allItems.total - totalTasks`(유효 작업에 딸린 하위작업만).
- 진행률·카운트 기준: **작업 + 하위작업 티켓 전체**(`allItems`). 카드의 "전체 작업 티켓" 숫자(`totalTasks`)는 작업 티켓만 세므로 값이 다름 — 그래서 헤더에 기준을 명시함.

### 진행률 집계
- **전체 진행률(`allItems`)**: 작업 티켓 + 하위 작업 **전부**를 분모로, `isDone` 항목을 분자로 계산
- **에픽별 진행률(`getRate`)**: 해당 에픽의 작업 + 하위작업 기준 동일 계산
- **상단 카드 7종** (2026-06-30 세분화): 전체 작업 / 완료 / 작업 진행 중 / QA 대기 / QA 진행 중 / 배포 대기 / 할 일 — **작업 티켓만** 기준(하위작업 제외). 기존 "진행 중"을 `WIP_S`(기획·디자인·개발), `QAWAIT_S`(# QA 대기), `QAPROG_S`(# QA 진행 중) 3분할. `# 기획 진행 중`·`# 개발 대기`도 WIP에 편입(과거 어느 카드에도 안 잡히던 상태 — PNB-1078 `# 개발 대기` 누락 건 2026-06-30 수정). 카드 글씨 확대(숫자 28 · 라벨 13 · 보조 11 #64748b). ⚠️ 카드는 작업 티켓만 세므로 QA 하위작업은 카드에 반영되지 않음 — QA 카드 숫자는 "QA 단계 작업 티켓 수"이지 QA 작업량 전체가 아님. 새 상태값이 Jira에 생기면 어느 Set에도 없을 경우 조용히 누락되므로 상태 추가 시 Set 점검 필요.

### 상태값 분류 (작업·하위 공통, App.jsx 상단 Set)
| 구분 | 판정 함수 | 포함 상태값 |
|---|---|---|
| 완료 `isDone` | `DONE_S` | 최종 완료, # 최종 완료, 작업 완료, 기획 완료, 디자인 작업 완료, 이슈 아님, # 이슈 아님 |
| 진행 중 `isInProg` | `INPROG_S` | # QA 진행 중, # 개발 진행 중, # 디자인 진행 중, # QA 대기, # 디자인 대기, 진행 중, 디자인 작업 진행 중, 디자인 분석 |
| 배포 대기 `isDeploy` | `DEPLOY_S` | # 배포 대기 |
| 할 일 `isTodo` | `TODO_S` | 할 일, # 할 일, 이슈 오픈, Backlog, BACKLOG, 백로그 |

> 색상은 별도 `ST_MAP`에서 관리. `ss()`가 표시 시 선행 `# `를 제거한다.

### 날짜 표시 (`dateDisplay`)
```
완료 상태(isDone) → resolutiondate → "✓ 날짜" 초록
그 외             → duedate (빨강) / 없으면 "—"
```

### 카테고리 필터 + 검색
- 상단 탭: `전체` + 에픽에서 추출한 카테고리들, 탭 클릭 시 해당 카테고리 작업만 집계
- 검색(`query`): 작업·하위의 **티켓명·담당자·티켓키** 부분일치. 매칭되는 작업이 하나라도 있으면 그 에픽을 노출
- **상태 카드 클릭 필터** (2026-06-30): 카드를 누르면 해당 상태의 작업 티켓만 목록에 표시(하위작업은 부모 작업 따라 함께 노출). 카테고리·검색과 AND로 조합. 같은 카드 재클릭 시 해제, "전체 작업" 카드 = 상태 필터 해제. 카드 숫자 자체는 전체 개요로 고정(필터와 무관), 활성 카드는 테두리 강조. `statusFilter` state + `STATUS_PRED`(라벨→판정함수) + `statusPass()`로 구현.
- 모든 티켓 링크는 `https://ajnetworks.atlassian.net/browse/<KEY>`로 연결

### URL 파라미터 (필터 상태 공유 링크, 2026-07-01)
현재 카테고리·상태·검색 필터 상태가 URL 쿼리에 자동 반영되고(`history.replaceState`, 히스토리 미오염), 그 URL을 열면 해당 상태로 복원된다. 필터 공유·북마크용.

| 파라미터 | 값 | 예시 |
|---|---|---|
| `cat` | 카테고리명(한글 원문) | `?cat=상품 관리` |
| `status` | 상태 카드 **영문 코드**(아래 표) | `?status=qa-progress` |
| `q` | 검색어(원문) | `?q=김아라` |

**status 코드 매핑** (`STATUS_CODE` / `CODE_STATUS`):

| 카드 | 코드 |
|---|---|
| 완료 | `done` |
| 작업 진행 중 (WIP=Work In Progress) | `wip` |
| QA 대기 | `qa-wait` |
| QA 진행 중 | `qa-progress` |
| 배포 대기 | `deploy` |
| 할 일 | `todo` |

- 조합 가능: `?cat=상품 관리&status=done&q=...` (세 필터 AND).
- 기본값(전체/필터없음)인 파라미터는 URL에서 생략됨. 유효하지 않은 `status` 코드는 무시하고 전체로 엶.
- 상태 카드를 추가/변경하면 `STATUS_CODE` 한 곳만 갱신하면 URL 코드까지 자동 반영됨.

---

## 알려진 함정 / 주의사항

- **`PNB-UPGRADE` 제외 범위 (2026-06-30 확장됨).** 이제 **에픽 또는 작업**에 라벨이 달리면 해당 티켓과 그 하위 전체가 제외된다. `App.jsx`가 라벨 달린 에픽 키를 `excludedEpicKeys`로 모은 뒤 ① 라벨 달린 에픽 제외, ② 라벨 달렸거나 부모 에픽이 제외 대상인 작업 제외 — 하위작업은 부모 작업과 함께 렌더·집계에서 자동으로 빠진다(하위작업 자체에는 라벨 검사 없음). 단, **문자열 정확 일치**(`PNB-UPGRADE`)이며 필드 ID `customfield_10054`가 바뀌면 조용히 무력화된다.
- **상태 셋에 없는 상태값은 어느 카드에도 안 잡힌다.** 챕터 대시보드와 달리 스쿼드에는 별도 `보류`/이슈 아님 버킷이 없고, `이슈 아님`은 `DONE_S`(완료)로 분류된다. `보류`·`# 보류` 등 4개 셋(DONE/INPROG/DEPLOY/TODO) 어디에도 없는 상태가 들어오면 카드 합계가 전체 작업 수와 어긋난다.
- **상태값 추가 시 두 곳 수정 필요:** `DONE_S`/`INPROG_S`/`DEPLOY_S`/`TODO_S` Set과 색상용 `ST_MAP` 모두.
- **빌드 누락 = 반영 안 됨.** `npm run build` 없이 `netlify deploy --prod`만 하면 `src/App.jsx` 수정이 `dist/` 번들에 반영되지 않는다.
- **배포 도메인 확인 필요.** 본 문서·프로젝트 개요는 `crm-admin-dashboard.netlify.app`, 챕터 문서는 `aj-crm-dashboard.netlify.app/chapter/`를 가리킨다. 실제 운영 도메인이 하나인지(별칭/리브랜딩) siteId `51065dd1-bf74-4dbb-b5bb-a57dfda04269` 기준으로 한번 확인 권장.
- **`duedate` 필드 전환.** 과거 PNB due date로 쓰던 `customfield_10501`은 더 이상 사용 안 함 — 모두 표준 `duedate`.

## 향후 개선 고려사항

- [x] `PNB-UPGRADE` 제외를 에픽까지 확대 (2026-06-30 완료, 하위작업은 부모 따라 자동 제외)
- [ ] 상태 분류 셋에 `보류`/`작업 중지` 등 누락 상태 보강 (집계 누수 방지)
- [ ] 상단 카드와 전체 진행률의 분모 기준(작업만 vs 작업+하위) 표기 일관성 점검
- [ ] 카테고리 추가 시 `getCategoryFromSummary` + `CAT_C` 색상맵 동시 갱신
- [ ] 하위 작업 타입 추가 시 `TYPE_ORDER` + `TYPE_C` 동시 갱신
