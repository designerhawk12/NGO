import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { IdCard, Lock, Pencil, Plus, RefreshCw, Truck } from 'lucide-react'
import type { DriverVehicleOption, EmployeeDriver } from '@aaharaconnect/shared'
import { ApiClientError } from '../api/client'
import { EmptyState, formatDate, Modal, StatusBadge } from '../components/common/UI'
import { createEmployeeDriver, listDriverVehicleOptions, listDrivers, updateEmployeeDriver } from '../features/drivers/api'

type Props = {
  notify: (message: string, kind?: 'success' | 'error') => void
  onOpenVehicles: () => void
}

type DriverForm = {
  name: string
  mobile: string
  licenceNumber: string
  licenceExpiresOn: string
  employeeCode: string
  vehicleId: string
  status: 'ACTIVE' | 'INACTIVE'
}
const emptyForm: DriverForm = { name: '', mobile: '', licenceNumber: '', licenceExpiresOn: '', employeeCode: '', vehicleId: '', status: 'ACTIVE' }
const today = () => new Date().toISOString().slice(0, 10)
const toMobileDigits = (phone: string) => phone.replace(/^\+91/, '')
const formatPhone = (phone: string) => /^\+91\d{10}$/.test(phone) ? `+91 ${phone.slice(3, 8)} ${phone.slice(8)}` : phone || '—'

function driverWriteError(cause: unknown): string {
  if (!(cause instanceof ApiClientError)) return 'Could not save the driver. Try again.'
  const messages: Record<string, string> = {
    VEHICLE_ALREADY_HAS_DRIVER: 'This vehicle already has a fixed driver. Choose an unassigned vehicle.',
    VEHICLE_NOT_FOUND: 'The selected vehicle is no longer registered. Refresh and choose again.',
    VEHICLE_RETIRED: 'A retired vehicle cannot be assigned to a driver.',
    DRIVER_LICENCE_CONFLICT: 'This driving licence is already registered.',
    PHONE_CONFLICT: 'This phone number already belongs to another person in the system.',
    EMPLOYEE_CODE_CONFLICT: 'This employee ID is already registered.',
    LICENCE_EXPIRED: 'The driving licence has expired. Enter a current licence or mark the driver inactive.',
    DRIVER_HAS_UPCOMING_ASSIGNMENTS: 'This driver has upcoming pickups. Complete or cancel them before marking the driver inactive.',
    FIXED_VEHICLE_IMMUTABLE: 'A driver’s vehicle is fixed and cannot be changed.',
    VERSION_CONFLICT: 'This driver was changed by someone else. Reload and try again.',
    NETWORK_ERROR: 'Could not reach the API. Check your connection and try again.',
  }
  return messages[cause.code] ?? cause.message ?? 'Could not save the driver. Try again.'
}

function validate(form: DriverForm, isCreate: boolean): string | null {
  if (form.name.trim().length < 2) return 'Enter the driver’s full name.'
  if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) return 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.'
  if (!/^[A-Za-z0-9][A-Za-z0-9 /-]{4,39}$/.test(form.licenceNumber.trim())) return 'Enter the full driving licence number.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.licenceExpiresOn)) return 'Enter the licence expiry date.'
  if ((isCreate || form.status === 'ACTIVE') && form.licenceExpiresOn < today()) return 'The driving licence has expired. Enter a current licence.'
  if (form.employeeCode.trim() && !/^[A-Za-z0-9][A-Za-z0-9 /_-]{0,39}$/.test(form.employeeCode.trim())) return 'Employee IDs may contain letters, digits, spaces, /, _ and -.'
  if (isCreate && !form.vehicleId) return 'Select the registered NGO vehicle this driver will operate.'
  return null
}

function vehicleSummary(vehicle: { registrationNumber: string; kind: string; capacityKg: number; indicativeMaxVessels?: number | null }) {
  return `${vehicle.kind} · ${vehicle.capacityKg} kg payload${vehicle.indicativeMaxVessels ? ` · up to ${vehicle.indicativeMaxVessels} containers` : ''}`
}

export default function AssignDriver({ notify, onOpenVehicles }: Props) {
  const [drivers, setDrivers] = useState<EmployeeDriver[]>([])
  const [vehicleOptions, setVehicleOptions] = useState<DriverVehicleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<EmployeeDriver | null>(null)
  const [form, setForm] = useState<DriverForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const [nextDrivers, nextOptions] = await Promise.all([listDrivers(), listDriverVehicleOptions()])
      setDrivers(nextDrivers); setVehicleOptions(nextOptions)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const employees = useMemo(() => drivers.filter(driver => driver.driverType === 'EMPLOYEE'), [drivers])
  const legacy = useMemo(() => drivers.filter(driver => driver.driverType !== 'EMPLOYEE'), [drivers])
  const eligibleVehicles = vehicleOptions.filter(option => option.eligible)

  const openCreate = () => {
    setForm(emptyForm); setEditing(null); setFormError(null); setMode('create')
    void listDriverVehicleOptions().then(setVehicleOptions).catch(() => undefined)
  }
  const openEdit = (driver: EmployeeDriver) => {
    setEditing(driver)
    setForm({
      name: driver.name, mobile: toMobileDigits(driver.phone), licenceNumber: driver.licenceNumber,
      licenceExpiresOn: driver.licenceExpiresOn, employeeCode: driver.employeeCode ?? '', vehicleId: driver.vehicle?.id ?? '', status: driver.status,
    })
    setFormError(null); setMode('edit')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    const problem = validate(form, mode === 'create')
    if (problem) { setFormError(problem); return }
    if (mode === 'create') {
      const vehicle = vehicleOptions.find(option => option.id === form.vehicleId)
      if (!window.confirm(`Link ${form.name.trim()} permanently to ${vehicle?.registrationNumber ?? 'this vehicle'}? The vehicle cannot be changed later from the normal Admin screens.`)) return
    }
    submitting.current = true; setSaving(true); setFormError(null)
    try {
      const common = {
        name: form.name.trim(),
        phoneE164: `+91${form.mobile.trim()}`,
        licenceNumber: form.licenceNumber.trim().toUpperCase(),
        licenceExpiresOn: form.licenceExpiresOn,
        employeeCode: form.employeeCode.trim() || null,
      }
      if (mode === 'create') {
        await createEmployeeDriver({ ...common, vehicleId: form.vehicleId })
        notify('Driver registered and linked to the vehicle.')
      } else if (editing) {
        await updateEmployeeDriver(editing.driverId, {
          ...common, status: form.status, ...(editing.updatedAt ? { expectedUpdatedAt: editing.updatedAt } : {}),
        })
        notify('Driver details updated.')
      }
      setMode(null); setEditing(null); setForm(emptyForm)
      await load()
    } catch (cause) {
      setFormError(driverWriteError(cause))
    } finally {
      submitting.current = false; setSaving(false)
    }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">NGO FLEET STAFF</span><h1>Assign Driver</h1><p>Register NGO employee drivers and link each one to a registered vehicle.</p></div><button className="button button-primary" onClick={openCreate}><Plus size={18}/> Add Driver</button></div>
    <div className="info-strip"><div className="info-strip-icon"><IdCard size={21}/></div><div><strong>Drivers are NGO employees, not volunteers</strong><span>Only these drivers operate NGO vehicles. Each driver is permanently linked to one vehicle, and the pickup wizard uses that vehicle automatically.</span></div><span className="info-strip-count">{employees.length} {employees.length === 1 ? 'driver' : 'drivers'}</span></div>
    <section className="panel volunteer-panel" aria-live="polite">
      <div className="table-toolbar"><div><strong>Registered NGO drivers</strong><p className="quiet-text">Driver, contact, licence and fixed vehicle from the live database.</p></div><button className="button button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Refresh</button></div>
      {loading && drivers.length === 0 ? <p className="quiet-text" style={{ padding: 20 }}>Loading drivers…</p>
        : error && drivers.length === 0 ? <EmptyState title="Could not load drivers" description="Check your administrator session and API connection, then retry." action={<button className="button button-secondary" onClick={() => void load()}>Retry</button>}/>
          : employees.length === 0 ? <EmptyState title="No drivers registered yet" description="Register a vehicle in Vehicle Details first, then add the NGO employee who drives it." action={<button className="button button-primary" onClick={openCreate}><Plus size={16}/> Add Driver</button>}/>
            : <div className="table-scroll"><table className="data-table driver-table"><thead><tr><th>Driver</th><th>Contact</th><th>Driving licence</th><th>Assigned vehicle</th><th>Status</th><th>Actions</th></tr></thead><tbody>{employees.map(driver => <tr key={driver.driverId}>
              <td><span className="person-cell"><span><strong>{driver.name}</strong><small>{driver.employeeCode ? `Employee ID ${driver.employeeCode}` : 'No employee ID'}</small></span></span></td>
              <td>{formatPhone(driver.phone)}</td>
              <td><div className="time-cell"><strong>{driver.licenceNumber}</strong><small>{driver.licenceExpired ? 'Expired' : 'Valid until'} {formatDate(driver.licenceExpiresOn)}</small></div></td>
              <td>{driver.vehicle ? <div className="time-cell"><strong><Truck size={14} aria-hidden="true"/> {driver.vehicle.registrationNumber}</strong><small>{vehicleSummary(driver.vehicle)}</small><small>Vehicle status: {driver.vehicle.status.toLowerCase()}</small></div> : <span className="quiet-text">No vehicle linked</span>}</td>
              <td><StatusBadge status={driver.licenceExpired ? 'LICENCE EXPIRED' : driver.status}/></td>
              <td className="actions-cell"><button className="button button-secondary" onClick={() => openEdit(driver)}><Pencil size={15}/> Edit details</button></td>
            </tr>)}</tbody></table></div>}
      {legacy.length > 0 && <div className="detail-section" style={{ padding: '16px 20px' }}><h3>Historical volunteer-linked driver records</h3><p className="quiet-text">These records come from the earlier model, where volunteers could be drivers. They stay readable for past assignments but cannot be assigned to new pickups.</p><ul>{legacy.map(driver => <li key={driver.driverId}>{driver.name} · {driver.licenceNumber}{driver.vehicle ? ` · ${driver.vehicle.registrationNumber}` : ''}</li>)}</ul></div>}
      <div className="table-footer"><span>NGO employee drivers</span><span>{employees.length} {employees.length === 1 ? 'driver' : 'drivers'}</span></div>
    </section>

    {mode && <Modal title={mode === 'create' ? 'Add driver' : 'Edit driver'} subtitle={mode === 'create' ? 'Register an NGO employee and link them to one registered vehicle.' : 'Update contact and licence details. The vehicle link cannot be changed.'} onClose={() => { if (!saving) setMode(null) }}>
      <form className="dialog-form" onSubmit={event => void submit(event)} noValidate>
        <div className="form-grid">
          <label className="field field-full">Full name <span aria-hidden="true">*</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ramesh Kumar" maxLength={200} required/></label>
          <label className="field">Mobile number <span aria-hidden="true">*</span><div className="phone-input"><span>+91</span><input type="tel" inputMode="numeric" value={form.mobile} onChange={event => setForm({ ...form, mobile: event.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="9876543210" aria-label="10-digit mobile number" required/></div><small>10-digit Indian mobile number.</small></label>
          <label className="field">Employee ID<input value={form.employeeCode} onChange={event => setForm({ ...form, employeeCode: event.target.value })} placeholder="EMP-014" maxLength={40}/><small>Optional NGO staff identifier.</small></label>
          <label className="field">Driving licence number <span aria-hidden="true">*</span><input value={form.licenceNumber} onChange={event => setForm({ ...form, licenceNumber: event.target.value.toUpperCase() })} placeholder="KA0120200001234" maxLength={40} autoComplete="off" required/></label>
          <label className="field">Licence expiry date <span aria-hidden="true">*</span><input type="date" value={form.licenceExpiresOn} min={mode === 'create' ? today() : undefined} onChange={event => setForm({ ...form, licenceExpiresOn: event.target.value })} required/></label>
          {mode === 'create' ? <div className="field field-full">
            <span>NGO vehicle <span aria-hidden="true">*</span></span>
            {vehicleOptions.length === 0 ? <div className="wizard-tip error-tip" role="alert"><p>No vehicles registered. Please register a vehicle in Vehicle Details before adding a driver.</p><button type="button" className="button button-secondary" onClick={() => { setMode(null); onOpenVehicles() }}><Truck size={15}/> Open Vehicle Details</button></div>
              : eligibleVehicles.length === 0 ? <div className="wizard-tip error-tip" role="alert"><p>Every registered vehicle already has a driver or is retired. Register another vehicle in Vehicle Details first.</p><button type="button" className="button button-secondary" onClick={() => { setMode(null); onOpenVehicles() }}><Truck size={15}/> Open Vehicle Details</button></div>
                : <><select value={form.vehicleId} onChange={event => setForm({ ...form, vehicleId: event.target.value })} required aria-label="Select vehicle"><option value="">Select a registered vehicle</option>{eligibleVehicles.map(option => <option key={option.id} value={option.id}>{`${option.registrationNumber} · ${vehicleSummary(option)} · ${option.status.toLowerCase()}`}</option>)}</select><small>Only vehicles without a driver are listed. This link is permanent.</small></>}
          </div> : <>
            <div className="field field-full"><span>Assigned vehicle</span><p className="quiet-text"><Lock size={14} aria-hidden="true"/> {editing?.vehicle ? `${editing.vehicle.registrationNumber} · ${vehicleSummary(editing.vehicle)}` : 'No vehicle linked'} (fixed)</p></div>
            <label className="field">Driver status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as DriverForm['status'] })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><small>Inactive drivers keep their vehicle link but cannot be assigned.</small></label>
          </>}
        </div>
        {formError && <p className="settings-auth-message" role="alert">{formError}</p>}
        <div className="dialog-footer"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setMode(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving || (mode === 'create' && eligibleVehicles.length === 0)}>{saving ? 'Saving…' : mode === 'create' ? 'Assign Driver' : 'Save Changes'}</button></div>
      </form>
    </Modal>}
  </>
}
