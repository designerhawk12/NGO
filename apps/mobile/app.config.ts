import type { ConfigContext, ExpoConfig } from 'expo/config';
import { existsSync, readFileSync } from 'node:fs';

/** Bind App Links to this build's existing public web origin (preview or production). */
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PROFILE === 'preview') {
    if (!googleServicesFile || !existsSync(googleServicesFile)) {
      throw new Error('Preview Android build requires the GOOGLE_SERVICES_JSON file variable.');
    }
    let clients: unknown;
    try { clients = JSON.parse(readFileSync(googleServicesFile, 'utf8')).client; }
    catch { throw new Error('Preview Android Firebase client configuration is invalid.'); }
    if (!Array.isArray(clients) || !clients.some(client => client?.client_info?.android_client_info?.package_name === config.android?.package)) {
      throw new Error('Preview Android Firebase package does not match the application ID.');
    }
  }
  const raw = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://ngo-eight-umber.vercel.app';
  let origin: URL;
  try { origin = new URL(raw); }
  catch { throw new Error('EXPO_PUBLIC_WEB_BASE_URL must be an HTTPS origin.'); }
  if (origin.protocol !== 'https:' || origin.origin !== raw || origin.username || origin.password) {
    throw new Error('EXPO_PUBLIC_WEB_BASE_URL must be an HTTPS origin without credentials, path or parameters.');
  }
  return {
    ...config,
    name: config.name ?? 'AaharaConnect',
    slug: config.slug ?? 'aaharaconnect-mobile',
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      intentFilters: [{ action: 'VIEW', autoVerify: true, data: [{ scheme: 'https', host: origin.hostname, pathPrefix: '/open/' }], category: ['BROWSABLE', 'DEFAULT'] }],
    },
  };
}
