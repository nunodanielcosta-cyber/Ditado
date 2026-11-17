// EndORL — aplicação de computador (Electron) que corre o index.html
const { app, BrowserWindow, Menu, dialog, shell, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Só uma instância aberta de cada vez (a câmara não pode ser partilhada)
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// Manter os dados (doentes, sessões, imagens) das versões anteriores ("EndoORL", "Ditado Video")
{
  const dir = n => path.join(app.getPath('appData'), n);
  const hasData = d => fs.existsSync(path.join(d, 'IndexedDB'));
  const found = ['EndORL', 'EndoORL', 'Ditado Video'].map(dir).find(hasData);
  app.setPath('userData', found || dir('EndORL'));
}

let win;
const exportDir = () => {
  const d = path.join(app.getPath('documents'), 'EndORL', 'Exportacoes');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

const reportDir = () => {
  const d = path.join(app.getPath('documents'), 'EndORL', 'Relatorios');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

// Guardar o relatório (área de impressão da página) como PDF A4
ipcMain.handle('save-pdf', async (event, name) => {
  const safe = String(name || 'Relatorio').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150);
  let target = path.join(reportDir(), safe + '.pdf'), n = 1;
  while (fs.existsSync(target)) target = path.join(reportDir(), `${safe} (${n++}).pdf`);
  // a cor de fundo da janela pinta as margens do PDF: usar branco enquanto se gera
  const w = BrowserWindow.fromWebContents(event.sender);
  w.setBackgroundColor('#ffffff');
  let pdf;
  try { pdf = await event.sender.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true }); }
  finally { w.setBackgroundColor('#12161b'); }
  fs.writeFileSync(target, pdf);
  shell.openPath(target);
  return target;
});

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 900, minHeight: 600,
    title: 'EndORL', icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#12161b', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  const ses = session.defaultSession;
  try { ses.setSpellCheckerLanguages(['pt-PT']); } catch {}

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
      { label: 'Abrir pasta de exportações', click: () => shell.openPath(exportDir()) },
      { label: 'Abrir pasta de relatórios', click: () => shell.openPath(reportDir()) },
      { type: 'separator' },
      { label: 'Sair', role: 'quit' },
    ] },
    { label: 'Ver', submenu: [
      { label: 'Ecrã inteiro', role: 'togglefullscreen' },
      { label: 'Aumentar', role: 'zoomIn' }, { label: 'Diminuir', role: 'zoomOut' }, { label: 'Tamanho normal', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Recarregar', role: 'reload' },
      { label: 'Ferramentas de programador', role: 'toggleDevTools' },
    ] },
    { label: 'Ajuda', submenu: [
      { label: 'Sobre', click: () => dialog.showMessageBox(win, {
        title: 'Sobre', message: `EndORL ${app.getVersion()}`,
        detail: 'Documentação clínica em vídeo e fotografia.\nDados guardados em:\n' + app.getPath('userData'),
      }) },
    ] },
  ]));

  createWindow();
});

app.on('window-all-closed', () => app.quit());
