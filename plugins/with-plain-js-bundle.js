// Lets a release build ship its JavaScript as plain source instead of Hermes bytecode, whenever
// Gradle is given the timeblockPlainJs property (scripts\deploy.ps1 passes it when Windows blocks
// hermesc.exe - Smart App Control does, as the file is unsigned):
//
//   timeblockPlainJs   any value: replace hermesc with scripts/plain-js-hermesc, which copies the
//                      bundle unchanged; Hermes on the phone compiles it as it loads it
//
// Without the property the build compiles bytecode, as the template does. android\ is generated,
// so this is how the setting survives a regeneration.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @generated timeblock-plain-js';

const PLAIN_JS = `
    ${MARKER} (plugins/with-plain-js-bundle.js)
    if (findProperty('timeblockPlainJs')) {
        hermesCommand = new File(projectRoot, "scripts/plain-js-hermesc" + (System.getProperty('os.name').toLowerCase().contains('windows') ? '.cmd' : '.sh')).getAbsolutePath()
        // No compiler source map to compose with Metro's.
        hermesFlags = []
    }`;

const HERMES_COMMAND = /^(\s*hermesCommand = .*)$/m;

function addPlainJs(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!HERMES_COMMAND.test(contents) || !contents.includes('def projectRoot')) {
    throw new Error(
      'with-plain-js-bundle: android/app/build.gradle no longer sets hermesCommand in its react block ' +
        'or no longer defines projectRoot - update the plugin for the new template.',
    );
  }
  return contents.replace(HERMES_COMMAND, (line) => line + PLAIN_JS);
}

module.exports = function withPlainJsBundle(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('with-plain-js-bundle: expected a Groovy android/app/build.gradle.');
    }
    config.modResults.contents = addPlainJs(config.modResults.contents);
    return config;
  });
};
