// Signs debug and release builds with your own key instead of React Native's public debug key,
// whenever Gradle is given one (scripts\deploy.ps1 passes it for each build):
//
//   timeblockKeystore           path to the PKCS12 keystore (deploy.ps1 -NewKey creates it)
//   timeblockKeystorePassword   its password (the store and key passwords are one in PKCS12)
//   timeblockKeyAlias           optional, 'timeblock' by default
//
// Without timeblockKeystore the build signs with the debug key, as the template does. android\ is
// generated, so this is how the signing setup survives a regeneration.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @generated timeblock-signing';

const SIGNING_CONFIG = `
        ${MARKER} (plugins/with-own-signing-key.js)
        if (findProperty('timeblockKeystore')) {
            timeblock {
                storeFile file(findProperty('timeblockKeystore'))
                storeType 'pkcs12'
                storePassword findProperty('timeblockKeystorePassword')
                keyAlias findProperty('timeblockKeyAlias') ?: 'timeblock'
                keyPassword findProperty('timeblockKeystorePassword')
            }
        }`;

const USE_DEBUG_KEY = 'signingConfig signingConfigs.debug';
const USE_OWN_KEY = "signingConfig findProperty('timeblockKeystore') ? signingConfigs.timeblock : signingConfigs.debug";

function addSigning(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!/signingConfigs \{/.test(contents) || !contents.includes(USE_DEBUG_KEY)) {
    throw new Error(
      'with-own-signing-key: android/app/build.gradle no longer has the template\'s signingConfigs block ' +
        `or "${USE_DEBUG_KEY}" - update the plugin for the new template.`,
    );
  }
  return contents.replace(/signingConfigs \{/, (match) => match + SIGNING_CONFIG).replaceAll(USE_DEBUG_KEY, USE_OWN_KEY);
}

module.exports = function withOwnSigningKey(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('with-own-signing-key: expected a Groovy android/app/build.gradle.');
    }
    config.modResults.contents = addSigning(config.modResults.contents);
    return config;
  });
};
