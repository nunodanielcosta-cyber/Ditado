// EndORL — Análise de voz pelo microfone: frequência fundamental (F0), intensidade e tempo máximo de fonação (TMF).
// Usa as variáveis e funções globais do index.html (settings, saveSettings, $, esc, curSes, DB, loadSessions…).
'use strict';

// ---------- F0 pelo algoritmo YIN (de Cheveigné & Kawahara, 2002) ----------
function yinF0(buf, sr, fmin = 60, fmax = 700, thr = 0.15) {
  const tauMin = Math.max(2, Math.floor(sr / fmax)), tauMax = Math.min(Math.floor(sr / fmin), (buf.length >> 1) - 1);
  const W = buf.length - tauMax, d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
    d[tau] = s;
  }
  let run = 0; d[0] = 1;
  for (let tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; d[tau] = run ? d[tau] * tau / run : 1; }
  let tau = tauMin;
  for (; tau <= tauMax; tau++) if (d[tau] < thr) { while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++; break; }
  if (tau > tauMax) return {f0: 0, conf: 0};
  const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a + c - 2 * b;
  const t = den > 0 ? tau + (a - c) / (2 * den) : tau;
  return {f0: sr / t, conf: 1 - b};
}
const rmsDb = buf => { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return 10 * Math.log10(s / buf.length + 1e-12); };
const stats = a => {
  if (!a.length) return null;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  return {mean: m, sd, min: Math.min(...a), max: Math.max(...a), n: a.length};
};
// F0 de um sinal gravado (ex.: áudio de um vídeo) em janelas de 40 ms
function f0Track(samples, sr) {
  const win = Math.round(sr * 0.04), hop = Math.round(sr * 0.02), out = [];
  for (let i = 0; i + win <= samples.length; i += hop) {
    const seg = samples.subarray(i, i + win);
    if (rmsDb(seg) < -50) continue;
    const r = yinF0(seg, sr);
    if (r.f0 && r.conf > 0.8) out.push(r.f0);
  }
  return out;
}

// ---------- Microfone ----------
settings.voice = {calib: 100, mic: '', ...(settings.voice || {})};
const V = {ctx: null, stream: null, an: null, buf: null, timer: 0, trace: [], meas: null, tmf: null, results: {}};
async function micDevices() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  $('#vMic').innerHTML = devs.map((d, i) => `<option value="${d.deviceId}">${esc(d.label || 'Microfone ' + (i + 1))}</option>`).join('') || '<option value="">Microfone predefinido</option>';
  if (settings.voice.mic) $('#vMic').value = settings.voice.mic;
}
async function micStart() {
  micStop();
  const dev = $('#vMic').value;
  try {
    V.stream = await navigator.mediaDevices.getUserMedia({audio: {...(dev ? {deviceId: {exact: dev}} : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
  } catch (e) { return alert('Não foi possível ligar o microfone: ' + e.message); }
  V.ctx = new AudioContext();
  const src = V.ctx.createMediaStreamSource(V.stream);
  V.an = V.ctx.createAnalyser(); V.an.fftSize = 2048; src.connect(V.an);
  V.buf = new Float32Array(V.an.fftSize);
  V.trace = [];
  V.timer = setInterval(micTick, 50);
  $('#vOn').textContent = 'Desligar microfone';
  micDevices().catch(() => {});
}
function micStop() {
  clearInterval(V.timer); V.timer = 0;
  V.stream?.getTracks().forEach(t => t.stop()); V.stream = null;
  V.ctx?.close().catch(() => {}); V.ctx = null;
  if ($('#vOn')) $('#vOn').textContent = 'Ligar microfone';
}
function micTick() {
  V.an.getFloatTimeDomainData(V.buf);
  const db = rmsDb(V.buf), spl = db + +settings.voice.calib;
  const r = db > -55 ? yinF0(V.buf, V.ctx.sampleRate) : {f0: 0, conf: 0};
  const voiced = r.f0 > 0 && r.conf > 0.85;
  const now = performance.now();
  V.trace.push({t: now, f0: voiced ? r.f0 : 0, db: spl}); while (V.trace.length && now - V.trace[0].t > 8000) V.trace.shift();
  $('#vF0').textContent = voiced ? Math.round(r.f0) : '—';
  $('#vDb').textContent = db > -90 ? Math.round(spl) : '—';
  // medição de F0 / intensidade
  if (V.meas) {
    if (voiced) { V.meas.f0.push(r.f0); V.meas.db.push(spl); }
    const left = Math.max(0, V.meas.end - now);
    $('#vMeasBtn').textContent = left ? `A medir… ${(left / 1000).toFixed(1)} s` : 'Medir F0 e intensidade (5 s)';
    if (!left) measDone();
  }
  // tempo máximo de fonação: começa com a voz, termina após 0,4 s de silêncio
  if (V.tmf) {
    const T = V.tmf;
    if (voiced) { if (!T.start) T.start = now; T.last = now; }
    if (T.start) $('#vTmfBtn').textContent = `A medir… ${((now - T.start) / 1000).toFixed(1)} s (pare quando acabar o ar)`;
    if (T.start && now - T.last > 400) tmfDone((T.last - T.start) / 1000);
    if (!T.start && now - T.armed > 15000) { V.tmf = null; $('#vTmfBtn').textContent = 'Tempo máximo de fonação'; }
  }
  drawTrace();
}
function drawTrace() {
  const c = $('#vTrace'), x = c.getContext('2d'), w = c.width, h = c.height;
  x.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  x.strokeStyle = css.getPropertyValue('--line'); x.lineWidth = 1;
  for (const f of [100, 200, 400]) { const y = h - Math.log2(f / 60) / Math.log2(700 / 60) * h; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); x.fillStyle = css.getPropertyValue('--muted'); x.font = '9px sans-serif'; x.fillText(f + ' Hz', 2, y - 2); }
  if (!V.trace.length) return;
  const t1 = V.trace[V.trace.length - 1].t, X = t => w - (t1 - t) / 8000 * w;
  x.fillStyle = 'rgba(39,179,201,.25)';
  for (const p of V.trace) { const bh = Math.max(0, Math.min(1, (p.db - 30) / 70)) * h * .35; x.fillRect(X(p.t), h - bh, 3, bh); }
  x.strokeStyle = css.getPropertyValue('--accent'); x.lineWidth = 2; x.beginPath();
  let pen = false;
  for (const p of V.trace) {
    if (!p.f0) { pen = false; continue; }
    const y = h - Math.log2(p.f0 / 60) / Math.log2(700 / 60) * h;
    pen ? x.lineTo(X(p.t), y) : x.moveTo(X(p.t), y); pen = true;
  }
  x.stroke();
}
function measDone() {
  const f = stats(V.meas.f0), d = stats(V.meas.db); V.meas = null;
  if (!f || f.n < 10) { $('#vRes').textContent = 'Não foi detetada voz suficiente. Peça um /a/ ou /i/ sustentado e repita.'; return; }
  V.results.f0 = {mean: f.mean, sd: f.sd, min: f.min, max: f.max};
  V.results.db = {mean: d.mean, min: d.min, max: d.max};
  showResults();
}
function tmfDone(sec) {
  V.tmf = null; $('#vTmfBtn').textContent = 'Tempo máximo de fonação';
  if (sec < 0.5) return;
  (V.results.tmf ||= []).push(+sec.toFixed(1));
  showResults();
}
const fmt1 = n => n.toLocaleString('pt-PT', {maximumFractionDigits: 1});
function voiceText(v) {
  if (!v) return '';
  const parts = [];
  if (v.f0) parts.push(`F0 média ${Math.round(v.f0.mean)} Hz (DP ${fmt1(v.f0.sd)} Hz; ${Math.round(v.f0.min)}–${Math.round(v.f0.max)} Hz)`);
  if (v.db) parts.push(`intensidade média ${Math.round(v.db.mean)} dB${v.calibrated ? '' : ' (valor relativo)'}`);
  if (v.tmf?.length) parts.push(`tempo máximo de fonação ${fmt1(Math.max(...v.tmf))} s${v.tmf.length > 1 ? ` (melhor de ${v.tmf.length}: ${v.tmf.map(fmt1).join(' / ')} s)` : ''}`);
  return parts.length ? 'Análise acústica: ' + parts.join('; ') + '.' : '';
}
function showResults() { $('#vRes').textContent = voiceText(V.results) || 'Sem medições.'; }

// ---------- Interface ----------
$('#btnVoice').onclick = async () => {
  const p = $('#voicePanel'); p.hidden = !p.hidden;
  if (!p.hidden) { $('#vCal').value = settings.voice.calib; await micDevices().catch(() => {}); if (!V.stream) micStart(); showResults(); }
};
$('#vClose').onclick = () => { $('#voicePanel').hidden = true; micStop(); };
$('#vOn').onclick = () => V.stream ? micStop() : micStart();
$('#vMic').onchange = () => { settings.voice.mic = $('#vMic').value; saveSettings(); if (V.stream) micStart(); };
$('#vCal').onchange = () => { settings.voice.calib = +$('#vCal').value || 100; saveSettings(); };
$('#vMeasBtn').onclick = () => { if (!V.stream) return alert('Ligue primeiro o microfone.'); V.meas = {end: performance.now() + 5000, f0: [], db: []}; };
$('#vTmfBtn').onclick = () => { if (!V.stream) return alert('Ligue primeiro o microfone.'); V.tmf = {armed: performance.now(), start: 0, last: 0}; $('#vTmfBtn').textContent = 'À espera da voz… (inspire fundo e diga /a/)'; };
$('#vClear').onclick = () => { V.results = {}; showResults(); };
$('#vSave').onclick = async () => {
  if (!curSes) return alert('Escolha primeiro um doente e uma sessão.');
  if (!V.results.f0 && !V.results.tmf) return alert('Ainda não há medições.');
  curSes.voice = {...V.results, date: Date.now(), calibrated: +settings.voice.calib !== 100};
  await DB.put('sessions', curSes);
  $('#vRes').textContent = '✔ Guardado na sessão. ' + voiceText(curSes.voice);
};
