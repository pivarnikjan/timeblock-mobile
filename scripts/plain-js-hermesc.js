// Stands in for hermesc (the Hermes bytecode compiler) when Windows will not run it - Smart App
// Control blocks the unsigned hermesc.exe. React Native's Gradle plugin calls it as
//
//   hermesc -w -emit-binary -max-diagnostic-width=80 -out <bundle>.hbc <bundle> [flags]
//
// and then moves <bundle>.hbc over <bundle>. This copies the JavaScript bundle unchanged instead,
// so the APK carries plain JavaScript, which Hermes on the phone compiles as it loads it. The app
// is the same; it starts a little slower than with bytecode.
//
// Used only when Gradle is given timeblockPlainJs (plugins/with-plain-js-bundle.js; deploy.ps1
// passes it when hermesc cannot run).
const fs = require('node:fs');

const args = process.argv.slice(2);
const outAt = args.indexOf('-out');
if (outAt < 0 || outAt + 1 >= args.length) {
  console.error('plain-js-hermesc: expected "-out <file>" in: ' + args.join(' '));
  process.exit(1);
}
const out = args[outAt + 1];
const inputs = args.filter((arg, i) => i !== outAt + 1 && !arg.startsWith('-'));
if (inputs.length !== 1) {
  console.error('plain-js-hermesc: expected one input bundle, got: ' + (inputs.join(', ') || 'none'));
  process.exit(1);
}
fs.copyFileSync(inputs[0], out);
console.log(`plain-js-hermesc: ${inputs[0]} copied as plain JavaScript (no bytecode)`);
