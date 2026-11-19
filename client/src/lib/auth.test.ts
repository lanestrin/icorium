import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVITE_ONLY_MESSAGE, UNAVAILABLE_MESSAGE, UNEXPECTED_MESSAGE, authErrorMessage, cleanName, redirectUrl } from './auth';

afterEach(() => vi.restoreAllMocks());

describe('cleanName', () => {
  it('trims the name and allows 1 to 100 characters', () => {
    expect(cleanName('  Ada  ')).toBe('Ada');
    expect(cleanName('a'.repeat(100))).toHaveLength(100);
  });

  it('refuses a blank or too-long name', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('a'.repeat(101))).toBeNull();
  });
});

describe('redirectUrl', () => {
  it('is always this site plus a fixed path', () => {
    expect(redirectUrl('/reset-password')).toBe(`${window.location.origin}/reset-password`);
  });
});

const apiError = (code: string, status = 400, message = 'server text') => ({ name: 'AuthApiError', code, status, message });

describe('authErrorMessage', () => {
  it.each([
    ['invalid_credentials', 'Email or password is incorrect.'],
    ['email_not_confirmed', 'Confirm your email address first. Check your inbox for the link.'],
    ['over_email_send_rate_limit', 'Too many attempts. Wait a few minutes and try again.'],
    ['over_request_rate_limit', 'Too many attempts. Wait a few minutes and try again.'],
    ['same_password', 'Choose a different password from your current one.'],
  ])('maps %s', (code, message) => {
    expect(authErrorMessage(apiError(code))).toBe(message);
  });

  it('asks for a stronger password, with the reasons Supabase gives', () => {
    expect(authErrorMessage({ name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, reasons: ['length', 'pwned'] }))
      .toBe('Choose a stronger password: make it longer, pick one that has not appeared in a data breach.');
    expect(authErrorMessage(apiError('weak_password', 422))).toBe('Choose a stronger password.');
  });

  it('shows the invite-only hook rejection as it is', () => {
    expect(authErrorMessage({ name: 'AuthApiError', status: 403, message: INVITE_ONLY_MESSAGE })).toBe(INVITE_ONLY_MESSAGE);
  });

  it('reports network failures, including a paused project, as temporarily unavailable', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })).toBe(UNAVAILABLE_MESSAGE);
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe(UNAVAILABLE_MESSAGE);
  });

  it('gives a general message for anything else and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(authErrorMessage(apiError('something_new', 500))).toBe(UNEXPECTED_MESSAGE);
    expect(authErrorMessage('a string')).toBe(UNEXPECTED_MESSAGE);
    expect(authErrorMessage(null)).toBe(UNEXPECTED_MESSAGE);
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('never shows server text that could reveal whether an account exists', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(authErrorMessage(apiError('user_already_exists', 422, 'User already registered'))).toBe(UNEXPECTED_MESSAGE);
  });
});
