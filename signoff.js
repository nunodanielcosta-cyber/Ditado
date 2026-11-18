// EndORL — Finalizar e assinar relatórios.
// Um relatório finalizado recebe um número (ORL-AAAA-NNNN), fica bloqueado, regista quem o assinou e quando, e um código
// de verificação (resumo SHA-256 do conteúdo). Para o alterar é preciso "Reabrir": cria-se uma nova versão e a anterior
// fica guardada no histórico. Cada ação fica no registo da sessão.
// Nota: isto não é uma assinatura digital qualificada (ex.: Cartão de Cidadão / Chave Móvel Digital).
'use strict';

settings.signatures ||= {};
const isFinal = r => r?.status === 'final';

async function reportCode(r) {
  const {history, status, code, signedAt, signedBy, number, updated, ...content} = r;
  const txt = JSON.stringify(content);
  let hex;
  if (crypto?.subtle) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    hex = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  } else { let h = 2166136261; for (const c of txt) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; hex = h.toString(16).padStart(8, '0'); }
  return hex.slice(0, 12).toUpperCase().replace(/(.{4})(?!$)/g, '$1-');
}
async function nextReportNumber() {
  const year = new Date().getFullYear(), pre = `ORL-${year}-`;
  let max = 0;
  for (const s of await DB.all('sessions')) for (const r of [s.report, ...(s.report?.history || [])]) {
    if (r?.number?.startsWith(pre)) max = Math.max(max, +r.number.slice(pre.length) || 0);
  }
  // contador guardado (na pasta dos exames, partilhado pelos postos): os números de exames apagados não se repetem
  let cnt = {};
  try { cnt = (FS ? await FS.readJSON('_config/contador.json') : settings.reportCounter) || {}; } catch {}
  const n = Math.max(max, cnt[year] || 0) + 1;
  cnt[year] = n;
  if (FS) await FS.writeJSON('_config/contador.json', cnt); else { settings.reportCounter = cnt; saveSettings(); }
  return pre + String(n).padStart(4, '0');
}
function sessionLog(action) { (curSes.log ||= []).push({t: Date.now(), action, by: rep?.physician || ''}); }

// Aplicar o estado (rascunho / finalizado) ao editor
function signoffApply() {
  const fin = isFinal(rep);
  $('#repDlg').classList.toggle('locked', fin);
  $('#repDlg').querySelectorAll('.cols input, .cols textarea, .cols select, #repExam, #repPhys, #repDate, #repMode button, #repReset').forEach(el => el.disabled = fin);
  $('#repFinal').hidden = fin; $('#repReopen').hidden = !fin; $('#repSave').hidden = fin;
  const b = $('#repBanner');
  if (fin) { b.hidden = false; b.className = 'banner ok'; b.innerHTML = `<b>Relatório finalizado n.º ${esc(rep.number)}</b> (versão ${rep.version || 1}) — assinado por ${esc(rep.signedBy)} em ${fmtDT(rep.signedAt)} · código ${esc(rep.code)}. Para alterar, use "Reabrir".`; }
  else if ((rep.version || 1) > 1) { b.hidden = false; b.className = 'banner warn'; b.innerHTML = `Rascunho da <b>versão ${rep.version}</b> do relatório n.º ${esc(rep.history?.at(-1)?.number || '')} — a versão anterior continua guardada no histórico.`; }
  else b.hidden = true;
}
$('#repFinal').onclick = async () => {
  readReportForm();
  if (!rep.physician) return alert('Escolha o médico que assina o relatório.');
  if (!rep.conclusion.trim() && !confirm('O relatório não tem conclusão. Finalizar mesmo assim?')) return;
  if (!confirm(`Finalizar e assinar o relatório como ${rep.physician}?\n\nDepois de finalizado o relatório fica bloqueado; para o alterar será preciso criar uma nova versão.`)) return;
  const E = EXAMS[rep.exam];
  rep.tpl = {title: E.title, fields: E.fields.map(([k, label]) => [k, label])}; // os nomes dos campos ficam fixos neste relatório
  rep.number = rep.history?.at(-1)?.number || await nextReportNumber(); // as novas versões mantêm o número
  rep.status = 'final'; rep.signedBy = rep.physician; rep.signedAt = Date.now(); rep.version ||= 1;
  rep.code = await reportCode(rep);
  sessionLog(`Relatório ${rep.number} v${rep.version} finalizado`);
  curSes.report = structuredClone(rep); await DB.put('sessions', curSes); await loadSessions();
  signoffApply();
  // guardar logo o PDF final (na versão de computador fica na pasta do exame)
  if (window.desktop?.savePDF) $('#repPdf').click();
};
$('#repReopen').onclick = async () => {
  const why = await askText(`Reabrir o relatório n.º ${rep.number} para alteração.\nA versão ${rep.version || 1} fica guardada no histórico e é criada a versão ${(rep.version || 1) + 1}.\n\nMotivo da alteração:`);
  if (why === null) return;
  const {history = [], ...prev} = rep;
  rep = {...structuredClone(prev), history: [...history, prev], status: 'draft', version: (prev.version || 1) + 1, reason: why, code: '', signedAt: 0, signedBy: ''};
  sessionLog(`Relatório ${prev.number} reaberto (versão ${rep.version}): ${why}`);
  curSes.report = structuredClone(rep); await DB.put('sessions', curSes); await loadSessions();
  signoffApply();
};

// Rodapé do relatório impresso
function signoffPrintHTML() {
  const sig = settings.signatures[rep.signedBy || rep.physician];
  if (!isFinal(rep)) return `<div class="rep-sign"><div>${esc(rep.physician)}</div></div>`;
  return `<div class="rep-sign"><div>${sig ? `<img src="${sig}" class="sigimg">` : ''}${esc(rep.signedBy)}</div></div>
    <div class="rep-foot">Relatório n.º ${esc(rep.number)} · versão ${rep.version || 1}${rep.version > 1 ? ` (substitui a versão ${rep.version - 1}${rep.reason ? ' — ' + esc(rep.reason) : ''})` : ''} · finalizado por ${esc(rep.signedBy)} em ${fmtDT(rep.signedAt)} · código de verificação ${esc(rep.code)}</div>`;
}

// ---------- Assinaturas digitalizadas (Definições) ----------
function sigRender() {
  const sel = $('#sigWho'); sel.innerHTML = settings.physicians.map(p => `<option>${esc(p)}</option>`).join('');
  sigShow();
}
function sigShow() {
  const s = settings.signatures[$('#sigWho').value];
  $('#sigPrev').innerHTML = s ? `<img src="${s}" style="max-height:44px;background:#fff;border-radius:4px">` : '<span class="muted" style="font-size:12px">sem assinatura</span>';
}
$('#sigWho').onchange = sigShow;
$('#sigFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const img = await createImageBitmap(f), k = Math.min(1, 500 / img.width), c = document.createElement('canvas');
  c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  settings.signatures[$('#sigWho').value] = c.toDataURL('image/png'); saveSettings(); sigShow(); e.target.value = '';
};
$('#sigDel').onclick = () => { delete settings.signatures[$('#sigWho').value]; saveSettings(); sigShow(); };

// ---------- Relatórios para enviar (pasta "EndORL - Relatórios para enviar" no ambiente de trabalho) ----------
function outMeta() {
  if (!isFinal(rep)) return null;
  return {pid: curPat.pid || 'sem-processo', surname: curPat.surname, given: curPat.given, examDate: rep.date, exam: rep.exam,
    number: rep.number, version: rep.version || 1, reason: rep.reason || '', signedAt: fmtDT(rep.signedAt)};
}
async function outRefresh() {
  if (!window.desktop?.outStatus) return;
  const st = await window.desktop.outStatus();
  $('#btnOut').hidden = false; $('#outCount').textContent = st.files.length; $('#btnOut').classList.toggle('has', st.files.length > 0);
  return st;
}
$('#btnOut').onclick = async () => {
  const st = await outRefresh();
  const drafts = (await DB.all('sessions')).filter(s => s.report && s.report.status !== 'final');
  $('#outInfo').innerHTML = (st.files.length ? `<b>${st.files.length}</b> relatório(s) finalizado(s) à espera de envio:<ul style="max-height:180px;overflow:auto;margin:6px 0;padding-left:18px;font-size:12px">${st.files.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
    : 'Não há relatórios à espera de envio.') +
    (drafts.length ? `<div class="banner warn" style="padding:6px 10px;border-radius:8px;margin-top:6px">⚠ Há <b>${drafts.length}</b> relatório(s) em rascunho (não finalizados) — só os finalizados são enviados.</div>` : '');
  $('#outArch').disabled = !st.files.length;
  $('#outDlg').showModal();
};
$('#outOpen').onclick = () => window.desktop.outOpen();
$('#outArch').onclick = async () => {
  if (!confirm('Confirma que JÁ COPIOU todos os ficheiros da pasta para a pen?\n\nOs ficheiros vão passar para a subpasta "Enviados" e deixam de aparecer como "para enviar".')) return;
  const n = await window.desktop.outArchive();
  await outRefresh(); $('#outDlg').close();
  alert(`${n} relatório(s) arquivado(s) como enviados.`);
};
scriptsLoaded.then(outRefresh);
