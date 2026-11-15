import { Router } from 'express';
import { sendSuccess } from '../../utils/response';

export const releaseRoutes = Router();
export function androidRelease() {
  const { ANDROID_RELEASE_URL: url, ANDROID_RELEASE_VERSION: version, ANDROID_RELEASE_BUILD_ID: buildId, ANDROID_RELEASE_SHA256: sha256 } = process.env;
  const pending = { available: false, packageId: 'com.rajashishpatil10.aaharaconnect' };
  if (process.env.ANDROID_RELEASE_APPROVED !== 'true' || !url || !version || !buildId || !sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) return pending;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.search || parsed.hash || parsed.username || parsed.password) return pending;
    const expoArtifact = parsed.origin === 'https://expo.dev' && /^\/artifacts\/eas\/[A-Za-z0-9_-]+\.apk$/.test(parsed.pathname);
    const hostedRelease = parsed.origin === new URL(process.env.SUPABASE_URL ?? '').origin && parsed.pathname.startsWith('/storage/v1/object/public/mobile-releases/') && parsed.pathname.endsWith('.apk');
    if (!expoArtifact && !hostedRelease) return pending;
    return { ...pending, available: true, version, buildId, sha256, url };
  } catch { return pending; }
}
releaseRoutes.get('/android', (_req,res) => {
  res.setHeader('Cache-Control','no-store');
  const { url: _url, ...release } = androidRelease() as ReturnType<typeof androidRelease> & { url?: string };
  sendSuccess(res,release);
});
releaseRoutes.get('/android/download', (_req,res) => {
  res.setHeader('Cache-Control','no-store');
  const release = androidRelease();
  if (!release.available || !('url' in release) || !release.url) { res.status(503).json({ success:false,error:{code:'APK_AWAITING_VERIFICATION',message:'The Android release is awaiting verification.'} }); return; }
  res.redirect(302,release.url);
});
releaseRoutes.get('/android/assetlinks', (_req,res) => {
  const fingerprint=process.env.ANDROID_SIGNING_CERT_SHA256;
  if (!fingerprint || !/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/i.test(fingerprint)) { res.status(404).json([]); return; }
  res.json([{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:'com.rajashishpatil10.aaharaconnect',sha256_cert_fingerprints:[fingerprint.toUpperCase()]}}]);
});
