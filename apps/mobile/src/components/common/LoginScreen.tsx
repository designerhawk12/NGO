import React, { useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { Redirect } from 'expo-router';
import { volunteerRegistrationInputSchema } from '@aaharaconnect/shared';
import { Button, Card, Field, Header, Icon, LanguageSwitcher, Screen, T } from './UI';
import BrandLogo from './BrandLogo';
import { C } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { Role } from '../../types';
import { isLiveAuthConfigured, registerDonorWithEmailConfirmation, resendDonorConfirmation, signInWithEmail, signOut, validateDonorRegistrationInput } from '../../api/auth';
import { registerVolunteer } from '../../api/volunteers';
import { normalizeIndianPhone } from '../../api/volunteerRegistrationInput';
import { ApiClientError } from '../../api/client';
import IdentityProofPicker, { type IdentityProofDraft } from './IdentityProofPicker';
import * as Crypto from 'expo-crypto';
import ReplaceIdentity from './ReplaceIdentity';

type RegistrationForm = { email: string; name: string; phone: string };
const emptyRegistration: RegistrationForm = { email: '', name: '', phone: '' };
// Crew skills only. NGO drivers are employees invited by an Admin; there is no public driver option.
const volunteerSkillOptions = ['Food collection', 'Packing', 'Loading', 'Distribution', 'Food handling', 'Coordination', 'Other'];

export function LoginScreen({ role }: { role: Exclude<Role, null> }) {
  const app = useApp(); const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [registration, setRegistration] = useState<RegistrationForm>(emptyRegistration);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [otherSkill, setOtherSkill] = useState('');
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [registrationResult, setRegistrationResult] = useState<{ message: string } | null>(null);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donorPassword, setDonorPassword] = useState('');
  const [donorConfirmPassword, setDonorConfirmPassword] = useState('');
  const [donorRegistrationResult, setDonorRegistrationResult] = useState(false);
  const registrationSubmitting = useRef(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [resendUntil, setResendUntil] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  function startCooldown(setUntil: (value: number) => void) {
    setUntil(Date.now() + 60_000);
  }
  React.useEffect(() => {
    const next = Math.min(...[retryUntil, resendUntil].filter(value => value > 0));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => {
      if (retryUntil && retryUntil <= next) setRetryUntil(0);
      if (resendUntil && resendUntil <= next) setResendUntil(0);
    }, Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [retryUntil, resendUntil]);
  const [identityProof, setIdentityProof] = useState<IdentityProofDraft | null>(null);
  const submissionId = useRef<string | undefined>(undefined);
  const submitLive = async () => {
    if (!isLiveAuthConfigured()) { app.notify('Live sign-in is not configured.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) { app.notify('Use your email address to sign in.'); return; }
    if (!password) { app.notify('Enter your password.'); return; }
    setBusy(true);
    try {
      const user = await signInWithEmail(identifier.trim(), password);
      // One shared sign-in for Volunteers and NGO employee drivers: the server-owned role decides
      // which experience opens, never the button that was tapped.
      if (role === 'volunteer' && user.role === 'DRIVER') {
        app.loginAuthenticated('driver');
        return;
      }
      if (user.role !== role.toUpperCase()) {
        await signOut();
        app.notify('This account does not have access to that role.');
        return;
      }
      if (role === 'volunteer' && (user.volunteerApplicationStatus === 'PENDING' || user.volunteerApplicationStatus === 'DENIED')) {
        const status = user.volunteerApplicationStatus === 'DENIED' ? 'DENIED' : 'PENDING';
        app.setVolunteerApplicationStatus(status);
        app.notify(status === 'DENIED' ? 'Application not approved. Volunteer features are unavailable.' : 'Your application is under review. You can access Volunteer features after an administrator approves your application.');
        return;
      }
      app.loginAuthenticated(role);
    } catch (error) {

  const message =
    error instanceof Error
      ? error.message
      : 'Unknown sign-in error';

  app.notify(`Sign in failed: ${message}`);
}finally { setBusy(false); }
  };
  const submitRegistration = async () => {
    if (retryUntil > Date.now() || registrationSubmitting.current) return;
    if (!isLiveAuthConfigured()) { setRegistrationError('Volunteer registration is not configured.'); return; }
    const normalizedPhone = normalizeIndianPhone(registration.phone);
    if (!normalizedPhone.ok) { setRegistrationError('Enter a valid 10-digit Indian mobile number. The +91 country code is added automatically.'); return; }
    const other = otherSkill.trim();
    if (selectedSkills.includes('Other') && (!other || other.length > 100)) {
      setRegistrationError('Enter one relevant skill (up to 100 characters).'); return;
    }
    const skills = [...selectedSkills.filter(skill => skill !== 'Other'), ...(other ? [other] : [])];
    if (!identityProof?.consent || (identityProof.documentType === 'MASKED_AADHAAR' && !identityProof.maskedAadhaarConfirmed)) {
      setRegistrationError('Select identity proof and confirm processing consent. Mask the first eight Aadhaar digits if using Aadhaar.'); return;
    }
    // Reuse this submission ID for retries; never log or send the document outside the API.
    if (!submissionId.current) submissionId.current = Crypto.randomUUID();
    const parsed = volunteerRegistrationInputSchema.safeParse({
      email: registration.email,
      name: registration.name,
      phoneE164: normalizedPhone.phoneE164,
      skills,
      identityProof, submissionId: submissionId.current,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];
      setRegistrationError(field === 'email' ? 'Enter a valid email address.'
        : field === 'name' ? 'Enter your full name.'
          : field === 'phoneE164' ? 'Use E.164 phone format, for example +919876543210.'
            : field === 'skills' ? 'Choose up to 32 unique skills.'
                : field === 'identityProof' ? 'Choose a valid JPEG or PNG identity image and confirm consent.'
              : 'Check the registration details and try again.');
      return;
    }
    registrationSubmitting.current = true; setRegistrationBusy(true); setRegistrationError(null);
    try {
      const result = await registerVolunteer(parsed.data);
      setRegistrationResult(result); setRegistration(emptyRegistration); setSelectedSkills([]); setOtherSkill(''); setIdentityProof(null); submissionId.current = undefined;
    } catch (cause) {
      const messages: Record<string, string> = {
        REGISTRATION_DISABLED: 'Public Volunteer registration is disabled while invitation email delivery is being verified. Contact the NGO for help. Retrying will not submit an application.',
        VOLUNTEER_REGISTRATION_CONFLICT: 'An account already uses these details. If you already registered as a Donor, use a different email address for your Volunteer application.',
        VOLUNTEER_ALREADY_EXISTS: 'An account already uses these details. If you already registered as a Donor, use a different email address for your Volunteer application.',
        VALIDATION_ERROR: 'The API rejected the application fields. Check your name, email, phone, skills and identity image.',
        VOLUNTEER_PHONE_CONFLICT: 'This phone number already belongs to a Volunteer record. Contact the NGO for help.',
        REGISTRATION_RATE_LIMITED: 'Registration attempts are limited. Retry the same application after the registration limit clears.',
        INVITE_RATE_LIMITED: 'The email provider is temporarily limiting invitations. Wait at least one minute and retry the same application.',
        IDENTITY_TOO_LARGE: 'Use a JPEG or PNG image smaller than 500 KB.',
        IDENTITY_TYPE_INVALID: 'Choose a valid JPEG or PNG identity image and confirm consent.',
        IDENTITY_REQUIRED: 'Choose a valid JPEG or PNG identity image and confirm consent.',
        IDENTITY_STORAGE_UNAVAILABLE: 'Identity proof could not be stored. Retry the same application.',
        SUBMISSION_BUSY: 'Your application is being processed. Retry the same application shortly.',
        SUBMISSION_CONFLICT: 'Application details changed. Submit the edited application again.',
        SUBMISSION_EXPIRED: 'This application attempt expired. Contact the NGO before retrying.',
        FORBIDDEN: 'The service denied permission to submit this application.',
        INVITE_EMAIL_NOT_AUTHORIZED: 'This email cannot receive invitations with the current email settings. Contact an administrator.',
        INVITE_SERVICE_UNAVAILABLE: 'The invitation service is temporarily unavailable. Try again shortly.',
        INVITE_CONFIGURATION_ERROR: 'Invitation configuration needs administrator attention.',
        VOLUNTEER_REGISTRATION_REVIEW_REQUIRED: 'Your invitation may have been sent, but an administrator must review the application before you retry.',
        NETWORK_ERROR: 'Could not reach the API. Check your connection and try again.',
      };
      if (cause instanceof ApiClientError && cause.status === 429) startCooldown(setRetryUntil);
      if (cause instanceof ApiClientError && cause.code === 'SUBMISSION_CONFLICT') submissionId.current = undefined;
      setRegistrationError(cause instanceof ApiClientError
        ? messages[cause.code] ?? (cause.status === 429 ? messages.INVITE_RATE_LIMITED
          : cause.status >= 500 ? 'The service had a problem. Please try again shortly.'
            : 'Could not submit your application. Check your details and try again.')
        : 'Could not submit your application. Check your connection and try again.');
    } finally {
      registrationSubmitting.current = false; setRegistrationBusy(false);
    }
  };
  const submitDonorRegistration = async () => {
    if (registrationSubmitting.current) return;
    setRegistrationError(null);
    if (!isLiveAuthConfigured()) { setRegistrationError('Donor registration is not configured.'); return; }
    const validationError = validateDonorRegistrationInput(donorEmail, donorPassword, donorName, donorConfirmPassword);
    if (validationError) { setRegistrationError(validationError); return; }
    registrationSubmitting.current = true; setRegistrationBusy(true);
    try {
      await registerDonorWithEmailConfirmation(donorEmail, donorPassword, donorName);
      setDonorRegistrationResult(true);
      startCooldown(setResendUntil);
      setDonorPassword(''); setDonorConfirmPassword('');
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Could not register. Check your details and try again.');
    } finally { registrationSubmitting.current = false; setRegistrationBusy(false); }
  };
  const resendConfirmation = async () => {
    if (registrationSubmitting.current || resendUntil > Date.now()) return;
    registrationSubmitting.current = true; setRegistrationBusy(true); setResendNotice(null);
    startCooldown(setResendUntil);
    try {
      await resendDonorConfirmation(donorEmail);
      setResendNotice('If confirmation is pending, check your inbox and spam folder.');
    } catch {
      setResendNotice('Confirmation could not be requested. Wait one minute and try again.');
    } finally {
      registrationSubmitting.current = false; setRegistrationBusy(false);
    }
  };
  if (app.role === role) return <Redirect href={role === 'volunteer' ? '/volunteer/(tabs)/home' : role === 'admin' ? '/admin' : '/donor/(tabs)/home'} />;
  if (role === 'volunteer' && app.role === 'driver') return <Redirect href="/driver/(tabs)/jobs" />;
  return <Screen style={{ justifyContent: 'center' }}><View style={{ alignItems: 'flex-end', marginBottom: 24 }}><LanguageSwitcher /></View>
    {registerMode && role === 'donor' ? <>
      <BrandLogo />
      <Header title="Register as Donor" subtitle="Create your donor account" back />
      <Card style={{ padding: 22 }}>
        {donorRegistrationResult ? <>
          <T size={18} weight="700" color={C.ink} style={{ marginBottom: 8 }}>Check your email</T>
          <T color={C.muted} style={{ marginBottom: 18 }}>Follow the confirmation link to verify your email, then return here and sign in.</T>
          {resendNotice && <T color={C.muted} style={{ marginBottom: 12 }}>{resendNotice}</T>}
          <Button title={resendUntil ? 'Resend available after one minute' : 'Resend confirmation email'} onPress={() => { void resendConfirmation(); }} variant="outline" loading={registrationBusy} disabled={registrationBusy || !!resendUntil} style={{ marginBottom: 8 }} />
          <Button title="Back to sign in" onPress={() => { setRegisterMode(false); setDonorRegistrationResult(false); setResendNotice(null); setRegistrationError(null); }} variant="green" disabled={registrationBusy} />
        </> : <>
          <Field label="Name" value={donorName} onChangeText={setDonorName} autoCapitalize="words" autoComplete="name" required maxLength={200} />
          <Field label="Email address" value={donorEmail} onChangeText={setDonorEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" required maxLength={254} />
          <Field label="Password (at least 8 characters)" value={donorPassword} onChangeText={setDonorPassword} secureTextEntry required />
          <Field label="Confirm password" value={donorConfirmPassword} onChangeText={setDonorConfirmPassword} secureTextEntry required />
          {registrationError && <T color={C.red} style={{ marginBottom: 12 }}>{registrationError}</T>}
          <Button title="Create Donor account" onPress={() => { void submitDonorRegistration(); }} loading={registrationBusy} disabled={registrationBusy} />
        </>}
      </Card>
    </> : registerMode && role === 'volunteer' ? <>
      <BrandLogo />
      <Header title="Register as Volunteer" subtitle="Apply to join AahaaraConnect" back />
      <Card style={{ padding: 22 }}>
        {registrationResult ? <>
          <View style={{ width: 54, height: 54, borderRadius: 15, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="check" size={28} /></View>
          <T size={18} weight="700" color={C.ink} style={{ marginBottom: 8 }}>{registrationResult.message}</T>
          <T color={C.muted} style={{ marginBottom: 18 }}>Check your email for the password setup link. Email confirmation and administrator approval are separate; Volunteer features remain unavailable until an Admin approves your application.</T>
          <Button title="Back to sign in" onPress={() => { setRegisterMode(false); setRegistrationResult(null); setRegistrationError(null); }} variant="green" />
        </> : <>
          <Field label="Email address" value={registration.email} onChangeText={email => setRegistration({ ...registration, email })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" required maxLength={254} />
          <Field label="Full name" value={registration.name} onChangeText={name => setRegistration({ ...registration, name })} autoCapitalize="words" autoComplete="name" required maxLength={200} />
          <T size={13} color={C.muted} style={{ marginBottom: 6 }}>Enter a 10-digit Indian mobile number; +91 is added automatically.</T>
          <Field label="Indian phone number (+91)" value={registration.phone} onChangeText={phone => setRegistration({ ...registration, phone })} keyboardType="phone-pad" placeholder="9876543210" autoComplete="tel" required />
          <T weight="600" color={C.ink} style={{ marginBottom: 8 }}>Skills and interests</T>
          <IdentityProofPicker value={identityProof} onChange={proof => { setIdentityProof(proof); submissionId.current = undefined; }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
            {volunteerSkillOptions.map(skill => {
              const selected = selectedSkills.includes(skill);
              return <Button key={skill} title={selected ? `✓ ${skill}` : skill} onPress={() => {
                setSelectedSkills(current => selected ? current.filter(value => value !== skill) : [...current, skill]);
              }} variant={selected ? 'green' : 'outline'} style={{ marginRight: 8, marginBottom: 8, minHeight: 42, paddingHorizontal: 12 }} />;
            })}
          </View>
          {selectedSkills.includes('Other') && <Field label="Other skill or interest" value={otherSkill} onChangeText={setOtherSkill} autoCapitalize="sentences" maxLength={100} required />}
          <T size={13} color={C.muted} style={{ marginBottom: 14 }}>After submission, Supabase will email a password setup link. Confirming your email does not approve the application; an Admin reviews it separately.</T>
          {registrationError && <T color={C.red} style={{ marginBottom: 12 }}>{registrationError}</T>}
          <Button title="Submit application" onPress={() => { void submitRegistration(); }} loading={registrationBusy} disabled={registrationBusy || !!retryUntil} style={{ marginTop: 4 }} />
          <Button title="Already have an account? Sign in" onPress={() => { setRegisterMode(false); setRegistrationError(null); }} variant="quiet" disabled={registrationBusy} style={{ marginTop: 8 }} />
        </>}
      </Card>
    </> : <>
      <Header title={role === 'volunteer' ? 'Login as Volunteer / Driver' : role === 'admin' ? 'Administrator sign in' : 'Donor sign in'} subtitle={role === 'volunteer' ? 'Volunteers and NGO drivers use the same email sign-in.' : 'Welcome back'} back />
      <BrandLogo />
      {role === 'volunteer' && app.volunteerApplicationStatus && <Card style={{ marginBottom: 14 }}>
        <T weight="700" color={app.volunteerApplicationStatus === 'DENIED' ? C.red : C.ink}>
          {app.volunteerApplicationStatus === 'DENIED' ? 'Volunteer application not approved' : 'Volunteer application pending approval'}
        </T>
        <T color={C.muted} style={{ marginTop: 5 }}>
          {app.volunteerApplicationStatus === 'DENIED' ? 'Your account remains available, but Volunteer features are disabled. Contact the NGO administrator for help.' : 'Your application is under review. Volunteer features will open after an Admin approves you.'}
        </T>
        {app.volunteerApplicationStatus === 'PENDING' && <ReplaceIdentity />}
      </Card>}
      <Card style={{ padding: 22 }}><View style={{ width: 54, height: 54, borderRadius: 15, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name={role === 'volunteer' ? 'team' : 'food'} size={28} /></View>
        <Field label="Email address" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title="Sign in" onPress={() => { void submitLive(); }} loading={busy} disabled={busy} style={{ marginTop: 6 }} />
        {role === 'donor' && <Button title="Register as Donor" onPress={() => { setRegisterMode(true); setRegistrationError(null); }} variant="outline" style={{ marginTop: 8 }} />}
        {role === 'volunteer' && isLiveAuthConfigured() && <Button title="Register as Volunteer" onPress={() => { setRegisterMode(true); setRegistrationError(null); }} variant="outline" style={{ marginTop: 8 }} />}
        {role === 'volunteer' && isLiveAuthConfigured() && <Button title="Forgot password?" onPress={() => {
          const origin = process.env.EXPO_PUBLIC_WEB_BASE_URL;
          if (!origin) { app.notify('Password recovery is not configured for this app.'); return; }
          try {
            const url = new URL(origin);
            if (url.origin !== origin || url.protocol !== 'https:') throw new Error('Invalid recovery origin');
            void Linking.openURL(`${url.origin}/forgot-password`).catch(() => app.notify('Could not open password recovery. Try again later.'));
          } catch { app.notify('Password recovery is not configured for this app.'); }
        }} disabled={busy} variant="quiet" style={{ marginTop: 8 }} />}
      </Card>
    </>}
    <T size={13} color={C.muted} style={{ textAlign: 'center', marginTop: 22 }}>Together, less food waste.</T>
  </Screen>;
}
