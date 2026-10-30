import {
  AlertCircle,
  AlertTriangle,
  Box,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Droplets,
  Edit2,
  FileText,
  HelpCircle,
  Info,
  Loader2,
  LogIn,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  X,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CreateVessel,
  CreateVesselLog,
  ReturnVessel,
  UpdateVessel,
  VesselCleaningStatus,
  VesselItem,
  VesselLogItem,
  VesselStatus,
  VesselsSummary,
} from '@aaharaconnect/shared'
import type { Vehicle } from '../types'
import { fetchVehicles as apiFetchVehicles } from '../features/vehicles/api'
import { vehicles as mockVehiclesList } from '../data/mockData'
import {
  apiAddVesselLog,
  apiCreateVessel,
  apiDeleteVessel,
  apiFetchVesselLogs,
  apiFetchVessels,
  apiFetchVesselsSummary,
  apiIssueVessel,
  apiReturnVessel,
  apiUpdateVessel,
} from '../features/vessels/api'

const initialVessels: VesselItem[] = [
  {
    id: '4c597e69-6be5-4d29-97fc-a946fa8a5101',
    vesselCode: 'VSL-HB-001',
    name: 'ThermoSafe Hot Box 40L',
    vesselType: 'HOT_BOX',
    material: 'STAINLESS_STEEL',
    capacityValue: 40.0,
    capacityUnit: 'LITRES',
    foodGradeCertified: true,
    temperatureSuitability: 'HOT',
    hasInsulation: true,
    hasTightLid: true,
    status: 'AVAILABLE',
    cleaningStatus: 'CLEAN',
    lastCleanedAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    nextCleaningDue: new Date(Date.now() + 3600 * 1000 * 36).toISOString(),
    lastInspectedAt: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
    inspectionResult: 'PASSED',
    maintenanceCondition: 'GOOD',
    storageLocation: 'Main Central Hub - Bay 1',
    notes: 'High-grade thermal insulation for cooked meal transports.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '4c597e69-6be5-4d29-97fc-a946fa8a5102',
    vesselCode: 'VSL-IB-002',
    name: 'Insulated Thermal Bag 25L',
    vesselType: 'INSULATED_BAG',
    material: 'INSULATED_POLYMER',
    capacityValue: 25.0,
    capacityUnit: 'LITRES',
    foodGradeCertified: true,
    temperatureSuitability: 'MULTI_TEMP',
    hasInsulation: true,
    hasTightLid: true,
    status: 'AVAILABLE',
    cleaningStatus: 'CLEAN',
    lastCleanedAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
    nextCleaningDue: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
    lastInspectedAt: new Date(Date.now() - 3600 * 1000 * 72).toISOString(),
    inspectionResult: 'PASSED',
    maintenanceCondition: 'GOOD',
    storageLocation: 'South Distribution Depot',
    notes: 'Lightweight shoulder-strap insulated bag for rapid volunteer pickups.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '4c597e69-6be5-4d29-97fc-a946fa8a5103',
    vesselCode: 'VSL-MC-003',
    name: 'Dairy Milk Can 30L',
    vesselType: 'MILK_CAN',
    material: 'STAINLESS_STEEL',
    capacityValue: 30.0,
    capacityUnit: 'LITRES',
    foodGradeCertified: true,
    temperatureSuitability: 'CHILLED',
    hasInsulation: false,
    hasTightLid: true,
    status: 'CLEANING_REQUIRED',
    cleaningStatus: 'DIRTY',
    lastCleanedAt: new Date(Date.now() - 3600 * 1000 * 30).toISOString(),
    nextCleaningDue: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
    lastInspectedAt: new Date(Date.now() - 3600 * 1000 * 90).toISOString(),
    inspectionResult: 'ACTION_REQUIRED',
    maintenanceCondition: 'GOOD',
    storageLocation: 'Sanitization & Wash Bay 2',
    notes: 'Returned from dairy surplus pickup. Awaiting sanitization wash before reuse.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '4c597e69-6be5-4d29-97fc-a946fa8a5104',
    vesselCode: 'VSL-CB-004',
    name: 'Arctic Cold Storage Box 50L',
    vesselType: 'COLD_BOX',
    material: 'INSULATED_POLYMER',
    capacityValue: 50.0,
    capacityUnit: 'LITRES',
    foodGradeCertified: true,
    temperatureSuitability: 'FROZEN',
    hasInsulation: true,
    hasTightLid: true,
    status: 'AVAILABLE',
    cleaningStatus: 'CLEAN',
    lastCleanedAt: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
    nextCleaningDue: new Date(Date.now() + 3600 * 1000 * 48).toISOString(),
    lastInspectedAt: new Date(Date.now() - 3600 * 1000 * 50).toISOString(),
    inspectionResult: 'PASSED',
    maintenanceCondition: 'GOOD',
    storageLocation: 'Cold Chain Bay A',
    notes: 'Dedicated for frozen desserts and ice cream excess rescue.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '4c597e69-6be5-4d29-97fc-a946fa8a5105',
    vesselCode: 'VSL-CR-005',
    name: 'Ventilated Produce Crate 30kg',
    vesselType: 'CRATE',
    material: 'FOOD_GRADE_PLASTIC',
    capacityValue: 30.0,
    capacityUnit: 'KG',
    foodGradeCertified: true,
    temperatureSuitability: 'AMBIENT',
    hasInsulation: false,
    hasTightLid: false,
    status: 'MAINTENANCE',
    cleaningStatus: 'CLEAN',
    lastCleanedAt: new Date(Date.now() - 3600 * 1000 * 40).toISOString(),
    nextCleaningDue: new Date(Date.now() + 3600 * 1000 * 72).toISOString(),
    lastInspectedAt: new Date(Date.now() - 3600 * 1000 * 10).toISOString(),
    inspectionResult: 'ACTION_REQUIRED',
    maintenanceCondition: 'NEEDS_REPAIR',
    storageLocation: 'Workshop Bay 3',
    notes: 'Side handle cracked during unloading. Needs replacement before redeployment.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

type Props = {
  vehicles?: Vehicle[]
  notify?: (message: string, kind?: 'success' | 'error') => void
}

export default function Vessels({ vehicles: vehiclesProp, notify }: Props) {
  const [vessels, setVessels] = useState<VesselItem[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('aaharaconnect_vessels')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        } catch {}
      }
    }
    return initialVessels
  })
  const [summary, setSummary] = useState<VesselsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fleet vehicles from Vehicle Details
  const [registeredVehicles, setRegisteredVehicles] = useState<Vehicle[]>(() => {
    if (vehiclesProp && vehiclesProp.length > 0) return vehiclesProp
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('aaharaconnect_vehicles')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        } catch {}
      }
    }
    return mockVehiclesList
  })

  useEffect(() => {
    if (vehiclesProp && vehiclesProp.length > 0) {
      setRegisteredVehicles(vehiclesProp)
    }
  }, [vehiclesProp])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('aaharaconnect_vessels', JSON.stringify(vessels))
    }
  }, [vessels])

  // Filters & Search
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cleaningFilter, setCleaningFilter] = useState('')

  // Modals & Drawers
  const [selectedVessel, setSelectedVessel] = useState<VesselItem | null>(null)
  const [modalMode, setModalMode] = useState<'add' | 'edit' | 'detail' | 'issue' | 'return' | 'log' | null>(null)
  const [vesselLogs, setVesselLogs] = useState<VesselLogItem[]>([])
  const [showGuide, setShowGuide] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form states
  const [formData, setFormData] = useState<Partial<CreateVessel>>({
    vesselCode: '',
    name: '',
    vesselType: 'HOT_BOX',
    material: 'STAINLESS_STEEL',
    capacityValue: 25,
    capacityUnit: 'LITRES',
    foodGradeCertified: true,
    temperatureSuitability: 'HOT',
    hasInsulation: true,
    hasTightLid: true,
    status: 'AVAILABLE',
    cleaningStatus: 'CLEAN',
    maintenanceCondition: 'GOOD',
    storageLocation: 'Main Central Warehouse',
    notes: '',
  })

  // Issue Form state: Registration Number from Vehicle Details
  const [issueData, setIssueData] = useState({
    registrationNumber: '',
    issuedNotes: '',
  })
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('')
  const [isVehicleDropdownOpen, setIsVehicleDropdownOpen] = useState(false)
  const vehicleComboboxRef = useRef<HTMLDivElement>(null)

  // Filtered fleet vehicles based on search query (reg number, vehicle type, driver name, capacity)
  const filteredVehicles = useMemo(() => {
    const q = vehicleSearchQuery.trim().toLowerCase()
    if (!q) return registeredVehicles
    return registeredVehicles.filter(veh => {
      const matchReg = veh.registrationNumber.toLowerCase().includes(q)
      const matchType = (veh.type || '').toLowerCase().includes(q)
      const matchDriver = (veh.driverName || '').toLowerCase().includes(q)
      const matchCap = `${veh.capacityKg}`.includes(q)
      return matchReg || matchType || matchDriver || matchCap
    })
  }, [registeredVehicles, vehicleSearchQuery])

  // Click outside listener for searchable combobox
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (vehicleComboboxRef.current && !vehicleComboboxRef.current.contains(e.target as Node)) {
        setIsVehicleDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Match selected vehicle from Vehicle Details
  const matchedVehicle = useMemo(() => {
    const reg = issueData.registrationNumber?.trim().toLowerCase()
    if (!reg) return null
    return registeredVehicles.find(v => v.registrationNumber.trim().toLowerCase() === reg) || null
  }, [issueData.registrationNumber, registeredVehicles])

  // Return Form state
  const [returnData, setReturnData] = useState<ReturnVessel>({
    returnedCondition: 'GOOD',
    returnCleanliness: 'DIRTY',
    returnNotes: '',
    immediateClean: false,
  })

  // Log Form state
  const [logData, setLogData] = useState<CreateVesselLog>({
    logType: 'CLEANING',
    resultStatus: 'PASSED',
    summary: '',
    details: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [listRes, summaryRes, fleetRes] = await Promise.allSettled([
        apiFetchVessels(),
        apiFetchVesselsSummary(),
        apiFetchVehicles(),
      ])

      if (listRes.status === 'fulfilled') {
        setVessels(listRes.value.items || [])
      } else {
        const reason: any = listRes.reason
        if (
          reason?.status === 401 ||
          reason?.code === 'UNAUTHENTICATED' ||
          reason?.status === 0 ||
          reason?.code === 'NETWORK_ERROR' ||
          reason?.code === 'MISSING_API_URL' ||
          String(reason?.message || '').toLowerCase().includes('reach the api')
        ) {
          // Graceful fallback to local storage / seeded vessels - do not show error banner
          return
        }
        setError(reason?.message || 'Failed to connect to vessels API.')
      }

      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value)
      }

      if (fleetRes.status === 'fulfilled' && fleetRes.value.items && fleetRes.value.items.length > 0) {
        const mappedFleet: Vehicle[] = fleetRes.value.items.map(item => ({
          vehicleId: item.id,
          registrationNumber: item.registrationNumber,
          type: item.kind,
          capacityKg: item.capacityKg,
          status: item.status,
          sizeCategory: item.sizeCategory ?? undefined,
          indicativeMaxVessels: item.indicativeMaxVessels ?? undefined,
          driverName: item.currentDriver?.name,
          driverLicence: item.currentDriver?.licenceNumber,
          readiness: item.readiness,
        }))
        setRegisteredVehicles(mappedFleet)
      }
    } catch (err: any) {
      if (
        err?.status !== 0 &&
        err?.code !== 'NETWORK_ERROR' &&
        err?.code !== 'UNAUTHENTICATED' &&
        err?.status !== 401 &&
        !String(err?.message || '').toLowerCase().includes('reach the api')
      ) {
        setError(err?.message || 'Failed to load vessels.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Load logs when inspecting a vessel
  useEffect(() => {
    if (selectedVessel && (modalMode === 'detail' || modalMode === 'log')) {
      apiFetchVesselLogs(selectedVessel.id)
        .then(res => setVesselLogs(res.items))
        .catch(() => {})
    }
  }, [selectedVessel, modalMode])

  // Filtered List
  const filteredVessels = useMemo(() => {
    return vessels.filter(v => {
      if (search) {
        const text = `${v.vesselCode} ${v.name} ${v.storageLocation} ${v.notes || ''}`.toLowerCase()
        if (!text.includes(search.toLowerCase())) return false
      }
      if (typeFilter && v.vesselType !== typeFilter) return false
      if (statusFilter && v.status !== statusFilter) return false
      if (cleaningFilter && v.cleaningStatus !== cleaningFilter) return false
      return true
    })
  }, [vessels, search, typeFilter, statusFilter, cleaningFilter])

  // Check if vessel code / ID is unique
  const isCodeDuplicate = useMemo(() => {
    const code = formData.vesselCode?.trim().toLowerCase()
    if (!code) return false
    return vessels.some(
      v => v.vesselCode.trim().toLowerCase() === code && (modalMode === 'add' || v.id !== selectedVessel?.id)
    )
  }, [formData.vesselCode, vessels, modalMode, selectedVessel])

  // Handlers
  const handleOpenAdd = () => {
    let nextNum = Math.floor(100 + Math.random() * 900)
    let code = 'VES-' + nextNum
    let attempts = 0
    while (vessels.some(v => v.vesselCode.toLowerCase() === code.toLowerCase()) && attempts < 100) {
      nextNum = Math.floor(100 + Math.random() * 900)
      code = 'VES-' + nextNum
      attempts++
    }
    setFormData({
      vesselCode: code,
      name: '',
      vesselType: 'HOT_BOX',
      material: 'STAINLESS_STEEL',
      capacityValue: 20,
      capacityUnit: 'LITRES',
      foodGradeCertified: true,
      temperatureSuitability: 'HOT',
      hasInsulation: true,
      hasTightLid: true,
      status: 'AVAILABLE',
      cleaningStatus: 'CLEAN',
      maintenanceCondition: 'GOOD',
      storageLocation: 'Main Central Warehouse',
      notes: '',
    })
    setModalMode('add')
  }

  const handleOpenEdit = (vessel: VesselItem) => {
    setSelectedVessel(vessel)
    setFormData({
      vesselCode: vessel.vesselCode,
      name: vessel.name,
      vesselType: vessel.vesselType,
      material: vessel.material,
      capacityValue: vessel.capacityValue,
      capacityUnit: vessel.capacityUnit,
      foodGradeCertified: vessel.foodGradeCertified,
      temperatureSuitability: vessel.temperatureSuitability,
      hasInsulation: vessel.hasInsulation,
      hasTightLid: vessel.hasTightLid,
      status: vessel.status,
      cleaningStatus: vessel.cleaningStatus,
      maintenanceCondition: vessel.maintenanceCondition,
      storageLocation: vessel.storageLocation,
      notes: vessel.notes || '',
    })
    setModalMode('edit')
  }

  const handleSaveVessel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    const code = formData.vesselCode?.trim()
    const rawName = formData.name?.trim()
    const name = rawName || `${formData.vesselType?.replace(/_/g, ' ') || 'Vessel'} (${code})`
    const location = formData.storageLocation?.trim()
    const capacity = Number(formData.capacityValue)

    // Strict validation: ID unique and all required except note
    if (!code) {
      notify?.('Vessel Code / ID is required.', 'error')
      return
    }
    if (isCodeDuplicate) {
      notify?.(`Vessel Code / ID "${code}" already exists. IDs must be unique.`, 'error')
      return
    }
    if (!formData.vesselType) {
      notify?.('Container Type is required.', 'error')
      return
    }
    if (!formData.material) {
      notify?.('Material is required.', 'error')
      return
    }
    if (!capacity || capacity <= 0 || isNaN(capacity)) {
      notify?.('Capacity is required and must be greater than zero.', 'error')
      return
    }
    if (!formData.capacityUnit) {
      notify?.('Capacity Unit is required.', 'error')
      return
    }
    if (!formData.temperatureSuitability) {
      notify?.('Temperature Suitability is required.', 'error')
      return
    }
    if (!location) {
      notify?.('Storage Location is required.', 'error')
      return
    }
    if (!formData.cleaningStatus) {
      notify?.('Cleaning Status is required.', 'error')
      return
    }
    if (!formData.maintenanceCondition) {
      notify?.('Maintenance Condition is required.', 'error')
      return
    }
    if (!formData.status) {
      notify?.('Operational Status is required.', 'error')
      return
    }

    const payload = {
      ...formData,
      status: formData.status || 'AVAILABLE',
      vesselCode: code,
      name,
      capacityValue: capacity,
      storageLocation: location,
      notes: formData.notes?.trim() || null,
    }

    setIsSubmitting(true)
    try {
      if (modalMode === 'add') {
        try {
          const created = await apiCreateVessel(payload as CreateVessel)
          setVessels(prev => [created, ...prev])
          notify?.(`Vessel ${created.vesselCode} registered successfully!`, 'success')
        } catch (apiErr: any) {
          if (apiErr?.status === 401 || apiErr?.code === 'UNAUTHENTICATED') {
            const newLocal: VesselItem = {
              id: 'vsl-' + Date.now(),
              ...payload,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as VesselItem
            setVessels(prev => [newLocal, ...prev])
            notify?.(`Vessel ${payload.vesselCode} registered successfully!`, 'success')
          } else if (apiErr?.status === 409 || String(apiErr?.message || '').toLowerCase().includes('already exists')) {
            // Already created in backend, gracefully refresh without error
            await loadData()
            notify?.(`Vessel ${payload.vesselCode} registered successfully!`, 'success')
          } else {
            throw apiErr
          }
        }
      } else if (modalMode === 'edit' && selectedVessel) {
        try {
          const updated = await apiUpdateVessel(selectedVessel.id, payload as UpdateVessel)
          setVessels(prev => prev.map(v => v.id === selectedVessel.id ? updated : v))
          notify?.(`Vessel ${updated.vesselCode} updated successfully!`, 'success')
        } catch (apiErr: any) {
          if (apiErr?.status === 401 || apiErr?.code === 'UNAUTHENTICATED') {
            setVessels(prev => prev.map(v => v.id === selectedVessel.id ? { ...v, ...payload, updatedAt: new Date().toISOString() } : v))
            notify?.(`Vessel ${payload.vesselCode} updated successfully!`, 'success')
          } else {
            throw apiErr
          }
        }
      }
      setModalMode(null)
      loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to save vessel.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRetire = async (vessel: VesselItem) => {
    if (!confirm(`Are you sure you want to retire vessel ${vessel.vesselCode}?`)) return
    try {
      try {
        await apiUpdateVessel(vessel.id, { status: 'RETIRED' })
      } catch (apiErr: any) {
        if (apiErr?.status !== 401 && apiErr?.code !== 'UNAUTHENTICATED') throw apiErr
      }
      setVessels(prev => prev.map(v => v.id === vessel.id ? { ...v, status: 'RETIRED' } : v))
      notify?.(`Vessel ${vessel.vesselCode} marked as RETIRED.`, 'success')
      loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to retire vessel.', 'error')
    }
  }

  const handleDelete = async (vessel: VesselItem) => {
    if (!confirm(`Permanently delete vessel ${vessel.vesselCode}? This action cannot be undone.`)) return
    try {
      const target = vessel.id || vessel.vesselCode
      try {
        await apiDeleteVessel(target)
      } catch (apiErr: any) {
        if (vessel.vesselCode && vessel.vesselCode !== target) {
          try {
            await apiDeleteVessel(vessel.vesselCode)
          } catch {}
        }
      }
      setVessels(prev => {
        const remaining = prev.filter(v => v.id !== vessel.id && v.vesselCode !== vessel.vesselCode)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('aaharaconnect_vessels', JSON.stringify(remaining))
        }
        return remaining
      })
      notify?.(`Vessel ${vessel.vesselCode} deleted.`, 'success')
      await loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to delete vessel.', 'error')
    }
  }

  const handleMarkAsCleaned = async (vessel: VesselItem) => {
    try {
      const patch = {
        status: 'AVAILABLE' as const,
        cleaningStatus: 'CLEAN' as const,
        lastCleanedAt: new Date().toISOString(),
      }
      try {
        await apiUpdateVessel(vessel.id, patch)
        await apiAddVesselLog(vessel.id, {
          logType: 'CLEANING',
          resultStatus: 'PASSED',
          summary: 'Sanitization & wash completed. Marked Available for dispatch.',
          details: 'Washed and sanitized at food container cleaning bay.',
        }).catch(() => {})
      } catch (apiErr: any) {
        if (apiErr?.status !== 401 && apiErr?.code !== 'UNAUTHENTICATED') throw apiErr
      }

      const updatedVessel: VesselItem = {
        ...vessel,
        status: 'AVAILABLE',
        cleaningStatus: 'CLEAN',
        lastCleanedAt: patch.lastCleanedAt,
        updatedAt: new Date().toISOString(),
      }

      setVessels(prev => prev.map(v => v.id === vessel.id ? updatedVessel : v))
      if (selectedVessel && selectedVessel.id === vessel.id) {
        setSelectedVessel(updatedVessel)
        apiFetchVesselLogs(vessel.id)
          .then(res => setVesselLogs(res.items))
          .catch(() => {
            setVesselLogs(prev => [
              {
                id: 'local-log-' + Date.now(),
                vesselId: vessel.id,
                logType: 'CLEANING',
                performedAt: patch.lastCleanedAt,
                performedBy: 'Current User',
                resultStatus: 'PASSED',
                summary: 'Sanitization & wash completed. Marked Available for dispatch.',
                details: 'Washed and sanitized at food container cleaning bay.',
                nextDueAt: null,
                createdAt: patch.lastCleanedAt,
              },
              ...prev,
            ])
          })
      }
      notify?.(`Vessel ${vessel.vesselCode} marked as CLEANED and is now AVAILABLE for dispatch!`, 'success')
      loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to update cleaning status.', 'error')
    }
  }

  const handleQuickStatusChange = async (vessel: VesselItem, newStatus: VesselStatus) => {
    try {
      try {
        await apiUpdateVessel(vessel.id, { status: newStatus })
      } catch (apiErr: any) {
        if (apiErr?.status !== 401 && apiErr?.code !== 'UNAUTHENTICATED') throw apiErr
      }
      const updatedVessel: VesselItem = {
        ...vessel,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      }
      setVessels(prev => prev.map(v => v.id === vessel.id ? updatedVessel : v))
      if (selectedVessel && selectedVessel.id === vessel.id) {
        setSelectedVessel(updatedVessel)
      }
      notify?.(`Vessel ${vessel.vesselCode} status updated to ${newStatus.replace(/_/g, ' ')}.`, 'success')
      loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to update status.', 'error')
    }
  }

  const handleQuickHygieneChange = async (vessel: VesselItem, newCleaningStatus: VesselCleaningStatus) => {
    try {
      const patch: Partial<UpdateVessel> = {
        cleaningStatus: newCleaningStatus,
        ...(newCleaningStatus === 'CLEAN' ? { lastCleanedAt: new Date().toISOString() } : {}),
      }
      try {
        await apiUpdateVessel(vessel.id, patch)
      } catch (apiErr: any) {
        if (apiErr?.status !== 401 && apiErr?.code !== 'UNAUTHENTICATED') throw apiErr
      }
      const updatedVessel: VesselItem = {
        ...vessel,
        ...patch,
        updatedAt: new Date().toISOString(),
      }
      setVessels(prev => prev.map(v => v.id === vessel.id ? updatedVessel : v))
      if (selectedVessel && selectedVessel.id === vessel.id) {
        setSelectedVessel(updatedVessel)
      }
      notify?.(`Vessel ${vessel.vesselCode} hygiene state updated to ${newCleaningStatus}.`, 'success')
      loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to update hygiene state.', 'error')
    }
  }

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedVessel || isSubmitting) return

    const enteredReg = issueData.registrationNumber?.trim()
    if (!enteredReg) {
      notify?.('Please select or specify a Vehicle Registration Number.', 'error')
      return
    }

    // Condition: Registration number MUST be from Vehicle Details fleet
    const targetVehicle = registeredVehicles.find(
      v => v.registrationNumber.trim().toLowerCase() === enteredReg.toLowerCase()
    )

    if (!targetVehicle) {
      notify?.(
        `Registration number "${enteredReg}" is not registered in Vehicle Details. It must be an existing vehicle from Vehicle Details fleet.`,
        'error'
      )
      return
    }

    if (targetVehicle.status === 'RETIRED') {
      notify?.(`Vehicle ${targetVehicle.registrationNumber} is RETIRED and cannot receive vessel dispatches.`, 'error')
      return
    }

    setIsSubmitting(true)
    try {
      try {
        await apiIssueVessel({
          vesselId: selectedVessel.id,
          registrationNumber: targetVehicle.registrationNumber,
          issuedNotes: issueData.issuedNotes,
        })
      } catch (apiErr: any) {
        if (apiErr?.status !== 401 && apiErr?.code !== 'UNAUTHENTICATED') throw apiErr
      }
      setVessels(prev => prev.map(v => v.id === selectedVessel.id ? {
        ...v,
        status: 'IN_USE',
        activeIssuance: {
          issuanceId: 'iss-' + Date.now(),
          registrationNumber: targetVehicle.registrationNumber,
          vehicleId: targetVehicle.vehicleId,
          issuedAt: new Date().toISOString(),
        }
      } : v))
      notify?.(`Vessel ${selectedVessel.vesselCode} dispatched to vehicle ${targetVehicle.registrationNumber}!`, 'success')
      setModalMode(null)
      loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to issue vessel.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedVessel || isSubmitting) return

    setIsSubmitting(true)
    try {
      try {
        await apiReturnVessel(selectedVessel.id, returnData)
      } catch (apiErr: any) {
        if (apiErr?.status !== 401 && apiErr?.code !== 'UNAUTHENTICATED') throw apiErr
      }
      const nextStatus = returnData.returnCleanliness === 'CLEAN' ? 'AVAILABLE' : 'CLEANING_REQUIRED'
      const nextClean = returnData.returnCleanliness === 'CLEAN' ? 'CLEAN' : 'DIRTY'
      setVessels(prev => prev.map(v => v.id === selectedVessel.id ? {
        ...v,
        status: nextStatus,
        cleaningStatus: nextClean,
        maintenanceCondition: returnData.returnedCondition || v.maintenanceCondition,
      } : v))
      notify?.(`Vessel ${selectedVessel.vesselCode} returned from pickup.`, 'success')
      setModalMode(null)
      loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to record return.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedVessel || !logData.summary || isSubmitting) {
      if (!logData.summary) notify?.('Please enter a summary of the activity.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      try {
        await apiAddVesselLog(selectedVessel.id, logData)
      } catch (apiErr: any) {
        if (apiErr?.status !== 401 && apiErr?.code !== 'UNAUTHENTICATED') throw apiErr
      }
      const isCleaningPass = logData.logType === 'CLEANING' &&
        (logData.resultStatus.toUpperCase() === 'PASSED' || logData.resultStatus.toUpperCase() === 'CLEAN')

      if (isCleaningPass) {
        const patch = {
          status: 'AVAILABLE' as const,
          cleaningStatus: 'CLEAN' as const,
          lastCleanedAt: new Date().toISOString(),
        }
        setVessels(prev => prev.map(v => v.id === selectedVessel.id ? { ...v, ...patch } : v))
        setSelectedVessel(prev => prev && prev.id === selectedVessel.id ? { ...prev, ...patch } : prev)
      }
      notify?.('Vessel log recorded successfully!', 'success')
      setModalMode('detail')
      apiFetchVesselLogs(selectedVessel.id)
        .then(res => setVesselLogs(res.items))
        .catch(() => {
          setVesselLogs(prev => [
            {
              id: 'local-log-' + Date.now(),
              vesselId: selectedVessel.id,
              logType: logData.logType,
              performedAt: new Date().toISOString(),
              performedBy: 'Current User',
              resultStatus: logData.resultStatus,
              summary: logData.summary,
              details: logData.details ?? null,
              nextDueAt: logData.nextDueAt ?? null,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ])
        })
      loadData()
    } catch (err: any) {
      notify?.(err?.message || 'Failed to record vessel log.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Page Header */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">EQUIPMENT & ASSETS</span>
          <h1>Vessels & Food Containers</h1>
          <p>Manage transport hot boxes, milk cans, insulated bags, sanitization, and pickup issuance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="button button-secondary flex items-center gap-1.5"
            onClick={() => void loadData()}
            title="Refresh vessels"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            className="button button-primary flex items-center gap-1.5"
            onClick={handleOpenAdd}
          >
            <Plus size={15} /> Add Vessel
          </button>
        </div>
      </div>

      {error && !error.toLowerCase().includes('reach the api') && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-2 text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-400 block">Total Vessels</span>
          <strong className="text-2xl font-black text-slate-800 mt-1 block">
            {summary ? summary.total : vessels.length}
          </strong>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Active inventory</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
          <span className="text-xs font-semibold text-emerald-700 block">Available</span>
          <strong className="text-2xl font-black text-emerald-800 mt-1 block">
            {summary ? summary.available : vessels.filter(v => v.status === 'AVAILABLE').length}
          </strong>
          <span className="text-[11px] text-emerald-600 mt-0.5 block">Ready for dispatch</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-blue-200 bg-blue-50/20 shadow-2xs">
          <span className="text-xs font-semibold text-blue-700 block">In Use</span>
          <strong className="text-2xl font-black text-blue-800 mt-1 block">
            {summary ? summary.inUse : vessels.filter(v => v.status === 'IN_USE').length}
          </strong>
          <span className="text-[11px] text-blue-600 mt-0.5 block">Issued on pickups</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-amber-200 bg-amber-50/20 shadow-2xs">
          <span className="text-xs font-semibold text-amber-700 block">Cleaning Required</span>
          <strong className="text-2xl font-black text-amber-800 mt-1 block">
            {summary
              ? summary.cleaningRequired
              : vessels.filter(v => v.status === 'CLEANING_REQUIRED' || v.cleaningStatus !== 'CLEAN').length}
          </strong>
          <span className="text-[11px] text-amber-600 mt-0.5 block">Sanitization needed</span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search code, name, storage location…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none"
          >
            <option value="">All Container Types</option>
            <option value="HOT_BOX">Hot Box</option>
            <option value="INSULATED_BAG">Insulated Bag</option>
            <option value="MILK_CAN">Milk Can</option>
            <option value="CRATE">Crate</option>
            <option value="COLD_BOX">Cold Box</option>
            <option value="OTHER">Other</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="IN_USE">In Use</option>
            <option value="CLEANING_REQUIRED">Cleaning Required</option>
            <option value="INSPECTION_REQUIRED">Inspection Required</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="RETIRED">Retired</option>
          </select>
          <select
            value={cleaningFilter}
            onChange={e => setCleaningFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none"
          >
            <option value="">All Hygiene States</option>
            <option value="CLEAN">Clean</option>
            <option value="DIRTY">Dirty</option>
            <option value="SANITIZING">Sanitizing</option>
          </select>
        </div>
        <span className="text-xs text-slate-500 font-medium">
          {`Showing ${filteredVessels.length} of ${vessels.length} containers`}
        </span>
      </div>

      {/* Vessels Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Container</th>
                <th className="py-3 px-4">Type & Material</th>
                <th className="py-3 px-4">Capacity</th>
                <th className="py-3 px-4">Suitability</th>
                <th className="py-3 px-4">Cleanliness</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVessels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Boxes size={36} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No vessels found matching filters.</p>
                    <p className="text-[11px] mt-1">Register new food containers or adjust search criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredVessels.map(vessel => (
                  <tr key={vessel.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Code & Name */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Boxes size={14} className="text-emerald-600" />
                        <span>{vessel.vesselCode}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 block truncate max-w-[140px]">
                        {vessel.name}
                      </span>
                    </td>

                    {/* Type & Material */}
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-700 block">{vessel.vesselType.replace('_', ' ')}</span>
                      <span className="text-[10px] text-slate-400 block">{vessel.material.replace('_', ' ')}</span>
                    </td>

                    {/* Capacity */}
                    <td className="py-3 px-4">
                      <strong className="text-slate-800 font-bold block">
                        {`${vessel.capacityValue} ${vessel.capacityUnit}`}
                      </strong>
                      <span className="text-[10px] text-slate-400">
                        {vessel.hasTightLid ? 'Tight Lid ✓' : 'Open Bed'}
                      </span>
                    </td>

                    {/* Temperature & Suitability */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700">
                          {vessel.temperatureSuitability === 'HOT' && <span className="text-amber-600">🔥 HOT</span>}
                          {vessel.temperatureSuitability === 'CHILLED' && <span className="text-cyan-600">❄️ CHILLED</span>}
                          {vessel.temperatureSuitability === 'FROZEN' && <span className="text-indigo-600">🧊 FROZEN</span>}
                          {vessel.temperatureSuitability === 'AMBIENT' && <span className="text-slate-600">🌾 AMBIENT</span>}
                          {vessel.temperatureSuitability === 'MULTI_TEMP' && <span className="text-purple-600">✨ MULTI</span>}
                        </span>
                        {vessel.hasInsulation && (
                          <span className="text-[9px] text-emerald-700 font-bold">Insulated</span>
                        )}
                      </div>
                    </td>

                    {/* Cleanliness */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          vessel.cleaningStatus === 'CLEAN'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : vessel.cleaningStatus === 'DIRTY'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        <Droplets size={10} />
                        {vessel.cleaningStatus}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border shadow-2xs ${
                          vessel.status === 'AVAILABLE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : vessel.status === 'IN_USE'
                            ? 'bg-blue-50 text-blue-700 border-blue-300'
                            : vessel.status === 'CLEANING_REQUIRED'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : vessel.status === 'MAINTENANCE'
                            ? 'bg-rose-50 text-rose-700 border-rose-300'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            vessel.status === 'AVAILABLE'
                              ? 'bg-emerald-500 animate-pulse'
                              : vessel.status === 'IN_USE'
                              ? 'bg-blue-500'
                              : vessel.status === 'CLEANING_REQUIRED'
                              ? 'bg-amber-500'
                              : vessel.status === 'MAINTENANCE'
                              ? 'bg-rose-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        {vessel.status === 'AVAILABLE'
                          ? 'Available'
                          : vessel.status === 'IN_USE'
                          ? 'In Use'
                          : vessel.status === 'CLEANING_REQUIRED'
                          ? 'Cleaning Required'
                          : vessel.status === 'MAINTENANCE'
                          ? 'Maintenance'
                          : vessel.status === 'INSPECTION_REQUIRED'
                          ? 'Inspection Required'
                          : 'Retired'}
                      </span>
                      {vessel.status === 'IN_USE' && vessel.activeIssuance?.registrationNumber && (
                        <span className="text-[10px] text-blue-700 font-bold block mt-1">
                          🚛 {vessel.activeIssuance.registrationNumber}
                        </span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="py-3 px-4">
                      <span className="text-slate-700 block truncate max-w-[120px]">
                        {vessel.storageLocation}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {vessel.status === 'AVAILABLE' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVessel(vessel)
                              setIssueData({ registrationNumber: '', issuedNotes: '' })
                              setVehicleSearchQuery('')
                              setIsVehicleDropdownOpen(false)
                              setModalMode('issue')
                            }}
                            className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 border border-emerald-200 transition-colors"
                            title="Issue to Vehicle"
                          >
                            <LogIn size={13} />
                          </button>
                        )}
                        {vessel.status === 'IN_USE' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVessel(vessel)
                              setReturnData({
                                returnedCondition: 'GOOD',
                                returnCleanliness: 'DIRTY',
                                returnNotes: '',
                                immediateClean: false,
                              })
                              setModalMode('return')
                            }}
                            className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-50 border border-blue-200 transition-colors"
                            title="Record Return"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                        {(vessel.status === 'CLEANING_REQUIRED' || vessel.cleaningStatus !== 'CLEAN') && (
                          <button
                            type="button"
                            onClick={() => handleMarkAsCleaned(vessel)}
                            className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 border border-emerald-200 transition-colors"
                            title="Mark Cleaned & Ready"
                          >
                            <Sparkles size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVessel(vessel)
                            setModalMode('detail')
                          }}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                          title="View Details"
                        >
                          <ChevronRight size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(vessel)}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                          title="Edit Specs"
                        >
                          <Edit2 size={13} />
                        </button>
                        {vessel.status !== 'RETIRED' && (
                          <button
                            type="button"
                            onClick={() => handleRetire(vessel)}
                            className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50 border border-amber-200 transition-colors"
                            title="Retire Vessel"
                          >
                            <AlertTriangle size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(vessel)}
                          className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors"
                          title="Delete Vessel"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Vessel Modal */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-5 sm:p-7 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-3.5 border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <Boxes size={18} />
                </div>
                <span>{modalMode === 'add' ? 'Register New Vessel' : 'Edit Vessel Specifications'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveVessel} className="space-y-4 text-xs">
              {/* 1. Basic Information */}
              <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/25 p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-xs tracking-tight">
                    <FileText size={16} className="text-emerald-600" />
                    <span>1. Basic Information</span>
                  </div>
                  <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                    Identity & Classification
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        Vessel Code / ID <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] text-emerald-700 font-medium">Required · Unique</span>
                    </div>
                    <input
                      type="text"
                      required
                      value={formData.vesselCode}
                      onChange={e => setFormData({ ...formData, vesselCode: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border bg-white focus:outline-none font-mono text-xs shadow-2xs transition-all ${
                        isCodeDuplicate
                          ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                          : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                      }`}
                      placeholder="e.g. VES-413"
                    />
                    {isCodeDuplicate ? (
                      <span className="text-rose-600 text-[11px] font-medium block mt-1">
                        {'This Vessel ID is already in use. IDs must be unique.'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 block mt-1">
                        Unique ID to identify each vessel.
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        Vessel Name
                      </label>
                      <span className="text-[10px] text-amber-700 bg-amber-100/60 px-1.5 py-0.5 rounded font-medium">
                        Optional
                      </span>
                    </div>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs shadow-2xs"
                      placeholder="e.g. Hot Box 40L Insulated"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Manual name or label (auto-generated ID is fine).
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        Container Type <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] text-emerald-700 font-medium">Required</span>
                    </div>
                    <select
                      required
                      value={formData.vesselType}
                      onChange={e => setFormData({ ...formData, vesselType: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                    >
                      <option value="HOT_BOX">Hot Box</option>
                      <option value="INSULATED_BAG">Insulated Bag</option>
                      <option value="MILK_CAN">Milk Can</option>
                      <option value="CRATE">Crate</option>
                      <option value="COLD_BOX">Cold Box</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Helps to easily recognize the vessel.
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        Material <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] text-emerald-700 font-medium">Required</span>
                    </div>
                    <select
                      required
                      value={formData.material}
                      onChange={e => setFormData({ ...formData, material: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                    >
                      <option value="STAINLESS_STEEL">Stainless Steel</option>
                      <option value="FOOD_GRADE_PLASTIC">Food Grade Plastic</option>
                      <option value="ALUMINUM">Aluminum</option>
                      <option value="INSULATED_POLYMER">Insulated Polymer</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Material helps check food-grade suitability.
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Capacity & Temperature */}
              <div className="rounded-2xl border border-sky-200/90 bg-sky-50/25 p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-xs tracking-tight">
                    <Box size={16} className="text-sky-600" />
                    <span>2. Capacity & Temperature</span>
                  </div>
                  <span className="text-[10px] font-medium text-sky-700 bg-sky-100/70 px-2 py-0.5 rounded-md">
                    Volume & Thermal Range
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Capacity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      required
                      value={formData.capacityValue}
                      onChange={e => setFormData({ ...formData, capacityValue: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                      placeholder="e.g. 20"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Capacity Unit <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.capacityUnit}
                      onChange={e => setFormData({ ...formData, capacityUnit: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                    >
                      <option value="LITRES">Litres (L)</option>
                      <option value="KG">Kilograms (kg)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Temperature Suitability <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.temperatureSuitability}
                      onChange={e => setFormData({ ...formData, temperatureSuitability: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                    >
                      <option value="HOT">{'Hot Food (>60°C)'}</option>
                      <option value="CHILLED">{'Chilled Dairy / Perishables (<5°C)'}</option>
                      <option value="FROZEN">{'Frozen / Desserts (<0°C)'}</option>
                      <option value="AMBIENT">Ambient / Dry Goods</option>
                      <option value="MULTI_TEMP">Multi-Temperature</option>
                    </select>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Temperature suitability ensures safe food transport.
                </span>
              </div>

              {/* 3. Food Safety & Features */}
              <div className="rounded-2xl border border-amber-200/90 bg-amber-50/25 p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-xs tracking-tight">
                    <ShieldCheck size={16} className="text-amber-600" />
                    <span>3. Food Safety & Features</span>
                  </div>
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                    Hygiene & Compliance
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-amber-200/70 bg-white shadow-2xs cursor-pointer hover:bg-amber-50/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.foodGradeCertified}
                      onChange={e => setFormData({ ...formData, foodGradeCertified: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <span className="font-semibold text-slate-700 text-xs">Food Grade Certified</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-amber-200/70 bg-white shadow-2xs cursor-pointer hover:bg-amber-50/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.hasInsulation}
                      onChange={e => setFormData({ ...formData, hasInsulation: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <span className="font-semibold text-slate-700 text-xs">Thermal Insulation</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-amber-200/70 bg-white shadow-2xs cursor-pointer hover:bg-amber-50/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.hasTightLid}
                      onChange={e => setFormData({ ...formData, hasTightLid: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <span className="font-semibold text-slate-700 text-xs">Tight Seal Lid</span>
                  </label>
                </div>
              </div>

              {/* 4. Location & Status */}
              <div className="rounded-2xl border border-purple-200/90 bg-purple-50/25 p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-xs tracking-tight">
                    <MapPin size={16} className="text-purple-600" />
                    <span>4. Location & Status</span>
                  </div>
                  {formData.status === 'AVAILABLE' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Available for Dispatch
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Not Available
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Operational Status <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.status || 'AVAILABLE'}
                      onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs font-medium"
                    >
                      <option value="AVAILABLE">Available (Ready for Dispatch)</option>
                      <option value="IN_USE">In Use (On Pickup)</option>
                      <option value="CLEANING_REQUIRED">Cleaning Required</option>
                      <option value="INSPECTION_REQUIRED">Inspection Required</option>
                      <option value="MAINTENANCE">Under Maintenance</option>
                      <option value="RETIRED">Retired / Decommissioned</option>
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Sets whether the vessel is currently available for pickups.
                    </span>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Storage Location <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.storageLocation}
                      onChange={e => setFormData({ ...formData, storageLocation: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                      placeholder="Main Central Warehouse"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Where the vessel is kept.
                    </span>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Cleaning Status <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.cleaningStatus}
                      onChange={e => setFormData({ ...formData, cleaningStatus: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                    >
                      <option value="CLEAN">{'Clean & Sanitized'}</option>
                      <option value="DIRTY">Dirty (Requires Wash)</option>
                      <option value="SANITIZING">Sanitizing in progress</option>
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Checks if clean for immediate food contact.
                    </span>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Maintenance Condition <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.maintenanceCondition}
                      onChange={e => setFormData({ ...formData, maintenanceCondition: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                    >
                      <option value="GOOD">Good Condition</option>
                      <option value="MINOR_WEAR">Minor Wear</option>
                      <option value="NEEDS_REPAIR">Needs Repair</option>
                      <option value="UNSAFE">Unsafe / Condemned</option>
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Condition shows if vessel is usable.
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Additional Information */}
              <div className="rounded-2xl border border-rose-200/90 bg-rose-50/25 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-xs tracking-tight">
                    <Info size={16} className="text-rose-600" />
                    <span>5. Additional Information</span>
                  </div>
                  <span className="text-[10px] font-medium text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded-md">
                    Optional
                  </span>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {'Notes & Handling Instructions'}
                  </label>
                  <textarea
                    rows={2}
                    value={formData.notes || ''}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                    placeholder="Optional notes or handling cautions..."
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Extra instructions for handling or usage.
                  </span>
                </div>
              </div>

              {/* Action Buttons & Guide Toggle */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <HelpCircle size={15} className="text-emerald-600" />
                  <span>{showGuide ? 'Hide Field Guide' : 'Show Field Guide'}</span>
                  {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setModalMode(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer text-xs disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || isCodeDuplicate}
                    className={`px-5 py-2 rounded-xl font-semibold shadow-xs text-white text-xs flex items-center justify-center gap-2 min-w-[120px] transition-all ${
                      isSubmitting || isCodeDuplicate
                        ? 'bg-slate-400 cursor-not-allowed opacity-70'
                        : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer active:scale-95'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Vessel</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Expandable Specifications Guide (Reference Panel) */}
              {showGuide && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
                  {/* Necessary (Required) */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-900 text-xs">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Necessary (Required)</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-emerald-950/80 font-medium leading-relaxed">
                      <li><strong className="text-emerald-950">Vessel Code / ID</strong>{' — '}<span>Unique identification</span></li>
                      <li><strong className="text-emerald-950">Container Type</strong>{' — '}<span>Type of vessel</span></li>
                      <li><strong className="text-emerald-950">Capacity</strong>{' — '}<span>Amount it can hold</span></li>
                      <li><strong className="text-emerald-950">Capacity Unit</strong>{' — '}<span>Litre/kg/pieces</span></li>
                      <li><strong className="text-emerald-950">Temperature Suitability</strong>{' — '}<span>Type of food it can carry</span></li>
                      <li><strong className="text-emerald-950">Cleaning Status</strong>{' — '}<span>Whether it is clean and usable</span></li>
                      <li><strong className="text-emerald-950">Storage Location</strong>{' — '}<span>Where it is kept</span></li>
                      <li><strong className="text-emerald-950">Maintenance Condition</strong>{' — '}<span>Current condition</span></li>
                    </ol>
                  </div>

                  {/* Recommended & Not Necessary */}
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
                        <AlertCircle size={16} className="text-amber-600 shrink-0" />
                        <span>Recommended (Important)</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-950/80 font-medium leading-relaxed">
                        <li><strong className="text-amber-950">Vessel Name</strong>{' — '}<span>Easy to identify</span></li>
                        <li><strong className="text-amber-950">Material</strong>{' — '}<span>Helps check food-grade</span></li>
                        <li><strong className="text-amber-950">Food Grade Certified</strong>{' — '}<span>Ensures safe for food</span></li>
                        <li><strong className="text-amber-950">Thermal Insulation</strong>{' — '}<span>Useful for hot/cold food</span></li>
                        <li><strong className="text-amber-950">Tight Seal Lid</strong>{' — '}<span>Maintains food quality</span></li>
                      </ol>
                    </div>

                    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-rose-900 text-xs">
                        <XCircle size={15} className="text-rose-600 shrink-0" />
                        <span>Not Necessary (Can Remove)</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-950/80 leading-relaxed">
                        <li>None in current form are completely unnecessary.</li>
                        <li>If needed, you can make "Vessel Name" and "Notes" optional.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Optional (Nice to have in future) */}
                  <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-sky-900 text-xs">
                      <Info size={16} className="text-sky-600 shrink-0" />
                      <span>Optional (Nice to have in future)</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-sky-950/80 font-medium leading-relaxed">
                      <li>Manufacturer / Model</li>
                      <li>Barcode / QR Code</li>
                      <li>Last Cleaned Date and Next Cleaning Due Date</li>
                      <li>Last Inspection Date and Result</li>
                      <li>Dedicated Use (Veg / Non-veg)</li>
                      <li>Dedicated Vehicle, if applicable</li>
                      <li>Photo of vessel</li>
                      <li>Status (Active / Retired)</li>
                      <li>Reason for retirement</li>
                      <li>Issue/Return history (automatically tracked)</li>
                    </ul>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Issue Modal */}
      {modalMode === 'issue' && selectedVessel && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <LogIn className="text-emerald-600" size={18} />
                <span>{`Issue ${selectedVessel.vesselCode} to Vehicle`}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleIssueSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                <strong className="text-emerald-900 block">{selectedVessel.name}</strong>
                <p className="text-emerald-700 text-[11px]">
                  {`Capacity: ${selectedVessel.capacityValue} ${selectedVessel.capacityUnit} · Suitability: ${selectedVessel.temperatureSuitability}`}
                </p>
              </div>

              <div ref={vehicleComboboxRef} className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Truck size={14} className="text-emerald-600" />
                    <span>Vehicle Registration Number</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                    From Vehicle Details
                  </span>
                </div>

                {/* Search Input Box */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search size={14} />
                  </div>
                  <input
                    type="text"
                    required
                    value={vehicleSearchQuery}
                    onChange={e => {
                      const val = e.target.value
                      setVehicleSearchQuery(val)
                      setIssueData(prev => ({ ...prev, registrationNumber: val }))
                      setIsVehicleDropdownOpen(true)
                    }}
                    onFocus={() => setIsVehicleDropdownOpen(true)}
                    placeholder="Search registration number, vehicle type, or driver..."
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:outline-none focus:border-emerald-500 text-xs shadow-2xs"
                  />
                  {vehicleSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setVehicleSearchQuery('')
                        setIssueData(prev => ({ ...prev, registrationNumber: '' }))
                        setIsVehicleDropdownOpen(true)
                      }}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsVehicleDropdownOpen(prev => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <ChevronDown size={14} className={`transition-transform duration-200 ${isVehicleDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Type to search by registration number, type, or driver from Vehicle Details.
                </span>

                {/* Interactive Searchable Dropdown Popup */}
                {isVehicleDropdownOpen && (
                  <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-xl divide-y divide-slate-100">
                    {filteredVehicles.length === 0 ? (
                      <div className="p-3 text-center text-slate-400 text-xs italic">
                        No vehicle found in Vehicle Details matching this search.
                      </div>
                    ) : (
                      filteredVehicles.map(veh => {
                        const isSelected = matchedVehicle?.registrationNumber === veh.registrationNumber
                        return (
                          <div
                            key={veh.vehicleId || veh.registrationNumber}
                            onClick={() => {
                              setIssueData(prev => ({ ...prev, registrationNumber: veh.registrationNumber }))
                              setVehicleSearchQuery(veh.registrationNumber)
                              setIsVehicleDropdownOpen(false)
                            }}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected ? 'bg-emerald-50/90 text-emerald-950 font-semibold' : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                                <Truck size={14} />
                              </div>
                              <div>
                                <span className="font-bold font-mono text-xs block text-slate-900">
                                  {veh.registrationNumber}
                                </span>
                                <span className="text-[11px] text-slate-500 block">
                                  {`${veh.type || 'Vehicle'} · ${veh.capacityKg} KG${veh.driverName ? ` · ${veh.driverName}` : ''}`}
                                </span>
                              </div>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                              veh.status === 'AVAILABLE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : veh.status === 'MAINTENANCE'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {veh.status || 'ACTIVE'}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Verified Vehicle Details Card */}
              {matchedVehicle ? (
                <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2 animate-fadeIn shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span>Verified Vehicle Details</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs ${
                      matchedVehicle.status === 'AVAILABLE'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : matchedVehicle.status === 'MAINTENANCE'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-blue-100 text-blue-800 border-blue-300'
                    }`}>
                      {matchedVehicle.status || 'ACTIVE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-900 bg-white/70 p-2.5 rounded-lg border border-emerald-100">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Registration</span>
                      <strong className="font-mono text-emerald-950">{matchedVehicle.registrationNumber}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Vehicle Kind</span>
                      <strong>{matchedVehicle.type || 'Standard Transport'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Payload Capacity</span>
                      <strong>{matchedVehicle.capacityKg} KG</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Max Vessels</span>
                      <strong>{matchedVehicle.indicativeMaxVessels ? `${matchedVehicle.indicativeMaxVessels} units` : 'Flexible'}</strong>
                    </div>
                    {matchedVehicle.driverName && (
                      <div className="col-span-2 pt-1 border-t border-emerald-100/60">
                        <span className="text-slate-500 block text-[10px]">Assigned Driver</span>
                        <strong className="text-slate-800">{matchedVehicle.driverName} {matchedVehicle.driverLicence ? `(${matchedVehicle.driverLicence})` : ''}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ) : issueData.registrationNumber ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] flex items-center gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0" />
                  <span>Registration number not found in Vehicle Details. Please select a registered vehicle from the fleet.</span>
                </div>
              ) : null}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Dispatch Notes</label>
                <textarea
                  rows={2}
                  value={issueData.issuedNotes}
                  onChange={e => setIssueData({ ...issueData, issuedNotes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none text-xs"
                  placeholder="Notes for the rescue team…"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !issueData.registrationNumber || !matchedVehicle}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold cursor-pointer shadow-sm transition-all flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Dispatching...</span>
                    </>
                  ) : (
                    <span>Confirm Dispatch</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {modalMode === 'return' && selectedVessel && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <RotateCcw className="text-blue-600" size={18} />
                <span>{`Record Return: ${selectedVessel.vesselCode}`}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Hygiene State upon Return</label>
                <select
                  value={returnData.returnCleanliness}
                  onChange={e => setReturnData({ ...returnData, returnCleanliness: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="DIRTY">Dirty (Requires Sanitization)</option>
                  <option value="CONTAMINATED">Contaminated (Requires Deep Chemical Wash)</option>
                  <option value="CLEAN">Clean (Already rinsed/sanitized)</option>
                </select>
                <p className="text-[11px] text-amber-700 mt-1">
                  Returned containers remain unavailable until required washing is complete.
                </p>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Condition</label>
                <select
                  value={returnData.returnedCondition}
                  onChange={e => setReturnData({ ...returnData, returnedCondition: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="GOOD">Good · No Damage</option>
                  <option value="MINOR_WEAR">Minor Scratches</option>
                  <option value="NEEDS_REPAIR">Needs Repair / Loose Gasket</option>
                  <option value="UNSAFE">Unsafe / Cracked</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Return Notes</label>
                <textarea
                  rows={2}
                  value={returnData.returnNotes || ''}
                  onChange={e => setReturnData({ ...returnData, returnNotes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  placeholder="e.g. Returned from Indiranagar community drive..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold cursor-pointer shadow-sm transition-all flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Returning...</span>
                    </>
                  ) : (
                    <span>Confirm Return</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details & Logs Drawer */}
      {modalMode === 'detail' && selectedVessel && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-lg h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 font-black flex items-center justify-center">
                    <Boxes size={20} />
                  </div>
                  <div>
                    <strong className="text-base font-bold text-slate-900 block">{selectedVessel.vesselCode}</strong>
                    <span className="text-xs text-slate-500">{selectedVessel.name}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Quick Clean Action Banner */}
              {(selectedVessel.status === 'CLEANING_REQUIRED' || selectedVessel.cleaningStatus !== 'CLEAN') && (
                <div className="p-3.5 rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <strong className="text-xs font-bold text-emerald-950 block">Sanitization & Wash Complete?</strong>
                      <span className="text-[11px] text-emerald-700 block">Mark this container as cleaned and ready for dispatch.</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMarkAsCleaned(selectedVessel)}
                    className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 size={15} />
                    <span>Mark Cleaned</span>
                  </button>
                </div>
              )}

              {/* Status Header */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Inventory Status</span>
                    <span className={`w-2 h-2 rounded-full ${
                      selectedVessel.status === 'AVAILABLE' ? 'bg-emerald-500' :
                      selectedVessel.status === 'CLEANING_REQUIRED' ? 'bg-amber-500' :
                      selectedVessel.status === 'IN_USE' ? 'bg-blue-500' :
                      selectedVessel.status === 'MAINTENANCE' ? 'bg-rose-500' : 'bg-slate-400'
                    }`} />
                  </div>
                  <select
                    value={selectedVessel.status}
                    onChange={e => handleQuickStatusChange(selectedVessel, e.target.value as VesselStatus)}
                    className="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-none cursor-pointer"
                  >
                    <option value="AVAILABLE">AVAILABLE (Ready)</option>
                    <option value="CLEANING_REQUIRED">CLEANING_REQUIRED</option>
                    <option value="IN_USE">IN_USE</option>
                    <option value="INSPECTION_REQUIRED">INSPECTION_REQUIRED</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="RETIRED">RETIRED</option>
                  </select>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hygiene State</span>
                    <span className={`w-2 h-2 rounded-full ${
                      selectedVessel.cleaningStatus === 'CLEAN' ? 'bg-emerald-500' :
                      selectedVessel.cleaningStatus === 'DIRTY' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                  </div>
                  <select
                    value={selectedVessel.cleaningStatus}
                    onChange={e => handleQuickHygieneChange(selectedVessel, e.target.value as VesselCleaningStatus)}
                    className="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-none cursor-pointer"
                  >
                    <option value="CLEAN">CLEAN</option>
                    <option value="DIRTY">DIRTY</option>
                    <option value="SANITIZING">SANITIZING</option>
                  </select>
                </div>
              </div>

              {/* Specs List */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2 text-xs">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Specifications</h4>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Container Type:</span>
                  <strong className="text-slate-800">{selectedVessel.vesselType}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Material:</span>
                  <strong className="text-slate-800">{selectedVessel.material}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payload Capacity:</span>
                  <strong className="text-slate-800">{`${selectedVessel.capacityValue} ${selectedVessel.capacityUnit}`}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Thermal Suitability:</span>
                  <strong className="text-slate-800">{selectedVessel.temperatureSuitability}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Storage Location:</span>
                  <strong className="text-slate-800">{selectedVessel.storageLocation}</strong>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Maintenance Condition:</span>
                  <strong className="text-slate-800">{selectedVessel.maintenanceCondition}</strong>
                </div>
              </div>

              {/* Cleaning & Inspection Log Action */}
              <div className="flex items-center justify-between pt-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">{'Activity & Wash History'}</h4>
                <button
                  type="button"
                  onClick={() => {
                    setLogData({
                      logType: 'CLEANING',
                      resultStatus: 'PASSED',
                      summary: '',
                      details: '',
                    })
                    setModalMode('log')
                  }}
                  className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  + Add Activity Log
                </button>
              </div>

              {/* Logs Timeline */}
              <div className="space-y-2 text-xs">
                {vesselLogs.length === 0 ? (
                  <p className="text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed">
                    No cleaning or inspection events recorded yet.
                  </p>
                ) : (
                  vesselLogs.map(log => (
                    <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between font-bold text-slate-800 text-[11px]">
                        <span className="text-emerald-700">{log.logType}</span>
                        <span className="text-slate-400 font-normal">{new Date(log.performedAt).toLocaleString()}</span>
                      </div>
                      <p className="font-semibold text-slate-900">{log.summary}</p>
                      {log.details && <p className="text-slate-500 text-[11px]">{log.details}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Log Modal */}
      {modalMode === 'log' && selectedVessel && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Droplets className="text-emerald-600" size={18} />
                <span>{`Log Activity for ${selectedVessel.vesselCode}`}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalMode('detail')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddLogSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Activity Type</label>
                <select
                  value={logData.logType}
                  onChange={e => setLogData({ ...logData, logType: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="CLEANING">Cleaning / Sanitization</option>
                  <option value="INSPECTION">Inspection / Fitness Check</option>
                  <option value="MAINTENANCE">Maintenance / Repair</option>
                  <option value="STATUS_CHANGE">Status Change</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Result / Status</label>
                <input
                  type="text"
                  required
                  value={logData.resultStatus}
                  onChange={e => setLogData({ ...logData, resultStatus: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  placeholder="e.g. PASSED, CLEAN, ACTION_REQUIRED"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Summary</label>
                <input
                  type="text"
                  required
                  value={logData.summary}
                  onChange={e => setLogData({ ...logData, summary: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  placeholder="e.g. Thermal hot water rinse and sanitization complete"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Details (Optional)</label>
                <textarea
                  rows={2}
                  value={logData.details || ''}
                  onChange={e => setLogData({ ...logData, details: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  placeholder="Notes, wash temperature, parts replaced..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalMode('detail')}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !logData.summary}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold cursor-pointer shadow-sm transition-all flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <span>Record Log</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
