import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pluginSource = readFileSync(
  resolve(process.cwd(), '../mobile/plugins/withKssengerLibsignal.js'),
  'utf8',
);

const apkWorkflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/android-debug-apk.yml'),
  'utf8',
);

describe('Android libsignal release packaging', () => {
  it('keeps official libsignal pinned and excludes non-Android JNI resources', () => {
    expect(pluginSource).toContain("const SIGNAL_VERSION = '0.100.0'");
    expect(pluginSource).toContain("'libsignal_jni*.dylib'");
    expect(pluginSource).toContain("'signal_jni*.dll'");
    expect(pluginSource).toContain('addSignalPackagingExcludes');
  });

  it('verifies the packaging exclusions survive Expo prebuild before APK assembly', () => {
    expect(apkWorkflow).toContain("grep -F 'libsignal_jni*.dylib' android/app/build.gradle");
    expect(apkWorkflow).toContain("grep -F 'signal_jni*.dll' android/app/build.gradle");
    expect(apkWorkflow).toContain('Build standalone internal release APK');
  });

  it('inspects the assembled APK for Android libsignal JNI and rejects desktop artifacts', () => {
    expect(apkWorkflow).toContain('Inspect final APK libsignal resources');
    expect(apkWorkflow).toContain("libsignal_jni[^/]*\\.dylib|signal_jni[^/]*\\.dll");
    expect(apkWorkflow).toContain("libsignal_jni\\.so$");
    expect(apkWorkflow).toContain("Android libsignal JNI runtime is missing from release APK.");
  });
});
