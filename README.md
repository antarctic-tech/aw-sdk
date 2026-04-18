# @antarctic-wallet/aw-sdk

SDK for embedded mini-apps in Antarctic Wallet. Provides secure iframe-to-parent communication, session management, permission scopes, and operation workflows (transfers, payments).

Zero runtime dependencies. Works in iframe and React Native WebView.

## Install

```bash
npm install @antarctic-wallet/aw-sdk
```

## Quick Start

```typescript
import { AWSDK, AWScope } from '@antarctic-wallet/aw-sdk';

const sdk = new AWSDK({
  appId: 'my-mini-app',
  scopes: [AWScope.USER_PROFILE_READ, AWScope.TRANSFERS_CREATE],
  parentOrigin: 'https://wallet.antarctic.com',
});

const session = await sdk.init();
console.log('Session:', session.sessionToken);
console.log('Scopes:', session.grantedScopes);
```

## Configuration

```typescript
interface AWSDKConfig {
  appId: string;          // Unique app identifier
  scopes: string[];       // Requested permissions
  parentOrigin: string;   // Parent window origin (security check)
  debug?: boolean;        // Enable debug logging (default: false)
  timeout?: number;       // Request timeout in ms (default: 30000)
}
```

## Scopes

```typescript
import { AWScope } from '@antarctic-wallet/aw-sdk';

AWScope.USER_PROFILE_READ    // 'user.profile.read'
AWScope.ACCOUNTS_READ        // 'accounts.read'
AWScope.ACCOUNTS_BALANCES_READ // 'accounts.balances.read'
AWScope.TRANSFERS_CREATE     // 'transfers.create'
AWScope.PAYMENTS_CREATE      // 'payments.create'
```

### Get granted scopes and scope data

```typescript
const scopes = await sdk.scopes.getScopes();

const data = await sdk.scopes.getData<{ name: string; email: string }>();
```

## Session Management

Session auto-refreshes 60 seconds before expiry. Manual control is also available:

```typescript
// Get current session
const session = sdk.getSession();

// Check session status
const status = await sdk.status();
// status: { status: 'active' | 'expired' | 'revoked', grantedScopes, expiresAt }

// Manual refresh
await sdk.refreshSession();
```

## Operations

Two-step flow: prepare, then request user confirmation.

```typescript
// 1. Prepare
const intent = await sdk.operations.prepare({
  type: 'transfer',
  amount: '100.00',
  currency: 'USDT',
  to: '0x1234...abcd',
  description: 'Payment for services',
  metadata: { orderId: '42' },
});

// 2. Confirm (parent shows confirmation UI to user)
const result = await sdk.operations.requestConfirmation(intent.operationId);

if (result.status === 'succeeded') {
  console.log('TX:', result.txId);
}
```

Operation types: `'transfer'` | `'payment'`

## Events

```typescript
sdk.events.on('sdk.ready', (session) => { /* SDK initialized */ });
sdk.events.on('sdk.error', ({ code, message }) => { /* error */ });
sdk.events.on('scopes.granted', ({ scopes }) => { /* scopes granted */ });
sdk.events.on('session.refreshed', ({ sessionToken, expiresAt }) => { /* refreshed */ });
sdk.events.on('session.expired', () => { /* session expired */ });
sdk.events.on('operation.succeeded', (result) => { /* operation done */ });
sdk.events.on('operation.rejected', ({ operationId, reason }) => { /* rejected */ });
```

## Error Handling

All errors extend `AWSDKError`:

```typescript
import {
  AWSDKError,
  AWTimeoutError,
  AWInitError,
  AWSessionError,
  AWOperationError,
} from '@antarctic-wallet/aw-sdk';

try {
  await sdk.init();
} catch (err) {
  if (err instanceof AWInitError) {
    console.error('Init failed:', err.code, err.message);
  }
  if (err instanceof AWTimeoutError) {
    console.error('Parent not responding');
  }
}
```

## Cleanup

```typescript
sdk.destroy();
```

## License

MIT
