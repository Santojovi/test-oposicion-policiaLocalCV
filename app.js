'use strict';
/* ============================================================
   Test Policía Local CV — aplicación de estudio
   Datos: window.PREGUNTAS (preguntas.js) — 1.954 preguntas
   ============================================================ */
const $ = id => document.getElementById(id);
const LS_OVERRIDES = 'plcv_overrides';
const LS_PROGRESS  = 'plcv_progress';
const CORTE = 5.0; // nota sobre 10 para aprobar

/* ---------- utilidades ---------- */
function shuffle(arr){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function fmtTime(s){ s=Math.max(0,Math.floor(s)); const m=String(Math.floor(s/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }
function loadJSON(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
function saveJSON(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function getSettings(){ return loadJSON('plcv_settings', {sonido:true}); }
function beep(ok){
  if(!getSettings().sonido) return;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = ok ? 880 : 220;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.22 : 0.4));
    o.start(t); o.stop(t + (ok ? 0.22 : 0.4));
  }catch(e){}
}

/* ---------- capa de datos (banco + ediciones) ---------- */
const baseQuestions = window.PREGUNTAS || [];
const baseKey = q => (q.key) ? q.key : (q.t + '-' + q.n);

function getOverrides(){ return loadJSON(LS_OVERRIDES, {}); }
function setOverrides(o){ saveJSON(LS_OVERRIDES, o); }

function getQuestions(){
  const ov = getOverrides();
  const list = []; const seen = new Set();
  baseQuestions.forEach((b, i)=>{
    const k = baseKey(b);
    if(ov[k] === null) return;               // eliminada
    const q = Object.assign({}, b, ov[k] || {});
    q.key = k; q._idx = i; list.push(q); seen.add(k);
  });
  Object.keys(ov).forEach(k=>{
    if(k.indexOf('c-')===0 && ov[k] && !seen.has(k)){
      list.push(Object.assign({key:k}, ov[k]));
    }
  });
  return list;
}
function getQuestionMap(){ const m={}; getQuestions().forEach(q=>m[q.key]=q); return m; }

/* ---------- progreso ---------- */
function getProgress(){ return loadJSON(LS_PROGRESS, {historial:[]}); }
function setProgress(p){ saveJSON(LS_PROGRESS, p); }
function recordAnswer(q, userAnswer){
  const p = getProgress();
  p.historial = p.historial || [];
  p.historial.push({key:q.key, t:q.t, n:q.n, user:userAnswer, correct:(userAnswer===q.r), date:Date.now()});
  // limitar historial a 20000 entradas
  if(p.historial.length>20000) p.historial = p.historial.slice(-20000);
  setProgress(p);
}
function recordNota(r){
  const h = loadJSON('plcv_historial', []);
  h.push(r);
  if(h.length>500) h = h.slice(-500);
  saveJSON('plcv_historial', h);
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0,0);
}
function goHome(){ renderHome(); show('screen-home'); }

/* ============================================================
   INICIO
   ============================================================ */
function renderHome(){
  const qs = getQuestions();
  const p = getProgress();
  const hist = p.historial || [];
  const total = qs.length;
  const aciertos = hist.filter(h=>h.correct).length;
  const fallos = hist.filter(h=>!h.correct).length;
  const temas = new Set(qs.map(q=>q.t)).size;
  $('homeStats').innerHTML = `
    <div class="stat"><b>${total}</b><span>preguntas</span></div>
    <div class="stat"><b>${temas}</b><span>temas</span></div>
    <div class="stat"><b>${aciertos}</b><span>aciertos</span></div>
    <div class="stat"><b>${fallos}</b><span>fallos</span></div>`;
}

/* ============================================================
   CONFIGURACIÓN (mini / por tema)
   ============================================================ */
let cfgMode = 'mini';
let lastSpec = null; // {tema, count, timerSeconds, label}
function fillTemaSelect(sel, allLabel){
  let h = allLabel ? `<option value="all">${allLabel}</option>` : '';
  for(let t=1;t<=20;t++) h += `<option value="${t}">Tema ${t}: ${esc(window.TEMAS[t]||'')}</option>`;
  sel.innerHTML = h;
}
function openConfig(mode){
  cfgMode = mode;
  const titles = {exam75:'Examen oficial', mini:'Mini examen', tema:'Examen por tema'};
  $('configTitle').textContent = titles[mode] || 'Configurar examen';
  fillTemaSelect($('cfgTema'), mode==='tema' ? '— Elige un tema —' : 'Todos los temas (mezclado)');
  if(mode==='exam75'){
    $('cfgCount').value = '75';
    $('cfgTimerMode').value = 'custom';
    $('cfgMinutes').value = 75;
  } else {
    $('cfgCount').value = '20';
    $('cfgTimerMode').value = 'auto';
  }
  $('cfgShuffle').checked = true;
  syncTimerWrap();
  show('screen-config');
}
function syncTimerWrap(){ $('cfgCustomWrap').hidden = $('cfgTimerMode').value !== 'custom'; }
function runSpec(spec){
  let qs = getQuestions();
  if(spec.tema!=='all') qs = qs.filter(q=>String(q.t)===spec.tema);
  if(qs.length===0){ alert('No hay preguntas disponibles.'); return; }
  const n = (spec.count==='all' || spec.count==null) ? qs.length : Math.min(parseInt(spec.count,10), qs.length);
  qs = shuffle(qs).slice(0,n);
  startExam({questions:qs, label:spec.label, timerSeconds:spec.timerSeconds});
}
function startConfigured(){
  const tema = $('cfgTema').value;
  const count = $('cfgCount').value;
  const shuffleQ = $('cfgShuffle').checked;
  if(cfgMode==='tema' && tema==='all'){ alert('Elige un tema concreto (o usa "Mini examen" para mezclar).'); return; }
  const mode = $('cfgTimerMode').value;
  let timerSeconds = null;
  if(mode==='auto'){
    const qs = getQuestions().filter(q=>tema==='all'||String(q.t)===tema);
    const n = count==='all' ? qs.length : Math.min(parseInt(count,10), qs.length);
    timerSeconds = n*60;
  } else if(mode==='custom'){
    const m = parseInt($('cfgMinutes').value,10);
    if(!m || m<1){ alert('Indica los minutos del cronómetro.'); return; }
    timerSeconds = m*60;
  }
  const label = cfgMode==='tema' ? `Tema ${tema}` : (cfgMode==='exam75' ? 'Examen oficial' : 'Mini examen');
  lastSpec = {tema, count: count==='all' ? 'all' : parseInt(count,10), timerSeconds, label};
  runSpec(lastSpec);
}
function startExam75(){ openConfig('exam75'); }

/* ============================================================
   EXAMEN
   ============================================================ */
let exam = null;
function startExam(cfg){
  exam = {
    label: cfg.label,
    questions: cfg.questions,
    answers: new Array(cfg.questions.length).fill(-1),
    flagged: new Set(),
    current: 0,
    timerSeconds: cfg.timerSeconds,
    remaining: cfg.timerSeconds,
    timerId: null,
  };
  show('screen-exam');
  $('examLabel').textContent = cfg.label + ' · ' + exam.questions.length + ' preguntas';
  $('btnFinish').textContent = 'Terminar';
  $('btnFinish').classList.remove('danger');
  if(exam.timerSeconds!=null) startTimer();
  renderExam();
}
function startTimer(){
  stopTimer();
  updateTimerDisplay();
  exam.timerId = setInterval(()=>{
    exam.remaining--;
    updateTimerDisplay();
    if(exam.remaining<=0) finishExam(true);
  }, 1000);
}
function stopTimer(){ if(exam && exam.timerId){ clearInterval(exam.timerId); exam.timerId=null; } }
function updateTimerDisplay(){
  const el = $('examTimer'); const pill = $('topbarTimer');
  if(exam.remaining==null){ el.textContent=''; pill.hidden=true; return; }
  el.textContent = fmtTime(exam.remaining);
  el.classList.toggle('low', exam.remaining<=60);
  pill.textContent = fmtTime(exam.remaining);
  pill.hidden = false;
  pill.classList.toggle('low', exam.remaining<=60);
}
function renderExam(){
  const q = exam.questions[exam.current];
  $('qTemaTag').textContent = 'Tema ' + q.t;
  $('qCounter').textContent = `Pregunta ${exam.current+1} de ${exam.questions.length}`;
  $('qEnunciado').textContent = q.e;
  const letters = ['A','B','C','D'];
  $('qOpciones').innerHTML = q.o.map((op,i)=>`
    <div class="opt ${exam.answers[exam.current]===i?'selected':''}" data-i="${i}">
      <div class="letter">${letters[i]}</div><div class="txt">${esc(op)}</div>
    </div>`).join('');
  $('qOpciones').querySelectorAll('.opt').forEach(el=>{
    el.onclick = ()=>{ exam.answers[exam.current] = parseInt(el.dataset.i,10); renderExam(); };
  });
  $('qFlag').checked = exam.flagged.has(exam.current);
  // progress bar
  const answered = exam.answers.filter(a=>a!==-1).length;
  $('progressBar').style.width = Math.round(answered/exam.questions.length*100)+'%';
  // navigator
  const nav = $('navigator');
  let h = '';
  exam.questions.forEach((qq,i)=>{
    const cls = [ exam.answers[i]!==-1?'answered':'', i===exam.current?'current':'', exam.flagged.has(i)?'flagged':'' ].join(' ');
    h += `<button class="${cls}" data-i="${i}">${i+1}</button>`;
  });
  nav.innerHTML = h;
  nav.querySelectorAll('button').forEach(b=>b.onclick=()=>{ exam.current=parseInt(b.dataset.i,10); renderExam(); });
  $('btnPrev').disabled = exam.current===0;
  $('btnNext').textContent = exam.current===exam.questions.length-1 ? 'Finalizar' : 'Siguiente →';
}
function examPrev(){ if(exam.current>0){ exam.current--; renderExam(); } }
function examNext(){
  if(exam.current < exam.questions.length-1){ exam.current++; renderExam(); }
  else finishExam(false);
}
function finishExam(byTime){
  stopTimer();
  $('topbarTimer').hidden = true;
  const qs = exam.questions;
  let aciertos=0, fallos=0, blanco=0;
  qs.forEach((q,i)=>{
    const u = exam.answers[i];
    if(u===-1) blanco++;
    else if(u===q.r) aciertos++;
    else fallos++;
  });
  const total = qs.length;
  const nota = aciertos - fallos*0.33;
  const nota10 = total ? (nota/total)*10 : 0;
  const used = exam.timerSeconds!=null ? exam.timerSeconds-exam.remaining : null;
  // guardar en progreso
  qs.forEach((q,i)=>{ if(exam.answers[i]!==-1) recordAnswer(q, exam.answers[i]); });
  recordNota({fecha:Date.now(), label:exam.label, total, aciertos, fallos, nota, nota10});
  renderResults({aciertos,fallos,blanco,total,nota,nota10,used,byTime,questions:qs,answers:exam.answers});
  exam = null;
}

/* ============================================================
   RESULTADOS
   ============================================================ */
let lastResults = null;
function renderResults(r){
  lastResults = r;
  show('screen-results');
  $('resultCards').innerHTML = `
    <div class="rcard"><b>${r.aciertos}</b><span>aciertos</span></div>
    <div class="rcard"><b>${r.fallos}</b><span>fallos</span></div>
    <div class="rcard"><b>${r.blanco}</b><span>en blanco</span></div>
    <div class="rcard"><b>${r.nota.toFixed(2)}</b><span>puntuación (A − 0,33·F)</span></div>`;
  const ok = r.nota10 >= CORTE;
  $('resultVerdict').className = 'verdict ' + (ok?'pass':'fail');
  $('resultVerdict').innerHTML = ok ? '✔ APROBADO' : '✘ SUSPENSO'
    + `<div style="font-size:14px;font-weight:500;margin-top:4px">Nota sobre 10: <b>${r.nota10.toFixed(2)}</b> · ${r.total} preguntas${r.used!=null?' · tiempo usado '+fmtTime(r.used):''}${r.byTime?' · ⏱ tiempo agotado':''}</div>`;
  $('reviewList').hidden = true;
  $('reviewList').innerHTML = '';
}
function renderReview(){
  if(!lastResults) return;
  const qs = lastResults.questions, answers = lastResults.answers;
  const letters = ['A','B','C','D'];
  let h = '';
  qs.forEach((q,i)=>{
    const u = answers[i];
    const ok = u===q.r;
    h += `<div class="rev-item">
      <div class="ri-head"><span class="tag">Tema ${q.t}</span>
        <span class="${ok?'ok':'ko'}">${u===-1?'— en blanco':(ok?'✔ Acierto':'✘ Fallo')}</span>
        ${u!==-1?`<span class="txt">Tu respuesta: ${letters[u]||'?'} · Correcta: ${letters[q.r]}</span>`:''}
      </div>
      <div class="q">${esc(q.e)}</div>
      ${q.o.map((op,j)=>`<div class="txt" style="${j===q.r?'color:#4ade80;font-weight:600':''}">${letters[j]}) ${esc(op)}</div>`).join('')}
      ${q.ex?`<div class="note" style="margin-top:8px;color:var(--text);font-size:13px;white-space:pre-wrap"><b>Explicación:</b> ${esc(q.ex)}</div>`:''}
      ${q.nota?`<div class="note" style="margin-top:8px;color:var(--muted);font-size:13px;white-space:pre-wrap">${esc(q.nota)}</div>`:''}
    </div>`;
  });
  $('reviewList').innerHTML = h;
  $('reviewList').hidden = false;
  show('screen-results');
}

/* ============================================================
   ENTRENAMIENTO
   ============================================================ */
let train = null;
function startTraining(){
  train = { mode:'training', questions: shuffle(getQuestions()), current: 0, locked: false };
  show('screen-training');
  renderTraining();
}
function startRepaso(){
  const qs = getQuestions().slice().sort((a,b)=> (a.t-b.t) || (a.n-b.n));
  const saved = loadJSON('plcv_repaso_pos', 0);
  let startAt = 0;
  if(saved>0 && saved<qs.length){
    startAt = confirm(`Tienes un repaso a medias. ¿Continuar desde la pregunta ${saved+1} de ${qs.length}?`) ? saved : 0;
  }
  train = { mode:'repaso', questions: qs, current: startAt, locked: false };
  show('screen-training');
  renderTraining();
}
function saveRepasoPos(){ if(train && train.mode==='repaso') saveJSON('plcv_repaso_pos', train.current); }
function renderTraining(){
  const q = train.questions[train.current];
  $('trLabel').textContent = train.mode==='repaso' ? '📖 Repaso del temario' : 'Modo entrenamiento';
  $('trTemaTag').textContent = 'Tema ' + q.t;
  $('trCounter').textContent = `Pregunta ${train.current+1} de ${train.questions.length}`;
  $('trProgress').style.width = Math.round((train.current+1)/train.questions.length*100)+'%';
  $('trEnunciado').textContent = q.e;
  const letters = ['A','B','C','D'];
  $('trOpciones').innerHTML = q.o.map((op,i)=>`
    <div class="opt" data-i="${i}"><div class="letter">${letters[i]}</div><div class="txt">${esc(op)}</div></div>`).join('');
  $('trOpciones').querySelectorAll('.opt').forEach(el=>{
    el.onclick = ()=>{ if(!train.locked) trainAnswer(parseInt(el.dataset.i,10)); };
  });
  $('trFeedback').hidden = true;
  $('trFeedback').innerHTML = '';
  $('trNext').disabled = true;
  $('trPrev').disabled = train.current===0;
}
function trainAnswer(i){
  train.locked = true;
  const q = train.questions[train.current];
  const ok = (i===q.r);
  beep(ok);
  const letters = ['A','B','C','D'];
  $('trOpciones').querySelectorAll('.opt').forEach(el=>{
    el.classList.add('disabled');
    const idx = parseInt(el.dataset.i,10);
    if(idx===q.r) el.classList.add('correct');
    else if(idx===i) el.classList.add('wrong');
  });
  const fb = $('trFeedback');
  fb.hidden = false;
  fb.className = 'feedback ' + (ok?'ok':'no');
  fb.innerHTML = (ok ? '✔ ¡Correcto!' : `✘ Incorrecto. La respuesta correcta es la ${letters[q.r]}.`)
    + (q.ex ? `<div class="note"><b>Explicación:</b> ${esc(q.ex)}</div>` : '')
    + (q.nota ? `<div class="note"><b>Nota:</b> ${esc(q.nota)}</div>` : '');
  recordAnswer(q, i);
  saveRepasoPos();
  $('trNext').disabled = false;
}
function trainNext(){
  if(train.current < train.questions.length-1){ train.current++; train.locked=false; saveRepasoPos(); renderTraining(); }
  else {
    if(train.mode==='repaso'){ saveJSON('plcv_repaso_pos', 0); alert('🎉 ¡Has completado el repaso de todo el temario!'); }
    else alert('¡Has terminado el recorrido de entrenamiento!');
    train=null; goHome();
  }
}

/* ============================================================
   LISTADOS (fallos / más fallo)
   ============================================================ */
function showFallos(){
  const map = getQuestionMap();
  const hist = (getProgress().historial||[]).slice().reverse();
  const seen = new Set();
  const fallos = [];
  hist.forEach(h=>{
    if(h.correct || seen.has(h.key)) return;
    seen.add(h.key);
    const q = map[h.key];
    if(q) fallos.push(q);
  });
  $('listTitle').textContent = 'Repasar fallos';
  $('listControls').innerHTML = fallos.length ? `${fallos.length} preguntas falladas` : 'No tienes fallos registrados. ¡Bien!';
  $('listContent').innerHTML = fallos.length ? fallos.map(liHTML).join('') : '';
  show('screen-list');
}
function showMasFallo(){
  const map = getQuestionMap();
  const hist = getProgress().historial||[];
  const count = {};
  hist.forEach(h=>{ if(!h.correct) count[h.key]=(count[h.key]||0)+1; });
  const arr = Object.keys(count).map(k=>({key:k, n:count[k], q:map[k]})).filter(x=>x.q).sort((a,b)=>b.n-a.n);
  $('listTitle').textContent = 'Las que más fallo';
  $('listControls').innerHTML = arr.length ? 'Ordenadas por número de fallos' : 'Sin datos todavía.';
  $('listContent').innerHTML = arr.slice(0,200).map(x=>`
    <div class="list-item" data-key="${esc(x.key)}">
      <div class="li-top"><span class="tag">Tema ${x.q.t}</span><span class="li-bad">${x.n} fallo${x.n>1?'s':''}</span></div>
      <div class="li-q">${esc(x.q.e)}</div>
    </div>`).join('');
  show('screen-list');
}
function showStatsTema(){
  const hist = getProgress().historial || [];
  const byT = {};
  for(let t=1;t<=20;t++) byT[t] = {t, a:0, f:0};
  hist.forEach(h=>{ const b = byT[h.t]; if(b){ if(h.correct) b.a++; else b.f++; } });
  const rows = Object.values(byT).filter(b=>b.a+b.f>0).sort((a,b)=>(b.a+b.f)-(a.a+a.f));
  $('listTitle').textContent = 'Estadísticas por tema';
  $('listControls').innerHTML = rows.length ? 'Porcentaje de aciertos por tema' : 'Sin datos todavía: haz exámenes o entrenamiento.';
  $('listContent').innerHTML = rows.map(b=>{
    const tot = b.a+b.f, pct = tot ? Math.round(b.a/tot*100) : 0;
    return `<div class="list-item">
      <div class="li-top"><span class="tag">Tema ${b.t}</span><span>${b.a}/${tot} · ${pct}% aciertos</span></div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
  show('screen-list');
}
function showHistorial(){
  const hist = loadJSON('plcv_historial', []);
  const n = hist.length;
  const avg = n ? hist.reduce((s,x)=>s+x.nota10,0)/n : 0;
  const best = n ? Math.max.apply(null, hist.map(x=>x.nota10)) : 0;
  const aprob = hist.filter(x=>x.nota10>=CORTE).length;
  $('histSummary').innerHTML = `
    <div class="stat"><b>${n}</b><span>exámenes</span></div>
    <div class="stat"><b>${avg.toFixed(2)}</b><span>nota media</span></div>
    <div class="stat"><b>${best.toFixed(2)}</b><span>mejor nota</span></div>
    <div class="stat"><b>${aprob}</b><span>aprobados</span></div>`;
  $('histContent').innerHTML = n ? hist.slice().reverse().map(x=>{
    const d = new Date(x.fecha);
    const ds = d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    return `<div class="list-item">
      <div class="li-top"><span class="tag">${esc(x.label||'Examen')}</span><span>${ds}</span></div>
      <div class="li-q">${x.aciertos}/${x.total} aciertos · ${x.fallos} fallos · <b>nota ${x.nota10.toFixed(2)}</b></div>
      <div class="bar"><div class="bar-fill ${x.nota10>=CORTE?'good':'bad'}" style="width:${Math.min(100,Math.max(0,x.nota10*10))}%"></div></div>
    </div>`;
  }).join('') : '<p class="hint">Todavía no has hecho ningún examen. Haz uno y aquí verás tu evolución.</p>';
  show('screen-historial');
}
function liHTML(q){
  return `<div class="list-item" data-key="${esc(q.key)}">
    <div class="li-top"><span class="tag">Tema ${q.t}</span></div>
    <div class="li-q">${esc(q.e)}</div>
  </div>`;
}
function openListQuestion(key){
  const map = getQuestionMap();
  const q = map[key];
  if(!q) return;
  // abrir en entrenamiento directo
  train = { questions: [q], current: 0, locked:false };
  show('screen-training');
  renderTraining();
}

/* ============================================================
   SINCRONIZACIÓN / DATOS
   ============================================================ */
function exportJSON(filename, data){
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function bindImport(inputEl, handler){
  inputEl.onchange = (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=> handler(r.result);
    r.readAsText(f);
    inputEl.value='';
  };
}

/* ============================================================
   EDITOR
   ============================================================ */
let editingKey = null;
function renderEditor(){
  fillTemaSelect($('edTema'), null);
  // rebuild edTema with "all" first
  let h = '<option value="all">Todos los temas</option>';
  for(let t=1;t<=20;t++) h += `<option value="${t}">Tema ${t}</option>`;
  $('edTema').innerHTML = h;
  fillEditorList();
}
function fillEditorList(){
  const tema = $('edTema').value, search = ($('edSearch').value||'').toLowerCase();
  let qs = getQuestions();
  if(tema!=='all') qs = qs.filter(q=>String(q.t)===tema);
  if(search) qs = qs.filter(q=>q.e.toLowerCase().includes(search));
  const letters = ['A','B','C','D'];
  $('edList').innerHTML = qs.slice(0,300).map(q=>`
    <div class="list-item" data-key="${esc(q.key)}">
      <div class="li-top"><span class="tag">Tema ${q.t}</span><span class="li-tema">Resp. ${letters[q.r]}</span></div>
      <div class="li-q">${esc(q.e.slice(0,120))}${q.e.length>120?'…':''}</div>
    </div>`).join('');
  $('edList').querySelectorAll('.list-item').forEach(el=>el.onclick=()=>openEditor(el.dataset.key));
}
function openEditor(key){
  editingKey = key;
  const q = key ? (getQuestionMap()[key] || null) : null;
  $('modalTitle').textContent = q ? 'Editar pregunta' : 'Nueva pregunta';
  fillTemaSelect($('edFieldTema'), null);
  if(q){
    $('edFieldTema').value = String(q.t);
    $('edFieldEnunciado').value = q.e||'';
    $('edFieldA').value = (q.o&&q.o[0])||'';
    $('edFieldB').value = (q.o&&q.o[1])||'';
    $('edFieldC').value = (q.o&&q.o[2])||'';
    $('edFieldD').value = (q.o&&q.o[3])||'';
    $('edFieldRespuesta').value = String(q.r);
    $('edFieldEx').value = q.ex||'';
    $('edFieldNota').value = q.nota||'';
    $('btnDeleteQuestion').hidden = false;
  } else {
    $('edFieldTema').value = '1';
    $('edFieldEnunciado').value = '';
    $('edFieldA').value=$('edFieldB').value=$('edFieldC').value=$('edFieldD').value='';
    $('edFieldRespuesta').value = '0';
    $('edFieldEx').value = '';
    $('edFieldNota').value = '';
    $('btnDeleteQuestion').hidden = true;
  }
  $('modal').hidden = false;
}
function saveEditor(){
  const tema = parseInt($('edFieldTema').value,10)||1;
  const e = $('edFieldEnunciado').value.trim();
  if(!e){ alert('Escribe el enunciado.'); return; }
  const o = [$('edFieldA').value.trim(), $('edFieldB').value.trim(), $('edFieldC').value.trim(), $('edFieldD').value.trim()];
  const r = parseInt($('edFieldRespuesta').value,10);
  const ex = $('edFieldEx').value.trim();
  const nota = $('edFieldNota').value.trim();
  const ov = getOverrides();
  let key = editingKey;
  if(!key){
    key = 'c-' + Date.now() + '-' + Math.floor(Math.random()*1000);
  }
  ov[key] = {t:tema, n:(key.indexOf('c-')===0?null:parseInt(key.split('-')[1],10)), e, o, r, ex, nota};
  setOverrides(ov);
  closeModal();
  fillEditorList();
  renderHome();
}
function deleteEditor(){
  if(!editingKey){ return; }
  if(!confirm('¿Eliminar esta pregunta?')) return;
  const ov = getOverrides();
  if(editingKey.indexOf('c-')===0) delete ov[editingKey];
  else ov[editingKey] = null;
  setOverrides(ov);
  closeModal();
  fillEditorList();
  renderHome();
}
function closeModal(){ $('modal').hidden = true; editingKey = null; }

/* ============================================================
   EVENTOS
   ============================================================ */
function bind(){
  $('btnHome').onclick = goHome;
  document.querySelectorAll('[data-action="home"]').forEach(b=>b.onclick=goHome);
  document.querySelectorAll('.menu-btn').forEach(b=>{
    b.onclick = ()=>{
      const a = b.dataset.action;
      if(a==='exam75') startExam75();
      else if(a==='mini') openConfig('mini');
      else if(a==='tema') openConfig('tema');
      else if(a==='training') startTraining();
      else if(a==='repaso') startRepaso();
      else if(a==='fallos') showFallos();
      else if(a==='masfallo') showMasFallo();
      else if(a==='statstema') showStatsTema();
      else if(a==='historial') showHistorial();
      else if(a==='editor'){ renderEditor(); show('screen-editor'); }
      else if(a==='sync') show('screen-sync');
    };
  });
  // config
  $('cfgStart').onclick = startConfigured;
  $('cfgTimerMode').onchange = syncTimerWrap;
  // exam
  $('btnPrev').onclick = examPrev;
  $('btnNext').onclick = examNext;
  $('btnFinish').onclick = ()=>{ if(confirm('¿Terminar el examen ahora?')) finishExam(false); };
  $('qFlag').onchange = (e)=>{ if(exam){ if(e.target.checked) exam.flagged.add(exam.current); else exam.flagged.delete(exam.current); } };
  // training
  $('trPrev').onclick = ()=>{ if(train.current>0){ train.current--; train.locked=false; saveRepasoPos(); renderTraining(); } };
  $('trNext').onclick = trainNext;
  // results
  $('btnReview').onclick = renderReview;
  $('btnRetry').onclick = ()=>{ if(lastSpec){ runSpec(lastSpec); } else { goHome(); } };
  // list
  $('listContent').addEventListener('click', e=>{ const it = e.target.closest('.list-item'); if(it) openListQuestion(it.dataset.key); });
  // sync
  $('btnExportProgress').onclick = ()=> exportJSON('progreso.json', getProgress());
  $('btnImportProgress').onclick = ()=> $('fileProgress').click();
  bindImport($('fileProgress'), txt=>{
    try{ setProgress(JSON.parse(txt)); alert('Progreso importado.'); renderHome(); }
    catch(e){ alert('Archivo no válido.'); }
  });
  $('btnExportBank').onclick = ()=> exportJSON('banco_preguntas.json', getQuestions());
  $('btnImportBank').onclick = ()=> $('fileBank').click();
  bindImport($('fileBank'), txt=>{
    try{
      const arr = JSON.parse(txt);
      if(!Array.isArray(arr)) throw 0;
      const ov = {};
      arr.forEach(q=>{ if(q.key) ov[q.key] = {t:q.t,n:q.n,e:q.e,o:q.o,r:q.r,nota:q.nota||''}; });
      setOverrides(ov);
      alert('Banco importado ('+arr.length+' preguntas).');
      renderHome();
    }catch(e){ alert('Archivo no válido.'); }
  });
  $('btnResetProgress').onclick = ()=>{ if(confirm('¿Borrar todo el progreso?')){ setProgress({historial:[]}); renderHome(); } };
  $('cfgSonido').checked = getSettings().sonido;
  $('cfgSonido').onchange = (e)=>{ const s = getSettings(); s.sonido = e.target.checked; saveJSON('plcv_settings', s); };
  // editor
  $('edTema').onchange = fillEditorList;
  $('edSearch').oninput = fillEditorList;
  $('btnNewQuestion').onclick = ()=> openEditor(null);
  $('btnSaveQuestion').onclick = saveEditor;
  $('btnDeleteQuestion').onclick = deleteEditor;
  $('btnCancelQuestion').onclick = closeModal;
  $('modal').addEventListener('click', e=>{ if(e.target.id==='modal') closeModal(); });
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  bind();
  renderHome();
});
