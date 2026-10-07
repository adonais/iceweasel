/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let gCtapCableHandshakeService = Cc[
  "@mozilla.org/security/ctapcablehandshakeservice;1"
].createInstance(Ci.nsICtapCableHandshakeService);

add_task(async function test_cable_handshake_knpsk0() {
  // JavaScript version of Rust_NoiseHandshakeKNpsk0
  // (security/manager/ssl/noise/gtest/test.rs)
  let initiatorIdentityKey = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  let initiatorPub = new Uint8Array(
    await crypto.subtle.exportKey("raw", initiatorIdentityKey.publicKey)
  );
  let initiatorIdentity = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", initiatorIdentityKey.privateKey)
  );

  let psk = new Uint8Array(32);
  crypto.getRandomValues(psk);

  let hs = gCtapCableHandshakeService.newQrInitiatedInitiatorHandshake(
    psk,
    initiatorIdentity
  );

  let responder = gCtapCableHandshakeService.newQrInitiatedResponder(
    psk,
    initiatorPub,
    hs.initialMessage
  );

  ok(responder.hasKeys, "responder channel should have keys");

  let initiator = hs.processHandshakeResponse(responder.responseMessage);
  ok(initiator.hasKeys, "initiator channel should have keys");

  // Channel binding
  deepEqual(initiator.handshakeHash, responder.handshakeHash);

  // responder -> initiator
  let msg = "Hi initiator!";
  let msgBytes = stringToArray(msg);
  let ct = responder.encrypt(msgBytes);
  notDeepEqual(msgBytes, ct, "encrypted value should differ from plaintext");

  let pt = arrayToString(initiator.decrypt(ct));
  equal(msg, pt, "initiator should be able to decrypt responder's message");

  throws(
    () => initiator.decrypt(ct),
    /NS_ERROR_ILLEGAL_VALUE/,
    "decrypting the responder's message again should fail"
  );

  // initiator -> responder
  msg = "G'day, responder!";
  msgBytes = stringToArray(msg);
  ct = initiator.encrypt(msgBytes);
  notDeepEqual(msgBytes, ct, "encrypted value should differ from plaintext");

  pt = arrayToString(responder.decrypt(ct));
  equal(msg, pt, "responder should be able to decrypt initiator's message");

  throws(
    () => responder.decrypt(ct),
    /NS_ERROR_ILLEGAL_VALUE/,
    "decrypting the initiator's message again should fail"
  );
});

add_task(async function test_cable_handshake_errors_knpsk0() {
  // Test Noise handshakes with incorrect key data. This would be a Rust test,
  // but nss_rs::ecdh_keygen can't generate the other ECDH keys due to a bug:
  // https://github.com/mozilla/nss-rs/issues/120
  let params = [
    { name: "ECDH", namedCurve: "P-384" },
    { name: "ECDH", namedCurve: "P-521" },
    { name: "X25519" },
  ];

  // Make a valid P-256 ephemeral key for the responder's initial message
  let validKey = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  let priv = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", validKey.privateKey)
  );
  let pub = new Uint8Array(
    await crypto.subtle.exportKey("raw", validKey.publicKey)
  );
  let initialMessage = new Uint8Array(
    pub +
      // tag
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  );

  // Check short PSKs
  for (let l = 0; l < 32; l++) {
    let psk = new Uint8Array(l);

    throws(
      () =>
        gCtapCableHandshakeService.newQrInitiatedInitiatorHandshake(psk, priv),
      /NS_ERROR_ILLEGAL_VALUE/,
      `initial message with short psk of ${l} bytes`
    );

    throws(
      () =>
        gCtapCableHandshakeService.newQrInitiatedResponder(
          psk,
          pub,
          initialMessage
        ),
      /NS_ERROR_ILLEGAL_VALUE/,
      `responder with short psk of ${l} bytes`
    );
  }

  // Invalid key bytes
  let psk = new Uint8Array(32);
  for (let l = 0; l <= 100; l++) {
    // This sets all bytes to zero, which isn't a valid first byte for a private
    // (DER) or public (uncompressed X9.62 point) key.
    let keyBytes = new Uint8Array(l);

    // Invalid private key
    throws(
      () =>
        gCtapCableHandshakeService.newQrInitiatedInitiatorHandshake(
          psk,
          keyBytes
        ),
      /NS_ERROR_ILLEGAL_VALUE/,
      `initial message with invalid private key of ${l} bytes`
    );

    // Invalid public key
    throws(
      () =>
        gCtapCableHandshakeService.newQrInitiatedResponder(
          psk,
          keyBytes,
          initialMessage
        ),
      /NS_ERROR_ILLEGAL_VALUE/,
      `responder with invalid private key of ${l} bytes`
    );
  }

  // Invalid key types
  await Promise.all(
    params.map(async param => {
      let key = await crypto.subtle.generateKey(param, true, ["deriveBits"]);
      let pub = new Uint8Array(
        await crypto.subtle.exportKey("raw", key.publicKey)
      );
      let priv = new Uint8Array(
        await crypto.subtle.exportKey("pkcs8", key.privateKey)
      );

      throws(
        () =>
          gCtapCableHandshakeService.newQrInitiatedInitiatorHandshake(
            psk,
            priv
          ),
        // NS_ERROR_ILLEGAL_VALUE would be ideal, but nss_rs won't export a
        // P-521 pubkey and returns NS_ERROR_FAILURE.
        // https://github.com/mozilla/nss-rs/issues/120
        /NS_ERROR_/,
        `creating handshake message with ${JSON.stringify(param)} key fails`
      );

      throws(
        () =>
          gCtapCableHandshakeService.newQrInitiatedResponder(
            psk,
            pub,
            initialMessage
          ),
        /NS_ERROR_ILLEGAL_VALUE/,
        `creating responder with ${JSON.stringify(param)} key fails`
      );
    })
  );
});
