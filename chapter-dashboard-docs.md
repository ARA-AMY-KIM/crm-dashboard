# CRM 기획챕터 프로젝트 현황 대시보드

> 최초 배포: 2026년 6월  
> 최종 업데이트: 2026년 6월 10일  
> 담당: 김아라  
> 배포 URL: https://aj-crm-dashboard.netlify.app/chapter/

---

## 개요

Jira 티켓을 매월 컨플루언스에 수동 정리하던 작업을 자동화하기 위해 제작한 대시보드.  
기존 CRM Admin 대시보드(`/`)와 동일한 Netlify 프로젝트 내 하위 경로(`/chapter/`)로 배포하여 기존 대시보드에 영향 없이 독립 운영.

---

## 파일 구조

```
crm-dashboard/
├── public/
│   ├── favicon.svg            # 그리즐리 곰 파비콘 (공통)
│   └── chapter/
│       └── index.html         # 기획챕터 대시보드 프론트엔드 (단일 HTML, 소스 원본)
├── src/                       # 기존 CRM Admin 대시보드(/) — React
├── netlify/
│   └── functions/
│       ├── jira.js            # 기존 CRM Admin 대시보드용 API
│       └── chapter.js         # 기획챕터 대시보드용 API
├── dist/                      # 빌드 산출물 (npm run build 시 생성, 배포 대상)
│   └── chapter/index.html     # public/chapter/index.html이 복사된 결과
├── netlify.toml               # publish=dist, command=npm run build
└── package.json
```

> ⚠️ **소스 원본은 `public/chapter/index.html` 한 곳뿐이다.** `dist/chapter/index.html`은
> `npm run build`가 만들어내는 산출물이므로 직접 수정하지 말 것. dist를 손으로 고쳐도 다음 빌드 때 덮어써진다.

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 프론트엔드 | 단일 HTML 파일 (Vanilla JS, CSS) |
| 백엔드 | Netlify Functions (Node.js) |
| 데이터 소스 | Jira REST API v3 (`/search/jql`, 페이지네이션 포함) |
| 빌드 | Vite (`npm run build` → `dist/`) |
| 배포 | Netlify CLI (`npx netlify-cli deploy --prod`) |
| 인증 | 환경변수 `JIRA_EMAIL`, `JIRA_API_TOKEN` (기존과 공유) |

---

## 배포 방법 (2026-06-25 변경: GitHub 자동배포)

이제 **GitHub에 push하면 Netlify가 자동으로 빌드·배포**한다. PowerShell 수동 배포는 더 이상 쓰지 않는다.

워크플로우:
1. `public/chapter/index.html`(또는 `src/`, `chapter.js`) 등 소스 수정
2. **GitHub Desktop**에서 Commit → Push origin (브랜치 `main`)
3. 끝. Netlify가 자동으로 `npm run build` 실행 후 `dist/`를 배포한다.

> - 원격 저장소: `github.com/ARA-AMY-KIM/crm-dashboard` (비공개), 브랜치 `main`
> - Netlify 사이트 `aj-crm-dashboard`에 Git 연결(Continuous deployment)되어 있음. 빌드 설정은 `netlify.toml`(build `npm run build`, publish `dist`)을 따른다.
> - 환경변수(`JIRA_EMAIL`, `JIRA_API_TOKEN`)는 Netlify 사이트에 등록되어 있음.
> - ⚠️ 옛 방식(`npm run build` → `npx netlify-cli deploy --prod`)은 폐기. Git 자동배포와 섞어 쓰지 말 것.
> - ⚠️ 저장소 안에 다른 폴더를 git 저장소째로 넣지 말 것(중첩 .git → gitlink 서브모듈로 잘못 커밋되어 Netlify 빌드가 실패함).

---

## chapter.js — API 함수

### 엔드포인트
```
GET /.netlify/functions/chapter?type=chapter   # 데이터 조회
GET /.netlify/functions/chapter?type=refresh   # 캐시 초기화
```

### 대상 담당자
`TARGET_ASSIGNEES = ["김아라", "이동희", "이성주", "장은주", "최세영"]` (Jira displayName 기준)

### 조회 대상

**작업 티켓 JQL**
```
project in (CRM, PNB, CON)
AND issueType in (작업, Task, Story)
AND assignee in ("김아라", "이동희", "이성주", "장은주", "최세영")
ORDER BY updated DESC
```

**Planning 티켓 JQL**
```
project in (CRM, PNB, CON)
AND issueType = Planning
AND assignee in ("김아라", "이동희", "이성주", "장은주", "최세영")
ORDER BY updated DESC
```

> Planning 담당자가 5인이지만 상위 작업 담당자가 5인 밖인 경우, 해당 상위 작업 티켓도 `issueKey in (...)`로 추가 조회하여 함께 노출. 단 이 상위 작업은 `isTargetAssignee = false`로 표시되어 필터·카운트에서 제외된다.

### 조회 필드 (COMMON_FIELDS)
| Jira 필드 | 가공 결과 | 용도 |
|---|---|---|
| `summary` | `name` | 티켓 제목 |
| `status` | `status` | 상태명 |
| `assignee` | `assignee` | 담당자 displayName (없으면 "미배정") |
| `resolutiondate` | `resolutiondate` | 처리완료일 |
| `duedate` | `duedate` | 기한 (CRM·PNB·CON 공통) |
| `customfield_10056` | `created` (우선) | 생성일 커스텀 필드 |
| `created` | `created` (fallback) | customfield_10056 없을 때 기본 생성일 |
| `statuscategorychangedate` | `statuschanged` | 상태 카테고리 변경일 |
| `updated` | `updated` | 티켓 수정일 |
| `issuelinks` | `linkedCrm` | 연결된 CRM 티켓 (작업 티켓만 조회) |
| `parent` | `parentKey` | 상위 티켓 키 (Planning에서 사용) |

> ⚠️ 이전 문서에 있던 `customfield_10501`(PNB due date)은 **현재 코드에서 사용하지 않는다.** 모든 프로젝트가 표준 `duedate` 필드로 통일됨.  
> ⚠️ 현재 `COMMON_FIELDS` 배열에 `statuscategorychangedate`와 `updated`가 각각 2번씩 중복 기재되어 있음(동작에는 무해하나 정리 권장).  
> ※ 출력 객체에는 `statuschanged`(소문자)와 `statusChanged`(카멜)가 동일 값으로 둘 다 들어가며, 프론트엔드는 소문자 `statuschanged`를 사용한다.

### 캐싱
- Function 인스턴스 메모리 캐시 10분 (`CACHE_TTL`)
- `type=refresh` 호출 시 강제 초기화
- Netlify Function 인스턴스별 독립 캐시 (인스턴스가 다르면 캐시 미공유)

### 연결된 티켓 로직
```
issuelinks의 type.outward === "implements" 또는
type.inward === "is implemented by" 인 경우
→ 연결된 CRM 티켓 키 추출 (linkedCrm 배열)

PNB/CON 티켓에 연결된 CRM 티켓 → 독립 ROW 제거, '연결된 티켓' 열에만 표시
(CRM 티켓이면서 linkedCrmKeys에 포함되면 최종 목록에서 제외)
```

> ⚠️ Jira 워크스페이스의 관계 `type.name`은 `"Polaris work item link"`로,  
> `type.name` 기준 필터는 동작하지 않음. 반드시 `type.outward` / `type.inward` 텍스트 기준으로 판단.

---

## index.html — 프론트엔드

### 노출 조건 (월 필터) — `passFilter()`
작업 티켓과 하위 Planning 중 **하나라도** 아래 날짜가 선택한 월에 해당하면 **세트로 함께 표시**.

| 조건 | 필드 |
|---|---|
| ① 처리완료일 | `resolutiondate` |
| ② 기한 | `duedate` |
| ③ 생성일 | `created` (customfield_10056 우선) |
| ④ 상태 카테고리 변경일 | `statuschanged` (statuscategorychangedate) |
| ⑤ 티켓 수정일 | `updated` |

> ④ 상태 카테고리 변경일: 카테고리(할 일 / 진행 중 / 완료)가 **바뀐 날** 기준. 같은 카테고리 내 상태 변경(예: 기획 진행 중 → 디자인 대기)은 반영되지 않음.  
> ⑤ 수정일은 `inMonthUpdated()`를 거치며, **`2026-06-09`는 하드코딩으로 제외**된다. (기한 필드 일괄 교체로 그날 `updated`가 대량으로 튀어 6월에 모든 티켓이 노출되는 것을 막기 위한 임시 처리.) **향후 유사한 일괄 편집을 하면 같은 증상이 재발하므로, 그때 해당 날짜를 예외에 추가할지 검토 필요.**

### 기한/완료일 컬럼 표시 로직 — `dateDisplay()`
> 컬럼 헤더 라벨은 "기한/완료일" (이전 명칭 "배포일"). 평소엔 기한(duedate), 완료 시 처리완료일(resolutiondate)을 표시.
```
완료 상태 → resolutiondate (처리완료일)  →  "✓ 날짜" 초록 표시
그 외      → duedate
없음       → TBD (회색)
```
Planning도 동일: `기획 완료` + resolutiondate 있으면 ✓ 표시, 아니면 duedate, 둘 다 없으면 TBD.

### 상태값 분류 — 작업 티켓
| 구분 | 포함 상태값 | 색상 |
|---|---|---|
| 완료 | 최종 완료, # 최종 완료 | 초록 `#16a34a` |
| 진행 중 (기획 강조) | # 기획 진행 중, 기획 완료, 디자인 작업 완료 | 인디고 `#4f46e5` |
| 진행 중 | # 디자인 대기, # 개발 대기, # 개발 진행 중, # QA 대기, # QA 진행 중, # 디자인 진행 중, # 디자인 검토 대기, # 작업 진행 중, 진행 중 | 보라 `#7c3aed` |
| 배포 대기 | # 배포 대기, 배포 대기 | 노랑 `#d97706` |
| 할 일 | 할 일, # 할 일, 이슈 오픈, Backlog, BACKLOG, 백로그 | 회색 `#94a3b8` |
| 이슈 아님 | 이슈 아님, # 이슈 아님, 보류, # 보류 | 중간 회색 `#6b7280` |

> `기획 완료`·`디자인 작업 완료`는 카운트상 **진행 중**으로 집계되며 색상만 인디고로 강조된다.

### 상태값 분류 — Planning 하위 작업 (`planStGroup` / `planStDisplay`)
| 구분 | 포함 상태값 | 색상 |
|---|---|---|
| 기획 완료 | 기획 완료 | 초록 `#16a34a` |
| 진행 중 | 요구사항 분석, 기획 진행 중 등 **그 외 모든 상태** | 보라 `#7c3aed` |
| 할 일 | 할 일, # 할 일, 이슈 오픈, Backlog, BACKLOG, 백로그 | 회색 `#94a3b8` |
| 이슈 아님 | 이슈 아님, # 이슈 아님, 보류, # 보류, 작업 중지 | 중간 회색 `#6b7280` |

> 같은 `기획 완료` 상태라도 **작업 티켓에서는 인디고(진행 중)**, **Planning에서는 초록(기획 완료)**로 색이 다르게 표시된다.

### Planning 하위 작업 UI
- 작업 티켓 바로 아래 들여쓰기로 노출
- 구분 열: 파란 점(●) + `Plan` 텍스트
- 프로젝트명 앞: 꺾인 화살표 아이콘 (↳)
- 배경색: 연한 파랑 (`#fafbff`)

### 외부 담당자 작업 티켓 처리
Planning 담당자가 5인이지만 상위 작업 담당자가 5인 밖인 경우 (`isTargetAssignee = false`):
- 목록에는 노출 (컨텍스트 제공)
- 담당자 필터·카운트에는 미포함
- 검색은 가능 (담당자명, 티켓명, 티켓키)
- 필터/검색으로 특정인 조회 시 해당 없는 상위 티켓은 흐리게(opacity 0.45) 표시

### 정렬
- 기한/완료일 · 업데이트일 헤더 클릭으로 정렬
- 클릭 순서: ↓ 최신순 → ↑ 오래된순 → ↕ 정렬 없음 (초기화)
- 기본값: 정렬 없음 (Jira API 응답 순서)

### 즐겨찾기
- 행 오른쪽 끝 별 아이콘으로 등록/해제
- 작업 티켓·Planning 모두 즐겨찾기 가능
- 브라우저 로컬스토리지(`chapter_favs`)에 티켓 키 기준 저장
- 브라우저 캐시 삭제 또는 다른 브라우저/기기에서는 보이지 않음
- 월이 달라도 즐겨찾기 상태 유지
- 테이블 헤더 별 버튼('내 즐겨찾기')으로 필터링 가능

### Plan 포함 토글
- 테이블 헤더 바에 토글 스위치 (`Plan 티켓 같이 보기`)
- 켜짐(기본): 작업 티켓 + Planning 함께 표시
- 꺼짐: 작업 티켓만 표시

### URL 파라미터 — `applyUrlParams()`
담당자 또는 월 고정 링크 생성 가능. `who`는 5인 명단에 포함된 값만 적용된다.

```
/chapter/?who=김아라
/chapter/?month=2026-07
/chapter/?who=김아라&month=2026-07
```

---

## 알려진 함정 / 주의사항

- **닫는 태그 누락 = 본문 전체 비노출.** index.html은 단일 정적 HTML이라 빌드 단계의 JSX 검증이 없다. 2026-06-10, 안내 모달의 `info-section` 닫는 `</div>` 하나가 빠져 `info-modal-overlay`(`display:none`)가 끝까지 닫히지 않았고, 그 뒤 본문 전체가 숨겨진 오버레이 안에 갇혀 화면이 비어 보이는 버그가 있었다(수정 완료). 모달/오버레이 마크업 편집 시 div 짝이 맞는지 반드시 확인할 것.
- **`2026-06-09` 하드코딩 제외**(inMonthUpdated). 위 월 필터 ⑤ 참고. 매직 넘버이므로 일괄 편집 시 디버깅 지뢰가 될 수 있음.
- **`COMMON_FIELDS` 중복 항목** (chapter.js). `statuscategorychangedate`, `updated`가 2회씩 들어가 있음 — 정리 권장.

## 향후 개선 고려사항

- [ ] 담당자 추가/변경 시 `chapter.js`의 `TARGET_ASSIGNEES` 배열, `index.html`의 필터 칩, `applyUrlParams`의 허용 명단 **세 곳 모두** 수정 필요
- [ ] 작업 티켓 상태값 추가 시 `index.html`의 `DONE_S` / `INPROG_S` / `DEPLOY_S` / `TODO_S` / `NOISSUE_S` Set과 `ST_MAP` **두 곳 모두** 수정 필요
- [ ] Planning 상태값 추가 시 `PLAN_NOISSUE` / `PLAN_TODO` / `PLAN_DONE` Set 수정 필요
- [ ] 월 필터 조건 변경 시 `passFilter`(index.html)와 앱 내 안내 모달 텍스트, 그리고 본 문서까지 동기화
- [ ] CON 프로젝트 issueType 검증 (현재 작업/Task/Story 기준)
- [ ] 월별 데이터 아카이빙 기능 (현재는 실시간 조회만 가능)
- [ ] Netlify KV 또는 외부 DB 연동 시 팀 공유 즐겨찾기/메모 기능 확장 가능
