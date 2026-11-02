import React from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Button, Card, Icon, LanguageSwitcher, Screen, T } from '../components/common/UI';
import { C } from '../constants/theme';
import { useApp } from '../context/AppContext';
export default function Welcome() {
  const { role, volunteerApplicationStatus } = useApp();
  if (role === 'volunteer') return <Redirect href="/volunteer/(tabs)/home" />;
  if (role === 'donor') return <Redirect href="/donor/(tabs)/home" />;
  return <Screen style={{ justifyContent: 'center' }}>
    <View style={{ alignItems: 'flex-end', marginBottom: 34 }}><LanguageSwitcher /></View>
    <View style={{ alignItems: 'center', marginBottom: 30 }}><View style={{ width: 70, height: 70, borderRadius: 21, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }}><Icon name="heart" size={35} color={C.white} /></View>
      <T size={30} weight="800" color={C.ink} translate={false}>AaharaConnect</T><T color={C.muted}>Food Rescue Network</T></View>
    <T size={23} weight="700" color={C.ink} style={{ marginBottom: 6 }}>Choose how to continue</T><T color={C.muted} style={{ marginBottom: 18 }}>Together, less food waste.</T>
    {volunteerApplicationStatus && <Card style={{ marginBottom: 14, borderColor: volunteerApplicationStatus === 'DENIED' ? C.red : C.orange }}>
      <T size={18} weight="700" color={volunteerApplicationStatus === 'DENIED' ? C.red : C.ink}>
        {volunteerApplicationStatus === 'DENIED' ? 'Volunteer application not approved' : 'Volunteer application pending approval'}
      </T>
      <T color={C.muted} style={{ marginTop: 6, marginBottom: 14 }}>
        {volunteerApplicationStatus === 'DENIED'
          ? 'Your account remains available, but Volunteer features are disabled. Contact the NGO administrator for help.'
          : 'Your application is under review. Check your email to finish setting your password; Volunteer features will open after approval.'}
      </T>
      <Button title="Sign in to check application status" onPress={() => router.push('/volunteer/login')} variant="outline" />
    </Card>}
    <Card style={{ marginBottom: 14, padding: 20 }}><View style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name="team" size={25} /></View>
      <T size={20} weight="700" color={C.ink}>Volunteer</T><T color={C.muted} style={{ marginTop: 5, marginBottom: 17 }}>Manage pickups, availability and your impact.</T>
      <Button title="Continue as volunteer" onPress={() => router.push('/volunteer/login')} icon="arrow" variant="green" /></Card>
    <Card style={{ padding: 20 }}><View style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: C.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name="food" size={25} color={C.blue} /></View>
      <T size={20} weight="700" color={C.ink}>Donor / Event Organizer</T><T color={C.muted} style={{ marginTop: 5, marginBottom: 17 }}>Share surplus food and track every pickup.</T>
      <Button title="Continue as donor" onPress={() => router.push('/donor/login')} icon="arrow" /></Card>
  </Screen>;
}
