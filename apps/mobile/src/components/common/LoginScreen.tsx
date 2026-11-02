import React, { useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { Redirect } from 'expo-router';
import { volunteerRegistrationInputSchema } from '@aaharaconnect/shared';
import { Button, Card, Field, Header, Icon, LanguageSwitcher, Screen, T } from './UI';
import { C } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { Role } from '../../types';
import { isLiveAuthConfigured, signInWithEmail, signOut } from '../../api/auth';
import { registerVolunteer } from '../../api/volunteers';
import { ApiClientError } from '../../api/client';

type RegistrationForm = { email: string; name: string; phone: string; registrationCode: string; skills: string };
const emptyRegistration: RegistrationForm = { email: '', name: '', phone: '', registrationCode: '', skills: '' };

export function LoginScreen({ role }: { role: Exclude<Role, null> }) {
  const app = useApp(); const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [registration, setRegistration] = useState<RegistrationForm>(emptyRegistration);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [registrationResult, setRegistrationResult] = useState<{ message: string } | null>(null);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const registrationSubmitting = useRef(false);
  const submit = (demo = false) => {
    const emailOrPhone = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) || /^\d{10}$/.test(identifier);
    if (!demo && !emailOrPhone) { app.notify('Enter a valid email or 10-digit phone number.'); return; }
    if (!demo && password.length < 4) { app.notify('Password must have at least 4 characters.'); return; }
    app.login(role);
  };
  const submitLive = async () => {
    if (!isLiveAuthConfigured()) { app.notify('Live sign-in is not configured. Use demo account.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) { app.notify('Use your email address to sign in.'); return; }
    if (password.length < 4) { app.notify('Password must have at least 4 characters.'); return; }
    setBusy(true);
    try {
      const user = await signInWithEmail(identifier.trim(), password);
      if (user.role !== role.toUpperCase()) {
        await signOut();
        app.notify('This account does not have access to that role.');
        return;
      }
      if (role === 'volunteer' && (user.volunteerApplicationStatus === 'PENDING' || user.volunteerApplicationStatus === 'DENIED')) {
        const status = user.volunteerApplicationStatus === 'DENIED' ? 'DENIED' : 'PENDING';
        app.setVolunteerApplicationStatus(status);
        app.notify(status === 'DENIED' ? 'Your volunteer application was not approved.' : 'Your volunteer application is awaiting administrator approval.');
        return;
      }
      app.loginAuthenticated(role);
    } catch (error) {
  console.error('Live sign-in failed:', error);

  const message =
    error instanceof Error
      ? error.message
      : 'Unknown sign-in error';

  app.notify(`Sign in failed: ${message}`);
}finally { setBusy(false); }
  };
  const submitRegistration = async () => {
    if (registrationSubmitting.current) return;
    if (!isLiveAuthConfigured()) { setRegistrationError('Volunteer registration is not configured.'); return; }
    const parsed = volunteerRegistrationInputSchema.safeParse({
      email: registration.email,
      name: registration.name,
      phoneE164: registration.phone.trim() || null,
      registrationCode: registration.registrationCode,
      skills: registration.skills.split(',').map(skill => skill.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];
      setRegistrationError(field === 'email' ? 'Enter a valid email address.'
        : field === 'name' ? 'Enter your full name.'
          : field === 'phoneE164' ? 'Use E.164 phone format, for example +919876543210.'
            : field === 'registrationCode' ? 'Enter a registration code (up to 64 characters).'
              : field === 'skills' ? 'Enter up to 32 unique skills, separated by commas.'
                : 'Check the registration details and try again.');
      return;
    }
    registrationSubmitting.current = true; setRegistrationBusy(true); setRegistrationError(null);
    try {
      const result = await registerVolunteer(parsed.data);
      setRegistrationResult(result); setRegistration(emptyRegistration);
    } catch (cause) {
      const messages: Record<string, string> = {
        VOLUNTEER_REGISTRATION_CONFLICT: 'An account or volunteer record already uses these details.',
        INVITE_RATE_LIMITED: 'Invitation email limit reached. Please wait before trying again.',
        INVITE_EMAIL_NOT_AUTHORIZED: 'This email cannot receive invitations with the current email settings. Contact an administrator.',
        INVITE_SERVICE_UNAVAILABLE: 'The invitation service is temporarily unavailable. Try again shortly.',
        INVITE_CONFIGURATION_ERROR: 'Invitation configuration needs administrator attention.',
        VOLUNTEER_REGISTRATION_REVIEW_REQUIRED: 'Your invitation may have been sent, but an administrator must review the application before you retry.',
        NETWORK_ERROR: 'Could not reach the API. Check your connection and try again.',
      };
      setRegistrationError(cause instanceof ApiClientError
        ? messages[cause.code] ?? 'Could not submit your application. Check your details and try again.'
        : 'Could not submit your application. Check your connection and try again.');
    } finally {
      registrationSubmitting.current = false; setRegistrationBusy(false);
    }
  };
  if (app.role === role) return <Redirect href={role === 'volunteer' ? '/volunteer/(tabs)/home' : '/donor/(tabs)/home'} />;
  return <Screen style={{ justifyContent: 'center' }}><View style={{ alignItems: 'flex-end', marginBottom: 24 }}><LanguageSwitcher /></View>
    {registerMode && role === 'volunteer' ? <>
      <Header title="Volunteer registration" subtitle="Apply to join AaharaConnect" back />
      <Card style={{ padding: 22 }}>
        {registrationResult ? <>
          <View style={{ width: 54, height: 54, borderRadius: 15, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="check" size={28} /></View>
          <T size={18} weight="700" color={C.ink} style={{ marginBottom: 8 }}>{registrationResult.message}</T>
          <T color={C.muted} style={{ marginBottom: 18 }}>Your application is pending approval. You can sign in after setting your password, but Volunteer features remain unavailable until an Admin approves you.</T>
          <Button title="Back to sign in" onPress={() => { setRegisterMode(false); setRegistrationResult(null); setRegistrationError(null); }} variant="green" />
        </> : <>
          <Field label="Email address" value={registration.email} onChangeText={email => setRegistration({ ...registration, email })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" required maxLength={254} />
          <Field label="Full name" value={registration.name} onChangeText={name => setRegistration({ ...registration, name })} autoCapitalize="words" autoComplete="name" required maxLength={200} />
          <Field label="Phone number" value={registration.phone} onChangeText={phone => setRegistration({ ...registration, phone })} keyboardType="phone-pad" placeholder="+919876543210" autoComplete="tel" />
          <Field label="Registration code" value={registration.registrationCode} onChangeText={registrationCode => setRegistration({ ...registration, registrationCode })} autoCapitalize="characters" placeholder="VOL-002" required maxLength={64} />
          <Field label="Skills" value={registration.skills} onChangeText={skills => setRegistration({ ...registration, skills })} placeholder="Driving, Packing" autoCapitalize="words" />
          {registrationError && <T color={C.red} style={{ marginBottom: 12 }}>{registrationError}</T>}
          <Button title="Submit application" onPress={() => { void submitRegistration(); }} loading={registrationBusy} disabled={registrationBusy} style={{ marginTop: 4 }} />
          <Button title="Already have an account? Sign in" onPress={() => { setRegisterMode(false); setRegistrationError(null); }} variant="quiet" disabled={registrationBusy} style={{ marginTop: 8 }} />
        </>}
      </Card>
    </> : <>
      <Header title={role === 'volunteer' ? 'Volunteer sign in' : 'Donor sign in'} subtitle="Welcome back" back />
      {role === 'volunteer' && app.volunteerApplicationStatus && <Card style={{ marginBottom: 14 }}>
        <T weight="700" color={app.volunteerApplicationStatus === 'DENIED' ? C.red : C.ink}>
          {app.volunteerApplicationStatus === 'DENIED' ? 'Volunteer application not approved' : 'Volunteer application pending approval'}
        </T>
        <T color={C.muted} style={{ marginTop: 5 }}>
          {app.volunteerApplicationStatus === 'DENIED' ? 'Your account remains available, but Volunteer features are disabled. Contact the NGO administrator for help.' : 'Your application is under review. Volunteer features will open after an Admin approves you.'}
        </T>
      </Card>}
      <Card style={{ padding: 22 }}><View style={{ width: 54, height: 54, borderRadius: 15, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name={role === 'volunteer' ? 'team' : 'food'} size={28} /></View>
        <Field label="Email or phone number" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title="Sign in" onPress={() => { if (role === 'volunteer') void submitLive(); else submit(); }} loading={role === 'volunteer' && busy} disabled={busy} style={{ marginTop: 6 }} />
        {role === 'volunteer' && isLiveAuthConfigured() && <Button title="Forgot password?" onPress={() => {
          const origin = process.env.EXPO_PUBLIC_WEB_BASE_URL;
          if (!origin) { app.notify('Password recovery is not configured for this app.'); return; }
          try {
            const url = new URL(origin);
            if (url.origin !== origin || url.protocol !== 'https:') throw new Error('Invalid recovery origin');
            void Linking.openURL(`${url.origin}/forgot-password`).catch(() => app.notify('Could not open password recovery. Try again later.'));
          } catch { app.notify('Password recovery is not configured for this app.'); }
        }} disabled={busy} variant="quiet" style={{ marginTop: 8 }} />}
        {role === 'donor' && isLiveAuthConfigured() && <Button title="Sign in to shared API" onPress={() => { void submitLive(); }} loading={busy} disabled={busy} variant="outline" style={{ marginTop: 8 }} />}
        {role === 'volunteer' && isLiveAuthConfigured() && <Button title="Register as a volunteer" onPress={() => { setRegistration(emptyRegistration); setRegistrationResult(null); setRegistrationError(null); setRegisterMode(true); }} disabled={busy} variant="outline" style={{ marginTop: 8 }} />}
        <Button title="Use demo account" onPress={() => submit(true)} disabled={busy} variant="quiet" style={{ marginTop: 8 }} />
      </Card>
    </>}
    <T size={13} color={C.muted} style={{ textAlign: 'center', marginTop: 22 }}>Together, less food waste.</T>
  </Screen>;
}
