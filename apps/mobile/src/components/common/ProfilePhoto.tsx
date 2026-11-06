import React, { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ApiClientError } from '../../api/client';
import { getOwnProfilePhotoUrl, photoErrorMessage, uploadOwnProfilePhoto } from '../../api/profilePhoto';
import { C } from '../../constants/theme';
import { Button, Icon, T } from './UI';

type Props = { iconName: string };

/**
 * Profile picture with "Add / Change Profile Photo". The picture is stored by the API in private
 * storage and shown again after logout/login or an app restart; only the Photos picker is used
 * (no camera, no broad storage permission).
 */
export default function ProfilePhoto({ iconName }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ uri: string; base64: string; contentType: 'image/jpeg' | 'image/png' | 'image/webp' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let active = true;
    void getOwnProfilePhotoUrl().then(url => { if (active) setUri(url); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const choose = useCallback(async () => {
    setMessage(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true, exif: false,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    const mime = (asset.mimeType ?? 'image/jpeg').toLowerCase();
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') { setMessage(photoErrorMessage('PHOTO_TYPE_UNSUPPORTED')); return; }
    setPreview({ uri: asset.uri, base64: asset.base64!, contentType: mime });
  }, []);

  const save = useCallback(async () => {
    if (!preview || busy) return;
    setBusy(true); setMessage(null);
    try {
      const url = await uploadOwnProfilePhoto({ contentType: preview.contentType, dataBase64: preview.base64 });
      setUri(url ?? preview.uri); setBroken(false); setPreview(null); setMessage('Profile photo saved.');
    } catch (cause) {
      setMessage(photoErrorMessage(cause instanceof ApiClientError ? (cause.status === 400 ? 'PHOTO_TOO_LARGE' : cause.code) : undefined));
    } finally { setBusy(false); }
  }, [busy, preview]);

  const shown = preview?.uri ?? (broken ? null : uri);
  return <View style={{ alignItems: 'center', marginBottom: 6 }}>
    <View style={{ width: 96, height: 96, borderRadius: 32, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10 }}>
      {shown
        ? <Image source={{ uri: shown }} accessibilityLabel="Profile photo" style={{ width: 96, height: 96 }} onError={() => setBroken(true)} />
        : <Icon name={iconName} size={40} />}
    </View>
    {preview
      ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Save photo" onPress={() => void save()} loading={busy} disabled={busy} />
        <Button title="Cancel" variant="outline" onPress={() => { setPreview(null); setMessage(null); }} disabled={busy} />
      </View>
      : <Button title={uri ? 'Change Profile Photo' : 'Add Profile Photo'} variant="outline" onPress={() => void choose()} />}
    {message && <T size={13} color={message === 'Profile photo saved.' ? C.green : C.red} style={{ marginTop: 6, textAlign: 'center' }}>{message}</T>}
  </View>;
}
