import React, { useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { IdentityProofInput } from '@aaharaconnect/shared';
import { Button, T } from './UI';
import { C } from '../../constants/theme';

export type IdentityProofDraft = Omit<IdentityProofInput, 'consent'> & { consent: boolean };
export default function IdentityProofPicker({ value, onChange }: { value: IdentityProofDraft | null; onChange: (proof: IdentityProofDraft | null) => void }) {
  const [type, setType] = useState<IdentityProofInput['documentType']>('PAN');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const choose = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true, exif: false });
      const asset = !result.canceled && result.assets[0];
      if (!asset || !asset.base64) return;
      // Classify the encoded payload, which can differ from the source URI's MIME type.
      const contentType = asset.base64.startsWith('/9j/') ? 'image/jpeg'
        : asset.base64.startsWith('iVBORw0KGgo') ? 'image/png' : null;
      if (asset.base64.length > 666668 || !contentType) { setError('Use a JPEG or PNG image smaller than 500 KB.'); return; }
      setError(''); setPreview(asset.uri);
      onChange({ documentType: type, contentType, dataBase64: asset.base64, consent: false, maskedAadhaarConfirmed: false });
    } catch { setError('Could not open the image picker. Try again.'); }
  };
  return <View style={{ marginVertical: 12 }}>
    <T weight="700">Identity proof</T>
    <T size={13} color={C.muted}>Choose PAN, driving licence or masked Aadhaar. For Aadhaar, obscure the first eight digits before selecting the image. Never upload full Aadhaar or biometric data. A licence upload does not authorize driving NGO vehicles.</T>
    {(['PAN','DRIVING_LICENCE','MASKED_AADHAAR'] as const).map(kind => <Button key={kind} title={kind.replaceAll('_',' ')} variant={type === kind ? 'green' : 'outline'} onPress={() => { setType(kind); onChange(null); setPreview(null); }} style={{ marginTop: 6 }} />)}
    <Button title={value ? 'Replace identity image' : 'Choose identity image'} variant="outline" onPress={() => void choose()} style={{ marginTop: 8 }} />
    {preview && <Image source={{ uri: preview }} accessibilityLabel="Identity proof preview" style={{ width: '100%', height: 180, resizeMode: 'contain', marginTop: 8 }} />}
    {value && <Button title="Remove identity image" variant="quiet" onPress={() => { onChange(null); setPreview(null); }} />}
    {value?.documentType === 'MASKED_AADHAAR' && <Button title={value.maskedAadhaarConfirmed ? '✓ First eight Aadhaar digits are masked' : 'Confirm first eight Aadhaar digits are masked'} variant="outline" onPress={() => onChange({ ...value, maskedAadhaarConfirmed: !value.maskedAadhaarConfirmed })} />}
    <T size={12} color={C.muted}>Your proof is stored privately for manual NGO identity review. Only authorized Admins may view it. Do not include unnecessary document details. Contact the NGO with questions about retention or deletion before consenting.</T>
    {value && <Button title={value.consent ? '✓ I consent to identity-proof processing' : 'I consent to identity-proof processing'} variant="outline" onPress={() => onChange({ ...value, consent: !value.consent })} />}
    {!!error && <T color={C.red}>{error}</T>}
  </View>;
}
