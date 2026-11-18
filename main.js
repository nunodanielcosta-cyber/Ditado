// EndORL — aplicação de computador (Electron) que corre o index.html
const { app, BrowserWindow, Menu, dialog, shell, session, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { XionButtons } = require('./xion-buttons');

// Só uma instância aberta de cada vez (a câmara não pode ser partilhada)
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// Pasta interna da app (configuração). Usa a das versões anteriores, se existir.
{
  const dir = n => path.join(app.getPath('appData'), n);
  const hasData = d => fs.existsSync(path.join(d, 'IndexedDB')) || fs.existsSync(path.join(d, 'config.json'));
  const found = ['EndORL', 'EndoORL', 'Ditado Video'].map(dir).find(hasData);
  app.setPath('userData', found || dir('EndORL'));
}

// Captura de vídeo: por omissão usa DirectShow (como o DiVAS), que funciona com drivers antigos
// (ex.: XION Compact / Syntek STK-1160). O Media Foundation pode ser escolhido nas Definições.
loadCfgEarly();
function loadCfgEarly() { try { cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8')); } catch { cfg = {}; } }
if (cfg.captureBackend !== 'mf') app.commandLine.appendSwitch('disable-features', 'MediaFoundationVideoCapture');

// A página e os ficheiros dos exames são servidos por endorl://app/ (mesma origem → o canvas pode ler os vídeos)
protocol.registerSchemesAsPrivileged([{ scheme: 'endorl', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

// ---------- Configuração ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
var cfg; // (carregada logo no arranque, ver loadCfgEarly)
const loadCfg = () => { try { cfg = JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { cfg = {}; } };
const saveCfg = () => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); };

const docDir = (...p) => { const d = path.join(app.getPath('documents'), 'EndORL', ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const exportDir = () => docDir('Exportacoes');
const dataRoot = () => cfg.dataRoot || path.join(app.getPath('documents'), 'EndORL', 'Exames');

// Caminho dentro da pasta dos exames (nunca fora dela)
function inRoot(rel = '') {
  const root = path.resolve(dataRoot());
  const p = path.resolve(root, String(rel));
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Caminho fora da pasta dos exames: ' + rel);
  return p;
}
const cleanName = s => String(s).replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/[. ]+$/, '').slice(0, 120) || 'sem_nome';
function uniqueIn(parentAbs, base) {
  base = cleanName(base);
  let name = base, n = 2;
  while (fs.existsSync(path.join(parentAbs, name))) name = `${base} (${n++})`;
  return name;
}
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// ---------- Armazenamento em pastas ----------
// Estrutura: <raiz>/<processo>_<Apelido>_<Nome>/doente.json
//                                            /<AAAA-MM-DD_HHMM>_<Exame>/sessao.json + img001.jpg, video001.webm, relatorio.pdf …
ipcMain.handle('store:root', () => { fs.mkdirSync(dataRoot(), { recursive: true }); return dataRoot(); });
ipcMain.handle('store:scan', () => {
  const root = dataRoot();
  fs.mkdirSync(root, { recursive: true });
  const patients = [], sessions = [], media = [];
  for (const pd of fs.readdirSync(root, { withFileTypes: true })) {
    if (!pd.isDirectory()) continue;
    const pj = readJSON(path.join(root, pd.name, 'doente.json'));
    if (!pj?.id) continue;
    patients.push({ ...pj, dir: pd.name });
    for (const sd of fs.readdirSync(path.join(root, pd.name), { withFileTypes: true })) {
      if (!sd.isDirectory()) continue;
      const sj = readJSON(path.join(root, pd.name, sd.name, 'sessao.json'));
      if (!sj?.id) continue;
      const { ficheiros = [], ...s } = sj;
      sessions.push({ ...s, patientId: pj.id, dir: sd.name });
      for (const f of ficheiros) media.push({ ...f, sessionId: s.id });
    }
  }
  return { root, patients, sessions, media };
});
ipcMain.handle('store:mkUnique', (_e, parentRel, base) => {
  const parent = inRoot(parentRel);
  fs.mkdirSync(parent, { recursive: true });
  const name = uniqueIn(parent, base);
  fs.mkdirSync(path.join(parent, name));
  return name;
});
ipcMain.handle('store:moveUnique', (_e, fromRel, parentRel, base) => {
  const from = inRoot(fromRel), parent = inRoot(parentRel);
  const name = uniqueIn(parent, base);
  try { fs.renameSync(from, path.join(parent, name)); return name; }
  catch { return path.basename(from); } // pasta em uso (ex.: vídeo aberto): mantém o nome antigo
});
ipcMain.handle('store:readJSON', (_e, rel) => readJSON(inRoot(rel)));
ipcMain.handle('store:writeJSON', (_e, rel, obj) => writeAtomic(inRoot(rel), JSON.stringify(obj, null, 2)));
ipcMain.handle('store:writeFile', (_e, rel, bytes) => writeAtomic(inRoot(rel), Buffer.from(bytes)));
ipcMain.handle('store:remove', (_e, rel) => {
  if (!rel || !String(rel).trim()) throw new Error('Recusado: caminho vazio');
  fs.rmSync(inRoot(rel), { recursive: true, force: true });
});
ipcMain.handle('store:openFolder', (_e, rel) => shell.openPath(inRoot(rel)));
ipcMain.handle('store:chooseRoot', async e => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Pasta onde guardar os exames', defaultPath: dataRoot(), properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('store:setRoot', (_e, newRoot, copy) => {
  const old = dataRoot();
  fs.mkdirSync(newRoot, { recursive: true });
  if (copy && fs.existsSync(old) && path.resolve(old) !== path.resolve(newRoot)) fs.cpSync(old, newRoot, { recursive: true, force: false, errorOnExist: false });
  cfg.dataRoot = newRoot; saveCfg();
  return newRoot;
});

// Definições da versão anterior (guardadas no browser interno) passam para a nova origem
ipcMain.handle('cfg:migratedSettings', () => cfg.migratedSettings || null);
ipcMain.handle('cfg:capture', () => cfg.captureBackend === 'mf' ? 'mf' : 'ds');
ipcMain.handle('cfg:setCapture', (_e, mode) => {
  cfg.captureBackend = mode === 'mf' ? 'mf' : 'ds'; saveCfg();
  app.relaunch(); app.exit(0); // a alteração só tem efeito ao reiniciar
});

// Guardar o relatório (área de impressão da página) como PDF A4, na pasta da sessão
// ---------- Espaço em disco (disco onde está a pasta dos exames) ----------
ipcMain.handle('disk:status', () => {
  const root = dataRoot(); fs.mkdirSync(root, { recursive: true });
  const st = fs.statfsSync(root);
  return { root, free: st.bavail * st.bsize, total: st.blocks * st.bsize };
});
// Tamanho da pasta dos exames (vídeos / imagens / outros) — pode demorar alguns segundos com muitos exames
ipcMain.handle('disk:usage', async () => {
  const out = { video: 0, image: 0, other: 0, nVideo: 0 };
  const walk = async d => {
    for (const e of await fs.promises.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      const size = (await fs.promises.stat(p).catch(() => ({ size: 0 }))).size, ext = path.extname(e.name).toLowerCase();
      if (['.mp4', '.webm', '.mov', '.m4v', '.ogv'].includes(ext)) { out.video += size; out.nVideo++; }
      else if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext)) out.image += size;
      else out.other += size;
    }
  };
  await walk(dataRoot());
  return out;
});

// ---------- Relatórios para enviar (pasta no ambiente de trabalho) ----------
// Cada relatório finalizado é copiado para "EndORL - Relatórios para enviar" no ambiente de trabalho, com uma lista CSV.
// A administrativa copia a pasta para a pen todas as semanas e depois, na app, "Já copiei — arquivar" passa os ficheiros
// para "Enviados\<data>". Um mesmo relatório/versão nunca é copiado duas vezes.
const OUT_NAME = 'EndORL - Relatórios para enviar';
const outDir = () => { const d = path.join(app.getPath('desktop'), OUT_NAME); fs.mkdirSync(d, { recursive: true }); return d; };
const CSV_NAME = 'lista_para_enviar.csv';
const csvCell = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const LEIAME = `Relatórios finalizados no EndORL, prontos a enviar para a informática.

TODAS AS SEMANAS:
1. Copie TODOS os ficheiros desta pasta (os PDF e o ficheiro ${CSV_NAME}) para a pen ou disco indicado pela informática.
2. Depois de confirmar que ficaram copiados, abra o EndORL e clique em "Para enviar" (no topo) e depois em "Já copiei — arquivar".
   Os ficheiros passam para a subpasta "Enviados" (com a data de hoje) e esta pasta fica pronta para a semana seguinte.

NOTAS:
- O ficheiro ${CSV_NAME} abre no Excel: tem o n.º de processo, o nome do doente, a data e o n.º de cada relatório.
- Um relatório com "-v2" (ou v3…) no nome é uma versão corrigida: SUBSTITUI a versão anterior (ver a coluna "Observação").
- Não altere nem apague os PDF: os originais estão guardados nas pastas dos exames do EndORL.
- São dados de saúde: use apenas a pen/disco encriptado fornecido pela informática.
`;
function outAlreadyCopied(name) {
  const d = outDir();
  if (fs.existsSync(path.join(d, name))) return true;
  const sent = path.join(d, 'Enviados');
  return fs.existsSync(sent) && fs.readdirSync(sent).some(w => fs.existsSync(path.join(sent, w, name)));
}
function outAdd(pdfPath, m) {
  const d = outDir();
  const name = cleanName(`${m.pid}_${m.surname}_${m.given}_${m.examDate}_${m.number}${m.version > 1 ? '-v' + m.version : ''}`).replace(/\s+/g, '_') + '.pdf';
  if (outAlreadyCopied(name)) return null;
  fs.copyFileSync(pdfPath, path.join(d, name));
  const csv = path.join(d, CSV_NAME);
  if (!fs.existsSync(csv)) fs.writeFileSync(csv, '\ufeff' + ['Data de finalização', 'N.º processo', 'Doente', 'Data do exame', 'Exame', 'N.º relatório', 'Versão', 'Observação', 'Ficheiro'].join(';') + '\r\n');
  fs.appendFileSync(csv, [m.signedAt, m.pid, `${m.surname}, ${m.given}`, m.examDate, m.exam, m.number, m.version, m.version > 1 ? `Substitui a versão ${m.version - 1}${m.reason ? ' (' + m.reason + ')' : ''}` : '', name].map(csvCell).join(';') + '\r\n');
  if (!fs.existsSync(path.join(d, 'LEIA-ME.txt'))) fs.writeFileSync(path.join(d, 'LEIA-ME.txt'), LEIAME.replace(/\n/g, '\r\n'));
  return name;
}
const outPending = () => fs.readdirSync(outDir()).filter(f => f.toLowerCase().endsWith('.pdf'));
ipcMain.handle('out:status', () => ({ dir: outDir(), files: outPending() }));
ipcMain.handle('out:open', () => shell.openPath(outDir()));
ipcMain.handle('out:archive', () => {
  const d = outDir(), files = outPending();
  if (!files.length) return 0;
  const two = n => String(n).padStart(2, '0'), t = new Date();
  let dest = path.join(d, 'Enviados', `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())}`), k = 2;
  while (fs.existsSync(dest)) dest = path.join(d, 'Enviados', `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())} (${k++})`);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of [...files, CSV_NAME]) if (fs.existsSync(path.join(d, f))) fs.renameSync(path.join(d, f), path.join(dest, f));
  return files.length;
});

ipcMain.handle('save-pdf', async (event, name, sessionRel, outMeta) => {
  const dir = sessionRel ? inRoot(sessionRel) : docDir('Relatorios');
  const safe = cleanName(name || 'Relatorio');
  let target = path.join(dir, safe + '.pdf'), n = 2;
  while (fs.existsSync(target)) target = path.join(dir, `${safe} (${n++}).pdf`);
  // a cor de fundo da janela pinta as margens do PDF: usar branco enquanto se gera
  const w = BrowserWindow.fromWebContents(event.sender);
  w.setBackgroundColor('#ffffff');
  let pdf;
  try { pdf = await event.sender.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true }); }
  finally { w.setBackgroundColor('#12161b'); }
  fs.writeFileSync(target, pdf);
  shell.openPath(target);
  // relatório finalizado: copiar para a pasta "para enviar" do ambiente de trabalho (uma só vez por versão)
  if (outMeta) { try { outAdd(target, outMeta); } catch (e) { console.error('Pasta para enviar:', e); } }
  return target;
});

// ---------- Servir ficheiros (com suporte de "Range" para avançar nos vídeos) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.ogv': 'video/ogg', '.pdf': 'application/pdf' };
function serveFile(file, req) {
  let st;
  try { st = fs.statSync(file); } catch { return new Response('Não encontrado', { status: 404 }); }
  if (!st.isFile()) return new Response('Não encontrado', { status: 404 });
  const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (m && st.size > 0) {
    let start = m[1] ? +m[1] : st.size - +m[2], end = m[1] && m[2] ? +m[2] : st.size - 1;
    start = Math.max(0, start); end = Math.min(end, st.size - 1);
    if (start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { headers: { ...headers, 'Content-Length': String(st.size) } });
}
function handleProtocol(req) {
  const u = new URL(req.url);
  const p = decodeURIComponent(u.pathname);
  try {
    if (p.startsWith('/data/')) return serveFile(inRoot(p.slice(6)), req);
    const file = path.join(__dirname, path.normalize(p).replace(/^[\\/]+/, ''));
    if (!file.startsWith(__dirname)) return new Response('', { status: 403 });
    return serveFile(file, req);
  } catch (e) { return new Response(String(e.message), { status: 400 }); }
}

// ---------- Migração da base de dados antiga (IndexedDB) para pastas ----------
async function migrateIfNeeded() {
  const old = path.join(app.getPath('userData'), 'IndexedDB', 'file__0.indexeddb.leveldb');
  if (cfg.migrated) return;
  if (!fs.existsSync(old)) { cfg.migrated = true; saveCfg(); return; }
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') } });
  const done = new Promise(res => ipcMain.once('migrate:done', (_e, r) => res(r)));
  w.loadFile(path.join(__dirname, 'index.html'), { query: { migrate: '1' } });
  const r = await Promise.race([done, new Promise(res => setTimeout(() => res({ ok: false, error: 'tempo esgotado' }), 15 * 60 * 1000))]);
  w.destroy();
  if (r.settings) cfg.migratedSettings = r.settings;
  if (r.ok) cfg.migrated = true;
  else dialog.showErrorBox('EndORL', 'Não foi possível copiar os exames antigos para a pasta:\n' + r.error + '\n\nOs dados antigos não foram apagados. A app volta a tentar no próximo arranque.');
  saveCfg();
}

// ---------- Botões da câmara XION (ver xion-buttons.js) ----------
const xion = new XionButtons(ev => { if (win && !win.isDestroyed()) win.webContents.send('xion', ev); });
ipcMain.handle('xion:status', () => ({ enabled: cfg.xionButtons !== false, supported: process.platform === 'win32', status: xion.status, detail: xion.detail, ident: xion.ident }));
ipcMain.handle('xion:log', () => xion.log.join('\n'));
ipcMain.handle('xion:enable', (_e, on) => { cfg.xionButtons = !!on; saveCfg(); on ? xion.start() : (xion.stop(), xion.setStatus('desligado')); });
app.on('will-quit', () => xion.stop());

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 900, minHeight: 600,
    title: 'EndORL', icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#12161b', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('endorl://app/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  loadCfg();
  const ses = session.defaultSession;
  try { ses.setSpellCheckerLanguages(['pt-PT']); } catch {}
  protocol.handle('endorl', handleProtocol);

  // Dar acesso automático à câmara, microfone, pedal (HID) e área de transferência
  const allowed = new Set(['media', 'hid', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen']);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));
  ses.setDevicePermissionHandler(d => d.deviceType === 'hid');

  // Escolher o pedal / botões da câmara quando a página pede um dispositivo HID
  ses.on('select-hid-device', async (event, details, callback) => {
    event.preventDefault();
    const list = details.deviceList;
    if (!list.length) {
      dialog.showMessageBox(win, { type: 'info', title: 'Pedal / botões', message: 'Nenhum pedal ou botão USB compatível foi encontrado.' });
      return callback();
    }
    const names = list.map(d => `${d.name || 'Dispositivo'} (VID ${d.vendorId.toString(16).padStart(4, '0')} / PID ${d.productId.toString(16).padStart(4, '0')})`);
    const { response } = await dialog.showMessageBox(win, {
      type: 'question', title: 'Pedal / botões', message: 'Escolha o pedal ou a câmara com botões:',
      buttons: [...names, 'Cancelar'], cancelId: names.length,
    });
    callback(response < list.length ? list[response].deviceId : undefined);
  });

  // Exportações vão direto para Documentos\EndORL\Exportacoes (sem perguntar)
  ses.on('will-download', (_e, item) => {
    const dir = exportDir();
    let name = item.getFilename(), target = path.join(dir, name), n = 1;
    while (fs.existsSync(target)) target = path.join(dir, name.replace(/(\.\w+)?$/, ` (${n++})$1`));
    item.setSavePath(target);
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Ficheiro', submenu: [
      { label: 'Abrir pasta dos exames', click: () => { fs.mkdirSync(dataRoot(), { recursive: true }); shell.openPath(dataRoot()); } },
      { label: 'Abrir pasta de exportações', click: () => shell.openPath(exportDir()) },
      { label: 'Abrir pasta "Relatórios para enviar"', click: () => shell.openPath(outDir()) },
      { type: 'separator' },
      { label: 'Sair', role: 'quit' },
    ] },
    { label: 'Ver', submenu: [
      { label: 'Atualizar (ler a pasta outra vez)', role: 'reload' },
      { type: 'separator' },
      { label: 'Ecrã inteiro', role: 'togglefullscreen' },
      { label: 'Aumentar', role: 'zoomIn' }, { label: 'Diminuir', role: 'zoomOut' }, { label: 'Tamanho normal', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Ferramentas de programador', role: 'toggleDevTools' },
    ] },
    { label: 'Ajuda', submenu: [
      { label: 'Sobre', click: () => dialog.showMessageBox(win, {
        title: 'Sobre', message: `EndORL ${app.getVersion()}`,
        detail: 'Documentação clínica em vídeo e fotografia.\n\nExames guardados em:\n' + dataRoot(),
      }) },
    ] },
  ]));

  await migrateIfNeeded();
  createWindow();
  if (cfg.xionButtons !== false) xion.start();
});

app.on('window-all-closed', () => app.quit());
