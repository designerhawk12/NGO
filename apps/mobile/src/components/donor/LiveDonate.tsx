import React, { useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import * as Location from 'expo-location';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createFoodRequestSchema, type CreateFoodRequest } from '@aaharaconnect/shared';
import { createFoodRequest } from '../../api/foodRequests';
import { ApiClientError } from '../../api/client';
import { Button, Card, Field, Header, Icon, Screen, Sheet, T } from '../common/UI';
import { C } from '../../constants/theme';
import {
  addressFromPlace, clamp, composePickupAddress, deriveDeadline, emptyAddress, emptySelection, MAX_ITEMS, MAX_MEALS, MIN_ITEMS,
  selectedTimeToIso, validateDonationTimes, type AddressParts, type ClockTime, type Selection,
} from './donationRules';

export { selectedTimeToIso, validateDonationTimes };

type PickerState = { target: 'preparedDate' | 'preparedTime' | 'deadlineTime' } | null;
type FoodDraft = { foodType: string; customName: string; meals: string; weight: string; handling: string };
const emptyFood = (): FoodDraft => ({ foodType: '', customName: '', meals: '', weight: '', handling: '' });
const foods = ['Rice', 'Chapati', 'Dal', 'Sambar', 'Idli', 'Dosa', 'Upma', 'Vegetable Curry', 'Pulao', 'Biryani (Vegetarian)', 'Fruits', 'Bread', 'Other vegetarian item'];
const MEAL_STEP = 5;

export function normalizeIndianPhone(value: string): string | null {
  const compact = value.replace(/[\s()\-]/g, '');
  const local = compact.startsWith('+91') ? compact.slice(3) : compact.startsWith('91') && compact.length === 12 ? compact.slice(2) : compact;
  return /^[6-9][0-9]{9}$/.test(local) ? `+91${local}` : null;
}

const pad = (value: number) => String(value).padStart(2, '0');
const clockText = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;
const longDate = (date: Date) => date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Clearly labelled [−] value [+] control used for item counts and meals. */
function QuantityStepper({ label, value, onMinus, onPlus, minusDisabled, plusDisabled }: {
  label: string; value: string; onMinus: () => void; onPlus: () => void; minusDisabled?: boolean; plusDisabled?: boolean;
}) {
  const button = (symbol: string, name: string, onPress: () => void, disabled?: boolean) =>
    <Pressable accessibilityRole="button" accessibilityLabel={name} disabled={disabled} onPress={onPress}
      style={{ width: 52, height: 52, borderRadius: 14, borderWidth: 1, borderColor: disabled ? C.line : C.green,
        backgroundColor: disabled ? C.white : C.greenSoft, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <T size={26} weight="800" color={disabled ? C.muted : C.green} translate={false}>{symbol}</T>
    </Pressable>;
  return <View style={{ marginBottom: 12 }}>
    <T weight="700" style={{ marginBottom: 8 }}>{label}</T>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
      {button('−', 'Decrease quantity', onMinus, minusDisabled)}
      <T size={24} weight="800" color={C.ink} translate={false} style={{ minWidth: 56, textAlign: 'center' }}>{value}</T>
      {button('+', 'Increase quantity', onPlus, plusDisabled)}
    </View>
  </View>;
}

export default function LiveDonate() {
  const submissionRef = useRef<{body:string;id:string} | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('Event');
  const [address, setAddress] = useState<AddressParts>(emptyAddress());
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Selection>(emptySelection());
  const [deadlineTime, setDeadlineTime] = useState<ClockTime | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [items, setItems] = useState<FoodDraft[]>([emptyFood()]);
  const [foodSelector, setFoodSelector] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [safe, setSafe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchAddress = (patch: Partial<AddressParts>) => setAddress(current => ({ ...current, ...patch }));
  const updateFood = (index: number, patch: Partial<FoodDraft>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const setCount = (count: number) => { const next = clamp(count, MIN_ITEMS, MAX_ITEMS); setItems(current => Array.from({ length: next }, (_, i) => current[i] ?? emptyFood())); };
  const stepMeals = (index: number, delta: number) => {
    const current = Number(items[index].meals);
    const base = Number.isFinite(current) && current > 0 ? current : 0;
    updateFood(index, { meals: String(clamp(base + delta, 1, MAX_MEALS)) });
  };

  const detectLocation = async () => {
    setLocationNote(null); setError(null); setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { setLocationNote('Location permission was denied. Please type the pickup address manually.'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      const guess = places[0] ? addressFromPlace(places[0]) : null;
      if (!guess || (!guess.street && !guess.area)) { setLocationNote('We found your position but not a readable address. Please type it manually.'); return; }
      patchAddress({ street: guess.street || address.street, area: guess.area || address.area });
      setLocationNote('Street and area were filled from your location. GPS cannot find the exact hall, building or floor — please add those and check the rest.');
    } catch {
      setLocationNote('Could not read your location (turn on GPS and try again) or type the address manually.');
    } finally { setLocating(false); }
  };

  const preparedIso = selectedTimeToIso(prepared);
  const deadline = deriveDeadline(prepared, deadlineTime);

  const openPicker = (target: NonNullable<PickerState>['target']) => {
    if (target !== 'preparedDate' && !prepared.date) { setError('Choose the food prepared date first.'); return; }
    if (target === 'deadlineTime' && (prepared.hour === null || prepared.minute === null)) { setError('Choose the food prepared time first.'); return; }
    setError(null);
    if (Platform.OS !== 'android') { setPicker({ target }); return; }
    const initial = new Date(prepared.date ?? new Date());
    const mode = target === 'preparedDate' ? 'date' : 'time';
    if (target === 'preparedTime' && prepared.hour !== null && prepared.minute !== null) initial.setHours(prepared.hour, prepared.minute);
    if (target === 'deadlineTime' && deadlineTime) initial.setHours(deadlineTime.hour, deadlineTime.minute);
    DateTimePickerAndroid.open({ value: initial, mode, is24Hour: true, onChange: (event, value) => { if (event.type === 'set' && value) applyPicked(target, value); } });
  };
  const applyPicked = (target: NonNullable<PickerState>['target'], value: Date) => {
    // Changing the prepared date keeps the chosen clock times; they are re-validated on every render and at submit.
    if (target === 'preparedDate') setPrepared(current => ({ ...current, date: value }));
    else if (target === 'preparedTime') setPrepared(current => ({ ...current, hour: value.getHours(), minute: value.getMinutes() }));
    else setDeadlineTime({ hour: value.getHours(), minute: value.getMinutes() });
  };

  const submit = async () => {
    setError(null);
    const composed = composePickupAddress(address);
    if ('error' in composed) { setError(composed.error); return; }
    if (!prepared.date) { setError('Select the food prepared date.'); return; }
    if (prepared.hour === null || prepared.minute === null || !preparedIso) { setError('Select the food prepared time.'); return; }
    if (!deadline.ok) { setError(deadline.error); return; }
    const timeError = validateDonationTimes(preparedIso, deadline.iso);
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
    // No "food ready" time is collected: pickup can start from the preparation time (the API stores it as ready_at).
    const input: CreateFoodRequest = {
      sourceName: sourceName.trim(), sourceType, pickupAddress: composed.address, preparedAt: preparedIso, pickupDeadline: deadline.iso,
      contactName: contactName.trim(), contactPhoneE164, handlingRequirements: '', donorSafetyDeclaration: true,
      notes: notes.trim() || undefined, items: foodItems,
      estimatedWeightKg: foodItems.reduce((sum, item) => sum + (item.estimatedWeightKg ?? 0), 0),
    };
    const parsed = createFoodRequestSchema.safeParse(input);
    if (!parsed.success) { const issue = parsed.error.issues[0]; setError(`${issue.path.join(' / ') || 'Request'}: ${issue.message}`); return; }
    setSubmitting(true);
    try {
      const body=JSON.stringify(parsed.data);
      if(submissionRef.current?.body!==body)submissionRef.current={body,id:Crypto.randomUUID()};
      const created = await createFoodRequest({...parsed.data,submissionId:submissionRef.current!.id});
      router.push({ pathname: '/donor/success', params: { id: created.id } });
    }
    catch (cause) { setError(cause instanceof ApiClientError && cause.status === 401 ? 'Session expired. Sign in again.'
      : cause instanceof ApiClientError && cause.status === 400 ? 'The server rejected your request. Review each field.'
      : 'Could not submit your request. Check your connection and retry.'); }
    finally { setSubmitting(false); }
  };

  const dateButton = prepared.date ? longDate(prepared.date) : 'Select date';
  const preparedTimeButton = prepared.hour === null || prepared.minute === null ? 'Select time' : clockText(prepared.hour, prepared.minute);
  const deadlineButton = deadlineTime ? clockText(deadlineTime.hour, deadlineTime.minute) : 'Select deadline time';
  const preparedReady = prepared.date !== null && prepared.hour !== null && prepared.minute !== null;
  const timeHint = !preparedReady ? null
    : deadlineTime && !deadline.ok ? deadline.error
      : deadline.ok ? `Pickup deadline: ${longDate(deadline.date)}, ${clockText(deadlineTime!.hour, deadlineTime!.minute)}${deadline.nextDay ? ' (next day — overnight)' : ''}` : null;

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
      <T weight="700" style={{ marginBottom: 8 }}>Hall address (pickup address)</T>
      <Button title={locating ? 'Detecting…' : 'Detect My Location'} icon="pin" variant="outline" onPress={() => void detectLocation()} loading={locating} disabled={locating} style={{ marginBottom: 8 }} />
      {locationNote && <T size={13} color={C.muted} style={{ marginBottom: 10 }}>{locationNote}</T>}
      <Field label="Hall / building name" value={address.hall} onChangeText={hall => patchAddress({ hall })} required />
      <Field label="Flat / floor / door number" value={address.flat} onChangeText={flat => patchAddress({ flat })} />
      <Field label="Street / road" value={address.street} onChangeText={street => patchAddress({ street })} required />
      <Field label="Area / locality (city, PIN)" value={address.area} onChangeText={area => patchAddress({ area })} required />
      <Field label="Landmark (optional)" value={address.landmark} onChangeText={landmark => patchAddress({ landmark })} />
      <T color={C.muted} style={{ marginBottom: 12 }}>Dates and times use your phone&apos;s local timezone.</T>
      <T weight="700" style={{ marginBottom: 6 }}>Food prepared</T>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Button title={dateButton} variant="outline" onPress={() => openPicker('preparedDate')} style={{ flex: 1 }} />
        <Button title={preparedTimeButton} variant="outline" onPress={() => openPicker('preparedTime')} disabled={!prepared.date} style={{ flex: 1 }} />
      </View>
      {!prepared.date && <T size={13} color={C.muted} style={{ marginTop: -8, marginBottom: 12 }}>Choose the date first; then the time becomes available.</T>}
      <T weight="700" style={{ marginBottom: 6 }}>Pickup deadline (time only)</T>
      <Button title={deadlineButton} variant="outline" onPress={() => openPicker('deadlineTime')} disabled={!preparedReady} style={{ marginBottom: 8 }} />
      {timeHint && <T size={13} color={deadline.ok ? C.green : C.red} style={{ marginBottom: 6 }}>{timeHint}</T>}
      {picker && <DateTimePicker mode={picker.target === 'preparedDate' ? 'date' : 'time'} value={prepared.date ?? new Date()} is24Hour
        onChange={(event, value) => { if (event.type === 'set' && value) applyPicked(picker.target, value); setPicker(null); }} />}
    </Card>
    <T size={20} weight="700" color={C.ink} style={{ marginBottom: 12 }}>Food details</T>
    <Card style={{ marginBottom: 18 }}>
      <QuantityStepper label="Select quantity of food items" value={String(items.length)}
        onMinus={() => setCount(items.length - 1)} onPlus={() => setCount(items.length + 1)}
        minusDisabled={items.length <= MIN_ITEMS} plusDisabled={items.length >= MAX_ITEMS} />
      <T size={13} color={C.muted} style={{ marginBottom: 10, textAlign: 'center' }}>How many different food items are you donating? (1–{MAX_ITEMS})</T>
      {items.map((food, index) => <Card key={index} style={{ marginBottom: 12 }}>
        <T weight="700" size={17} style={{ marginBottom: 8 }}>Food Item {index + 1}</T>
        <Button title={food.foodType || 'Choose vegetarian food'} variant="outline" onPress={() => setFoodSelector(index)} style={{ marginBottom: 10 }} />
        {food.foodType === 'Other vegetarian item' && <Field label="Other vegetarian item name" value={food.customName} onChangeText={value => updateFood(index, { customName: value })} required />}
        <QuantityStepper label="Estimated number of meals" value={food.meals.trim() ? food.meals : '0'}
          onMinus={() => stepMeals(index, -MEAL_STEP)} onPlus={() => stepMeals(index, MEAL_STEP)}
          minusDisabled={!(Number(food.meals) > 1)} plusDisabled={Number(food.meals) >= MAX_MEALS} />
        <Field label="Exact number of meals (type to adjust)" value={food.meals} onChangeText={value => updateFood(index, { meals: value.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" required />
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
