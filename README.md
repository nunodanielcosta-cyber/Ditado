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

### Botões da câmara XION (v1.6)

O driver da XION (`xionstkflt.sys`) cria `\\.\XionCAMCtl0`, com comandos para ler/escrever registos do chip
(`0x88272004` identificação, `0x88272008` ler, `0x8827200c` escrever). Tal como o DiVAS, a app escreve reg2=0xFF,
põe os bits 0–1 do reg3 a 0 e lê o registo 1 periodicamente: bit `0x02` = botão A, bit `0x01` = botão B (0 = premido).
A leitura é feita por um processo PowerShell (`xion-buttons.js`), sem módulos nativos. Em **Definições → Botões da câmara XION**
escolhe-se a ação de cada botão e há um **Diagnóstico** com o registo das leituras.

### Melhoria de imagem (v1.6)

Botão **Imagem**: correção das riscas do vídeo entrelaçado (desentrelaçamento adaptativo, só onde há movimento),
brilho, contraste, saturação, nitidez e gama, em WebGL. O vídeo ao vivo, as fotografias e as gravações ficam com a melhoria.

### Proporção 4:3 e redução de ruído (v1.7)

- **Proporção:** o vídeo analógico digitalizado (PAL 720×576, NTSC 720×480) tem pontos retangulares; a app mostra e grava
  em 4:3 (768×576 / 640×480), para a imagem não ficar "apertada" na horizontal. Desligável no painel **Imagem**.
- **Ruído:** filtro temporal (compara cada imagem com a anterior) aplicado só onde não há movimento, para não deixar rasto.
  Num teste com ruído moderado, o ruído desceu para metade (desvio-padrão 8,1 → 4,1).

### Análise de voz (v1.8) — `voice.js`

Painel **Voz**: F0 em tempo real (algoritmo YIN), intensidade (dB relativos; ajustável em "Calibração"), gráfico dos
últimos 8 s, medição de F0/intensidade em 5 s (média, DP, mínimo, máximo) e tempo máximo de fonação.
"Guardar na sessão" e, no relatório, "Inserir medições da sessão".

### Estroboscopia retrospetiva (v1.8, experimental) — `strobe.js`

1. Painel Voz → **Gravar /i/ para estroboscopia** (3,5 s de vídeo sem filtros + microfone).
2. Desenhar a zona da glote e **Analisar**: separa os 2 campos de cada imagem (50 amostras/s), mede o F0 no áudio,
   procura a frequência aparente (F0 mod 50 Hz) que ordena os campos de forma mais contínua, agrupa-os por fase e
   reconstrói um ciclo (animação, curva da área glótica, quimograma, quociente de abertura aproximado).
3. Qualidade da reconstrução = coerência da ordenação × variação da abertura entre fases (imagens desfocadas → "fraca").
Testado com vídeo sintético entrelaçado (F0 187 Hz): correlação 0,99 com o ciclo real; com imagens desfocadas
(exposição de 20 ms) ou F0 múltiplo de 50 Hz a ferramenta indica qualidade fraca. Uso experimental, não diagnóstico.

### v1.9

- **Vídeos em MP4 (H.264)**; com som, o áudio fica em Opus. Os clips internos da estroboscopia continuam em WebM.
- **Modelos de relatório editáveis** (Definições → Editar modelos de relatório): título, técnica, conclusão normal,
  texto livre normal, campos (texto normal e achados frequentes) e novos tipos de exame. Ficam em
  `<pasta dos exames>\_config\modelos.json`, partilhados pelos postos que usam a mesma pasta. Código: `templates.js`.
- **Finalizar e assinar** (`signoff.js`): número ORL-AAAA-NNNN (contador em `_config\contador.json`, sem repetir números),
  bloqueio, código de verificação (SHA-256), versões com motivo ("Reabrir"), registo na sessão, assinatura digitalizada
  e PDF final guardado na pasta do exame. Não é assinatura digital qualificada.
- **Videoendoscopia da deglutição (FEES)** (`fees.js`): avaliação pré-deglutição (Murray, sensibilidade, encerramento
  velofaríngeo…), tabela de testes com bolo (IDDSI, escape, PAS 1–8, resíduos pela escala de Yale, reação), FOIS e dieta
  recomendada, e conclusão gerada a partir dos parâmetros.
- **Editar / apagar doentes e exames** (botões "Doente" e "Exame"); apagar com relatório finalizado exige confirmar o número.
- **Botões da câmara**: leitura dos registos 0–3 e modo "Ensinar" para associar cada botão (Definições).
