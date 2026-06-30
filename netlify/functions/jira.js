// 메모리 캐시 (Function 인스턴스 내에서 유지)
let cache = null;
let cacheTime = null;
const CACHE_TTL = 10 * 60 * 1000; // 10분

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

exports.handler = async (event) => {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = "https://ajnetworks.atlassian.net/rest/api/3";
  const credentials = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
  const resHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const { type } = event.queryStringParameters || {};

  try {
    // 강제 새로고침
    if (type === "refresh") {
      cache = null;
      cacheTime = null;
      return { statusCode: 200, headers: resHeaders, body: JSON.stringify({ message: "캐시 초기화 완료" }) };
    }

    if (type === "all") {
      // 캐시 유효하면 바로 반환
      if (cache && cacheTime && (Date.now() - cacheTime) < CACHE_TTL) {
        return {
          statusCode: 200,
          headers: resHeaders,
          body: JSON.stringify({ ...cache, cached: true, cachedAt: cacheTime }),
        };
      }

      // 새 데이터 조회
      const epics = await fetchAll(
        "issueType=Epic AND parent=PNB-628 ORDER BY created ASC",
        ["summary", "status", "assignee", "customfield_10054"],
        headers, baseUrl
      );
      const epicKeys = epics.map(i => i.key);

      if (!epicKeys.length) {
        return { statusCode: 200, headers: resHeaders, body: JSON.stringify({ epics: [], tasks: [], subtasks: [], cached: false }) };
      }

      const tasks = await fetchAll(
        `issueType in (작업,Story,Task) AND parent in (${epicKeys.join(",")}) ORDER BY parent ASC`,
        ["summary", "status", "assignee", "parent", "resolutiondate", "duedate", "customfield_10056", "issuetype", "customfield_10054"],
        headers, baseUrl
      );
      const taskKeys = tasks.map(i => i.key);

      let subtasks = [];
      if (taskKeys.length) {
        subtasks = await fetchAll(
          `issueType in subTaskIssueTypes() AND parent in (${taskKeys.join(",")}) ORDER BY parent ASC`,
          ["summary", "status", "assignee", "parent", "issuetype", "resolutiondate", "customfield_10056", "duedate"],
          headers, baseUrl
        );
      }

      // 캐시 저장
      cache = { epics, tasks, subtasks };
      cacheTime = Date.now();

      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify({ ...cache, cached: false, cachedAt: cacheTime }),
      };
    }

    return { statusCode: 400, headers: resHeaders, body: JSON.stringify({ error: "type=all 필요" }) };
  } catch (err) {
    return { statusCode: 500, headers: resHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
