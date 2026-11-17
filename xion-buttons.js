// Botões da câmara XION Compact (Syntek STK-1160 + driver de filtro XION "xionstkflt.sys").
//
// O driver da XION cria o dispositivo \\.\XionCAMCtl<n>, que permite ler/escrever registos do chip:
//   IOCTL 0x88272004 → texto de identificação (UTF-16)
//   IOCTL 0x88272008 → ler registo   (entrada/saída 4 bytes: [reg lo, reg hi, valor, 0])
//   IOCTL 0x8827200c → escrever registo (entrada 4 bytes: [reg lo, reg hi, valor, 0])
// Tal como o DiVAS: no arranque escreve reg2 = 0xFF e limpa os bits 0–1 do reg3 (linhas dos botões como entradas);
// depois lê os registos 0–3 periodicamente e comunica qualquer mudança. Por omissão, no registo 1: bit 0x02 = fotografia,
// bit 0x01 = gravar (0 = premido); a correspondência real de cada botão pode ser "ensinada" na app (Definições).
//
// Para não precisar de módulos nativos, a leitura é feita por um pequeno processo PowerShell (incluído no Windows)
// que usa as funções do Windows (CreateFile / DeviceIoControl) e escreve as alterações no stdout.
const { spawn } = require('child_process');
const path = require('path');

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
function Emit([string]$s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class XionCtl {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Ansi)]
  static extern SafeFileHandle CreateFileA(string name, uint access, uint share, IntPtr sa, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool DeviceIoControl(SafeFileHandle h, uint code, byte[] inBuf, int inLen, byte[] outBuf, int outLen, out int ret, IntPtr ov);
  static SafeFileHandle h;
  public static string Open() {
    for (int i = 0; i < 8; i++) {
      var x = CreateFileA("\\\\.\\XionCAMCtl" + i, 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
      if (!x.IsInvalid) { h = x; return "XionCAMCtl" + i; }
    }
    return null;
  }
  public static void Close() { if (h != null) { h.Dispose(); h = null; } }
  public static int Read(int reg) {
    var b = new byte[4]; b[0] = (byte)reg; b[1] = (byte)(reg >> 8); int r;
    if (!DeviceIoControl(h, 0x88272008, b, 4, b, 4, out r, IntPtr.Zero)) return -1;
    return b[2];
  }
  public static bool Write(int reg, int v) {
    var b = new byte[4]; b[0] = (byte)reg; b[1] = (byte)(reg >> 8); b[2] = (byte)v; int r;
    return DeviceIoControl(h, 0x8827200c, b, 4, null, 0, out r, IntPtr.Zero);
  }
  public static string Ident() {
    var o = new byte[0x400]; int r;
    if (!DeviceIoControl(h, 0x88272004, null, 0, o, 0x400, out r, IntPtr.Zero)) return "";
    return System.Text.Encoding.Unicode.GetString(o).Split('\0')[0];
  }
}
'@
} catch { Emit ("ERROR " + $_.Exception.Message); exit 2 }
while ($true) {
  $n = [XionCtl]::Open()
  if (-not $n) { Emit "NODEV"; Start-Sleep -Seconds 3; continue }
  Emit ("OPEN " + $n + " " + [XionCtl]::Ident())
  [void][XionCtl]::Write(2, 0xFF)
  $r3 = [XionCtl]::Read(3)
  if ($r3 -ge 0) { [void][XionCtl]::Write(3, ($r3 -band 0xFC)) }
  Emit ("INIT r0=" + [XionCtl]::Read(0) + " r2=" + [XionCtl]::Read(2) + " r3=" + $r3)
  $prev = @(-2, -2, -2, -2); $fails = 0
  while ($true) {
    $bad = $false
    for ($r = 0; $r -lt 4; $r++) {
      $v = [XionCtl]::Read($r)
      if ($v -lt 0) { $bad = $true; break }
      if ($v -ne $prev[$r]) { Emit ("R " + $r + " " + $v); $prev[$r] = $v }
    }
    if ($bad) {
      $fails++
      if ($fails -gt 25) { Emit "LOST"; [XionCtl]::Close(); break }
      Start-Sleep -Milliseconds 200; continue
    }
    $fails = 0
    Start-Sleep -Milliseconds 25
  }
  Start-Sleep -Seconds 2
}
`;

class XionButtons {
  constructor(onEvent) {
    this.onEvent = onEvent; // ({type:'change', reg, prev, val} | {type:'status', ...})
    this.proc = null; this.log = []; this.status = 'parado'; this.ident = '';
    this.regs = {}; this.toggles = {}; this.noisy = {};
  }
  note(s) { this.log.push(`${new Date().toLocaleTimeString('pt-PT')}  ${s}`); if (this.log.length > 200) this.log.shift(); }
  start() {
    if (process.platform !== 'win32' || this.proc) return;
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const enc = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
    try {
      this.proc = spawn(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', enc], { windowsHide: true });
    } catch (e) { this.setStatus('erro', e.message); return; }
    this.setStatus('a procurar');
    let buf = '';
    this.proc.stdout.on('data', d => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { this.line(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
    });
    this.proc.stderr.on('data', d => this.note('stderr: ' + d.toString().trim().slice(0, 300)));
    this.proc.on('exit', code => { this.note('terminou (' + code + ')'); this.proc = null; if (this.status !== 'erro') this.setStatus('parado'); });
  }
  stop() { if (this.proc) { this.proc.kill(); this.proc = null; } }
  setStatus(status, detail = '') { this.status = status; this.detail = detail; this.onEvent({type: 'status', status, detail, ident: this.ident}); }
  line(l) {
    if (!l) return;
    if (!l.startsWith('R ')) this.note(l);
    if (l.startsWith('ERROR')) return this.setStatus('erro', l.slice(6));
    if (l === 'NODEV') { if (this.status !== 'sem câmara') this.setStatus('sem câmara'); return; }
    if (l === 'LOST') { this.regs = {}; return this.setStatus('sem câmara'); }
    if (l.startsWith('OPEN ')) { this.ident = l.slice(5); this.regs = {}; return this.setStatus('ligado', this.ident); }
    if (l.startsWith('R ')) {
      const [, r, val] = l.split(' '), reg = +r, v = +val, prev = this.regs[reg];
      this.regs[reg] = v;
      if (prev === undefined) { this.note(`registo ${reg} = 0x${v.toString(16).padStart(2, '0')} (inicial)`); return; }
      // ignorar bits "instáveis" (que mudam sozinhos muitas vezes por segundo, ex.: estado interno do chip)
      const t = Date.now();
      let diff = prev ^ v;
      for (let bit = 1; bit < 256; bit <<= 1) if (diff & bit) {
        const k = reg + ':' + bit, list = this.toggles[k] ||= [];
        list.push(t); while (list.length && t - list[0] > 2000) list.shift();
        if (list.length > 8 && !this.noisy[k]) { this.noisy[k] = true; this.note(`registo ${reg} bit 0x${bit.toString(16)} instável — ignorado`); }
        if (this.noisy[k]) diff &= ~bit;
      }
      if (!diff) return;
      this.note(`registo ${reg}: 0x${prev.toString(16).padStart(2, '0')} → 0x${v.toString(16).padStart(2, '0')} (bits 0x${diff.toString(16)})`);
      this.onEvent({type: 'change', reg, prev, val: v, diff});
    }
  }
}
module.exports = { XionButtons };
