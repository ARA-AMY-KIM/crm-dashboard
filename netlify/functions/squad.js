// ── 스쿼드 대시보드 API ───────────────────────────────────────
// 담당자 기준 전체 조회 (PNB 프로젝트, 하위작업 포함)
// 엔드포인트: /.netlify/functions/squad?type=squad | ?type=refresh

// ── 캐시 (Function 인스턴스 내 메모리) ──────────────────────
let cache = null;
let cacheTime = null;
const CACHE_TTL = 10 * 60 * 1000; // 10분

// ── 대상 담당자 (Jira displayName 기준) ─────────────────────
const TARGET_ASSIGNEES = ["김아라", "최세영", "김종구", "유가람", "최은희"];

// ── 페이지네이션 포함 전체 조회 ──────────────────────────────
const fetchAll = async (jql, fields, headers, baseUrl) => {
  let all = [];
  let nextPageToken = undefined;
  while (true) {
    const body = { jql, maxResults: 100, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetch(`${baseUrl}/search/jql`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const issues = data.issues || [];
    all = all.concat(issues);
    if (data.isLast || !data.nextPageToken || issues.length === 0) break;
    nextPageToken = data.nextPageToken;
  }
  return all;
};

// ── 날짜 포맷 ────────────────────────────────────────────────
const fmt = (d) => (d ? d.slice(0, 10) : "");

// ── 프로젝트 키 추출 (PNB-1234 → PNB) ───────────────────────
const projOf = (key) => (key ? key.split("-")[0].toUpperCase() : "");

// ── 조회 필드 ────────────────────────────────────────────────
const FIELDS = [
  "summary",                  // 티켓 제목
  "status",                   // 상태(+statusCategory 포함)
  "assignee",                 // 담당자
  "resolutiondate",           // 처리완료일
  "duedate",                  // 기한
  "customfield_10056",        // 생성일 커스텀 필드
  "created",                  // 생성일 기본
  "statuscategorychangedate", // 상태 카테고리 변경일
  "updated",                  // 티켓 수정일
  "issuetype",                // 유형(+hierarchyLevel, subtask)
  "parent",                   // 상위 티켓(key + summary)
  "customfield_10020",        // 스프린트(배열)
];

// ── 티켓 가공 ────────────────────────────────────────────────
const mapIssue = (issue) => {
  const f = issue.fields;
  // 스프린트: active 우선, 없으면 배열 마지막(가장 최근)
  const sprintArr = Array.isArray(f.customfield_10020) ? f.customfield_10020 : [];
  const sprints = sprintArr.map((s) => ({ name: s.name || "", state: s.state || "" }));
  // 대표 스프린트: active 우선, 없으면 마지막(가장 최근)
  const chosen = sprints.find((s) => s.state === "active") || sprints[sprints.length - 1] || null;
  const sprint = chosen?.name || null;
  const sprintState = chosen?.state || null;
  return {
    key: issue.key,
    proj: projOf(issue.key),
    name: f.summary || "",
    assignee: f.assignee?.displayName || "미배정",
    status: f.status?.name || "",
    // Jira statusCategory: "완료" | "진행 중" | "해야 할 일" — 신규 상태 자동 분류 fallback
    statusCategory: f.status?.statusCategory?.name || "",
    issueType: f.issuetype?.name || "",
    hierarchyLevel: f.issuetype?.hierarchyLevel ?? 0,
    isSubtask: !!f.issuetype?.subtask,
    resolutiondate: fmt(f.resolutiondate),
    duedate: fmt(f.duedate),
    created: fmt(f.customfield_10056 || f.created),
    updated: fmt(f.updated),
    statuschanged: fmt(f.statuscategorychangedate),
    parentKey: f.parent?.key || null,
    parentName: f.parent?.fields?.summary || null,
    sprint,
    sprintState,
    sprints,
  };
};

exports.handler = async (event) => {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = "https://ajnetworks.atlassian.net/rest/api/3";
  const credentials = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
  const resHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const { type } = event.queryStringParameters || {};

  try {
    // ── 강제 새로고침 ────────────────────────────────────────
    if (type === "refresh") {
      cache = null;
      cacheTime = null;
      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify({ message: "캐시 초기화 완료" }),
      };
    }

    // ── 데이터 조회 ──────────────────────────────────────────
    if (type === "squad") {
      if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
        return {
          statusCode: 200,
          headers: resHeaders,
          body: JSON.stringify({ tickets: cache, cached: true, cachedAt: cacheTime }),
        };
      }

      const assigneeJql = TARGET_ASSIGNEES.map((a) => `"${a}"`).join(",");
      const jql = `
        project = PNB
        AND assignee in (${assigneeJql})
        ORDER BY updated DESC
      `;
      const raw = await fetchAll(jql, FIELDS, headers, baseUrl);

      // 계층레벨 > 0(에픽·이니셔티브 등 컨테이너)은 제외.
      // 0(작업/Story/Task/버그) 및 -1(하위작업 BE/FE/QA/Planning)만 유지.
      const tickets = raw
        .map(mapIssue)
        .filter((t) => t.hierarchyLevel <= 0);

      cache = tickets;
      cacheTime = Date.now();

      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify({ tickets, cached: false, cachedAt: cacheTime }),
      };
    }

    return {
      statusCode: 400,
      headers: resHeaders,
      body: JSON.stringify({ error: "type=squad 또는 type=refresh 필요" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: resHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
