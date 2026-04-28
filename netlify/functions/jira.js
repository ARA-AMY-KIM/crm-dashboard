exports.handler = async (event) => {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = "https://ajnetworks.atlassian.net/rest/api/3";

  const credentials = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  // nextPageToken 기반 페이지네이션으로 전체 결과 가져오기
  const fetchAll = async (jql, fields) => {
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

  const { type } = event.queryStringParameters || {};

  try {
    if (type === "all") {
      // 1. 에픽 조회
      const epics = await fetchAll(
        "issueType=Epic AND parent=PNB-628 ORDER BY created ASC",
        ["summary", "status", "assignee"]
      );
      const epicKeys = epics.map(i => i.key);

      if (!epicKeys.length) {
        return {
          statusCode: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ epics: [], tasks: [], subtasks: [] }),
        };
      }

      // 2. 작업 티켓 조회
      const tasks = await fetchAll(
        `issueType in (작업,Story,Task) AND parent in (${epicKeys.join(",")}) ORDER BY parent ASC`,
        ["summary", "status", "assignee", "parent", "resolutiondate", "duedate", "customfield_10056", "customfield_10501", "issuetype"]
      );
      const taskKeys = tasks.map(i => i.key);

      // 3. 하위 작업 조회
      let subtasks = [];
      if (taskKeys.length) {
        subtasks = await fetchAll(
          `issueType in subTaskIssueTypes() AND parent in (${taskKeys.join(",")}) ORDER BY parent ASC`,
          ["summary", "status", "assignee", "parent", "issuetype", "resolutiondate", "customfield_10056", "customfield_10501"]
        );
      }

      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ epics, tasks, subtasks }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: "type=all 파라미터가 필요합니다" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
