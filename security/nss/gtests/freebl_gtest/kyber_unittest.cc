// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at http://mozilla.org/MPL/2.0/.

#include "gtest/gtest.h"

#include <functional>

#include "blapi.h"
#include "json_reader.h"
#include "nss_scoped_ptrs.h"
#include "kat/kyber768_kat.h"
#include "testvectors_base/test-structs.h"
#include "testvectors/ml-kem-keygen-vectors.h"
#include "testvectors/ml-kem-encap-vectors.h"
#include "testvectors/ml-kem-decap-vectors.h"

namespace nss_test {

size_t get_ciphertext_length(KyberParams param) {
  size_t len = 0;
  switch (param) {
    case params_kyber768_round3:
    case params_kyber768_round3_test_mode:
    case params_ml_kem768:
    case params_ml_kem768_test_mode:
      len = KYBER768_CIPHERTEXT_BYTES;
      break;
    case params_ml_kem1024:
    case params_ml_kem1024_test_mode:
      len = MLKEM1024_CIPHERTEXT_BYTES;
      break;
    case params_ml_kem512:
    case params_kyber_invalid:
      break;
  }
  return len;
}

size_t get_private_key_length(KyberParams param) {
  size_t len = 0;
  switch (param) {
    case params_kyber768_round3:
    case params_kyber768_round3_test_mode:
    case params_ml_kem768:
    case params_ml_kem768_test_mode:
      len = KYBER768_PRIVATE_KEY_BYTES;
      break;
    case params_ml_kem1024:
    case params_ml_kem1024_test_mode:
      len = MLKEM1024_PRIVATE_KEY_BYTES;
      break;
    case params_ml_kem512:
    case params_kyber_invalid:
      break;
  }
  return len;
}

size_t get_public_key_length(KyberParams param) {
  size_t len = 0;
  switch (param) {
    case params_kyber768_round3:
    case params_kyber768_round3_test_mode:
    case params_ml_kem768:
    case params_ml_kem768_test_mode:
      len = KYBER768_PUBLIC_KEY_BYTES;
      break;
    case params_ml_kem1024:
    case params_ml_kem1024_test_mode:
      len = MLKEM1024_PUBLIC_KEY_BYTES;
      break;
    case params_ml_kem512:
    case params_kyber_invalid:
      break;
  }
  return len;
}

class KyberTest : public ::testing::Test {};

class KyberSelfTest : public KyberTest,
                      public ::testing::WithParamInterface<KyberParams> {};

TEST_P(KyberSelfTest, ConsistencyTest) {
  const KyberParams& param(GetParam());

  ScopedSECItem privateKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
  ScopedSECItem publicKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));
  ScopedSECItem ciphertext(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_CIPHER_LENGTH));
  ScopedSECItem secret(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));
  ScopedSECItem secret2(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

  privateKey->len = get_private_key_length(param);
  publicKey->len = get_public_key_length(param);

  SECStatus rv =
      Kyber_NewKey(param, nullptr, privateKey.get(), publicKey.get());
  EXPECT_EQ(SECSuccess, rv);

  ciphertext->len = get_ciphertext_length(param);

  rv = Kyber_Encapsulate(param, nullptr, publicKey.get(), ciphertext.get(),
                         secret.get());
  EXPECT_EQ(SECSuccess, rv);

  rv = Kyber_Decapsulate(param, privateKey.get(), ciphertext.get(),
                         secret2.get());
  EXPECT_EQ(SECSuccess, rv);

  EXPECT_EQ(secret->len, KYBER_SHARED_SECRET_BYTES);
  EXPECT_EQ(secret2->len, KYBER_SHARED_SECRET_BYTES);
  EXPECT_EQ(0, memcmp(secret->data, secret2->data, KYBER_SHARED_SECRET_BYTES));
}

TEST_P(KyberSelfTest, InvalidParameterTest) {
  const KyberParams& param(GetParam());

  ScopedSECItem privateKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
  ScopedSECItem publicKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));
  ScopedSECItem ciphertext(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_CIPHER_LENGTH));
  ScopedSECItem secret(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

  privateKey->len = get_private_key_length(param);
  publicKey->len = get_public_key_length(param);

  SECStatus rv = Kyber_NewKey(params_kyber_invalid, nullptr, privateKey.get(),
                              publicKey.get());
  EXPECT_EQ(SECFailure, rv);

  rv = Kyber_NewKey(param, nullptr, privateKey.get(), publicKey.get());
  EXPECT_EQ(SECSuccess, rv);

  ciphertext->len = get_ciphertext_length(param);

  rv = Kyber_Encapsulate(params_kyber_invalid, nullptr, publicKey.get(),
                         ciphertext.get(), secret.get());
  EXPECT_EQ(SECFailure, rv);

  rv = Kyber_Encapsulate(param, nullptr, publicKey.get(), ciphertext.get(),
                         secret.get());
  EXPECT_EQ(SECSuccess, rv);

  rv = Kyber_Decapsulate(params_kyber_invalid, privateKey.get(),
                         ciphertext.get(), secret.get());
  EXPECT_EQ(SECFailure, rv);

  rv = Kyber_Decapsulate(param, privateKey.get(), ciphertext.get(),
                         secret.get());
  EXPECT_EQ(SECSuccess, rv);
}

TEST_P(KyberSelfTest, InvalidPublicKeyTest) {
  const KyberParams& param(GetParam());

  ScopedSECItem shortBuffer(SECITEM_AllocItem(nullptr, nullptr, 7));
  ScopedSECItem privateKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));

  privateKey->len = get_private_key_length(param);

  SECStatus rv =
      Kyber_NewKey(param, nullptr, privateKey.get(), shortBuffer.get());
  EXPECT_EQ(SECFailure, rv);  // short publicKey buffer
}

TEST_P(KyberSelfTest, InvalidCiphertextTest) {
  const KyberParams& param(GetParam());

  ScopedSECItem shortBuffer(SECITEM_AllocItem(nullptr, nullptr, 7));
  ScopedSECItem privateKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
  ScopedSECItem publicKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));
  ScopedSECItem ciphertext(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_CIPHER_LENGTH));
  ScopedSECItem secret(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));
  ScopedSECItem secret2(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

  privateKey->len = get_private_key_length(param);
  publicKey->len = get_public_key_length(param);

  SECStatus rv =
      Kyber_NewKey(param, nullptr, privateKey.get(), publicKey.get());
  EXPECT_EQ(SECSuccess, rv);

  ciphertext->len = get_ciphertext_length(param);

  rv = Kyber_Encapsulate(param, nullptr, publicKey.get(), shortBuffer.get(),
                         secret.get());
  EXPECT_EQ(SECFailure, rv);  // short ciphertext input

  rv = Kyber_Encapsulate(param, nullptr, publicKey.get(), ciphertext.get(),
                         secret.get());
  EXPECT_EQ(SECSuccess, rv);

  // Modify a random byte in the ciphertext
  size_t pos;
  rv = RNG_GenerateGlobalRandomBytes((uint8_t*)&pos, sizeof(pos));
  EXPECT_EQ(SECSuccess, rv);

  uint8_t byte;
  rv = RNG_GenerateGlobalRandomBytes((uint8_t*)&byte, sizeof(byte));
  EXPECT_EQ(SECSuccess, rv);

  size_t ct_len = get_ciphertext_length(param);
  EXPECT_EQ(ciphertext->len, ct_len);
  ciphertext->data[pos % ct_len] ^= (byte | 1);

  rv = Kyber_Decapsulate(param, privateKey.get(), ciphertext.get(),
                         secret2.get());
  EXPECT_EQ(SECSuccess, rv);

  EXPECT_EQ(secret->len, KYBER_SHARED_SECRET_BYTES);
  EXPECT_EQ(secret2->len, KYBER_SHARED_SECRET_BYTES);
  EXPECT_NE(0, memcmp(secret->data, secret2->data, KYBER_SHARED_SECRET_BYTES));
}

TEST_P(KyberSelfTest, InvalidPrivateKeyTest) {
  const KyberParams& param(GetParam());

  ScopedSECItem shortBuffer(SECITEM_AllocItem(nullptr, nullptr, 7));
  ScopedSECItem privateKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
  ScopedSECItem publicKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));
  ScopedSECItem ciphertext(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_CIPHER_LENGTH));
  ScopedSECItem secret(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));
  ScopedSECItem secret2(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

  privateKey->len = get_private_key_length(param);
  publicKey->len = get_public_key_length(param);

  SECStatus rv =
      Kyber_NewKey(param, nullptr, shortBuffer.get(), publicKey.get());
  EXPECT_EQ(SECFailure, rv);  // short privateKey buffer

  rv = Kyber_NewKey(param, nullptr, privateKey.get(), publicKey.get());
  EXPECT_EQ(SECSuccess, rv);

  ciphertext->len = get_ciphertext_length(param);

  rv = Kyber_Encapsulate(param, nullptr, publicKey.get(), ciphertext.get(),
                         secret.get());
  EXPECT_EQ(SECSuccess, rv);

  // Modify a random byte in the private key
  size_t pos;
  rv = RNG_GenerateGlobalRandomBytes((uint8_t*)&pos, sizeof(pos));
  EXPECT_EQ(SECSuccess, rv);

  uint8_t byte;
  rv = RNG_GenerateGlobalRandomBytes((uint8_t*)&byte, sizeof(byte));
  EXPECT_EQ(SECSuccess, rv);

  // Modifying the implicit rejection key will not cause decapsulation failure.
  size_t pvk_len = get_private_key_length(param);
  size_t puk_len = get_public_key_length(param);
  EXPECT_EQ(privateKey->len, pvk_len);
  size_t ir_pos = pvk_len - (pos % KYBER_SHARED_SECRET_BYTES) - 1;
  uint8_t ir_pos_old = privateKey->data[ir_pos];
  privateKey->data[ir_pos] ^= (byte | 1);

  rv = Kyber_Decapsulate(param, privateKey.get(), ciphertext.get(),
                         secret2.get());
  EXPECT_EQ(SECSuccess, rv);

  EXPECT_EQ(secret->len, KYBER_SHARED_SECRET_BYTES);
  EXPECT_EQ(secret2->len, KYBER_SHARED_SECRET_BYTES);
  EXPECT_EQ(0, memcmp(secret->data, secret2->data, KYBER_SHARED_SECRET_BYTES));

  // Fix the private key
  privateKey->data[ir_pos] = ir_pos_old;

  // For ML-KEM when modifying the public key, the key must be rejected.
  // Kyber will decapsulate without an error in these cases
  size_t pk_pos = pvk_len - 2 * KYBER_SHARED_SECRET_BYTES - (pos % puk_len) - 1;
  uint8_t pk_pos_old = privateKey->data[pk_pos];
  privateKey->data[pk_pos] ^= (byte | 1);

  rv = Kyber_Decapsulate(param, privateKey.get(), ciphertext.get(),
                         secret2.get());
  if (param == params_kyber768_round3) {
    EXPECT_EQ(SECSuccess, rv);
  } else {
    EXPECT_EQ(SECFailure, rv);
  }

  // Fix the key again.
  privateKey->data[pk_pos] = pk_pos_old;

  // For ML-KEM when modifying the public key hash, the key must be rejected.
  // Kyber will decapsulate without an error in these cases
  size_t pk_hash_pos = pvk_len - KYBER_SHARED_SECRET_BYTES -
                       (pos % KYBER_SHARED_SECRET_BYTES) - 1;
  privateKey->data[pk_hash_pos] ^= (byte | 1);

  rv = Kyber_Decapsulate(param, privateKey.get(), ciphertext.get(),
                         secret2.get());
  if (param == params_kyber768_round3) {
    EXPECT_EQ(SECSuccess, rv);
  } else {
    EXPECT_EQ(SECFailure, rv);
  }
}

TEST_P(KyberSelfTest, DecapsulationWithModifiedRejectionKeyTest) {
  const KyberParams& param(GetParam());

  ScopedSECItem privateKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
  ScopedSECItem publicKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));
  ScopedSECItem ciphertext(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_CIPHER_LENGTH));
  ScopedSECItem secret(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));
  ScopedSECItem secret2(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));
  ScopedSECItem secret3(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

  privateKey->len = get_private_key_length(param);
  publicKey->len = get_public_key_length(param);

  SECStatus rv =
      Kyber_NewKey(param, nullptr, privateKey.get(), publicKey.get());
  EXPECT_EQ(SECSuccess, rv);

  ciphertext->len = get_ciphertext_length(param);

  rv = Kyber_Encapsulate(param, nullptr, publicKey.get(), ciphertext.get(),
                         secret.get());
  EXPECT_EQ(SECSuccess, rv);

  // Modify a random byte in the ciphertext and decapsulate it
  size_t pos;
  rv = RNG_GenerateGlobalRandomBytes((uint8_t*)&pos, sizeof(pos));
  EXPECT_EQ(SECSuccess, rv);

  uint8_t byte;
  rv = RNG_GenerateGlobalRandomBytes((uint8_t*)&byte, sizeof(byte));
  EXPECT_EQ(SECSuccess, rv);

  size_t ct_len = get_ciphertext_length(param);
  EXPECT_EQ(ciphertext->len, ct_len);
  ciphertext->data[pos % ct_len] ^= (byte | 1);

  rv = Kyber_Decapsulate(param, privateKey.get(), ciphertext.get(),
                         secret2.get());
  EXPECT_EQ(SECSuccess, rv);

  // Now, modify a random byte in the implicit rejection key and try
  // the decapsulation again. The result should be different.
  rv = RNG_GenerateGlobalRandomBytes((uint8_t*)&pos, sizeof(pos));
  EXPECT_EQ(SECSuccess, rv);

  rv = RNG_GenerateGlobalRandomBytes((uint8_t*)&byte, sizeof(byte));
  EXPECT_EQ(SECSuccess, rv);

  size_t pvk_len = get_private_key_length(param);
  pos =
      (pvk_len - KYBER_SHARED_SECRET_BYTES) + (pos % KYBER_SHARED_SECRET_BYTES);
  EXPECT_EQ(privateKey->len, pvk_len);
  privateKey->data[pos] ^= (byte | 1);

  rv = Kyber_Decapsulate(param, privateKey.get(), ciphertext.get(),
                         secret3.get());
  EXPECT_EQ(SECSuccess, rv);

  EXPECT_EQ(secret2->len, KYBER_SHARED_SECRET_BYTES);
  EXPECT_EQ(secret3->len, KYBER_SHARED_SECRET_BYTES);
  EXPECT_NE(0, memcmp(secret2->data, secret3->data, KYBER_SHARED_SECRET_BYTES));
}

#ifdef NSS_DISABLE_KYBER
INSTANTIATE_TEST_SUITE_P(SelfTests, KyberSelfTest,
                         ::testing::Values(params_ml_kem768,
                                           params_ml_kem1024));
#else
INSTANTIATE_TEST_SUITE_P(SelfTests, KyberSelfTest,
                         ::testing::Values(params_ml_kem768, params_ml_kem1024,
                                           params_kyber768_round3));
#endif

TEST(Kyber768Test, KnownAnswersTest) {
  ScopedSECItem privateKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
  ScopedSECItem publicKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));
  ScopedSECItem ciphertext(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_CIPHER_LENGTH));
  ScopedSECItem secret(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));
  ScopedSECItem secret2(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

  SECStatus rv;
  uint8_t digest[SHA256_LENGTH];

  for (const auto& kat : KyberKATs) {
    SECItem keypair_seed = {siBuffer, (unsigned char*)kat.newKeySeed,
                            sizeof kat.newKeySeed};
    SECItem enc_seed = {siBuffer, (unsigned char*)kat.encapsSeed,
                        sizeof kat.encapsSeed};

    privateKey->len = get_private_key_length(kat.params);
    publicKey->len = get_public_key_length(kat.params);
    ciphertext->len = get_ciphertext_length(kat.params);

    rv = Kyber_NewKey(kat.params, &keypair_seed, privateKey.get(),
                      publicKey.get());
    EXPECT_EQ(SECSuccess, rv);

    SHA256_HashBuf(digest, privateKey->data, privateKey->len);
    EXPECT_EQ(0, memcmp(kat.privateKeyDigest, digest, sizeof digest));

    SHA256_HashBuf(digest, publicKey->data, publicKey->len);
    EXPECT_EQ(0, memcmp(kat.publicKeyDigest, digest, sizeof digest));

    rv = Kyber_Encapsulate(kat.params, &enc_seed, publicKey.get(),
                           ciphertext.get(), secret.get());
    EXPECT_EQ(SECSuccess, rv);

    SHA256_HashBuf(digest, ciphertext->data, ciphertext->len);
    EXPECT_EQ(0, memcmp(kat.ciphertextDigest, digest, sizeof digest));

    EXPECT_EQ(secret->len, KYBER_SHARED_SECRET_BYTES);
    EXPECT_EQ(0, memcmp(kat.secret, secret->data, secret->len));

    rv = Kyber_Decapsulate(kat.params, privateKey.get(), ciphertext.get(),
                           secret2.get());
    EXPECT_EQ(SECSuccess, rv);
    EXPECT_EQ(secret2->len, KYBER_SHARED_SECRET_BYTES);
    EXPECT_EQ(0, memcmp(secret->data, secret2->data, secret2->len));
  }
}

TEST(MlKemKeyGen, KnownAnswersTest) {
  ScopedSECItem privateKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
  ScopedSECItem publicKey(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));

  uint8_t digest[SHA3_256_LENGTH];

  for (const auto& kat : MlKemKeyGenTests) {
    SECItem keypair_seed = {siBuffer, (unsigned char*)kat.seed.data(),
                            (unsigned int)kat.seed.size()};

    privateKey->len = get_private_key_length(kat.params);
    publicKey->len = get_public_key_length(kat.params);

    SECStatus rv = Kyber_NewKey(kat.params, &keypair_seed, privateKey.get(),
                                publicKey.get());
    EXPECT_EQ(SECSuccess, rv);

    rv = SHA3_256_HashBuf(digest, privateKey->data, privateKey->len);
    EXPECT_EQ(SECSuccess, rv);
    EXPECT_EQ(kat.privateKeyDigest.size(), sizeof(digest));
    EXPECT_EQ(0, memcmp(kat.privateKeyDigest.data(), digest, sizeof(digest)));

    rv = SHA3_256_HashBuf(digest, publicKey->data, publicKey->len);
    EXPECT_EQ(SECSuccess, rv);
    EXPECT_EQ(kat.publicKeyDigest.size(), sizeof(digest));
    EXPECT_EQ(0, memcmp(kat.publicKeyDigest.data(), digest, sizeof(digest)));
  }
}

TEST(MlKemEncap, KnownAnswersTest) {
  ScopedSECItem ciphertext(
      SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_CIPHER_LENGTH));
  ScopedSECItem secret(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

  uint8_t digest[SHA3_256_LENGTH];

  for (const auto& kat : MlKemEncapTests) {
    SECItem seed = {siBuffer, (unsigned char*)kat.entropy.data(),
                    (unsigned int)kat.entropy.size()};
    SECItem publicKey = {siBuffer, (unsigned char*)kat.publicKey.data(),
                         (unsigned int)kat.publicKey.size()};

    ciphertext->len = get_ciphertext_length(kat.params);

    // Only valid tests for now
    EXPECT_TRUE(kat.expectedResult);

    SECStatus rv = Kyber_Encapsulate(kat.params, &seed, &publicKey,
                                     ciphertext.get(), secret.get());
    EXPECT_EQ(SECSuccess, rv);

    rv = SHA3_256_HashBuf(digest, ciphertext->data, ciphertext->len);
    EXPECT_EQ(SECSuccess, rv);
    EXPECT_EQ(kat.cipherTextDigest.size(), sizeof(digest));
    EXPECT_EQ(0, memcmp(kat.cipherTextDigest.data(), digest, sizeof(digest)));

    EXPECT_EQ(kat.secret.size(), secret->len);
    EXPECT_EQ(0, memcmp(kat.secret.data(), secret->data, secret->len));
  }
}

TEST(MlKemDecap, KnownAnswersTest) {
  ScopedSECItem secret(
      SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

  for (const auto& kat : MlKemDecapTests) {
    SECItem ciphertext = {siBuffer, (unsigned char*)kat.cipherText.data(),
                          (unsigned int)kat.cipherText.size()};
    SECItem privateKey = {siBuffer, (unsigned char*)kat.privateKey.data(),
                          (unsigned int)kat.privateKey.size()};

    // Only valid tests for now
    EXPECT_TRUE(kat.expectedResult);

    SECStatus rv =
        Kyber_Decapsulate(kat.params, &privateKey, &ciphertext, secret.get());
    EXPECT_EQ(SECSuccess, rv);
    EXPECT_EQ(secret->len, KYBER_SHARED_SECRET_BYTES);
    EXPECT_EQ(
        0, memcmp(secret->data, kat.secret.data(), KYBER_SHARED_SECRET_BYTES));
  }
}

/* Wycheproof ML-KEM vectors, read from
 * gtests/common/wycheproof/source_vectors at run time. Unlike the NIST ACVP
 * vectors above these include negative cases: malformed keys and ciphertexts
 * that FIPS 203 requires an implementation to reject. */

struct MlKemTestVector {
  uint64_t id;
  bool valid;
  std::vector<uint8_t> seed; /* keygen seed, d || z */
  std::vector<uint8_t> dk;   /* expanded decapsulation key */
  std::vector<uint8_t> ek;   /* encapsulation key */
  std::vector<uint8_t> m;    /* encapsulation entropy */
  std::vector<uint8_t> c;    /* ciphertext */
  std::vector<uint8_t> k;    /* shared secret */
};

class MlKemWycheproofTest : public ::testing::Test {
 protected:
  typedef std::function<void(const MlKemTestVector&)> Operation;

  void Run(const std::string& file, const std::string& schema,
           KyberParams params, Operation op) {
    params_ = params;
    op_ = op;
    WycheproofHeader(file, "ML-KEM", schema,
                     [this](JsonReader& r) { RunGroup(r); });
  }

  /* seed -> (ek, dk) */
  void KeyGen(const MlKemTestVector& t) {
    ScopedSECItem dk(
        SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
    ScopedSECItem ek(
        SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));
    if (!NewKey(t, dk.get(), ek.get())) {
      return;
    }
    EXPECT_EQ(t.ek, Bytes(ek.get()));
    EXPECT_EQ(t.dk, Bytes(dk.get()));
  }

  /* (ek, m) -> (c, K) */
  void Encaps(const MlKemTestVector& t) {
    SECItem ek = Item(t.ek);
    SECItem m = Item(t.m);
    ScopedSECItem c(
        SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_CIPHER_LENGTH));
    ScopedSECItem k(
        SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));
    c->len = static_cast<unsigned int>(get_ciphertext_length(params_));

    SECStatus rv = Kyber_Encapsulate(params_, &m, &ek, c.get(), k.get());
    ASSERT_EQ(t.valid ? SECSuccess : SECFailure, rv);
    if (!t.valid) {
      return;
    }
    EXPECT_EQ(t.c, Bytes(c.get()));
    EXPECT_EQ(t.k, Bytes(k.get()));
  }

  /* seed -> dk, then (dk, c) -> K. Either step may reject an invalid case. */
  void SeedDecaps(const MlKemTestVector& t) {
    ScopedSECItem dk(
        SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PRIVATE_KEY_LENGTH));
    ScopedSECItem ek(
        SECITEM_AllocItem(nullptr, nullptr, MAX_ML_KEM_PUBLIC_KEY_LENGTH));
    if (!NewKey(t, dk.get(), ek.get())) {
      return;
    }
    if (!t.ek.empty()) {
      EXPECT_EQ(t.ek, Bytes(ek.get()));
    }
    Decapsulate(t, dk.get());
  }

  /* (dk, c) -> K, with the expanded key given directly. */
  void Decaps(const MlKemTestVector& t) {
    SECItem dk = Item(t.dk);
    Decapsulate(t, &dk);
  }

 private:
  static SECItem Item(const std::vector<uint8_t>& v) {
    SECItem item = {siBuffer, const_cast<uint8_t*>(v.data()),
                    static_cast<unsigned int>(v.size())};
    return item;
  }

  static std::vector<uint8_t> Bytes(const SECItem* item) {
    return std::vector<uint8_t>(item->data, item->data + item->len);
  }

  /* Derive a key pair from t.seed. Returns false if the test is done, either
   * because the seed was rejected as expected or because the failure has
   * already been reported. */
  bool NewKey(const MlKemTestVector& t, SECItem* dk, SECItem* ek) {
    SECItem seed = Item(t.seed);
    dk->len = static_cast<unsigned int>(get_private_key_length(params_));
    ek->len = static_cast<unsigned int>(get_public_key_length(params_));
    if (Kyber_NewKey(params_, &seed, dk, ek) == SECSuccess) {
      return true;
    }
    EXPECT_FALSE(t.valid) << "key generation failed for a valid vector";
    return false;
  }

  void Decapsulate(const MlKemTestVector& t, SECItem* dk) {
    SECItem c = Item(t.c);
    ScopedSECItem k(
        SECITEM_AllocItem(nullptr, nullptr, KYBER_SHARED_SECRET_BYTES));

    SECStatus rv = Kyber_Decapsulate(params_, dk, &c, k.get());
    ASSERT_EQ(t.valid ? SECSuccess : SECFailure, rv);
    if (!t.valid) {
      return;
    }
    EXPECT_EQ(t.k, Bytes(k.get()));
  }

  static void ReadTestAttr(MlKemTestVector& t, const std::string& n,
                           JsonReader& r) {
    if (n == "seed") {
      t.seed = r.ReadHex();
    } else if (n == "dk") {
      t.dk = r.ReadHex();
    } else if (n == "ek") {
      t.ek = r.ReadHex();
    } else if (n == "m") {
      t.m = r.ReadHex();
    } else if (n == "c") {
      t.c = r.ReadHex();
    } else if (n == "K") {
      t.k = r.ReadHex();
    } else {
      FAIL() << "unsupported test case field: " << n;
    }
  }

  void RunGroup(JsonReader& r) {
    std::vector<MlKemTestVector> tests;
    while (r.NextItem()) {
      std::string n = r.ReadLabel();
      if (n == "") {
        break;
      }
      if (n == "parameterSet") {
        ASSERT_EQ(ParameterSetName(), r.ReadString());
      } else if (n == "type" || n == "source") {
        r.SkipValue();
      } else if (n == "tests") {
        WycheproofReadTests(r, &tests, ReadTestAttr, false);
      } else {
        FAIL() << "unknown group label: " << n;
      }
    }

    for (auto& t : tests) {
      SCOPED_TRACE(testing::Message() << "tcId " << t.id);
      op_(t);
    }
  }

  std::string ParameterSetName() {
    switch (params_) {
      case params_ml_kem768:
      case params_ml_kem768_test_mode:
        return "ML-KEM-768";
      case params_ml_kem1024:
      case params_ml_kem1024_test_mode:
        return "ML-KEM-1024";
      default:
        ADD_FAILURE() << "unsupported parameter set";
        return "";
    }
  }

  KyberParams params_;
  Operation op_;
};

#define ML_KEM_WYCHEPROOF_TESTS(name, bits, params, testModeParams)          \
  TEST_F(MlKemWycheproofTest, name##KeyGen) {                                \
    Run("mlkem_" #bits "_keygen_seed", "mlkem_keygen_seed_test_schema.json", \
        params, [this](const MlKemTestVector& t) { KeyGen(t); });            \
  }                                                                          \
  /* Encapsulation is the only operation that takes its entropy as an input, \
   * so it needs the seeded (test mode) parameter set. */                    \
  TEST_F(MlKemWycheproofTest, name##Encaps) {                                \
    Run("mlkem_" #bits "_encaps", "mlkem_encaps_test_schema.json",           \
        testModeParams, [this](const MlKemTestVector& t) { Encaps(t); });    \
  }                                                                          \
  TEST_F(MlKemWycheproofTest, name##SeedDecaps) {                            \
    Run("mlkem_" #bits, "mlkem_test_schema.json", params,                    \
        [this](const MlKemTestVector& t) { SeedDecaps(t); });                \
  }                                                                          \
  TEST_F(MlKemWycheproofTest, name##Decaps) {                                \
    Run("mlkem_" #bits "_semi_expanded_decaps",                              \
        "mlkem_semi_expanded_decaps_test_schema.json", params,               \
        [this](const MlKemTestVector& t) { Decaps(t); });                    \
  }

ML_KEM_WYCHEPROOF_TESTS(MlKem768, 768, params_ml_kem768,
                        params_ml_kem768_test_mode)
ML_KEM_WYCHEPROOF_TESTS(MlKem1024, 1024, params_ml_kem1024,
                        params_ml_kem1024_test_mode)

}  // namespace nss_test
