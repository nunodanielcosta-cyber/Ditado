// EndORL — Aviso de espaço em disco (versão de computador).
// Indicador no topo com o espaço livre no disco da pasta dos exames. Abaixo de 10 GB: aviso; abaixo de 2 GB: não deixa
// começar gravações; abaixo de 1 GB durante uma gravação: para-a automaticamente (para o vídeo não ficar estragado).
'use strict';

// limites em GB (podem ser ajustados em settings.disk = {warn, crit, stop})
const diskLim = () => ({warn: 10, crit: 2, stop: 1, ...(settings.disk || {})});
const REC_BYTES_MIN = 6e6 / 8 * 60; // vídeo a ~6 Mbit/s ≈ 45 MB por minuto
let diskFree = Infinity, diskLevel = 'ok', diskWarned = false;
const fmtGB = b => b >= 1e9 ? (b / 1e9).toLocaleString('pt-PT', {maximumFractionDigits: 1}) + ' GB' : Math.round(b / 1e6) + ' MB';

async function diskCheck() {
  if (!window.desktop?.diskStatus) return;
  let st; try { st = await window.desktop.diskStatus(); } catch { return; }
  diskFree = st.free;
  const L = diskLim();
  diskLevel = st.free < L.crit * 1e9 ? 'crit' : st.free < L.warn * 1e9 ? 'warn' : 'ok';
  const b = $('#btnDisk'), mins = Math.floor(st.free / REC_BYTES_MIN);
  b.hidden = false; b.className = diskLevel === 'ok' ? '' : diskLevel;
  $('#diskTxt').textContent = fmtGB(st.free) + ' livres';
  b.title = `Espaço livre no disco dos exames: ${fmtGB(st.free)} de ${fmtGB(st.total)} (cerca de ${mins.toLocaleString('pt-PT')} min de vídeo)`;
  // durante uma gravação: parar antes de o disco encher
  if (recorder && st.free < L.stop * 1e9) { stopRec(); alert('A gravação foi parada automaticamente: o disco está quase cheio (' + fmtGB(st.free) + ' livres).\nO vídeo gravado até agora foi guardado.'); }
  if (diskLevel !== 'ok' && !diskWarned) {
    diskWarned = true;
    alert((diskLevel === 'crit' ? 'ATENÇÃO: o disco está quase cheio' : 'Aviso: o espaço em disco está a ficar reduzido') +
      ` — ${fmtGB(st.free)} livres (cerca de ${mins} minutos de vídeo).\n\n` +
      (diskLevel === 'crit' ? 'Não é possível gravar vídeos novos até libertar espaço. ' : '') +
      'Peça à informática para arquivar os vídeos antigos num disco externo. Clique no indicador de espaço (no topo) para ver o que ocupa mais.');
  }
}
$('#btnDisk').onclick = async () => {
  await diskCheck();
  const st = await window.desktop.diskStatus();
  $('#diskInfo').innerHTML = `Livre: <b>${fmtGB(st.free)}</b> de ${fmtGB(st.total)} (${Math.round(st.free / st.total * 100)}%) — cerca de <b>${Math.floor(st.free / REC_BYTES_MIN).toLocaleString('pt-PT')} minutos</b> de vídeo.<br>
    <span class="muted">Pasta dos exames: ${esc(st.root)}</span><div id="diskUse" class="muted" style="margin-top:8px">A calcular o espaço ocupado pelos exames…</div>`;
  $('#diskDlg').showModal();
  const u = await window.desktop.diskUsage();
  $('#diskUse').innerHTML = `Ocupado pelos exames: <b>${fmtGB(u.video + u.image + u.other)}</b><br>· Vídeos: ${fmtGB(u.video)} (${u.nVideo})<br>· Imagens: ${fmtGB(u.image)}<br>· Relatórios e outros: ${fmtGB(u.other)}`
    + (u.video > (u.video + u.image + u.other) * 0.7 ? '<br><br>A maior parte do espaço é ocupada por vídeos. Arquivar os vídeos antigos num disco externo liberta mais espaço.' : '');
};
$('#diskOpen').onclick = () => FS?.openFolder('');
// verificar no arranque, a cada minuto (a cada 15 s durante uma gravação) e depois de guardar ficheiros
scriptsLoaded.then(diskCheck);
let diskTick = 0;
setInterval(() => { if (recorder || diskTick++ % 4 === 0) diskCheck(); }, 15000);
