import React, { useEffect, useMemo } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../../context/AppContext';
import { PENDING_LINK, parseAppLink, linkRole, linkDestination } from '../../../api/deepLinks';
import { Screen, Header, T } from '../../../components/common/UI';
import type { Href } from 'expo-router';
export default function OpenObjectLink() {
  const { kind,id } = useLocalSearchParams();
  const app = useApp();
  const link = useMemo(()=>parseAppLink(kind,id),[kind,id]);
  useEffect(() => {
    if (!link || app.role) return;
    void AsyncStorage.setItem(PENDING_LINK,JSON.stringify(link)).then(() => router.replace((link.kind === 'donation' ? '/donor/login':'/volunteer/login') as Href));
  }, [link,app.role]);
  if (!link) return <Screen><Header title="Invalid link" /><T>This app link is invalid.</T></Screen>;
  if (app.role && (app.mode !== 'live' || app.role !== linkRole(link))) return <Screen><Header title="Sign in with the assigned account" /><T>This link requires the correct authenticated role. Sign out and use the account that owns this record.</T></Screen>;
  if (app.role && app.mode === 'live') return <Redirect href={linkDestination(link) as Href} />;
  return <Screen><Header title="Sign in to continue" /><T>Opening secure sign-in…</T></Screen>;
}
