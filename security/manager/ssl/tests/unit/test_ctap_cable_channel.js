/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function newCableChannel() {
  return Cc["@mozilla.org/security/ctapcablechannel;1"].createInstance(
    Ci.nsICtapCableChannel
  );
}

add_task(async function test_cable_channel_consistency() {
  // JavaScript version of Rust_NoiseChannelConsistency
  // (security/manager/ssl/noise/gtest/test.rs)
  const KEY0 = Uint8Array.fromHex(
    "2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a"
  );
  const KEY1 = Uint8Array.fromHex(
    "4343434343434343434343434343434343434343434343434343434343434343"
  );

  let alice = newCableChannel();
  ok(!alice.hasKeys, "alice should not have keys on creation");

  alice.initializeKeys(KEY0, KEY1);
  ok(alice.hasKeys, "alice should have keys after init");

  let bob = newCableChannel();
  ok(!bob.hasKeys, "bob should not have keys on creation");

  bob.initializeKeys(KEY1, KEY0);
  ok(bob.hasKeys, "bob should have keys after init");

  const MSG = "The quick brown fox jumps over the lazy dog.";
  const MSG_BYTES = stringToArray(MSG);
  const EXPECTED_CRYPTED = Uint8Array.fromHex(
    "a4221bbd65ac9bd6da472f1c4a93950da19edaccbf61cd8e2febb60df5b2ae334cabad" +
      "4d74321e567b0d0c470429e0cba79c29a79f6148777cd000e31daa6eb71dfe23c59a" +
      "96b2fe48c62a21208821ec"
  );

  let crypted = new Uint8Array(alice.encrypt(MSG_BYTES));
  deepEqual(
    crypted,
    EXPECTED_CRYPTED,
    "encrypted value should be the expected value"
  );

  let decrypted = arrayToString(bob.decrypt(crypted));
  equal(decrypted, MSG, "decrypted value should be the original message");

  // Encrypting the same value again should use a different nonce, and thus
  // different ciphertext.
  const EXPECTED_CRYPTED2 = Uint8Array.fromHex(
    "15ad06403f68fced802b3709ac2e9ab5ed409171c7fc23c0c0ad537297b70019042e73" +
      "321bdd4d038fe023741960fc824382da5387d93b4232727b89fc86ac089bc295ba14" +
      "3a867968443be8540673da"
  );

  let crypted2 = new Uint8Array(alice.encrypt(MSG_BYTES));
  deepEqual(
    crypted2,
    EXPECTED_CRYPTED2,
    "2nd encrypted value should be the expected value"
  );

  let decrypted2 = arrayToString(bob.decrypt(crypted2));
  equal(decrypted2, MSG, "2nd decrypted value should be the original message");
});
