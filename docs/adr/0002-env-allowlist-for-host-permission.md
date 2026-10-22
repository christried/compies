# Env allowlist for host permission in the MVP

Until the Platform admin UI (T3) exists, the Host permission and the Platform admin role come from env variables listing provider account IDs: `HOST_PROVIDER_IDS=discord:<id>,twitch:<id>` and `ADMIN_PROVIDER_IDS=…`. Every sign-in re-applies them to `users.canHost` and `users.isAdmin`, so removing someone from the env also revokes the right at their next sign-in. We key on Discord/Twitch user IDs instead of email because they never change and Twitch only returns an email with an extra scope. T3 makes the columns the source of truth and removes the sync; the columns exist now so T3 only adds UI.

The sync runs in Better Auth's `databaseHooks.account` create/update/delete `after` hooks (update fires on every sign-in) and recomputes both flags from all of the User's linked accounts. Permission checks always read the flags from the database, and Better Auth's `cookieCache` stays off, so a revoked right takes effect immediately.
