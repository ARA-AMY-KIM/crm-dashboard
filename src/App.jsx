import { useState, useEffect } from "react";

const JIRA = "https://ajnetworks.atlassian.net/browse";

// ── 카테고리 매핑 (에픽 summary 기반) ───────────────────────
const getCategoryFromSummary = (summary) => {
  if (summary.includes("[공통]")) return "공통";
  if (summary.includes("[어드민 운영]")) return "어드민 운영";
  if (summary.includes("[업체 관리]")) return "업체 관리";
  if (summary.includes("[운영 관리]")) return "운영 관리";
  if (summary.includes("[시스템 관리]")) return "시스템 관리";
  return "기타";
};

const getEpicDisplayName = (summary) =>
  summary.replace(/\[Page\]\s?/g, "").replace(/\[.*?\]\s?/g, "").trim();

// ── 상태 판정 ────────────────────────────────────────────────
const DONE_S   = new Set(["최종 완료","# 최종 완료","작업 완료","기획 완료","디자인 작업 완료","이슈 아님","# 이슈 아님"]);
const INPROG_S = new Set(["# QA 진행 중","# 개발 진행 중","# 디자인 진행 중","# QA 대기","# 디자인 대기","진행 중","디자인 작업 진행 중","디자인 분석","디자인 작업 완료","기획 완료"]);
const DEPLOY_S = new Set(["# 배포 대기"]);
const TODO_S   = new Set(["할 일","# 할 일","이슈 오픈","Backlog","BACKLOG","백로그"]);

const isDone   = s => DONE_S.has(s);
const isInProg = s => INPROG_S.has(s);
const isDeploy = s => DEPLOY_S.has(s);
const isTodo   = s => TODO_S.has(s);

// ── 상태 스타일 ──────────────────────────────────────────────
const ST_MAP = {
  "최종 완료":{c:"#16a34a",bg:"#dcfce7"},"# 최종 완료":{c:"#16a34a",bg:"#dcfce7"},
  "작업 완료":{c:"#16a34a",bg:"#dcfce7"},"기획 완료":{c:"#16a34a",bg:"#dcfce7"},
  "디자인 작업 완료":{c:"#16a34a",bg:"#dcfce7"},
  "이슈 아님":{c:"#6b7280",bg:"#f3f4f6"},"# 이슈 아님":{c:"#6b7280",bg:"#f3f4f6"},
  "# 배포 대기":{c:"#d97706",bg:"#fef3c7"},
  "# QA 대기":{c:"#d97706",bg:"#fef3c7"},
  "# QA 진행 중":{c:"#2563eb",bg:"#dbeafe"},
  "# 개발 진행 중":{c:"#7c3aed",bg:"#ede9fe"},"진행 중":{c:"#7c3aed",bg:"#ede9fe"},
  "# 디자인 진행 중":{c:"#9333ea",bg:"#f3e8ff"},"디자인 작업 진행 중":{c:"#9333ea",bg:"#f3e8ff"},"디자인 분석":{c:"#9333ea",bg:"#f3e8ff"},
  "# 디자인 대기":{c:"#db2777",bg:"#fce7f3"},
  "할 일":{c:"#94a3b8",bg:"#f1f5f9"},"이슈 오픈":{c:"#dc2626",bg:"#fee2e2"},
};
const gs = s => ST_MAP[s] || {c:"#94a3b8",bg:"#f1f5f9"};
const ss = s => s.replace(/^# /,"");

// ── 카테고리/타입 색상 ────────────────────────────────────────
const CAT_C  = {"공통":"#0ea5e9","어드민 운영":"#8b5cf6","업체 관리":"#f59e0b","운영 관리":"#10b981","시스템 관리":"#ef4444","기타":"#94a3b8"};
const TYPE_C = {"Planning":"#0ea5e9","BE":"#f97316","FE":"#10b981","Design":"#a855f7","QA":"#3b82f6","bug(QA)":"#ef4444"};

const fmt = d => d ? d.slice(0,10) : "";

// ── 컴포넌트 ─────────────────────────────────────────────────
const JLink = ({k, children, fw}) => (
  <a href={`${JIRA}/${k}`} target="_blank" rel="noreferrer"
    style={{color:"inherit",textDecoration:"none",fontWeight:fw||"inherit"}}
    onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
    onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
    {children}
  </a>
);

const Badge = ({status}) => {
  const sc = gs(status);
  return <span style={{fontSize:"9px",fontWeight:600,color:sc.c,background:sc.bg,padding:"2px 7px",borderRadius:"8px",whiteSpace:"nowrap",flexShrink:0}}>{ss(status)}</span>;
};

const Tooltip = ({tips, color}) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{position:"absolute",top:"10px",right:"10px"}}
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      <div style={{width:"16px",height:"16px",borderRadius:"50%",background:color+"20",border:`1px solid ${color}40`,
        display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",fontSize:"10px",fontWeight:700,color}}>
        i
      </div>
      {show && (
        <div style={{position:"absolute",top:"20px",right:0,background:"#1e293b",borderRadius:"8px",padding:"10px 12px",
          zIndex:100,minWidth:"180px",boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>
          <div style={{fontSize:"9px",color:"#64748b",marginBottom:"5px",fontWeight:700}}>작업 티켓 상태</div>
          {tips.map(t=>(
            <div key={t} style={{fontSize:"10px",color:"#f1f5f9",padding:"2px 0",whiteSpace:"nowrap"}}>· {t}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── 메인 ─────────────────────────────────────────────────────
export default function App() {
  const [cat, setCat] = useState("전체");
  const [data, setData] = useState(null);       // { epics, tasks, subtasks }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/jira?type=all");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastUpdated(new Date().toLocaleString("ko-KR"));
    } catch(e) {
      setError("데이터 로드 실패: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── 데이터 가공 ────────────────────────────────────────────
  const epics = (data?.epics || []).map(i => ({
    key: i.key,
    name: getEpicDisplayName(i.fields.summary),
    category: getCategoryFromSummary(i.fields.summary),
    status: i.fields.status.name,
  }));

  const tasks = (data?.tasks || []).map(i => ({
    key: i.key,
    epicKey: i.fields.parent?.key || "",
    name: i.fields.summary.replace(/\[.*?\]\s?/g,"").trim(),
    status: i.fields.status.name,
    assignee: i.fields.assignee?.displayName || "미배정",
    created: fmt(i.fields.customfield_10056),
    resolutiondate: fmt(i.fields.resolutiondate),
    duedate: fmt(i.fields.customfield_10501 || i.fields.duedate),
  }));

  // 하위 작업을 부모 키 기준으로 그룹핑
  const subtaskMap = {};
  (data?.subtasks || []).forEach(i => {
    const pk = i.fields.parent?.key || "";
    if (!subtaskMap[pk]) subtaskMap[pk] = [];
    subtaskMap[pk].push({
      key: i.key,
      name: i.fields.summary,
      type: i.fields.issuetype?.name || "",
      status: i.fields.status.name,
      assignee: i.fields.assignee?.displayName || "미배정",
      created: fmt(i.fields.customfield_10056),
      resolutiondate: fmt(i.fields.resolutiondate),
      duedate: fmt(i.fields.customfield_10501 || i.fields.duedate),
    });
  });

  // ── 집계 ──────────────────────────────────────────────────
  const allItems = (() => {
    let total=0, done=0;
    tasks.forEach(t => {
      total++; if(isDone(t.status)) done++;
      (subtaskMap[t.key]||[]).forEach(s => { total++; if(isDone(s.status)) done++; });
    });
    return {total, done, pct: total===0?0:Math.round(done/total*100)};
  })();

  const totalTasks = tasks.length;
  const doneTasks  = tasks.filter(t=>isDone(t.status)).length;
  const inProg     = tasks.filter(t=>isInProg(t.status)).length;
  const deployWait = tasks.filter(t=>isDeploy(t.status)).length;
  const todoTasks  = tasks.filter(t=>isTodo(t.status)||t.status==="할 일").length;

  const getRate = (epicKey) => {
    const epicTasks = tasks.filter(t=>t.epicKey===epicKey);
    let total=0, done=0;
    epicTasks.forEach(t => {
      total++; if(isDone(t.status)) done++;
      (subtaskMap[t.key]||[]).forEach(s => { total++; if(isDone(s.status)) done++; });
    });
    return total===0?0:Math.round(done/total*100);
  };

  const categories = [...new Set(epics.map(e=>e.category))];
  const filteredEpics = cat==="전체" ? epics : epics.filter(e=>e.category===cat);

  // ── 날짜 표시 ─────────────────────────────────────────────
  const dateDisplay = (status, rd, dd) => {
    if (isDone(status)) return {label:"완료일", date: rd||""};
    return {label:"due", date: dd||""};
  };

  // ── 로딩 화면 ─────────────────────────────────────────────
  if (loading && !data) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f1f5f9",flexDirection:"column",gap:"12px"}}>
      <div style={{width:"40px",height:"40px",border:"3px solid #e2e8f0",borderTop:"3px solid #6366f1",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <p style={{color:"#64748b",fontSize:"14px"}}>Jira 데이터 불러오는 중...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── 에러 화면 ─────────────────────────────────────────────
  if (error && !data) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f1f5f9",flexDirection:"column",gap:"12px"}}>
      <p style={{color:"#ef4444",fontSize:"14px"}}>{error}</p>
      <button onClick={fetchAll} style={{padding:"8px 16px",background:"#6366f1",color:"#fff",border:"none",borderRadius:"8px",cursor:"pointer"}}>다시 시도</button>
    </div>
  );

  return (
    <div style={{fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif",background:"#f1f5f9",minHeight:"100vh",padding:"20px 16px"}}>

      {/* Header + 전체 진행률 */}
      <div style={{marginBottom:"16px",background:"#fff",borderRadius:"14px",padding:"16px 20px",border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <div style={{width:"5px",height:"26px",background:"linear-gradient(180deg,#6366f1,#8b5cf6)",borderRadius:"3px"}}/>
            <h1 style={{margin:0,fontSize:"19px",fontWeight:700,color:"#0f172a"}}>CRM Admin 구축 현황</h1>
            <JLink k="PNB-628"><span style={{fontSize:"11px",color:"#6366f1",background:"#eef2ff",padding:"2px 8px",borderRadius:"20px",fontWeight:600}}>PNB-628</span></JLink>
          </div>
          <div style={{textAlign:"right"}}>
            <span style={{fontSize:"28px",fontWeight:800,color:allItems.pct===100?"#16a34a":"#6366f1",lineHeight:1}}>{allItems.pct}%</span>
            <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"1px"}}>{allItems.done} / {allItems.total}</div>
          </div>
        </div>
        <div style={{height:"10px",background:"#f1f5f9",borderRadius:"6px",overflow:"hidden",marginBottom:"8px"}}>
          <div style={{height:"100%",width:`${allItems.pct}%`,background:"linear-gradient(90deg,#6366f1,#8b5cf6)",borderRadius:"6px"}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <p style={{margin:0,fontSize:"11px",color:"#94a3b8"}}>에픽 {epics.length}개 · 작업 티켓 {totalTasks}개 · 하위작업 포함 전체 {allItems.total}개 기준</p>
          {loading
            ? <span style={{fontSize:"10px",color:"#6366f1"}}>⟳ 불러오는 중...</span>
            : error
              ? <span style={{fontSize:"10px",color:"#ef4444"}}>{error}</span>
              : <span style={{fontSize:"10px",color:"#22c55e"}}>✓ 실시간 · {lastUpdated}</span>
          }
          <button onClick={fetchAll} disabled={loading} style={{fontSize:"10px",color:"#6366f1",background:"#eef2ff",border:"none",borderRadius:"6px",padding:"2px 8px",cursor:"pointer"}}>새로고침</button>
        </div>
      </div>

      {/* 상단 카드 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"10px",marginBottom:"16px"}}>
        {[
          {l:"전체 작업",v:totalTasks,c:"#6366f1",sub:"작업 티켓 기준",tip:["전체 작업 티켓"]},
          {l:"완료",v:doneTasks,c:"#16a34a",sub:"작업완료·최종완료·이슈아님",tip:["# 최종 완료","# 이슈 아님"]},
          {l:"진행 중",v:inProg,c:"#7c3aed",sub:"기획·디자인·개발·QA",tip:["# QA 진행 중","# 개발 진행 중","# 디자인 진행 중","# QA 대기","# 디자인 대기"]},
          {l:"배포 대기",v:deployWait,c:"#d97706",sub:"배포 대기",tip:["# 배포 대기"]},
          {l:"할 일",v:todoTasks,c:"#94a3b8",sub:"시작 전",tip:["할 일","Backlog"]},
        ].map(s=>(
          <div key={s.l} style={{background:"#fff",borderRadius:"10px",padding:"12px 14px",border:"1px solid #e2e8f0",borderTop:`3px solid ${s.c}`,position:"relative"}}>
            <Tooltip tips={s.tip} color={s.c}/>
            <div style={{fontSize:"22px",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:"11px",color:"#374151",marginTop:"4px",fontWeight:600}}>{s.l}</div>
            <div style={{fontSize:"9px",color:"#cbd5e1",marginTop:"2px"}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 카테고리 필터 */}
      <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"14px"}}>
        {["전체",...categories].map(c=>{
          const a=cat===c; const col=c==="전체"?"#6366f1":CAT_C[c]||"#6366f1";
          return <button key={c} onClick={()=>setCat(c)} style={{padding:"4px 13px",borderRadius:"20px",border:a?"none":"1px solid #e2e8f0",cursor:"pointer",fontSize:"12px",fontWeight:600,background:a?col:"#fff",color:a?"#fff":"#64748b",boxShadow:a?`0 2px 6px ${col}40`:"none"}}>{c}</button>;
        })}
      </div>

      {/* 에픽 목록 */}
      <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
        {filteredEpics.map(epic => {
          const epicTasks = tasks.filter(t=>t.epicKey===epic.key);
          const rate = getRate(epic.key);
          const cc = CAT_C[epic.category]||"#6366f1";

          return (
            <div key={epic.key} style={{background:"#fff",borderRadius:"12px",overflow:"hidden",border:"1px solid #e2e8f0",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>

              {/* 에픽 헤더 */}
              <div style={{display:"flex",alignItems:"center",padding:"12px 16px",gap:"10px",background:"#fafafa",borderBottom:epicTasks.length?"1px solid #f1f5f9":"none"}}>
                <div style={{width:"3px",height:"38px",background:cc,borderRadius:"2px",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"3px"}}>
                    <span style={{fontSize:"10px",color:cc,background:cc+"18",padding:"1px 7px",borderRadius:"8px",fontWeight:700}}>{epic.category}</span>
                    <JLink k={epic.key}><span style={{fontSize:"11px",color:"#94a3b8",fontFamily:"monospace"}}>{epic.key}</span></JLink>
                  </div>
                  <JLink k={epic.key} fw={700}><span style={{fontSize:"14px",color:"#1e293b"}}>{epic.name}</span></JLink>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"5px"}}>
                    <div style={{width:"100px",height:"3px",background:"#e2e8f0",borderRadius:"2px"}}>
                      <div style={{width:`${rate}%`,height:"100%",background:rate===100?"#16a34a":cc,borderRadius:"2px"}}/>
                    </div>
                    <span style={{fontSize:"10px",fontWeight:600,color:rate===100?"#16a34a":"#64748b"}}>{rate}%</span>
                    <span style={{fontSize:"10px",color:"#cbd5e1"}}>작업+하위 기준</span>
                  </div>
                </div>
              </div>

              {/* 작업 티켓 + 하위 작업 */}
              {epicTasks.map((task, ti) => {
                const subs = subtaskMap[task.key] || [];
                const td = dateDisplay(task.status, task.resolutiondate, task.duedate);

                return (
                  <div key={task.key} style={{borderBottom:ti<epicTasks.length-1?"1px solid #f8fafc":"none"}}>

                    {/* 작업 행 */}
                    <div style={{display:"flex",alignItems:"center",padding:"10px 14px 10px 16px",gap:"8px",background:"#f8faff",borderLeft:"3px solid #6366f120"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"6px",flex:1,minWidth:0,flexWrap:"wrap"}}>
                        <JLink k={task.key}><span style={{fontSize:"11px",color:"#6366f1",fontFamily:"monospace",flexShrink:0,fontWeight:600}}>{task.key}</span></JLink>
                        <JLink k={task.key} fw={600}>
                          <span style={{fontSize:"13px",color:"#1e293b",wordBreak:"break-word"}}>{task.name}</span>
                        </JLink>
                        {/* 하위 작업 컴포넌트 태그 — 중복 제거, 순서 고정 */}
                        {(() => {
                          const TYPE_ORDER = ["Planning","Design","BE","FE","QA","bug(QA)"];
                          const types = [...new Set((subtaskMap[task.key]||[]).map(s=>s.type))];
                          const sorted = TYPE_ORDER.filter(t=>types.includes(t));
                          return sorted.map(t => {
                            const tc = TYPE_C[t]||"#94a3b8";
                            return <span key={t} style={{fontSize:"9px",fontWeight:700,color:tc,background:tc+"15",padding:"1px 6px",borderRadius:"4px",flexShrink:0}}>{t}</span>;
                          });
                        })()}
                      </div>
                      <span style={{fontSize:"11px",color:"#64748b",flexShrink:0}}>{task.assignee}</span>
                      {td.date
                        ? <span style={{fontSize:"10px",color:td.label==="완료일"?"#16a34a":"#ef4444",flexShrink:0,fontFamily:"monospace"}}>{td.label==="완료일"?"✓ "+td.date:td.date}</span>
                        : <span style={{fontSize:"10px",color:"#e2e8f0",flexShrink:0}}>—</span>
                      }
                      <Badge status={task.status}/>
                    </div>

                    {/* 하위 작업 행 */}
                    {subs.length > 0 && (
                      <div style={{borderTop:"1px solid #f1f5f9"}}>
                        {subs.map((sub, si) => {
                          const sd = dateDisplay(sub.status, sub.resolutiondate, sub.duedate||"");
                          const tc = TYPE_C[sub.type]||"#94a3b8";
                          return (
                            <div key={sub.key} style={{display:"flex",alignItems:"center",padding:"6px 14px 6px 28px",gap:"7px",background:"#fff",borderTop:si>0?"1px solid #f8fafc":"none"}}>
                              <div style={{width:"16px",height:"1px",background:"#e2e8f0",flexShrink:0}}/>
                              <span style={{fontSize:"9px",fontWeight:700,color:tc,background:tc+"15",padding:"1px 5px",borderRadius:"4px",flexShrink:0}}>{sub.type}</span>
                              <JLink k={sub.key}><span style={{fontSize:"10px",color:"#94a3b8",fontFamily:"monospace",flexShrink:0}}>{sub.key}</span></JLink>
                              <JLink k={sub.key}>
                                <span style={{fontSize:"12px",color:"#475569",display:"block",wordBreak:"break-word"}}>{sub.name}</span>
                              </JLink>
                              <div style={{flex:1}}/>
                              <span style={{fontSize:"10px",color:"#94a3b8",flexShrink:0}}>{sub.assignee}</span>
                              {sd.date
                                ? <span style={{fontSize:"10px",color:sd.label==="완료일"?"#16a34a":"#ef4444",flexShrink:0,fontFamily:"monospace"}}>{sd.label==="완료일"?"✓ "+sd.date:sd.date}</span>
                                : <span style={{fontSize:"10px",color:"#e2e8f0",flexShrink:0}}>—</span>
                              }
                              <Badge status={sub.status}/>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p style={{marginTop:"14px",textAlign:"right",fontSize:"10px",color:"#cbd5e1"}}>CRM Admin 구축 현황 · 실시간 Jira 연동</p>
    </div>
  );
}