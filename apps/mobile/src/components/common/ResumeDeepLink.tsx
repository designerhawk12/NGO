import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { PENDING_LINK, parseAppLink, linkRole, linkDestination } from '../../api/deepLinks';
export default function ResumeDeepLink() {
  const { role, mode } = useApp();
  useEffect(() => {
    if (!role || mode !== 'live') return;
    let active = true;
    void (async () => {
      const raw = await AsyncStorage.getItem(PENDING_LINK);
      if (!raw || !active) return;
      try {
        const value = JSON.parse(raw);
        const link = parseAppLink(value.kind,value.id);
        if (link && linkRole(link) === role) { await AsyncStorage.removeItem(PENDING_LINK); if(active) router.replace(linkDestination(link) as Href); }
      } catch { await AsyncStorage.removeItem(PENDING_LINK); }
    })();
    return () => { active = false; };
  }, [role,mode]);
  return null;
}
