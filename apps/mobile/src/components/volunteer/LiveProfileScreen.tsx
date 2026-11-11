import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import ProfilePhoto from '../common/ProfilePhoto';
import { Button, Card, Field, Header, InfoRow, LanguageSwitcher, Screen, Sheet, T } from '../common/UI';
import { C } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { useVolunteerData } from '../../context/VolunteerDataContext';
import { listOwnVolunteerTeams, type OwnVolunteerTeam } from '../../api/volunteers';
import { LiveTeamMembership } from './LiveTeamMembership';

export function LiveProfileScreen() {
  const app = useApp();
  const { profile, profileLoading, profileError, refreshProfile, updateProfile } = useVolunteerData();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [teams, setTeams] = useState<OwnVolunteerTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const refreshTeams = useCallback(async () => {
    setTeams([]); setTeamsLoading(true); setTeamsError(null);
    try { setTeams(await listOwnVolunteerTeams()); }
    catch { setTeamsError('Could not load your team membership.'); }
    finally { setTeamsLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void listOwnVolunteerTeams()
      .then(items => { if (active) setTeams(items); })
      .catch(() => { if (active) setTeamsError('Could not load your team membership.'); })
      .finally(() => { if (active) setTeamsLoading(false); });
    return () => { active = false; };
  }, []);
  const beginEdit = () => {
    if (!profile) return;
    setName(profile.name); setPhone(profile.phoneE164 ?? ''); setFormError(null); setEditing(true);
  };
  const save = async () => {
    if (!name.trim()) { setFormError('Name is required.'); return; }
    if (profile?.phoneE164 && !phone.trim()) { setFormError('Phone number cannot be cleared here.'); return; }
    if (phone.trim() && !/^\+[1-9][0-9]{7,14}$/.test(phone.trim())) { setFormError('Use a phone number with country code, for example +919876543210.'); return; }
    setSaving(true); setFormError(null);
    try {
      await updateProfile({ name: name.trim(), ...(phone.trim() ? { phoneE164: phone.trim() } : {}) });
      setEditing(false); app.notify('Profile updated');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not save profile.'); }
    finally { setSaving(false); }
  };
  return <Screen><Header title="Profile" right={<LanguageSwitcher />} />
    {profileLoading ? <Card><T>Loading profile...</T></Card> : profileError ? <Card><T color={C.red}>{profileError}</T><Button title="Retry" onPress={() => void refreshProfile()} variant="outline" style={{ marginTop: 14 }} /></Card> : !profile ? <Card><T>No volunteer profile found.</T><Button title="Retry" onPress={() => void refreshProfile()} variant="outline" style={{ marginTop: 14 }} /></Card> : <>
      <Card style={{ alignItems: 'center', marginBottom: 18, paddingVertical: 23 }}><ProfilePhoto iconName="person" /><T size={22} weight="800" color={C.ink} translate={false}>{profile.name}</T><T color={C.muted}>Food Rescue Volunteer</T></Card>
      <T size={20} weight="700" color={C.ink} style={{ marginBottom: 11 }}>Personal information</T>
      <Card style={{ marginBottom: 18 }}><InfoRow icon="person" label="Name" value={profile.name} /><InfoRow icon="phone" label="Phone number" value={profile.phoneE164 ?? '—'} /><InfoRow icon="shield" label="Registration number" value={profile.registrationCode} /><Button title="Edit profile" icon="edit" variant="outline" onPress={beginEdit} style={{ marginTop: 10 }} /></Card>
    </>}
    <LiveTeamMembership teams={teams} loading={teamsLoading} error={teamsError} onRefresh={() => void refreshTeams()} />
    <T size={20} weight="700" color={C.ink} style={{ marginTop: 18, marginBottom: 11 }}>Settings</T><Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><T weight="600">Language</T><LanguageSwitcher /></View></Card>
    <Button title="Log out" icon="logout" variant="outline" onPress={() => { app.logout(); router.replace('/'); }} />
    <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit profile">
      <Field label="Name" value={name} onChangeText={setName} required /><Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+919876543210" />
      {!!formError && <T color={C.red} style={{ marginBottom: 12 }}>{formError}</T>}
      <Button title="Save changes" onPress={() => void save()} loading={saving} /><Button title="Cancel" variant="quiet" onPress={() => setEditing(false)} style={{ marginTop: 6 }} />
    </Sheet>
  </Screen>;
}
