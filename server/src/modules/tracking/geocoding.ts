import { getPool } from '../../db/pool';
export const locationCell = (latitude: number,longitude: number) => `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
/** Optional locality-only approximation. Persisted fleet-wide rate gate and 24-hour cache. */
export async function cacheLocality(latitude: number,longitude: number) {
  if(process.env.TRACKING_GEOCODING_ENABLED !== 'true' || !process.env.TRACKING_GEOCODER_CONTACT) return;
  try {
    const cell=locationCell(latitude,longitude);
    const cached=await getPool().query('SELECT cell FROM app.tracking_geocode_cache WHERE cell=$1 AND expires_at>now()',[cell]);
    if(cached.rows[0])return;
    const rate=await getPool().query("UPDATE app.tracking_geocode_rate SET next_lookup_at=now()+interval '1.1 seconds' WHERE id=1 AND next_lookup_at<=now() RETURNING id");
    if(!rate.rows[0])return;
    const [lat,lon]=cell.split(',');
    const response=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`,{headers:{'User-Agent':`AaharaConnect/1.0 (${process.env.TRACKING_GEOCODER_CONTACT})`},signal:AbortSignal.timeout(3000)});
    if(!response.ok)return;
    const data=await response.json() as {address?:Record<string,string>};
    const a=data.address??{};
    const locality=[a.suburb??a.village??a.town,a.city??a.county,a.state].filter(Boolean).join(', ').slice(0,200);
    if(!locality)return;
    await getPool().query("INSERT INTO app.tracking_geocode_cache(cell,locality,expires_at) VALUES($1,$2,now()+interval '1 day') ON CONFLICT(cell) DO UPDATE SET locality=$2,expires_at=now()+interval '1 day'",[cell,locality]);
    await getPool().query('DELETE FROM app.tracking_geocode_cache WHERE expires_at<now()');
  }catch{/* Location acceptance never depends on geocoding availability. */}
}
