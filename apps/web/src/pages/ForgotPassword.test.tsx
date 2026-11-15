// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ForgotPassword from './ForgotPassword'
import type { RecoveryAuth } from '../api/recovery'

const resetPasswordForEmail = vi.fn()
const auth = { resetPasswordForEmail } as unknown as RecoveryAuth
let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.localStorage.clear()
  window.history.replaceState(null, '', '/forgot-password')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<ForgotPassword auth={auth} />) })
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})
const enterEmail = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>('#recovery-email')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const submit = async () => {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
}

describe('public recovery request page', () => {
  it('validates email without contacting the provider', async () => {
    await enterEmail('bad-address')
    await submit()
    expect(container.textContent).toContain('Enter a valid email address.')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('shows a generic result for an accepted request without exposing account existence', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await enterEmail('volunteer@example.org')
    await submit()
    expect(resetPasswordForEmail).toHaveBeenCalledWith('volunteer@example.org', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    expect(container.textContent).toContain('If an account uses that address')
    expect(container.textContent).not.toContain('volunteer@example.org')
  })

  it('does not claim delivery after a provider failure', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { code: 'over_email_send_rate_limit' } })
    await enterEmail('volunteer@example.org')
    await submit()
    expect(container.textContent).toContain('Could not request password recovery.')
    expect(container.textContent).not.toContain('Check your email')
  })
})
