// EndORL — Videoendoscopia da deglutição (FEES): parâmetros a preencher no relatório.
// Escalas: PAS (Rosenbek et al., 1996), Yale Pharyngeal Residue Severity Rating Scale (Neubauer et al., 2015),
// escala de secreções de Murray (1996), IDDSI (consistências) e FOIS (Crary et al., 2005).
'use strict';

const FEES = {
  velo: ['Competente', 'Insuficiente', 'Não avaliado'],
  murray: ['0 — Sem secreções ou secreções transitórias fora do vestíbulo', '1 — Secreções nas valéculas / seios piriformes, fora do vestíbulo',
    '2 — Secreções transitórias no vestíbulo laríngeo', '3 — Secreções acumuladas no vestíbulo laríngeo'],
  sens: ['Presente', 'Diminuída', 'Ausente', 'Não avaliada'],
  mob: ['Normal e simétrica', 'Paresia / paralisia da prega vocal direita', 'Paresia / paralisia da prega vocal esquerda', 'Paresia / paralisia bilateral'],
  cough: ['Eficaz', 'Fraca', 'Ausente', 'Não avaliada'],
  iddsi: ['IDDSI 0 — Líquido fino', 'IDDSI 1 — Ligeiramente espesso', 'IDDSI 2 — Levemente espesso', 'IDDSI 3 — Moderadamente espesso / liquidificado',
    'IDDSI 4 — Extremamente espesso / pastoso (puré)', 'IDDSI 5 — Picado e húmido', 'IDDSI 6 — Macio e em pedaços pequenos', 'IDDSI 7 — Normal (sólido)'],
  spill: ['Não', 'Até às valéculas', 'Até aos seios piriformes', 'Até ao vestíbulo laríngeo'],
  pas: ['1 — Não entra na via aérea', '2 — Entra na via aérea, fica acima das pregas vocais e é expelido', '3 — Entra na via aérea, fica acima das pregas vocais e não é expelido',
    '4 — Contacta as pregas vocais e é expelido', '5 — Contacta as pregas vocais e não é expelido', '6 — Passa abaixo das pregas vocais e é expelido',
    '7 — Passa abaixo das pregas vocais e não é expelido apesar do esforço', '8 — Passa abaixo das pregas vocais sem esforço para o expelir (aspiração silenciosa)'],
  yale: ['Nenhum', 'Vestigial', 'Ligeiro', 'Moderado', 'Grave'],
  react: ['Não aplicável', 'Tosse eficaz', 'Tosse ineficaz', 'Sem tosse (silenciosa)'],
  fois: ['1 — Nada por via oral', '2 — Dependente de sonda; tentativas mínimas por via oral', '3 — Dependente de sonda, com ingestão oral consistente',
    '4 — Dieta oral total de consistência única', '5 — Dieta oral total, várias consistências, com preparação especial ou compensações',
    '6 — Dieta oral total, várias consistências, sem preparação especial mas com restrições', '7 — Dieta oral total sem restrições'],
};
const feesDefault = () => ({
  velo: 0, murray: 0, sens: 0, mob: 0, cough: 0,
  bolus: [
    {c: 0, vol: '5 ml', spill: 0, pas: 0, rv: 0, rp: 0, react: 0, obs: ''},
    {c: 0, vol: '10 ml', spill: 0, pas: 0, rv: 0, rp: 0, react: 0, obs: ''},
    {c: 4, vol: '5 ml', spill: 0, pas: 0, rv: 0, rp: 0, react: 0, obs: ''},
    {c: 7, vol: '1/4 bolacha', spill: 0, pas: 0, rv: 0, rp: 0, react: 0, obs: ''},
  ],
  fois: 6, dietS: 7, dietL: 0,
});
const sel = (name, opts, v, attrs = '') => `<select data-f="${name}" ${attrs}>${opts.map((o, i) => `<option value="${i}" ${+v === i ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
const short = s => s.split(' — ')[0];

function feesFill(rep) {
  const box = $('#repFees');
  $('#repDlg').classList.toggle('fees', !!EXAMS[rep.exam]?.fees);
  if (!EXAMS[rep.exam]?.fees) { box.hidden = true; return; }
  const f = rep.fees ||= feesDefault();
  box.hidden = false;
  box.innerHTML = `
    <div class="lab" style="margin-bottom:6px"><b>Parâmetros da deglutição</b></div>
    <div class="fgrid">
      <label>Encerramento velofaríngeo${sel('velo', FEES.velo, f.velo)}</label>
      <label>Secreções (escala de Murray)${sel('murray', FEES.murray, f.murray)}</label>
      <label>Sensibilidade laríngea${sel('sens', FEES.sens, f.sens)}</label>
      <label>Mobilidade das pregas vocais${sel('mob', FEES.mob, f.mob)}</label>
      <label>Tosse voluntária${sel('cough', FEES.cough, f.cough)}</label>
    </div>
    <div class="lab" style="margin:10px 0 4px"><b>Testes com bolo</b><span>PAS = escala de penetração-aspiração (1–8); resíduos pela escala de Yale</span></div>
    <div style="overflow-x:auto"><table class="ftab"><thead><tr><th>Consistência</th><th>Volume</th><th>Escape prematuro</th><th>PAS</th><th>Resíduo valéculas</th><th>Resíduo seios piriformes</th><th>Reação</th><th>Manobras / observações</th><th></th></tr></thead>
    <tbody>${f.bolus.map((b, i) => `<tr data-i="${i}">
      <td>${sel('c', FEES.iddsi, b.c)}</td><td><input data-f="vol" value="${esc(b.vol)}" style="width:80px"></td>
      <td>${sel('spill', FEES.spill, b.spill)}</td><td>${sel('pas', FEES.pas, b.pas, 'title="Escala de penetração-aspiração"')}</td>
      <td>${sel('rv', FEES.yale, b.rv)}</td><td>${sel('rp', FEES.yale, b.rp)}</td><td>${sel('react', FEES.react, b.react)}</td>
      <td><input data-f="obs" value="${esc(b.obs)}" placeholder="ex.: queixo ao peito eficaz"></td>
      <td><button type="button" class="ghost icon" data-del="${i}" title="Retirar">✕</button></td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:6px"><button type="button" id="feesAdd">+ Consistência</button><span style="flex:1"></span>
      <button type="button" id="feesConc">Gerar conclusão a partir dos parâmetros</button></div>
    <div class="fgrid" style="margin-top:10px">
      <label>Ingestão oral recomendada (escala FOIS)${sel('fois', FEES.fois, f.fois - 1)}</label>
      <label>Dieta — sólidos${sel('dietS', FEES.iddsi, f.dietS)}</label>
      <label>Dieta — líquidos${sel('dietL', FEES.iddsi, f.dietL)}</label>
    </div>`;
  // a escala PAS mostra só o número na tabela (texto completo no menu)
  box.querySelectorAll('select[data-f="pas"], select[data-f="c"]').forEach(s => s.style.maxWidth = '170px');
}
function feesRead(rep) {
  const box = $('#repFees');
  if (box.hidden || !rep.fees) return;
  const f = rep.fees, v = n => +box.querySelector(`.fgrid [data-f="${n}"]`).value;
  Object.assign(f, {velo: v('velo'), murray: v('murray'), sens: v('sens'), mob: v('mob'), cough: v('cough'), fois: v('fois') + 1, dietS: v('dietS'), dietL: v('dietL')});
  f.bolus = [...box.querySelectorAll('tbody tr')].map(tr => {
    const g = n => tr.querySelector(`[data-f="${n}"]`);
    return {c: +g('c').value, vol: g('vol').value, spill: +g('spill').value, pas: +g('pas').value, rv: +g('rv').value, rp: +g('rp').value, react: +g('react').value, obs: g('obs').value};
  });
}
$('#repFees').onclick = e => {
  if (e.target.id === 'feesAdd') { feesRead(rep); rep.fees.bolus.push({c: 4, vol: '5 ml', spill: 0, pas: 0, rv: 0, rp: 0, react: 0, obs: ''}); feesFill(rep); }
  if (e.target.dataset.del) { feesRead(rep); rep.fees.bolus.splice(+e.target.dataset.del, 1); feesFill(rep); }
  if (e.target.id === 'feesConc') { feesRead(rep); $('#repConc').value = feesConclusion(rep.fees); }
};
const consName = i => FEES.iddsi[i].split(' — ')[1] + ` (${short(FEES.iddsi[i])})`;
const consLow = i => FEES.iddsi[i].split(' — ')[1].toLowerCase() + ` (${short(FEES.iddsi[i])})`;
function feesConclusion(f) {
  const tested = f.bolus;
  if (!tested.length) return '';
  const maxPas = Math.max(...tested.map(b => b.pas + 1));
  const byPas = tested.filter(b => b.pas + 1 === maxPas).map(b => consLow(b.c));
  const worstRes = Math.max(...tested.map(b => Math.max(b.rv, b.rp)));
  const parts = [];
  if (maxPas === 1 && worstRes <= 1 && f.murray === 0) parts.push('Deglutição orofaríngea sem alterações significativas: sem penetração nem aspiração (PAS 1) com todas as consistências testadas, sem resíduos significativos.');
  else {
    const pasTxt = maxPas >= 6 ? `aspiração laringotraqueal (PAS ${maxPas}${maxPas === 8 ? ', silenciosa' : ''})` : maxPas >= 2 ? `penetração laríngea (PAS ${maxPas})` : 'sem penetração nem aspiração (PAS 1)';
    parts.push(`Disfagia orofaríngea${maxPas >= 6 ? '' : maxPas >= 2 ? '' : ' sem penetração/aspiração'}${maxPas >= 2 ? ` com ${pasTxt} com ${[...new Set(byPas)].join(', ')}` : ''}.`);
    if (worstRes >= 2) {
      const res = tested.filter(b => Math.max(b.rv, b.rp) === worstRes).map(b => consLow(b.c));
      parts.push(`Resíduos ${FEES.yale[worstRes].toLowerCase()}s (escala de Yale) com ${[...new Set(res)].join(', ')}.`);
    }
    if (f.murray >= 2) parts.push(`Gestão de secreções alterada (Murray ${f.murray}).`);
    if (f.sens >= 1 && f.sens <= 2) parts.push(`Sensibilidade laríngea ${FEES.sens[f.sens].toLowerCase()}.`);
  }
  parts.push(`Recomendação: FOIS ${f.fois} — ${FEES.fois[f.fois - 1].split(' — ')[1].toLowerCase()}; sólidos ${short(FEES.iddsi[f.dietS])}, líquidos ${short(FEES.iddsi[f.dietL])}.`);
  return parts.join(' ');
}
function feesPrintHTML(rep) {
  if (!EXAMS[rep.exam]?.fees || !rep.fees) return '';
  const f = rep.fees;
  return `<div class="rep-sec"><h4>Avaliação pré-deglutição</h4><p>Encerramento velofaríngeo: ${esc(FEES.velo[f.velo])} · Secreções (Murray): ${esc(FEES.murray[f.murray])} · Sensibilidade laríngea: ${esc(FEES.sens[f.sens])} · Mobilidade das pregas vocais: ${esc(FEES.mob[f.mob])} · Tosse voluntária: ${esc(FEES.cough[f.cough])}</p></div>
  <div class="rep-sec"><h4>Testes com bolo</h4>
  <table class="rep-tab"><thead><tr><th>Consistência</th><th>Volume</th><th>Escape prematuro</th><th>PAS</th><th>Resíduo valéculas</th><th>Resíduo seios piriformes</th><th>Reação</th><th>Observações</th></tr></thead><tbody>
  ${f.bolus.map(b => `<tr><td>${esc(consName(b.c))}</td><td>${esc(b.vol)}</td><td>${esc(FEES.spill[b.spill])}</td><td><b>${b.pas + 1}</b></td><td>${esc(FEES.yale[b.rv])}</td><td>${esc(FEES.yale[b.rp])}</td><td>${esc(FEES.react[b.react])}</td><td>${esc(b.obs)}</td></tr>`).join('')}
  </tbody></table>
  <p style="font-size:8.5pt;color:#555;margin-top:2px">PAS — escala de penetração-aspiração (1 = normal; 2–5 = penetração; 6–8 = aspiração). Resíduos: escala de Yale.</p></div>
  <div class="rep-sec"><h4>Recomendação de ingestão</h4><p>FOIS ${f.fois} — ${esc(FEES.fois[f.fois - 1].split(' — ')[1])}. Sólidos: ${esc(consName(f.dietS))}. Líquidos: ${esc(consName(f.dietL))}.</p></div>`;
}
