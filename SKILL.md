# nip07

## Purpose

Drop-in NIP-07 `window.nostr` provider for browser apps. One script tag adds a login button that supports browser extensions, guest mode, and hex private key entry. No build tools required.

## When to Use

- Adding Nostr signing to a web app without requiring users to install a browser extension
- Providing a guest/demo mode for a Nostr app
- Prototyping Nostr apps that need `window.nostr`
- Adding NIP-07 support to static HTML pages

## Installation

### CDN (recommended for static pages)

```html
<script src="https://unpkg.com/nip07" defer></script>
```

### With guest login enabled

```html
<script src="https://unpkg.com/nip07" data-guest="<64-char-hex-private-key>" defer></script>
```

### npm (for ES module usage)

```bash
npm install nip07
```

## API

### Browser Widget (nip7.js)

The script tag creates a floating login button (bottom-right corner, Shadow DOM isolated) and sets `window.nostr` synchronously. All methods open the login modal automatically if the user hasn't authenticated yet.

```js
// Get the logged-in user's public key
const pubkey = await window.nostr.getPublicKey();

// Sign a Nostr event (NIP-01)
const signed = await window.nostr.signEvent({
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [],
  content: "Hello Nostr",
});

// Encrypt a direct message (NIP-04)
const ciphertext = await window.nostr.nip04.encrypt(recipientPubkey, "secret");

// Decrypt a direct message (NIP-04)
const plaintext = await window.nostr.nip04.decrypt(senderPubkey, ciphertext);
```

### ES Module (index.js)

```js
import { getPublicKey, signEvent, nip04, init } from "nip07";

// Derive public key from private key
const pubkey = getPublicKey(privkeyHex);

// Sign an event
const signed = await signEvent(privkeyHex, { created_at, kind, tags, content });

// NIP-04 encrypt/decrypt
const cipher = await nip04.encrypt(privkeyHex, theirPubkey, plaintext);
const plain = await nip04.decrypt(privkeyHex, theirPubkey, ciphertext);

// Set up window.nostr programmatically (no UI)
init(privkeyHex);
```

## Events

The widget dispatches `nlAuth` events on `document`:

```js
document.addEventListener("nlAuth", (e) => {
  if (e.detail.type === "login") { /* user logged in */ }
  if (e.detail.type === "logout") { /* user logged out */ }
});
```

## Authentication Methods

| Method | signerType | How it works |
|--------|-----------|--------------|
| Browser extension | `nip-07` | Proxies calls to the existing `window.nostr` extension (nos2x, Alby, etc.) |
| Guest | `guest` | Uses a shared well-known keypair supplied via `data-guest` attribute |
| Private key | `key` | Signs locally using `@noble/secp256k1` |

## Configuration

| Attribute | Effect |
|-----------|--------|
| `data-guest="<hex>"` | Enables "Continue as Guest" button with the given 64-char hex private key |
| `defer` | Recommended when used alongside other rendering libraries |

## Persistence

Sessions persist in `localStorage` using Jumble-compatible account format (`accounts` and `currentAccount` keys). Sessions restore automatically on page reload.

## Exports

| Entry point | Path | Description |
|-------------|------|-------------|
| `"."` | `index.js` | ES module API (no UI) |
| `"./widget"` | `nip7.js` | Drop-in IIFE with login button |

## Constraints

- Private keys are hex only (not nsec/bech32)
- NIP-04 encryption with a guest key is not private (the key is public by design)
- The widget uses a closed Shadow DOM; it cannot be styled from outside
- Requires a browser with Web Crypto API support
