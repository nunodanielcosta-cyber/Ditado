// Ponte segura entre a página e o Electron (só expõe o que é necessário)
const { contextBridge, ipcRenderer } = require('electron');
const call = ch => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('desktop', {
  savePDF: call('save-pdf'),
  outStatus: call('out:status'),
  outOpen: call('out:open'),
  outArchive: call('out:archive'),
  migratedSettings: call('cfg:migratedSettings'),
  captureMode: call('cfg:capture'),
  setCaptureMode: call('cfg:setCapture'),
  migrateDone: r => ipcRenderer.send('migrate:done', r),
  // Botões da câmara XION
  onXion: cb => ipcRenderer.on('xion', (_e, ev) => cb(ev)),
  xionStatus: call('xion:status'),
  xionLog: call('xion:log'),
  xionEnable: call('xion:enable'),
  // Exames guardados como ficheiros, dentro da pasta escolhida nas Definições
  store: {
    root: call('store:root'),
    scan: call('store:scan'),
    mkUnique: call('store:mkUnique'),
    moveUnique: call('store:moveUnique'),
    readJSON: call('store:readJSON'),
    writeJSON: call('store:writeJSON'),
    writeFile: call('store:writeFile'),
    remove: call('store:remove'),
    openFolder: call('store:openFolder'),
    chooseRoot: call('store:chooseRoot'),
    setRoot: call('store:setRoot'),
  },
});
