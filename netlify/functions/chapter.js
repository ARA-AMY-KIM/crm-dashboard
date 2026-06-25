// ── 캐시 (Function 인스턴스 내 메모리) ──────────────────────
let cache = null;
let cacheTime = null;
const CACHE_TTL = 10 * 60 * 1000; // 10분

// ── 담당자 필터 (Jira displayName 기준) ─────────────────────
const TARGET_ASSIGNEES = ["김아라", "이동희", "이성주", "장은주", "최세영"];

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

// ── 프로젝트 키 추출 (CRM-1234 → CRM) ───────────────────────
const projOf = (key) => (key ? key.split("-")[0].toUpperCase() : "");

// ── 공통 조회 필드 ───────────────────────────────────────────
const COMMON_FIELDS = [
  "summary",           // 티켓 제목
  "status",            // 상태
  "assignee",          // 담당자
  "resolutiondate",    // 처리완료일
  "duedate",           // 기본 due date (CON/CRM)
  "customfield_10056", // 생성일 커스텀 필드
  "created",           // 생성일 기본
  "statuscategorychangedate", // 상태 카테고리 변경일
  "updated",                  // 티켓 수정일
  "statuscategorychangedate", // 상태 카테고리 변경일
  "updated",                  // 티켓 수정일
  "parent",            // 상위 티켓 (plan 티켓에서 사용)
];

// ── 티켓 공통 가공 ───────────────────────────────────────────
const mapIssue = (issue, type = "task") => {
  const f = issue.fields;
  const proj = projOf(issue.key);
  const duedate = fmt(f.duedate);
  const created = fmt(f.customfield_10056 || f.created);
    const statuschanged = fmt(f.statuscategorychangedate);
    const updated = fmt(f.updated);
    const statusChanged = fmt(f.statuscategorychangedate);

  return {
    key: issue.key,
    proj,
    type,                                          // "task" | "plan"
    name: f.summary,
    assignee: f.assignee?.displayName || "미배정",
    isTargetAssignee: TARGET_ASSIGNEES.includes(f.assignee?.displayName || ""),
    status: f.status?.name || "",
    resolutiondate: fmt(f.resolutiondate),
    duedate,
    created,
    statusChanged,
    statuschanged,
    updated,
    parentKey: f.parent?.key || null,              // plan 티켓의 상위 작업 키
    linkedCrm: [],                                 // 작업 티켓에서만 사용
    plans: [],                                     // 작업 티켓에 연결될 plan 목록
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
    if (type === "chapter") {
      // 캐시 유효하면 바로 반환
      if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
        return {
          statusCode: 200,
          headers: resHeaders,
          body: JSON.stringify({ tickets: cache, cached: true, cachedAt: cacheTime }),
        };
      }

      const assigneeJql = TARGET_ASSIGNEES.map((a) => `"${a}"`).join(",");

      // ── STEP 1: 작업 티켓 조회 (담당자 5인) ─────────────────
      const taskJql = `
        project in (CRM, PNB, CON)
        AND issueType in (작업, Task, Story)
        AND assignee in (${assigneeJql})
        ORDER BY updated DESC
      `;
      const taskRaw = await fetchAll(taskJql, [...COMMON_FIELDS, "issuelinks"], headers, baseUrl);
      const taskMap = new Map(); // key → task 객체

      for (const issue of taskRaw) {
        const task = mapIssue(issue, "task");
        const f = issue.fields;

        // implements / is implemented by 관계의 CRM 티켓 키 추출
        task.linkedCrm = (f.issuelinks || [])
          .filter((l) => {
            const outward = (l.type?.outward || "").toLowerCase();
            const inward  = (l.type?.inward  || "").toLowerCase();
            return outward === "implements" || inward === "is implemented by";
          })
          .map((l) => {
            const linked = l.outwardIssue || l.inwardIssue;
            return linked?.key || null;
          })
          .filter((k) => k && projOf(k) === "CRM");

        taskMap.set(task.key, task);
      }

      // ── STEP 2: plan 티켓 조회 (담당자 5인) ─────────────────
      const planJql = `
        project in (CRM, PNB, CON)
        AND issueType = Planning
        AND assignee in (${assigneeJql})
        ORDER BY updated DESC
      `;
      const planRaw = await fetchAll(planJql, COMMON_FIELDS, headers, baseUrl);

      // plan 담당자가 5인인데 상위 작업 담당자가 5인 밖일 경우
      // 상위 작업 티켓도 조회 필요 → parentKey 수집
      const missingParentKeys = new Set();
      for (const issue of planRaw) {
        const parentKey = issue.fields.parent?.key;
        if (parentKey && !taskMap.has(parentKey)) {
          missingParentKeys.add(parentKey);
        }
      }

      // ── STEP 3: 누락된 상위 작업 티켓 조회 ─────────────────
      // (plan 담당자는 5인, 상위 작업 담당자는 5인 밖인 경우)
      if (missingParentKeys.size > 0) {
        const missingKeys = [...missingParentKeys].join(",");
        const missingJql = `issueKey in (${missingKeys})`;
        const missingRaw = await fetchAll(missingJql, [...COMMON_FIELDS, "issuelinks"], headers, baseUrl);
        for (const issue of missingRaw) {
          const task = mapIssue(issue, "task");
          task.isTargetAssignee = false; // 5인 밖 담당자 → 필터/카운트 제외 플래그
          const f = issue.fields;
          task.linkedCrm = (f.issuelinks || [])
            .filter((l) => {
              const outward = (l.type?.outward || "").toLowerCase();
              const inward  = (l.type?.inward  || "").toLowerCase();
              return outward === "implements" || inward === "is implemented by";
            })
            .map((l) => {
              const linked = l.outwardIssue || l.inwardIssue;
              return linked?.key || null;
            })
            .filter((k) => k && projOf(k) === "CRM");
          taskMap.set(task.key, task);
        }
      }

      // ── STEP 4: plan 티켓 → 상위 작업에 연결 ───────────────
      const orphanPlans = []; // 상위 작업이 없는 plan (예외 처리용)
      for (const issue of planRaw) {
        const plan = mapIssue(issue, "plan");
        const parentKey = plan.parentKey;
        if (parentKey && taskMap.has(parentKey)) {
          taskMap.get(parentKey).plans.push(plan);
        } else {
          orphanPlans.push(plan); // 상위 작업이 조회 안 된 경우 독립 노출
        }
      }

      // ── STEP 5: 연결된 CRM 티켓 키 수집 → 독립 ROW 제거 ────
      const linkedCrmKeys = new Set(
        [...taskMap.values()].flatMap((t) => t.linkedCrm)
      );

      // ── STEP 6: 최종 티켓 목록 구성 ────────────────────────
      // CRM 티켓이면서 PNB/CON에 연결된 경우 제거
      // 단, 연결된 CRM 티켓의 plan은 함께 제거
      const result = [...taskMap.values()].filter((t) => {
        if (t.proj === "CRM" && linkedCrmKeys.has(t.key)) return false;
        return true;
      });

      // orphanPlans는 별도 추가 (상위 작업 없는 plan)
      // → 실제로는 거의 없겠지만 안전하게 처리
      const finalTickets = [...result, ...orphanPlans];

      // ── 캐시 저장 ──────────────────────────────────────────
      cache = finalTickets;
      cacheTime = Date.now();

      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify({ tickets: finalTickets, cached: false, cachedAt: cacheTime }),
      };
    }

    return {
      statusCode: 400,
      headers: resHeaders,
      body: JSON.stringify({ error: "type=chapter 또는 type=refresh 필요" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: resHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
