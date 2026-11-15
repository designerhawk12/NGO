import React from 'react';
import '../components/tracking/driverTracking';
import ResumeDeepLink from '../components/common/ResumeDeepLink';
import PushLifecycle from '../components/common/PushLifecycle';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../context/AppContext';
import { LanguageProvider } from '../context/LanguageContext';
import { C } from '../constants/theme';
export { ErrorBoundary } from 'expo-router';
export default function RootLayout() {
  return <LanguageProvider><AppProvider><ResumeDeepLink /><PushLifecycle /><StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
  </AppProvider></LanguageProvider>;
}
