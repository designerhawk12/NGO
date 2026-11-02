import { useCallback, useEffect, useState } from 'react'
import {
fetchVehicles,
fetchVehicleLocations,
type ApiVehicleItem,
type ApiVehicleLocation,
} from '../features/vehicles/api'
import { fetchActiveAssignment } from '../features/pickups/api'

export default function VehicleTracking() {
const [vehicles, setVehicles] = useState<ApiVehicleItem[]>([])
const [selectedId, setSelectedId] = useState('')
const [locations, setLocations] = useState<ApiVehicleLocation[]>([])
const [assignmentName, setAssignmentName] = useState<string | null>(null)
const [loadingVehicles, setLoadingVehicles] = useState(true)
const [loadingLocation, setLoadingLocation] = useState(false)
const [error, setError] = useState('')
const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedId)
const latestLocation = locations[0]

const loadVehicles = useCallback(async () => {
try {
setError('')
const result = await fetchVehicles({ limit: 100 })
setVehicles(result.items)


  setSelectedId((current) => {
    if (current && result.items.some((vehicle) => vehicle.id === current)) {
      return current
    }

    return result.items[0]?.id ?? ''
  })
} catch (err) {
  setError(err instanceof Error ? err.message : 'Could not load vehicles.')
} finally {
  setLoadingVehicles(false)
}

}, [])

const loadLocations = useCallback(async (vehicleId: string) => {
if (!vehicleId) {
setLocations([])
setAssignmentName(null)
return
}


setLoadingLocation(true)

try {
  const [locationResult, vehicle] = await Promise.all([
    fetchVehicleLocations(vehicleId),
    Promise.resolve(vehicles.find((item) => item.id === vehicleId)),
  ])

  const activeLocations = locationResult.items
    .filter((item) => new Date(item.expiresAt).getTime() > Date.now())
    .sort(
      (a, b) =>
        new Date(b.recordedAt).getTime() -
        new Date(a.recordedAt).getTime(),
    )

  setLocations(activeLocations)
  setLastRefresh(new Date())

  if (vehicle?.currentAssignment?.pickupId) {
    try {
      const assignment = await fetchActiveAssignment(
        vehicle.currentAssignment.pickupId,
      )

      setAssignmentName(
        assignment
          ? `Pickup ${assignment.pickupId}`
          : 'No active pickup',
      )
    } catch {
      setAssignmentName('Assignment details unavailable')
    }
  } else {
    setAssignmentName('No active pickup')
  }
} catch (err) {
  setError(
    err instanceof Error
      ? err.message
      : 'Could not retrieve vehicle locations.',
  )
  setLocations([])
} finally {
  setLoadingLocation(false)
}


}, [vehicles])

useEffect(() => {
void loadVehicles()
}, [loadVehicles])

useEffect(() => {
if (!selectedId) {
setLocations([])
setAssignmentName(null)
return
}

void loadLocations(selectedId)

const timer = window.setInterval(() => {
  void loadLocations(selectedId)
}, 15000)

return () => window.clearInterval(timer)


}, [selectedId, loadLocations])

const mapUrl = latestLocation
? `https://www.openstreetmap.org/export/embed.html?bbox=${latestLocation.longitude - 0.01}%2C${latestLocation.latitude - 0.01}%2C${latestLocation.longitude + 0.01}%2C${latestLocation.latitude + 0.01}&layer=mapnik&marker=${latestLocation.latitude}%2C${latestLocation.longitude}`
: ''

return ( <div className="tracking-page">
<div style={{ marginBottom: 24 }}>
<h1 style={{ margin: 0, fontSize: 28 }}>Vehicle Tracking</h1>
<p style={{ color: '#667085', marginTop: 8 }}>
Monitor assigned vehicles using their latest reported GPS locations. </p> </div>

```
  {error && (
    <div
      role="alert"
      style={{
        padding: 14,
        marginBottom: 16,
        borderRadius: 10,
        color: '#b42318',
        background: '#fef3f2',
      }}
    >
      {error}
    </div>
  )}

  <div style={summaryGridStyle}>
    <SummaryCard
      title="Registered vehicles"
      value={loadingVehicles ? '…' : String(vehicles.length)}
      detail="Vehicles returned by the backend"
    />
    <SummaryCard
      title="Reporting location"
      value={
        latestLocation &&
        Date.now() - new Date(latestLocation.recordedAt).getTime() <
          2 * 60 * 1000
          ? 'Recently updated'
          : 'No recent location'
      }
      detail="Based on the selected vehicle"
    />
    <SummaryCard
      title="Refresh interval"
      value="15 seconds"
      detail={
        lastRefresh
          ? `Last checked ${lastRefresh.toLocaleTimeString()}`
          : 'Waiting for first check'
      }
    />
  </div>

  <section style={{ ...cardStyle, marginBottom: 20 }}>
    <label
      htmlFor="tracking-vehicle"
      style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}
    >
      Select vehicle
    </label>

    <select
      id="tracking-vehicle"
      value={selectedId}
      onChange={(event) => setSelectedId(event.target.value)}
      disabled={loadingVehicles || vehicles.length === 0}
      style={selectStyle}
    >
      {vehicles.length === 0 && <option value="">No vehicles available</option>}
      {vehicles.map((vehicle) => (
        <option key={vehicle.id} value={vehicle.id}>
          {vehicle.registrationNumber} — {vehicle.kind}
        </option>
      ))}
    </select>

    {selectedVehicle && (
      <div style={vehicleInfoGridStyle}>
        <InfoItem
          label="Vehicle status"
          value={selectedVehicle.status}
        />
        <InfoItem
          label="Driver"
          value={selectedVehicle.currentDriver?.name ?? 'Not assigned'}
        />
        <InfoItem
          label="Pickup"
          value={assignmentName ?? 'Checking assignment…'}
        />
        <InfoItem
          label="Assignment status"
          value={selectedVehicle.currentAssignment?.status ?? 'Unassigned'}
        />
      </div>
    )}
  </section>

  <div className="tracking-grid">
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Vehicle location map</h2>

      {loadingLocation && !latestLocation ? (
        <MapMessage message="Loading the latest vehicle location…" />
      ) : latestLocation ? (
        <iframe
          title="Selected vehicle location map"
          src={mapUrl}
          style={{
            width: '100%',
            height: 430,
            border: 0,
            borderRadius: 12,
          }}
          loading="lazy"
        />
      ) : (
        <MapMessage
          message={
            selectedId
              ? 'No unexpired GPS location has been reported for this vehicle yet.'
              : 'Add a vehicle in the Vehicles dashboard to begin.'
          }
        />
      )}
    </section>

    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Location details</h2>

      <InfoItem
        label="Latitude"
        value={latestLocation?.latitude.toFixed(6) ?? '—'}
      />
      <InfoItem
        label="Longitude"
        value={latestLocation?.longitude.toFixed(6) ?? '—'}
      />
      <InfoItem
        label="Last reported"
        value={
          latestLocation
            ? new Date(latestLocation.recordedAt).toLocaleString()
            : 'No location received'
        }
      />
      <InfoItem
        label="Location expires"
        value={
          latestLocation
            ? new Date(latestLocation.expiresAt).toLocaleString()
            : '—'
        }
      />

      <button
        type="button"
        style={buttonStyle}
        disabled={!selectedId || loadingLocation}
        onClick={() => void loadLocations(selectedId)}
      >
        {loadingLocation ? 'Refreshing…' : 'Refresh location'}
      </button>

      <p style={{ color: '#667085', fontSize: 13, lineHeight: 1.5 }}>
        Locations are retrieved from the backend. This page does not
        generate GPS coordinates or start tracking on a driver's device.
      </p>
    </section>
  </div>
</div>


)
}

function SummaryCard({
title,
value,
detail,
}: {
title: string
value: string
detail: string
}) {
return ( <div style={cardStyle}>
<small style={{ color: '#667085' }}>{title}</small>
<h2 style={{ margin: '12px 0' }}>{value}</h2>
<span style={{ color: '#667085', fontSize: 13 }}>{detail}</span> </div>
)
}

function InfoItem({ label, value }: { label: string; value: string }) {
return ( <div style={detailStyle}>
<span style={{ color: '#667085' }}>{label}</span>
<strong style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>
{value} </strong> </div>
)
}

function MapMessage({ message }: { message: string }) {
return (
<div
style={{
height: 430,
padding: 24,
boxSizing: 'border-box',
borderRadius: 12,
background: '#f2f4f7',
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
textAlign: 'center',
color: '#667085',
}}
>
{message} </div>
)
}

const cardStyle: React.CSSProperties = {
background: 'white',
border: '1px solid #e4e7ec',
borderRadius: 14,
padding: 20,
boxShadow: '0 2px 8px rgba(16, 24, 40, 0.05)',
}

const detailStyle: React.CSSProperties = {
display: 'flex',
justifyContent: 'space-between',
alignItems: 'flex-start',
gap: 16,
padding: '14px 0',
borderBottom: '1px solid #eaecf0',
}

const summaryGridStyle: React.CSSProperties = {
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
gap: 16,
marginBottom: 20,
}

const vehicleInfoGridStyle: React.CSSProperties = {
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
gap: 16,
marginTop: 20,
}

const selectStyle: React.CSSProperties = {
width: '100%',
maxWidth: 520,
padding: 12,
borderRadius: 8,
border: '1px solid #d0d5dd',
background: 'white',
fontSize: 15,
}

const buttonStyle: React.CSSProperties = {
width: '100%',
marginTop: 24,
padding: 13,
border: 0,
borderRadius: 9,
background: '#16803c',
color: 'white',
fontWeight: 600,
cursor: 'pointer',
}
