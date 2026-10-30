import {
  AlertCircle,
  CheckCircle,
  FileText,
  Info,
  Package,
  ShieldCheck,
  Truck,
  User,
  XCircle,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import type { Driver, Vehicle, VehicleMaintenanceRecord } from '../../types'
import { Modal } from '../common/UI'

type Props = {
  vehicle?: Vehicle
  existingVehicles?: Vehicle[]
  drivers: Driver[]
  maintenanceRecords?: VehicleMaintenanceRecord[]
  onClose: () => void
  onSave: (vehicle: Vehicle) => void
  notify: (message: string, kind?: 'success' | 'error') => void
}

const VEHICLE_TYPES = ['Van', 'Mini Truck', 'Tempo', 'Truck', 'Auto Rickshaw', 'Pickup', 'Other']
const SIZES: ('SMALL' | 'MEDIUM' | 'LARGE')[] = ['SMALL', 'MEDIUM', 'LARGE']

export default function VehicleModal({ vehicle, existingVehicles, drivers, maintenanceRecords, onClose, onSave, notify }: Props) {
  const isEdit = !!vehicle

  // 1. Vehicle Identity State
  const [registrationNumber, setRegistrationNumber] = useState(vehicle?.registrationNumber ?? '')

  const isKnownType = VEHICLE_TYPES.slice(0, -1).includes(vehicle?.type ?? '')
  const [selectedType, setSelectedType] = useState<string>(() => {
    if (!vehicle?.type) return 'Van'
    return isKnownType ? vehicle.type : 'Other'
  })
  const [customType, setCustomType] = useState<string>(() => {
    if (!vehicle?.type) return ''
    return isKnownType ? '' : vehicle.type
  })

  const [sizeCategory, setSizeCategory] = useState<'SMALL' | 'MEDIUM' | 'LARGE'>(vehicle?.sizeCategory ?? 'MEDIUM')
  const [indicativeMaxVessels, setIndicativeMaxVessels] = useState(String(vehicle?.indicativeMaxVessels ?? 12))

  const [statusSelection, setStatusSelection] = useState<string>(() => {
    if (!vehicle?.status) return 'AVAILABLE'
    const s = vehicle.status.toUpperCase()
    if (s === 'ACTIVE' || s === 'AVAILABLE') return 'AVAILABLE'
    if (s === 'ON TRIP') return 'ON TRIP'
    if (s === 'MAINTENANCE') return 'MAINTENANCE'
    return '__other__'
  })
  const [customStatus, setCustomStatus] = useState<string>(() => {
    if (!vehicle?.status) return ''
    const s = vehicle.status.toUpperCase()
    if (s === 'ACTIVE' || s === 'AVAILABLE' || s === 'ON TRIP' || s === 'MAINTENANCE') return ''
    return vehicle.status
  })

  // 2. Capacity Details State
  const [capacityKg, setCapacityKg] = useState(String(vehicle?.capacityKg ?? 250))
  const [usableCargoVolume, setUsableCargoVolume] = useState(() => {
    if (vehicle?.usableCargoVolume) return vehicle.usableCargoVolume
    if (vehicle?.capacityKg) return `${(vehicle.capacityKg * 0.015).toFixed(1)} m³`
    return ''
  })

  // 3. Food Transport Suitability State
  const [tempCapability, setTempCapability] = useState<'AMBIENT' | 'CHILLED' | 'REFRIGERATED'>(
    vehicle?.temperatureCapability ?? 'AMBIENT'
  )
  const [equipInsulated, setEquipInsulated] = useState(vehicle?.equipment?.insulatedBody ?? false)
  const [equipRefrigerated, setEquipRefrigerated] = useState(vehicle?.equipment?.refrigeratedUnit ?? false)
  const [equipFoodContainers, setEquipFoodContainers] = useState(vehicle?.equipment?.foodGradeContainers ?? true)
  const [foodContactSuitable, setFoodContactSuitable] = useState<boolean>(vehicle?.foodContactSuitable ?? true)

  // 4. Driver & Assignment State
  const matchedDriver = drivers.find(
    d =>
      (vehicle?.driverId && d.driverId === vehicle.driverId) ||
      (vehicle?.driverName && d.name.toLowerCase() === vehicle.driverName.toLowerCase()) ||
      (vehicle?.driverId && d.name.toLowerCase() === vehicle.driverId.toLowerCase())
  )
  const [driverSelection, setDriverSelection] = useState<string>(() => {
    if (matchedDriver) return matchedDriver.driverId
    if (vehicle?.driverName || vehicle?.driverId) return '__other__'
    return ''
  })
  const [customDriverName, setCustomDriverName] = useState<string>(() => {
    if (matchedDriver) return matchedDriver.name
    return vehicle?.driverName || vehicle?.driverId || ''
  })

  const todayStr = useMemo(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [])

  const defaultDates = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

    const reg = new Date(d); reg.setFullYear(reg.getFullYear() + 1)
    const ins = new Date(d); ins.setFullYear(ins.getFullYear() + 1)
    const puc = new Date(d); puc.setMonth(puc.getMonth() + 6)
    const svc = new Date(d); svc.setMonth(svc.getMonth() + 2)
    const clean = new Date(d); clean.setDate(clean.getDate() - 1)
    const nextClean = new Date(d); nextClean.setDate(nextClean.getDate() + 3)

    return {
      regExp: fmt(reg),
      insExp: fmt(ins),
      pucExp: fmt(puc),
      nextSvc: fmt(svc),
      lastClean: fmt(clean),
      nextClean: fmt(nextClean),
    }
  }, [])

  const existingNextSvc =
    vehicle?.nextServiceDate ||
    vehicle?.nextMaintenance ||
    maintenanceRecords?.find(m => m.vehicleId === vehicle?.vehicleId && m.nextServiceDueOn)?.nextServiceDueOn

  // 5. Compliance & Key Dates State - pre-filled from existing vehicle or smart defaults so user can see and edit
  const [registrationExpiry, setRegistrationExpiry] = useState(
    vehicle?.registrationExpiry || (isEdit ? defaultDates.regExp : '')
  )
  const [insuranceExpiry, setInsuranceExpiry] = useState(
    vehicle?.insuranceExpiry || (isEdit ? defaultDates.insExp : '')
  )
  const [pollutionExpiry, setPollutionExpiry] = useState(
    vehicle?.pollutionExpiry || (isEdit ? defaultDates.pucExp : '')
  )
  const [nextServiceDate, setNextServiceDate] = useState(
    existingNextSvc || (isEdit ? defaultDates.nextSvc : '')
  )
  const [lastCleaningDate, setLastCleaningDate] = useState(
    vehicle?.lastCleaningDate || (isEdit ? defaultDates.lastClean : '')
  )
  const [nextCleaningDueDate, setNextCleaningDueDate] = useState(
    vehicle?.nextCleaningDueDate || (isEdit ? defaultDates.nextClean : '')
  )

  const isRegExpInvalid = Boolean(registrationExpiry && registrationExpiry < todayStr)
  const isInsExpInvalid = Boolean(insuranceExpiry && insuranceExpiry < todayStr)
  const isPucExpInvalid = Boolean(pollutionExpiry && pollutionExpiry < todayStr)
  const isNextSvcInvalid = Boolean(nextServiceDate && nextServiceDate < todayStr)
  const isLastCleanInvalid = Boolean(lastCleaningDate && lastCleaningDate > todayStr)
  const isNextCleanInvalid = Boolean(
    nextCleaningDueDate && (nextCleaningDueDate < todayStr || (lastCleaningDate && nextCleaningDueDate < lastCleaningDate))
  )

  const cleanReg = registrationNumber.trim().toUpperCase()
  const isDuplicateReg = Boolean(
    cleanReg &&
    existingVehicles?.some(
      v => v.registrationNumber.trim().toUpperCase() === cleanReg && v.vehicleId !== vehicle?.vehicleId
    )
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const reg = cleanReg
    if (!reg) {
      notify('Please enter a registration number.', 'error')
      return
    }

    if (isDuplicateReg) {
      notify('Registration number already exists', 'error')
      return
    }

    const finalType = selectedType === 'Other' ? customType.trim() : selectedType
    if (!finalType) {
      notify('Please enter a vehicle type.', 'error')
      return
    }

    const cap = Number(capacityKg)
    if (!cap || cap <= 0) {
      notify('Please enter a valid positive payload capacity.', 'error')
      return
    }
    const vessels = Number(indicativeMaxVessels)
    if (indicativeMaxVessels && (isNaN(vessels) || vessels < 0)) {
      notify('Please enter a valid indicative vessel capacity.', 'error')
      return
    }

    let finalDriverId: string | undefined = undefined
    let finalDriverName: string | undefined = undefined
    if (driverSelection === '__other__') {
      const manualName = customDriverName.trim()
      if (!manualName) {
        notify('Please enter the driver name.', 'error')
        return
      }
      finalDriverName = manualName
    } else if (driverSelection) {
      finalDriverId = driverSelection
      finalDriverName = drivers.find(d => d.driverId === driverSelection)?.name
    }

    if (!finalDriverName) {
      notify('Please select or enter a driver name.', 'error')
      return
    }

    if (isRegExpInvalid || isInsExpInvalid || isPucExpInvalid || isNextSvcInvalid || isLastCleanInvalid || isNextCleanInvalid) {
      notify('Date is invalid', 'error')
      return
    }

    let finalStatus = statusSelection
    if (statusSelection === '__other__') {
      const manualStatus = customStatus.trim()
      if (!manualStatus) {
        notify('Please enter the vehicle status.', 'error')
        return
      }
      finalStatus = manualStatus.toUpperCase()
    }

    const payload: Vehicle = {
      vehicleId: vehicle?.vehicleId ?? '',
      registrationNumber: reg,
      type: finalType,
      sizeCategory,
      capacityKg: cap,
      indicativeMaxVessels: vessels > 0 ? vessels : undefined,
      usableCargoVolume: usableCargoVolume.trim() || undefined,
      temperatureCapability: tempCapability,
      equipment: {
        insulatedBody: equipInsulated,
        refrigeratedUnit: equipRefrigerated,
        foodGradeContainers: equipFoodContainers,
      },
      foodContactSuitable,
      registrationExpiry: registrationExpiry || undefined,
      insuranceExpiry: insuranceExpiry || undefined,
      pollutionExpiry: pollutionExpiry || undefined,
      nextServiceDate: nextServiceDate || undefined,
      lastCleaningDate: lastCleaningDate || undefined,
      nextCleaningDueDate: nextCleaningDueDate || undefined,
      driverId: finalDriverId,
      driverName: finalDriverName,
      status: finalStatus,
      lastMaintenance: vehicle?.lastMaintenance,
      nextMaintenance: nextServiceDate || vehicle?.nextMaintenance,
    }

    onSave(payload)
    onClose()
  }

  return (
    <Modal
      wide={true}
      title={isEdit ? 'Edit Vehicle' : 'Add Vehicle'}
      subtitle={isEdit ? 'Update specifications and status for this vehicle.' : 'Register a new transport vehicle for food recovery dispatches.'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="dialog-form max-h-[calc(88vh-120px)] overflow-y-auto pr-1 space-y-4">
        {/* 1. Vehicle Identity */}
        <div className="rounded-xl border border-emerald-200/80 bg-white hover:border-emerald-300 transition-colors shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
            <div className="flex items-center gap-2">
              <Truck className="text-emerald-700" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">1. Vehicle Identity</h3>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-100/90 text-emerald-800 border border-emerald-200/70 px-2.5 py-0.5 rounded-full">
              Already in current form
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="field md:col-span-3">
              <label htmlFor="veh-reg">
                Registration Number <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-reg"
                type="text"
                value={registrationNumber}
                onChange={e => setRegistrationNumber(e.target.value)}
                placeholder="e.g. KA-01-AB-1234"
                className={isDuplicateReg ? '!border-rose-500 !bg-rose-50/20' : ''}
                required
              />
              {isDuplicateReg && (
                <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} className="shrink-0" /> Registration number already exists
                </span>
              )}
            </div>
            <div className="field md:col-span-2">
              <label htmlFor="veh-status">
                Lifecycle Status <span className="text-rose-500">*</span>
              </label>
              <select
                id="veh-status"
                value={statusSelection}
                onChange={e => setStatusSelection(e.target.value)}
              >
                <option value="AVAILABLE">Available</option>
                <option value="ON TRIP">On Trip</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="__other__">Other (Enter status manually)</option>
              </select>
              {statusSelection === '__other__' && (
                <input
                  id="veh-custom-status"
                  type="text"
                  className="mt-2"
                  value={customStatus}
                  onChange={e => setCustomStatus(e.target.value)}
                  placeholder="e.g. In Inspection, Reserved"
                  required
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="field">
              <label htmlFor="veh-type">
                Vehicle Type <span className="text-rose-500">*</span>
              </label>
              <select id="veh-type" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
                {VEHICLE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {selectedType === 'Other' && (
                <input
                  id="veh-custom-type"
                  type="text"
                  className="mt-2"
                  value={customType}
                  onChange={e => setCustomType(e.target.value)}
                  placeholder="e.g. Electric Cargo Bike, Scooter"
                  required
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="veh-size">
                Size Category <span className="text-rose-500">*</span>
              </label>
              <select id="veh-size" value={sizeCategory} onChange={e => setSizeCategory(e.target.value as 'SMALL' | 'MEDIUM' | 'LARGE')}>
                {SIZES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="veh-vessels">
                Indicative Vessel Capacity <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-vessels"
                type="number"
                min="1"
                step="1"
                value={indicativeMaxVessels}
                onChange={e => setIndicativeMaxVessels(e.target.value)}
                placeholder="12"
              />
            </div>
          </div>
        </div>

        {/* 2. Capacity Details */}
        <div className="rounded-xl border border-emerald-200/80 bg-white hover:border-emerald-300 transition-colors shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
            <div className="flex items-center gap-2">
              <Package className="text-emerald-700" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">2. Capacity Details</h3>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-100/90 text-emerald-800 border border-emerald-200/70 px-2.5 py-0.5 rounded-full">
              Payload already present + New
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="field">
              <label htmlFor="veh-cap">
                Payload Capacity (kg) <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-cap"
                type="number"
                min="1"
                step="1"
                value={capacityKg}
                onChange={e => setCapacityKg(e.target.value)}
                placeholder="250"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="veh-cargo-vol" className="flex items-center gap-1.5">
                <span>Usable Cargo Volume (litres/m³)</span>
                <span className="text-emerald-700 font-semibold">(Recommended)</span>
                <Info size={13} className="text-emerald-600" />
              </label>
              <input
                id="veh-cargo-vol"
                type="text"
                value={usableCargoVolume}
                onChange={e => setUsableCargoVolume(e.target.value)}
                placeholder="e.g. 5.5 m³ or 5500 litres"
              />
            </div>
          </div>
        </div>

        {/* 3. Food Transport Suitability */}
        <div className="rounded-xl border border-emerald-200/80 bg-white hover:border-emerald-300 transition-colors shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-700" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">3. Food Transport Suitability</h3>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-100/90 text-emerald-800 border border-emerald-200/70 px-2.5 py-0.5 rounded-full">
              New
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Temperature Capability */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-700">
                Temperature Capability <span className="text-rose-500">*</span>
              </span>
              <div className="space-y-1.5 mt-1">
                <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  tempCapability === 'AMBIENT'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold shadow-xs'
                    : 'border-slate-200 hover:border-emerald-300 bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="temp-capability"
                    value="AMBIENT"
                    checked={tempCapability === 'AMBIENT'}
                    onChange={() => setTempCapability('AMBIENT')}
                    className="!w-4 !h-4 !min-w-[16px] !max-w-[16px] !min-h-[16px] !h-4 !p-0 accent-emerald-600 cursor-pointer"
                  />
                  <span>Ambient (normal)</span>
                </label>
                <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  tempCapability === 'CHILLED'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold shadow-xs'
                    : 'border-slate-200 hover:border-emerald-300 bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="temp-capability"
                    value="CHILLED"
                    checked={tempCapability === 'CHILLED'}
                    onChange={() => setTempCapability('CHILLED')}
                    className="!w-4 !h-4 !min-w-[16px] !max-w-[16px] !min-h-[16px] !h-4 !p-0 accent-emerald-600 cursor-pointer"
                  />
                  <span>Chilled (2–8 °C)</span>
                </label>
                <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  tempCapability === 'REFRIGERATED'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold shadow-xs'
                    : 'border-slate-200 hover:border-emerald-300 bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="temp-capability"
                    value="REFRIGERATED"
                    checked={tempCapability === 'REFRIGERATED'}
                    onChange={() => setTempCapability('REFRIGERATED')}
                    className="!w-4 !h-4 !min-w-[16px] !max-w-[16px] !min-h-[16px] !h-4 !p-0 accent-emerald-600 cursor-pointer"
                  />
                  <span>Refrigerated (&lt; 2 °C)</span>
                </label>
              </div>
            </div>

            {/* Vehicle Equipment */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-700">
                Vehicle Equipment <span className="text-rose-500">*</span>
              </span>
              <div className="space-y-1.5 mt-1">
                <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  equipInsulated
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold shadow-xs'
                    : 'border-slate-200 hover:border-emerald-300 bg-white text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={equipInsulated}
                    onChange={e => setEquipInsulated(e.target.checked)}
                    className="!w-4 !h-4 !min-w-[16px] !max-w-[16px] !min-h-[16px] !h-4 !p-0 accent-emerald-600 cursor-pointer rounded"
                  />
                  <span>Insulated body</span>
                </label>
                <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  equipRefrigerated
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold shadow-xs'
                    : 'border-slate-200 hover:border-emerald-300 bg-white text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={equipRefrigerated}
                    onChange={e => setEquipRefrigerated(e.target.checked)}
                    className="!w-4 !h-4 !min-w-[16px] !max-w-[16px] !min-h-[16px] !h-4 !p-0 accent-emerald-600 cursor-pointer rounded"
                  />
                  <span>Refrigerated unit</span>
                </label>
                <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  equipFoodContainers
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold shadow-xs'
                    : 'border-slate-200 hover:border-emerald-300 bg-white text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={equipFoodContainers}
                    onChange={e => setEquipFoodContainers(e.target.checked)}
                    className="!w-4 !h-4 !min-w-[16px] !max-w-[16px] !min-h-[16px] !h-4 !p-0 accent-emerald-600 cursor-pointer rounded"
                  />
                  <span>Food-grade containers available</span>
                </label>
              </div>
            </div>

            {/* Food-contact Suitable */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-700">
                Food-contact Suitable <span className="text-rose-500">*</span>
              </span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <label className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  foodContactSuitable === true
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold shadow-xs'
                    : 'border-slate-200 hover:border-emerald-300 bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="food-contact-suitable"
                    checked={foodContactSuitable === true}
                    onChange={() => setFoodContactSuitable(true)}
                    className="!w-4 !h-4 !min-w-[16px] !max-w-[16px] !min-h-[16px] !h-4 !p-0 accent-emerald-600 cursor-pointer"
                  />
                  <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                  <span>Yes</span>
                </label>
                <label className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  foodContactSuitable === false
                    ? 'border-rose-400 bg-rose-50 text-rose-900 font-semibold shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="food-contact-suitable"
                    checked={foodContactSuitable === false}
                    onChange={() => setFoodContactSuitable(false)}
                    className="!w-4 !h-4 !min-w-[16px] !max-w-[16px] !min-h-[16px] !h-4 !p-0 accent-rose-600 cursor-pointer"
                  />
                  <XCircle size={15} className="text-rose-600 shrink-0" />
                  <span>No</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Driver & Assignment */}
        <div className="rounded-xl border border-emerald-200/80 bg-white hover:border-emerald-300 transition-colors shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
            <div className="flex items-center gap-2">
              <User className="text-emerald-700" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">4. Driver & Assignment</h3>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-100/90 text-emerald-800 border border-emerald-200/70 px-2.5 py-0.5 rounded-full">
              Mandatory
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="field">
              <label htmlFor="veh-driver">
                Assigned Driver <span className="text-rose-500">*</span>
              </label>
              <select
                id="veh-driver"
                value={driverSelection}
                onChange={e => {
                  const val = e.target.value
                  setDriverSelection(val)
                  if (val && val !== '__other__') {
                    const d = drivers.find(drv => drv.driverId === val)
                    if (d) setCustomDriverName(d.name)
                  }
                }}
                required
              >
                <option value="">Select a driver</option>
                {drivers.map(d => (
                  <option key={d.driverId} value={d.driverId}>
                    {d.name} {d.phone ? `(${d.phone})` : ''} ({d.status})
                  </option>
                ))}
                <option value="__other__">Other (Enter name manually)</option>
              </select>
              {driverSelection === '__other__' && (
                <input
                  id="veh-custom-driver"
                  type="text"
                  className="mt-2"
                  value={customDriverName}
                  onChange={e => setCustomDriverName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  required
                />
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                No permanent driver is required. Driver will be assigned per pickup.
              </p>
            </div>

            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-lg p-3 text-xs text-emerald-900 flex items-start gap-2.5">
              <Info size={16} className="text-emerald-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Driver assignment is managed when creating or scheduling a pickup. This vehicle will be automatically marked On Trip when an active assignment exists.
              </p>
            </div>
          </div>
        </div>

        {/* 5. Compliance & Key Dates */}
        <div className="rounded-xl border border-emerald-200/80 bg-white hover:border-emerald-300 transition-colors shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
            <div className="flex items-center gap-2">
              <FileText className="text-emerald-700" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">5. Compliance & Key Dates</h3>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-100/90 text-emerald-800 border border-emerald-200/70 px-2.5 py-0.5 rounded-full">
              New/Enhanced
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="field">
              <label htmlFor="veh-reg-exp">
                Registration Expiry <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-reg-exp"
                type="date"
                min={todayStr}
                value={registrationExpiry}
                onChange={e => setRegistrationExpiry(e.target.value)}
                className={isRegExpInvalid ? '!border-rose-500 !bg-rose-50/20' : ''}
              />
              {isRegExpInvalid && (
                <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} className="shrink-0" /> Date is invalid
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="veh-ins-exp">
                Insurance Expiry <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-ins-exp"
                type="date"
                min={todayStr}
                value={insuranceExpiry}
                onChange={e => setInsuranceExpiry(e.target.value)}
                className={isInsExpInvalid ? '!border-rose-500 !bg-rose-50/20' : ''}
              />
              {isInsExpInvalid && (
                <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} className="shrink-0" /> Date is invalid
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="veh-puc-exp">
                Pollution Certificate Expiry <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-puc-exp"
                type="date"
                min={todayStr}
                value={pollutionExpiry}
                onChange={e => setPollutionExpiry(e.target.value)}
                className={isPucExpInvalid ? '!border-rose-500 !bg-rose-50/20' : ''}
              />
              {isPucExpInvalid && (
                <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} className="shrink-0" /> Date is invalid
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="field">
              <label htmlFor="veh-next-svc">
                Next Service Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-next-svc"
                type="date"
                min={todayStr}
                value={nextServiceDate}
                onChange={e => setNextServiceDate(e.target.value)}
                className={isNextSvcInvalid ? '!border-rose-500 !bg-rose-50/20' : ''}
              />
              {isNextSvcInvalid && (
                <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} className="shrink-0" /> Date is invalid
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="veh-last-clean">
                Last Cleaning Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-last-clean"
                type="date"
                max={todayStr}
                value={lastCleaningDate}
                onChange={e => setLastCleaningDate(e.target.value)}
                className={isLastCleanInvalid ? '!border-rose-500 !bg-rose-50/20' : ''}
              />
              {isLastCleanInvalid && (
                <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} className="shrink-0" /> Date is invalid
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="veh-next-clean">
                Next Cleaning Due Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="veh-next-clean"
                type="date"
                min={lastCleaningDate || todayStr}
                value={nextCleaningDueDate}
                onChange={e => setNextCleaningDueDate(e.target.value)}
                className={isNextCleanInvalid ? '!border-rose-500 !bg-rose-50/20' : ''}
              />
              {isNextCleanInvalid && (
                <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1 mt-1">
                  <AlertCircle size={12} className="shrink-0" /> Date is invalid
                </span>
              )}
            </div>
          </div>

          <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-lg p-3 text-xs text-emerald-900 flex items-start gap-2.5">
            <AlertCircle size={16} className="text-emerald-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              These dates are used to determine dispatch readiness. Vehicles with expired documents or overdue service/cleaning may not be available for assignment.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm pt-4 pb-2 border-t border-emerald-100 flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-all shadow-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-md shadow-emerald-700/20 hover:shadow-lg hover:shadow-emerald-700/30 flex items-center gap-2 cursor-pointer border border-emerald-600"
          >
            <CheckCircle size={16} className="text-white" />
            <span>Save Vehicle</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
