// Ponte segura entre a página e o Electron (só expõe o que é necessário)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  savePDF: name => ipcRenderer.invoke('save-pdf', name),
});
