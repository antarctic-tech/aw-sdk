# @antarctic-wallet/aw-sdk

**English** · [Русский](./README.ru.md)

[![npm](https://img.shields.io/npm/v/@antarctic-wallet/aw-sdk.svg)](https://www.npmjs.com/package/@antarctic-wallet/aw-sdk)
[![license](https://img.shields.io/npm/l/@antarctic-wallet/aw-sdk.svg)](./LICENSE)

SDK for embedded mini-apps in Antarctic Wallet (AW). It handles the secure
iframe-to-parent channel, the handshake, session and scope management, and
asking the wallet to show its **native** confirmation sheet for an operation.
It also reads the host environment (theme, language, safe area, visibility) and
calls host features: the QR scanner, haptics, the page background color, and
opening another mini-app.

Zero runtime dependencies. Works in an iframe and in a React Native WebView.

## Runnable examples

Full end-to-end starters (frontend + partner backend + Docker) live in a separate repo:

| Stack          | Example                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Vue 3          | [examples/vue](https://github.com/antarctic-tech/example-app/tree/master/examples/vue)                   |
| React          | [examples/react](https://github.com/antarctic-tech/example-app/tree/master/examples/react)               |
| Angular        | [examples/angular](https://github.com/antarctic-tech/example-app/tree/master/examples/angular)           |
| Backend (Node) | [examples/backend-node](https://github.com/antarctic-tech/example-app/tree/master/examples/backend-node) |

- Repository: **[antarctic-tech/example-app](https://github.com/antarctic-tech/example-app)**
- Machine-readable spec for AI coding tools: [AGENTS.md](https://github.com/antarctic-tech/example-app/blob/master/AGENTS.md)

If you are starting from scratch, copy one scenario file from an example rather
than assembling the flow from this README.

## How the pieces fit

Three parties. Do not merge them.

```
Wallet (AW)            Mini app (browser)        YOUR backend
───────────            ──────────────────        ────────────
iframe + native UI     your frontend + SDK       app secret, sessions
confirmation sheet     postMessage to wallet     calls to the AW API
```

1. The wallet opens your frontend in an iframe and passes `?parentOrigin=`.
2. The frontend creates an `AWSDK` and calls `init()`.
3. **Your backend** creates the operation (`POST {AW_API_BASE}/api/apps/v1/intents`)
   with the app secret. The browser never sees that secret.
4. The frontend only asks the wallet to confirm the resulting id:
   `sdk.operations.requestConfirmation(operationId)`.

## Install

```bash
npm install @antarctic-wallet/aw-sdk
```

## Quick start

```typescript
import { AWSDK, AWScope } from "@antarctic-wallet/aw-sdk";

const sdk = new AWSDK({
  appId: "my-mini-app", // the `id` from your mini-app config.json
  scopes: [AWScope.USER_DATA, AWScope.PAY],
  parentOrigin: resolveParentOrigin(),
  persistSession: true,
});

// Subscribe BEFORE init() — `sdk.ready` fires during it.
sdk.events.on("sdk.ready", (session) => {
  console.log("granted scopes:", session.grantedScopes);
  console.log("idToken:", sdk.idToken); // signed JWT — forward to YOUR backend
});

sdk.events.on("sdk.error", ({ code, message }) => {
  console.error("SDK is dead:", code, message);
});

await sdk.init();

// on unmount / beforeunload
sdk.destroy();
```

## Configuration

```typescript
interface AWSDKConfig {
  /** Mini-app id issued by AW (same value as `id` in config.json) */
  appId: string;
  /** Scopes requested at handshake time */
  scopes: string[];
  /** Expected wallet origin — postMessage is never sent anywhere else */
  parentOrigin: string;
  /** Debug logging. Default: false */
  debug?: boolean;
  /** postMessage response timeout in ms. Default: 30000 */
  timeout?: number;
  /** Keep the session in sessionStorage and restore it on reload. Default: true */
  persistSession?: boolean;
  /** Retry policy for timed-out requests. Default: { maxAttempts: 3, baseDelay: 1000 } */
  retry?: { maxAttempts?: number; baseDelay?: number };
}
```

`retry` applies to the handshake, session refresh and scope calls. It is
deliberately **not** applied to `requestConfirmation`, which waits for a human.

### `parentOrigin`

`parentOrigin` is a security boundary: the SDK posts messages to that origin and
ignores messages from anywhere else. Never hardcode a single value — resolve it
in this order:

```typescript
function resolveParentOrigin(): string {
  const fromQuery = new URLSearchParams(location.search).get("parentOrigin");
  if (fromQuery) return fromQuery;
  if (document.referrer) return new URL(document.referrer).origin;
  return "https://your-dev-wallet.example"; // dev fallback only
}
```

The wallet always passes `?parentOrigin=` and the launch environment
(`awPlatform`, `awColorScheme`, `awLanguageCode`). If you use a router, prefer a
hash router (`#/pay`) so the query string survives navigation.

### Is the app running inside the wallet?

```typescript
if (!AWSDK.isInsideWallet()) {
  // opened directly in a browser tab — show a "open me in Antarctic Wallet" screen
}
```

Returns `true` inside an iframe or a React Native WebView.

## Scopes

```typescript
import { AWScope } from "@antarctic-wallet/aw-sdk";

AWScope.USER_DATA; // 'userData' — profile + KYC flags in the id_token
AWScope.BALANCE; // 'balance'  — the user's balance
AWScope.PAY; // 'pay'      — the user pays you
```

`receive` is **not** a scope: it is an intent type (you paying the user), and it
requires no scope at all. Asking for `pay` does not enable payouts, and payouts
do not need the user to grant anything.

```typescript
const granted = await sdk.scopes.getScopes(); // string[]
const data = await sdk.scopes.getData<MyScopeData>(); // scope payload from the host
```

The scopes you pass to `new AWSDK({ scopes })` are what the handshake requests.
The `requiredScopes` field in your mini-app `config.json` is a manifest for the
wallet catalogue — it is **not** read by the SDK.

To ask for more scopes later, create a `scopes` intent on your backend and
confirm it like any other operation; the SDK emits `scopes.granted` afterwards.

## Authenticating the user (OIDC `id_token`)

`sdk.idToken` is a signed JWT whose `sub` is an opaque per-app login. It is the
**only** value that may authenticate the user on your backend. `sdk.user` /
`session.userContext` is decoded from that token inside the mini-app _without_
verifying the signature — treat it as UI-only data (`displayName` is the `sub`
on purpose, not a personal name).

```typescript
// In the mini-app — forward the token to your own backend:
await fetch("/api/auth/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idToken: sdk.idToken }),
});
```

```typescript
// On YOUR backend — verify the signature against the host JWKS, then trust `sub`:
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(new URL(`${AW_API_BASE}/api/v2/sdk/jwks`));
const { payload } = await jwtVerify(idToken, jwks, {
  issuer: "aw",
  audience: AW_APP_ID,
});
const userId = payload.sub; // trusted — cannot be forged without AW's private key
```

`idToken` may be `null` while the session is still pending (no granted scopes
yet) or when an older host has not issued one — always null-check before use.
It rotates with the session (TTL ~600s); read the fresh value from `sdk.idToken`
or from the `session.refreshed` event.

## Operations (pay / receive / scopes)

The mini-app **never** creates an operation itself. Your backend does, with the
app secret, and the frontend only asks the wallet to confirm the returned id.

```
Mini app                    YOUR backend                     AW
   │  idToken + amount          │                             │
   │ ─────────────────────────► │  POST /api/apps/v1/intents  │
   │                            │ ──────────────────────────► │
   │       { operationId }      │                             │
   │ ◄───────────────────────── │                             │
   │
   │  sdk.operations.requestConfirmation(operationId)
   ▼
Wallet shows its native sheet: the user confirms or rejects
```

| Type      | Meaning                                                        | Confirmation                              |
| --------- | -------------------------------------------------------------- | ----------------------------------------- |
| `pay`     | The user pays you (purchase, donation)                         | Yes — native sheet in the wallet          |
| `receive` | You pay the user (refund, payout). Not a scope, and needs none | No — already executed in the API response |
| `scopes`  | Ask for additional permissions                                 | Yes — native sheet in the wallet          |

```typescript
// 1. Your backend creates the intent and returns its id
const { operationId, status } = await fetch("/api/intents", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idToken: sdk.idToken, type: "pay", amount: "5.00" }),
}).then((r) => r.json());

// 2. `receive` is already done; `pay` and `scopes` need the wallet sheet
if (status === "pending") {
  const result = await sdk.operations.requestConfirmation(operationId);
  // result: { operationId, status, txId? }
}
```

`AWOperationStatus` is `'pending' | 'awaiting_confirmation' | 'confirmed' |
'succeeded' | 'failed' | 'rejected'`. A user rejection is delivered **as a
thrown `AWOperationError`** with `errorCode === 'user_rejected'`, and also as
the `operation.rejected` event.

In production, settle the order from an
[outbound webhook](#outbound-webhooks) (`intent.approved`, `intent.rejected`,
`payment.succeeded`, `payment.failed`) — not from what the browser tab
reported. The tab can be closed mid-flow. Signature checks and idempotency are
in that section; a runnable handler is in the
[backend example](https://github.com/antarctic-tech/example-app/tree/master/examples/backend-node).

Where the money goes — the app account, the cooling period, top-up and
withdrawal — is in [Money flow](#money-flow).

> **Removed in 0.4.0:** `sdk.operations.prepare()`. Creating an operation from
> the browser was never safe, and the wallet-side flow requires a server-created
> intent. See [Migration](#migrating-from-03x).

<a id="outbound-webhooks"></a>

## Outbound webhooks

When `webhook_url` is set, Antarctic Wallet sends a server-to-server `POST` to
that URL. You set the URL in **AppAdmin → Parameters** (Параметры). The JS SDK cannot set
it, and it does not receive or verify these calls — only your backend does.

The signature key is the **`app_secret`** issued with `appId`. There is no
separate webhook secret.

One outcome produces one webhook. A treasury top-up or withdrawal does not
produce one.

### Events

| Intent / action   | Outcome              | `event`              |
| ----------------- | -------------------- | -------------------- |
| `pay`             | The user confirmed   | `intent.approved`    |
| `pay`             | The user rejected    | `intent.rejected`    |
| `receive`         | The payout succeeded | `payment.succeeded`  |
| `receive`         | The payout failed    | `payment.failed`     |
| App status change | —                    | `app.status_changed` |

A successful `receive` is only `payment.succeeded`. A failed `receive` is only
`payment.failed`.

#### Intent status (`data.status`)

`pending` | `approved` | `rejected` | `failed` | `expired`

| `data.status` | Meaning                                                      | Webhook                                                    |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| `pending`     | Waiting on the user (typical for `pay`), or not executed yet | none                                                       |
| `approved`    | The transfer went through                                    | `pay` → `intent.approved`; `receive` → `payment.succeeded` |
| `rejected`    | The user declined the confirmation sheet                     | `pay` → `intent.rejected`                                  |
| `failed`      | Execution failed (typical for an automatic `receive`)        | `receive` → `payment.failed`                               |
| `expired`     | The TTL elapsed with no approve or reject                    | none                                                       |

`rejected` is a human refusal. `failed` is a platform, limit, or balance error.
There is no separate payment-status enum: `payment.succeeded` and
`payment.failed` are event names. The body is still the intent, with
`data.status` `approved` or `failed`.

#### App status (`app.status_changed`)

`data.status` and `data.previous_status` are the raw enum. AppAdmin may show
`published` as `active`; the webhook does not.

| `status`    | Meaning                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| `published` | The app is operating normally                                                             |
| `suspended` | Soft block: the app and its sessions stay up, withdrawals from the app account are frozen |
| `blocked`   | Hard stop: sessions are killed                                                            |
| `removed`   | Taken down                                                                                |

### HTTP

```
POST {webhook_url}
Content-Type: application/json
X-Sdk-Webhook-Timestamp: <unix seconds>
X-Sdk-Webhook-Signature: hex(HMAC-SHA256(app_secret, "{ts}.{sha256(raw_body)}"))

Body: { "event": "<type>", "data": { … } }
```

1. `body_hash = SHA256.hexdigest(raw_body)` — lowercase hex of the exact bytes AW sent.
2. `signed = "{timestamp}.{body_hash}"`.
3. `signature = HMAC-SHA256.hexdigest(app_secret, signed)`.

Reject the request when `|now − timestamp| > 5 minutes`. Respond **2xx** only
after you accept the event. Any other status is a failure, and AW retries up
to 6 times: immediately, then after 5s, 30s, 1m, 10m, and 2h.

Delivery is at-least-once. Deduplicate an intent or payment event by
`data.operation_id` + `event`. Deduplicate `app.status_changed` by
`data.app_id` + `data.changed_at`.

Blank fields may be omitted.

#### Intent and payment `data`

| Field            | Meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| `operation_id`   | Intent UUID                                                   |
| `reference_id`   | Your idempotency key, when you sent one                       |
| `type`           | `pay` or `receive`                                            |
| `status`         | Intent status, see above                                      |
| `approved_at`    | ISO 8601, once the intent is approved                         |
| `data`           | The intent payload (`amount` and the rest of what you stored) |
| `user_app_login` | Opaque per-app login, 16 hex characters. Not a global user id |
| `failure_reason` | Why the payout failed. Present on `payment.failed`            |

`intent.approved` after a confirmed `pay`:

```json
{
  "event": "intent.approved",
  "data": {
    "operation_id": "9b1de7c2-6e3f-4a32-8dc1-e9c0aa5c7b1a",
    "reference_id": "order-1",
    "type": "pay",
    "status": "approved",
    "approved_at": "2026-04-28T12:34:56Z",
    "data": { "amount": "50.00" },
    "user_app_login": "a1b2c3d4e5f60718"
  }
}
```

`payment.succeeded` after a successful `receive` has the same shape, with
`"event": "payment.succeeded"` and `"type": "receive"`. A failed payout:

```json
{
  "event": "payment.failed",
  "data": {
    "operation_id": "3f8a1c90-1d2e-4b55-9a01-77c4e2b8d6f0",
    "reference_id": "payout-42",
    "type": "receive",
    "status": "failed",
    "data": { "amount": "10.00" },
    "user_app_login": "a1b2c3d4e5f60718",
    "failure_reason": "TRANSFER_FAILED"
  }
}
```

`app.status_changed`:

```json
{
  "event": "app.status_changed",
  "data": {
    "app_id": "48291037",
    "status": "suspended",
    "previous_status": "published",
    "changed_at": "2026-04-28T13:00:00Z"
  }
}
```

### Verifying the signature (Node.js)

Hash the **raw body**. Parsing JSON and stringifying it again changes the bytes
and the signature will not match. The key is `appSecret` — the same secret as
`appId`.

```javascript
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SEC = 5 * 60;

export function verifyAwWebhook(rawBody, timestamp, signature, appSecret) {
  if (!timestamp || !signature || !appSecret) return false;

  const ts = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SEC) return false;

  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const expected = createHmac("sha256", appSecret)
    .update(`${timestamp}.${bodyHash}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Node lower-cases incoming header names:
//   x-sdk-webhook-timestamp, x-sdk-webhook-signature
// Express: app.use(express.raw({ type: 'application/json' }))
// and pass req.body through unchanged.
```

Respond `2xx` after the check passes and you have recorded the event. On a
duplicate `operation_id` + `event`, respond `2xx` again and do not apply the
effect twice.

### In AppAdmin

The URL is edited under Parameters (Параметры). From the same screen you can
download delivery logs for the last hour and for recent days.

<a id="money-flow"></a>

## Money flow

Each mini-app has one account: its own balance, kept apart from the developer's
personal balance. The API returns that balance in different currencies. For now
the response includes only USD.

A `scopes` intent does not move funds.

### The user and the app account

```mermaid
flowchart LR
  User[User balance]
  Account[App account]

  User -- "Payment, confirmed in the wallet" --> Account
  Account -- "Payout, no extra confirmation" --> User
```

#### Payment — the user pays the app

Money moves from the user's balance to the app account. Your backend creates
a `pay` intent; the wallet asks the user to confirm, and the transfer happens
only after the user confirms. Transfers require the `pay` scope.

The amount moved from the user's balance to the app account is held on the app
account for the cooling period. It is already on the account, but those funds
cannot yet be used for a payout or a withdrawal to the developer's account.

#### Payout — the app pays the user

Money moves from the app account to the user's balance. Your backend creates
a `receive` intent. There is no confirmation sheet: when the API responds, the
transfer is already done.

Only the **available** amount on the app account can be paid out.

### The developer and the app account

```mermaid
flowchart LR
  Dev[Developer balance]
  Account[App account]

  Dev -- "Top-up, confirmed in the wallet" --> Account
  Account -- "Withdrawal of the available amount, confirmed in the wallet" --> Dev
```

#### Top-up — the developer funds the app account

The developer transfers money from their personal balance to the app account
and confirms the transfer in the wallet. The cooling period does not apply to
this deposit: the amount is available for the app to use as soon as it is
credited. That is how you fund payouts while payments from users are still
cooling.

#### Withdrawal — the developer takes money out

The developer can withdraw only the **available** amount, and only back to
their own balance. The withdrawal is confirmed in the wallet. A withdrawal to
someone else's balance is not possible.

### Cooling period

The cooling period applies only to payments from users. It does not apply to
deposits the developer makes into the app account.

```mermaid
sequenceDiagram
  participant User as User balance
  participant Account as App account

  User->>Account: Payment confirmed
  Note over Account: Account balance increases
  Note over Account: That payment stays unavailable until cooling ends
  Note over Account: Cooling ends — the payment becomes available
  Account->>User: Payout from the available amount only
```

| Funds in the app account              | Available to pay out or withdraw |
| ------------------------------------- | -------------------------------- |
| User payment still cooling            | No                               |
| User payment after the cooling period | Yes                              |
| Developer deposit                     | Yes, immediately                 |

The available amount is the app account balance minus user payments that are
still cooling. Payouts and withdrawals both use only this amount.

### App account balance

Your backend reads the app account over the same server-to-server auth as
intents: header `X-AW-App-Id` and `Authorization: Bearer <app_secret>`. The
authenticated app is the account. The call does not use the user, a user login,
or the `balance` scope — that scope is the user's own balance.

```
GET {AW_API_BASE}/api/apps/v1/balance
```

The response is an array, one element per currency. For now it contains a single
element, USD. The next currency is another element of the same array; the
response shape does not change.

The account holds 100 USD, of which 30 are on hold and 70 are available:

```json
[
  {
    "asset": "USD",
    "total": { "amount": 100, "scale": 0 },
    "available": { "amount": 70, "scale": 0 },
    "locked": { "amount": 30, "scale": 0 }
  }
]
```

| Field       | Meaning                              |
| ----------- | ------------------------------------ |
| `asset`     | Currency. Only `USD` for now         |
| `total`     | App account balance in this currency |
| `locked`    | Amount on hold for this account      |
| `available` | `max(total − locked, 0)`             |

Amounts are `{ amount, scale }`: 100 whole units is `{ "amount": 100, "scale": 0 }`.
`available` and `locked` are the same numbers as the available amount and the
cooling hold above.

### App status

| Status    | Users can pay the app | App can pay users              | Developer can top up | Developer can withdraw                      |
| --------- | --------------------- | ------------------------------ | -------------------- | ------------------------------------------- |
| Active    | Yes                   | Yes, from the available amount | Yes                  | Yes, the available amount, own balance only |
| Suspended | Yes                   | No                             | Yes                  | No                                          |
| Blocked   | No                    | No                             | No                   | No                                          |

Suspension stops payouts and withdrawals. The app can still accept user
payments, and the developer can still top the app account up.

## Session management

The session auto-refreshes 60 seconds before it expires. Manual control:

```typescript
const session = sdk.getSession(); // AWSession | null

const status = await sdk.status();
// { status: 'active' | 'expired' | 'revoked', idToken, grantedScopes, expiresAt }

await sdk.refreshSession(); // emits 'session.refreshed'
```

With `persistSession: true` (the default) the session is stored in
`sessionStorage` under a per-`appId` key and restored on reload without a full
handshake. `destroy()` clears that entry — it is a teardown, not a pause.

## Back button

Control the host container's back button. When shown, the host header swaps
"Close" for a back arrow. Pressing it only delivers an event to your app:
navigation stays entirely on your side and the container stays open.

```typescript
sdk.backButton.show(); // header shows the back arrow
sdk.backButton.hide(); // header returns to "Close"
sdk.backButton.isVisible; // boolean

const handler = () => router.back();
sdk.backButton.onClick(handler);
sdk.backButton.offClick(handler);
```

On Android the hardware back button follows the same contract while the arrow is
visible. `show()` and `hide()` before `init()` are remembered and sent once the
channel is open (after the handshake, or after a restored session). A retried
handshake resends the arrow if it should stay visible. `destroy()` hides the
arrow and drops every handler.

## Start parameter

`sdk.startParam` is the `start_param` the wallet passed when it opened this
mini-app. Read it after `init()`. It belongs to this opening, not to the launch
query and not to the session.

```typescript
await sdk.init();

if (sdk.startParam) {
  openOrder(sdk.startParam);
}
```

At most 512 characters, alphabet `A-Za-z0-9_-`. When the host opens the app
without a parameter, the getter is `null`. A missing field, `null`, and `""`
are that same empty value and stay quiet. A string outside the alphabet or
length also becomes `null` and logs a console warning. The SDK does not throw,
`init()` still resolves, and `sdk.error` is not emitted.

The SDK does not read `start_param` or `tgWebAppStartParam` from the page URL.
The host sends an already validated string in the `start_param` field of
`SDK_INIT_OK`, and of `SESSION_STATUS` when a saved session is restored.
`refreshSession()` and another `init()` do not change the getter. `destroy()` clears it.

## Host Environment

Theme, language, platform, safe area and visibility of the host container.
Platform, theme and language are known before `init()`; safe area and visibility
are filled in by the time `await sdk.init()` returns. Events fire on every change
afterwards. An older wallet that sends no snapshot does not block `init()` and does
not emit `sdk.error`: launch values stay as they were, safe area stays unset, and
`isActive` stays `true`.

### Launch query

Read as soon as `new AWSDK()` returns, before any postMessage:

```
?awPlatform=ios&awColorScheme=dark&awLanguageCode=pt-BR
```

| Parameter        | Property       | Values                                                 |
| ---------------- | -------------- | ------------------------------------------------------ |
| `awPlatform`     | `platform`     | `web`, `tma`, `ios`, `android`                         |
| `awColorScheme`  | `colorScheme`  | `light`, `dark` — a system setting is already resolved |
| `awLanguageCode` | `languageCode` | BCP 47: `ru`, `en`, `kk`, `pt-BR`, …                   |

Unknown values are ignored. Safe area and visibility are not in the URL. `isActive`
starts as `true` and stays that way if the host never sends visibility. Keep these
parameters across navigations the same way as `parentOrigin`.

### Properties

| Property        | Event                      | Meaning                                                  |
| --------------- | -------------------------- | -------------------------------------------------------- |
| `platform`      | —                          | `web`, `tma`, `ios`, `android`                           |
| `colorScheme`   | `themeChanged`             | `light` / `dark`, system mode already resolved           |
| `languageCode`  | `languageChanged`          | wallet UI language, BCP 47: `ru`, `en`, `kk`, `pt-BR`, … |
| `safeAreaInset` | `safeAreaChanged`          | `{ top, right, bottom, left }` inside the container      |
| `isActive`      | `activated`, `deactivated` | the app is on screen and the wallet is in the foreground |

Properties are updated **before** handlers run, handlers take no arguments, and identical
values do not fire events again. `sdk.refreshEnvironment()` asks again for theme, language
and safe area only — visibility is push-only, and an older wallet ignores the requests.
Normally you do not need it: the host sends a full snapshot before `init()` resolves, then
only changes.

### CSS variables

The SDK sets them on `:root`:

```css
.footer {
  padding-bottom: var(--aw-safe-area-inset-bottom, 0px);
}
.header {
  padding-top: var(--aw-safe-area-inset-top, 0px);
}
```

`--aw-safe-area-inset-top|right|bottom|left`, `--aw-color-scheme`. A variable is absent until its value arrives — always provide a fallback.

### Example

```typescript
const sdk = new AWSDK({
  appId: "my-mini-app",
  scopes: [],
  parentOrigin: walletOrigin,
});

const applyEnvironment = () => {
  document.documentElement.dataset.theme = sdk.colorScheme ?? "light";
  i18n.locale = sdk.languageCode ?? "en";
};

applyEnvironment();
sdk.events.on("themeChanged", applyEnvironment);
sdk.events.on("languageChanged", applyEnvironment);
sdk.events.on("deactivated", () => pausePolling());
sdk.events.on("activated", () => refreshAndResumePolling());

await sdk.init();
if (!sdk.isActive) pausePolling();
```

### Vue 3 refs

`useAWSdk` returns readonly refs: `platform`, `isActive`, `colorScheme`, `languageCode`,
`safeAreaInset`. They update reactively after mount:

```typescript
import { watch } from "vue";
import { useAWSdk } from "@antarctic-wallet/aw-sdk/vue";

const { colorScheme, languageCode, isActive } = useAWSdk(config);
watch(colorScheme, (value) => applyTheme(value ?? "light"), {
  immediate: true,
});
watch(languageCode, (value) => applyLanguage(value ?? "en"), {
  immediate: true,
});
watch(isActive, (value) => (value ? resume() : pause()));
```

## QR scanner

Opens the wallet's own scanner over the app and resolves with the decoded string.
The camera stays with the wallet: the app never sees the video, only the result.
The scanner shows which app will receive the result and closes after the first scan.

```typescript
try {
  const address = await sdk.scanQr();
} catch (err) {
  if (
    err instanceof AWScanQrError &&
    err.errorCode === ScanQrErrorCodes.Closed
  ) {
    // the user closed the scanner
  }
}
```

`AWScanQrError.errorCode`: `closed`, `not_active` (the app is minimized or the wallet is in
the background), `already_open`, `camera_denied`, `unsupported` (the host did not advertise
the scanner — see `sdk.isCommandAvailable(AWCommand.OpenScanQr)`), `generic_error`.

There is no caption argument: the wallet draws “the result goes to this app” itself.
The `timeout` from the config does not apply. The call waits until a result, a close, or
`destroy()`, which rejects a scan that is still open.

## File download

The app runs inside an iframe or a WebView and cannot download files on its own:
inside Telegram only Telegram can save a file, and in the mobile app the WebView
ignores downloads. `downloadFile()` asks the wallet to do it — Telegram shows its
download dialog, the mobile app hands the link to the system browser, and a regular
browser downloads it directly.

```typescript
try {
  const started = await sdk.downloadFile({
    url: "https://api.example.com/exports/webhook-logs.csv",
    fileName: "webhook-logs.csv",
  });
  if (!started) {
    // the user declined the download dialog
  }
} catch (err) {
  if (err instanceof AWDownloadFileError) {
    // err.errorCode: invalid_download_params | not_active | unsupported | generic_error
  } else {
    throw err; // AWSDKError after destroy()
  }
}
```

`timeout` from the config does not apply: the user may take a while over the wallet's
download dialog, so the call waits up to 10 minutes and is not retried — a retry
would start a second download. If the wallet does not answer in time, the call
rejects with `AWDownloadFileError` (`generic_error`). `destroy()` rejects a call that
is still waiting with a plain `AWSDKError` (`Transport destroyed`).

The file must be served over `https` — `blob:` and `data:` URLs cannot be downloaded
by the wallet, so generate the file on your backend. Serve it with
`Content-Disposition: attachment` so a regular browser saves it instead of opening it.
The URL goes to the wallet exactly as you passed it (only trimmed), so presigned
signatures stay valid. A URL that the browser would rewrite — `.`/`..` segments,
a backslash, an unencoded space — is rejected instead of being silently changed.

Resolves `true` once the download has started and `false` if the user declined.
`AWDownloadFileError.errorCode`: `invalid_download_params` (not an `https` URL, a URL the
browser would rewrite, or an empty `fileName` — nothing is sent to the host), `not_active` (the app is minimized or the
wallet is in the background), `unsupported` (the host did not advertise
`web_app_request_file_download`), `generic_error`.

## Haptic feedback

Vibrates through the wallet, the same way native wallet controls do. Fire-and-forget:
no reply, and nothing happens while the app is minimized or the user has turned
vibration off in the wallet settings.

```typescript
sdk.hapticFeedback.impactOccurred("light"); // light | medium | heavy | rigid | soft
sdk.hapticFeedback.notificationOccurred("success"); // success | warning | error
sdk.hapticFeedback.selectionChanged();
```

## Background color

Tell the wallet which color sits under your page. The wallet paints only the WebView /
iframe area, so iOS overscroll no longer flashes the wallet tone. The header and the
loader stay in the wallet's own color. Accepts `#rgb` or `#rrggbb`; a short form is
expanded to lowercase `#rrggbb` and that is what `sdk.backgroundColor` returns. Anything
else returns `false` and is not sent. No reply; older wallets ignore the call.

```typescript
sdk.setBackgroundColor("#0f1117");
sdk.backgroundColor; // '#0f1117'
```

Call it again whenever your theme changes, e.g. on `themeChanged`.

## Open another app

`sdk.openApp` asks the wallet to open a registered mini-app inside the wallet
container. The promise resolves when the wallet accepts the call. It uses
`timeout` from the config and is not retried. `destroy()` rejects a call that
is still waiting.

```typescript
import { AWOpenAppError, OpenAppErrorCodes } from "@antarctic-wallet/aw-sdk";

try {
  await sdk.openApp({
    appId: "other-mini-app",
    startParam: "order_42",
  });
} catch (err) {
  if (
    err instanceof AWOpenAppError &&
    err.errorCode === OpenAppErrorCodes.NotFound
  ) {
    // no such app
  }
}
```

`startParam` is optional. At most 512 characters, alphabet `A-Za-z0-9_-`.
An empty string, `null`, or leaving it out sends no parameter: the target app
sees no start parameter. Spaces, other symbols, a non-string, or a longer
value throw `invalid_start_param` and are not sent. The value is not trimmed.

`appId` is trimmed before it is checked and sent. A non-string, or a string
that is empty after trimming, throws `invalid_app_id` and is not sent. This
app's own `appId` throws `same_app` and is not sent.

The wallet keeps a stack of at most 5 apps. One more open returns
`stack_limit`. The same `appId` is kept once: if it is already below the
current app, the wallet closes everything above it and shows it with the new
parameter. At most one `openApp` per 500 ms and 10 successful opens per minute
for the container session; the next call returns `rate_limited`. An app that
is missing, blocked, or suspended returns `not_found`, `blocked`, or
`suspended` and is not opened. The SDK does not enforce the stack or the rate
itself — it reports the wallet's error.

An older wallet that did not advertise `open_app` throws `unsupported`. See
`sdk.isCommandAvailable(AWCommand.OpenApp)`.

`AWOpenAppError.errorCode`: `not_found`, `blocked`, `suspended`, `stack_limit`,
`rate_limited`, `invalid_app_id`, `same_app`, `invalid_start_param`,
`unsupported`, `generic_error`. No reply within `timeout` is an `AWTimeoutError`.

## Events

Subscribe **before** `init()`.

| Event                       | Payload                                | When                                                                                                                                                   |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sdk.ready`                 | `AWSession`                            | Handshake finished (or a stored session was restored)                                                                                                  |
| `sdk.error`                 | `{ code, message }`                    | Unsolicited host error: bad origin, host unreachable, `init` failed. An `ERROR` that answers a request rejects that call and does not emit `sdk.error` |
| `scopes.granted`            | `{ scopes }`                           | Emitted with the granted set on ready, and after a `scopes` operation                                                                                  |
| `session.refreshed`         | `{ sessionToken, idToken, expiresAt }` | Session rotated — take the fresh `idToken`                                                                                                             |
| `session.expired`           | —                                      | Session is dead; reset UI and `init()` again                                                                                                           |
| `operation.rejected`        | `{ operationId, reason }`              | The user tapped "reject" in the wallet                                                                                                                 |
| `backButton`                | —                                      | The host's back arrow was pressed                                                                                                                      |
| `themeChanged`              | —                                      | `sdk.colorScheme` changed                                                                                                                              |
| `languageChanged`           | —                                      | `sdk.languageCode` changed                                                                                                                             |
| `safeAreaChanged`           | —                                      | `sdk.safeAreaInset` changed                                                                                                                            |
| `activated` / `deactivated` | —                                      | The app went on / off screen (`sdk.isActive`)                                                                                                          |

```typescript
sdk.events.on("session.refreshed", ({ idToken }) => {
  /* if you cached idToken, replace it */
});
sdk.events.on("session.expired", () => {
  /* reset UI, call sdk.init() again */
});
```

## Error handling

Every error extends `AWSDKError`. Match with `instanceof`, not on `message`.

| Class              | When                                                          | Extra fields                                    |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------------- |
| `AWInitError`      | `init()` failed: handshake, config, rejected scopes, timeout  | `errorCode: InitErrorCodes`                     |
| `AWSessionError`   | Session invalid, expired or revoked                           | `errorCode: SessionErrorCodes`                  |
| `AWScopeError`     | A required scope was not granted                              | `errorCode: ScopeErrorCodes`                    |
| `AWOperationError` | Operation failed or was rejected                              | `operationId`, `errorCode: OperationErrorCodes` |
| `AWTimeoutError`   | No response within `timeout`                                  | —                                               |
| `AWScanQrError`    | QR scanner failed, was closed, or is unavailable              | `errorCode: ScanQrErrorCodes`                   |
| `AWOpenAppError`   | Opening another app was rejected or the arguments are invalid | `errorCode: OpenAppErrorCodes`                  |
| `AWDownloadFileError` | File download failed, is unavailable, or the arguments are invalid | `errorCode: DownloadFileErrorCodes`     |

```typescript
import {
  AWInitError,
  AWOperationError,
  AWTimeoutError,
  InitErrorCodes,
  OperationErrorCodes,
} from "@antarctic-wallet/aw-sdk";

try {
  await sdk.init();
} catch (error) {
  if (error instanceof AWInitError) {
    if (error.errorCode === InitErrorCodes.ScopesRejected) {
      /* the user declined the permission sheet */
    }
  } else if (error instanceof AWTimeoutError) {
    /* the wallet did not answer */
  } else throw error;
}

try {
  await sdk.operations.requestConfirmation(operationId);
} catch (error) {
  if (error instanceof AWOperationError) {
    if (error.errorCode === OperationErrorCodes.UserRejected) {
      /* not a failure — the user said no */
    }
  }
}
```

The code enums (`InitErrorCodes`, `SessionErrorCodes`, `ScopeErrorCodes`,
`OperationErrorCodes`, `ScanQrErrorCodes`, `OpenAppErrorCodes`, `DownloadFileErrorCodes`) and their default English messages
(`InitErrorMessage`, …) are exported too.

## Vue 3

A composable ships in a separate entry point. `vue` is an optional peer
dependency — installing it is only needed if you import this path.

```vue
<script setup lang="ts">
import { useAWSdk } from "@antarctic-wallet/aw-sdk/vue";
import { AWScope } from "@antarctic-wallet/aw-sdk";

const { sdk, session, user, isReady, error } = useAWSdk({
  appId: "my-mini-app",
  scopes: [AWScope.USER_DATA, AWScope.PAY],
  parentOrigin: resolveParentOrigin(),
});
</script>
```

It creates the SDK on mount, calls `init()`, and calls `destroy()` on unmount.
`sdk` is a `shallowRef` — never put the SDK instance into deep reactive state.
After `init()` the composable also returns `startParam` (`null` until then).
See [Start parameter](#start-parameter). The same composable returns the
environment refs: `platform`, `colorScheme`, `languageCode`, `safeAreaInset`,
`isActive`. See [Host environment](#host-environment).

## Host compatibility

Wallet versions roll out gradually, so a host may not support every command your
SDK version knows about.

```typescript
import {
  AWCommand,
  COMMAND_VERSIONS,
  PROTOCOL_VERSION,
  SDK_VERSION,
} from "@antarctic-wallet/aw-sdk";

await sdk.init();

if (!sdk.isCommandAvailable(AWCommand.GetScopesData)) {
  // this host is older — hide the feature instead of failing
}
```

- `sdk.isCommandAvailable(command)` — checks the `supportedCommands` map the
  host returned during the handshake. If the host reported nothing, required
  commands are assumed available. Optional ones are not: `scanQr()` needs an
  explicit `web_app_open_scan_qr` entry, `openApp()` needs `open_app`, and
  `downloadFile()` needs `web_app_request_file_download`, otherwise they throw `unsupported`.
  Theme, language and safe area count as available once a snapshot has arrived,
  even if they are missing from the map. Haptics and background color are
  fire-and-forget: an older wallet ignores them, and `init()` still succeeds.
- `COMMAND_VERSIONS` — minimum command versions this SDK build requires.
- `PROTOCOL_VERSION` — postMessage envelope version (`'1.0'`).
- `SDK_VERSION` — always equal to the package version.

## Cleanup

```typescript
sdk.destroy();
```

Stops auto-refresh, rejects in-flight requests and clears their timers (an open
scanner does not keep waiting), tears down the postMessage transport, removes
all listeners, hides the back arrow, drops the background color and the `--aw-*`
CSS variables, and clears the persisted session. Call it from `onUnmounted` /
`useEffect` cleanup / `ngOnDestroy`.

## Migrating from 0.3.x

`0.4.0` aligns the SDK with the flow the wallet and the examples actually use.

- **Removed `sdk.operations.prepare()`** along with `AWOperationIntent`,
  `AWOperationIntentParams` and the `PREPARE_OPERATION` protocol messages.
  Create the intent on your backend and pass the resulting `operationId` to
  `sdk.operations.requestConfirmation()`.
- **`AWOperationType` is now `'pay' | 'receive' | 'scopes'`** (was
  `'transfer' | 'payment'`).
- **`AWScope` values changed** to the ones the wallet actually grants:
  `USER_DATA` (`'userData'`), `BALANCE` (`'balance'`)
  and `PAY` (`'pay'`). The old `user.profile.read` / `accounts.read` /
  `accounts.balances.read` / `transfers.create` / `payments.create` members are
  gone. `receive` is deliberately absent — it is an intent type that requires
  no scope at all.
- **`AWCommand.PrepareOperation` removed** from `AWCommand` and
  `COMMAND_VERSIONS`.
- Previous READMEs documented an `operation.succeeded` event. It never existed
  in `AWSDKEventMap` — use the value returned by `requestConfirmation()` and, in
  production, the AW webhook.

## License

MIT — see [LICENSE](./LICENSE).
