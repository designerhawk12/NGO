import { getCurrentAccessToken } from './auth';
import { apiRequest } from './client';

async function authorization() {
  return { Authorization: `Bearer ${await getCurrentAccessToken()}` };
}

/** Signed, short-lived URL of the signed-in user's photo, or null when none was uploaded. */
export async function getOwnProfilePhotoUrl(): Promise<string | null> {
  const result = await apiRequest<{ photoUrl: string | null }>('profile-photos/me', { headers: await authorization() });
  return result.photoUrl;
}

export async function uploadOwnProfilePhoto(input: { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; dataBase64: string }): Promise<string | null> {
  const result = await apiRequest<{ photoUrl: string | null }>('profile-photos/me', {
    method: 'PUT', headers: await authorization(), body: input,
  });
  return result.photoUrl;
}

export function photoErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'PHOTO_TOO_LARGE': return 'That picture is too large. Choose a smaller one.';
    case 'PHOTO_TYPE_UNSUPPORTED': return 'Use a JPEG, PNG or WebP picture.';
    case 'PHOTO_STORAGE_UNAVAILABLE': return 'Photo storage is unavailable right now. Try again shortly.';
    case 'NETWORK_ERROR': return 'Could not reach the server. Check your connection and try again.';
    default: return 'Could not save the picture. Try again.';
  }
}
