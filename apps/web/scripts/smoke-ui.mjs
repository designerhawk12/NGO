import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import React, { act } from 'react'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url:'http://localhost/', pretendToBeVisual:true })
const { window } = dom
for (const key of ['window','document','Node','Element','HTMLElement','MutationObserver','Event','MouseEvent']) globalThis[key] = key === 'window' ? window : window[key]
Object.defineProperty(globalThis, 'navigator', { value:window.navigator, configurable:true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.scrollTo = () => {}
const { createRoot } = await import('react-dom/client')

const server = await createServer({ server:{ middlewareMode:true }, appType:'custom' })
try {
  const { default:Root } = await server.ssrLoadModule('/src/Root.tsx')
  const root = createRoot(document.getElementById('root'))
  const click = async element => { assert.ok(element, 'Expected clickable element'); await act(async () => { element.click(); await Promise.resolve() }) }
  const button = label => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === label)
  const setSelect = async (element, value) => { assert.ok(element, 'Expected select'); await act(async () => { element.value = value; element.dispatchEvent(new window.Event('change', { bubbles:true })) }) }
  const setInput = async (element, value) => { assert.ok(element, 'Expected input'); await act(async () => { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles:true })) }) }

  await act(async () => root.render(React.createElement(Root)))
  const adminLinks = [...document.querySelectorAll('a[href="#/workspace"]')]
  assert.ok(adminLinks.length >= 2)
  assert.ok(adminLinks.every(link => /admin/i.test(link.textContent)), 'Web workspace links must describe the admin app')
  assert.doesNotMatch(document.querySelector('.landing').textContent, /Open volunteer workspace/)
  assert.ok(document.querySelector('.landing a[href$="donor/index.html"]'), 'Landing page should offer donor entry')

  const adminLink = document.querySelector('.landing-link')
  assert.ok(adminLink, 'Expected admin dashboard link')
  const hashChanged = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Admin link did not trigger hash navigation')), 2000)
    window.addEventListener('hashchange', () => { clearTimeout(timeout); resolve() }, { once:true })
  })
  await act(async () => { adminLink.click(); await hashChanged })
  assert.equal(window.location.hash, '#/workspace')
  assert.match(document.body.textContent, /Volunteer Management/)
  for (const label of ['Volunteers', 'Food & Donors', 'Pickup & Logistics', 'Vehicle Tracking', 'Vehicle Details']) {
    assert.ok([...document.querySelectorAll('.side-nav button')].some(item => item.textContent.trim() === label), `${label} module should be visible`)
  }
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Volunteers')))
  assert.match(document.querySelector('main h1').textContent, /Volunteers/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Food & Donors')))
  assert.match(document.querySelector('main').textContent, /Admin food requests are not connected yet/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Pickup & Logistics')))
  assert.match(document.querySelector('main h1').textContent, /Pickup & Logistics/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Vehicle Tracking')))
  assert.match(document.querySelector('main').textContent, /This device location/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Vehicle Details')))
  assert.match(document.querySelector('main').textContent, /Fleet Registry/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Dashboard')))

  await click(button('ಕನ್ನಡ'))
  assert.match(document.body.textContent, /ಸ್ವಯಂಸೇವಕರ ನಿರ್ವಹಣೆ/)
  assert.match(document.body.textContent, /ಡ್ಯಾಶ್‌ಬೋರ್ಡ್/)
  assert.match(document.querySelector('.side-nav').textContent, /ಆಹಾರ ಮತ್ತು ದಾನಿಗಳು/)
  await click(button('English'))
  assert.match(document.body.textContent, /Volunteer Management/)

  await click(document.querySelector('.dashboard-heading .button-primary'))
  assert.match(document.body.textContent, /Select a pickup event/)
  await click(button('Continue'))
  await click([...document.querySelectorAll('.people-choice')].find(item => item.textContent.includes('Team Alpha')))
  await click(button('Continue'))
  await click([...document.querySelectorAll('.resource-choice')].find(item => item.textContent.includes('Ramesh Kumar')))
  await click(button('Continue'))
  await click([...document.querySelectorAll('.resource-choice')].find(item => item.textContent.includes('Van 02')))
  await click(button('Continue'))
  assert.match(document.querySelector('.review-card').textContent, /Sharma Wedding/)
  await act(async () => { document.querySelector('.wizard-footer .button-primary').click(); await new Promise(resolve => setTimeout(resolve, 550)) })
  assert.match(document.body.textContent, /ASG011/)
  assert.equal(document.querySelector('.assignment-table tbody tr:first-child .status-badge')?.textContent, 'Pending')

  await click(button('ಕನ್ನಡ'))
  assert.match(document.body.textContent, /ನಿಯೋಜನೆಗಳು/)
  await click(document.querySelector('.assignment-table .id-link'))
  const status = document.querySelector('.drawer select')
  assert.equal(status?.value, 'Pending')
  assert.equal([...status.options].find(option => option.value === 'Accepted')?.textContent, 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ')
  await setSelect(status, 'Accepted')
  assert.match(document.querySelector('.drawer .status-badge').textContent, /ಸ್ವೀಕರಿಸಲಾಗಿದೆ/)
  await click(document.querySelector('.drawer-header .icon-button'))
  await click(document.querySelector('.page-heading .button-primary'))
  assert.match(document.querySelector('.wizard-content').textContent, /ಸಂಗ್ರಹ ಕಾರ್ಯಕ್ರಮ ಆಯ್ಕೆಮಾಡಿ/)
  assert.match(document.querySelector('.wizard-content').textContent, /ವಿವಾಹ/)
  await click(document.querySelector('.wizard-footer .button-secondary'))

  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('ಸ್ವಯಂಸೇವಕರು')))
  assert.match(document.body.textContent, /ಸ್ವಯಂಸೇವಕರು/)
  const statusFilter = document.querySelector('select[aria-label="ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ಫಿಲ್ಟರ್ ಮಾಡಿ"]')
  assert.ok(statusFilter)
  assert.equal([...statusFilter.options].find(option => option.value === 'AVAILABLE')?.textContent, 'ಲಭ್ಯ')
  await setSelect(statusFilter, 'UNAVAILABLE')
  assert.match(document.querySelector('.volunteer-table tbody').textContent, /Vikram Desai/)
  assert.doesNotMatch(document.querySelector('.volunteer-table tbody').textContent, /Arjun Rao/)
  await click(document.querySelector('.clear-filters'))
  const search = document.querySelector('.search-wrap input')
  await setInput(search, 'Arjun')
  assert.match(document.querySelector('.volunteer-table tbody').textContent, /Arjun Rao/)
  assert.doesNotMatch(document.querySelector('.volunteer-table tbody').textContent, /Priya Sharma/)
  await setInput(search, '')

  await click(document.querySelector('.page-heading .button-primary'))
  const addInputs = document.querySelectorAll('.modal .dialog-form input:not([type="checkbox"])')
  await setInput(addInputs[0], 'Kavya Iyer')
  await setInput(addInputs[1], '+91 98765 43999')
  await setInput(addInputs[2], 'kavya.iyer@example.com')
  await click(document.querySelector('.skill-picker input[type="checkbox"]'))
  await click(document.querySelector('.modal .dialog-footer .button-primary'))
  assert.match(document.querySelector('.volunteer-table tbody').textContent, /Kavya Iyer/)

  await click([...document.querySelectorAll('.person-cell')].find(item => item.textContent.includes('Kavya Iyer')))
  await click(document.querySelector('.drawer-actions .button-secondary'))
  await setInput(document.querySelector('.modal .dialog-form input'), 'Kavya Nair')
  await click(document.querySelector('.modal .dialog-footer .button-primary'))
  assert.match(document.querySelector('.drawer .profile-hero').textContent, /Kavya Nair/)
  await click(document.querySelector('.drawer-header .icon-button'))

  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('ತಂಡಗಳು')))
  await click(document.querySelector('.page-heading .button-primary'))
  await setInput(document.querySelector('.modal input'), 'Team Echo')
  await setSelect(document.querySelector('.modal select'), 'VOL013')
  await click(document.querySelector('.modal .dialog-footer .button-primary'))
  const echoCard = [...document.querySelectorAll('.team-card')].find(item => item.textContent.includes('Team Echo'))
  assert.ok(echoCard)
  await click(echoCard.querySelector('.team-card-footer button'))
  await click(document.querySelector('.drawer .section-heading .text-link'))
  await setSelect(document.querySelector('.inline-picker select'), 'VOL002')
  assert.match(document.querySelector('.drawer .detail-section').textContent, /Priya Sharma/)
  await click(document.querySelector('.drawer .button-secondary.full-width'))
  await click([...document.querySelectorAll('.leader-options button')].find(item => item.textContent.includes('Priya Sharma')))
  assert.match(document.querySelector('.team-detail-summary').textContent, /Priya Sharma/)
  await click([...document.querySelectorAll('.member-row')].find(item => item.textContent.includes('Kavya Nair')).querySelector('.icon-button'))
  assert.doesNotMatch(document.querySelector('.drawer .detail-section').textContent, /Kavya Nair/)
  await click(document.querySelector('.drawer-header .icon-button'))
  await click([...document.querySelectorAll('.sidebar-bottom button')].find(item => item.textContent.includes('ಸೆಟ್ಟಿಂಗ್‌ಗಳು')))
  assert.match(document.body.textContent, /ಘಟಕದ ಮಾಹಿತಿ/)

  await act(async () => root.unmount())
  console.log('Smoke check passed: bilingual UI, assignment flow, status update, volunteer search/filter/add/edit and team create/add/change leader/remove.')
} finally {
  await server.waitForRequestsIdle()
  await server.close()
  dom.window.close()
}
