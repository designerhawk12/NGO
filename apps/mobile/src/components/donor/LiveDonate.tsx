import React, { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { createFoodRequestSchema, type CreateFoodRequest } from '@aaharaconnect/shared';
import { createFoodRequest } from '../../api/foodRequests';
import { ApiClientError } from '../../api/client';
import { Button, Card, Field, Header, Icon, Screen, T } from '../common/UI';
import { C } from '../../constants/theme';

// Donors always enter wall-clock times in India Standard Time (UTC+05:30),
// regardless of what timezone the device/emulator/server happens to be set
// to. `new Date(\`${date}T${time}:00\`)` (no offset) is interpreted using the
// *local* timezone of whatever machine runs this code, which silently shifts
// stored times by hours on any non-IST device. Build the UTC instant
// directly from a fixed IST offset instead.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function localDateTime(date: string, time: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return null;

  const utcMillis = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60000;

  // Reject impossible calendar dates (e.g. 2026-02-30) by shifting back to
  // IST and checking the entered components round-trip, using UTC-based
  // getters only so this check is also timezone-independent.
  const ist = new Date(utcMillis + IST_OFFSET_MINUTES * 60000);
  if (ist.getUTCFullYear() !== year || ist.getUTCMonth() + 1 !== month || ist.getUTCDate() !== day) {
    return null;
  }

  return new Date(utcMillis).toISOString();
}

export default function LiveDonate() {
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('Event');
  const [pickupAddress, setPickupAddress] = useState('');
  const [preparedDate, setPreparedDate] = useState('');
  const [preparedTime, setPreparedTime] = useState('');
  const [readyDate, setReadyDate] = useState('');
  const [readyTime, setReadyTime] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [foodType, setFoodType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [estimatedWeight, setEstimatedWeight] = useState('');
  const [handling, setHandling] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [safe, setSafe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const preparedAt = localDateTime(preparedDate.trim(), preparedTime.trim());
    const readyAt = localDateTime(readyDate.trim(), readyTime.trim());
    const pickupDeadline = localDateTime(deadlineDate.trim(), deadlineTime.trim());
    if (!preparedAt || !readyAt || !pickupDeadline) {
      setError('Enter valid dates and 24-hour times for preparation, readiness and pickup deadline.');
      return;
    }
    if (!safe) { setError('Please confirm food safety.'); return; }
    const input: CreateFoodRequest = {
      sourceName: sourceName.trim(), sourceType,
      pickupAddress: pickupAddress.trim(), preparedAt, readyAt, pickupDeadline,
      contactName: contactName.trim(), contactPhoneE164: phone.trim(),
      handlingRequirements: handling.trim(), donorSafetyDeclaration: true,
      notes: notes.trim() || undefined,
      items: [{ foodType: foodType.trim(), quantity: Number(quantity), unit: 'MEALS', handlingRequirements: handling.trim() }],
      estimatedWeightKg: estimatedWeight.trim() ? Number(estimatedWeight) : null,
    };
    const parsed = createFoodRequestSchema.safeParse(input);
    if (!parsed.success) {
      setError('Check the required fields, phone number and pickup times.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createFoodRequest(parsed.data);
      router.push({ pathname: '/donor/success', params: { id: created.id } });
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 401
        ? 'Session expired. Sign in again to submit this request.'
        : cause instanceof ApiClientError && cause.status === 400
          ? 'The request was rejected. Check your details and try again.'
          : 'Could not submit your request. Check your connection and retry.');
    } finally { setSubmitting(false); }
  };

  return <Screen>
    <Header title="New food pickup" subtitle="Tell us about the food and when it is ready." />
    <T size={20} weight="700" color={C.ink} style={{ marginBottom: 12 }}>Food source</T>
    <Card style={{ marginBottom: 18 }}>
      <Field label="Source / event name" value={sourceName} onChangeText={setSourceName} required />
      <T weight="600" color={C.ink} style={{ marginBottom: 9 }}>Source type</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {['Wedding', 'Event', 'Restaurant', 'Other'].map(value =>
          <Pressable key={value} accessibilityRole="button" onPress={() => setSourceType(value)}
            style={{ borderRadius: 99, borderWidth: 1, borderColor: sourceType === value ? C.green : C.line,
              backgroundColor: sourceType === value ? C.greenSoft : C.white, paddingHorizontal: 13, paddingVertical: 9 }}>
            <T size={14} weight="600" color={sourceType === value ? C.green : C.muted}>{value}</T>
          </Pressable>)}
      </View>
    </Card>
    <T size={20} weight="700" color={C.ink} style={{ marginBottom: 12 }}>Pickup details</T>
    <Card style={{ marginBottom: 18 }}>
      <Field label="Pickup address" value={pickupAddress} onChangeText={setPickupAddress} required multiline />
      <T color={C.muted} style={{ marginBottom: 12 }}>Use local dates (YYYY-MM-DD) and 24-hour times (HH:mm).</T>
      <Field label="Prepared date" value={preparedDate} onChangeText={setPreparedDate} placeholder="YYYY-MM-DD" required />
      <Field label="Prepared time" value={preparedTime} onChangeText={setPreparedTime} placeholder="HH:mm" required />
      <Field label="Ready date" value={readyDate} onChangeText={setReadyDate} placeholder="YYYY-MM-DD" required />
      <Field label="Ready time" value={readyTime} onChangeText={setReadyTime} placeholder="HH:mm" required />
      <Field label="Pickup deadline date" value={deadlineDate} onChangeText={setDeadlineDate} placeholder="YYYY-MM-DD" required />
      <Field label="Pickup deadline time" value={deadlineTime} onChangeText={setDeadlineTime} placeholder="HH:mm" required />
    </Card>
    <T size={20} weight="700" color={C.ink} style={{ marginBottom: 12 }}>Food details</T>
    <Card style={{ marginBottom: 18 }}>
      <Field label="Food type" value={foodType} onChangeText={setFoodType} required />
      <Field label="Estimated meals" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" required />
      <Field label="Estimated weight (kg, optional)" value={estimatedWeight} onChangeText={setEstimatedWeight} keyboardType="decimal-pad" />
      <Field label="Handling requirements" value={handling} onChangeText={setHandling} multiline />
    </Card>
    <T size={20} weight="700" color={C.ink} style={{ marginBottom: 12 }}>Contact details</T>
    <Card style={{ marginBottom: 18 }}>
      <Field label="Contact person" value={contactName} onChangeText={setContactName} required />
      <Field label="Phone number (e.g. +919876543210)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" required />
      <Field label="Additional notes" value={notes} onChangeText={setNotes} multiline />
    </Card>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: safe }} onPress={() => setSafe(value => !value)}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 18, paddingHorizontal: 2 }}>
      <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: safe ? C.green : C.muted,
        backgroundColor: safe ? C.green : C.white, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {safe && <Icon name="check" size={17} color={C.white} />}
      </View>
      <T style={{ flex: 1 }}>I confirm this food is safe, fresh and properly stored.</T>
    </Pressable>
    {error && <Card style={{ marginBottom: 12 }}><T color={C.red}>{error}</T></Card>}
    <Button title="Submit pickup request" onPress={() => void submit()} loading={submitting} disabled={submitting} />
  </Screen>;
}
