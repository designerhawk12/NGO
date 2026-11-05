import React, { useCallback, useEffect, useState } from 'react';
import type { DriverSelfProfile } from '@aaharaconnect/shared';
import { View } from 'react-native';
import { router } from 'expo-router';
import { getOwnDriverProfile } from '../../api/driver';
import { Button, Card, Header, Icon, InfoRow, LanguageSwitcher, Screen, T } from '../common/UI';
import { C } from '../../constants/theme';
import { useApp } from '../../context/AppContext';

export default function DriverProfile() {
  const app = useApp();
  const [profile, setProfile] = useState<DriverSelfProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setProfile(await getOwnDriverProfile()); }
    catch { setError('Could not load your driver profile. Check your connection and retry.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [refresh]);

  return <Screen><Header title="Profile" right={<LanguageSwitcher />} />
    {loading ? <Card><T>Loading profile...</T></Card>
      : error || !profile ? <Card><T color={C.red}>{error ?? 'No driver profile found.'}</T><Button title="Retry" variant="outline" onPress={() => void refresh()} style={{ marginTop: 12 }} /></Card>
        : <>
          <Card style={{ alignItems: 'center', marginBottom: 18, paddingVertical: 23 }}>
            <View style={{ width: 66, height: 66, borderRadius: 22, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}><Icon name="truck" size={33} /></View>
            <T size={22} weight="800" color={C.ink} translate={false}>{profile.name}</T>
            <T color={C.muted}>NGO Driver</T>
          </Card>
          <T size={20} weight="700" color={C.ink} style={{ marginBottom: 11 }}>Your vehicle</T>
          <Card style={{ marginBottom: 18 }}>
            {profile.vehicle ? <>
              <InfoRow icon="truck" label="Registration number" value={profile.vehicle.registrationNumber} />
              <InfoRow icon="truck" label="Vehicle type" value={profile.vehicle.kind} />
              <InfoRow icon="food" label="Payload capacity" value={`${profile.vehicle.capacityKg} kg`} />
              <T size={13} color={C.muted} style={{ marginTop: 6 }}>This vehicle is permanently assigned to you by the NGO.</T>
            </> : <T color={C.muted}>No vehicle is linked. Contact the NGO administrator.</T>}
          </Card>
          <T size={20} weight="700" color={C.ink} style={{ marginBottom: 11 }}>Driver details</T>
          <Card style={{ marginBottom: 18 }}>
            <InfoRow icon="phone" label="Phone number" value={profile.phone || '—'} />
            {profile.employeeCode && <InfoRow icon="shield" label="Employee ID" value={profile.employeeCode} />}
            <InfoRow icon="shield" label="Driving licence" value={`${profile.licenceNumber} · ${profile.licenceExpired ? 'expired' : 'valid until'} ${profile.licenceExpiresOn}`} />
            <InfoRow icon="person" label="Status" value={profile.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
          </Card>
        </>}
    <Button title="Log out" icon="logout" variant="outline" onPress={() => { app.logout(); router.replace('/'); }} />
  </Screen>;
}
