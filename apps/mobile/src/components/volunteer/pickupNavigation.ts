export function pickupNavigationUrl(address: string): string | null {
  const destination = address.trim();
  return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving` : null;
}

export function pickupSearchUrl(address: string): string | null {
  const destination = address.trim();
  return destination ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` : null;
}
