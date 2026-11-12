import React, { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { DonorFoodRequest, listOwnFoodRequests } from '../../api/foodRequests';
import { Badge, Button, Card, Empty, Header, LanguageSwitcher, Screen, Segments, T } from '../common/UI';
import { C } from '../../constants/theme';
import NotificationBell from '../common/NotificationBell';

function outcome(item: DonorFoodRequest): string {
  if (item.status === 'CANCELLED') return 'Cancelled';
  if (item.pickup?.status === 'DELIVERED') return 'Completed';
  if (item.pickup?.status === 'FAILED') return 'Pickup Failed';
  if (item.pickup?.status === 'CANCELLED') return 'Pickup Cancelled';
  if (item.pickup?.status === 'EN_ROUTE' || item.pickup?.status === 'ARRIVED_AT_DONOR'
    || item.pickup?.status === 'FOOD_COLLECTED') return 'Pickup In Progress';
  if (item.pickup?.status === 'ASSIGNED') return 'Assigned';
  return 'Submitted';
}

function RequestCard({ item }: { item: DonorFoodRequest }) {
  return <Card style={{ marginBottom: 12 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <T size={18} weight="700" color={C.ink} style={{ flex: 1 }} translate={false}>{item.sourceName}</T>
      <Badge value={outcome(item)} />
    </View>
    <T color={C.muted} translate={false}>{item.items.map(food => food.foodType).join(', ')}</T>
    <T color={C.muted} translate={false}>{new Date(item.preparedAt).toLocaleString()}</T>
    <Button title="View request" variant="outline"
      onPress={() => router.push({ pathname: '/donor/request/[id]', params: { id: item.id } })}
      style={{ marginTop: 12 }} />
  </Card>;
}

function useLiveRequests() {
  const [items, setItems] = useState<DonorFoodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listOwnFoodRequests()); }
    catch { setItems([]); setError('Could not load requests. Check your connection and retry.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [refresh]));
  return { items, loading, error, refresh };
}

export function LiveDonorHome() {
  const { items, loading, error, refresh } = useLiveRequests();
  const active = items.find(item => !['Cancelled', 'Completed'].includes(outcome(item)));
  const completed = items.filter(item => outcome(item) === 'Completed');
  return <Screen>
    <Header title="Welcome" subtitle="Your food rescue workspace." right={<LanguageSwitcher />} />
    <NotificationBell />
    <Card style={{ backgroundColor: C.greenSoft, marginBottom: 20, padding: 21 }}>
      <T size={23} weight="800" color={C.ink}>Your food can make someone’s day.</T>
      <T color={C.muted} style={{ marginTop: 6, marginBottom: 17 }}>Schedule a safe pickup for your surplus food.</T>
      <Button title="Report surplus food" icon="add" onPress={() => router.push('/donor/(tabs)/donate')} />
    </Card>
    <Card style={{ marginBottom: 18 }}>
      <T size={28} weight="800" color={C.green} translate={false}>{completed.length}</T>
      <T color={C.muted}>Pickups completed</T>
    </Card>
    <T size={21} weight="700" color={C.ink} style={{ marginBottom: 12 }}>Your active request</T>
    {loading ? <T>Loading requests…</T>
      : error ? <Card><T color={C.red}>{error}</T><Button title="Retry" variant="outline" onPress={() => void refresh()} /></Card>
        : active ? <RequestCard item={active} /> : <Empty title="No requests here" detail="Your requests will appear here." icon="food" />}
    <Button title="Refresh requests" variant="outline" onPress={() => void refresh()} style={{ marginTop: 12 }} />
  </Screen>;
}

export function LiveDonorRequests() {
  const { items, loading, error, refresh } = useLiveRequests();
  const [tab, setTab] = useState('Active');
  const visible = items.filter(item => tab === 'Active'
    ? !['Cancelled', 'Completed'].includes(outcome(item))
    : ['Cancelled', 'Completed'].includes(outcome(item)));
  return <Screen>
    <Header title="Your pickup requests" subtitle="Follow each request from start to finish." />
    <Button title="Refresh requests" variant="outline" onPress={() => void refresh()} style={{ marginBottom: 12 }} />
    <Segments values={['Active', 'Completed']} selected={tab} onSelect={setTab} />
    {loading ? <T>Loading requests…</T>
      : error ? <Card><T color={C.red}>{error}</T><Button title="Retry" variant="outline" onPress={() => void refresh()} /></Card>
        : visible.length ? visible.map(item => <RequestCard key={item.id} item={item} />)
          : <Empty title="No requests here" detail="Your requests will appear here." icon="food" />}
  </Screen>;
}
