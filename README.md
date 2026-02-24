<p align="center">
  <strong>nip07</strong><br>
  <em>One script tag. Paste a key or use an extension. Sign events.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nip07"><img src="https://img.shields.io/npm/v/nip07.svg" alt="npm version"></a>
  <a href="https://unpkg.com/nip07"><img src="https://img.shields.io/badge/unpkg-CDN-blue.svg" alt="unpkg"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License"></a>
  <a href="https://github.com/nostr-protocol/nips/blob/master/07.md"><img src="https://img.shields.io/badge/spec-NIP--07-purple.svg" alt="NIP-07"></a>
</p>

---

**nip07** is a minimal [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) `window.nostr` provider for the browser. It gives any Nostr web app the ability to sign events — either by pasting a hex private key or by using an existing browser extension.

No build tools. No frameworks. One script tag.

## Quick Start

```html
<script src="https://unpkg.com/nip07"></script>
```

A login button appears in the corner. You get two ways to authenticate:

1. **Browser extension** — if a NIP-07 extension is detected, a "Use Browser Extension" button appears at the top of the modal. Click it to delegate all signing to the extension.
2. **Hex private key** — paste a 64-character hex key and it auto-accepts instantly.

Click the button again when logged in to log out.

> **Tip:** If you're using nip07 alongside other client-side rendering libraries (e.g. solid-shim/mashlib), add the `defer` attribute to avoid the page flashing white:
>
> ```html
> <script src="https://unpkg.com/nip07" defer></script>
> ```
>
> This ensures nip07 loads after the DOM is parsed, preventing conflicts with libraries that render on load.

## Live Demo

Try it at [nip-07.github.io/nip7](https://nip-07.github.io/nip7/)

## What You Get

A spec-compliant `window.nostr` with four async methods:

```js
await window.nostr.getPublicKey()              // 64-char hex pubkey
await window.nostr.signEvent(event)            // signed event with id, pubkey, sig
await window.nostr.nip04.encrypt(pubkey, text) // NIP-04 encrypted DM
await window.nostr.nip04.decrypt(pubkey, text) // NIP-04 decrypted DM
```

## How It Works

1. The script saves any existing `window.nostr` (from a browser extension) before overwriting
2. Sets its own `window.nostr` **synchronously** on load — before your app's scripts run
3. A small floating button appears (bottom-right, Shadow DOM isolated)
4. When an app calls any `window.nostr` method, the login modal opens automatically if needed
5. If an extension is detected, the modal offers it as a one-click option
6. If a hex key is pasted, signing happens locally using Schnorr/BIP-340
7. Click the button again to log out (clears key from memory)

Under the hood:
- **Signing** — Schnorr/BIP-340 over secp256k1 per [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)
- **Encryption** — ECDH shared secret + AES-256-CBC via Web Crypto API per [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md)
- **Hashing** — SHA-256 via the browser's native `crypto.subtle`
- **UI isolation** — closed Shadow DOM, zero CSS leakage in or out
- **Extension support** — detects and proxies to existing NIP-07 extensions

## ES Module

For programmatic use without the UI:

```
npm install nip07
```

```js
import { getPublicKey, signEvent, nip04, init } from "nip07";

// Derive a public key
const pubkey = getPublicKey("abc123...");

// Sign an event
const signed = await signEvent("abc123...", {
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [],
  content: "Hello Nostr",
});

// Or wire up window.nostr in one call (no UI)
init("abc123...");
```

| Export | Description |
|--------|------------|
| `getPublicKey(privHex)` | Returns hex pubkey from a hex private key |
| `signEvent(privHex, event)` | Returns a complete signed event |
| `nip04.encrypt(privHex, pubkey, text)` | NIP-04 encrypt a message |
| `nip04.decrypt(privHex, pubkey, text)` | NIP-04 decrypt a message |
| `init(privHex)` | Sets up `window.nostr` using the given key |

## Events

The script dispatches `nlAuth` events on `document` for login and logout:

```js
document.addEventListener("nlAuth", (e) => {
  console.log(e.detail.type); // "login" or "logout"
});
```

## Security

| Concern | Approach |
|---------|----------|
| Key storage | **Memory only** — never touches `localStorage`, `sessionStorage`, or disk |
| Page refresh | Clears the key — re-entry required |
| Input masking | Password field — key is never visible on screen |
| Extension mode | Private key never leaves the extension — nip07 proxies calls through |
| CSS isolation | Closed Shadow DOM — host page cannot read or style the widget |
| Dependencies | Single dep: [`@noble/secp256k1`](https://github.com/paulmillr/noble-secp256k1) (audited, pure JS, zero transitive deps) |

## Specs Implemented

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) — Event signing (Schnorr/secp256k1, SHA-256 event ID)
- [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md) — Encrypted direct messages (ECDH + AES-256-CBC)
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) — `window.nostr` provider interface

## License

[MIT](LICENSE) — Melvin Carvalho
