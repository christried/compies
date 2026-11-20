# Env allowlist for host permission in the MVP

Until the Platform admin UI (T3) exists, the Host permission and the Platform admin role come from env variables listing provider account IDs: `HOST_PROVIDER_IDS=discord:<id>,twitch:<id>` and `ADMIN_PROVIDER_IDS=…`. Every sign-in re-applies them to `users.canHost` and `users.isAdmin`, so removing someone from the env also revokes the right at their next sign-in. We key on Discord/Twitch user IDs instead of email because they never change and Twitch only returns an email with an extra scope. T3 makes the columns the source of truth and removes the sync; the columns exist now so T3 only adds UI.

The sync runs in Better Auth's `databaseHooks.account` create/update/delete `after` hooks (update fires on every sign-in) and recomputes both flags from all of the User's linked accounts. Permission checks always read the flags from the database, and Better Auth's `cookieCache` stays off, so a revoked right takes effect immediately.

## Amendment, 2026-11-20: the Host permission moves into the app, the admin role stays in env

Decided in the grilling for 0.24 „Admin page“ (Idea issue #682). From 0.24 the Platform admin grants and takes the Host permission on the Admin page; the Platform admin role itself stays where it is.

- `users.canHost` becomes the source of truth. The sign-in stops reading `HOST_PROVIDER_IDS`, and the variable goes. The flags are already stored, so the cut needs no migration.
- `ADMIN_PROVIDER_IDS` stays as above: every sign-in re-applies `users.isAdmin` from it, and nobody gains or loses the role in the app. A sign-in that finds the role also sets `canHost`; losing the role leaves `canHost` as it was. A Platform admin always has the Host permission, so their switch on the Admin page is locked.
- An id on the old host list that never signed in gets nothing from it: the Platform admin grants the permission in the app after that User's first sign-in.
- A Deleted User who signs in again is a new User without the Host permission. This replaces the consequence ADR 0020 drew from the list.

Considered: the admin role granted in the app as well. Rejected, because it needs a first admin from somewhere and a rule that the last one cannot go, in an app with one operator. Kept in env, a Platform admin cannot lock themselves out from the app.
