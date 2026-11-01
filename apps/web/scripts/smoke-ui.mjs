import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import React, { act } from 'react'

process.env.VITE_API_BASE_URL = 'http://localhost:4000/api/v1'

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
  for (const label of ['Volunteers', 'Food & Donors', 'Pickup & Logistics', 'Vehicle Tracking', 'Vehicle Details', 'Vessels']) {
    assert.ok([...document.querySelectorAll('.side-nav button')].some(item => item.textContent.trim() === label), `${label} module should be visible`)
  }
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Volunteers')))
  assert.match(document.querySelector('main h1').textContent, /Volunteers/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Food & Donors')))
  assert.match(document.querySelector('main').textContent, /Live Food Requests from Donors|Food & Donors/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Pickup & Logistics')))
  assert.match(document.querySelector('main h1').textContent, /Pickup & Logistics/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Vehicle Tracking')))
  assert.match(document.querySelector('main').textContent, /This device location/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Vehicle Details')))
  assert.match(document.querySelector('main').textContent, /Fleet Registry/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Vessels')))
  assert.match(document.querySelector('main h1').textContent, /Vessels/)
  await click([...document.querySelectorAll('.side-nav button')].find(item => item.textContent.includes('Dashboard')))
  const openDemo = button('Open demo dashboard')
  if (openDemo) await click(openDemo)

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

  // Exercise the live admin Volunteer form with a local, deterministic API stub.
  const liveRequests = []
  let liveRoster = []
  let liveTeams = []
  let failNextEdit = false
  let failNextTeamCreate = false
  const apiReply = (data, status = 200) => new Response(JSON.stringify({ success:true, data }), { status, headers:{ 'Content-Type':'application/json' } })
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname
    const method = options.method ?? 'GET'
    liveRequests.push({ path, method, headers: new Headers(options.headers), body: options.body ? JSON.parse(options.body) : null })
    if (method === 'GET' && path.endsWith('/volunteers')) return apiReply({ items:liveRoster, nextCursor:null })
    if (method === 'GET' && path.endsWith('/teams')) return apiReply({ items:liveTeams, nextCursor:null })
    if (method === 'GET' && path.includes('/teams/')) return apiReply(liveTeams.find(team => team.id === path.split('/').at(-1)))
    if (method === 'POST' && path.endsWith('/teams')) {
      if (failNextTeamCreate) {
        failNextTeamCreate = false
        return new Response(JSON.stringify({ success:false, error:{ code:'RESOURCE_CONFLICT', message:'Team name or membership conflicts with an existing record.' } }), { status:409, headers:{ 'Content-Type':'application/json' } })
      }
      const input = JSON.parse(options.body)
      const created = { id:'8d253313-d824-47a1-83dd-5f7dc5c84f60', ...input }
      liveTeams = [created, ...liveTeams]
      return apiReply(created, 201)
    }
    if (method === 'PATCH' && path.includes('/teams/')) {
      const input = JSON.parse(options.body)
      liveTeams = liveTeams.map(team => team.id === path.split('/').at(-1) ? { ...team, ...input } : team)
      return apiReply(liveTeams[0])
    }
    if (method === 'POST' && path.endsWith('/volunteers')) {
      const input = JSON.parse(options.body)
      const created = { id:'7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5', personId:'f50a3e0e-9f8c-4293-bb2b-fc55e4b3d3d8', registrationCode:input.registrationCode, name:input.name, phoneE164:input.phoneE164, skills:input.skills, status:input.status }
      liveRoster = [created, ...liveRoster]
      return apiReply(created, 201)
    }
    if (method === 'PATCH' && path.includes('/volunteers/')) {
      if (failNextEdit) {
        failNextEdit = false
        return new Response(JSON.stringify({ success:false, error:{ code:'REGISTRATION_CODE_ALREADY_EXISTS', message:'Registration code is already in use.' } }), { status:409, headers:{ 'Content-Type':'application/json' } })
      }
      const input = JSON.parse(options.body)
      liveRoster = liveRoster.map(item => item.id === path.split('/').at(-1) ? { ...item, ...input } : item)
      return apiReply(liveRoster[0])
    }
    throw new Error(`Unexpected mocked API request: ${method} ${path}`)
  }
  const { default:LiveVolunteers } = await server.ssrLoadModule('/src/components/volunteers/LiveVolunteers.tsx')
  const liveRoot = createRoot(document.getElementById('root'))
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
  await act(async () => liveRoot.render(React.createElement(LiveVolunteers, { token:'test-access-token' })))
  await flush()
  await click(button('Add Volunteer'))
  assert.ok(document.querySelector('.modal input[type="email"]'), 'Create needs an email field')
  assert.equal(document.querySelector('.modal input[type="password"]'), null)
  assert.equal(document.querySelector('.modal select[name="role"]'), null)
  await click(document.querySelector('.modal button[type="submit"]'))
  assert.match(document.querySelector('.modal [role="alert"]').textContent, /name/)
  await setInput(document.querySelector('.modal input[placeholder="e.g. Kavya Iyer"]'), 'Kavya Iyer')
  await click(document.querySelector('.modal button[type="submit"]'))
  assert.match(document.querySelector('.modal [role="alert"]').textContent, /registration code/)
  await setInput(document.querySelector('.modal input[placeholder="VOL-002"]'), 'VOL-002')
  await click(document.querySelector('.modal button[type="submit"]'))
  assert.match(document.querySelector('.modal [role="alert"]').textContent, /valid email/)
  await setInput(document.querySelector('.modal input[type="email"]'), 'kavya@example.com')
  await setInput(document.querySelector('.modal input[type="tel"]'), '+919876543210')
  await setInput(document.querySelector('.modal input[placeholder="Driving, Packing"]'), 'Driving, Packing')
  await click(document.querySelector('.modal button[type="submit"]'))
  await flush()
  const createRequest = liveRequests.find(item => item.method === 'POST')
  assert.deepEqual(createRequest.body, { email:'kavya@example.com', name:'Kavya Iyer', phoneE164:'+919876543210', registrationCode:'VOL-002', skills:['Driving','Packing'], status:'ACTIVE' })
  assert.equal(createRequest.headers.get('Authorization'), 'Bearer test-access-token')
  assert.match(document.querySelector('.volunteer-table').textContent, /Kavya Iyer/)
  assert.match(document.querySelector('.toast').textContent, /invitation sent/)
  assert.ok(liveRequests.filter(item => item.method === 'GET' && item.path.endsWith('/volunteers')).length >= 2, 'Create refreshes the roster')
  await click(button('Edit volunteer'))
  assert.equal(document.querySelector('.modal input[type="email"]'), null, 'Email is immutable on edit')
  await setInput(document.querySelector('.modal input[placeholder="e.g. Kavya Iyer"]'), 'Kavya Nair')
  await click(document.querySelector('.modal button[type="submit"]'))
  await flush()
  const editRequest = liveRequests.find(item => item.method === 'PATCH')
  assert.equal(editRequest.body.name, 'Kavya Nair')
  assert.equal('email' in editRequest.body, false)
  assert.equal('role' in editRequest.body, false)
  assert.match(document.querySelector('.volunteer-table').textContent, /Kavya Nair/)
  await click(button('Edit volunteer'))
  failNextEdit = true
  await click(document.querySelector('.modal button[type="submit"]'))
  await flush()
  assert.match(document.querySelector('.modal [role="alert"]').textContent, /already in use/)
  await click(document.querySelector('.modal .dialog-footer .button-secondary'))
  await act(async () => liveRoot.unmount())

  // The live Team editor uses the Admin token and roster; successful writes refresh the list.
  const secondLiveVolunteer = { id:'44bada71-76fd-41ad-a1af-b2cd9f2df902', personId:'be7ae967-a1aa-4557-b0e4-e1cb4dcb8707', registrationCode:'VOL-003', name:'Sanjay Verma', phoneE164:null, skills:[], status:'ACTIVE' }
  liveRoster = [...liveRoster, secondLiveVolunteer]
  const { default:LiveTeams } = await server.ssrLoadModule('/src/components/volunteers/LiveTeams.tsx')
  const teamRoot = createRoot(document.getElementById('root'))
  await act(async () => teamRoot.render(React.createElement(LiveTeams, { token:'test-access-token' })))
  await flush()
  await click(document.querySelector('.page-heading .button-primary'))
  assert.ok(document.querySelector('.team-member-options'), 'Live roster must populate the form')
  await click(document.querySelector('.modal button[type="submit"]'))
  assert.match(document.querySelector('.modal [role="alert"]').textContent, /Team name is required/)
  await setInput(document.querySelector('.modal .field input'), 'Test Rescue Team')
  const memberBoxes = [...document.querySelectorAll('.team-member-option input')]
  assert.equal(memberBoxes.length, 2)
  await click(memberBoxes[0]); await click(memberBoxes[1])
  await setSelect(document.querySelector('.modal select'), liveRoster[0].id)
  failNextTeamCreate = true
  await click(document.querySelector('.modal button[type="submit"]'))
  await flush()
  assert.match(document.querySelector('.modal [role="alert"]').textContent, /conflicts with an existing record/)
  await click(document.querySelector('.modal button[type="submit"]'))
  await flush()
  const teamPosts = liveRequests.filter(item => item.method === 'POST' && item.path.endsWith('/teams'))
  assert.equal(teamPosts.at(-1).headers.get('Authorization'), 'Bearer test-access-token')
  assert.deepEqual(teamPosts.at(-1).body, { name:'Test Rescue Team', memberIds:liveRoster.map(item => item.id), leaderVolunteerId:liveRoster[0].id })
  assert.equal(new Set(teamPosts.at(-1).body.memberIds).size, 2, 'Member IDs must remain unique')
  assert.equal(document.querySelector('.modal'), null, 'Successful create closes the form')
  assert.match(document.querySelector('.team-grid').textContent, /Test Rescue Team/)
  assert.match(document.querySelector('.toast').textContent, /Team created successfully/)
  assert.ok(liveRequests.filter(item => item.method === 'GET' && item.path.endsWith('/teams')).length >= 2, 'Team list refreshes after create')
  await click(document.querySelector('.team-card-footer button'))
  await flush()
  await click(button('Edit Team'))
  await setInput(document.querySelector('.modal .field input'), 'Updated Rescue Team')
  await click([...document.querySelectorAll('.team-member-option input')][0])
  await setSelect(document.querySelector('.modal select'), secondLiveVolunteer.id)
  await click(document.querySelector('.modal button[type="submit"]'))
  await flush()
  const teamPatch = liveRequests.find(item => item.method === 'PATCH' && item.path.includes('/teams/'))
  assert.deepEqual(teamPatch.body, { name:'Updated Rescue Team', memberIds:[secondLiveVolunteer.id], leaderVolunteerId:secondLiveVolunteer.id })
  assert.equal(teamPatch.headers.get('Authorization'), 'Bearer test-access-token')
  assert.match(document.querySelector('.team-grid').textContent, /Updated Rescue Team/)
  assert.match(document.querySelector('.toast').textContent, /Team updated successfully/)
  await act(async () => teamRoot.unmount())

  // Public invite page uses a mocked Supabase session; no live Auth or Express call.
  const inviteUser = { id:'14d56e99-3a27-4dbf-8d07-bd7ca06bc9ad', email:'volunteer@example.com' }
  const inviteSession = { user:inviteUser }
  const inviteCalls = { updates:[], signOut:[], verifyOtp:[] }
  let releaseSession
  let releaseUpdate
  const waitingSession = new Promise(resolve => { releaseSession = resolve })
  const waitingUpdate = new Promise(resolve => { releaseUpdate = resolve })
  const fakeInviteAuth = {
    getSession:() => waitingSession,
    getUser:async () => ({ data:{ user:inviteUser }, error:null }),
    verifyOtp:async input => { inviteCalls.verifyOtp.push(input); return { data:{ session:inviteSession }, error:null } },
    updateUser:input => { inviteCalls.updates.push(input); return waitingUpdate },
    signOut:async options => { inviteCalls.signOut.push(options); return { error:null } },
  }
  window.localStorage.setItem('aaharaconnect-language', 'en')
  window.history.replaceState(null, '', '/accept-invite#type=invite&access_token=fake-token')
  const inviteRoot = createRoot(document.getElementById('root'))
  const requestsBeforeInvite = liveRequests.length
  await act(async () => inviteRoot.render(React.createElement(Root, { inviteAuth:fakeInviteAuth })))
  assert.ok(document.querySelector('.invite-page'), 'The direct /accept-invite path must render')
  assert.equal(document.querySelector('.sidebar'), null, 'Invite acceptance is outside the Admin workspace')
  assert.match(document.querySelector('.invite-page').textContent, /Validating your invitation/)
  await act(async () => releaseSession({ data:{ session:inviteSession }, error:null }))
  await flush()
  assert.match(document.querySelector('.invite-page h1').textContent, /Set your password/)
  assert.match(document.querySelector('.invite-email').textContent, /volunteer@example.com/)
  assert.equal(window.location.hash, '', 'The callback token must leave the visible URL')
  assert.equal(document.querySelector('.invite-page [name="role"]'), null)
  assert.equal(document.querySelector('.invite-page [name="status"]'), null)
  assert.equal(document.querySelector('.invite-page [name="registrationCode"]'), null)
  await click(document.querySelector('.invite-submit'))
  assert.match(document.querySelector('.invite-error').textContent, /Enter a password/)
  await setInput(document.querySelector('#invite-password'), 'short')
  await click(document.querySelector('.invite-submit'))
  assert.match(document.querySelector('.invite-error').textContent, /8 and 128/)
  await setInput(document.querySelector('#invite-password'), 'a-longer-password')
  await setInput(document.querySelector('#invite-confirmation'), 'different-password')
  await click(document.querySelector('.invite-submit'))
  assert.match(document.querySelector('.invite-error').textContent, /do not match/)
  await setInput(document.querySelector('#invite-confirmation'), 'a-longer-password')
  await click(document.querySelector('.invite-submit'))
  await flush()
  assert.equal(document.querySelector('.invite-submit').disabled, true, 'Submitting must lock the form')
  assert.deepEqual(inviteCalls.updates, [{ password:'a-longer-password' }])
  assert.equal(liveRequests.length, requestsBeforeInvite, 'Password must never go to Express')
  await act(async () => releaseUpdate({ data:{ user:inviteUser }, error:null }))
  await flush()
  assert.match(document.querySelector('.invite-page').textContent, /Your Volunteer account is ready/)
  assert.deepEqual(inviteCalls.signOut, [{ scope:'local' }])
  await act(async () => inviteRoot.unmount())

  window.history.replaceState(null, '', '/accept-invite#type=invite&error_code=otp_expired')
  const invalidRoot = createRoot(document.getElementById('root'))
  await act(async () => invalidRoot.render(React.createElement(Root, { inviteAuth:fakeInviteAuth })))
  assert.match(document.querySelector('.invite-page').textContent, /invalid or has expired/)
  assert.doesNotMatch(document.querySelector('.invite-page').textContent, /otp_expired/)
  assert.equal(document.querySelector('#invite-password'), null)
  assert.equal(window.location.hash, '')
  await act(async () => invalidRoot.unmount())

  window.history.replaceState(null, '', '/accept-invite#type=invite&access_token=fake-token')
  const failedRoot = createRoot(document.getElementById('root'))
  const failedAuth = { ...fakeInviteAuth, getSession:async () => ({ data:{ session:null }, error:new Error('provider internal detail') }) }
  await act(async () => failedRoot.render(React.createElement(Root, { inviteAuth:failedAuth })))
  await flush()
  assert.match(document.querySelector('.invite-page').textContent, /invalid or has expired/)
  assert.doesNotMatch(document.querySelector('.invite-page').textContent, /provider internal detail/)
  await act(async () => failedRoot.unmount())

  const tokenHash = 'fake-hash-for-test'
  window.history.replaceState(null, '', `/accept-invite?token_hash=${tokenHash}&type=invite`)
  const hashRoot = createRoot(document.getElementById('root'))
  const hashAuth = { ...fakeInviteAuth, getSession:async () => ({ data:{ session:inviteSession }, error:null }) }
  await act(async () => hashRoot.render(React.createElement(Root, { inviteAuth:hashAuth })))
  await flush()
  assert.deepEqual(inviteCalls.verifyOtp, [{ token_hash:tokenHash, type:'invite' }])
  assert.equal(window.location.search, '', 'The token hash must leave the visible URL')
  assert.match(document.querySelector('.invite-page h1').textContent, /Set your password/)
  await act(async () => hashRoot.unmount())
  window.history.replaceState(null, '', '/')

  // Verify Requirement: Donor page has no misleading Pickup assignment action
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const donorHtml = readFileSync(resolve(process.cwd(), 'public/donor/index.html'), 'utf8')
  assert.doesNotMatch(donorHtml, /🚚 Open Pickup &amp; Logistics/, 'Donor page must not contain header pickup action')
  assert.doesNotMatch(donorHtml, /Open in Pickup &amp; Logistics/, 'Donor page must not contain status pickup action')
  assert.doesNotMatch(donorHtml, /Go to Volunteer Workspace/, 'Donor page must not link to volunteer workspace')

  // Verify Requirement: Recommendation algorithm handles over-capacity, inactive status, and does not assign automatically
  const { rankVehiclesForPickup, rankVolunteersForPickup } = await server.ssrLoadModule('/src/features/pickups/aiLogistics.ts')

  const candidateVehicles = [
    { vehicleId: 'veh-small', registrationNumber: 'KA-01-A', kind: 'Two-Wheeler EV Scooter', capacity: 25, status: 'ACTIVE' },
    { vehicleId: 'veh-broken', registrationNumber: 'KA-02-B', kind: 'Tata Ace Mini Truck', capacity: 500, status: 'MAINTENANCE' },
    { vehicleId: 'veh-large', registrationNumber: 'KA-03-C', kind: 'Tata Ace Mini Truck', capacity: 500, status: 'ACTIVE' },
  ]
  const vehicleResult = rankVehiclesForPickup(candidateVehicles, { totalEstimatedWeightKg: 80, totalVessels: 4 })
  const small = vehicleResult.ranked.find(v => v.vehicleId === 'veh-small')
  assert.equal(small.isEligible, false, 'Over-capacity vehicle must be marked ineligible')
  assert.equal(small.isOverCapacity, true, 'Deficit must flag isOverCapacity')
  assert.equal(small.suitabilityScore, 0, 'Ineligible vehicle must have 0 suitability score')

  const broken = vehicleResult.ranked.find(v => v.vehicleId === 'veh-broken')
  assert.equal(broken.isEligible, false, 'Non-ACTIVE vehicle must be ineligible')

  const validTruck = vehicleResult.ranked.find(v => v.vehicleId === 'veh-large')
  assert.equal(validTruck.isEligible, true, 'Active vehicle with sufficient capacity must be eligible')
  assert.equal(vehicleResult.bestVehicle.vehicleId, 'veh-large', 'Eligible candidate should be selected as best recommendation')

  const candidateVolunteers = [
    { volunteerId: 'vol-inactive', name: 'Inactive Volunteer', status: 'INACTIVE', skills: ['Food Handling'] },
    { volunteerId: 'vol-skilled', name: 'Skilled Volunteer', status: 'ACTIVE', skills: ['Food Handling', 'Heavy Lifting'] },
  ]
  const volResult = rankVolunteersForPickup(candidateVolunteers, { totalEstimatedWeightKg: 80 })
  const inactive = volResult.ranked.find(v => v.volunteerId === 'vol-inactive')
  assert.equal(inactive.isEligible, false, 'Inactive volunteer must be ineligible')

  const skilled = volResult.ranked.find(v => v.volunteerId === 'vol-skilled')
  assert.equal(skilled.isEligible, true, 'Active skilled volunteer must be eligible')
  assert.ok(skilled.suitabilityScore > 80, 'Relevant skills should boost match score')

  console.log('Smoke check passed: bilingual demo UI, live Volunteer create/edit/error flows, donor isolation, logistics recommendations and team flows.')
} finally {
  dom.window.close()
  await server.close()
}

// Vite's middleware-mode watcher can retain Node handles after close() on Windows.
// This standalone smoke process has completed every assertion at this point.
process.exit(0)
