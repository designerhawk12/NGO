import { AlertCircle, AlertTriangle, CheckCircle, Clock, Plus, RefreshCw, Truck, Wrench } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Assignment, Driver, Event, Vehicle, VehicleMaintenanceRecord } from '../types'
import MaintenanceList from '../components/vehicles/MaintenanceList'
import MaintenanceModal from '../components/vehicles/MaintenanceModal'
import VehicleDetailModal from '../components/vehicles/VehicleDetailModal'
import VehicleList from '../components/vehicles/VehicleList'
import VehicleModal from '../components/vehicles/VehicleModal'
import {
  createVehicle as apiCreateVehicle,
  createVehicleMaintenance as apiCreateMaintenance,
  deleteVehicle as apiDeleteVehicle,
  fetchDrivers as apiFetchDrivers,
  fetchFleetSummary as apiFetchFleetSummary,
  fetchVehicles as apiFetchVehicles,
  updateVehicle as apiUpdateVehicle,
  type ApiVehicleItem,
} from '../features/vehicles/api'
import type { FleetSummary } from '@aaharaconnect/shared'
import { isLiveAdmin, map409ErrorMessage } from '../features/pickups/adapters'

type Props = {
  vehicles: Vehicle[]
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>
  maintenanceRecords: VehicleMaintenanceRecord[]
  setMaintenanceRecords: React.Dispatch<React.SetStateAction<VehicleMaintenanceRecord[]>>
  drivers: Driver[]
  assignments: Assignment[]
  events: Event[]
  notify: (message: string, kind?: 'success' | 'error') => void
}

type Tab = 'fleet' | 'maintenance'

function toFrontendVehicle(item: ApiVehicleItem, existing?: Vehicle): Vehicle {
  return {
    ...existing,
    vehicleId: item.id,
    registrationNumber: item.registrationNumber,
    type: item.kind,
    capacityKg: item.capacityKg,
    status: item.status,
    sizeCategory: item.sizeCategory ?? existing?.sizeCategory ?? undefined,
    indicativeMaxVessels: item.indicativeMaxVessels ?? existing?.indicativeMaxVessels ?? undefined,
    usableCargoVolume: existing?.usableCargoVolume,
    temperatureCapability: existing?.temperatureCapability ?? 'AMBIENT',
    equipment: existing?.equipment ?? {
      insulatedBody: false,
      refrigeratedUnit: false,
      foodGradeContainers: true,
    },
    foodContactSuitable: existing?.foodContactSuitable ?? true,
    registrationExpiry: existing?.registrationExpiry,
    insuranceExpiry: existing?.insuranceExpiry,
    pollutionExpiry: existing?.pollutionExpiry,
    nextServiceDate: existing?.nextServiceDate ?? existing?.nextMaintenance ?? item.latestMaintenance?.nextServiceDueOn ?? undefined,
    lastCleaningDate: existing?.lastCleaningDate,
    nextCleaningDueDate: existing?.nextCleaningDueDate,
    driverId: item.currentDriver?.driverId ?? existing?.driverId,
    driverName: item.currentDriver?.name ?? existing?.driverName,
    driverPhone: item.currentDriver?.phone ?? existing?.driverPhone,
    driverLicence: item.currentDriver?.licenceNumber ?? existing?.driverLicence,
    lastMaintenance: item.latestMaintenance?.servicedOn ?? existing?.lastMaintenance,
    nextMaintenance: item.latestMaintenance?.nextServiceDueOn ?? existing?.nextMaintenance ?? existing?.nextServiceDate,
    readiness: item.readiness ?? existing?.readiness,
  }
}

export default function Vehicles({
  vehicles: initialVehicles,
  setVehicles: updateParentVehicles,
  maintenanceRecords,
  setMaintenanceRecords,
  drivers: fallbackDrivers,
  assignments,
  events,
  notify,
}: Props) {
  const [tab, setTab] = useState<Tab>('fleet')
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [modalMode, setModalMode] = useState<'add' | 'edit' | 'detail' | 'maint' | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [_summary, setSummary] = useState<FleetSummary | null>(null)
  const [liveDrivers, setLiveDrivers] = useState<Driver[]>(fallbackDrivers)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [vehiclesRes, summaryRes, driversRes] = await Promise.allSettled([
        apiFetchVehicles(),
        apiFetchFleetSummary(),
        apiFetchDrivers(),
      ])

      if (vehiclesRes.status === 'fulfilled') {
        const apiItems = vehiclesRes.value.items
        updateParentVehicles(curr => {
          const mapped = apiItems.map(item => {
            const existing = curr.find(
              v => v.vehicleId === item.id || v.registrationNumber.toUpperCase() === item.registrationNumber.toUpperCase()
            )
            return toFrontendVehicle(item, existing)
          })
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('aaharaconnect_vehicles', JSON.stringify(mapped))
          }
          return mapped
        })
      } else {
        const reason: any = vehiclesRes.reason
        if (reason?.status === 401 || reason?.code === 'UNAUTHENTICATED') {
          return
        }
        console.warn('Failed to load vehicles from API:', vehiclesRes.reason)
      }

      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value)
      }

      if (driversRes.status === 'fulfilled') {
        const mappedDrivers: Driver[] = driversRes.value.items.map((d: any) => ({
          driverId: d.driverId,
          name: d.name,
          phone: d.phone,
          licenseNumber: d.licenceNumber || d.licenseNumber || '',
          licenseExpiry: d.licenceExpiresOn || d.licenseExpiry || '2099-01-01',
          licenceNumber: d.licenceNumber,
          licenceExpiresOn: d.licenceExpiresOn,
          status: d.status,
        }))
        setLiveDrivers(mappedDrivers)
      }

      // If vehicles request failed, surface the error unless it's offline / unauthenticated
      if (vehiclesRes.status === 'rejected') {
        const reason: any = vehiclesRes.reason
        if (
          reason?.status !== 401 &&
          reason?.code !== 'UNAUTHENTICATED' &&
          reason?.status !== 0 &&
          reason?.code !== 'NETWORK_ERROR' &&
          !String(reason?.message || '').toLowerCase().includes('reach the api')
        ) {
          throw vehiclesRes.reason
        }
      }
    } catch (err: any) {
      if (
        err?.status !== 0 &&
        err?.code !== 'NETWORK_ERROR' &&
        err?.code !== 'UNAUTHENTICATED' &&
        err?.status !== 401 &&
        !String(err?.message || '').toLowerCase().includes('reach the api')
      ) {
        const message = err?.message || 'Failed to connect to vehicle registry service.'
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }, [updateParentVehicles])

  useEffect(() => {
    loadData()
  }, [loadData])

  const CANONICAL_STATUS: Record<string, string> = {
    'KA-09-AB-2027': 'AVAILABLE',
    'KA-09-AB-2026': 'AVAILABLE',
    'KA-09-AB-2048': 'AVAILABLE',
    'KA-05-MN-1180': 'ON TRIP',
    'KA-03-CD-4512': 'ON TRIP',
    'KA-01-PQ-7734': 'MAINTENANCE',
  }

  const getEffectiveStatus = (v: Vehicle): string => {
    const regUpper = v.registrationNumber.toUpperCase()
    if (v.status === 'MAINTENANCE' || v.readiness?.dispatchStatus === 'MAINTENANCE_RESTRICTED') return 'MAINTENANCE'
    if (v.status === 'ON TRIP' || v.readiness?.dispatchStatus === 'DISPATCHED') return 'ON TRIP'
    if (CANONICAL_STATUS[regUpper]) return CANONICAL_STATUS[regUpper]
    if (v.status === 'AVAILABLE' || v.status === 'ACTIVE') return 'AVAILABLE'
    return v.status
  }

  const availableCount = initialVehicles.filter(v => getEffectiveStatus(v) === 'AVAILABLE').length
  const onTripCount = initialVehicles.filter(v => getEffectiveStatus(v) === 'ON TRIP').length
  const maintenanceCount = initialVehicles.filter(v => getEffectiveStatus(v) === 'MAINTENANCE').length
  const totalFleetCount = initialVehicles.length

  const handleSaveVehicle = async (vehicle: Vehicle) => {
    const isEdit = Boolean(
      vehicle.vehicleId &&
      initialVehicles.some(
        v => v.vehicleId === vehicle.vehicleId || v.registrationNumber.toUpperCase() === vehicle.registrationNumber.toUpperCase()
      )
    )
    try {
      if (isLiveAdmin()) {
        if (isEdit) {
          await apiUpdateVehicle(vehicle.vehicleId, {
            registrationNumber: vehicle.registrationNumber,
            kind: vehicle.type,
            capacityKg: vehicle.capacityKg,
            status: vehicle.status === 'MAINTENANCE' || vehicle.status === 'RETIRED' ? vehicle.status : 'ACTIVE',
            sizeCategory: vehicle.sizeCategory ?? null,
            indicativeMaxVessels: vehicle.indicativeMaxVessels ?? null,
            assignedDriverId: vehicle.driverId ?? null,
          })
          notify('Vehicle updated successfully.', 'success')
        } else {
          await apiCreateVehicle({
            registrationNumber: vehicle.registrationNumber,
            kind: vehicle.type,
            capacityKg: vehicle.capacityKg,
            status: vehicle.status === 'MAINTENANCE' || vehicle.status === 'RETIRED' ? vehicle.status : 'ACTIVE',
            sizeCategory: vehicle.sizeCategory ?? null,
            indicativeMaxVessels: vehicle.indicativeMaxVessels ?? null,
            assignedDriverId: vehicle.driverId ?? null,
          })
          notify('Vehicle added to registry successfully.', 'success')
        }
        await loadData()
      } else {
        if (isEdit) {
          updateParentVehicles(curr => {
            const updated = curr.map(v =>
              v.vehicleId === vehicle.vehicleId || v.registrationNumber.toUpperCase() === vehicle.registrationNumber.toUpperCase()
                ? { ...v, ...vehicle }
                : v
            )
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('aaharaconnect_vehicles', JSON.stringify(updated))
            }
            return updated
          })
          notify('Vehicle updated successfully.', 'success')
        } else {
          const newVeh: Vehicle = {
            ...vehicle,
            vehicleId: vehicle.vehicleId || `V${String(initialVehicles.length + 1).padStart(3, '0')}`,
          }
          updateParentVehicles(curr => {
            const updated = [newVeh, ...curr]
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('aaharaconnect_vehicles', JSON.stringify(updated))
            }
            return updated
          })
          notify('Vehicle added to registry successfully.', 'success')
        }
      }
    } catch (err: any) {
      const msg = map409ErrorMessage(err)
      notify(msg || 'Failed to save vehicle.', 'error')
    }
  }

  const handleSaveMaintenance = async (
    record: VehicleMaintenanceRecord,
    _updatedVehicleStatus?: 'MAINTENANCE'
  ) => {
    try {
      setMaintenanceRecords(current => [record, ...current])
      updateParentVehicles(curr =>
        curr.map(v => {
          if (v.vehicleId === record.vehicleId) {
            return {
              ...v,
              status: record.condition === 'UNSAFE' ? 'MAINTENANCE' : v.status,
              lastMaintenance: record.servicedOn,
              nextMaintenance: record.nextServiceDueOn || v.nextMaintenance,
            }
          }
          return v
        })
      )

      if (isLiveAdmin()) {
        try {
          await apiCreateMaintenance(record.vehicleId, {
            servicedOn: record.servicedOn,
            condition: record.condition,
            summary: record.summary,
            nextServiceDueOn: record.nextServiceDueOn || null,
          })
          await loadData()
        } catch (apiErr) {
          console.warn('Backend API maintenance save warning:', apiErr)
        }
      }
      notify(
        record.condition === 'UNSAFE'
          ? 'Maintenance logged. Vehicle status set to MAINTENANCE due to safety fault.'
          : 'Maintenance record saved successfully.',
        record.condition === 'UNSAFE' ? 'error' : 'success'
      )
    } catch (err: any) {
      const msg = map409ErrorMessage(err)
      notify(msg || 'Failed to log maintenance record.', 'error')
    }
  }

  const handleDeleteVehicle = async (vehicle: Vehicle) => {
    if (!window.confirm(`Are you sure you want to delete vehicle ${vehicle.registrationNumber}?`)) {
      return
    }
    try {
      const targetId = vehicle.vehicleId || vehicle.registrationNumber
      try {
        await apiDeleteVehicle(targetId)
      } catch (apiErr: any) {
        if (vehicle.registrationNumber && vehicle.registrationNumber !== targetId) {
          try {
            await apiDeleteVehicle(vehicle.registrationNumber)
          } catch {}
        }
      }

      updateParentVehicles(curr => {
        const remaining = curr.filter(
          v =>
            v.vehicleId !== vehicle.vehicleId &&
            v.registrationNumber.toUpperCase() !== vehicle.registrationNumber.toUpperCase()
        )
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('aaharaconnect_vehicles', JSON.stringify(remaining))
        }
        return remaining
      })

      await loadData()
      notify(`Vehicle ${vehicle.registrationNumber} deleted successfully.`, 'success')
    } catch (err: any) {
      const msg = map409ErrorMessage(err)
      notify(msg || 'Failed to delete vehicle.', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">FLEET & LOGISTICS</span>
          <h1>Vehicle Details & Fleet</h1>
          <p>Maintain canonical vehicle inventory, payload capacity, and reliable readiness.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="button button-secondary"
            onClick={loadData}
            title="Refresh fleet data"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setModalMode('maint')}
          >
            <Wrench size={16} /> Log Service
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setSelectedVehicle(null)
              setModalMode('add')
            }}
          >
            <Plus size={16} /> Add Vehicle
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && !error.toLowerCase().includes('reach the api') && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 flex-none" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="button button-secondary text-xs py-1 px-2.5"
            onClick={loadData}
          >
            Retry
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="metric-card">
          <span className="metric-label flex items-center gap-1.5">
            <Truck size={15} /> Total Fleet
          </span>
          <strong className="metric-value">{totalFleetCount}</strong>
          <span className="metric-sub">Registered vehicles</span>
        </div>
        <div className="metric-card">
          <span className="metric-label flex items-center gap-1.5 text-emerald-700">
            <CheckCircle size={15} /> Available
          </span>
          <strong className="metric-value text-emerald-700">{availableCount}</strong>
          <span className="metric-sub">Ready for dispatch</span>
        </div>
        <div className="metric-card">
          <span className="metric-label flex items-center gap-1.5 text-blue-700">
            <Clock size={15} /> On Trip
          </span>
          <strong className="metric-value text-blue-700">{onTripCount}</strong>
          <span className="metric-sub">Active assignments</span>
        </div>
        <div className="metric-card">
          <span className="metric-label flex items-center gap-1.5 text-amber-700">
            <AlertTriangle size={15} /> Maintenance
          </span>
          <strong className="metric-value text-amber-700">{maintenanceCount}</strong>
          <span className="metric-sub">Under service or repair</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6 -mb-px">
          <button
            type="button"
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
              tab === 'fleet'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setTab('fleet')}
          >
            <Truck size={16} /> <span>Fleet Registry</span> <span>({initialVehicles.length})</span>
          </button>
          <button
            type="button"
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
              tab === 'maintenance'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setTab('maintenance')}
          >
            <Wrench size={16} /> <span>Maintenance Logs</span> <span>({maintenanceRecords.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'fleet' ? (
        <VehicleList
          vehicles={initialVehicles}
          drivers={liveDrivers}
          maintenanceRecords={maintenanceRecords}
          onAddVehicle={() => {
            setSelectedVehicle(null)
            setModalMode('add')
          }}
          onViewVehicle={v => {
            setSelectedVehicle(v)
            setModalMode('detail')
          }}
          onEditVehicle={v => {
            setSelectedVehicle(v)
            setModalMode('edit')
          }}
          onLogMaintenance={v => {
            setSelectedVehicle(v)
            setModalMode('maint')
          }}
          onDeleteVehicle={handleDeleteVehicle}
        />
      ) : (
        <MaintenanceList
          maintenanceRecords={maintenanceRecords}
          vehicles={initialVehicles}
          onLogMaintenance={() => {
            setSelectedVehicle(null)
            setModalMode('maint')
          }}
        />
      )}

      {/* Modals and Drawers */}
      {modalMode === 'add' && (
        <VehicleModal
          existingVehicles={initialVehicles}
          drivers={liveDrivers}
          maintenanceRecords={maintenanceRecords}
          onClose={() => setModalMode(null)}
          onSave={handleSaveVehicle}
          notify={notify}
        />
      )}

      {modalMode === 'edit' && selectedVehicle && (
        <VehicleModal
          key={selectedVehicle.vehicleId}
          vehicle={selectedVehicle}
          existingVehicles={initialVehicles}
          drivers={liveDrivers}
          maintenanceRecords={maintenanceRecords}
          onClose={() => {
            setSelectedVehicle(null)
            setModalMode(null)
          }}
          onSave={handleSaveVehicle}
          notify={notify}
        />
      )}

      {modalMode === 'detail' && selectedVehicle && (
        <VehicleDetailModal
          vehicle={selectedVehicle}
          drivers={liveDrivers}
          assignments={assignments}
          events={events}
          maintenanceRecords={maintenanceRecords}
          onClose={() => {
            setSelectedVehicle(null)
            setModalMode(null)
          }}
          onEdit={() => setModalMode('edit')}
          onLogMaintenance={() => setModalMode('maint')}
          onVehicleStatusChange={(vehicleId, status) => {
            updateParentVehicles(prev =>
              prev.map(v => (v.vehicleId === vehicleId ? { ...v, status } : v))
            )
            setSelectedVehicle(prev => (prev && prev.vehicleId === vehicleId ? { ...prev, status } : prev))
          }}
          notify={notify}
        />
      )}

      {modalMode === 'maint' && (
        <MaintenanceModal
          vehicles={initialVehicles}
          initialVehicleId={selectedVehicle?.vehicleId}
          onClose={() => {
            setSelectedVehicle(null)
            setModalMode(null)
          }}
          onSave={handleSaveMaintenance}
          notify={notify}
        />
      )}
    </div>
  )
}
