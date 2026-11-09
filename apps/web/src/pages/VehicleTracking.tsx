import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import type { FleetLocation } from '@aaharaconnect/shared'
import 'leaflet/dist/leaflet.css'
import { apiRequest } from '../api/client'
import { getAdminAccessToken } from '../api/auth'

export default function VehicleTracking() {
  const [fleet, setFleet] = useState<FleetLocation[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const vehicle = fleet.find(item => item.id === selected)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const token = await getAdminAccessToken()
        if (!token) throw new Error('Sign in as an administrator to see vehicle locations.')
        const result = await apiRequest<{ items: FleetLocation[] }>('vehicles/tracking', { headers: { Authorization: `Bearer ${token}` } })
        if (disposed) return
        setFleet(result.items); setError(''); setNow(Date.now())
        setSelected(current => result.items.some(item => item.id === current) ? current : result.items[0]?.id ?? '')
      } catch (cause) {
        if (!disposed) { setError(cause instanceof Error ? cause.message : 'Location updates unavailable.'); setNow(Date.now()) }
      } finally { if (!disposed) timer = setTimeout(() => void load(), 15_000) }
    }
    void load()
    return () => { disposed = true; clearTimeout(timer) }
  }, [])
  useEffect(() => {
    let disposed = false
    void import('leaflet').then(L => {
      if (disposed || !container.current) return
      map.current = L.map(container.current).setView([12.97, 77.59], 11)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map.current)
      marker.current = L.marker([12.97, 77.59], { icon: L.divIcon({ html: '<span style="font-size:28px" aria-label="Vehicle">🚚</span>', className: '', iconSize: [32, 32] }) })
      setMapReady(true)
    }).catch(() => setError('The map could not load. Use the coordinate map link below.'))
    return () => { disposed = true; map.current?.remove(); map.current = null }
  }, [])
  useEffect(() => {
    if (!mapReady || !map.current || !marker.current) return
    if (vehicle?.latitude == null || vehicle.longitude == null) { marker.current.remove(); return }
    const point: [number, number] = [vehicle.latitude, vehicle.longitude]
    marker.current.setLatLng(point).addTo(map.current)
    map.current.setView(point, map.current.getZoom())
  }, [vehicle?.latitude, vehicle?.longitude, selected, mapReady])
  const age = vehicle?.recordedAt ? Math.max(0, now - Date.parse(vehicle.recordedAt)) : Infinity
  const status = !vehicle?.sharing || age >= 300_000 ? 'Offline' : age >= 120_000 ? 'Stale' : 'Recent'
  return <div className="tracking-page">
    <h1>Vehicle Tracking</h1>
    <p>Driver phone reports during authorized NGO duty. Phone GPS does not independently prove vehicle position.</p>
    {error && <p role="alert">{error} Previously received positions may be out of date.</p>}
    <label htmlFor="tracked-vehicle">Vehicle</label>{' '}
    <select id="tracked-vehicle" value={selected} onChange={event => setSelected(event.target.value)}>
      {fleet.length === 0 && <option value="">No registered vehicles available</option>}
      {fleet.map(item => <option key={item.id} value={item.id}>{item.registrationNumber} · {item.driverName ?? 'No fixed Driver'}</option>)}
    </select>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 20, marginTop: 20 }}>
      <div><div ref={container} style={{ height: 420, borderRadius: 12, zIndex: 0 }} aria-label="Selected vehicle location map" />
        {vehicle?.latitude == null && <p>No recent GPS position exists for this vehicle.</p>}</div>
      {vehicle && <section className="panel" style={{ padding: 20 }}>
        <h2>{vehicle.registrationNumber}</h2>
        <p>Driver: {vehicle.driverName ?? 'No fixed Driver'}</p>
        <p>Location Sharing: {vehicle.sharing ? 'ON' : 'OFF'} · {status}</p>
        <p>Last reported: {vehicle.recordedAt ? new Date(vehicle.recordedAt).toLocaleString('en-IN') : 'No position available'}</p>
        <p>Latitude: {vehicle.latitude ?? '—'}<br />Longitude: {vehicle.longitude ?? '—'}</p>
        <p>{vehicle.locality ?? 'Locality unavailable. Use coordinates or the map link.'}</p>
        <p>GPS accuracy: {vehicle.accuracyMeters != null ? `about ${Math.round(vehicle.accuracyMeters)} metres` : 'Not reported'}</p>
        <p>Speed: {vehicle.speedMps != null ? `${Math.round(vehicle.speedMps*3.6)} km/h · ${vehicle.speedMps>1?'Moving':'Stationary'}` : 'Not reported'}</p>
        {vehicle.latitude != null && vehicle.longitude != null && <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${vehicle.latitude}&mlon=${vehicle.longitude}#map=16/${vehicle.latitude}/${vehicle.longitude}`}>Open location map</a>}
        <p>Reports may stop when the phone is offline, GPS permissions are revoked, battery restrictions apply or Android force-stops the app.</p>
      </section>}
    </div>
  </div>
}
