import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DriverJob } from '@aaharaconnect/shared';
import { Alert, Linking, Pressable, View } from 'react-native';
import { ApiClientError } from '../../api/client';
import { currentDestination, isClosedJob, listDriverJobs, nextDriverStep, updateDriverJob, type DriverAction } from '../../api/driver';
import { pickupNavigationUrl, pickupSearchUrl } from '../volunteer/pickupNavigation';
import { Badge, Button, Card, Empty, Header, Icon, InfoRow, Screen, Sheet, T } from '../common/UI';
import { C } from '../../constants/theme';
import { activeDriverTracking, requireDriverTracking, startDriverTracking, stopDriverTracking, trackingSession } from '../tracking/driverTracking';

const declineReasons = ['Vehicle problem', 'Not available at this time', 'Too far from my location', 'Other reason'];
const successText: Record<DriverAction, string> = {
  ACCEPT: 'Job accepted. Tap “Show on Maps” for directions to the pickup.',
  REJECT: 'Job declined. The NGO administrator will reassign it.',
  START: 'Journey to pickup started.',
  ARRIVE: 'Pickup check-in recorded.',
  COLLECT: 'Food collection confirmed. Show on Maps now guides you to the delivery destination.',
  DELIVER: 'Delivery confirmed. The job has moved to History.',
};
const errorText: Record<string, string> = {
  VERSION_CONFLICT: 'This job was just updated by someone else. It has been refreshed; check the new status.',
  INVALID_TRANSITION: 'This step is no longer available. The job has been refreshed.',
  DRIVER_NOT_ACCEPTED: 'Accept the job before starting the journey.',
  CREW_NOT_ACCEPTED: 'Waiting for a crew volunteer to accept this job before the journey can start.',
  FORBIDDEN: 'This job is not assigned to you.',
  NETWORK_ERROR: 'No connection. Nothing was changed; try again when you are online.',
};

const timeLabel = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function DriverJobs({ historyOnly = false, assignmentId }: { historyOnly?: boolean; assignmentId?: string }) {
  const [jobs, setJobs] = useState<DriverJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<DriverJob | null>(null);
  const [reason, setReason] = useState('');
  const acting = useRef(false);
  const [sharingPickup, setSharingPickup] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const updated = await listDriverJobs();
      setJobs(updated);
      const session = await trackingSession();
      if (session && !updated.some(job => job.pickupId === session.pickupId && !isClosedJob(job))) await stopDriverTracking();
      setSharingPickup((await activeDriverTracking())?.pickupId ?? null);
    }
    catch (cause) {
      setJobs([]);
      setError(cause instanceof ApiClientError && cause.code === 'NETWORK_ERROR'
        ? 'No connection. Pull your jobs again when you are online.'
        : 'Could not load your jobs. Check your connection and retry.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const startSharing = (job: DriverJob) => Alert.alert('Share your phone GPS during NGO duty?',
    'The NGO Admin can see the reported location of your fixed vehicle during this pickup. Android will ask for foreground and background location; choose Allow all the time in Settings so Google Maps can stay open. A persistent notification shows sharing. You can stop at any time. Android force-stop and battery restrictions can interrupt reports.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start Location Sharing', onPress: () => {
        void (async () => {
          try { await startDriverTracking(job.pickupId); setSharingPickup(job.pickupId); setMessage({ text: 'Location Sharing Active', ok: true }); }
          catch (cause) { setSharingPickup(null); setMessage({ text: cause instanceof Error ? cause.message : 'Could not start location sharing.', ok: false }); }
        })();
      } },
    ]);

  const act = async (job: DriverJob, action: DriverAction, declineReason?: string) => {
    if (acting.current) return;
    acting.current = true; setBusyId(job.assignmentId); setMessage(null);
    try {
      if (action === 'START') await requireDriverTracking(job.pickupId);
      await updateDriverJob(job, action, declineReason);
      if (action === 'DELIVER' || action === 'REJECT') { await stopDriverTracking(); setSharingPickup(null); }
      setMessage({ text: successText[action], ok: true });
    } catch (cause) {
      const code = cause instanceof ApiClientError ? cause.code : '';
      setMessage({ text: errorText[code] ?? (cause instanceof Error ? cause.message : 'Could not update the job. Try again.'), ok: false });
    } finally {
      acting.current = false; setBusyId(null);
      await refresh();
    }
  };

  const confirm = (job: DriverJob, action: DriverAction) => {
    if (action === 'DELIVER') {
      Alert.alert('Confirm food delivered?', 'Only confirm after the food has been handed over at the delivery destination.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm delivery', onPress: () => void act(job, 'DELIVER') },
      ]);
      return;
    }
    void act(job, action);
  };

  // Opens Google Maps directions only when the driver taps; never automatically on render or restore.
  const showOnMaps = async (job: DriverJob) => {
    const destination = currentDestination(job);
    const url = destination ? pickupNavigationUrl(destination.address) : null;
    if (!destination || !url) { setMessage({ text: 'No destination address is recorded for this job. Contact the NGO administrator.', ok: false }); return; }
    try { await requireDriverTracking(job.pickupId); }
    catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : 'Enable GPS sharing first.', ok: false }); return; }
    try { await Linking.openURL(url); }
    catch {
      try { await Linking.openURL(pickupSearchUrl(destination.address)!); }
      catch { setMessage({ text: 'Could not open Google Maps or a browser on this phone.', ok: false }); }
    }
  };

  const visible = jobs.filter(job => assignmentId ? job.assignmentId === assignmentId : historyOnly ? isClosedJob(job) : !isClosedJob(job));

  return <Screen>
    <Header title={historyOnly ? 'History' : 'My Jobs'} subtitle={historyOnly ? 'Your completed and closed jobs.' : 'Pickups assigned to you by the NGO.'} />
    <Button title="Refresh jobs" variant="outline" icon="history" onPress={() => void refresh()} style={{ marginBottom: 12 }} />
    {error && <Card style={{ marginBottom: 12 }}><T color={C.red}>{error}</T><Button title="Retry" variant="outline" onPress={() => void refresh()} style={{ marginTop: 10 }} /></Card>}
    {message && <Card style={{ marginBottom: 12 }}><T color={message.ok ? C.green : C.red}>{message.text}</T></Card>}
    {loading && jobs.length === 0 ? <T>Loading your jobs...</T>
      : !error && visible.length === 0
        ? <Empty title={historyOnly ? 'No past jobs yet' : 'No jobs assigned right now'} detail={historyOnly ? 'Completed, declined and cancelled jobs appear here.' : 'When the NGO assigns you a pickup, it appears here.'} icon={historyOnly ? 'history' : 'truck'} />
        : visible.map(job => {
          const step = nextDriverStep(job);
          const destination = currentDestination(job);
          return <Card key={job.assignmentId} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <T size={18} weight="800" color={C.ink} translate={false}>{job.donorName}</T>
                <T size={13} color={C.muted} translate={false}>Job {job.pickupId.slice(0, 8).toUpperCase()}</T>
              </View>
              <Badge value={job.status.replaceAll('_', ' ')} />
            </View>
            <T size={13} color={job.driverAcceptance === 'ACCEPTED' ? C.green : C.muted} style={{ marginTop: 4 }}>
              {job.driverAcceptance === 'ACCEPTED' ? 'You accepted this job' : job.driverAcceptance === 'DECLINED' ? 'You declined this job' : job.driverAcceptance === 'PENDING' ? 'Waiting for your acceptance' : 'Assigned'}
            </T>
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 12 }} />
            <InfoRow icon="calendar" label="Pickup time" value={`${timeLabel(job.windowStartsAt)} – ${new Date(job.windowEndsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`} />
            <InfoRow icon="pin" label="Pickup address" value={job.pickupAddress} />
            <InfoRow icon="pin" label="Deliver to" value={job.deliveryAddress} />
            <InfoRow icon="truck" label="Your vehicle" value={`${job.vehicle.registrationNumber} · ${job.vehicle.kind} · ${job.vehicle.capacityKg} kg`} />
            {job.foodItems.length > 0 && <InfoRow icon="food" label="Food" value={job.foodItems.map(item => `${item.foodType} (${item.quantity} ${item.unit.toLowerCase()}${item.estimatedWeightKg ? `, ~${item.estimatedWeightKg} kg` : ''})`).join(', ')} />}
            {job.crew.length > 0 && <InfoRow icon="team" label="Crew" value={job.crew.map(member => member.name).join(', ')} />}
            {job.crew.length === 0 && <T size={13} color={C.muted}>Driver-only pickup — no Volunteers assigned.</T>}
            {!isClosedJob(job) && job.driverAcceptance === 'ACCEPTED' && <>
              <T color={sharingPickup === job.pickupId ? C.green : C.muted}>{sharingPickup === job.pickupId ? 'Location Sharing Active' : 'Location Sharing Off'}</T>
              <T size={12} color={C.muted} translate={false}>{job.vehicle.registrationNumber}</T>
              <Button title={sharingPickup === job.pickupId ? 'Stop Sharing' : 'Turn On GPS / Start Location Sharing'} variant="outline" onPress={() => {
                if (sharingPickup === job.pickupId) void stopDriverTracking().then(() => setSharingPickup(null));
                else startSharing(job);
              }} style={{ marginTop: 8 }} />
            </>}
            {(job.contactName || job.contactPhone) && !isClosedJob(job) && <InfoRow icon="phone" label="Donor contact" value={[job.contactName, job.contactPhone].filter(Boolean).join(' · ')} />}
            {job.handlingRequirements && <InfoRow icon="shield" label="Handling" value={job.handlingRequirements} />}
            {job.operationalNotes && <InfoRow icon="edit" label="Notes" value={job.operationalNotes} />}
            {isClosedJob(job) && job.completedAt && <T size={13} color={C.muted} translate={false}>Closed {timeLabel(job.completedAt)}</T>}

            {destination && <Button title="Show on Maps" icon="pin" variant="green" onPress={() => void showOnMaps(job)} style={{ marginTop: 12 }} />}
            {destination && <T size={12} color={C.muted} style={{ marginTop: 4, textAlign: 'center' }}>Directions to the {destination.label}</T>}
            {step && 'action' in step && <Button title={step.label} disabled={busyId !== null} loading={busyId === job.assignmentId}
              onPress={() => confirm(job, step.action)} style={{ marginTop: 10 }} />}
            {step && 'waiting' in step && <T color={C.muted} style={{ marginTop: 10 }}>{step.waiting}</T>}
            {!isClosedJob(job) && ['PENDING', 'ACCEPTED'].includes(job.status) && <Button title="Decline job" variant="outline" disabled={busyId !== null}
              onPress={() => { setDeclining(job); setReason(''); }} style={{ marginTop: 8 }} />}
          </Card>;
        })}
    <Sheet visible={!!declining} onClose={() => setDeclining(null)} title="Why are you declining?">
      {declineReasons.map(option => <Pressable key={option} accessibilityRole="button" onPress={() => setReason(option)} style={{ borderWidth: 1, borderColor: reason === option ? C.green : C.line, borderRadius: 12, minHeight: 50, paddingHorizontal: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: reason === option ? C.greenSoft : C.white }}><T weight="600">{option}</T>{reason === option && <Icon name="check" size={19} />}</Pressable>)}
      <Button title="Decline job" variant="danger" disabled={!reason || busyId !== null} onPress={() => { const job = declining; setDeclining(null); if (job) void act(job, 'REJECT', reason); }} />
      <Button title="Cancel" variant="quiet" onPress={() => setDeclining(null)} style={{ marginTop: 6 }} />
    </Sheet>
  </Screen>;
}
