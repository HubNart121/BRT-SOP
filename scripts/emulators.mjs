#!/usr/bin/env node
// Start the local Firebase emulators (Auth + Firestore) used by `npm run dev`.
// Data is kept in .data/emulators between runs (`npm run emulators:reset` clears it).
// Requires Java 21+ on PATH (https://adoptium.net) for the Firestore emulator.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const DATA_DIR = '.data/emulators';

const java = spawnSync('java', ['-version'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (java.status !== 0) {
  console.error('ไม่พบ Java — Firestore Emulator ต้องใช้ Java 21 ขึ้นไป (ดาวน์โหลดได้ที่ https://adoptium.net)');
  process.exit(1);
}

const args = [
  '-y',
  'firebase-tools@15',
  'emulators:start',
  '--only',
  'auth,firestore',
  '--project',
  'demo-brt-sop',
  `--export-on-exit=${DATA_DIR}`,
];
if (fs.existsSync(`${DATA_DIR}/firebase-export-metadata.json`)) args.push(`--import=${DATA_DIR}`);

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
