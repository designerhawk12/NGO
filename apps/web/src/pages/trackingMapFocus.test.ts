import { describe, expect, it, vi } from 'vitest'
import { selectTrackedVehicle, updateTrackingMap } from './trackingMapFocus'
describe('vehicle map focus', () => {
  const setup = () => ({map:{setView:vi.fn()},marker:{setLatLng:vi.fn(),addTo:vi.fn(),remove:vi.fn()}})
  it('initially selects a vehicle with GPS, while preserving an explicit no-GPS selection',()=>{
    const fleet=[{id:'A',latitude:null,longitude:null},{id:'B',latitude:12,longitude:77}] as never
    expect(selectTrackedVehicle(fleet,'')).toBe('B');expect(selectTrackedVehicle(fleet,'A')).toBe('A')
    expect(selectTrackedVehicle([], 'gone')).toBe('')
  })
  it('waits for the first valid fix then focuses at street zoom',()=>{
    const {map,marker}=setup();let s={selected:'',focused:false}
    s=updateTrackingMap(map,marker as never,s,'A',null,null);expect(map.setView).not.toHaveBeenCalled()
    s=updateTrackingMap(map,marker as never,s,'A',12.9,77.6);expect(map.setView).toHaveBeenCalledWith([12.9,77.6],17);expect(s.focused).toBe(true)
  })
  it('updates the marker without resetting user zoom/pan during polling',()=>{
    const {map,marker}=setup();const s=updateTrackingMap(map,marker as never,{selected:'',focused:false},'A',12,77)
    map.setView.mockClear();updateTrackingMap(map,marker as never,s,'A',12.001,77.001)
    expect(map.setView).not.toHaveBeenCalled();expect(marker.setLatLng).toHaveBeenLastCalledWith([12.001,77.001])
  })
  it('refocuses on selection changes including switching through a vehicle with no GPS',()=>{
    const {map,marker}=setup();let s=updateTrackingMap(map,marker as never,{selected:'',focused:false},'A',12,77)
    s=updateTrackingMap(map,marker as never,s,'B',13,78);expect(map.setView).toHaveBeenLastCalledWith([13,78],17)
    s=updateTrackingMap(map,marker as never,s,'C',null,null);expect(marker.remove).toHaveBeenCalledOnce()
    updateTrackingMap(map,marker as never,s,'B',13,78);expect(map.setView).toHaveBeenCalledTimes(3)
  })
  it.each([[NaN,77],[91,77],[12,181],[12,null]])('safely removes invalid/no-fix marker (%s,%s)',(lat,lon)=>{
    const {map,marker}=setup();updateTrackingMap(map,marker as never,{selected:'',focused:false},'A',lat,lon)
    expect(marker.remove).toHaveBeenCalledOnce();expect(map.setView).not.toHaveBeenCalled()
  })
})
