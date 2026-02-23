(function () {
  "use strict";
  if (window.__nostrLoginLoaded) return;
  window.__nostrLoginLoaded = true;

  // --- Capture any existing extension before we overwrite ---
  var _ext = window.nostr || null;

  // --- State (memory-only, never persisted) ---
  var _provider = null; // "key" or "extension"
  let _privKey = null;
  let _pubKey = null;
  let _secp = null;
  let _keyResolvers = [];

  // --- Dynamic import of secp256k1 (kicks off immediately) ---
  const _secpReady = import("https://esm.sh/@noble/secp256k1@1.7.1").then(
    (mod) => { _secp = mod; }
  );

  // --- Hex utilities ---
  function hexToBytes(hex) {
    if (_secp) return _secp.utils.hexToBytes(hex);
    const b = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2)
      b[i / 2] = parseInt(hex.substr(i, 2), 16);
    return b;
  }

  function bytesToHex(bytes) {
    if (_secp) return _secp.utils.bytesToHex(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  // --- SHA-256 via Web Crypto ---
  async function sha256(msg) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", msg));
  }

  // --- NIP-01: Compute event ID ---
  async function computeEventId(ev) {
    const ser = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
    return bytesToHex(await sha256(new TextEncoder().encode(ser)));
  }

  // --- NIP-01: Sign event ---
  async function _signEvent(event) {
    await _secpReady;
    const ev = Object.assign({}, event, { pubkey: _pubKey });
    ev.id = await computeEventId(ev);
    const sig = await _secp.schnorr.sign(ev.id, _privKey);
    ev.sig = bytesToHex(sig);
    return ev;
  }

  // --- NIP-04: ECDH shared secret (x-coordinate only) ---
  async function getSharedSecret(theirPubkey) {
    await _secpReady;
    const shared = _secp.getSharedSecret(_privKey, "02" + theirPubkey);
    return shared.slice(1, 33);
  }

  // --- NIP-04: Encrypt ---
  async function _nip04Encrypt(pubkey, plaintext) {
    const secret = await getSharedSecret(pubkey);
    const key = await crypto.subtle.importKey("raw", secret, { name: "AES-CBC" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, new TextEncoder().encode(plaintext));
    return btoa(String.fromCharCode(...new Uint8Array(cipher))) + "?iv=" + btoa(String.fromCharCode(...iv));
  }

  // --- NIP-04: Decrypt ---
  async function _nip04Decrypt(pubkey, ciphertext) {
    const [cipherB64, ivB64] = ciphertext.split("?iv=");
    const secret = await getSharedSecret(pubkey);
    const key = await crypto.subtle.importKey("raw", secret, { name: "AES-CBC" }, false, ["decrypt"]);
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const cipher = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher);
    return new TextDecoder().decode(plain);
  }

  // --- Logout: clear state ---
  function logout(btn) {
    _provider = null;
    _privKey = null;
    _pubKey = null;
    if (btn) {
      btn.textContent = "Login";
      btn.title = "";
    }
    document.dispatchEvent(new CustomEvent("nlAuth", { detail: { type: "logout" } }));
  }

  // --- Login success: update UI ---
  function loginSuccess(btn, pubkey, method) {
    _pubKey = pubkey;
    _provider = method;
    if (btn) {
      btn.textContent = pubkey.slice(0, 8) + "\u2026" + pubkey.slice(-4);
      btn.title = pubkey;
    }
    _keyResolvers.forEach(function (r) { r.resolve(); });
    _keyResolvers = [];
    document.dispatchEvent(new CustomEvent("nlAuth", { detail: { type: "login" } }));
  }

  // --- UI: Shadow DOM widget ---
  var _ui = null;

  function createWidget() {
    var host = document.createElement("div");
    host.id = "nostr-login-widget";
    document.body.appendChild(host);
    var shadow = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent = [
      ".nl-btn{position:fixed;bottom:16px;right:16px;z-index:999999;background:#8B5CF6;color:#fff;border:none;border-radius:20px;padding:8px 16px;font:14px/1.4 system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);transition:background .2s}",
      ".nl-btn:hover{background:#7C3AED}",
      ".nl-overlay{display:none;position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,.5);align-items:center;justify-content:center}",
      ".nl-overlay.active{display:flex}",
      ".nl-modal{background:#1a1a2e;color:#e0e0e0;border-radius:12px;padding:24px;width:360px;max-width:90vw;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.4)}",
      ".nl-modal h2{margin:0 0 16px;font-size:18px;color:#fff}",
      ".nl-ext{width:100%;box-sizing:border-box;padding:10px 16px;border:1px solid #8B5CF6;border-radius:8px;background:transparent;color:#8B5CF6;font-size:14px;cursor:pointer;margin-bottom:12px;transition:background .2s}",
      ".nl-ext:hover{background:#8B5CF620}",
      ".nl-sep{text-align:center;color:#666;font-size:12px;margin-bottom:12px}",
      ".nl-modal input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #333;border-radius:8px;background:#0d0d1a;color:#e0e0e0;font:13px monospace;margin-bottom:8px}",
      ".nl-modal input:focus{outline:none;border-color:#8B5CF6}",
      ".nl-error{color:#ef4444;font-size:12px;margin-bottom:8px;min-height:16px}",
      ".nl-actions{display:flex;gap:8px;justify-content:flex-end}",
      ".nl-actions button{padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:14px}",
      ".nl-cancel{background:#333;color:#aaa}",
      ".nl-submit{background:#8B5CF6;color:#fff}",
      ".nl-submit:disabled{opacity:.5;cursor:not-allowed}",
    ].join("");
    shadow.appendChild(style);

    var btn = document.createElement("button");
    btn.className = "nl-btn";
    btn.textContent = "Login";
    btn.onclick = function () {
      if (_provider) {
        logout(btn);
      } else {
        showModal();
      }
    };
    shadow.appendChild(btn);

    var overlay = document.createElement("div");
    overlay.className = "nl-overlay";

    var modalHTML =
      '<div class="nl-modal">' +
        '<h2>Nostr Login</h2>';

    // Extension button (conditionally included)
    if (_ext) {
      modalHTML +=
        '<button class="nl-ext">Use Browser Extension</button>' +
        '<div class="nl-sep">or paste a private key</div>';
    }

    modalHTML +=
        '<input type="password" placeholder="64-char hex private key" maxlength="64" spellcheck="false" autocomplete="off">' +
        '<div class="nl-error"></div>' +
        '<div class="nl-actions">' +
          '<button class="nl-cancel">Cancel</button>' +
          '<button class="nl-submit">Login</button>' +
        '</div>' +
      '</div>';

    overlay.innerHTML = modalHTML;
    overlay.className = "nl-overlay";
    shadow.appendChild(overlay);

    var input = overlay.querySelector("input");
    var error = overlay.querySelector(".nl-error");
    var cancelBtn = overlay.querySelector(".nl-cancel");
    var submitBtn = overlay.querySelector(".nl-submit");
    var extBtn = overlay.querySelector(".nl-ext");

    function cancel() {
      hideModal();
      input.value = "";
      error.textContent = "";
      _keyResolvers.forEach(function (r) { r.reject(new Error("User cancelled login")); });
      _keyResolvers = [];
    }

    cancelBtn.onclick = cancel;
    overlay.onclick = function (e) { if (e.target === overlay) cancel(); };

    // Extension login
    if (extBtn) {
      extBtn.onclick = async function () {
        try {
          var pubkey = await _ext.getPublicKey();
          hideModal();
          loginSuccess(btn, pubkey, "extension");
        } catch (e) {
          error.textContent = "Extension error: " + e.message;
        }
      };
    }

    // Key login
    submitBtn.onclick = async function () {
      var val = input.value.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(val)) {
        error.textContent = "Must be exactly 64 hex characters";
        return;
      }
      await _secpReady;
      _privKey = val;
      var pubkey = bytesToHex(_secp.schnorr.getPublicKey(val));
      hideModal();
      input.value = "";
      error.textContent = "";
      loginSuccess(btn, pubkey, "key");
    };

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitBtn.onclick();
    });

    input.addEventListener("input", function () {
      var val = input.value.trim();
      if (/^[0-9a-fA-F]{64}$/.test(val)) submitBtn.onclick();
    });

    return { btn: btn, overlay: overlay, input: input };
  }

  function getUI() {
    if (!_ui && document.body) _ui = createWidget();
    return _ui;
  }

  function showModal() {
    var ui = getUI();
    if (ui) {
      ui.overlay.classList.add("active");
      setTimeout(function () { ui.input.focus(); }, 50);
    }
  }

  function hideModal() {
    var ui = getUI();
    if (ui) ui.overlay.classList.remove("active");
  }

  // --- Provider gating: opens modal if no provider yet ---
  function ensureProvider() {
    if (_provider) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      _keyResolvers.push({ resolve: resolve, reject: reject });
      showModal();
    });
  }

  // --- NIP-07: window.nostr (assigned synchronously) ---
  window.nostr = {
    getPublicKey: async function () {
      await ensureProvider();
      if (_provider === "extension") return _ext.getPublicKey();
      return _pubKey;
    },
    signEvent: async function (event) {
      await ensureProvider();
      if (_provider === "extension") return _ext.signEvent(event);
      return _signEvent(event);
    },
    nip04: {
      encrypt: async function (pubkey, plaintext) {
        await ensureProvider();
        if (_provider === "extension" && _ext.nip04) return _ext.nip04.encrypt(pubkey, plaintext);
        return _nip04Encrypt(pubkey, plaintext);
      },
      decrypt: async function (pubkey, ciphertext) {
        await ensureProvider();
        if (_provider === "extension" && _ext.nip04) return _ext.nip04.decrypt(pubkey, ciphertext);
        return _nip04Decrypt(pubkey, ciphertext);
      },
    },
  };

  // --- Init UI when DOM is ready ---
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", getUI);
  } else {
    getUI();
  }
})();
