# Env allowlist for host permission in the MVP

In the MVP the Host permission and the Platform admin role came from env variables listing provider account IDs. We key on Discord/Twitch user IDs instead of email because they never change and Twitch only returns an email with an extra scope.

## Amendment, 2026-11-20: the Host permission moves into the app, the admin role stays in env

- `users.canHost` is the source of truth for the Host permission, granted and taken by the Platform admin on the Admin page. `HOST_PROVIDER_IDS` is gone.
- The Platform admin role stays in env: `ADMIN_PROVIDER_IDS=discord:<id>,twitch:<id>,…`. Every sign-in re-applies `users.isAdmin` from it, so removing someone from the env revokes the role at their next sign-in, and nobody gains or loses the role in the app. A sign-in that finds the role also sets `canHost`; losing the role leaves `canHost` as it was. A Platform admin always has the Host permission, so their switch on the Admin page is locked.
- The sync runs in Better Auth's `databaseHooks.account` create/update/delete `after` hooks (update fires on every sign-in) and recomputes the flags from all of the User's linked accounts. Permission checks always read the flags from the database, and Better Auth's `cookieCache` stays off, so a revoked right takes effect immediately.
- A Deleted User who signs in again is a new User without the Host permission (ADR 0020).

Rejected: granting the admin role in the app as well. It needs a first admin from somewhere and a rule that the last one cannot go, in an app with one operator; kept in env, a Platform admin cannot lock themselves out from the app.
