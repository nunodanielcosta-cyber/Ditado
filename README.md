# Ditado
Ditado medico

## EndORL (`index.html`)

Aplicação web de documentação clínica em vídeo/fotografia, inspirada na funcionalidade do DiVAS Mini
(doentes → sessões → captura de imagem/vídeo → exportação/relatório). Abrir `index.html` num browser
(Chrome/Edge/Firefox; servir por `http://localhost` ou HTTPS para ter acesso à câmara).
Os dados ficam guardados localmente no browser (IndexedDB); use "Cópia de segurança" para exportar.

Atalhos: Espaço = fotografia, R = gravar/parar, ←/→ = frame anterior/seguinte.

### Versão de computador (Windows .exe)

- `main.js` + `package.json`: empacota a app com Electron. A câmara, o microfone e o pedal USB são autorizados automaticamente.
- As exportações vão para `Documentos\EndORL\Exportacoes`.
- Compilar localmente: `npm install` e depois `npm run dist:win` (gera `dist/EndORL-<versão>-portatil.exe`).
- Cada push no GitHub compila o `.exe` portátil e o instalador (Actions → "Compilar .exe Windows" → Artifacts).
- Pedal / botões da câmara: botão "Pedal / botões". O 1.º botão premido = fotografia, o 2.º = gravar.

### Relatórios de exame

- Botão **📝 Relatório** (na sessão): modelos para **Sinuscopia**, **Rinoscopia posterior**, **Laringoscopia** e **Estroboscopia**.
  Cada secção começa com o texto "normal" e tem uma lista de achados frequentes para inserir com um clique.
- Seleção das imagens do relatório (fotografias ou frames capturados do vídeo com "🖼 Capturar do vídeo" / tecla C), com legendas, 2–4 por linha.
- Imprimir ou **Guardar PDF** (na versão .exe vai para `Documentos\EndORL\Relatorios`).
- O cabeçalho (nome da clínica, contactos, logótipo) define-se em **Definições**.
- Os textos dos modelos estão no objeto `EXAMS` em `index.html` e podem ser alterados.

### Logótipo e cabeçalho

O relatório traz no topo "Hospital de Braga — Serviço de Otorrinolaringologia" (editável em Definições).
Para incluir o logótipo oficial em todas as instalações, coloque o ficheiro `logo.png` na raiz do repositório
e volte a compilar. Em alternativa, carregue-o em **Definições → Logótipo** (fica guardado nesse computador).

### Logótipo da app

`build/logo.svg` (original) e `build/icon.png` (512×512, ícone do .exe e da janela): vista endoscópica circular da glote.

### Onde ficam os exames (versão .exe)

Cada exame fica como ficheiros normais, numa pasta escolhida em **Definições → Pasta dos exames**
(por omissão `Documentos\EndORL\Exames`; pode ser um disco local ou uma pasta de rede):

```
<pasta dos exames>\
  └─ <n.º processo>_<Apelido>_<Nome>\
      ├─ doente.json
      └─ <AAAA-MM-DD_HHMM>_<Exame>\
          ├─ img001.jpg  frame003.jpg  video002.webm
          ├─ Relatorio_<Exame>_<Doente>_<data>.pdf
          └─ sessao.json   (dados do exame, relatório e lista de ficheiros)
```

- Na primeira execução, os exames guardados pelas versões anteriores (base de dados interna) são copiados para esta estrutura.
  A base antiga não é apagada.
- **Ver → Atualizar** (Ctrl+R) volta a ler a pasta (útil quando outro posto grava na mesma pasta de rede).
- A versão de browser (`index.html` aberto no Chrome/Edge) continua a guardar no próprio browser.

### Câmara XION Compact (USB)

A XION Compact é uma placa de captura de vídeo analógico com o chip Syntek STK-1160 (USB `05e1:0408`, driver `StkCMini.sys`
+ filtro XION `xionstkflt.sys` para os botões). A app usa por omissão o modo de captura **DirectShow** (o mesmo do DiVAS),
porque o Media Foundation (o modo por omissão do Chrome/Edge) não arranca com estes drivers antigos.
O modo pode ser mudado em **Definições → Modo de captura**. Para câmaras analógicas, a resolução PAL é 720×576.
