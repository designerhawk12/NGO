import { PROFILE_PHOTO_MAX_BYTES } from '@aaharaconnect/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type NormalizedProfilePhoto = { uri: string; base64: string; contentType: 'image/jpeg' };

// Use the cropped URI, not a gallery MIME label or picker base64 (which may describe different formats).
// Native decoding applies the image orientation; every output is explicitly encoded as JPEG.
export async function normalizeProfilePhoto(uri: string): Promise<NormalizedProfilePhoto> {
  for (const [edge, compress] of [[1024, 0.85], [1024, 0.65], [768, 0.65], [512, 0.6]] as const) {
    const context = ImageManipulator.manipulate(uri);
    try {
      const original = await context.renderAsync();
      try {
        const scale = Math.min(1, edge / Math.max(original.width, original.height));
        context.resize({ width: Math.max(1, Math.round(original.width * scale)), height: Math.max(1, Math.round(original.height * scale)) });
        const rendered = await context.renderAsync();
        try {
          const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
          const base64 = result.base64;
          if (!base64?.startsWith('/9j/')) throw new Error('PHOTO_CONVERSION_FAILED');
          const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
          if (bytes <= PROFILE_PHOTO_MAX_BYTES) return { uri: result.uri, base64, contentType: 'image/jpeg' };
        } finally { rendered.release(); }
      } finally { original.release(); }
    } finally { context.release(); }
  }
  throw new Error('PHOTO_TOO_LARGE');
}
