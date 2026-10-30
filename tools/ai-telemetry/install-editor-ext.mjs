#!/usr/bin/env node
// Runs on `npm install` (postinstall): packs extensions/ai-paste-tracker into a .vsix and
// installs it into every VS Code-family editor found (VS Code, Cursor, Windsurf, VSCodium...),
// so pastes and Copilot/Tab inserts are tracked without a manual step.
// `--pack-only` just writes the .vsix. Never fails the install.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT, log } from './lib/env.mjs';

const EXT_DIR = path.join(REPO_ROOT, 'extensions', 'ai-paste-tracker');
const VSIX = path.join(EXT_DIR, 'ai-paste-tracker.vsix');
const CLI_NAMES = ['code', 'code-insiders', 'cursor', 'windsurf', 'codium', 'antigravity'];

// ---- .vsix packing (a zip with a manifest; no vsce/network needed) --------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Stored (uncompressed) zip; the extension is a few KB.
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pack() {
  const pkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'package.json'), 'utf8'));
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}" />
    <DisplayName>${xml(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(pkg.description)}</Description>
    <Categories>Other</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines.vscode)}" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`;
  const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json" /><Default Extension=".js" ContentType="application/javascript" /><Default Extension=".vsixmanifest" ContentType="text/xml" /></Types>
`;
  const files = fs.readdirSync(EXT_DIR).filter((f) => !f.endsWith('.vsix') && fs.statSync(path.join(EXT_DIR, f)).isFile());
  fs.writeFileSync(
    VSIX,
    zip([
      { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
      { name: 'extension.vsixmanifest', data: Buffer.from(manifest) },
      ...files.map((f) => ({ name: `extension/${f}`, data: fs.readFileSync(path.join(EXT_DIR, f)) })),
    ]),
  );
  return `${pkg.publisher}.${pkg.name}`;
}

// ---- finding editor CLIs ---------------------------------------------------------------------

const isWin = process.platform === 'win32';

function onPath(name) {
  const exts = isWin ? ['.cmd', '.exe', '.bat'] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const ext of exts) {
      const file = path.join(dir, name + ext);
      if (dir && fs.existsSync(file)) return file;
    }
  }
  return null;
}

// Default install locations, for editors whose CLI was never added to PATH.
function defaultLocations() {
  const home = os.homedir();
  if (isWin) {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
    return [
      path.join(local, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
      path.join(pf, 'Microsoft VS Code', 'bin', 'code.cmd'),
      path.join(local, 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
      path.join(local, 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd'),
      path.join(local, 'Programs', 'Windsurf', 'bin', 'windsurf.cmd'),
      path.join(local, 'Programs', 'VSCodium', 'bin', 'codium.cmd'),
    ];
  }
  if (process.platform === 'darwin') {
    const apps = [
      ['Visual Studio Code', 'code'],
      ['Visual Studio Code - Insiders', 'code-insiders'],
      ['Cursor', 'cursor'],
      ['Windsurf', 'windsurf'],
      ['VSCodium', 'codium'],
    ];
    return ['/Applications', path.join(home, 'Applications')].flatMap((dir) =>
      apps.map(([app, cli]) => path.join(dir, `${app}.app`, 'Contents', 'Resources', 'app', 'bin', cli)),
    );
  }
  return ['/usr/share/code/bin/code', '/usr/share/cursor/resources/app/bin/cursor', '/snap/bin/code', '/usr/share/windsurf/bin/windsurf'];
}

function findClis() {
  const seen = new Set();
  const clis = [];
  for (const file of [...CLI_NAMES.map(onPath), ...defaultLocations()]) {
    if (!file || !fs.existsSync(file)) continue;
    let key;
    try {
      key = fs.realpathSync(file).toLowerCase();
    } catch {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    clis.push(file);
  }
  return clis;
}

function run(cli, args) {
  // .cmd launchers need a shell on Windows; quote everything for paths with spaces.
  const res = isWin
    ? spawnSync([cli, ...args].map((a) => `"${a}"`).join(' '), { shell: true, encoding: 'utf8', timeout: 120_000 })
    : spawnSync(cli, args, { encoding: 'utf8', timeout: 120_000 });
  return { ok: res.status === 0, out: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim() };
}

// ---- main ------------------------------------------------------------------------------------

function main() {
  const id = pack();
  if (process.argv.includes('--pack-only')) return console.log(`[ai-telemetry] wrote ${path.relative(REPO_ROOT, VSIX)}`);
  if (process.env.CI || process.env.AI_TELEMETRY_DISABLED === '1' || process.env.AI_TELEMETRY_SKIP_EXT === '1') return;

  const clis = findClis();
  const installed = [];
  for (const cli of clis) {
    const { ok, out } = run(cli, ['--install-extension', VSIX, '--force']);
    if (ok) installed.push(path.basename(cli).replace(/\.(cmd|exe|bat)$/i, ''));
    else log('[install-editor-ext]', cli, out);
  }

  if (installed.length) {
    console.log(`[ai-telemetry] Paste tracker (${id}) installed in: ${installed.join(', ')}.`);
    console.log('[ai-telemetry] Reload any open editor window (Command Palette → "Developer: Reload Window").');
  } else {
    console.warn('[ai-telemetry] Could not install the paste tracker extension automatically (no VS Code / Cursor / Windsurf found).');
    console.warn(`[ai-telemetry] Install it by hand: Extensions → "Install from VSIX…" → ${VSIX}`);
  }
}

try {
  main();
} catch (err) {
  log('[install-editor-ext]', err);
  console.warn(`[ai-telemetry] Paste tracker extension not installed: ${err.message}`);
}
