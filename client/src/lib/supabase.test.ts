import { describe, expect, it } from 'vitest';
import { authConfig, getSupabase } from './supabase';

describe('authConfig', () => {
  it('returns the trimmed URL and key when both are set', () => {
    expect(authConfig({ VITE_SUPABASE_URL: ' https://project.example ', VITE_SUPABASE_PUBLISHABLE_KEY: ' pk ' })).toEqual({ url: 'https://project.example', key: 'pk' });
  });

  it('is null when the URL is missing', () => {
    expect(authConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'pk' })).toBeNull();
  });

  it('is null when the key is missing', () => {
    expect(authConfig({ VITE_SUPABASE_URL: 'https://project.example' })).toBeNull();
  });

  it('is null when either value is blank', () => {
    expect(authConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_PUBLISHABLE_KEY: 'pk' })).toBeNull();
    expect(authConfig({ VITE_SUPABASE_URL: 'https://project.example', VITE_SUPABASE_PUBLISHABLE_KEY: '' })).toBeNull();
  });
});

describe('getSupabase', () => {
  it('gives no client when the test build has no Supabase settings', async () => {
    await expect(getSupabase()).resolves.toBeNull();
  });
});
