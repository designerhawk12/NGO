import React from 'react';
import { Text } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Icon } from './UI';
import { C, font } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
export function TabLayout({ role }: { role: 'volunteer' | 'donor' | 'driver' }) {
  const app = useApp(); const { t, language } = useLanguage();
  if (app.role !== role) return <Redirect href="/" />;
  const tabs = role === 'driver'
    ? [{ name: 'jobs', title: 'My Jobs', icon: 'assignment' }, { name: 'history', title: 'History', icon: 'history' }, { name: 'profile', title: 'Profile', icon: 'person' }]
    : role === 'volunteer'
    ? [{ name: 'home', title: 'Home', icon: 'home' }, { name: 'assignments', title: 'Assignments', icon: 'assignment' }, { name: 'availability', title: 'Availability', icon: 'calendar' }, { name: 'history', title: 'History', icon: 'history' }, { name: 'profile', title: 'Profile', icon: 'person' }]
    : [{ name: 'home', title: 'Home', icon: 'home' }, { name: 'donate', title: 'Donate Food', icon: 'food' }, { name: 'requests', title: 'Requests', icon: 'assignment' }, { name: 'profile', title: 'Profile', icon: 'person' }];
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.green, tabBarInactiveTintColor: C.muted,
    tabBarStyle: { backgroundColor: C.white, borderTopColor: C.line, borderTopWidth: 1, height: 76, paddingTop: 7, paddingBottom: 8 } }}>
    {tabs.map(item => <Tabs.Screen key={item.name} name={item.name} options={{ title: t(item.title), tabBarIcon: ({ color }) => <Icon name={item.icon} color={color} size={22} />,
      tabBarLabel: ({ color }) => <Text numberOfLines={2} style={{ fontFamily: font, fontSize: 12, lineHeight: 14, fontWeight: '600', textAlign: 'center', color }}>
        {role === 'volunteer' && item.name === 'assignments' ? language === 'en' ? 'Assign\nments' : 'ನಿಯೋಜನೆ' : t(item.title)}
      </Text> }} />)}
  </Tabs>;
}
