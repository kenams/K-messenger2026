const { withProjectBuildGradle, withAppBuildGradle } = require('expo/config-plugins');

const SIGNAL_VERSION = '0.100.0';
const SIGNAL_MAVEN = 'https://build-artifacts.signal.org/libraries/maven/';

function addSignalRepository(contents) {
  if (contents.includes(SIGNAL_MAVEN)) return contents;

  const anchor = /allprojects\s*\{[\s\S]*?repositories\s*\{/m;
  const match = contents.match(anchor);
  if (!match || match.index == null) {
    throw new Error('KSSENGER_LIBSIGNAL_REPOSITORY_ANCHOR_NOT_FOUND');
  }

  const insertAt = match.index + match[0].length;
  return `${contents.slice(0, insertAt)}\n        maven { url '${SIGNAL_MAVEN}' }${contents.slice(insertAt)}`;
}

function addSignalDependencies(contents) {
  const client = `implementation(\"org.signal:libsignal-client:${SIGNAL_VERSION}\")`;
  const android = `implementation(\"org.signal:libsignal-android:${SIGNAL_VERSION}\")`;
  if (contents.includes(client) && contents.includes(android)) return contents;

  const match = contents.match(/dependencies\s*\{/m);
  if (!match || match.index == null) {
    throw new Error('KSSENGER_LIBSIGNAL_DEPENDENCY_ANCHOR_NOT_FOUND');
  }

  const insertAt = match.index + match[0].length;
  const lines = [
    '',
    '    // Official Signal Messenger libsignal native runtime. Do not replace with custom crypto.',
    `    ${client}`,
    `    ${android}`,
  ].join('\n');
  return `${contents.slice(0, insertAt)}${lines}${contents.slice(insertAt)}`;
}

module.exports = function withKssengerLibsignal(config) {
  config = withProjectBuildGradle(config, (projectConfig) => {
    if (projectConfig.modResults.language !== 'groovy') {
      throw new Error('KSSENGER_LIBSIGNAL_REQUIRES_GROOVY_PROJECT_GRADLE');
    }
    projectConfig.modResults.contents = addSignalRepository(projectConfig.modResults.contents);
    return projectConfig;
  });

  config = withAppBuildGradle(config, (appConfig) => {
    if (appConfig.modResults.language !== 'groovy') {
      throw new Error('KSSENGER_LIBSIGNAL_REQUIRES_GROOVY_APP_GRADLE');
    }
    appConfig.modResults.contents = addSignalDependencies(appConfig.modResults.contents);
    return appConfig;
  });

  return config;
};

module.exports.SIGNAL_VERSION = SIGNAL_VERSION;
