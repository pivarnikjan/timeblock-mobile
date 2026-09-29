// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// vendor/timeblock is the desktop app's repository (a git submodule), here for
// its packages/core, which this app shares. The rest of it is not part of the app.
const SEP = '[\\\\/]';
const pattern = (...segments) =>
  segments
    .flatMap((s) => s.split(/[\\/]/))
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(SEP);
// Folders are tested too, without a trailing separator — so `packages` and
// `packages/core` themselves must pass, or the crawler never reaches core.
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${pattern(__dirname, 'vendor', 'timeblock')}${SEP}(?!packages(?:$|${SEP}core(?:$|${SEP}))).*`),
];

// expo-sqlite on web (for trying the app in a browser) loads a wasm build; the
// headers it needs are added by scripts/web-preview.mjs (npm run web).
config.resolver.assetExts.push('wasm');

module.exports = config;
