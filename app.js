(function(){
"use strict";
var D = window.L137;

/* ---------- storage with in-memory fallback ---------- */
var mem = {};
var store = (function(){
  try { var k="__t"; localStorage.setItem(k,"1"); localStorage.removeItem(k); return localStorage; }
  catch(e){ return { getItem:function(k){return k in mem?mem[k]:null;}, setItem:function(k,v){mem[k]=String(v);}, removeItem:function(k){delete mem[k];} }; }
})();
var KEY = "l137-refuse-p2-";
function get(k,def){ try{ var v=store.getItem(KEY+k); return v===null?def:JSON.parse(v);}catch(e){return def;} }
function set(k,v){ try{ store.setItem(KEY+k,JSON.stringify(v)); }catch(e){} }

/* ---------- helpers ---------- */
var $ = function(s,r){return (r||document).querySelector(s);};
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
function kjv(ref){ return D.kjv[ref] || []; }
function kjvPlain(ref){ return kjv(ref).map(function(v){return v.t;}).join(" "); }
function scripHTML(ref){
  var vs = kjv(ref); if(!vs.length) return "";
  return '<div class="scrip"><div class="lbl">Scripture · KJV</div><p>' +
    vs.map(function(v){ return (vs.length>1?'<sup>'+v.n+'</sup>':'')+esc(v.t); }).join(" ") +
    '</p><div class="ref">'+esc(ref.replace("-","–"))+' KJV</div></div>';
}
function toast(msg){ var t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(function(){t.remove();},2200); }
function spokenRef(ref){
  return ref.replace(/^1 /,"First ").replace(/^2 /,"Second ").replace(/(\d+):(\d+)-(\d+)/,"chapter $1, verses $2 to $3").replace(/(\d+):(\d+)/,"chapter $1, verse $2");
}
function clean(s){ return s.replace(/\[unclear\]/g,"").replace(/[\[\]]/g,"").replace(/\{N\}/g,"").replace(/\s+/g," ").trim(); }

/* ---------- family names ---------- */
var names = get("names", ["","","",""]);
while(names.length<4) names.push("");
function filled(){ return names.map(function(n){return n.trim();}).filter(Boolean); }
function joinNames(){
  var a = filled(); if(!a.length) return "";
  if(a.length===1) return a[0];
  return a.slice(0,-1).join(", ")+" and "+a[a.length-1];
}
function personal(tpl){ var j=joinNames(); return j ? tpl.replace(/\{N\}/g,j) : ""; }
function namesBoxHTML(){
  return '<div class="names">'+names.map(function(n,i){
    return '<input type="text" inputmode="text" autocomplete="off" data-name="'+i+'" value="'+esc(n)+'" placeholder="Name '+(i+1)+'" aria-label="Family member '+(i+1)+' name">';
  }).join("")+'</div><div class="rowbtns"><button class="btn green" data-act="addname">+ Add another name</button><button class="btn" data-act="clearnames">Clear names</button></div>';
}
function refreshPersonal(){
  document.querySelectorAll("[data-ptpl]").forEach(function(el){
    var tpl = el.getAttribute("data-ptpl"); var p = personal(tpl);
    if(p){ el.textContent = clean(p); el.classList.remove("empty"); }
    else { el.textContent = "Type a name in the boxes above and this declaration will be written for your family."; el.classList.add("empty"); }
  });
}
document.addEventListener("input",function(e){
  var i = e.target.getAttribute && e.target.getAttribute("data-name");
  if(i===null || i===undefined) return;
  names[+i] = e.target.value; set("names",names);
  document.querySelectorAll('input[data-name="'+i+'"]').forEach(function(x){ if(x!==e.target) x.value=e.target.value; });
  refreshPersonal(); if(state.view==="family") renderFamilyList();
});

/* ---------- build guided slides ---------- */
var declCount = 0, earthCount = 0, totalDecls = D.declarations.length;
D.declarations.forEach(function(d){ if(d.g==="earth"){ d.i=++earthCount; } else { d.i=++declCount; } });
function dLabel(d){ return d.g==="earth" ? "Direction Declaration "+d.i+" of "+earthCount : "Declaration "+d.i+" of "+declCount; }
var slides = [];
D.steps.forEach(function(st,si){
  slides.push({type:"step", step:st, si:si});
  if(st.declareGroup){
    D.declarations.filter(function(d){return d.g===st.declareGroup;}).forEach(function(d){ slides.push({type:"decl", d:d, step:st, si:si}); });
  }
  if(st.after) slides.push({type:"after", step:st, si:si});
});

/* ---------- speech engine ---------- */
var synth = window.speechSynthesis || null;
var settings = get("settings",{rate:0.95, mode:"repeat", auto:true, fam:true, theme:"day", fs:1});
var A = { queue:[], idx:0, playing:false, paused:false, timer:null, onDone:null, token:0 };
function sentences(text){
  var parts = String(text).match(/[^.!?;:]+[.!?;:]*["”’)]*\s*/g) || [text];
  var out=[], buf="";
  parts.forEach(function(p){ if((buf+p).length<180){buf+=p;} else { if(buf) out.push(buf.trim()); buf=p; } });
  if(buf.trim()) out.push(buf.trim());
  return out;
}
function q(text, pauseAfter, label){ var c=sentences(clean(String(text).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F3FB}-\u{1F3FF}]/gu,""))); return c.map(function(s,i){ return {t:s, p:(i===c.length-1?(pauseAfter||0):0), label:label||""}; }); }
function repeatPause(text){ var w = clean(text).split(" ").length; return Math.min(15000, Math.max(2500, w*430/settings.rate)); }
function pickVoice(){
  if(!synth) return null; var vs = synth.getVoices()||[];
  var pref = vs.filter(function(v){return /^en(-|_)/i.test(v.lang);});
  var good = pref.filter(function(v){return /Samantha|Daniel|Google US|Google UK|Karen|Moira|Serena|Natural|Aria|Jenny/i.test(v.name);});
  return good[0]||pref[0]||vs[0]||null;
}
function setNow(t){ var el=$("#now"); if(el) el.textContent=t||""; }
function setPlayBtn(){ var b=$("#aPlay"); if(!b) return; var on=A.playing&&!A.paused; b.innerHTML = on ? ico("pause")+"Pause" : ico("play")+(A.paused?"Resume":"Play"); b.setAttribute("aria-label", on?"Pause":"Play"); }
function speakIdx(){
  clearTimeout(A.timer);
  if(!A.playing || A.paused) return;
  if(A.idx>=A.queue.length){ A.playing=false; setPlayBtn(); setNow("Finished this part."); var cb=A.onDone; A.onDone=null; if(cb) cb(); return; }
  var item = A.queue[A.idx]; var tok = ++A.token;
  setNow((item.label?item.label+" · ":"")+item.t);
  if(!synth){ A.timer=setTimeout(function(){ if(tok!==A.token) return; A.idx++; speakIdx(); }, 1500+item.t.length*55); return; }
  var u = new SpeechSynthesisUtterance(item.t); u.rate=settings.rate; u.pitch=1; var v=pickVoice(); if(v) u.voice=v; u.lang=(v&&v.lang)||"en-US";
  var done=false;
  function next(){ if(done||tok!==A.token) return; done=true; var p=item.p||0; if(p>=2000){ setNow("🗣️ Your turn — say it aloud…"); } A.timer=setTimeout(function(){ if(tok!==A.token||A.paused||!A.playing) return; A.idx++; speakIdx(); }, p+250); }
  u.onend=next; u.onerror=function(ev){ if(ev && (ev.error==="interrupted"||ev.error==="canceled")) return; next(); };
  // safety for engines that never fire onend
  var guard = Math.max(4000, item.t.length*120/settings.rate);
  setTimeout(function(){ if(!done && tok===A.token && A.playing && !A.paused && !synth.speaking){ next(); } }, guard);
  try{ synth.speak(u); }catch(e){ next(); }
}
function audioPlay(queue, onDone){
  stopAudio(true);
  A.queue=queue; A.idx=0; A.playing=true; A.paused=false; A.onDone=onDone||null;
  setPlayBtn(); speakIdx();
}
function stopAudio(silent){ A.token++; clearTimeout(A.timer); if(synth) try{synth.cancel();}catch(e){} A.playing=false; A.paused=false; A.onDone=null; if(!silent){ setNow("Stopped."); } setPlayBtn(); }
function pauseAudio(){ if(!A.playing) return; A.paused=true; A.token++; clearTimeout(A.timer); if(synth) try{synth.cancel();}catch(e){} setNow("Paused."); setPlayBtn(); }
function resumeAudio(){ if(!A.playing){ return false; } A.paused=false; setPlayBtn(); speakIdx(); return true; }
function seek(d){ if(!A.queue.length) return; A.idx=Math.max(0,Math.min(A.queue.length-1,A.idx+d)); A.token++; clearTimeout(A.timer); if(synth) try{synth.cancel();}catch(e){} A.playing=true; A.paused=false; setPlayBtn(); speakIdx(); }

/* ---------- queue builders ---------- */
function stepQueue(st){
  var Q=[]; var lab = st.title;
  Q=Q.concat(q(st.title+".",400,lab));
  if(st.kind==="direction") Q=Q.concat(q("Follow the original direction.",300,lab));
  if(st.lead) Q=Q.concat(q(st.lead,300,lab));
  (st.seq||[]).forEach(function(x){ if(x.r) Q=Q.concat(q("Scripture. "+spokenRef(x.r)+". "+kjvPlain(x.r),500,x.r)); else Q=Q.concat(q(x.p,350,lab)); });
  (st.words||[]).forEach(function(w){ Q=Q.concat(q(w,350,lab)); });
  if(st.kind==="bondages") D.bondages.forEach(function(b,i){ Q=Q.concat(q((i+1)+". "+b.name+".",300,b.name)); Q=Q.concat(q(b.words,300,b.name)); (b.refs||[]).forEach(function(r){ Q=Q.concat(q(spokenRef(r)+". "+kjvPlain(r),400,r)); }); });
  (st.refs||[]).forEach(function(r){ Q=Q.concat(q("Scripture. "+spokenRef(r)+". "+kjvPlain(r),500,r)); });
  if(st.checklist){ Q=Q.concat(q("Here are the steps.",300,lab)); st.checklist.forEach(function(c,i){ Q=Q.concat(q("Step "+(i+1)+". "+c,500,lab)); }); }
  if(st.missing) Q=Q.concat(q(st.missing,300,lab));
  if(st.next) Q=Q.concat(q(st.next,300,lab));
  return Q;
}
function declQueue(d){
  var Q=[]; var lab=dLabel(d);
  var rep = settings.mode==="repeat";
  if(rep) Q=Q.concat(q("Repeat after me.",250,lab));
  Q=Q.concat(q(d.t, rep?repeatPause(d.t):600, lab));
  if(settings.fam && d.f && filled().length){
    var p = personal(d.f);
    Q=Q.concat(q("Now for my family.",250,"For my family"));
    Q=Q.concat(q(p, rep?repeatPause(p):600, "For my family"));
  }
  return Q;
}

/* ---------- views ---------- */
var state = { view:"home", slide:get("slide",0) };
var main = $("#main");
function go(view, arg){
  stopAudio(true); state.view=view; window.scrollTo(0,0);
  $("#dock").classList.toggle("hidden", view==="home");
  ({home:renderHome, guide:renderSlide, decls:renderDecls, family:renderFamily, learn:renderLearn, quiz:renderQuizMenu, memory:renderMemory, scriptures:renderScriptures, bondages:renderBondagesView, prayersOver:renderPrayersOver, help:renderHelp}[view]||renderHome)(arg);
  refreshPersonal();
  try{ history.replaceState(null,"","#"+view); }catch(e){}
}

function ico(n){
  var p = {
    play:'<path d="M7 4v16l13-8z" fill="currentColor"/>',
    pause:'<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>',
    prev:'<path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/>',
    next:'<path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/>',
    rew:'<path d="M11 6v12L3 12zM21 6v12l-8-6z" fill="currentColor"/>',
    fwd:'<path d="M13 6v12l8-6zM3 6v12l8-6z" fill="currentColor"/>',
    rep:'<path d="M17 2l4 4-4 4V7H7a3 3 0 00-3 3v1H2v-1a5 5 0 015-5h10zM7 22l-4-4 4-4v3h10a3 3 0 003-3v-1h2v1a5 5 0 01-5 5H7z" fill="currentColor"/>'
  }[n]; return '<svg viewBox="0 0 24 24" aria-hidden="true">'+p+'</svg>';
}

function renderHome(){
  var resume = get("slide",0);
  var v = kjv("Ezekiel 16:6")[0];
  main.innerHTML =
  '<section class="opening"><div class="wrap"><div class="eyebrow">L137 Deliverance Ministry</div><p>The following is an interactive study following a service held on Clubhouse by Pastor Kiki Ocansey.</p><div class="rule"></div></div></section>'+
  '<section class="hero"><div class="wrap">'+
    '<div class="min">'+esc(D.meta.ministry)+'</div>'+
    '<h1>'+esc(D.meta.title)+'</h1>'+
    '<div class="part">'+esc(D.meta.part)+'</div>'+
    '<div class="who">'+esc(D.meta.minister)+'</div>'+
    '<div class="date">'+esc(D.meta.date)+' · '+esc(D.meta.service)+'</div>'+
    '<div class="verse"><p>“'+esc(v.t)+'”</p><span class="ref">Ezekiel 16:6 KJV</span></div>'+
    '<button class="start" id="startBtn" aria-label="Start">▶ START</button>'+
    (resume>0 ? '<div class="resume-note">You stopped at part '+(resume+1)+' of '+slides.length+'. START continues from there. <button class="linkbtn" id="restartBtn">Start from the beginning</button></div>' : '<div class="resume-note">Press START. The prayer will read aloud and move on by itself.</div>')+
  '</div></section>'+
  '<section class="more"><div class="wrap"><h2>Study More</h2><div class="sub">Optional. The START button above is all you need.</div><div class="grid">'+
    tile("decls","All "+totalDecls+" Declarations",declCount+" from the service + "+earthCount+" from the prophetic direction, with family name boxes")+
    tile("family","My Family Prayers","Type names once; Scripture prayers for your family")+
    tile("direction","Prophetic Direction","Anointing oil: Earth! Earth!! Earth!!! with "+earthCount+" declarations")+
    tile("learn","Learn: 3 Levels","Beginner, Intermediate, Advanced")+
    tile("quiz","Bible Quiz","5, 7 or 10 questions")+
    tile("memory","Memory Cards","Hide, reveal and practice verses")+
    tile("bondages","Kinds of Family Bondage","11 types taught in the service")+
    tile("scriptures","All Scriptures","Every KJV passage from the service")+
    tile("prayersOver","Pastor Kiki's Prayers","Prayers spoken over the people")+
    '<a class="tile" href="transcript.html" style="text-decoration:none"><b>Service Transcript</b><span>Names and testimonies removed</span></a>'+
    '<a class="tile" href="prophetic-direction.pdf" style="text-decoration:none"><b>Printable PDF</b><span>Direction, declarations and Scriptures</span></a>'+
    tile("help","How to Use","iPhone and Android tips")+
  '</div>'+
  '<div class="legend"><h3>Colors in this tool always mean the same thing</h3>'+
    '<div><span class="sw" style="background:#B8891A"></span>Gold edge — Pastor Kiki’s words</div>'+
    '<div><span class="sw" style="background:#1F4FB5"></span>Blue — Scripture (King James Version)</div>'+
    '<div><span class="sw" style="background:#5B2A86"></span>Purple — Original direction to follow</div>'+
    '<div><span class="sw" style="background:#B4441A"></span>Orange-red — Repeat-after-me declaration</div>'+
    '<div><span class="sw" style="background:#2F6B3A"></span>Green dashed — For my family (personalized, not the original words)</div>'+
  '</div>'+
  '<div class="foot">Pastor Kiki Ocansey · L137 Deliverance Ministry International<br>Luke 1:37 — “For with God nothing shall be impossible.”<br>Names you type stay on your own phone. Nothing is sent anywhere.</div>'+
  '</div></section>';
  $("#startBtn").onclick=function(){ unlockSpeech(); go("guide"); setTimeout(playCurrent,350); };
  var rb=$("#restartBtn"); if(rb) rb.onclick=function(){ state.slide=0; set("slide",0); unlockSpeech(); go("guide"); setTimeout(playCurrent,350); };
  main.querySelectorAll("[data-go]").forEach(function(b){ b.onclick=function(){ var t=b.getAttribute("data-go"); if(t==="direction"){ jumpToStep("direction"); } else go(t); }; });
}
function tile(id,b,s){ return '<button class="tile" data-go="'+id+'"><b>'+esc(b)+'</b><span>'+esc(s)+'</span></button>'; }
function jumpToStep(id){ var i=slides.findIndex(function(s){return s.type==="step"&&s.step.id===id;}); state.slide=i<0?0:i; set("slide",state.slide); go("guide"); }

function unlockSpeech(){ if(!synth) return; try{ var u=new SpeechSynthesisUtterance(" "); u.volume=0; synth.speak(u); }catch(e){} }

function cueHTML(tag){
  var cls = /REPEAT|DECLARE|^SAY$/.test(tag)?"repeat":/READ/.test(tag)?"read":/PRAY/.test(tag)?"pray":/DIRECTION/.test(tag)?"direct":/THANK/.test(tag)?"thanks":"listen";
  var icon = {repeat:"🗣️",read:"📖",pray:"🙏🏽",direct:"📌",thanks:"🙌🏽",listen:"🔊"}[cls];
  return '<span class="cue '+cls+'">'+icon+' '+esc(tag)+'</span>';
}
function stepBodyHTML(st){
  var h="";
  if(st.lead) h+='<div class="kiki"><div class="lbl">Pastor Kiki</div><p>'+esc(st.lead)+'</p></div>';
  if(st.banner) h+='<div class="banner">'+st.banner.map(function(b,i){ return '<div class="b'+i+'">'+esc(b)+'</div>'; }).join("")+'</div>';
  if(st.seq){ h+='<div class="dir"><div class="lbl">'+esc(st.lbl||"Original direction")+'</div>'; st.seq.forEach(function(x){ h+= x.r ? scripHTML(x.r) : '<p>'+esc(x.p)+'</p>'; }); h+='</div>'; }
  if(st.words && st.words.length){
    var box = st.kind==="direction" ? "dir" : "kiki";
    var lbl = st.lbl ? st.lbl : st.kind==="direction" ? "Original direction · Pastor Kiki" : (st.kind==="pray"?"Pastor Kiki prays":"Pastor Kiki");
    h+='<div class="'+box+'"><div class="lbl">'+lbl+'</div>'+st.words.map(function(w){return '<p>'+esc(w)+'</p>';}).join("")+'</div>';
  }
  if(st.kind==="bondages") h+=bondagesHTML();
  (st.refs||[]).forEach(function(r){ h+=scripHTML(r); });
  if(st.checklist){
    var ck=get("check",{});
    h+='<div class="dir"><div class="lbl">Checklist — tick as you go</div><ul class="checklist">'+st.checklist.map(function(c,i){ var k=st.id+"-"+i; return '<li><input type="checkbox" id="ck-'+k+'" data-ck="'+k+'" '+(ck[k]?"checked":"")+'><label for="ck-'+k+'">'+esc(c)+'</label></li>'; }).join("")+'</ul></div>';
  }
  if(st.missing) h+='<div class="missing">📌 '+esc(st.missing)+'</div>';
  if(st.next) h+='<div class="dir"><p>📌 '+esc(st.next)+'</p></div>';
  if(st.note) h+='<div class="note">Note: '+esc(st.note)+'</div>';
  return h;
}
function bondagesHTML(){
  return D.bondages.map(function(b,i){
    return '<div class="acc" data-acc><button aria-expanded="false"><span class="n">'+(i+1)+'</span>'+esc(b.name)+'<span class="chev">▾</span></button><div class="body"><div class="kiki"><div class="lbl">Pastor Kiki</div><p>'+esc(b.words)+'</p></div>'+(b.refs||[]).map(scripHTML).join("")+(b.note?'<div class="note">Note: '+esc(b.note)+'</div>':'')+'</div></div>';
  }).join("");
}
function wireAcc(){ main.querySelectorAll("[data-acc]>button").forEach(function(b){ b.onclick=function(){ var a=b.parentNode; a.classList.toggle("open"); b.setAttribute("aria-expanded",a.classList.contains("open")); }; }); }
function wireChecks(){ main.querySelectorAll("[data-ck]").forEach(function(c){ c.onchange=function(){ var ck=get("check",{}); ck[c.getAttribute("data-ck")]=c.checked; set("check",ck); }; }); }

function declCardHTML(d, showPos){
  var h='<div class="decl"><div class="num">'+esc(dLabel(d))+'</div>'+cueHTML(d.g==="earth"?"SAY":"REPEAT AFTER ME")+
    '<div class="say">'+esc(d.t)+'</div>'+
    (d.ref?'<button class="pill" data-ref="'+esc(d.ref)+'">📖 '+esc(d.ref)+'</button><div class="refpop"></div>':'')+
    (d.note?'<div class="note">Note: '+esc(d.note)+'</div>':'')+
    '<div class="src">'+(d.g==="earth"?"L137 written prophetic direction (WhatsApp platform)":"Pastor Kiki Ocansey · as spoken in the service")+'</div></div>';
  if(d.f){
    h+='<div class="pers"><div class="lbl">🏠 For my family — type their names</div>'+namesBoxHTML()+
      '<div class="ptext" data-ptpl="'+esc(d.f)+'"></div>'+
      '<div class="note">This family version is personalized from the declaration above. It is not the original wording.</div></div>';
  }
  return h;
}
function wireRefs(){ main.querySelectorAll("[data-ref]").forEach(function(b){ b.onclick=function(){ var pop=b.nextElementSibling; if(pop.innerHTML){pop.innerHTML="";} else pop.innerHTML=scripHTML(b.getAttribute("data-ref")); }; }); }
function wireNames(){
  main.querySelectorAll('[data-act="addname"]').forEach(function(b){ b.onclick=function(){ names.push(""); set("names",names); rerender(); }; });
  main.querySelectorAll('[data-act="clearnames"]').forEach(function(b){ b.onclick=function(){ if(!confirm("Clear all family names?")) return; names=["","","",""]; set("names",names); rerender(); }; });
}
function rerender(){ var y=window.scrollY; var v=state.view; if(v==="guide") renderSlide(); else if(v==="decls") renderDecls(); else if(v==="family") renderFamily(); refreshPersonal(); window.scrollTo(0,y); }

function renderSlide(){
  if(state.slide>=slides.length) state.slide=slides.length-1;
  var s = slides[state.slide]; set("slide",state.slide);
  var pct = Math.round((state.slide+1)/slides.length*100);
  var st = s.step; var h='<div class="screen"><div class="wrap">';
  h+='<div class="crumb">Part '+(s.si+1)+' of '+D.steps.length+' · '+esc(st.title)+'</div><div class="progress" aria-label="Progress '+pct+'%"><i style="width:'+pct+'%"></i></div>';
  if(s.type==="step"){
    h+='<div class="stephead">'+cueHTML(st.tag)+'</div><h2 class="title">'+esc(st.title)+'</h2>'+stepBodyHTML(st);
  } else if(s.type==="decl"){
    h+='<h2 class="title">'+esc(st.title)+'</h2>'+declCardHTML(s.d,true);
  } else {
    h+='<div class="stephead">'+cueHTML(st.afterTag||(st.tag==="GIVE THANKS"?"GIVE THANKS":"PRAY"))+'</div><h2 class="title">'+esc(st.title)+'</h2><div class="'+(st.kind==="direction"?"dir":"kiki")+'"><div class="lbl">'+esc(st.lbl||"Pastor Kiki")+'</div><p'+(st.afterTag?' class="bigthanks"':'')+'>'+esc(st.after)+'</p></div>';
  }
  if(state.slide===slides.length-1) h+='<div class="dir" style="text-align:center"><div class="lbl">Finished</div><p style="font-family:var(--serif);font-size:1.3rem">You have completed the guided prayer. Amen.</p><p>Remember your prophetic direction when you break your fast.</p></div>';
  h+='<div class="navrow"><button class="btn" id="prevBtn" '+(state.slide===0?"disabled":"")+'>← Back</button><button class="btn primary" id="nextBtn">'+(state.slide===slides.length-1?"Home":"Next →")+'</button></div>';
  h+='</div></div>';
  main.innerHTML=h; wireAcc(); wireChecks(); wireRefs(); wireNames(); refreshPersonal();
  $("#prevBtn").onclick=function(){ moveSlide(-1,false); };
  $("#nextBtn").onclick=function(){ if(state.slide===slides.length-1){ set("slide",0); go("home"); } else moveSlide(1,false); };
  setNow(s.type==="decl" ? dLabel(s.d) : st.title);
}
function slideQueue(s){ return s.type==="step" ? stepQueue(s.step) : s.type==="decl" ? declQueue(s.d) : q(s.step.after,400,s.step.title); }
function playCurrent(){
  if(state.view!=="guide") return;
  var s=slides[state.slide];
  audioPlay(slideQueue(s), function(){ if(settings.auto && state.slide<slides.length-1){ moveSlide(1,true); } else if(state.slide===slides.length-1){ setNow("Finished. Amen."); } });
}
function moveSlide(d, autoplay){
  var wasPlaying = A.playing && !A.paused;
  stopAudio(true);
  state.slide=Math.max(0,Math.min(slides.length-1,state.slide+d));
  renderSlide(); window.scrollTo(0,0);
  if(autoplay || wasPlaying) setTimeout(playCurrent,300);
}

/* ---------- declarations library ---------- */
var dIdx = get("didx",0);
function renderDecls(){
  var d = D.declarations[dIdx];
  var group = {earth:"Prophetic Direction: Earth! Earth!! Earth!!!",theme:"I Refuse to Remain Like This",navel:"Your Navel Was Not Cut",live:"In Thy Blood, Live",covenant:"A New Covenant",communion:"As I Drink the Blood of Jesus (Communion)",remain:"You Cannot Remain Like This",fire:"Fire Prayers from the Service",thanks:"Thanksgiving",salvation:"Prayer of Salvation"}[d.g];
  if(dIdx>=totalDecls) dIdx=totalDecls-1; var pct=Math.round((dIdx+1)/totalDecls*100);
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">Declarations · '+esc(group)+'</div><div class="progress"><i style="width:'+pct+'%"></i></div>'+
    '<h2 class="title">'+esc(dLabel(d))+'</h2><div class="counter">'+(dIdx+1)+' of '+totalDecls+' in this list</div>'+declCardHTML(d,true)+
    '<div class="navrow"><button class="btn" id="dPrev" '+(dIdx===0?"disabled":"")+'>← Previous</button><button class="btn primary" id="dNext" '+(dIdx===totalDecls-1?"disabled":"")+'>Next →</button></div>'+
    '<div class="rowbtns" style="margin-top:14px"><button class="btn" id="dAll">▶ Play all from here</button><button class="btn" id="dHome">🏠 Main menu</button></div>'+
    '</div></div>';
  wireRefs(); wireNames(); refreshPersonal();
  $("#dPrev").onclick=function(){ stopAudio(true); dIdx--; set("didx",dIdx); renderDecls(); };
  $("#dNext").onclick=function(){ stopAudio(true); dIdx++; set("didx",dIdx); renderDecls(); };
  $("#dHome").onclick=function(){ go("home"); };
  $("#dAll").onclick=function(){ playDeclFrom(); };
  setNow(dLabel(d));
}
function playDeclFrom(){
  audioPlay(declQueue(D.declarations[dIdx]), function(){ if(settings.auto && dIdx<totalDecls-1){ dIdx++; set("didx",dIdx); renderDecls(); setTimeout(playDeclFrom,300); } });
}

/* ---------- family prayers ---------- */
function renderFamily(){
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">My Family Prayers</div><h2 class="title">My Family Prayers</h2>'+
    '<div class="pers"><div class="lbl">Type names once — they are used everywhere in this tool</div>'+namesBoxHTML()+'</div>'+
    '<div class="note" style="border:0">These are personalized Scripture prayers. They are supplementary and are not Pastor Kiki’s original declarations.</div>'+
    '<div id="famList"></div></div></div>';
  wireNames(); renderFamilyList();
}
function renderFamilyList(){
  var el=$("#famList"); if(!el) return; var has=filled().length;
  el.innerHTML = D.familyPrayers.map(function(fp,i){
    var txt = has ? clean(personal(fp.p)) : "";
    return '<div class="qcard"><h3>'+(i+1)+'. '+esc(fp.title)+'</h3>'+scripHTML(fp.ref)+
      '<div class="pers"><div class="lbl">Personalized prayer</div><div class="ptext'+(has?"":" empty")+'">'+(has?esc(txt):"Type at least one name above.")+'</div></div>'+
      '<div class="rowbtns"><button class="btn" data-fp="listen" data-i="'+i+'" '+(has?"":"disabled")+'>🔊 Listen</button><button class="btn" data-fp="copy" data-i="'+i+'" '+(has?"":"disabled")+'>Copy</button><button class="btn" data-fp="share" data-i="'+i+'" '+(has?"":"disabled")+'>Share</button></div></div>';
  }).join("");
  el.querySelectorAll("[data-fp]").forEach(function(b){ b.onclick=function(){
    var fp=D.familyPrayers[+b.getAttribute("data-i")]; var txt=clean(personal(fp.p)); var full=fp.title+" ("+fp.ref+" KJV)\n“"+kjvPlain(fp.ref)+"”\n\n"+txt;
    var a=b.getAttribute("data-fp");
    if(a==="listen") audioPlay(q(spokenRef(fp.ref)+". "+kjvPlain(fp.ref),500,fp.title).concat(q(txt,600,fp.title)));
    if(a==="copy"){ copy(full); }
    if(a==="share"){ if(navigator.share){ navigator.share({title:fp.title,text:full}).catch(function(){}); } else { window.open("https://wa.me/?text="+encodeURIComponent(full),"_blank"); } }
  }; });
}
function copy(t){ if(navigator.clipboard && window.isSecureContext){ navigator.clipboard.writeText(t).then(function(){toast("Copied");},function(){fallbackCopy(t);}); } else fallbackCopy(t); }
function fallbackCopy(t){ var ta=document.createElement("textarea"); ta.value=t; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy"); toast("Copied");}catch(e){ toast("Copy not supported"); } ta.remove(); }

/* ---------- learn ---------- */
var lvl = get("lvl","beginner");
function renderLearn(){
  var L = D.levels[lvl];
  var h='<div class="screen"><div class="wrap"><div class="crumb">Supplementary Biblical Study</div><h2 class="title">Learn: '+esc(L.label)+'</h2>'+
    '<div class="tabs" role="tablist">'+["beginner","intermediate","advanced"].map(function(k){return '<button role="tab" aria-selected="'+(k===lvl)+'" data-lvl="'+k+'">'+D.levels[k].label+'</button>';}).join("")+'</div>'+
    '<p style="color:var(--muted)">'+esc(L.intro)+'</p><div class="rowbtns"><button class="btn primary" id="lPlay">🔊 Listen to this level</button><button class="btn" id="lQuiz">Take the '+esc(L.label)+' quiz</button></div>';
  if(L.words){ h+='<div class="section"><h3>Word studies</h3>'+L.words.map(function(w){ return '<div class="word"><div class="w">“'+esc(w.w)+'” — <i>'+esc(w.tr)+'</i></div><div class="s">'+esc(w.lang)+' · Strong’s '+esc(w.s)+' · '+esc(w.v)+'</div><div>'+esc(w.m)+(w.src?' <span class="src">(<a href="'+D.sources[w.src].url+'" target="_blank" rel="noopener">'+esc(D.sources[w.src].name)+'</a>)</span>':'')+'</div></div>'; }).join("")+'</div>'; }
  h+=L.sections.map(function(s){ return '<div class="section"><h3>'+esc(s.h)+'</h3><p>'+esc(s.p)+'</p>'+(s.src?'<div class="src">Source: <a href="'+D.sources[s.src].url+'" target="_blank" rel="noopener">'+esc(D.sources[s.src].name)+'</a></div>':'')+'</div>'; }).join("");
  h+='<div class="section"><h3>Key Scriptures</h3>'+L.refs.map(scripHTML).join("")+'</div>';
  if(lvl==="advanced") h+='<div class="note">Strong’s numbers can be checked at <a href="'+D.sources.blb.url+'" target="_blank" rel="noopener">Blue Letter Bible (Ezekiel 16, KJV with Strong’s)</a>.</div>';
  h+='</div></div>'; main.innerHTML=h;
  main.querySelectorAll("[data-lvl]").forEach(function(b){ b.onclick=function(){ stopAudio(true); lvl=b.getAttribute("data-lvl"); set("lvl",lvl); renderLearn(); }; });
  $("#lQuiz").onclick=function(){ go("quiz", lvl); };
  $("#lPlay").onclick=function(){ var Q=q(L.label+" level. "+L.intro,400,L.label);
    (L.words||[]).forEach(function(w){ Q=Q.concat(q(w.w+". "+w.m,300,"Word study")); });
    L.sections.forEach(function(s){ Q=Q.concat(q(s.h+". "+s.p,400,s.h)); });
    L.refs.forEach(function(r){ Q=Q.concat(q(spokenRef(r)+". "+kjvPlain(r),500,r)); });
    audioPlay(Q); };
}

/* ---------- quiz ---------- */
var QZ = null;
function renderQuizMenu(level){
  if(level){ startQuiz(level); return; }
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">Bible Quiz</div><h2 class="title">Choose a level</h2>'+
    ["beginner","intermediate","advanced"].map(function(k){ var best=get("best-"+k,null); return '<button class="opt" data-q="'+k+'">'+D.levels[k].label+' — '+D.quiz[k].length+' questions'+(best!==null?' · best score '+best+'/'+D.quiz[k].length:'')+'</button>'; }).join("")+
    '</div></div>';
  main.querySelectorAll("[data-q]").forEach(function(b){ b.onclick=function(){ startQuiz(b.getAttribute("data-q")); }; });
}
function startQuiz(k){ QZ={k:k,i:0,score:0,answered:false}; renderQ(); }
function renderQ(){
  var list=D.quiz[QZ.k];
  if(QZ.i>=list.length){
    var best=get("best-"+QZ.k,0); if(QZ.score>best) set("best-"+QZ.k,QZ.score);
    main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">'+D.levels[QZ.k].label+' Quiz</div><h2 class="title">Your score: '+QZ.score+' of '+list.length+'</h2>'+
    '<div class="dir"><p>'+(QZ.score===list.length?"Excellent — every answer correct.":"Well done. Review the study and try again.")+'</p></div>'+
    '<div class="rowbtns"><button class="btn primary" id="qRetry">Try again</button><button class="btn" id="qMenu">Other levels</button><button class="btn" id="qLearn">Review study</button></div></div></div>';
    $("#qRetry").onclick=function(){ startQuiz(QZ.k); }; $("#qMenu").onclick=function(){ renderQuizMenu(); }; $("#qLearn").onclick=function(){ lvl=QZ.k; set("lvl",lvl); go("learn"); };
    return;
  }
  var it=list[QZ.i]; QZ.answered=false;
  var pct=Math.round(QZ.i/list.length*100);
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">'+D.levels[QZ.k].label+' Quiz</div><div class="progress"><i style="width:'+pct+'%"></i></div>'+
    '<div class="qcard"><div class="num" style="color:var(--muted);font-weight:700;font-size:.85rem">Question '+(QZ.i+1)+' of '+list.length+'</div><h3>'+esc(it.q)+'</h3>'+
    it.o.map(function(o,j){return '<button class="opt" data-o="'+j+'">'+String.fromCharCode(65+j)+'. '+esc(o)+'</button>';}).join("")+
    '<div id="fb"></div></div><div class="rowbtns"><button class="btn" id="qListen">🔊 Read question</button></div></div></div>';
  main.querySelectorAll("[data-o]").forEach(function(b){ b.onclick=function(){
    if(QZ.answered) return; QZ.answered=true; var j=+b.getAttribute("data-o"); var ok=j===it.a; if(ok) QZ.score++;
    main.querySelectorAll("[data-o]").forEach(function(x){ var xj=+x.getAttribute("data-o"); if(xj===it.a) x.classList.add("right"); else if(xj===j) x.classList.add("wrong"); x.setAttribute("aria-disabled","true"); });
    $("#fb").innerHTML='<div class="fb"><b>'+(ok?"✅ Correct.":"❌ Not quite. The correct answer is "+String.fromCharCode(65+it.a)+".")+'</b><p style="margin-top:6px">'+esc(it.e)+'</p></div><div class="navrow"><button class="btn primary" id="qNext">'+(QZ.i===list.length-1?"See my score":"Next question →")+'</button></div>';
    $("#qNext").onclick=function(){ stopAudio(true); QZ.i++; renderQ(); window.scrollTo(0,0); };
  }; });
  $("#qListen").onclick=function(){ audioPlay(q(it.q+" "+it.o.map(function(o,j){return String.fromCharCode(65+j)+". "+o+".";}).join(" "),0,"Question "+(QZ.i+1))); };
}

/* ---------- memory cards ---------- */
var mIdx=get("midx",0), mMode="show";
function renderMemory(){
  var ref=D.memory[mIdx]; var txt=kjvPlain(ref);
  var body;
  if(mMode==="hide") body='<div class="txt" style="color:var(--muted)">Say the verse from memory, then tap Reveal.</div>';
  else if(mMode==="practice"){ var w=txt.split(" "); body='<div class="txt">'+w.map(function(x,i){ return (i%3===1)?'<button class="blank" data-w aria-label="Hidden word, tap to reveal">'+esc(x)+'</button>':esc(x); }).join(" ")+'</div>'; }
  else body='<div class="txt">'+esc(txt)+'</div>';
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">Scripture Memory Cards</div><div class="counter">Card '+(mIdx+1)+' of '+D.memory.length+'</div>'+
    '<div class="mem"><div class="ref">'+esc(ref.replace("-","–"))+' KJV</div>'+body+'</div>'+
    '<div class="tabs" style="margin-top:14px"><button aria-selected="'+(mMode==="show")+'" data-m="show">Show</button><button aria-selected="'+(mMode==="hide")+'" data-m="hide">Hide / Reveal</button><button aria-selected="'+(mMode==="practice")+'" data-m="practice">Practice</button></div>'+
    '<div class="rowbtns"><button class="btn primary" id="mPlay">🔊 Play verse</button>'+(mMode==="hide"?'<button class="btn" id="mRev">Reveal</button>':'')+'</div>'+
    '<div class="navrow"><button class="btn" id="mPrev" '+(mIdx===0?"disabled":"")+'>← Previous</button><button class="btn primary" id="mNext" '+(mIdx===D.memory.length-1?"disabled":"")+'>Next Scripture →</button></div></div></div>';
  main.querySelectorAll("[data-m]").forEach(function(b){ b.onclick=function(){ mMode=b.getAttribute("data-m"); renderMemory(); }; });
  main.querySelectorAll("[data-w]").forEach(function(b){ b.onclick=function(){ b.classList.add("shown"); }; });
  $("#mPlay").onclick=function(){ audioPlay(q(spokenRef(ref)+". "+txt,0,ref)); };
  var rv=$("#mRev"); if(rv) rv.onclick=function(){ mMode="show"; renderMemory(); };
  $("#mPrev").onclick=function(){ stopAudio(true); mIdx--; set("midx",mIdx); mMode="show"; renderMemory(); };
  $("#mNext").onclick=function(){ stopAudio(true); mIdx++; set("midx",mIdx); mMode="show"; renderMemory(); };
}

/* ---------- scripture library ---------- */
function allRefs(){
  var seen={}, out=[];
  function add(r){ if(!seen[r] && D.kjv[r]){ seen[r]=1; out.push(r); } }
  D.steps.forEach(function(s){ (s.refs||[]).forEach(add); });
  D.bondages.forEach(function(b){ (b.refs||[]).forEach(add); });
  ["intermediate","advanced"].forEach(function(k){ D.levels[k].refs.forEach(add); });
  ["Ruth 3:9","James 2:26","Matthew 7:7","Luke 1:37"].forEach(add);
  return out;
}
function renderScriptures(){
  var refs=allRefs();
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">Scripture Library</div><h2 class="title">All Scriptures ('+refs.length+')</h2><p style="color:var(--muted)">Tap a reference to open the full King James text.</p>'+
    refs.map(function(r){ return '<div class="acc" data-acc><button aria-expanded="false">📖 '+esc(r.replace("-","–"))+'<span class="chev">▾</span></button><div class="body">'+scripHTML(r)+'<button class="btn" data-say="'+esc(r)+'">🔊 Listen</button></div></div>'; }).join("")+'</div></div>';
  wireAcc();
  main.querySelectorAll("[data-say]").forEach(function(b){ b.onclick=function(){ var r=b.getAttribute("data-say"); audioPlay(q(spokenRef(r)+". "+kjvPlain(r),0,r)); }; });
}
function renderBondagesView(){
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">Teaching</div><h2 class="title">Kinds of Family Bondage</h2><div class="kiki"><div class="lbl">Pastor Kiki</div><p>'+esc(D.steps.find(function(s){return s.id==="types";}).lead)+'</p></div>'+bondagesHTML()+
  '<div class="rowbtns"><button class="btn primary" id="bPlay">🔊 Listen to all</button></div></div></div>';
  wireAcc(); $("#bPlay").onclick=function(){ audioPlay(stepQueue(D.steps.find(function(s){return s.id==="types";}))); };
}
function renderPrayersOver(){
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">Pastor Kiki prays</div><h2 class="title">Prayers Spoken over the People</h2><p style="color:var(--muted)">Pastor Kiki prayed these over everyone in the room. Receive them in Jesus’ name.</p>'+
    D.prayersOver.map(function(p,i){ return '<div class="kiki"><div class="lbl">Prayer '+(i+1)+'</div><p>'+esc(p)+'</p></div>'; }).join("")+
    '<div class="rowbtns"><button class="btn primary" id="poPlay">🔊 Listen to all</button></div></div></div>';
  $("#poPlay").onclick=function(){ var Q=[]; D.prayersOver.forEach(function(p,i){ Q=Q.concat(q(p,800,"Prayer "+(i+1))); }); audioPlay(Q); };
}
function renderHelp(){
  main.innerHTML='<div class="screen"><div class="wrap"><div class="crumb">How to Use</div><h2 class="title">How to Use This Tool</h2>'+
  '<div class="kiki"><div class="lbl">The simple way</div><p>1. Press ▶ START.</p><p>2. Listen. When you hear “Repeat after me,” say the declaration aloud during the pause.</p><p>3. The tool moves on by itself. Press Pause at any time. Press Play to continue.</p><p>4. If you close the page, START will continue where you stopped.</p></div>'+
  '<div class="pers"><div class="lbl">Family names</div><p>Under each declaration there are boxes. Type the names of your family members once. Every declaration then shows a family version, and the narrator reads it after the original when “Family: On” is selected.</p></div>'+
  '<div class="section"><h3>iPhone</h3><p>Turn off Silent Mode (the switch or Action button on the side) and turn the volume up. Keep the screen on while listening — Safari stops speaking when the phone locks. For hands-free listening, go to Settings → Display &amp; Brightness → Auto-Lock and choose a longer time.</p></div>'+
  '<div class="section"><h3>Android</h3><p>Open the link in Chrome. Turn the media volume up. If you hear no voice, open Settings → search “Text-to-speech” → make sure a speech engine (such as Speech Services by Google) is installed. Keep the screen on while listening.</p></div>'+
  '<div class="section"><h3>The buttons at the bottom</h3><p>⏮ Back · ⏪ Rewind one sentence · ▶ Play / Pause · ⏩ Forward one sentence · ⏭ Next part · ⏹ Stop · 🔁 Repeat this part. Below them: speed, Listen only / Repeat after me, Auto next, Family on/off, text size and day/night.</p></div>'+
  '<div class="section"><h3>About the voice</h3><p>The narration uses your phone’s built-in reading voice. It is not Pastor Kiki’s voice.</p></div>'+
  '</div></div>';
}

/* ---------- dock wiring ---------- */
function wireDock(){
  $("#aPlay").onclick=function(){
    unlockSpeech();
    if(A.playing && !A.paused){ pauseAudio(); return; }
    if(A.paused && resumeAudio()) return;
    if(state.view==="guide") playCurrent();
    else if(state.view==="decls") playDeclFrom();
    else if(state.view==="memory") $("#mPlay").click();
    else if(state.view==="learn") $("#lPlay").click();
    else if(state.view==="bondages") $("#bPlay").click();
    else if(state.view==="prayersOver") $("#poPlay").click();
    else if(state.view==="quiz" && $("#qListen")) $("#qListen").click();
    else toast("Choose something to listen to");
  };
  $("#aStop").onclick=function(){ stopAudio(); };
  $("#aRew").onclick=function(){ seek(-1); };
  $("#aFwd").onclick=function(){ seek(1); };
  $("#aRep").onclick=function(){ if(state.view==="guide") { stopAudio(true); playCurrent(); } else if(state.view==="decls"){ stopAudio(true); audioPlay(declQueue(D.declarations[dIdx])); } else if(A.queue.length){ var qq=A.queue; audioPlay(qq); } };
  $("#aPrev").onclick=function(){ if(state.view==="guide") moveSlide(-1,false); else if(state.view==="decls" && dIdx>0){ stopAudio(true); dIdx--; set("didx",dIdx); renderDecls(); } else if(state.view==="memory" && mIdx>0) $("#mPrev").click(); };
  $("#aNext").onclick=function(){ if(state.view==="guide") moveSlide(1,false); else if(state.view==="decls" && dIdx<totalDecls-1){ stopAudio(true); dIdx++; set("didx",dIdx); renderDecls(); } else if(state.view==="memory" && mIdx<D.memory.length-1) $("#mNext").click(); };
  var rate=$("#optRate"); rate.value=String(settings.rate); rate.onchange=function(){ settings.rate=parseFloat(rate.value); set("settings",settings); };
  var mode=$("#optMode"); function pm(){ mode.textContent = settings.mode==="repeat"?"Repeat after me":"Listen only"; mode.setAttribute("aria-pressed", settings.mode==="repeat"); } pm();
  mode.onclick=function(){ settings.mode = settings.mode==="repeat"?"listen":"repeat"; set("settings",settings); pm(); };
  var au=$("#optAuto"); function pa(){ au.textContent="Auto next: "+(settings.auto?"On":"Off"); au.setAttribute("aria-pressed",settings.auto); } pa();
  au.onclick=function(){ settings.auto=!settings.auto; set("settings",settings); pa(); };
  var fm=$("#optFam"); function pf(){ fm.textContent="Family: "+(settings.fam?"On":"Off"); fm.setAttribute("aria-pressed",settings.fam); } pf();
  fm.onclick=function(){ settings.fam=!settings.fam; set("settings",settings); pf(); };
}
function applyLook(){ document.documentElement.setAttribute("data-theme",settings.theme); document.documentElement.style.setProperty("--fs",settings.fs); }
$("#homeBtn").onclick=function(){ go("home"); };
$("#fsDown").onclick=function(){ settings.fs=Math.max(0.85,+(settings.fs-0.1).toFixed(2)); set("settings",settings); applyLook(); };
$("#fsUp").onclick=function(){ settings.fs=Math.min(1.6,+(settings.fs+0.1).toFixed(2)); set("settings",settings); applyLook(); };
$("#themeBtn").onclick=function(){ settings.theme=settings.theme==="night"?"day":"night"; set("settings",settings); applyLook(); $("#themeBtn").textContent=settings.theme==="night"?"☀️":"🌙"; };
$("#themeBtn").textContent=settings.theme==="night"?"☀️":"🌙";
applyLook(); wireDock();
if(synth && synth.onvoiceschanged!==undefined){ synth.onvoiceschanged=function(){}; }
var h=(location.hash||"").replace("#","");
if(h==="direction") jumpToStep("direction");
else if(["decls","family","learn","quiz","memory","scriptures","bondages","prayersOver","help"].indexOf(h)>=0) go(h);
else go("home");
window.__L137 = { slides:slides, state:state, A:A, names:function(){return names;} };
})();
