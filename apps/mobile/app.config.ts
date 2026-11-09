import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Bind App Links to this build's existing public web origin (preview or production). */
export default function appConfig({ config }: ConfigContext): ExpoConfig {
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
      intentFilters: [{ action: 'VIEW', autoVerify: true, data: [{ scheme: 'https', host: origin.hostname, pathPrefix: '/open/' }], category: ['BROWSABLE', 'DEFAULT'] }],
    },
  };
}
