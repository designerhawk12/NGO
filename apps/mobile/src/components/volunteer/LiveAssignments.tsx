import React, { useCallback, useEffect, useState } from 'react';
import type { Assignment, AssignmentTransition } from '@aaharaconnect/shared';
import { Alert, Linking, View } from 'react-native';
import { listOwnAssignments, transitionOwnAssignment } from '../../api/assignments';
import { ApiClientError } from '../../api/client';
import { Badge, Button, Card, Empty, Header, Screen, Segments, T } from '../common/UI';
import { C } from '../../constants/theme';
import { pickupNavigationUrl, pickupSearchUrl } from './pickupNavigation';

const terminal = new Set<Assignment['status']>(['DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED']);
const volunteerActions: Partial<Record<Assignment['status'], { action: AssignmentTransition['action']; label: string }>> = {
  PENDING: { action: 'ACCEPT', label: 'Accept assignment' },
  ACCEPTED: { action: 'START', label: 'Start pickup' },
  EN_ROUTE: { action: 'ARRIVE', label: 'Check in at pickup' },
  ARRIVED_AT_DONOR: { action: 'COLLECT', label: 'Confirm food collected' },
  FOOD_COLLECTED: { action: 'DELIVER', label: 'Confirm food delivered' },
};

export default function LiveAssignments({ historyOnly = false, assignmentId }: { historyOnly?: boolean; assignmentId?: string }) {
  const [items, setItems] = useState<Assignment[]>([]);
  const [tab, setTab] = useState(historyOnly ? 'Past' : 'Active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listOwnAssignments()); }
    catch { setItems([]); setError('Could not load assignments. Check your connection and retry.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [refresh]);

  const changeStatus = async (item: Assignment, action: AssignmentTransition['action']) => {
    setBusyId(item.id); setActionError(null); setActionSuccess(null);
    try {
      const updated = await transitionOwnAssignment(item.id, { action, expectedVersion: item.version });
      setItems(current => current.map(row => row.id === updated.id ? updated : row));
      await refresh();
      setActionSuccess(action === 'DELIVER' ? 'Food delivery confirmed.' : action === 'ARRIVE' ? 'Pickup check-in recorded.' : 'Assignment updated.');
    } catch (cause) {
      setActionError(cause instanceof ApiClientError && cause.code === 'VERSION_CONFLICT'
        ? 'Assignment changed. Refresh and try again.'
        : cause instanceof ApiClientError && cause.code === 'DRIVER_NOT_ACCEPTED'
          ? 'Waiting for the NGO driver to accept this job before the pickup can start.'
          : 'Could not update assignment. Refresh and try again.');
    } finally { setBusyId(null); }
  };

  const visible = items.filter(item => assignmentId ? item.id === assignmentId : tab === 'Active' ? !terminal.has(item.status) : terminal.has(item.status))
    .sort((a, b) => tab === 'Past' ? Date.parse(b.completedAt ?? b.createdAt ?? '') - Date.parse(a.completedAt ?? a.createdAt ?? '') : 0);
  const navigate = async (address: string) => {
    const destination = pickupNavigationUrl(address);
    if (!destination) { setActionError('Pickup address is unavailable. Contact the administrator.'); return; }
    try { await Linking.openURL(destination); }
    catch {
      try { await Linking.openURL(pickupSearchUrl(address)!); }
      catch { setActionError('Could not open Maps. Check your browser or maps app.'); }
    }
  };
  const confirmAction = (item: Assignment, action: AssignmentTransition['action']) => {
    if (action !== 'DELIVER') { void changeStatus(item, action); return; }
    Alert.alert('Confirm food delivered?', 'Only confirm after the food has been handed over.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm delivery', onPress: () => void changeStatus(item, 'DELIVER') },
    ]);
  };
  return <Screen>
    <Header title={historyOnly ? 'History' : 'Your assignments'} subtitle={historyOnly ? 'Your completed and closed pickups.' : 'Assignments from the shared API.'} />
    <Button title="Refresh assignments" variant="outline" onPress={() => void refresh()} style={{ marginBottom: 12 }} />
    {!historyOnly && <Segments values={['Active', 'Past']} selected={tab} onSelect={setTab} />}
    {error && <Card style={{ marginBottom: 12 }}><T color={C.red}>{error}</T><Button title="Retry" variant="outline" onPress={() => void refresh()} /></Card>}
    {actionError && <Card style={{ marginBottom: 12 }}><T color={C.red}>{actionError}</T></Card>}
    {actionSuccess && <Card style={{ marginBottom: 12 }}><T color={C.green}>{actionSuccess}</T></Card>}
    {loading ? <T>Loading assignments...</T> : !error && visible.length === 0
      ? <Empty title="No assignments here" detail="Your assigned pickups will appear here." />
      : visible.map(item => {
        const next = item.ownResponse === 'PENDING' || !item.ownResponse ? volunteerActions[item.status]
          : item.status === 'PENDING' ? undefined : volunteerActions[item.status];
        return <Card key={item.id} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T weight="700" color={C.ink}>Pickup assignment</T><Badge value={item.status.replaceAll('_', ' ')} />
          </View>
          <T color={C.muted} translate={false}>{item.id}</T>
          <T color={C.muted} translate={false}>Pickup: {item.pickupId}</T>
          {item.ownResponse && <T color={item.ownResponse==='DECLINED'?C.red:C.muted} translate={false}>Your response: {item.ownResponse.toLowerCase()}</T>}
          {item.pickupAddress && <T color={C.ink} translate={false}>Pickup location: {item.pickupAddress}</T>}
          {item.driverAcceptance && item.driverAcceptance !== 'NOT_REQUIRED' && !terminal.has(item.status) && <T color={item.driverAcceptance === 'ACCEPTED' ? C.green : C.muted}>
            {item.driverAcceptance === 'ACCEPTED' ? 'NGO driver has accepted' : 'Waiting for the NGO driver to accept'}
          </T>}
          {item.windowStartsAt && <T color={C.muted} translate={false}>Pickup window: {new Date(item.windowStartsAt).toLocaleString('en-IN')} — {item.windowEndsAt ? new Date(item.windowEndsAt).toLocaleString('en-IN') : ''}</T>}
          {terminal.has(item.status) && item.completedAt && <T color={C.muted} translate={false}>Closed: {new Date(item.completedAt).toLocaleString('en-IN')}</T>}
          {['ACCEPTED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED'].includes(item.status) && <Button title="Navigate to Pickup — Google Maps" variant="outline" onPress={() => void navigate(item.pickupAddress ?? '')} style={{ marginTop: 10 }} />}
          {next && <Button title={next.label} disabled={busyId !== null} loading={busyId === item.id}
            onPress={() => confirmAction(item, next.action)} style={{ marginTop: 12 }} />}
          {item.status === 'PENDING' && (!item.ownResponse || item.ownResponse==='PENDING') && <Button title="Decline assignment" variant="outline" disabled={busyId !== null}
            onPress={() => void changeStatus(item, 'REJECT')} style={{ marginTop: 8 }} />}
        </Card>;
      })}
  </Screen>;
}
