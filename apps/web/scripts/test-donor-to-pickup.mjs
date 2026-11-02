import assert from 'node:assert/strict'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import React, { act } from 'react'

process.env.VITE_API_BASE_URL = 'http://localhost:4000/api/v1'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
})
const { window } = dom
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'Event', 'MouseEvent']) {
  globalThis[key] = key === 'window' ? window : window[key]
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.scrollTo = () => {}
const { createRoot } = await import('react-dom/client')

const webRoot = path.resolve('apps/web')
const server = await createServer({
  root: webRoot,
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  console.log('\n======================================================')
  console.log('STARTING END-TO-END DONOR-TO-PICKUP WORKFLOW TEST')
  console.log('======================================================\n')

  console.log('--- Step 1: Donor Submits Food Request ---')
  const testDonationId = 'f1000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0')
  const testDonation = {
    id: testDonationId,
    donorName: 'Sunita Reddy',
    location: 'Grand Palace Kalyana Mantapa, Indiranagar, Bengaluru',
    readyAt: new Date(Date.now() + 1800000).toISOString(),
    pickupDeadline: new Date(Date.now() + 7200000).toISOString(),
    status: 'SUBMITTED',
    safetyReview: 'APPROVED',
    foods: [
      { foodId: 'F1', name: 'Rice', foodType: 'VEG', unit: 'kg', quantity: 25 },
      { foodId: 'F2', name: 'Veg curry', foodType: 'VEG', unit: 'kg', quantity: 15 },
    ],
    totalFeeds: 100,
    isDemo: true,
  }

  // Store donation in localStorage as public/donor/index.html does
  window.localStorage.setItem('aa:donations', JSON.stringify([testDonation]))
  window.localStorage.setItem('aa:donor-live-mode', '0')
  console.log(`✓ Donation stored with ID: ${testDonationId}`)
  console.log(`  Donor: ${testDonation.donorName}`)
  console.log(`  Location: ${testDonation.location}`)
  console.log(`  Status: ${testDonation.status}`)

  console.log('\n--- Step 2: Coordinator Portal Displays Food Request ---')
  const { default: Root } = await server.ssrLoadModule('/src/Root.tsx')
  const root = createRoot(document.getElementById('root'))
  const click = async (el) => {
    assert.ok(el, 'Expected element to click')
    await act(async () => {
      el.click()
      await Promise.resolve()
    })
  }

  window.location.hash = '#/workspace'
  await act(async () => root.render(React.createElement(Root)))

  // 2a. Verify on "Food & Donors" tab
  const foodDonorBtn = [...document.querySelectorAll('.side-nav button')].find((b) =>
    b.textContent.includes('Food & Donors')
  )
  assert.ok(foodDonorBtn, 'Food & Donors tab button must exist')
  await click(foodDonorBtn)

  const foodDonorText = document.querySelector('main').textContent
  assert.match(foodDonorText, /Sunita Reddy/, 'Submitted food donation must appear in Food & Donors')
  console.log('✓ Food request visible on Food & Donors tab')

  // 2b. Navigate to "Pickup & Logistics"
  const pickupTabBtn = [...document.querySelectorAll('.side-nav button')].find((b) =>
    b.textContent.includes('Pickup & Logistics')
  )
  assert.ok(pickupTabBtn, 'Pickup & Logistics tab button must exist')
  await click(pickupTabBtn)

  assert.match(document.querySelector('main').textContent, /Pickup & Logistics/)
  console.log('✓ Navigated to Pickup & Logistics module')

  console.log('\n--- Step 3: Coordinator Schedules Pickup ---')
  const scheduleBtn = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.includes('Schedule Pickup')
  )
  assert.ok(scheduleBtn, 'Schedule Pickup button must exist')
  await click(scheduleBtn)

  const modal = document.querySelector('.dialog-form') || document.querySelector('.modal')
  assert.ok(modal, 'Schedule Pickup dialog must open')

  // Verify the select has Sunita Reddy's donation
  const selectEl = modal.querySelector('select')
  assert.ok(selectEl, 'Food request select element must exist in dialog')
  const matchingOption = [...selectEl.options].find((opt) => opt.value === testDonationId)
  assert.ok(matchingOption, 'Sunita Reddy donation option must exist in the food request select')
  console.log(`✓ Dialog contains food request option: "${matchingOption.textContent}"`)

  // Select Sunita Reddy's food request
  await act(async () => {
    selectEl.value = testDonationId
    selectEl.dispatchEvent(new window.Event('change', { bubbles: true }))
  })

  // Submit the form
  const submitPickupBtn = [...modal.querySelectorAll('button')].find(
    (b) => b.getAttribute('type') === 'submit' || b.textContent.includes('Schedule Pickup')
  )
  assert.ok(submitPickupBtn, 'Submit button must exist')
  await click(submitPickupBtn)

  // Verify pickup card is now created and listed
  const mainAfterSchedule = document.querySelector('main').textContent
  assert.match(mainAfterSchedule, /Sunita Reddy/, 'Scheduled pickup must display Sunita Reddy in list')
  assert.match(mainAfterSchedule, /Planned/, 'Scheduled pickup must have status Planned')
  console.log('✓ Pickup scheduled successfully (status: Planned / PLANNED)')

  console.log('\n--- Step 4: Assign Crew, Driver & Vehicle via Wizard ---')
  // Find the "Assign Crew" button for this pickup
  const assignBtn = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === 'Assign Crew'
  )
  assert.ok(assignBtn, 'Assign Crew button must be visible for planned pickup')
  await click(assignBtn)

  const wizardModal = document.querySelector('.wizard')
  assert.ok(wizardModal, 'Assign wizard must open')

  const getNextBtn = () =>
    [...document.querySelectorAll('.wizard-footer button')].find(
      (b) => b.textContent.includes('Continue') || b.textContent.includes('Next')
    )
  const getConfirmBtn = () =>
    [...document.querySelectorAll('.wizard-footer button')].find(
      (b) => b.textContent.includes('Confirm Assignment')
    )

  // Step 1: Select Volunteers
  console.log('  Wizard Step 1: Select Volunteer')
  const firstEligibleVol = document.querySelector('.wizard [role="button"][tabindex="0"]')
  assert.ok(firstEligibleVol, 'Eligible volunteer option must exist')
  await click(firstEligibleVol)
  const next1 = getNextBtn()
  assert.ok(next1 && !next1.disabled, 'Continue button should be enabled after volunteer selection')
  await click(next1)

  // Step 2: Select Driver
  console.log('  Wizard Step 2: Select Driver')
  const firstEligibleDrv = document.querySelector('.wizard [role="button"][tabindex="0"]')
  assert.ok(firstEligibleDrv, 'Eligible driver option must exist')
  await click(firstEligibleDrv)
  const next2 = getNextBtn()
  assert.ok(next2 && !next2.disabled, 'Continue button should be enabled after driver selection')
  await click(next2)

  // Step 3: Select Vehicle
  console.log('  Wizard Step 3: Select Vehicle')
  const firstEligibleVeh = document.querySelector('.wizard [role="button"][tabindex="0"]')
  assert.ok(firstEligibleVeh, 'Eligible vehicle option must exist')
  await click(firstEligibleVeh)
  const next3 = getNextBtn()
  assert.ok(next3 && !next3.disabled, 'Continue button should be enabled after vehicle selection')
  await click(next3)

  // Step 4: Containers
  console.log('  Wizard Step 4: Containers & Load')
  const next4 = getNextBtn()
  assert.ok(next4 && !next4.disabled, 'Continue button should be enabled for containers')
  await click(next4)

  // Step 5: Review & Confirm
  console.log('  Wizard Step 5: Review and Confirm')
  const confirmBtn = getConfirmBtn()
  assert.ok(confirmBtn && !confirmBtn.disabled, 'Confirm Assignment button must be enabled')
  await click(confirmBtn)

  // Verify status is updated to ASSIGNED
  const mainAfterAssign = document.querySelector('main').textContent
  assert.match(mainAfterAssign, /Assigned/, 'Pickup status must now be Assigned')
  console.log('✓ Crew, driver, and vehicle successfully assigned (status: Assigned / ASSIGNED)')

  console.log('\n--- Step 5: Verify Persistence Across Page Refresh ---')
  const savedPickupsRaw = window.localStorage.getItem('aa:demo-pickups')
  const savedAssignmentsRaw = window.localStorage.getItem('aa:demo-assignments')

  assert.ok(savedPickupsRaw, 'Scheduled pickup must persist in localStorage (aa:demo-pickups)')
  const savedPickups = JSON.parse(savedPickupsRaw)
  const matchingPickup = savedPickups.find((p) => p.foodRequestId === testDonationId)
  assert.ok(matchingPickup, 'Matching pickup must exist in persisted aa:demo-pickups')
  assert.equal(matchingPickup.status, 'ASSIGNED', 'Persisted pickup must have status ASSIGNED')

  assert.ok(savedAssignmentsRaw, 'Assignment must persist in localStorage (aa:demo-assignments)')
  const savedAssignments = JSON.parse(savedAssignmentsRaw)
  const matchingAssignment = savedAssignments[matchingPickup.id]
  assert.ok(matchingAssignment, 'Assignment for pickup must exist in persisted aa:demo-assignments')
  assert.equal(matchingAssignment.status, 'ACCEPTED', 'Persisted assignment must have status ACCEPTED')
  console.log(`✓ Persisted in localStorage:`)
  console.log(`  Pickup ID: ${matchingPickup.id} (status: ${matchingPickup.status})`)
  console.log(`  Assignment ID: ${matchingAssignment.id} (driver: ${matchingAssignment.driverId}, vehicle: ${matchingAssignment.vehicleId})`)

  // Simulate full browser reload by unmounting root and mounting afresh
  await act(async () => root.unmount())
  const newRoot = createRoot(document.getElementById('root'))
  await act(async () => newRoot.render(React.createElement(Root)))

  const reloadPickupBtn = [...document.querySelectorAll('.side-nav button')].find((b) =>
    b.textContent.includes('Pickup & Logistics')
  )
  await click(reloadPickupBtn)

  const reloadedMain = document.querySelector('main').textContent
  assert.match(reloadedMain, /Sunita Reddy/, 'Donor name must still appear after reload')
  assert.match(reloadedMain, /Assigned/, 'Assigned status must still appear after reload')
  console.log('✓ Persistence verified: data restored correctly on fresh mount!')

  console.log('\n======================================================')
  console.log('ALL TESTS PASSED: FULL DONOR-TO-PICKUP FLOW VERIFIED!')
  console.log('======================================================\n')

  await act(async () => newRoot.unmount())
} catch (err) {
  console.error('\n❌ TEST FAILED WITH ERROR:\n', err)
  process.exit(1)
} finally {
  await server.close()
  dom.window.close()
  process.exit(0)
}
