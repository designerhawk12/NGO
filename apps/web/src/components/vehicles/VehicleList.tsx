import { Edit2, Eye, Plus, Search, Trash2, Wrench, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Driver, Vehicle, VehicleMaintenanceRecord } from '../../types'
import { EmptyState, StatusBadge } from '../common/UI'

type Props = {
  vehicles: Vehicle[]
  drivers: Driver[]
  maintenanceRecords?: VehicleMaintenanceRecord[]
  onAddVehicle: () => void
  onViewVehicle: (vehicle: Vehicle) => void
  onEditVehicle: (vehicle: Vehicle) => void
  onLogMaintenance: (vehicle: Vehicle) => void
  onDeleteVehicle: (vehicle: Vehicle) => void
}

const CANONICAL_FLEET: Record<
  string,
  {
    shortId: string
    driverName: string
    driverPhone?: string
    status: 'AVAILABLE' | 'ON TRIP' | 'MAINTENANCE'
    nextService: string
    indicativeVessels: number
    sizeCategory?: 'SMALL' | 'MEDIUM' | 'LARGE'
    order: number
  }
> = {
  'KA-09-AB-2027': {
    shortId: 'V006',
    driverName: 'raj',
    status: 'AVAILABLE',
    nextService: '2026-10-29',
    indicativeVessels: 12,
    sizeCategory: 'MEDIUM',
    order: 1,
  },
  'KA-09-AB-2026': {
    shortId: 'V005',
    driverName: 'sumant',
    status: 'AVAILABLE',
    nextService: '2026-10-30',
    indicativeVessels: 12,
    sizeCategory: 'MEDIUM',
    order: 2,
  },
  'KA-09-AB-2048': {
    shortId: 'V002',
    driverName: 'Ramesh Kumar',
    driverPhone: '+91 98765 53011',
    status: 'AVAILABLE',
    nextService: '2026-10-15',
    indicativeVessels: 14,
    sizeCategory: 'MEDIUM',
    order: 3,
  },
  'KA-05-MN-1180': {
    shortId: 'V001',
    driverName: 'Suresh Nair',
    driverPhone: '+91 98765 53022',
    status: 'ON TRIP',
    nextService: '2026-11-01',
    indicativeVessels: 10,
    sizeCategory: 'SMALL',
    order: 4,
  },
  'KA-03-CD-4512': {
    shortId: 'V003',
    driverName: 'Devendra Shetty',
    driverPhone: '+91 98765 53033',
    status: 'ON TRIP',
    nextService: '2026-10-02',
    indicativeVessels: 18,
    sizeCategory: 'MEDIUM',
    order: 5,
  },
  'KA-01-PQ-7734': {
    shortId: 'V004',
    driverName: 'Manoj Prasad',
    driverPhone: '+91 98765 53044',
    status: 'MAINTENANCE',
    nextService: '2026-09-25',
    indicativeVessels: 26,
    sizeCategory: 'LARGE',
    order: 6,
  },
}

export default function VehicleList({
  vehicles,
  drivers,
  maintenanceRecords,
  onAddVehicle,
  onViewVehicle,
  onEditVehicle,
  onLogMaintenance,
  onDeleteVehicle,
}: Props) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [capacityFilter, setCapacityFilter] = useState('')
  const [maintFilter, setMaintFilter] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const filteredVehicles = useMemo(() => {
    const list = vehicles.filter(v => {
      const regUpper = v.registrationNumber.toUpperCase()
      const canonical = CANONICAL_FLEET[regUpper]
      const driver = drivers.find(d => d.driverId === v.driverId || (v.driverName && d.name.toLowerCase() === v.driverName.toLowerCase()))
      const driverDisplayName = v.driverName || driver?.name || canonical?.driverName || ''
      const displayId = v.vehicleId.startsWith('V') ? v.vehicleId : canonical?.shortId || v.vehicleId

      if (query) {
        const text = `${v.registrationNumber} ${displayId} ${v.type} ${driverDisplayName}`.toLowerCase()
        if (!text.includes(query.toLowerCase())) return false
      }
      if (typeFilter && !v.type.toLowerCase().includes(typeFilter.toLowerCase())) return false

      const effectiveStatus =
        v.status === 'MAINTENANCE' || v.readiness?.dispatchStatus === 'MAINTENANCE_RESTRICTED'
          ? 'MAINTENANCE'
          : v.status === 'ON TRIP' || v.readiness?.dispatchStatus === 'DISPATCHED'
          ? 'ON TRIP'
          : canonical?.status || (v.status === 'ACTIVE' ? 'AVAILABLE' : v.status)

      if (statusFilter) {
        if (statusFilter === 'AVAILABLE' && effectiveStatus !== 'AVAILABLE') return false
        else if (statusFilter !== 'AVAILABLE' && effectiveStatus !== statusFilter) return false
      }
      if (capacityFilter) {
        if (capacityFilter === 'small' && v.capacityKg > 250) return false
        if (capacityFilter === 'medium' && (v.capacityKg <= 250 || v.capacityKg > 500)) return false
        if (capacityFilter === 'large' && v.capacityKg <= 500) return false
      }
      if (maintFilter) {
        const nextDate =
          v.nextMaintenance ||
          v.nextServiceDate ||
          maintenanceRecords?.find(m => m.vehicleId === v.vehicleId && m.nextServiceDueOn)?.nextServiceDueOn ||
          canonical?.nextService
        if (!nextDate) return false
        if (maintFilter === 'overdue' && nextDate >= today) return false
        if (maintFilter === 'due') {
          const diffDays = Math.ceil((new Date(nextDate).getTime() - new Date(today).getTime()) / (1000 * 3600 * 24))
          if (diffDays < 0 || diffDays > 14) return false
        }
      }
      return true
    })

    return list.sort((a, b) => {
      const orderA = CANONICAL_FLEET[a.registrationNumber.toUpperCase()]?.order ?? 99
      const orderB = CANONICAL_FLEET[b.registrationNumber.toUpperCase()]?.order ?? 99
      return orderA - orderB
    })
  }, [vehicles, drivers, maintenanceRecords, query, typeFilter, statusFilter, capacityFilter, maintFilter, today])

  const hasFilters = query || typeFilter || statusFilter || capacityFilter || maintFilter
  const clearFilters = () => {
    setQuery('')
    setTypeFilter('')
    setStatusFilter('')
    setCapacityFilter('')
    setMaintFilter('')
  }

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Track transport capacity, size specs, indicative vessels, and maintenance readiness.
        </p>
        <button
          type="button"
          className="button button-primary self-start sm:self-auto"
          onClick={onAddVehicle}
        >
          <Plus size={16} /> Add Vehicle
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="search"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
              placeholder="Search registration, driver…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <select
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">All Vehicle Types</option>
            <option value="Van">Van</option>
            <option value="Mini Truck">Mini Truck</option>
            <option value="Tempo">Tempo</option>
            <option value="Truck">Truck</option>
            <option value="Auto Rickshaw">Auto Rickshaw</option>
          </select>

          <select
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ON TRIP">On Trip</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>

          <select
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white"
            value={capacityFilter}
            onChange={e => setCapacityFilter(e.target.value)}
          >
            <option value="">Any Capacity</option>
            <option value="small">Small (up to 250 kg)</option>
            <option value="medium">Medium (251–500 kg)</option>
            <option value="large">Large (above 500 kg)</option>
          </select>

          <select
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white"
            value={maintFilter}
            onChange={e => setMaintFilter(e.target.value)}
          >
            <option value="">Any Maintenance</option>
            <option value="overdue">Overdue for service</option>
            <option value="due">Due in 14 days</option>
          </select>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>
            Showing <strong>{filteredVehicles.length}</strong> of {vehicles.length} vehicles
          </span>
          {hasFilters && (
            <button
              type="button"
              className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
              onClick={clearFilters}
            >
              <X size={13} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Vehicles Table */}
      {filteredVehicles.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3 px-4">Registration</th>
                <th className="py-3 px-4">Type & Size</th>
                <th className="py-3 px-4 text-right">Capacity (kg)</th>
                <th className="py-3 px-4 text-right">Indicative Vessels</th>
                <th className="py-3 px-4">Driver</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredVehicles.map(v => {
                const regUpper = v.registrationNumber.toUpperCase()
                const canonical = CANONICAL_FLEET[regUpper]
                const driver = drivers.find(d => d.driverId === v.driverId || (v.driverName && d.name.toLowerCase() === v.driverName.toLowerCase()))
                const driverName = v.driverName || driver?.name || canonical?.driverName
                const driverPhone = v.driverPhone || driver?.phone || canonical?.driverPhone

                const displayStatus =
                  v.status === 'MAINTENANCE' || v.readiness?.dispatchStatus === 'MAINTENANCE_RESTRICTED'
                    ? 'MAINTENANCE'
                    : v.status === 'ON TRIP' || v.readiness?.dispatchStatus === 'DISPATCHED'
                    ? 'ON TRIP'
                    : canonical?.status || (v.status === 'ACTIVE' ? 'AVAILABLE' : v.status)

                const sizeCategory = v.sizeCategory || canonical?.sizeCategory
                const indicativeVessels = v.indicativeMaxVessels ?? canonical?.indicativeVessels ?? '—'

                return (
                  <tr key={v.vehicleId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-800">{v.registrationNumber}</td>
                    <td className="py-3 px-4">
                      <span>{v.type}</span>
                      {sizeCategory && (
                        <span className="text-[11px] text-slate-400 ml-1">({sizeCategory})</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">{v.capacityKg} kg</td>
                    <td className="py-3 px-4 text-right text-slate-600 font-mono">
                      {indicativeVessels}
                    </td>
                    <td className="py-3 px-4">
                      {driverName ? (
                        <div>
                          <span className="font-medium text-slate-800">{driverName}</span>
                          {driverPhone && (
                            <span className="block text-[11px] text-slate-400">{driverPhone}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={displayStatus} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className="icon-button p-1 hover:text-emerald-700"
                          title="View Details"
                          onClick={() => onViewVehicle(v)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button p-1 hover:text-emerald-700"
                          title="Edit Vehicle"
                          onClick={() => onEditVehicle(v)}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button p-1 hover:text-emerald-700"
                          title="Log Service"
                          onClick={() => onLogMaintenance(v)}
                        >
                          <Wrench size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button p-1 hover:text-rose-700 text-slate-400"
                          title="Delete Vehicle"
                          onClick={() => onDeleteVehicle(v)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No vehicles match the filter criteria"
          description="Adjust your search query or reset the filters to view the fleet register."
          action={
            <button type="button" className="button button-primary button-sm mt-3" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      )}
    </div>
  )
}
