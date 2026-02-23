import { schnorr, getSharedSecret as _ecdh, utils } from "@noble/secp256k1";

const { hexToBytes, bytesToHex } = utils;

// --- SHA-256 via Web Crypto ---
async function sha256(msg) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", msg));
}

// --- NIP-01: Compute event ID ---
async function computeEventId(ev) {
  const ser = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  return bytesToHex(await sha256(new TextEncoder().encode(ser)));
}

// --- Public API ---

export function getPublicKey(privKeyHex) {
  return bytesToHex(schnorr.getPublicKey(privKeyHex));
}

export async function signEvent(privKeyHex, event) {
  const pubkey = getPublicKey(privKeyHex);
  const ev = Object.assign({}, event, { pubkey });
  ev.id = await computeEventId(ev);
  const sig = await schnorr.sign(ev.id, privKeyHex);
  ev.sig = bytesToHex(sig);
  return ev;
}

function sharedSecret(privKeyHex, theirPubkey) {
  const shared = _ecdh(privKeyHex, "02" + theirPubkey);
  return shared.slice(1, 33);
}

export const nip04 = {
  async encrypt(privKeyHex, pubkey, plaintext) {
    const secret = sharedSecret(privKeyHex, pubkey);
    const key = await crypto.subtle.importKey("raw", secret, { name: "AES-CBC" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, new TextEncoder().encode(plaintext));
    return btoa(String.fromCharCode(...new Uint8Array(cipher))) + "?iv=" + btoa(String.fromCharCode(...iv));
  },

  async decrypt(privKeyHex, pubkey, ciphertext) {
    const [cipherB64, ivB64] = ciphertext.split("?iv=");
    const secret = sharedSecret(privKeyHex, pubkey);
    const key = await crypto.subtle.importKey("raw", secret, { name: "AES-CBC" }, false, ["decrypt"]);
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const cipher = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher);
    return new TextDecoder().decode(plain);
  },
};

export function init(privKeyHex) {
  const pubkey = getPublicKey(privKeyHex);
  window.nostr = {
    async getPublicKey() {
      return pubkey;
    },
    async signEvent(event) {
      return signEvent(privKeyHex, event);
    },
    nip04: {
      async encrypt(theirPubkey, plaintext) {
        return nip04.encrypt(privKeyHex, theirPubkey, plaintext);
      },
      async decrypt(theirPubkey, ciphertext) {
        return nip04.decrypt(privKeyHex, theirPubkey, ciphertext);
      },
    },
  };
  document.dispatchEvent(new CustomEvent("nlAuth", { detail: { type: "login" } }));
  return pubkey;
}
