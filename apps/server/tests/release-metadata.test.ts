import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), '../mobile/app.json'), 'utf8'),
) as {
  expo?: {
    name?: string;
    version?: string;
    runtimeVersion?: { policy?: string };
    ios?: { bundleIdentifier?: string; buildNumber?: string };
    android?: { package?: string; versionCode?: number };
  };
};

const easConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), '../mobile/eas.json'), 'utf8'),
) as {
  build?: { production?: { autoIncrement?: boolean } };
};

describe('K-ssenger V1 release metadata', () => {
  it('uses stable store identifiers and V1 semantic versioning', () => {
    expect(appConfig.expo?.name).toBe('K-ssenger');
    expect(appConfig.expo?.version).toBe('1.0.0');
    expect(appConfig.expo?.ios?.bundleIdentifier).toBe('com.kahdigital.kssenger');
    expect(appConfig.expo?.android?.package).toBe('com.kahdigital.kssenger');
    expect(appConfig.expo?.ios?.buildNumber).toBe('1');
    expect(appConfig.expo?.android?.versionCode).toBe(1);
  });

  it('ties OTA runtime compatibility to the native app version', () => {
    expect(appConfig.expo?.runtimeVersion?.policy).toBe('appVersion');
  });

  it('keeps production builds auto-incrementing after the first V1 build', () => {
    expect(easConfig.build?.production?.autoIncrement).toBe(true);
  });
});
