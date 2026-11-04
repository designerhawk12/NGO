import React, { useState } from 'react';
import { router } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createFoodRequestSchema, type CreateFoodRequest } from '@aaharaconnect/shared';
import { createFoodRequest } from '../../api/foodRequests';
import { ApiClientError } from '../../api/client';
import { Button, Card, Field, Header, Icon, Screen, Sheet, T } from '../common/UI';
import { C } from '../../constants/theme';

type TimeField = 'preparedAt' | 'readyAt' | 'pickupDeadline';
type Selection = { date: Date | null; hour: number | null; minute: number | null };
type FoodDraft = { foodType: string; customName: string; meals: string; weight: string; handling: string };
const emptySelection = (): Selection => ({ date: null, hour: null, minute: null });
const emptyFood = (): FoodDraft => ({ foodType: '', customName: '', meals: '', weight: '', handling: '' });
const foods = ['Rice', 'Chapati', 'Dal', 'Sambar', 'Idli', 'Dosa', 'Upma', 'Vegetable Curry', 'Pulao', 'Biryani (Vegetarian)', 'Fruits', 'Bread', 'Other vegetarian item'];
const labels: Record<TimeField, string> = { preparedAt: 'Food prepared', readyAt: 'Food ready', pickupDeadline: 'Pickup deadline' };
export function normalizeIndianPhone(value: string): string | null {
  const compact = value.replace(/[\s()\-]/g, '');
  const local = compact.startsWith('+91') ? compact.slice(3) : compact.startsWith('91') && compact.length === 12 ? compact.slice(2) : compact;
  return /^[6-9][0-9]{9}$/.test(local) ? `+91${local}` : null;
}
export function selectedTimeToIso(value: Selection): string | null {
  if (!value.date || value.hour === null || value.minute === null) return null;
  const instant = new Date(value.date.getFullYear(), value.date.getMonth(), value.date.getDate(), value.hour, value.minute);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function validateDonationTimes(preparedAt: string, readyAt: string, pickupDeadline: string, now = new Date()): string | null {
  if (new Date(preparedAt) > new Date(readyAt)) return 'Food ready time must follow preparation.';
  if (new Date(readyAt) > new Date(pickupDeadline)) return 'Pickup deadline must follow food ready time.';
  if (new Date(pickupDeadline) <= now) return 'Pickup deadline must be in the future.';
  return null;
}

export default function LiveDonate() {
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('Event');
  const [pickupAddress, setPickupAddress] = useState('');
  const [times, setTimes] = useState<Record<TimeField, Selection>>({ preparedAt: emptySelection(), readyAt: emptySelection(), pickupDeadline: emptySelection() });
  const [picker, setPicker] = useState<{ field: TimeField; mode: 'date' | 'time' } | null>(null);
  const [items, setItems] = useState<FoodDraft[]>([emptyFood()]);
  const [foodSelector, setFoodSelector] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [safe, setSafe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFood = (index: number, patch: Partial<FoodDraft>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const setCount = (count: number) => { if (count >= 1 && count <= 10) setItems(current => Array.from({ length: count }, (_, i) => current[i] ?? emptyFood())); };
  const setDate = (field: TimeField, date: Date) => setTimes(current => ({ ...current, [field]: { ...current[field], date } }));
  const setClock = (field: TimeField, date: Date) => setTimes(current => ({ ...current, [field]: { ...current[field], hour: date.getHours(), minute: date.getMinutes() } }));
  const openPicker = (field: TimeField, mode: 'date' | 'time') => {
    if (mode === 'time' && !times[field].date) { setError(`Choose the ${labels[field].toLowerCase()} date first.`); return; }
    setError(null);
    if (Platform.OS !== 'android') { setPicker({ field, mode }); return; }
    const initial = new Date(times[field].date ?? new Date());
    if (times[field].hour !== null && times[field].minute !== null) initial.setHours(times[field].hour, times[field].minute);
    DateTimePickerAndroid.open({ value: initial, mode, is24Hour: true, onChange: (event, value) => {
      if (event.type !== 'set' || !value) return;
      if (mode === 'date') setDate(field, value); else setClock(field, value);
    } });
  };
  const dateText = (value: Selection) => value.date ? value.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date';
  const timeText = (value: Selection) => value.hour === null || value.minute === null ? 'Select time' : `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
  const submit = async () => {
    setError(null);
    const preparedAt = selectedTimeToIso(times.preparedAt);
    const readyAt = selectedTimeToIso(times.readyAt);
    const pickupDeadline = selectedTimeToIso(times.pickupDeadline);
    if (!preparedAt) { setError('Select the food prepared date and time.'); return; }
    if (!readyAt) { setError('Select the food ready date and time.'); return; }
    if (!pickupDeadline) { setError('Select the pickup deadline date and time.'); return; }
    const timeError = validateDonationTimes(preparedAt, readyAt, pickupDeadline);
    if (timeError) { setError(timeError); return; }
    const contactPhoneE164 = normalizeIndianPhone(phone);
    if (!contactPhoneE164) { setError('Enter a valid 10-digit Indian mobile number.'); return; }
    if (!safe) { setError('Please confirm food safety.'); return; }
    const foodItems: CreateFoodRequest['items'] = [];
    for (const [index, food] of items.entries()) {
      const foodType = food.foodType === 'Other vegetarian item' ? food.customName.trim() : food.foodType;
      const meals = Number(food.meals), weight = Number(food.weight);
      if (!foodType) { setError(`Choose vegetarian food for Food Item ${index + 1}.`); return; }
      if (!food.meals.trim() || !Number.isFinite(meals) || meals <= 0) { setError(`Enter estimated meals for Food Item ${index + 1}.`); return; }
      if (!food.weight.trim() || !Number.isFinite(weight) || weight <= 0) { setError(`Enter weight in kg for Food Item ${index + 1}.`); return; }
      foodItems.push({ foodType, quantity: meals, unit: 'MEALS', estimatedMeals: meals, estimatedWeightKg: weight, handlingRequirements: food.handling.trim() });
    }
    const input: CreateFoodRequest = {
      sourceName: sourceName.trim(), sourceType, pickupAddress: pickupAddress.trim(), preparedAt, readyAt, pickupDeadline,
      contactName: contactName.trim(), contactPhoneE164, handlingRequirements: '', donorSafetyDeclaration: true,
      notes: notes.trim() || undefined, items: foodItems,
      estimatedWeightKg: foodItems.reduce((sum, item) => sum + (item.estimatedWeightKg ?? 0), 0),
    };
    const parsed = createFoodRequestSchema.safeParse(input);
    if (!parsed.success) { const issue = parsed.error.issues[0]; setError(`${issue.path.join(' / ') || 'Request'}: ${issue.message}`); return; }
    setSubmitting(true);
    try { const created = await createFoodRequest(parsed.data); router.push({ pathname: '/donor/success', params: { id: created.id } }); }
    catch (cause) { setError(cause instanceof ApiClientError && cause.status === 401 ? 'Session expired. Sign in again.'
      : cause instanceof ApiClientError && cause.status === 400 ? 'The server rejected your request. Review each field.'
      : 'Could not submit your request. Check your connection and retry.'); }
    finally { setSubmitting(false); }
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
      <Field label="Hall address (pickup address)" value={pickupAddress} onChangeText={setPickupAddress} required multiline />
      <T color={C.muted} style={{ marginBottom: 12 }}>Select dates and times on your device. Times use its local timezone.</T>
      {(['preparedAt', 'readyAt', 'pickupDeadline'] as TimeField[]).map(field => <View key={field} style={{ marginBottom: 14 }}>
        <T weight="700" style={{ marginBottom: 6 }}>{labels[field]}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={dateText(times[field])} variant="outline" onPress={() => openPicker(field, 'date')} style={{ flex: 1 }} />
          <Button title={timeText(times[field])} variant="outline" onPress={() => openPicker(field, 'time')} style={{ flex: 1 }} />
        </View>
      </View>)}
      {picker && <DateTimePicker mode={picker.mode} value={times[picker.field].date ?? new Date()} is24Hour
        onChange={(event, value) => { if (event.type === 'set' && value) { if (picker.mode === 'date') setDate(picker.field, value); else setClock(picker.field, value); } setPicker(null); }} />}
    </Card>
    <T size={20} weight="700" color={C.ink} style={{ marginBottom: 12 }}>Food details</T>
    <Card style={{ marginBottom: 18 }}>
      <T weight="700" style={{ marginBottom: 10 }}>How many different food items are you donating?</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 }}>
        <Button title="Less" variant="outline" onPress={() => setCount(items.length - 1)} disabled={items.length <= 1} />
        <T weight="700" translate={false}>{items.length}</T>
        <Button title="More" variant="outline" onPress={() => setCount(items.length + 1)} disabled={items.length >= 10} />
      </View>
      {items.map((food, index) => <Card key={index} style={{ marginBottom: 12 }}>
        <T weight="700" size={17} style={{ marginBottom: 8 }}>Food Item {index + 1}</T>
        <Button title={food.foodType || 'Choose vegetarian food'} variant="outline" onPress={() => setFoodSelector(index)} style={{ marginBottom: 10 }} />
        {food.foodType === 'Other vegetarian item' && <Field label="Other vegetarian item name" value={food.customName} onChangeText={value => updateFood(index, { customName: value })} required />}
        <Field label="Estimated number of meals" value={food.meals} onChangeText={value => updateFood(index, { meals: value })} keyboardType="decimal-pad" required />
        <Field label="Approximate weight (kg)" value={food.weight} onChangeText={value => updateFood(index, { weight: value })} keyboardType="decimal-pad" required />
        <Field label="Handling requirements" value={food.handling} onChangeText={value => updateFood(index, { handling: value })} multiline />
      </Card>)}
    </Card>
    <Sheet visible={foodSelector !== null} onClose={() => setFoodSelector(null)} title="Choose vegetarian food">
      {foods.map(option => <Button key={option} title={option} variant="outline" onPress={() => { if (foodSelector !== null) updateFood(foodSelector, { foodType: option }); setFoodSelector(null); }} style={{ marginBottom: 6 }} />)}
    </Sheet>
    <T size={20} weight="700" color={C.ink} style={{ marginBottom: 12 }}>Contact details</T>
    <Card style={{ marginBottom: 18 }}>
      <Field label="Contact person" value={contactName} onChangeText={setContactName} required />
      <T weight="600" style={{ marginBottom: 5 }}>Country code: +91</T>
      <Field label="10-digit Indian mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" required />
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
