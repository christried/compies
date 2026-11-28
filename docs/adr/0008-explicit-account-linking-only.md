# Explicit account linking only, placeholder emails for missing ones

> The linking rule is superseded by ADR 0009 (link by verified email). The placeholder emails still apply.

Better Auth requires an email on every User, but Twitch returns none for unverified emails and Discord none for phone-only accounts. Such Users get a placeholder `<providerAccountId>@<provider>.placeholder.invalid`. Email is never shown, never used to contact anyone and never used for authorization; identity is the provider account ID (see ADR 0002).
