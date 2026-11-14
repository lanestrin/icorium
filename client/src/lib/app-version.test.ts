import { describe, expect, it } from 'vitest';
import { environmentLabel, versionLabel } from './app-version';

describe('environment label', () => {
  it('calls a preview build of main Test and other branches Preview', () => {
    expect(environmentLabel({ vercelEnv: 'preview', branch: 'main' })).toBe('Test');
    expect(environmentLabel({ vercelEnv: 'preview', branch: 'feature/12.1-automated-releases' })).toBe('Preview');
  });

  it('adds nothing for production or local builds', () => {
    expect(environmentLabel({ vercelEnv: 'production', branch: 'production' })).toBe('');
    expect(environmentLabel({})).toBe('');
  });
});

describe('version label', () => {
  it('shows the version, with the environment when there is one', () => {
    expect(versionLabel('1.0.0', 'Test')).toBe('v1.0.0 · Test');
    expect(versionLabel('1.0.0', '')).toBe('v1.0.0');
  });

  it('shows nothing without a version', () => {
    expect(versionLabel(undefined, 'Test')).toBe('');
    expect(versionLabel('', '')).toBe('');
  });
});
