# "Session" means a game Session; Better Auth's tables are renamed

Better Auth ships a `session` table for login sessions, which collides with our core domain term. We keep **Session** for the game night and rename Better Auth's models via `modelName`: `user` → `users` (also our domain User, extended with `displayName`, `canHost`, `isAdmin`), `session` → `auth_sessions`, `account` → `auth_accounts`, `verification` → `auth_verifications`. In code, a bare "session" always means a game Session; a login session is always called `authSession`.

Better Auth's core `name` and `image` mirror the provider and are overwritten at every sign-in, so avatars stay fresh. The name a User picks in profile setup lives in our own `displayName` column, which Better Auth never touches; `displayName IS NULL` means profile setup is not finished.

The naming rule above is superseded by ADR 0011: a bare "session" now means one sitting of an Event.
