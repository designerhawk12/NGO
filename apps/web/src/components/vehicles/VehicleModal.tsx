import {
  AlertCircle,
  CheckCircle,
  Info,
  Package,
  ShieldCheck,
  Truck,
  User,
  XCircle,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { Vehicle, VehicleMaintenanceRecord } from '../../types'
import { Modal } from '../common/UI'

type Props = {
  vehicle?: Vehicle
  existingVehicles?: Vehicle[]
  maintenanceRecords?: VehicleMaintenanceRecord[]
  onClose: () => void
  onSave: (vehicle: Vehicle) => boolean | Promise<boolean>
  notify: (message: string, kind?: 'success' | 'error') => void
}

const VEHICLE_TYPES = ['Van', 'Mini Truck', 'Tempo', 'Truck', 'Auto Rickshaw', 'Pickup', 'Other']
const SIZES: ('SMALL' | 'MEDIUM' | 'LARGE')[] = ['SMALL', 'MEDIUM', 'LARGE']

export default function VehicleModal({ vehicle, existingVehicles, onClose, onSave, notify }: Props) {
  const isEdit = !!vehicle
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(vehicle?.photoDataUrl ?? null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const choosePhoto = async (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify('Choose a JPG, PNG or WebP photo.', 'error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      notify('Choose a photo smaller than 10 MB.', 'error')
      return
    }
    setPhotoBusy(true)
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Photo could not be processed.')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      let result = canvas.toDataURL('image/jpeg', 0.82)
      if (result.length > 700000) result = canvas.toDataURL('image/jpeg', 0.5)
      if (result.length > 700000) throw new Error('Photo is too large. Choose a smaller photo.')
      setPhotoDataUrl(result)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to read this photo.', 'error')
    } finally {
      URL.revokeObjectURL(url)
      setPhotoBusy(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }

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

  // 4. Driver: read-only. Drivers are linked to vehicles only from Assign Driver.
  const fixedDriverName = vehicle?.driverName?.trim() || ''

  const cleanReg = registrationNumber.trim().toUpperCase()
  const isDuplicateReg = Boolean(
    cleanReg &&
    existingVehicles?.some(
      v => v.registrationNumber.trim().toUpperCase() === cleanReg && v.vehicleId !== vehicle?.vehicleId
    )
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (photoBusy || saving) return
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
      photoDataUrl,
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
      registrationExpiry: vehicle?.registrationExpiry,
      insuranceExpiry: vehicle?.insuranceExpiry,
      pollutionExpiry: vehicle?.pollutionExpiry,
      nextServiceDate: vehicle?.nextServiceDate,
      lastCleaningDate: vehicle?.lastCleaningDate,
      nextCleaningDueDate: vehicle?.nextCleaningDueDate,
      driverId: vehicle?.driverId,
      driverName: vehicle?.driverName,
      status: finalStatus,
      lastMaintenance: vehicle?.lastMaintenance,
      nextMaintenance: vehicle?.nextMaintenance,
    }

    setSaving(true)
    try {
      if (await onSave(payload)) onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide={true}
      title={isEdit ? 'Edit Vehicle' : 'Add Vehicle'}
      subtitle={isEdit ? 'Update specifications and status for this vehicle.' : 'Register a new transport vehicle for food recovery dispatches.'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="dialog-form max-h-[calc(88vh-120px)] overflow-y-auto pr-1 space-y-4">
        <section className="rounded-xl border border-emerald-200 bg-white p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">Vehicle Photo <span className="font-normal text-slate-500">(Optional)</span></h3>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            {photoDataUrl ? <img src={photoDataUrl} alt="Vehicle photo preview" className="h-36 w-52 rounded-lg border border-slate-200 object-contain bg-slate-50" /> : <div className="h-28 w-40 rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-700"><Truck size={36} /></div>}
            <div className="space-y-2">
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose vehicle photo" className="sr-only" onChange={e => void choosePhoto(e.target.files?.[0])} disabled={photoBusy || saving} />
              <div className="flex gap-2">
                <button type="button" className="button button-primary" disabled={photoBusy || saving} onClick={() => photoInput.current?.click()}>{photoBusy ? 'Preparing photo…' : photoDataUrl ? 'Change Photo' : 'Add Photo'}</button>
                {photoDataUrl && <button type="button" className="button" disabled={photoBusy || saving} onClick={() => setPhotoDataUrl(null)}>Remove Photo</button>}
              </div>
              <p className="text-xs text-slate-500">JPG, PNG or WebP, up to 10 MB.</p>
            </div>
          </div>
        </section>
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

        {/* 4. Driver (read-only; managed in Assign Driver) */}
        <div className="rounded-xl border border-emerald-200/80 bg-white hover:border-emerald-300 transition-colors shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
            <div className="flex items-center gap-2">
              <User className="text-emerald-700" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">4. Driver</h3>
            </div>
            <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full">
              Not required
            </span>
          </div>
          <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-lg p-3 text-xs text-emerald-900 flex items-start gap-2.5">
            <Info size={16} className="text-emerald-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {fixedDriverName
                ? `Fixed driver: ${fixedDriverName}. This link was set in Assign Driver and cannot be changed here.`
                : 'Driver not assigned. Save the vehicle first, then link an NGO employee driver from Assign Driver.'}
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
            disabled={photoBusy || saving}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all shadow-md shadow-emerald-700/20 hover:shadow-lg hover:shadow-emerald-700/30 flex items-center gap-2 cursor-pointer border border-emerald-600"
          >
            <CheckCircle size={16} className="text-white" />
            <span>{saving ? 'Saving…' : 'Save Vehicle'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
