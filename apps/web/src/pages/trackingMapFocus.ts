import type { Map, Marker } from 'leaflet'
import type { FleetLocation } from '@aaharaconnect/shared'

export function hasTrackingPoint(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  return latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}
export function selectTrackedVehicle(fleet: FleetLocation[], current: string): string {
  return fleet.some(item => item.id === current) ? current
    : (fleet.find(item => hasTrackingPoint(item.latitude,item.longitude)) ?? fleet[0])?.id ?? ''
}

export type TrackingFocus = { selected: string; focused: boolean }
export function updateTrackingMap(map: Pick<Map, 'setView'>, marker: Pick<Marker, 'remove' | 'setLatLng' | 'addTo'>,
  previous: TrackingFocus, selected: string, latitude: number | null | undefined, longitude: number | null | undefined): TrackingFocus {
  const state = previous.selected === selected ? previous : { selected, focused: false }
  if (latitude == null || longitude == null || !hasTrackingPoint(latitude,longitude)) {
    marker.remove()
    return state
  }
  const point: [number, number] = [latitude, longitude]
  marker.setLatLng(point)
  marker.addTo(map as Map)
  if (!state.focused) map.setView(point, 17)
  return { selected, focused: true }
}
