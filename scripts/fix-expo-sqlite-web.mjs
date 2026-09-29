// Runs after `npm install`. expo-sqlite 57's web build (used only by the
// browser preview, `npm run web`) passes each synchronous result's length
// through a Uint8Array.set(), which keeps only its lowest byte — so every
// result longer than 255 bytes arrives cut short ("Unterminated string in
// JSON"). This writes the length as the 32-bit number the reader expects.
// Android is not affected. Does nothing once expo-sqlite ships a fix.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'node_modules/expo-sqlite/web/WorkerChannel.ts';
const broken = 'resultArray.set(new Uint32Array([length]), 0);';
const fixed = 'new Uint32Array(resultBuffer, 0, 1)[0] = length; // fixed by scripts/fix-expo-sqlite-web.mjs';

if (existsSync(file)) {
  const source = readFileSync(file, 'utf8');
  if (source.includes(broken)) {
    writeFileSync(file, source.replace(broken, fixed));
    console.log('fix-expo-sqlite-web: patched the web sync result length in expo-sqlite');
  }
}
