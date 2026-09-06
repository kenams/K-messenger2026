const fs = require('fs');
const path = require('path');
const { withProjectBuildGradle, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

// CRITICAL FIX (2026-09-05): the release APK build (EAS "preview" profile)
// runs R8/ProGuard minification with zero keep rules for libsignal or the
// custom native module. libsignal-client/-android load classes via JNI,
// which R8's static analysis cannot see as "used" -- it stripped/renamed
// them, causing an immediate native crash on app launch before any JS ever
// ran (matches the real report: app opens then closes instantly). This mod
// appends the required keep rules to the generated proguard-rules.pro.
const PROGUARD_RULES = `
# K-ssenger libsignal native runtime (JNI-loaded, invisible to R8 static analysis).
-keep class org.signal.libsignal.** { *; }
-keepclassmembers class org.signal.libsignal.** { *; }
-keep class com.kahdigital.kssenger.signal.** { *; }
-dontwarn org.signal.libsignal.**
`;

function withKssengerLibsignalProguard(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const proguardPath = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(proguardPath) ? fs.readFileSync(proguardPath, 'utf8') : '';
      if (!current.includes('org.signal.libsignal')) {
        fs.writeFileSync(proguardPath, `${current}\n${PROGUARD_RULES}`);
      }
      return modConfig;
    },
  ]);
}

const SIGNAL_VERSION = '0.100.0';
const SIGNAL_MAVEN = 'https://build-artifacts.signal.org/libraries/maven/';
const DESUGAR_VERSION = '2.1.5';
const SIGNAL_NON_ANDROID_RESOURCES = ['libsignal_jni*.dylib', 'signal_jni*.dll'];

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

function enableCoreLibraryDesugaring(contents) {
  if (contents.includes('coreLibraryDesugaringEnabled true')) return contents;

  const compileOptions = contents.match(/compileOptions\s*\{/m);
  if (compileOptions && compileOptions.index != null) {
    const insertAt = compileOptions.index + compileOptions[0].length;
    return `${contents.slice(0, insertAt)}\n        coreLibraryDesugaringEnabled true${contents.slice(insertAt)}`;
  }

  const android = contents.match(/android\s*\{/m);
  if (!android || android.index == null) {
    throw new Error('KSSENGER_LIBSIGNAL_ANDROID_BLOCK_NOT_FOUND');
  }

  const insertAt = android.index + android[0].length;
  const block = [
    '',
    '    compileOptions {',
    '        coreLibraryDesugaringEnabled true',
    '    }',
  ].join('\n');
  return `${contents.slice(0, insertAt)}${block}${contents.slice(insertAt)}`;
}

function addSignalDependencies(contents) {
  const desugar = `coreLibraryDesugaring(\"com.android.tools:desugar_jdk_libs:${DESUGAR_VERSION}\")`;
  const client = `implementation(\"org.signal:libsignal-client:${SIGNAL_VERSION}\")`;
  const android = `implementation(\"org.signal:libsignal-android:${SIGNAL_VERSION}\")`;
  if (contents.includes(desugar) && contents.includes(client) && contents.includes(android)) return contents;

  const match = contents.match(/dependencies\s*\{/m);
  if (!match || match.index == null) {
    throw new Error('KSSENGER_LIBSIGNAL_DEPENDENCY_ANCHOR_NOT_FOUND');
  }

  const insertAt = match.index + match[0].length;
  const lines = [
    '',
    '    // Official Signal Messenger libsignal native runtime. Do not replace with custom crypto.',
    `    ${desugar}`,
    `    ${client}`,
    `    ${android}`,
  ].join('\n');
  return `${contents.slice(0, insertAt)}${lines}${contents.slice(insertAt)}`;
}

function addSignalPackagingExcludes(contents) {
  if (SIGNAL_NON_ANDROID_RESOURCES.every((resource) => contents.includes(resource))) return contents;

  const resourcesBlock = [
    '',
    '        // libsignal-client also publishes desktop JNI resources; never package them into Android.',
    `        resources { excludes += ${JSON.stringify(SIGNAL_NON_ANDROID_RESOURCES)} }`,
  ].join('\n');

  const packagingOptions = contents.match(/packagingOptions\s*\{/m);
  if (packagingOptions && packagingOptions.index != null) {
    const insertAt = packagingOptions.index + packagingOptions[0].length;
    return `${contents.slice(0, insertAt)}${resourcesBlock}${contents.slice(insertAt)}`;
  }

  const android = contents.match(/android\s*\{/m);
  if (!android || android.index == null) {
    throw new Error('KSSENGER_LIBSIGNAL_ANDROID_BLOCK_NOT_FOUND');
  }

  const insertAt = android.index + android[0].length;
  const packagingBlock = [
    '',
    '    packagingOptions {',
    '        // libsignal-client also publishes desktop JNI resources; never package them into Android.',
    `        resources { excludes += ${JSON.stringify(SIGNAL_NON_ANDROID_RESOURCES)} }`,
    '    }',
  ].join('\n');
  return `${contents.slice(0, insertAt)}${packagingBlock}${contents.slice(insertAt)}`;
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
    appConfig.modResults.contents = enableCoreLibraryDesugaring(appConfig.modResults.contents);
    appConfig.modResults.contents = addSignalDependencies(appConfig.modResults.contents);
    appConfig.modResults.contents = addSignalPackagingExcludes(appConfig.modResults.contents);
    return appConfig;
  });

  config = withKssengerLibsignalProguard(config);

  return config;
};

module.exports.SIGNAL_VERSION = SIGNAL_VERSION;
module.exports.DESUGAR_VERSION = DESUGAR_VERSION;
module.exports.SIGNAL_NON_ANDROID_RESOURCES = SIGNAL_NON_ANDROID_RESOURCES;
