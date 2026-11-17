// Ditado Video — aplicação de computador (Electron) que corre o index.html
const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Só uma instância aberta de cada vez (a câmara não pode ser partilhada)
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win;
const exportDir = () => {
  const d = path.join(app.getPath('documents'), 'Ditado Video', 'Exportacoes');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 900, minHeight: 600,
    title: 'Ditado Video', backgroundColor: '#12161b', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  const ses = session.defaultSession;

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

  // Exportações vão direto para Documentos\Ditado Video\Exportacoes (sem perguntar)
  ses.on('will-download', (_e, item) => {
    const dir = exportDir();
    let name = item.getFilename(), target = path.join(dir, name), n = 1;
    while (fs.existsSync(target)) target = path.join(dir, name.replace(/(\.\w+)?$/, ` (${n++})$1`));
    item.setSavePath(target);
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Ficheiro', submenu: [
      { label: 'Abrir pasta de exportações', click: () => shell.openPath(exportDir()) },
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
        title: 'Sobre', message: `Ditado Video ${app.getVersion()}`,
        detail: 'Documentação clínica em vídeo e fotografia.\nDados guardados em:\n' + app.getPath('userData'),
      }) },
    ] },
  ]));

  createWindow();
});

app.on('window-all-closed', () => app.quit());
