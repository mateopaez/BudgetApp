import { friendlyAuthError } from './auth.component';

describe('friendlyAuthError', () => {
  it('does not reveal whether an account exists for invalid credentials', () => {
    expect(friendlyAuthError({ code: 'auth/user-not-found' })).toBe(
      'Email or password is incorrect. Check both fields and try again.'
    );
    expect(friendlyAuthError({ code: 'auth/wrong-password' })).toBe(
      'Email or password is incorrect. Check both fields and try again.'
    );
  });

  it('gives actionable copy for account and connection errors', () => {
    expect(friendlyAuthError({ code: 'auth/email-already-in-use' })).toContain('Sign in instead');
    expect(friendlyAuthError({ code: 'auth/network-request-failed' })).toContain(
      'Check your connection'
    );
  });

  it('does not expose unknown provider messages', () => {
    expect(friendlyAuthError(new Error('internal provider detail'))).toBe(
      'Authentication failed. Check your details and try again.'
    );
  });
});
