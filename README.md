# Ditado
Ditado medico

## Ditado Vídeo (`index.html`)

Aplicação web de documentação clínica em vídeo/fotografia, inspirada na funcionalidade do DiVAS Mini
(doentes → sessões → captura de imagem/vídeo → exportação/relatório). Abrir `index.html` num browser
(Chrome/Edge/Firefox; servir por `http://localhost` ou HTTPS para ter acesso à câmara).
Os dados ficam guardados localmente no browser (IndexedDB); use "Cópia de segurança" para exportar.

Atalhos: Espaço = fotografia, R = gravar/parar, ←/→ = frame anterior/seguinte.

### Versão de computador (Windows .exe)

- `main.js` + `package.json`: empacota a app com Electron. A câmara, o microfone e o pedal USB são autorizados automaticamente.
- As exportações vão para `Documentos\Ditado Video\Exportacoes`.
- Compilar localmente: `npm install` e depois `npm run dist:win` (gera `dist/DitadoVideo-<versão>-portatil.exe`).
- Cada push no GitHub compila o `.exe` portátil e o instalador (Actions → "Compilar .exe Windows" → Artifacts).
- Pedal / botões da câmara: botão "Pedal / botões". O 1.º botão premido = fotografia, o 2.º = gravar.
