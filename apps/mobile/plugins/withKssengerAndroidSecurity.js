const { withAndroidManifest } = require('expo/config-plugins');

// K-ssenger Android hardening. libsignal / native E2EE were removed (they
// crashed the APK on launch and were never usable); this keeps the one
// transport-security guarantee that plugin also enforced: no cleartext HTTP.
module.exports = function withKssengerAndroidSecurity(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('KSSENGER_ANDROID_APPLICATION_MANIFEST_MISSING');
    application.$ = application.$ || {};
    application.$['android:usesCleartextTraffic'] = 'false';
    return manifestConfig;
  });
};
