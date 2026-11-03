import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDonorWithEmailConfirmation, signInWithEmail, validateDonorRegistrationInput } from './auth';

const { authMock, apiRequest } = vi.hoisted(() => ({
  authMock: {
    signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), getSession: vi.fn(), startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(),
  },
  apiRequest: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: authMock }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn() }, Platform: { OS: 'web' } }));
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('./client', () => ({ ApiClientError: class ApiClientError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }, apiRequest }));

describe('Donor Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://prod-project.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com/api/v1';
  });

  it('creates a Donor Auth identity and relies on the configured confirmation link', async () => {
    authMock.signUp.mockResolvedValueOnce({ data: { user: { id: 'auth-id' }, session: null }, error: null });
    await registerDonorWithEmailConfirmation(' donor@example.com ', '12345678', 'Donor Name');
    expect(authMock.signUp).toHaveBeenCalledWith({
      email: 'donor@example.com', password: '12345678', options: { data: { display_name: 'Donor Name' } },
    });
    expect(authMock.signOut).not.toHaveBeenCalled();
  });

  it('accepts any password of at least eight characters without composition rules', () => {
    expect(validateDonorRegistrationInput('d@example.org', 'abcdefgh', 'Donor', 'abcdefgh')).toBeNull();
    expect(validateDonorRegistrationInput('d@example.org', '1234567', 'Donor', '1234567')).toMatch(/at least 8/);
    expect(validateDonorRegistrationInput('d@example.org', 'abcdefgh', 'Donor', 'abcdefgh!')).toMatch(/do not match/);
  });

  it('does not call Supabase signup when the password is shorter than eight characters', async () => {
    await expect(registerDonorWithEmailConfirmation('d@example.org', '1234567', 'Donor')).rejects.toThrow(/at least 8/);
    expect(authMock.signUp).not.toHaveBeenCalled();
  });

  it('rejects signup if Auth returns a session instead of requiring confirmation', async () => {
    authMock.signUp.mockResolvedValueOnce({ data: { user: { id: 'auth-id' }, session: { access_token: 'x' } }, error: null });
    await expect(registerDonorWithEmailConfirmation('donor@example.com', '12345678', 'Donor')).rejects.toThrow(/Email confirmation is not enabled/);
    expect(authMock.signOut).toHaveBeenCalledOnce();
  });

  it('rejects invalid credentials and never creates a local login', async () => {
    authMock.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: new Error('Invalid login credentials') });
    await expect(signInWithEmail('donor@example.com', 'wrong-password')).rejects.toThrow('Invalid login credentials');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('resolves the signed-in account from the authenticated API token', async () => {
    authMock.signInWithPassword.mockResolvedValueOnce({ data: { session: { access_token: 'account-token' } }, error: null });
    apiRequest.mockResolvedValueOnce({ role: 'DONOR', id: 'app-user-1' });
    await expect(signInWithEmail('donor@example.com', '12345678')).resolves.toMatchObject({ role: 'DONOR', id: 'app-user-1' });
    expect(apiRequest).toHaveBeenCalledWith('me', { headers: { Authorization: 'Bearer account-token' } });
  });

  it('uses the new authenticated identity after switching accounts instead of reusing the prior account', async () => {
    authMock.signInWithPassword
      .mockResolvedValueOnce({ data: { session: { access_token: 'first-account-token' } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: 'second-account-token' } }, error: null });
    apiRequest
      .mockResolvedValueOnce({ role: 'DONOR', id: 'first-app-user' })
      .mockResolvedValueOnce({ role: 'DONOR', id: 'second-app-user' });

    await expect(signInWithEmail('first@example.com', 'password-one')).resolves.toMatchObject({ id: 'first-app-user' });
    await expect(signInWithEmail('second@example.com', 'password-two')).resolves.toMatchObject({ id: 'second-app-user' });
    expect(apiRequest.mock.calls.map(call => call[1].headers.Authorization)).toEqual([
      'Bearer first-account-token', 'Bearer second-account-token',
    ]);
  });

  it('clears a newly authenticated session when its account cannot be resolved', async () => {
    authMock.signInWithPassword.mockResolvedValueOnce({ data: { session: { access_token: 'unlinked-token' } }, error: null });
    apiRequest.mockRejectedValueOnce(new Error('Application account unavailable'));
    await expect(signInWithEmail('new@example.com', 'password-one')).rejects.toThrow('Application account unavailable');
    expect(authMock.signOut).toHaveBeenCalledOnce();
  });
});
