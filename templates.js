// EndORL — Modelos de relatório editáveis (texto normal, campos, achados frequentes, conclusão, texto livre).
// Os modelos alterados ficam na pasta dos exames (_config/modelos.json), partilhados por todos os postos que usam a mesma
// pasta; na versão browser ficam nas definições. Os modelos originais continuam no código (EXAMS_DEFAULT / FREE_DEFAULT).
'use strict';

let TPL = {}; // alterações aos modelos: {exame: {title, technique, conclusion, free, fields:[{k,label,def,opts}]}} ou {deleted:true}
const OTHER_TYPES = ['Otoscopia', 'Endoscopia', 'Documentação fotográfica', 'Outro'];

async function loadTemplates() {
  let ov = null;
  if (FS) { try { ov = await FS.readJSON('_config/modelos.json'); } catch { ov = null; } }
  else ov = settings.templates || null;
  applyTemplates(ov || {});
}
function applyTemplates(ov) {
  TPL = ov;
  EXAMS = structuredClone(EXAMS_DEFAULT); FREE = {...FREE_DEFAULT};
  for (const [k, t] of Object.entries(ov)) {
    if (t.deleted) { delete EXAMS[k]; delete FREE[k]; continue; }
    EXAMS[k] = {title: t.title || k, technique: t.technique || '', conclusion: t.conclusion || '', fees: !!EXAMS_DEFAULT[k]?.fees,
      fields: (t.fields || []).map(f => [f.k, f.label, f.def || '', f.opts || []])};
    FREE[k] = t.free || '';
  }
  // tipos de exame disponíveis ao criar uma sessão
  const types = [...new Set([...Object.keys(EXAMS), ...OTHER_TYPES])];
  const s = $('#sesDlg [name=type]'), cur = s.value;
  s.innerHTML = types.map(t => `<option>${esc(t)}</option>`).join('');
  if (types.includes(cur)) s.value = cur;
}
async function saveTemplates(ov) {
  if (FS) await FS.writeJSON('_config/modelos.json', ov);
  else { settings.templates = ov; saveSettings(); }
  applyTemplates(ov);
}

// ---------- Editor ----------
let tplCur = null, tplWork = null;
const tplOf = k => { const E = EXAMS[k]; return {title: E.title, technique: E.technique, conclusion: E.conclusion, free: FREE[k] || '', fields: E.fields.map(([k2, label, def, opts]) => ({k: k2, label, def, opts: [...opts]}))}; };
function tplOpen() {
  tplCur = Object.keys(EXAMS)[0];
  tplRenderList(); tplLoad(tplCur);
  $('#tplDlg').showModal();
}
function tplRenderList() {
  $('#tplExam').innerHTML = Object.keys(EXAMS).map(k => `<option ${k === tplCur ? 'selected' : ''}>${esc(k)}</option>`).join('');
}
function tplLoad(k) {
  tplCur = k; tplWork = tplOf(k);
  const builtin = !!EXAMS_DEFAULT[k];
  $('#tplReset').hidden = !builtin || !TPL[k]; $('#tplDelete').hidden = builtin;
  $('#tplState').textContent = TPL[k] ? (builtin ? 'Modelo alterado (o original pode ser reposto).' : 'Modelo criado no serviço.') : 'Modelo original.';
  tplRender();
}
function tplRender() {
  const w = tplWork;
  $('#tplTitle').value = w.title; $('#tplTech').value = w.technique; $('#tplConc').value = w.conclusion; $('#tplFree').value = w.free;
  $('#tplFields').innerHTML = w.fields.map((f, i) => `<div class="tplf" data-i="${i}">
    <div class="row" style="flex-wrap:nowrap"><input data-x="label" value="${esc(f.label)}" placeholder="Nome do campo" style="font-weight:600">
      <button type="button" class="ghost icon" data-mv="-1" title="Subir">↑</button><button type="button" class="ghost icon" data-mv="1" title="Descer">↓</button>
      <button type="button" class="ghost icon" data-rm title="Apagar campo">✕</button></div>
    <label>Texto normal<textarea data-x="def" rows="2">${esc(f.def)}</textarea></label>
    <label>Achados frequentes (um por linha)<textarea data-x="opts" rows="3">${esc(f.opts.join('\n'))}</textarea></label></div>`).join('')
    || '<p class="muted">Sem campos. O relatório estruturado fica só com técnica e conclusão.</p>';
}
function tplRead() {
  const w = tplWork;
  w.title = $('#tplTitle').value.trim() || tplCur; w.technique = $('#tplTech').value; w.conclusion = $('#tplConc').value; w.free = $('#tplFree').value;
  document.querySelectorAll('#tplFields .tplf').forEach(d => {
    const f = w.fields[+d.dataset.i], g = x => d.querySelector(`[data-x="${x}"]`).value;
    f.label = g('label').trim() || 'Campo'; f.def = g('def'); f.opts = g('opts').split('\n').map(s => s.trim()).filter(Boolean);
  });
}
$('#tplFields').onclick = e => {
  const d = e.target.closest('.tplf'); if (!d) return;
  tplRead(); const i = +d.dataset.i, F = tplWork.fields;
  if (e.target.dataset.mv) { const j = i + +e.target.dataset.mv; if (j >= 0 && j < F.length) [F[i], F[j]] = [F[j], F[i]]; }
  if ('rm' in e.target.dataset && confirm(`Apagar o campo "${F[i].label}" deste modelo?`)) F.splice(i, 1);
  tplRender();
};
$('#tplAddField').onclick = () => { tplRead(); tplWork.fields.push({k: 'c' + Date.now().toString(36), label: 'Novo campo', def: '', opts: []}); tplRender(); };
$('#tplExam').onchange = () => { tplLoad($('#tplExam').value); };
$('#tplSave').onclick = async () => {
  tplRead();
  await saveTemplates({...TPL, [tplCur]: structuredClone(tplWork)});
  tplRenderList(); tplLoad(tplCur);
  $('#tplState').textContent = '✔ Modelo guardado' + (FS ? ' (na pasta dos exames — vale para todos os postos que a usam).' : '.');
};
$('#tplNew').onclick = async () => {
  const name = await askText('Nome do novo tipo de exame (ex.: Otoscopia, Nasofibroscopia pediátrica):'); if (!name?.trim()) return;
  const k = name.trim(); if (EXAMS[k]) return alert('Já existe um modelo com esse nome.');
  await saveTemplates({...TPL, [k]: {title: k, technique: '', conclusion: '', free: '', fields: [{k: 'c1', label: 'Descrição', def: '', opts: []}]}});
  tplCur = k; tplRenderList(); tplLoad(k);
};
$('#tplReset').onclick = async () => {
  if (!confirm(`Repor o modelo original de "${tplCur}"? As alterações feitas a este modelo perdem-se (os relatórios já feitos não mudam).`)) return;
  const ov = {...TPL}; delete ov[tplCur]; await saveTemplates(ov); tplLoad(tplCur);
};
$('#tplDelete').onclick = async () => {
  if (!confirm(`Apagar o modelo "${tplCur}"? Os exames e relatórios já feitos não são apagados.`)) return;
  const ov = {...TPL}; delete ov[tplCur]; await saveTemplates(ov);
  tplCur = Object.keys(EXAMS)[0]; tplRenderList(); tplLoad(tplCur);
};
$('#tplClose').onclick = () => $('#tplDlg').close();
$('#btnTemplates').onclick = tplOpen;
