// Operator-run DevTools Sources snippet on the protected candidate Donor page only.
// No deployed source change, dependency download, token output or persistent test session.
(() => {
  const approvedRoleHashes = null; // GENERATED privately from existing mapped identities
  const origin = 'https://ngo-i0tqqrcp8-equinox10.vercel.app';
  const authOrigin = 'https://pyzyxgpcfwpcqyqrihuo.supabase.co';
  if (location.origin !== origin || !location.pathname.startsWith('/donor/')) throw Error('Use the protected candidate Donor page');
  if (!approvedRoleHashes || typeof SUPABASE_ANON_KEY !== 'string') throw Error('Use the privately generated acceptance snippet');
  if (document.getElementById('aahara-private-acceptance')) throw Error('Acceptance panel already open');
  const paths = {
    ADMIN: [['/volunteers', 200], ['/pickups', 200], ['/assignments/driver', 403], ['/assignments/me', 403]],
    DONOR: [['/food-requests', 200], ['/volunteers', 403], ['/assignments/driver', 403]],
    VOLUNTEER: [['/assignments/me', 200], ['/volunteers', 403], ['/assignments/driver', 403]],
    DRIVER: [['/assignments/driver', 200], ['/vehicles/tracking', 403], ['/assignments/me', 403]],
  };
  const panel = document.createElement('section'); panel.id = 'aahara-private-acceptance';
  panel.style.cssText = 'position:fixed;inset:20px;z-index:2147483647;background:#fff;color:#111;padding:24px;overflow:auto;border:3px solid #176b39;font:16px system-ui';
  panel.innerHTML = '<h2>Private Production role acceptance</h2><p>Read-only API checks. Existing mapped accounts only. No passwords or tokens appear in results.</p><form><label>Expected role <select name="role"><option>ADMIN</option><option>DONOR</option><option>VOLUNTEER</option><option>DRIVER</option></select></label><p><button type="button" id="reuse">Test existing Admin/Donor browser session</button></p><hr><p>Volunteer/Driver: enter your existing application credentials privately.</p><label>Email <input name="email" type="email" autocomplete="username"></label><br><label>Password <input name="password" type="password" autocomplete="current-password"></label><p><button type="submit">Sign in privately and test this role</button></p></form><pre id="result" style="white-space:pre-wrap"></pre><button type="button" id="close">Close panel</button>';
  document.body.appendChild(panel);
  const form = panel.querySelector('form'), result = panel.querySelector('#result');
  const reports = Object.create(null); let busy = false;
  const show = value => { result.textContent = JSON.stringify(value, null, 2); };
  const hash = async id => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)))].map(x => x.toString(16).padStart(2, '0')).join('');
  async function run(expected, token) {
    const verified = await fetch(authOrigin + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }, cache: 'no-store' });
    if (!verified.ok) throw Error('Current authenticated session could not be verified');
    const user = await verified.json();
    if (!user.id || !approvedRoleHashes[expected]?.includes(await hash(user.id))) throw Error('Account is not pre-approved for this role; /me was NOT called');
    const read = async path => {
      const response = await fetch('/api/v1' + path, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      const body = await response.json(); return { status: response.status, body };
    };
    const me = await read('/me');
    if (me.status !== 200 || me.body.data?.role !== expected || me.body.data?.authUserId !== user.id) throw Error('Existing account identity/role verification failed');
    const checks = [{ path: '/me', status: me.status, role: me.body.data.role, identityMatches: true, passed: true }];
    for (const [path, expectedStatus] of paths[expected]) {
      const response = await read(path); checks.push({ path, status: response.status, expectedStatus, passed: response.status === expectedStatus });
      if (response.status !== expectedStatus) break;
    }
    const report = { role: expected, result: checks.length === paths[expected].length + 1 && checks.every(x => x.passed) ? 'PASS' : 'FAIL', checks };
    reports[expected] = report; show({ current: report, completed: Object.values(reports).map(x => ({ role: x.role, result: x.result })) });
  }
  panel.querySelector('#reuse').onclick = async () => {
    if (busy) return; busy = true;
    try {
      const role = form.elements.role.value; let token;
      if (role === 'ADMIN') token = JSON.parse(localStorage.getItem('sb-pyzyxgpcfwpcqyqrihuo-auth-token') || 'null')?.access_token;
      if (role === 'DONOR') token = localStorage.getItem('aaharaconnect-donor-token:' + authOrigin + '/auth/v1');
      if (!token) throw Error('No existing session for this role; use private sign-in below');
      await run(role, token); token = undefined;
    } catch (error) { show({ result: 'STOP', reason: error.message }); }
    finally { busy = false; }
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return; busy = true; let token;
    try {
      const expected = form.elements.role.value, email = form.elements.email.value.trim(), password = form.elements.password.value;
      form.elements.password.value = '';
      if (!email || !password) throw Error('Enter existing credentials privately');
      const response = await fetch(authOrigin + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const session = await response.json(); if (!response.ok || !session.access_token) throw Error('Private sign-in rejected (HTTP ' + response.status + ')');
      token = session.access_token; await run(expected, token);
    } catch (error) { show({ result: 'STOP', reason: error.message }); }
    finally {
      if (token) {
        // Close only this newly created temporary sign-in; reused browser sessions are untouched.
        try { await fetch(authOrigin + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } }); } catch { /* Report no session-secret material. */ }
        token = undefined;
      }
      busy = false;
    }
  };
  panel.querySelector('#close').onclick = () => { if (!busy) panel.remove(); };
})();
