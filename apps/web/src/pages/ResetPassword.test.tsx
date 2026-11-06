// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResetPassword from './ResetPassword'
import type { RecoveryAuth } from '../api/recovery'

const { verifyOtp, getSession, getUser, updateUser, signOut, onAuthStateChange } = vi.hoisted(() => ({
  verifyOtp: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn(),
}))

let container: HTMLDivElement
let root: Root
const auth = { verifyOtp, getSession, getUser, updateUser, signOut, onAuthStateChange } as unknown as RecoveryAuth
const render = async () => {
  await act(async () => { root.render(<ResetPassword auth={auth} />); await Promise.resolve() })
}
const setInput = async (id: string, value: string) => {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const submit = async () => {
  const form = container.querySelector('form')!
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve() })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.localStorage.clear()
  window.localStorage.setItem('aaharaconnect-admin-session', '1')
  window.history.replaceState(null, '', '/reset-password?token_hash=opaque&type=recovery')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  verifyOtp.mockResolvedValue({ data: { session: { user: { id: 'volunteer-id' } } }, error: null })
  getSession.mockResolvedValue({ data: { session: { user: { id: 'volunteer-id' } } }, error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'volunteer-id' } }, error: null })
  updateUser.mockResolvedValue({ data: { user: { id: 'volunteer-id' } }, error: null })
  signOut.mockResolvedValue({ error: null })
  onAuthStateChange.mockImplementation(callback => {
    queueMicrotask(() => callback('PASSWORD_RECOVERY', { user: { id: 'volunteer-id' } }))
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

describe('isolated recovery callback', () => {
  it('accepts a verified implicit recovery callback and clears its token fragment', async () => {
    window.history.replaceState(null, '', '/reset-password#access_token=opaque&refresh_token=opaque2&type=recovery')
    await render()
    expect(container.textContent).toContain('Choose a new password')
    expect(window.location.hash).toBe('')
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(getSession).toHaveBeenCalled()
    expect(getUser).toHaveBeenCalled()
  })

  it('rejects an ordinary signed-in session even if its URL claims recovery', async () => {
    window.history.replaceState(null, '', '/reset-password#access_token=opaque&refresh_token=opaque2&type=recovery')
    onAuthStateChange.mockImplementationOnce(callback => {
      queueMicrotask(() => callback('SIGNED_IN', { user: { id: 'volunteer-id' } }))
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    await render()
    expect(container.textContent).toContain('This recovery link is invalid or has expired.')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects missing and wrong-purpose tokens without updating a password', async () => {
    window.history.replaceState(null, '', '/reset-password?token_hash=opaque&type=invite')
    await render()
    expect(container.textContent).toContain('This recovery link is invalid or has expired.')
    expect(window.location.search).toBe('')
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('aaharaconnect-admin-session')).toBe('1')
  })

  it('rejects expired recovery tokens and clears the URL', async () => {
    verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { code: 'otp_expired' } })
    await render()
    expect(container.textContent).toContain('This recovery link is invalid or has expired.')
    expect(window.location.search).toBe('')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('verifies the recovery OTP, checks the user, updates the password, and signs out locally', async () => {
    await render()
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'opaque', type: 'recovery' })
    expect(window.location.search).toBe('')
    expect(container.textContent).toContain('Choose a new password')
    await setInput('reset-password', 'a-long-test-passphrase')
    await setInput('reset-confirmation', 'a-long-test-passphrase')
    await submit()
    expect(updateUser).toHaveBeenCalledWith({ password: 'a-long-test-passphrase' })
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(container.textContent).toContain('Password updated')
    expect(container.textContent).not.toContain('a-long-test-passphrase')
    expect(window.localStorage.getItem('aaharaconnect-admin-session')).toBe('1')
  })

  it('rejects mismatched and short passwords before calling Auth', async () => {
    await render()
    await setInput('reset-password', 'short')
    await setInput('reset-confirmation', 'different')
    await submit()
    expect(container.textContent).toContain('Use a password between 8 and 128 characters.')
    await setInput('reset-password', 'long-enough-password')
    await submit()
    expect(container.textContent).toContain('Passwords do not match.')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('does not report success when Supabase rejects the password update', async () => {
    updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'same_password' } })
    await render()
    await setInput('reset-password', 'a-long-test-passphrase')
    await setInput('reset-confirmation', 'a-long-test-passphrase')
    await submit()
    expect(container.textContent).toContain('Could not set your password. Please try again.')
    expect(container.textContent).not.toContain('Password updated')
    expect(window.localStorage.getItem('aaharaconnect-admin-session')).toBe('1')
  })

  it('rejects a changed or invalid recovery session before updating the password', async () => {
    await render()
    await setInput('reset-password', 'a-long-test-passphrase')
    await setInput('reset-confirmation', 'a-long-test-passphrase')
    getUser.mockResolvedValueOnce({ data: { user: { id: 'different-user' } }, error: null })
    await submit()
    expect(updateUser).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(container.textContent).toContain('This recovery link is invalid or has expired.')
    expect(container.textContent).not.toContain('a-long-test-passphrase')
  })
})
