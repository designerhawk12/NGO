import React, { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { cancelFoodRequest, DonorFoodRequest, getFoodRequest } from '../../api/foodRequests';
import { ApiClientError } from '../../api/client';
import { Badge, Button, Card, Header, InfoRow, Screen, Sheet, T } from '../common/UI';
import { C } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';

function pickupLabel(status: NonNullable<DonorFoodRequest['pickup']>['status']): string {
  const labels = {
    PLANNED: 'Submitted', ASSIGNED: 'Assigned', EN_ROUTE: 'Pickup In Progress',
    ARRIVED_AT_DONOR: 'Pickup In Progress', FOOD_COLLECTED: 'Pickup In Progress',
    DELIVERED: 'Completed', CANCELLED: 'Pickup Cancelled', FAILED: 'Pickup Failed',
  };
  return labels[status];
}

export default function LiveRequestDetail({ id }: { id: string }) {
  const { t } = useLanguage();
  const [item, setItem] = useState<DonorFoodRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItem(await getFoodRequest(id)); }
    catch { setItem(null); setError('Could not load this request. Check your connection and retry.'); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [refresh]));

  const cancel = async () => {
    setCancelling(true); setError(null);
    try {
      await cancelFoodRequest(id);
      setConfirm(false);
      router.replace('/donor/(tabs)/requests');
    } catch (cause) {
      setConfirm(false);
      setError(cause instanceof ApiClientError && cause.code === 'INVALID_TRANSITION'
        ? 'Pickup has already begun. Refresh for the latest status.'
        : 'Could not cancel this request. Refresh and try again.');
    } finally { setCancelling(false); }
  };

  return <Screen>
    <Header title="Request details" back />
    <Button title="Refresh request" variant="outline" onPress={() => void refresh()} style={{ marginBottom: 12 }} />
    {loading ? <T>Loading request…</T> : error && !item
      ? <Card><T color={C.red}>{error}</T><Button title="Retry" variant="outline" onPress={() => void refresh()} /></Card>
      : item && <>
        {error && <Card style={{ marginBottom: 12 }}><T color={C.red}>{error}</T></Card>}
        <Card style={{ marginBottom: 17 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <T size={22} weight="800" color={C.ink} style={{ flex: 1 }} translate={false}>{item.sourceName}</T>
            <Badge value={item.status === 'CANCELLED' ? 'Cancelled' : item.pickup ? pickupLabel(item.pickup.status) : 'Submitted'} />
          </View>
          <T color={C.muted} translate={false}>{item.id}</T>
          <InfoRow icon="pin" label="Pickup address" value={item.pickupAddress} />
          <InfoRow icon="clock" label="Food prepared" value={new Date(item.preparedAt).toLocaleString()} />
          <InfoRow icon="calendar" label="Pickup deadline" value={new Date(item.pickupDeadline).toLocaleString()} />
          <InfoRow icon="person" label="Contact person" value={`${item.contactName} · ${item.contactPhoneE164}`} />
        </Card>
        <T size={20} weight="700" color={C.ink} style={{ marginBottom: 11 }}>Food details</T>
        <Card style={{ marginBottom: 17 }}>
          {item.items.map((food, index) => <InfoRow key={index} icon="food" label={food.foodType}
            value={`${food.quantity} ${food.unit.toLowerCase()}`} />)}
          {!!item.handlingRequirements && <InfoRow icon="assignment" label="Handling requirements" value={item.handlingRequirements} />}
          {!!item.notes && <InfoRow icon="assignment" label="Notes" value={item.notes} />}
          <InfoRow icon="check" label="Safety review" value={t(item.safetyReview === 'PENDING' ? 'Pending' : item.safetyReview === 'APPROVED' ? 'Approved' : 'Rejected')} />
        </Card>
        {item.pickup && <Card style={{ marginBottom: 17 }}>
          <T size={18} weight="700" color={C.ink}>Pickup progress</T>
          <InfoRow icon="assignment" label="Pickup status" value={t(pickupLabel(item.pickup.status))} />
          <InfoRow icon="calendar" label="Pickup time" value={new Date(item.pickup.windowStartsAt).toLocaleString()} />
        </Card>}
        {item.status === 'SUBMITTED' && (!item.pickup || ['PLANNED', 'ASSIGNED'].includes(item.pickup.status))
          && <Button title="Cancel request" variant="outline" onPress={() => setConfirm(true)} />}
      </>}
    <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Cancel this request?">
      <T color={C.muted} style={{ marginBottom: 20 }}>This will also cancel any pickup already arranged for this request.</T>
      <Button title="Confirm cancellation" variant="danger" loading={cancelling} disabled={cancelling} onPress={() => void cancel()} />
      <Button title="Keep request" variant="quiet" onPress={() => setConfirm(false)} style={{ marginTop: 6 }} />
    </Sheet>
  </Screen>;
}
