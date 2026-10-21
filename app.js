const $=s=>document.querySelector(s),app=$("#app");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const FONT='"Noto Sans Bengali","Kalpurush","Nirmala UI",system-ui,sans-serif',CFONT='"SutonnyMJ","SutonnyOMJ",sans-serif';
const DAYS=7,DAY=864e5,LANG={bu:"Bangla (Bijoy Unicode)",bc:"Bangla (Bijoy Classic)",en:"English"};
let db=null,downloads=null,isAdmin=false,authed=false,timer=null,cleanup=null;
const words=t=>t.trim().split(/\s+/).filter(Boolean);
const cls=l=>l==="bc"?"bc":l==="en"?"":"bn";
const fnt=l=>l==="bc"?CFONT:FONT;
const err=m=>{const e=$("#err");if(e)e.textContent=m};
const keyOf=(c,r)=>c+"_"+[...r.trim().toLowerCase()].map(ch=>/[a-z0-9]/.test(ch)?ch:"-"+ch.codePointAt(0).toString(16)).join("");

/* scoring: ordered, case-sensitive exact word match (LCS); only reference words count */
function grade(ref,typ){
  const a=words(ref),b=words(typ);let p=new Uint16Array(b.length+1),c=new Uint16Array(b.length+1);
  for(let i=1;i<=a.length;i++){for(let j=1;j<=b.length;j++)c[j]=a[i-1]===b[j-1]?p[j-1]+1:Math.max(p[j],c[j-1]);[p,c]=[c,p]}
  return{total:a.length,typed:b.length,correct:p[b.length]};
}
const marksOf=(g,full)=>g.total?Math.round(g.correct/g.total*full*100)/100:0;
function lev(s,t){s=[...s];t=[...t];let p=Array.from({length:t.length+1},(_,i)=>i);for(let i=1;i<=s.length;i++){const c=[i];for(let j=1;j<=t.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(s[i-1]===t[j-1]?0:1));p=c}return p[t.length]}
function near(w,a){const n=[...w].length,t=Math.max(1,Math.floor(n/3));for(const x of a)if(Math.abs([...x].length-n)<=t&&lev(w,x)<=t)return true;return false}
/* colour each typed word: ok = correct, bad = wrong word (spelling/case/misplaced), unk = not in the paragraph */
function mark(ref,typ){
  const a=words(ref),b=words(typ),n=a.length,m=b.length,W=m+1,d=new Uint16Array((n+1)*W);
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)d[i*W+j]=a[i-1]===b[j-1]?d[(i-1)*W+j-1]+1:Math.max(d[(i-1)*W+j],d[i*W+j-1]);
  const ok=new Array(m).fill(false);let i=n,j=m;
  while(i>0&&j>0){if(a[i-1]===b[j-1]){ok[j-1]=true;i--;j--}else if(d[(i-1)*W+j]>=d[i*W+j-1])i--;else j--}
  const set=new Set(a),low=new Set(a.map(x=>x.toLowerCase()));
  return b.map((w,k)=>({w,c:ok[k]?"ok":(set.has(w)||low.has(w.toLowerCase())||near(w,a))?"bad":"unk"}));
}
const show=t=>t.length?t.map(x=>x.c==="ok"?esc(x.w):`<span class="w-${x.c}">${esc(x.w)}</span>`).join(" "):"—";
const LEG=`<p class="mu"><b>Black</b> = correct · <b class="w-bad">Red</b> = wrong word · <b class="w-unk">Blue</b> = unknown word (not in the paragraph)</p>`;

async function saveFile(name,blob){try{if(downloads){await downloads.save({filename:name,data:blob});return true}}catch(e){if(e&&e.code==="declined")return true}return false}

/* ---------- home ---------- */
function home(){
  clearInterval(timer);authed=false;
  app.innerHTML=`<h1>Welcome, candidate</h1><p class="mu">Bangla &amp; English typing tests. Use the exam code given by your examiner.</p>
  <div class="card"><h2>Candidate</h2><p class="mu">Enter the exam code you received and your roll number.</p>
  <div class="row"><div><label>Exam code</label><input id="code" autocapitalize="characters" autocomplete="off"></div>
  <div><label>Roll number</label><input id="roll" autocomplete="off"></div></div>
  <p><button id="go">Start exam</button></p><div id="err" class="err"></div></div>
  <div class="card"><div class="bar"><span class="mu">Exam organiser?</span><button class="g" id="adm">Admin login</button></div></div>`;
  $("#go").onclick=start;$("#adm").onclick=admin;
}

/* ---------- admin login ---------- */
async function admin(){
  const back=`<p><button class="g" id="b">← Back</button></p>`;
  if(!db){app.innerHTML=back+`<div class="card"><h2>Not connected</h2><p>The database is not set up yet. Please follow README.md.</p></div>`;$("#b").onclick=home;return}
  if(authed)return panel();
  app.innerHTML=back+`<div class="card"><h2>Admin login</h2>
  <label>Admin name</label><input id="an" autocomplete="username"><label>Password</label><input id="ap" type="password" autocomplete="current-password">
  <p><button id="ok">Log in</button></p><div id="err" class="err"></div></div>`;
  $("#b").onclick=home;
  $("#ok").onclick=async()=>{
    const n=$("#an").value.trim(),p=$("#ap").value;
    if(!n||!p)return err("Enter name and password.");
    try{await BACKEND.login(n,p);authed=true;panel()}catch(e){err("Wrong name or password.")}
  };
}

/* ---------- admin panel ---------- */
async function panel(){
  app.innerHTML=`<div class="bar"><h1>Admin</h1><button class="g" id="b">Log out</button></div>
  <div class="card"><h2>Create exam</h2>
  <div class="row"><div><label>Exam name</label><input id="nm" placeholder="Demo"></div>
  <div><label>Language</label><select id="lg"><option value="bu">${LANG.bu}</option><option value="bc">${LANG.bc}</option><option value="en">${LANG.en}</option></select></div></div>
  <div class="row"><div><label>Time (minutes)</label><input id="mn" type="number" min="1" value="10" list="mns"><datalist id="mns"><option>5<option>10<option>20<option>25<option>30</datalist></div>
  <div><label>Full marks</label><input id="fm" type="number" min="1" value="25" list="fms"><datalist id="fms"><option>25<option>50<option>100</datalist></div></div>
  <label>Reference paragraph (type, paste or copy freely)</label><textarea id="tx"></textarea><div class="mu" id="wc">0 words</div>
  <p class="mu" id="hint"></p>
  <p><button id="mk">Generate exam &amp; code</button></p><div id="err" class="err"></div><div id="new"></div></div>
  <div class="card"><h2>Your exams</h2><p class="mu">Tap an exam name to see everyone who attended it and download the PDF.</p><div id="list" class="mu">Loading…</div></div><div id="res"></div>`;
  $("#b").onclick=home;
  const hint=()=>{const l=$("#lg").value,t=$("#tx");t.className=cls(l);
    $("#hint").textContent=l==="bc"?"Bijoy Classic needs the SutonnyMJ font installed on this computer and on every candidate’s device.":l==="bu"?"Type with your Bijoy Unicode keyboard, or paste Unicode Bangla.":""};
  $("#lg").onchange=hint;hint();
  $("#tx").oninput=e=>$("#wc").textContent=words(e.target.value).length+" words";
  $("#mk").onclick=create;
  await purgeOld();list();
}
async function create(){
  const name=$("#nm").value.trim(),text=$("#tx").value.trim(),mins=+$("#mn").value,full=+$("#fm").value,lang=$("#lg").value;
  if(!name||!text||!(mins>0)||!(full>0))return err("Fill in the name, time, full marks and reference paragraph.");
  const A="ABCDEFGHJKMNPQRSTUVWXYZ23456789";let code="";for(let i=0;i<6;i++)code+=A[Math.floor(Math.random()*A.length)];
  try{await db.doc("exams/"+code).set({name,lang,text,mins,full,at:Date.now()})}catch(e){return err("Could not save: "+(e.message||e.code))}
  err("");$("#new").innerHTML=`<p class="ok">Exam generated. Share this page’s link and the code <code>${code}</code> with candidates.</p>`;list();
}
async function purge(code){
  const s=await db.collection("results").where("code","==",code).get();
  for(const d of s.docs){await db.doc("locks/"+d.id).delete().catch(()=>{});await db.doc("results/"+d.id).delete().catch(()=>{})}
  await db.doc("exams/"+code).delete();
}
async function purgeOld(){try{const s=await db.collection("exams").get();for(const d of s.docs)if(Date.now()>d.data().at+DAYS*DAY)await purge(d.id)}catch(e){}}
async function list(){
  try{const s=await db.collection("exams").orderBy("at","desc").get();
  $("#list").innerHTML=s.empty?"No exams yet.":`<div class="tbl"><table><tr><th>Exam</th><th>Code</th><th>Language</th><th>Time</th><th>Marks</th><th>Auto-delete</th><th></th></tr>`+
  s.docs.map(d=>{const x=d.data(),left=Math.max(0,Math.ceil((x.at+DAYS*DAY-Date.now())/DAY));return`<tr><td><button class="g" data-c="${d.id}" title="Open this exam">📁 ${esc(x.name)}</button></td><td><code>${d.id}</code></td><td>${LANG[x.lang]||LANG.bu}</td><td>${x.mins}m</td><td>${x.full}</td><td>in ${left}d</td><td><button class="g" data-c="${d.id}">Results</button> <button class="d" data-x="${d.id}">Delete</button></td></tr>`}).join("")+`</table></div>`;
  document.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>results(b.dataset.c));
  document.querySelectorAll("[data-x]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this exam and all its results permanently?")){await purge(b.dataset.x);$("#res").innerHTML="";list()}})}
  catch(e){$("#list").textContent="Could not load exams."}
}
async function results(code){
  const box=$("#res");box.innerHTML=`<div class="card">Loading…</div>`;
  try{const ex=(await db.doc("exams/"+code).get()).data();
  const s=await db.collection("results").where("code","==",code).get();
  const rows=s.docs.map(d=>d.data()).sort((a,b)=>String(a.roll).localeCompare(String(b.roll),undefined,{numeric:true}));
  const st=r=>r.status==="submitted"?"Submitted":"Not submitted";
  box.innerHTML=`<div class="card"><div class="bar"><h2>📁 ${esc(ex.name)} · ${code} · ${rows.length} candidate(s)</h2><span><button class="g" id="rf">Refresh</button> <button id="pdf" ${rows.length?"":"disabled"}>Download PDF</button></span></div>
  <div class="tbl"><table><tr><th>Roll</th><th>Total words</th><th>Typed</th><th>Correct</th><th>Marks</th><th>Status</th><th>Tab leaves</th><th>Blocked paste/jump</th><th></th></tr>${rows.map((r,i)=>`<tr><td>${esc(r.roll)}</td><td>${r.total}</td><td>${r.typed}</td><td>${r.correct}</td><td>${r.marks} / ${r.full}</td><td>${st(r)}</td><td>${r.tabs||0}</td><td>${r.blocked||0}</td><td><button class="g" data-r="${i}">View</button></td></tr>`).join("")}</table></div><div id="det"></div></div>`;
  $("#rf").onclick=()=>results(code);
  document.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{const r=rows[+b.dataset.r];$("#det").innerHTML=`<h2 style="margin-top:16px">Roll ${esc(r.roll)} — ${r.marks} / ${r.full} marks</h2>${LEG}<div class="ref ${cls(ex.lang)}" style="max-height:none">${show(mark(ex.text,r.text||""))}</div>`;$("#det").scrollIntoView()});
  $("#pdf").onclick=async()=>{$("#pdf").disabled=true;const b=await makePdf(code,ex.name,rows);if(!await saveFile(code+"_results.pdf",b))alert("Download is not available here.");$("#pdf").disabled=false};
  box.scrollIntoView()}catch(e){box.innerHTML=`<div class="card err">Could not load results.</div>`}
}
function pdf(jp,W,H){
  const enc=new TextEncoder(),parts=[],off=[];let len=0;
  const add=d=>{const u=typeof d==="string"?enc.encode(d):d;parts.push(u);len+=u.length};
  const obj=(i,f)=>{off[i]=len;add(i+" 0 obj\n");f();add("\nendobj\n")};
  add("%PDF-1.4\n");obj(1,()=>add("<</Type/Catalog/Pages 2 0 R>>"));
  obj(2,()=>add("<</Type/Pages/Count "+jp.length+"/Kids["+jp.map((_,i)=>(3+i*3)+" 0 R").join(" ")+"]>>"));
  jp.forEach((j,i)=>{const p=3+i*3,c="q 595 0 0 842 0 0 cm /I Do Q";
    obj(p,()=>add(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</XObject<</I ${p+1} 0 R>>>>/Contents ${p+2} 0 R>>`));
    obj(p+1,()=>{add(`<</Type/XObject/Subtype/Image/Width ${W}/Height ${H}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${j.length}>>\nstream\n`);add(j);add("\nendstream")});
    obj(p+2,()=>add(`<</Length ${c.length}>>\nstream\n${c}\nendstream`))});
  const n=3+jp.length*3,x=len;add("xref\n0 "+n+"\n0000000000 65535 f \n");
  for(let i=1;i<n;i++)add(String(off[i]).padStart(10,"0")+" 00000 n \n");
  add(`trailer\n<</Size ${n}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`);
  return new Blob(parts,{type:"application/pdf"});
}
async function makePdf(code,name,rows){
  try{await document.fonts.ready}catch(e){}
  const W=1240,H=1754,PER=32,pages=Math.max(1,Math.ceil(rows.length/PER)),jp=[],cx=[60,190,360,500,650,830,1000,1120];
  for(let p=0;p<pages;p++){
    const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
    x.fillStyle="#fff";x.fillRect(0,0,W,H);x.fillStyle="#111";x.textBaseline="top";
    x.font="700 40px "+FONT;x.fillText(name,60,60);
    x.font="24px "+FONT;x.fillText(`Exam code: ${code}   Candidates: ${rows.length}   Generated: ${new Date().toLocaleString()}   Page ${p+1}/${pages}`,60,120);
    let y=190;x.font="700 22px "+FONT;["Roll","Total words","Typed","Correct","Marks","Status","Tab leaves","Blocked"].forEach((h,i)=>x.fillText(h,cx[i],y));
    y+=36;x.fillRect(60,y,W-120,2);y+=14;x.font="22px "+FONT;
    rows.slice(p*PER,p*PER+PER).forEach(r=>{[String(r.roll),r.total,r.typed,r.correct,r.marks+"/"+r.full,r.status==="submitted"?"Submitted":"Not submitted",r.tabs||0,r.blocked||0].forEach((v,i)=>x.fillText(String(v),cx[i],y));y+=46});
    const b=await new Promise(r=>c.toBlob(r,"image/jpeg",.92));jp.push(new Uint8Array(await b.arrayBuffer()));
  }
  return pdf(jp,W,H);
}

/* ---------- candidate ---------- */
async function start(){
  const code=$("#code").value.trim().toUpperCase(),roll=$("#roll").value.trim();
  if(!code||!roll)return err("Enter both the exam code and your roll number.");
  if(!db)return err("Cannot connect to the server. Check your internet and try again.");
  $("#go").disabled=true;
  try{
    const s=await db.doc("exams/"+code).get(),bad=m=>{$("#go").disabled=false;err(m)};
    if(!s.exists)return bad("Invalid exam code.");
    const ex=s.data();if(Date.now()>ex.at+DAYS*DAY)return bad("This exam has expired.");
    const key=keyOf(code,roll),l=await db.doc("locks/"+key).acquire({holder:roll,ttlMs:DAYS*DAY});
    if(!l.acquired)return bad("This roll number has already been used for this exam.");
    run(code,roll,key,ex);
  }catch(e){$("#go").disabled=false;err("Error: "+(e.message||e.code||e))}
}
async function run(code,roll,key,ex){
  const end=Date.now()+ex.mins*60000,startAt=Date.now();let done=false,tabs=0,blocked=0,prev="",dirty=true;
  app.innerHTML=`<div class="card"><div class="bar"><div><h2 style="margin:0">${esc(ex.name)}</h2><span class="mu">Roll ${esc(roll)} · ${ex.full} marks</span></div><div class="timer" id="tm"></div></div></div>
  <div id="warn"></div><div class="card nosel"><label>Type this paragraph</label><div class="ref ${cls(ex.lang)}" id="ref"></div>
  <label>Your typing</label><textarea id="ta" class="${cls(ex.lang)}" style="min-height:220px" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-gramm="false"></textarea>
  <p class="mu">Pasting, copying and leaving this page are blocked or recorded. Your exam is submitted automatically when time ends.</p>
  <p><button id="fin">Finish &amp; submit</button></p></div>`;
  $("#ref").textContent=ex.text;const ta=$("#ta");ta.focus();
  try{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen().catch(()=>{})}catch(e){}
  const snap=st=>{const g=grade(ex.text,ta.value);return{code,roll,total:g.total,typed:g.typed,correct:g.correct,marks:marksOf(g,ex.full),full:ex.full,lang:ex.lang,text:ta.value,status:st,tabs,blocked,at:startAt}};
  const warn=m=>{const w=$("#warn");w.textContent=m;w.style.display="block";setTimeout(()=>w.style.display="none",4000)};
  const flag=()=>{blocked++;dirty=true;warn("Pasting, copying and dropping text are not allowed. This was recorded.")};
  await db.doc("results/"+key).set(snap("in progress")).catch(()=>{});
  ["paste","drop","cut","copy","contextmenu","dragstart"].forEach(ev=>app.addEventListener(ev,e=>{e.preventDefault();if(ev==="paste"||ev==="drop")flag()}));
  ta.addEventListener("beforeinput",e=>{if(/paste|drop|yank|replacement|redo|undo/i.test(e.inputType||"")){e.preventDefault();flag()}});
  ta.addEventListener("keydown",e=>{if(((e.ctrlKey||e.metaKey)&&/^[cvxazy]$/i.test(e.key))||(e.shiftKey&&e.key==="Insert")||(e.ctrlKey&&e.key==="Insert")){e.preventDefault();flag()}});
  ta.addEventListener("input",e=>{if(!e.isComposing&&ta.value.length-prev.length>25){ta.value=prev;flag()}else{prev=ta.value;dirty=true}});
  const vis=()=>{if(document.hidden&&!done){tabs++;dirty=true;warn(`You left the exam page (${tabs}/3). The 3rd time submits your exam.`);if(tabs>=3)finish()}};
  document.addEventListener("visibilitychange",vis);
  const tm=$("#tm"),tick=()=>{const l=Math.max(0,Math.ceil((end-Date.now())/1000));tm.textContent=String(Math.floor(l/60)).padStart(2,"0")+":"+String(l%60).padStart(2,"0");tm.classList.toggle("low",l<=60);if(l<=0)finish()};
  let saving=setInterval(()=>{if(dirty&&!done){dirty=false;db.doc("results/"+key).set(snap("in progress")).catch(()=>{})}},15000);
  async function finish(){
    if(done)return;done=true;clearInterval(timer);clearInterval(saving);document.removeEventListener("visibilitychange",vis);
    ta.disabled=true;$("#fin").disabled=true;try{document.exitFullscreen&&document.fullscreenElement&&document.exitFullscreen()}catch(e){}
    const r=snap("submitted");let ok=true;
    for(let i=0;i<3&&(ok=false)===false;i++){try{await db.doc("results/"+key).set(r);ok=true;break}catch(e){await new Promise(z=>setTimeout(z,800))}}
    showResult({...r,ref:ex.text,name:ex.name},ok);
  }
  $("#fin").onclick=()=>{if(confirm("Submit your exam now?"))finish()};
  tick();timer=setInterval(tick,250);
}
function showResult(r,saved){
  app.innerHTML=`<div class="card"><h2>${esc(r.name)} — Result</h2><p class="mu">Roll ${esc(r.roll)}</p>
  <div class="stats"><div><b>${r.total}</b>Total words</div><div><b>${r.typed}</b>Words typed</div><div><b>${r.correct}</b>Correct words</div><div><b>${r.marks}/${r.full}</b>Marks</div></div>
  <h2 style="margin-top:16px">Your typed paragraph</h2>${LEG}<div class="ref ${cls(r.lang)}" style="max-height:none">${show(mark(r.ref,r.text||""))}</div>
  <p class="${saved?"ok":"err"}">${saved?"Your result has been submitted to the examiner.":"Your result could not be sent to the server. Download your image now and show it to the invigilator."}</p>
  <p><button id="dl">Download result as image</button> <button class="g" id="hm">Done</button></p><div id="fb"></div></div>`;
  $("#hm").onclick=home;
  $("#dl").onclick=async()=>{const b=await png(r);if(!await saveFile("typing-result-"+r.roll+".png",b))$("#fb").innerHTML=`<p class="mu">Press and hold the image below, then choose “Save image”.</p><img style="max-width:100%" src="${URL.createObjectURL(b)}">`};
}
function wrapT(c,T,w){const L=[];let l=[],lw=0;for(const t of T){const tw=c.measureText(t.w+" ").width;if(lw+tw>w&&l.length){L.push(l);l=[];lw=0}l.push(t);lw+=tw}if(l.length)L.push(l);return L}
function wrap(c,t,w){const L=[];let l="";for(const x of words(t)){const n=l?l+" "+x:x;if(c.measureText(n).width>w&&l){L.push(l);l=x}else l=n}if(l)L.push(l);return L}
async function png(r){
  const F=fnt(r.lang);try{await document.fonts.load("20px "+F,"অআক")}catch(e){}
  const W=1000,P=40,LH=32,c=document.createElement("canvas");let x=c.getContext("2d");x.font="20px "+F;
  const A=wrap(x,r.ref,W-2*P),B=wrapT(x,mark(r.ref,r.text||""),W-2*P);
  c.width=W;c.height=P*2+430+(A.length+B.length)*LH;x=c.getContext("2d");
  x.fillStyle="#fff";x.fillRect(0,0,W,c.height);x.fillStyle="#111";x.textBaseline="top";
  x.fillStyle="#0b1f44";x.fillRect(0,0,W,70);x.fillStyle="#c8102e";x.fillRect(0,70,W,5);x.fillStyle="#fff";x.font="700 32px "+FONT;x.fillText("OC&S Typing Exam",P,16);x.fillStyle="#111";let y=100;x.font="700 26px "+FONT;x.fillText(r.name,P,y);y+=46;x.font="22px "+FONT;
  [["Roll number",r.roll],["Total words in reference",r.total],["Total words typed",r.typed],["Correct words typed",r.correct],["Total marks",r.marks+" / "+r.full]].forEach(([k,v])=>{x.fillText(k+": "+v,P,y);y+=34});
  y+=12;x.font="700 22px "+FONT;x.fillText("Reference paragraph",P,y);y+=38;x.font="20px "+F;
  A.forEach(l=>{x.fillText(l,P,y);y+=LH});y+=26;
  x.font="700 22px "+FONT;x.fillText("Candidate’s typed paragraph",P,y);y+=34;x.font="16px "+FONT;x.fillStyle="#555";x.fillText("Black = correct    Red = wrong word    Blue = unknown word",P,y);y+=30;x.fillStyle="#111";x.font="20px "+F;
  B.forEach(l=>{let px=P;l.forEach(t=>{x.fillStyle=t.c==="bad"?"#c62828":t.c==="unk"?"#1565c0":"#111";x.fillText(t.w,px,y);px+=x.measureText(t.w+" ").width});y+=LH});x.fillStyle="#111";
  return new Promise(res=>c.toBlob(res,"image/png"));
}

/* ---------- boot ---------- */
home();
(async()=>{try{const b=await BACKEND.init();if(b){db=b.db;downloads=b.downloads}}catch(e){console.error(e)}})();
