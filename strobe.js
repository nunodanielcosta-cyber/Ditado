// EndORL — Estroboscopia retrospetiva (EXPERIMENTAL).
//
// Ideia: a câmara analógica (PAL) capta 50 campos por segundo; as pregas vocais vibram a 100–300 Hz. Cada campo apanha a
// vibração numa fase diferente do ciclo. Se a voz for estável, a fase de cada campo é frac(F0 × t). Como t é múltiplo de
// 20 ms, só interessa F0 mod 50 Hz. Procura-se a frequência que ordena os campos da forma mais "contínua" (menor diferença
// entre imagens vizinhas), com o F0 do áudio a limitar a procura e a dar o sentido do movimento. Depois agrupam-se os
// campos por fase e reconstrói-se um ciclo vibratório. Só funciona se cada imagem for nítida (exposição curta).
// Usa variáveis/funções globais do index.html e de voice.js.
'use strict';

const SB = {m: null, video: null, roi: null, res: null, anim: 0, phase: 0, last: 0, drag: null};

// ---------- Gravar um clip para estroboscopia (vídeo sem filtros + microfone) ----------
async function strobeRecord() {
  if (!stream || !curSes) return alert('Ligue a câmara e escolha um doente e uma sessão.');
  let mic = V.stream?.getAudioTracks()[0], own = null;
  if (!mic) {
    try { own = await navigator.mediaDevices.getUserMedia({audio: {...(settings.voice.mic ? {deviceId: {exact: settings.voice.mic}} : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false}}); mic = own.getAudioTracks()[0]; }
    catch { if (!confirm('Não foi possível ligar o microfone. Gravar só o vídeo (sem medir o F0)?')) return; }
  }
  const ms = new MediaStream([stream.getVideoTracks()[0], ...(mic ? [mic] : [])]);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(ms, {...(mime ? {mimeType: mime} : {}), videoBitsPerSecond: 10e6});
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const btn = $('#vStrobeRec'), label = btn.textContent;
  for (const n of [3, 2, 1]) { btn.textContent = `Prepare o /i/… ${n}`; beep(520, .06); await new Promise(r => setTimeout(r, 700)); }
  rec.start(); beep(880, .15);
  const t0 = performance.now();
  await new Promise(r => { const iv = setInterval(() => { const s = (performance.now() - t0) / 1000; btn.textContent = `A gravar /i/ sustentado… ${s.toFixed(1)} s`; if (s >= 3.5) { clearInterval(iv); r(); } }, 100); });
  await new Promise(r => { rec.onstop = r; rec.stop(); });
  own?.getTracks().forEach(t => t.stop());
  btn.textContent = label; beep(440, .1);
  await addMedia(new Blob(chunks, {type: rec.mimeType}), 'video', {strobe: true});
  strobeOpen(media[media.length - 1]);
}

// ---------- Diálogo ----------
function strobeOpen(m) {
  if (!m || m.kind !== 'video') return alert('Abra primeiro um vídeo da sessão (de preferência gravado com "Gravar para estroboscopia").');
  if (m.processed && !m.strobe && !confirm('Este vídeo foi gravado com a melhoria de imagem ligada (correção de riscas), o que apaga a informação de que a estroboscopia precisa.\nPara melhores resultados use "Gravar para estroboscopia" no painel Voz.\n\nContinuar mesmo assim?')) return;
  stopLive?.();
  SB.m = m; SB.res = null; cancelAnimationFrame(SB.anim);
  $('#sResults').hidden = true; $('#sStatus').textContent = '';
  const v = SB.video = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = urlFor(m);
  v.onloadedmetadata = async () => {
    const dur = isFinite(v.duration) ? v.duration : await realDuration(v);
    $('#sStart').max = Math.max(0, dur - 0.5).toFixed(2); $('#sStart').value = Math.min(0.3, +$('#sStart').max);
    SB.roi ||= null;
    await showRef();
  };
  $('#strobeDlg').showModal();
}
// Vídeos WebM gravados no browser às vezes não indicam a duração: descobri-la
function realDuration(v) {
  return new Promise(r => { v.currentTime = 1e6; v.onseeked = () => { const d = v.duration; v.onseeked = null; v.currentTime = 0; r(isFinite(d) ? d : 4); }; });
}
const seek = (v, t) => new Promise(r => { v.onseeked = () => { v.onseeked = null; r(); }; v.currentTime = t; });
async function showRef() {
  const v = SB.video, t = +$('#sStart').value + (+$('#sDur').value) / 2;
  await seek(v, Math.min(t, (v.duration || 4) - 0.05));
  const c = $('#sRef'); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  if (!SB.roi || SB.roi.x + SB.roi.w > c.width || SB.roi.y + SB.roi.h > c.height) SB.roi = {x: Math.round(c.width * .3), y: Math.round(c.height * .2), w: Math.round(c.width * .4), h: Math.round(c.height * .6)};
  drawRef();
}
function drawRef() {
  const c = $('#sRef'), x = c.getContext('2d');
  x.drawImage(SB.video, 0, 0);
  const r = SB.roi; x.strokeStyle = '#27b3c9'; x.lineWidth = 3; x.setLineDash([10, 6]); x.strokeRect(r.x, r.y, r.w, r.h); x.setLineDash([]);
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(r.x, r.y - 26, 190, 24); x.fillStyle = '#fff'; x.font = '16px sans-serif'; x.fillText('Zona da glote', r.x + 8, r.y - 8);
}
// Desenhar a zona da glote com o rato
const refPos = e => { const c = $('#sRef'), b = c.getBoundingClientRect(); return {x: (e.clientX - b.left) * c.width / b.width, y: (e.clientY - b.top) * c.height / b.height}; };
$('#sRef').onpointerdown = e => { SB.drag = refPos(e); $('#sRef').setPointerCapture(e.pointerId); };
$('#sRef').onpointermove = e => {
  if (!SB.drag) return;
  const p = refPos(e), a = SB.drag;
  SB.roi = {x: Math.round(Math.min(a.x, p.x)), y: Math.round(Math.min(a.y, p.y)), w: Math.round(Math.abs(p.x - a.x)), h: Math.round(Math.abs(p.y - a.y))};
  drawRef();
};
$('#sRef').onpointerup = () => { SB.drag = null; if (SB.roi.w < 20 || SB.roi.h < 20) { SB.roi.w = Math.max(SB.roi.w, 60); SB.roi.h = Math.max(SB.roi.h, 60); drawRef(); } };
$('#sStart').oninput = $('#sDur').onchange = () => showRef();

// ---------- Análise ----------
const sStat = t => { $('#sStatus').textContent = t; return new Promise(r => setTimeout(r, 0)); };
async function strobeAnalyze() {
  const v = SB.video, start = +$('#sStart').value, dur = +$('#sDur').value, W = v.videoWidth, H = v.videoHeight;
  cancelAnimationFrame(SB.anim); $('#sResults').hidden = true;
  // zona recortada (zona da glote + margem); começa numa linha par para não trocar os campos
  const r = SB.roi, mx = Math.round(r.w * .35), my = Math.round(r.h * .25);
  const cx = Math.max(0, r.x - mx), cy = Math.max(0, (r.y - my) & ~1), cw = Math.min(W - cx, r.w + 2 * mx), ch = Math.min(H - cy, (r.h + 2 * my) & ~1);
  const roiF = {x: r.x - cx, y: Math.floor((r.y - cy) / 2), w: r.w, h: Math.floor(r.h / 2)}; // zona da glote em coordenadas de campo

  // 1) Extrair as imagens do segmento (reprodução lenta, uma imagem de cada vez)
  await sStat('A extrair as imagens do vídeo…');
  const work = document.createElement('canvas'); work.width = W; work.height = H;
  const wx = work.getContext('2d', {willReadFrequently: true});
  const frames = [];
  await seek(v, start);
  await new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; v.pause(); resolve(); } };
    const onFrame = (_now, meta) => {
      if (done) return;
      const t = meta.mediaTime;
      if (t >= start - 0.001 && (!frames.length || t - frames[frames.length - 1].t > 0.005)) {
        wx.drawImage(v, 0, 0);
        frames.push({t, img: wx.getImageData(cx, cy, cw, ch)});
        $('#sStatus').textContent = `A extrair as imagens do vídeo… ${frames.length}`;
      }
      if (t >= start + dur || v.ended) return finish();
      v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
    v.playbackRate = 0.4; v.onended = finish; v.play().catch(finish);
    setTimeout(finish, (dur / 0.4 + 6) * 1000);
  });
  if (frames.length < 20) return sStat(`Só foram obtidas ${frames.length} imagens — escolha um segmento mais longo.`);

  // 2) F0 pelo áudio do clip (se existir)
  await sStat('A medir o F0 no áudio…');
  let f0 = null, f0cv = null;
  try {
    const ab = await (await getBlob(SB.m)).arrayBuffer();
    const ac = new OfflineAudioContext(1, 1, 48000);
    const audio = await ac.decodeAudioData(ab);
    const sr = audio.sampleRate, ch0 = audio.getChannelData(0);
    const seg = ch0.subarray(Math.floor(start * sr), Math.min(ch0.length, Math.floor((start + dur) * sr)));
    const tr = f0Track(seg, sr);
    if (tr.length > 10) { tr.sort((a, b) => a - b); f0 = tr[tr.length >> 1]; const s = stats(tr); f0cv = s.sd / s.mean; }
  } catch { /* clip sem áudio */ }

  // 3) Separar os campos e calcular uma "impressão" de cada um (zona da glote reduzida, normalizada)
  await sStat('A separar os campos e a comparar as imagens…');
  const dt = median(frames.slice(1).map((f, i) => f.t - frames[i].t)) || 0.04; // período de imagem (~40 ms em PAL)
  const fieldDt = dt / 2;
  const fields = []; // {slot (índice de 20 ms, ordem par-primeiro), even, img(ImageData cw×ch/2), vec}
  const FW = 40, FH = 20;
  for (const f of frames) {
    const idx = Math.round((f.t - frames[0].t) / dt);
    for (const even of [true, false]) {
      const fd = new ImageData(cw, ch >> 1), s = f.img.data, d = fd.data;
      for (let y = 0; y < ch >> 1; y++) d.set(s.subarray(((2 * y + (even ? 0 : 1)) * cw) * 4, ((2 * y + (even ? 0 : 1)) * cw + cw) * 4), y * cw * 4);
      fields.push({idx, even, img: fd, vec: fieldVec(fd, roiF, FW, FH)});
    }
  }
  const N = fields.length, D = new Float32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { let s = 0; const a = fields[i].vec, b = fields[j].vec; for (let k = 0; k < a.length; k++) { const q = a[k] - b[k]; s += q * q; } D[i * N + j] = D[j * N + i] = s; }

  // 4) Procurar a frequência aparente (F0 mod 50 Hz) e a ordem dos campos que tornam o ciclo mais contínuo
  await sStat('A procurar a fase de cada campo…');
  const fs = 1 / fieldDt; // ~50 campos/s
  const timeOf = (fl, evenFirst) => (2 * fl.idx + (fl.even === evenFirst ? 0 : 1)) / fs;
  const order = new Int32Array(N), ph = new Float64Array(N);
  const cost = (fa, evenFirst) => {
    for (let i = 0; i < N; i++) { const p = fa * timeOf(fields[i], evenFirst); ph[i] = p - Math.floor(p); order[i] = i; }
    order.sort((a, b) => ph[a] - ph[b]);
    let s = D[order[N - 1] * N + order[0]];
    for (let i = 1; i < N; i++) s += D[order[i - 1] * N + order[i]];
    return s;
  };
  const cands = [];
  let lo = 2, hi = fs - 2, step = 0.01;
  if (f0) { const a = f0 % fs; lo = Math.max(1, a - 2.5); hi = Math.min(fs - 1, a + 2.5); step = 0.004; }
  for (const evenFirst of [true, false]) for (let fa = lo; fa <= hi; fa += step) cands.push({fa, evenFirst, c: cost(fa, evenFirst)});
  cands.sort((a, b) => a.c - b.c);
  let best = cands[0];
  for (let fa = best.fa - step; fa <= best.fa + step; fa += step / 20) { const c = cost(fa, best.evenFirst); if (c < best.c) best = {fa, evenFirst: best.evenFirst, c}; }
  const baseline = cands[cands.length >> 1].c, quality = Math.max(0, 1 - best.c / baseline);

  // 5) Agrupar por fase e reconstruir o ciclo
  await sStat('A reconstruir o ciclo vibratório…');
  const B = Math.max(8, Math.min(24, Math.floor(N / 5)));
  const acc = Array.from({length: B}, () => ({sum: new Float32Array(cw * (ch >> 1) * 4), n: 0}));
  for (const fl of fields) {
    const p = best.fa * timeOf(fl, best.evenFirst), b = Math.min(B - 1, Math.floor((p - Math.floor(p)) * B));
    const a = acc[b], d = fl.img.data; for (let k = 0; k < d.length; k++) a.sum[k] += d[k]; a.n++;
  }
  let bins = acc.map(a => { if (!a.n) return null; const out = new ImageData(cw, ch >> 1); for (let k = 0; k < out.data.length; k++) out.data[k] = a.sum[k] / a.n; return out; });
  for (let i = 0; i < B; i++) if (!bins[i]) { for (let k = 1; k < B; k++) { const j = bins[(i + k) % B] || bins[(i - k + B) % B]; if (j) { bins[i] = j; break; } } }
  // começar o ciclo na fase mais fechada (menor área glótica)
  const area = bins.map(b => glottalArea(b, roiF));
  const shift = area.indexOf(Math.min(...area));
  bins = bins.slice(shift).concat(bins.slice(0, shift));
  const areaN = area.slice(shift).concat(area.slice(0, shift));
  const amax = Math.max(...areaN) || 1, an = areaN.map(a => a / amax);
  const open = an.filter(a => a > 0.15).length / B, closes = Math.min(...an) < 0.15;
  // Qualidade final: coerência da ordenação × variação real da abertura entre fases (com imagens desfocadas, a área
  // quase não varia) — e nula se o F0 estiver perto de um múltiplo de 50 Hz (todos os campos na mesma fase).
  const modulation = 1 - Math.min(...an);
  let q = quality * Math.max(0, Math.min(1, (modulation - 0.15) / 0.45));
  if (f0 && Math.min(f0 % fs, fs - f0 % fs) < 2.5) q = Math.min(q, 0.1);

  SB.res = {bins, area: an, cw, fh: ch >> 1, roiF, B, f0, f0cv, fa: best.fa, quality: q, order: quality, modulation, N, oq: closes ? open : 1, closes, aspect: outWidth(W, H) / W, reverse: false};
  $('#sReverse').checked = false; $('#sReverse').disabled = !!f0;
  strobeShowResults();
  await sStat('');
}
function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }
function fieldVec(img, r, FW, FH) {
  const d = img.data, w = img.width, out = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    let s = 0, n = 0;
    const x0 = r.x + Math.floor(i * r.w / FW), x1 = r.x + Math.floor((i + 1) * r.w / FW), y0 = r.y + Math.floor(j * r.h / FH), y1 = r.y + Math.floor((j + 1) * r.h / FH);
    for (let y = y0; y < Math.max(y1, y0 + 1); y++) for (let x = x0; x < Math.max(x1, x0 + 1); x++) { const k = (y * w + x) * 4; s += .299 * d[k] + .587 * d[k + 1] + .114 * d[k + 2]; n++; }
    out[j * FW + i] = s / n;
  }
  const m = out.reduce((a, b) => a + b, 0) / out.length, sd = Math.sqrt(out.reduce((a, b) => a + (b - m) ** 2, 0) / out.length) || 1;
  for (let k = 0; k < out.length; k++) out[k] = (out[k] - m) / sd;
  return out;
}
// Área glótica aproximada: pontos escuros (abaixo de 45% da luminosidade mediana) dentro da zona da glote
function glottalArea(img, r) {
  const d = img.data, w = img.width, L = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const k = (y * w + x) * 4; L.push(.299 * d[k] + .587 * d[k + 1] + .114 * d[k + 2]); }
  const thr = median(L) * 0.45;
  return L.filter(l => l < thr).length;
}

// ---------- Resultados ----------
function qualityLabel(q) { return q > 0.35 ? 'boa' : q > 0.2 ? 'razoável' : 'fraca'; }
function strobeText(s) {
  if (!s) return '';
  return `Estroboscopia retrospetiva (experimental): ciclo vibratório reconstruído a partir de ${s.N} campos de vídeo`
    + (s.f0 ? `; F0 ${Math.round(s.f0)} Hz` : '') + `; qualidade da reconstrução ${qualityLabel(s.quality)}`
    + (s.closes ? `; quociente de abertura aproximado ${s.oq.toLocaleString('pt-PT', {maximumFractionDigits: 2})}` : '; sem encerramento glótico completo no ciclo reconstruído') + '.';
}
function strobeShowResults() {
  const s = SB.res;
  $('#sResults').hidden = false;
  $('#sInfo').innerHTML = [
    s.f0 ? `F0 (áudio): <b>${Math.round(s.f0)} Hz</b>${s.f0cv > 0.03 ? ` — <span style="color:var(--rec)">voz pouco estável (variação ${(s.f0cv * 100).toFixed(1)}%)</span>` : ''}` : 'F0: <b>sem áudio</b> (sentido do movimento indeterminado — use "Inverter")',
    `Campos usados: <b>${s.N}</b> · fases: ${s.B}`,
    `Qualidade da reconstrução: <b style="color:${s.quality > 0.35 ? 'var(--ok)' : s.quality > 0.2 ? '#e0891e' : 'var(--rec)'}">${qualityLabel(s.quality)}</b> (${(s.quality * 100).toFixed(0)}%)`,
    s.closes ? `Quociente de abertura (aprox.): <b>${s.oq.toFixed(2)}</b>` : 'Encerramento glótico: <b>incompleto</b> no ciclo reconstruído',
    s.quality <= 0.2 ? `<span style="color:var(--rec)">Resultado pouco fiável${s.modulation < 0.4 ? ': a abertura da glote quase não varia entre fases — imagens provavelmente desfocadas (exposição longa da câmara)' : ': imagens desfocadas ou voz irregular'}.</span>` : '',
    s.f0 && Math.min(s.f0 % 50, 50 - s.f0 % 50) < 2.5 ? `<span style="color:var(--rec)">O F0 (${Math.round(s.f0)} Hz) está muito perto de um múltiplo de 50 Hz: quase todos os campos caem na mesma fase. Peça ao doente para subir ou descer ligeiramente o tom e grave de novo.</span>` : '',
  ].filter(Boolean).join('<br>');
  drawArea(); drawKymo(); animate();
}
function binCanvas(i) {
  const s = SB.res, c = binCanvas.c ||= document.createElement('canvas');
  c.width = s.cw; c.height = s.fh; c.getContext('2d').putImageData(s.bins[i], 0, 0); return c;
}
function drawBin(ctx, i, x, y, w, h) { ctx.imageSmoothingEnabled = true; ctx.drawImage(binCanvas(i), x, y, w, h); }
function animate() {
  const s = SB.res, c = $('#sAnim'), x = c.getContext('2d');
  const w = Math.round(s.cw * s.aspect), h = s.fh * 2; c.width = w; c.height = h;
  SB.last = performance.now();
  const step = now => {
    const speed = +$('#sSpeed').value; // ciclos por segundo
    SB.phase = (((SB.phase + Math.max(0, now - SB.last) / 1000 * speed) % 1) + 1) % 1; SB.last = Math.max(SB.last, now);
    let i = Math.min(s.B - 1, Math.max(0, Math.floor(SB.phase * s.B))); if ($('#sReverse').checked) i = s.B - 1 - i;
    drawBin(x, i, 0, 0, w, h);
    drawArea(i);
    SB.anim = requestAnimationFrame(step);
  };
  cancelAnimationFrame(SB.anim); SB.anim = requestAnimationFrame(step);
}
function drawArea(cur = -1) {
  const s = SB.res, c = $('#sArea'), x = c.getContext('2d'), w = c.width, h = c.height;
  const css = getComputedStyle(document.documentElement);
  x.clearRect(0, 0, w, h);
  const a = $('#sReverse').checked ? [...s.area].reverse() : s.area, X = i => 6 + i / s.B * (w - 12), Y = v => h - 14 - v * (h - 26);
  x.strokeStyle = css.getPropertyValue('--line'); x.beginPath(); x.moveTo(6, Y(0)); x.lineTo(w - 6, Y(0)); x.stroke();
  x.fillStyle = css.getPropertyValue('--muted'); x.font = '10px sans-serif'; x.fillText('Área glótica (aprox.) ao longo de 1 ciclo', 6, 11);
  x.strokeStyle = css.getPropertyValue('--accent'); x.lineWidth = 2; x.beginPath();
  for (let i = 0; i <= s.B; i++) { const v = a[i % s.B]; i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); }
  x.stroke();
  if (cur >= 0) { x.fillStyle = css.getPropertyValue('--rec'); x.beginPath(); x.arc(X(cur), Y(a[cur]), 4, 0, 7); x.fill(); }
}
// Quimograma: a linha do meio da zona da glote, fase a fase, durante 3 ciclos
function drawKymo() {
  const s = SB.res, c = $('#sKymo'), x = c.getContext('2d'), r = s.roiF;
  const rows = s.B * 3, y0 = r.y + (r.h >> 1);
  c.width = r.w; c.height = rows;
  const out = x.createImageData(r.w, rows);
  for (let k = 0; k < rows; k++) { const b = s.bins[k % s.B].data; out.data.set(b.subarray((y0 * s.cw + r.x) * 4, (y0 * s.cw + r.x + r.w) * 4), k * r.w * 4); }
  x.putImageData(out, 0, 0);
}

// ---------- Guardar ----------
async function strobeSaveImage() {
  const s = SB.res; if (!s) return;
  const n = 8, tw = Math.round(s.cw * s.aspect), th = s.fh * 2, pad = 10, cols = 4;
  const c = document.createElement('canvas'); c.width = cols * tw + (cols + 1) * pad; c.height = 2 * th + 3 * pad + 150;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  for (let k = 0; k < n; k++) {
    let i = Math.round(k * s.B / n); if ($('#sReverse').checked) i = (s.B - i) % s.B;
    const cx = pad + (k % cols) * (tw + pad), cy = pad + Math.floor(k / cols) * (th + pad);
    drawBin(x, i, cx, cy, tw, th);
    x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(cx, cy, 64, 22); x.fillStyle = '#fff'; x.font = '15px sans-serif'; x.fillText(`${Math.round(k / n * 360)}°`, cx + 6, cy + 16);
  }
  const ac = $('#sArea'); x.drawImage(ac, pad, 2 * th + 3 * pad, c.width - 2 * pad, 130);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
  await addMedia(blob, 'image', {strobeOf: SB.m.id});
  $('#sStatus').textContent = '✔ Imagem com 8 fases do ciclo guardada na sessão.';
}
async function strobeSaveVideo() {
  const s = SB.res; if (!s) return;
  const c = $('#sAnim'), st = c.captureStream(30);
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(st, {...(mime ? {mimeType: mime} : {}), videoBitsPerSecond: 5e6}), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const secs = Math.max(4, Math.min(12, 4 / +$('#sSpeed').value));
  $('#sStatus').textContent = `A gravar o ciclo em vídeo (${secs.toFixed(0)} s)…`;
  rec.start(); await new Promise(r => setTimeout(r, secs * 1000)); await new Promise(r => { rec.onstop = r; rec.stop(); });
  st.getTracks().forEach(t => t.stop());
  await addMedia(new Blob(chunks, {type: rec.mimeType}), 'video', {strobeOf: SB.m.id, processed: true});
  $('#sStatus').textContent = '✔ Vídeo do ciclo reconstruído guardado na sessão.';
}
async function strobeSaveResults() {
  const s = SB.res; if (!s || !curSes) return;
  curSes.strobe = {date: Date.now(), clip: SB.m.id, f0: s.f0, f0cv: s.f0cv, N: s.N, quality: +s.quality.toFixed(3), oq: +s.oq.toFixed(3), closes: s.closes};
  await DB.put('sessions', curSes);
  $('#sStatus').textContent = '✔ Resultados guardados na sessão (podem ser inseridos no relatório).';
}

$('#btnStrobe').onclick = () => strobeOpen(curMedia);
$('#vStrobeRec').onclick = strobeRecord;
$('#sAnalyze').onclick = () => strobeAnalyze().catch(e => sStat('Erro: ' + e.message));
$('#sSaveImg').onclick = strobeSaveImage;
$('#sSaveVid').onclick = strobeSaveVideo;
$('#sSaveRes').onclick = strobeSaveResults;
$('#sReverse').onchange = () => drawArea();
$('#sClose').onclick = () => $('#strobeDlg').close();
$('#strobeDlg').onclose = () => { cancelAnimationFrame(SB.anim); SB.video?.pause(); SB.video = null; loadMedia(); };
