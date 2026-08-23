"use client";
import { useEffect, useRef, useState } from "react";

const modes = [
  ["general","Alex"],["trading","Trading"],["landscaping","Landscaping"],
  ["business","Business"],["files","Files"]
];
const descriptions = {
  general:"المساعد الرئيسي",
  trading:"الأسواق، الخطط وإدارة المخاطر",
  landscaping:"التقارير، التسعير والمشاريع",
  business:"العملاء، الرسائل وتنظيم الأعمال",
  files:"تحليل الصور وPDF وWord والملفات"
};

export default function Home() {
  const [auth,setAuth]=useState(null), [password,setPassword]=useState(""), [loginError,setLoginError]=useState("");
  const [mode,setMode]=useState("general"), [convs,setConvs]=useState([]), [cid,setCid]=useState(null);
  const [messages,setMessages]=useState([]), [text,setText]=useState(""), [files,setFiles]=useState([]);
  const [loading,setLoading]=useState(false), [memoryOpen,setMemoryOpen]=useState(false), [memory,setMemory]=useState([]);
  const [memoryText,setMemoryText]=useState("");
  const fileRef=useRef(null);

  useEffect(()=>{ fetch("/api/auth/me").then(r=>r.json()).then(x=>{setAuth(x.authenticated); if(x.authenticated) loadConvs();}); },[]);

  async function login(e){e.preventDefault(); setLoginError("");
    const r=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
    const d=await r.json(); if(!r.ok){setLoginError(d.error||"خطأ");return;} setAuth(true); loadConvs();
  }
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});setAuth(false);setCid(null);setMessages([]);}
  async function loadConvs(){const r=await fetch("/api/conversations");if(!r.ok)return;const d=await r.json();setConvs(d.conversations||[]);}
  async function newConv(nextMode=mode){
    const r=await fetch("/api/conversations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:nextMode})});
    const d=await r.json(); setCid(d.conversation.id); setMessages([]); setMode(nextMode); await loadConvs();
  }
  async function openConv(id){
    const r=await fetch("/api/conversations/"+id); const d=await r.json();
    setCid(id); setMode(d.conversation.mode||"general"); setMessages(d.messages||[]);
  }
  async function selectMode(m){setMode(m); if(!cid) await newConv(m);}
  async function send(){
    if(loading||(!text.trim()&&!files.length))return;
    let active=cid;
    if(!active){
      const r=await fetch("/api/conversations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode})});
      const d=await r.json(); active=d.conversation.id; setCid(active);
    }
    const shown=[text.trim(),...files.map(f=>`[${f.name}]`)].filter(Boolean).join("\n");
    const previous=[...messages,{role:"user",content:shown}];
    setMessages(previous); const sendText=text; const sendFiles=[...files]; setText(""); setFiles([]); setLoading(true);
    const fd=new FormData();fd.append("conversationId",active);fd.append("mode",mode);fd.append("message",sendText);
    sendFiles.forEach(f=>fd.append("files",f));
    try{
      const r=await fetch("/api/chat",{method:"POST",body:fd});const d=await r.json();
      setMessages([...previous,{role:"assistant",content:d.reply||d.error||"حدث خطأ"}]); await loadConvs();
    }catch{setMessages([...previous,{role:"assistant",content:"تعذر الاتصال بالخادم."}]);}
    finally{setLoading(false);}
  }
  async function loadMemory(){const r=await fetch("/api/memory");const d=await r.json();setMemory(d.memory||[]);setMemoryOpen(true);}
  async function addMemory(){if(!memoryText.trim())return;await fetch("/api/memory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:memoryText})});setMemoryText("");loadMemory();}
  async function delMemory(id){await fetch("/api/memory",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});loadMemory();}

  if(auth===null) return <div className="loginWrap"><div className="loginCard"><div className="logo">Alex</div><p className="muted">جاري التحميل...</p></div></div>;
  if(!auth) return <div className="loginWrap"><form className="loginCard" onSubmit={login}><div className="logo">Alex</div><p className="muted">مساعدك الخاص</p><input className="field" type="password" placeholder="كلمة المرور" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary full">دخول</button>{loginError&&<div className="error">{loginError}</div>}</form></div>;

  return <div className="shell">
    <aside className="sidebar">
      <div className="brandRow"><div className="brand">Alex</div><button className="newBtn" onClick={()=>newConv()}>＋ جديد</button></div>
      <div className="modeGrid">{modes.map(([id,label])=><button key={id} className={"modeBtn "+(mode===id?"active":"")} onClick={()=>selectMode(id)}>{label}</button>)}</div>
      <div className="sectionTitle">المحادثات</div>
      <div className="convList">{convs.map(c=><button key={c.id} className={"conv "+(cid===c.id?"active":"")} onClick={()=>openConv(c.id)}>{c.title}</button>)}</div>
      <button className="logout" onClick={logout}>تسجيل الخروج</button>
    </aside>

    <main className="main">
      <div className="top"><div><h1>{modes.find(x=>x[0]===mode)?.[1]}</h1><p className="muted">{descriptions[mode]}</p></div><button className="memoryBtn" onClick={loadMemory}>الذاكرة</button></div>
      <div className="chat">
        {!messages.length&&<div className="msg assistant">مرحباً، أنا Alex. اكتب طلبك أو أرفق صورة / PDF / Word.</div>}
        {messages.map((m,i)=><div key={i} className={"msg "+m.role}>{m.content}</div>)}
        {loading&&<div className="msg assistant">يعمل...</div>}
      </div>
      <div className="composer">
        <textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="اكتب طلبك هنا..."/>
        <div className="composerBottom">
          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
            <label className="attach">📎 ملف<input ref={fileRef} className="hidden" type="file" multiple accept="image/*,.pdf,.docx,.txt,.md,.csv,.json" onChange={e=>setFiles([...e.target.files])}/></label>
            <div className="files">{files.map(f=>f.name).join("، ")}</div>
          </div>
          <button className="send" onClick={send}>إرسال</button>
        </div>
      </div>
    </main>

    {memoryOpen&&<div className="modalBack" onClick={()=>setMemoryOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <h2>ذاكرة Alex</h2><p className="muted">أضف معلومات أو تعليمات تريد أن يستخدمها Alex في محادثاتك.</p>
      <textarea value={memoryText} onChange={e=>setMemoryText(e.target.value)} placeholder="مثال: أفضل الردود المختصرة بالعربية..."/>
      <div className="modalActions"><button className="primary" onClick={addMemory}>حفظ</button><button className="memoryBtn" onClick={()=>setMemoryOpen(false)}>إغلاق</button></div>
      <div className="memoryList">{memory.map(x=><div className="memoryItem" key={x.id}><span>{x.content}</span><button className="danger" onClick={()=>delMemory(x.id)}>حذف</button></div>)}</div>
    </div></div>}
  </div>
}
