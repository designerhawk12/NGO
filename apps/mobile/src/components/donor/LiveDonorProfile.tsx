import React, { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import type { AppUser } from '@aaharaconnect/shared';
import { View } from 'react-native';
import { getCurrentAccessToken, getCurrentAppUser } from '../../api/auth';
import ProfilePhoto from '../common/ProfilePhoto';
import WhatsAppPreferences from '../common/WhatsAppPreferences';
import { Button, Card, Header, LanguageSwitcher, Screen, T } from '../common/UI';
import { C } from '../../constants/theme';
import { useApp } from '../../context/AppContext';

export default function LiveDonorProfile() {
  const app = useApp();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await getCurrentAppUser(await getCurrentAccessToken());
      if (result.role !== 'DONOR') throw new Error('Role mismatch');
      setUser(result);
    } catch {
      setUser(null);
      setError('Could not load your account. Check your connection and retry.');
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [refresh]));
  return <Screen>
    <Header title="Profile" right={<LanguageSwitcher />} />
    <WhatsAppPreferences />
    {loading ? <T>Loading profile...</T>
      : error ? <Card><T color={C.red}>{error}</T><Button title="Retry" variant="outline" onPress={() => void refresh()} /></Card>
        : <Card style={{ alignItems: 'center', marginBottom: 18, paddingVertical: 23 }}>
          <ProfilePhoto iconName="person" />
          <T size={22} weight="800" color={C.ink} translate={false}>{user?.displayName || 'Donor'}</T>
          <T color={C.muted}>Food Donor</T>
        </Card>}
    <Card style={{ marginTop: 18, marginBottom: 18 }}>
      <T color={C.muted}>Contact details are saved with each food request.</T>
    </Card>
    <T size={20} weight="700" color={C.ink} style={{ marginBottom: 11 }}>Settings</T>
    <Card style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T weight="600">Language</T><LanguageSwitcher />
      </View>
    </Card>
    <Button title="Log out" icon="logout" variant="outline" onPress={() => { app.logout(); router.replace('/'); }} />
  </Screen>;
}
