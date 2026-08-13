# StarRocks-side setup (reference for the StarRocks team)

> **Nebula never executes anything in this document.** The app connects with
> whatever identity the user brings and relies entirely on StarRocks-side
> configuration owned by the StarRocks team. This file exists so that team has
> a precise, copy-pasteable reference for what Nebula's JWT passthrough needs.

Nebula authenticates users via OIDC (authentik) and passes the user's
**id_token** to StarRocks over the MySQL protocol, so StarRocks sees the real
user for audit and RBAC. Requirements: **StarRocks ≥ 3.5**.

## 1. JWT security integration (no pre-created users)

```sql
CREATE SECURITY INTEGRATION authentik_jwt PROPERTIES (
    "type" = "authentication_jwt",
    -- authentik: per-application JWKS endpoint
    "jwks_url" = "https://<authentik-host>/application/o/<app-slug>/jwks/",
    -- must match the claim Nebula uses as the username (lowercased)
    "principal_field" = "preferred_username",
    "required_issuer" = "https://<authentik-host>/application/o/<app-slug>/",
    "required_audience" = "<oidc-client-id>",
    "comment" = "authentik OIDC for Nebula"
);

-- JWT must be the FIRST non-native entry: the FE asks the client for the auth
-- plugin of the first non-native integration in the chain, so an LDAP entry
-- placed before this one would break JWT logins.
ADMIN SET FRONTEND CONFIG ("authentication_chain" = "native,authentik_jwt");
ADMIN SHOW FRONTEND CONFIG LIKE 'authentication_chain';
```

Users authenticated this way are ephemeral (nothing persisted per user).
Authorization comes from grants — either to pre-created users (below) or to
external groups via a group provider (`GRANT <role> TO EXTERNAL GROUP <g>`;
group providers support ldap/unix/file — JWT claims are NOT a group source, so
an authentik LDAP outpost or a generated file provider is needed for groups).

### Alternative: pre-created users

```sql
CREATE USER alice IDENTIFIED WITH authentication_jwt AS
'{
  "jwks_url": "https://<authentik-host>/application/o/<app-slug>/jwks/",
  "principal_field": "preferred_username",
  "required_issuer": "https://<authentik-host>/application/o/<app-slug>/",
  "required_audience": "<oidc-client-id>"
}';
GRANT <role> TO USER alice;
```

## 2. TLS on the MySQL port

The JWT crosses the wire as cleartext inside the handshake. Enable SSL on the
FE MySQL port and force it (localhost is exempted by the FE):

```
# fe.conf
ssl_force_secure_transport = true
```

Nebula sets `ssl` on its connections; provide the CA if the cert is private.

## 3. authentik provider requirements (IdP team)

- **RSA signing key selected** on the OAuth2 provider (RS256). Without it,
  authentik signs with HS256/client-secret and StarRocks' JWKS check fails.
- Scopes: `openid profile email offline_access` — `offline_access` issues the
  refresh token Nebula uses to mint fresh id_tokens for long sessions.
- Redirect URI: `https://<nebula-host>/auth/callback`.

## 4. Optional (feature enablement, not required for login)

```sql
-- Query profiles for slow queries (powers Nebula's execution plan overlay)
SET GLOBAL big_query_profile_threshold = '30s';
```

- FE dynamic config `profile_info_format = json` (if available on the build)
  makes profiles JSON — Nebula falls back to text parsing without it.
- A read-only **service account** (native password auth) for Nebula's schema
  cache and FE HTTP calls, e.g. `nebula_svc` with SELECT on
  `information_schema` — service accounts cannot use JWT.
- AuditLoader plugin, if the query-history feed should include queries older
  than the FE's in-memory window.
