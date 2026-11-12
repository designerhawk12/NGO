-- Operator-reviewed snapshot only. Run on the positively identified target.
-- SELECT-only: no migrations, locks, configuration changes or password fields.
-- Keep any resulting identity-set fingerprints private; do not publish record payloads.
SELECT current_database() AS database, current_user AS runtime_role,
       session_user AS connection_role, version() AS version;
SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls
FROM pg_roles WHERE rolname IN (current_user, 'aaharaconnect_api');
SELECT name, checksum, applied_at FROM app.schema_migrations ORDER BY name;
SELECT role, count(*) FROM app.app_users GROUP BY role ORDER BY role;
SELECT count(*) AS auth_users FROM auth.users;
SELECT count(*) AS missing_auth_links FROM app.app_users a
LEFT JOIN auth.users u ON u.id=a.auth_user_id WHERE u.id IS NULL;
SELECT count(*) AS unmapped_auth_users FROM auth.users u
LEFT JOIN app.app_users a ON a.auth_user_id=u.id WHERE a.id IS NULL;
-- Compare before/after in a controlled maintenance window; contains no passwords.
SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id),'')) AS auth_uuid_set
FROM auth.users;
SELECT md5(coalesce(string_agg(id::text || ':' || auth_user_id::text || ':' || role::text,
                            ',' ORDER BY id),'')) AS app_uuid_role_set
FROM app.app_users;
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='app' AND c.relkind='r' ORDER BY c.relname;
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname IN ('app','storage') ORDER BY schemaname,tablename,policyname;
SELECT r.rolname, has_schema_privilege(r.rolname,'app','USAGE') AS app_usage,
       has_schema_privilege(r.rolname,'app','CREATE') AS app_create
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','authenticator','service_role',current_user);
SELECT conrelid::regclass::text AS relation, conname, convalidated
FROM pg_constraint WHERE connamespace='app'::regnamespace AND NOT convalidated;
SELECT tgrelid::regclass::text AS relation, tgname, tgenabled
FROM pg_trigger WHERE tgrelid IN
  (SELECT oid FROM pg_class WHERE relnamespace='app'::regnamespace)
AND NOT tgisinternal ORDER BY tgname;
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;
SELECT bucket_id, count(*) FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id;
-- Privileged metadata snapshot above is NOT a runtime-role test. Separately use
-- the actual restricted connection to verify current_user, app SELECT/RLS access,
-- and denied schema CREATE/ledger/auth access without writing business records.
