# @antarctic-wallet/aw-sdk

**English** · [Русский](./README.ru.md)

[![npm](https://img.shields.io/npm/v/@antarctic-wallet/aw-sdk.svg)](https://www.npmjs.com/package/@antarctic-wallet/aw-sdk)
[![license](https://img.shields.io/npm/l/@antarctic-wallet/aw-sdk.svg)](./LICENSE)

SDK for embedded mini-apps in Antarctic Wallet (AW). It handles the secure
iframe-to-parent channel, the handshake, session and scope management, and
asking the wallet to show its **native** confirmation sheet for an operation.

Zero runtime dependencies. Works in an iframe and in a React Native WebView.

## Runnable examples

Full end-to-end starters (frontend + partner backend + Docker) live in a separate repo:

| Stack | Example |
| ----- | ------- |
| Vue 3 | [examples/vue](https://github.com/antarctic-tech/example-app/tree/master/examples/vue) |
| React | [examples/react](https://github.com/antarctic-tech/example-app/tree/master/examples/react) |
| Angular | [examples/angular](https://github.com/antarctic-tech/example-app/tree/master/examples/angular) |
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
import { AWSDK, AWScope } from '@antarctic-wallet/aw-sdk';

const sdk = new AWSDK({
  appId: 'my-mini-app',              // the `id` from your mini-app config.json
  scopes: [AWScope.USER_DATA, AWScope.PAY],
  parentOrigin: resolveParentOrigin(),
  persistSession: true,
});

// Subscribe BEFORE init() — `sdk.ready` fires during it.
sdk.events.on('sdk.ready', (session) => {
  console.log('granted scopes:', session.grantedScopes);
  console.log('idToken:', sdk.idToken); // signed JWT — forward to YOUR backend
});

sdk.events.on('sdk.error', ({ code, message }) => {
  console.error('SDK is dead:', code, message);
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
  const fromQuery = new URLSearchParams(location.search).get('parentOrigin');
  if (fromQuery) return fromQuery;
  if (document.referrer) return new URL(document.referrer).origin;
  return 'https://your-dev-wallet.example';   // dev fallback only
}
```

The wallet always passes `?parentOrigin=`. If you use a router, prefer a hash
router (`#/pay`) so the query string survives navigation.

### Is the app running inside the wallet?

```typescript
if (!AWSDK.isInsideWallet()) {
  // opened directly in a browser tab — show a "open me in Antarctic Wallet" screen
}
```

Returns `true` inside an iframe or a React Native WebView.

## Scopes

```typescript
import { AWScope } from '@antarctic-wallet/aw-sdk';

AWScope.USER_DATA  // 'userData' — profile + KYC flags in the id_token
AWScope.BALANCE    // 'balance'  — the user's balance
AWScope.PAY        // 'pay'      — the user pays you
```

`receive` is **not** a scope: it is an intent type (you paying the user), and it
requires no scope at all. Asking for `pay` does not enable payouts, and payouts
do not need the user to grant anything.

```typescript
const granted = await sdk.scopes.getScopes();          // string[]
const data = await sdk.scopes.getData<MyScopeData>();  // scope payload from the host
```

The scopes you pass to `new AWSDK({ scopes })` are what the handshake requests.
The `requiredScopes` field in your mini-app `config.json` is a manifest for the
wallet catalogue — it is **not** read by the SDK.

To ask for more scopes later, create a `scopes` intent on your backend and
confirm it like any other operation; the SDK emits `scopes.granted` afterwards.

## Authenticating the user (OIDC `id_token`)

`sdk.idToken` is a signed JWT whose `sub` is an opaque per-app login. It is the
**only** value that may authenticate the user on your backend. `sdk.user` /
`session.userContext` is decoded from that token inside the mini-app *without*
verifying the signature — treat it as UI-only data (`displayName` is the `sub`
on purpose, not a personal name).

```typescript
// In the mini-app — forward the token to your own backend:
await fetch('/api/auth/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken: sdk.idToken }),
});
```

```typescript
// On YOUR backend — verify the signature against the host JWKS, then trust `sub`:
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL(`${AW_API_BASE}/api/v2/sdk/jwks`));
const { payload } = await jwtVerify(idToken, jwks, {
  issuer: 'aw',
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

| Type | Meaning | Confirmation |
| ---- | ------- | ------------ |
| `pay` | The user pays you (purchase, donation) | Yes — native sheet in the wallet |
| `receive` | You pay the user (refund, payout). Not a scope, and needs none | No — already executed in the API response |
| `scopes` | Ask for additional permissions | Yes — native sheet in the wallet |

```typescript
// 1. Your backend creates the intent and returns its id
const { operationId, status } = await fetch('/api/intents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken: sdk.idToken, type: 'pay', amount: '5.00' }),
}).then((r) => r.json());

// 2. `receive` is already done; `pay` and `scopes` need the wallet sheet
if (status === 'pending') {
  const result = await sdk.operations.requestConfirmation(operationId);
  // result: { operationId, status, txId? }
}
```

`AWOperationStatus` is `'pending' | 'awaiting_confirmation' | 'confirmed' |
'succeeded' | 'failed' | 'rejected'`. A user rejection is delivered **as a
thrown `AWOperationError`** with `errorCode === 'user_rejected'`, and also as
the `operation.rejected` event.

In production, settle the order from the AW webhook (`intent.approved`,
`intent.rejected`, `payment.succeeded`, `payment.failed`) — not from what the
browser tab reported. The tab can be closed mid-flow. See the
[backend example](https://github.com/antarctic-tech/example-app/tree/master/examples/backend-node)
for signature verification and idempotency.

> **Removed in 0.4.0:** `sdk.operations.prepare()`. Creating an operation from
> the browser was never safe, and the wallet-side flow requires a server-created
> intent. See [Migration](#migrating-from-03x).

## Session management

The session auto-refreshes 60 seconds before it expires. Manual control:

```typescript
const session = sdk.getSession();     // AWSession | null

const status = await sdk.status();
// { status: 'active' | 'expired' | 'revoked', idToken, grantedScopes, expiresAt }

await sdk.refreshSession();           // emits 'session.refreshed'
```

With `persistSession: true` (the default) the session is stored in
`sessionStorage` under a per-`appId` key and restored on reload without a full
handshake. `destroy()` clears that entry — it is a teardown, not a pause.

## Back button

Control the host container's back button. When shown, the host header swaps
"Close" for a back arrow. Pressing it only delivers an event to your app:
navigation stays entirely on your side and the container stays open.

```typescript
sdk.backButton.show();      // header shows the back arrow
sdk.backButton.hide();      // header returns to "Close"
sdk.backButton.isVisible;   // boolean

const handler = () => router.back();
sdk.backButton.onClick(handler);
sdk.backButton.offClick(handler);
```

On Android the hardware back button follows the same contract while the arrow is
visible. `destroy()` hides the arrow and drops every handler.

## Events

Subscribe **before** `init()`.

| Event | Payload | When |
| ----- | ------- | ---- |
| `sdk.ready` | `AWSession` | Handshake finished (or a stored session was restored) |
| `sdk.error` | `{ code, message }` | Bad origin, host unreachable, `init` failed |
| `scopes.granted` | `{ scopes }` | Emitted with the granted set on ready, and after a `scopes` operation |
| `session.refreshed` | `{ sessionToken, idToken, expiresAt }` | Session rotated — take the fresh `idToken` |
| `session.expired` | — | Session is dead; reset UI and `init()` again |
| `operation.rejected` | `{ operationId, reason }` | The user tapped "reject" in the wallet |
| `backButton` | — | The host's back arrow was pressed |

```typescript
sdk.events.on('session.refreshed', ({ idToken }) => {
  /* if you cached idToken, replace it */
});
sdk.events.on('session.expired', () => {
  /* reset UI, call sdk.init() again */
});
```

## Error handling

Every error extends `AWSDKError`. Match with `instanceof`, not on `message`.

| Class | When | Extra fields |
| ----- | ---- | ------------ |
| `AWInitError` | `init()` failed: handshake, config, rejected scopes, timeout | `errorCode: InitErrorCodes` |
| `AWSessionError` | Session invalid, expired or revoked | `errorCode: SessionErrorCodes` |
| `AWScopeError` | A required scope was not granted | `errorCode: ScopeErrorCodes` |
| `AWOperationError` | Operation failed or was rejected | `operationId`, `errorCode: OperationErrorCodes` |
| `AWTimeoutError` | No response within `timeout` | — |

```typescript
import {
  AWInitError,
  AWOperationError,
  AWTimeoutError,
  InitErrorCodes,
  OperationErrorCodes,
} from '@antarctic-wallet/aw-sdk';

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
`OperationErrorCodes`) and their default English messages
(`InitErrorMessage`, …) are exported too.

## Vue 3

A composable ships in a separate entry point. `vue` is an optional peer
dependency — installing it is only needed if you import this path.

```vue
<script setup lang="ts">
import { useAWSdk } from '@antarctic-wallet/aw-sdk/vue';
import { AWScope } from '@antarctic-wallet/aw-sdk';

const { sdk, session, user, isReady, error } = useAWSdk({
  appId: 'my-mini-app',
  scopes: [AWScope.USER_DATA, AWScope.PAY],
  parentOrigin: resolveParentOrigin(),
});
</script>
```

It creates the SDK on mount, calls `init()`, and calls `destroy()` on unmount.
`sdk` is a `shallowRef` — never put the SDK instance into deep reactive state.

## Host compatibility

Wallet versions roll out gradually, so a host may not support every command your
SDK version knows about.

```typescript
import {
  AWCommand,
  COMMAND_VERSIONS,
  PROTOCOL_VERSION,
  SDK_VERSION,
} from '@antarctic-wallet/aw-sdk';

await sdk.init();

if (!sdk.isCommandAvailable(AWCommand.GetScopesData)) {
  // this host is older — hide the feature instead of failing
}
```

- `sdk.isCommandAvailable(command)` — checks the `supportedCommands` map the
  host returned during the handshake. If the host reported nothing, everything
  is assumed available.
- `COMMAND_VERSIONS` — minimum command versions this SDK build requires.
- `PROTOCOL_VERSION` — postMessage envelope version (`'1.0'`).
- `SDK_VERSION` — always equal to the package version.

## Cleanup

```typescript
sdk.destroy();
```

Stops auto-refresh, tears down the postMessage transport, removes all listeners,
hides the back arrow and clears the persisted session. Call it from
`onUnmounted` / `useEffect` cleanup / `ngOnDestroy`.

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
