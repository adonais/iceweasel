// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at http://mozilla.org/MPL/2.0/.

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

#include "gtest/gtest.h"

#include "blapi.h"
#include "json_reader.h"
#include "secerr.h"
#include "secitem.h"

#include "kat/mldsa_keygen.h"

namespace nss_test {

static std::vector<uint8_t> from_hex(const std::string& hex) {
  EXPECT_EQ(0U, hex.size() % 2);
  std::vector<uint8_t> out(hex.size() / 2);
  for (size_t i = 0; i < out.size(); ++i) {
    out[i] =
        static_cast<uint8_t>(strtol(hex.substr(2 * i, 2).c_str(), nullptr, 16));
  }
  return out;
}

static unsigned int sig_len(CK_ML_DSA_PARAMETER_SET_TYPE p) {
  switch (p) {
    case CKP_ML_DSA_44:
      return ML_DSA_44_SIGNATURE_LEN;
    case CKP_ML_DSA_65:
      return ML_DSA_65_SIGNATURE_LEN;
    case CKP_ML_DSA_87:
      return ML_DSA_87_SIGNATURE_LEN;
  }
  return 0;
}

// Sign a message (possibly in two chunks) via the streaming freebl interface.
static SECStatus do_sign(MLDSAPrivateKey* priv, CK_HEDGE_TYPE hedge,
                         const SECItem* ctx, const SECItem* part1,
                         const SECItem* part2, SECItem* sig) {
  MLDSAContext* mctx = nullptr;
  if (MLDSA_SignInit(priv, hedge, ctx, &mctx) != SECSuccess) {
    return SECFailure;
  }
  if (part1) MLDSA_SignUpdate(mctx, part1);
  if (part2) MLDSA_SignUpdate(mctx, part2);
  SECStatus rv = MLDSA_SignFinal(mctx, sig);
  MLDSA_DestroyContext(mctx);
  return rv;
}

static SECStatus do_verify(MLDSAPublicKey* pub, const SECItem* ctx,
                           const SECItem* part1, const SECItem* part2,
                           const SECItem* sig) {
  MLDSAContext* mctx = nullptr;
  if (MLDSA_VerifyInit(pub, ctx, &mctx) != SECSuccess) {
    return SECFailure;
  }
  if (part1) MLDSA_VerifyUpdate(mctx, part1);
  if (part2) MLDSA_VerifyUpdate(mctx, part2);
  SECStatus rv = MLDSA_VerifyFinal(mctx, sig);
  MLDSA_DestroyContext(mctx);
  return rv;
}

class MlDsaSelfTest
    : public ::testing::TestWithParam<CK_ML_DSA_PARAMETER_SET_TYPE> {};

TEST_P(MlDsaSelfTest, SignVerifyRoundTrip) {
  CK_ML_DSA_PARAMETER_SET_TYPE param = GetParam();

  MLDSAPrivateKey priv = {};
  MLDSAPublicKey pub = {};
  ASSERT_EQ(SECSuccess, MLDSA_NewKey(param, nullptr, &priv, &pub));
  EXPECT_EQ(param, priv.paramSet);
  EXPECT_EQ(param, pub.paramSet);
  EXPECT_EQ(static_cast<unsigned int>(ML_DSA_SEED_LEN), priv.seedLen);

  uint8_t ctxbuf[] = {1, 2, 3};
  SECItem context = {siBuffer, ctxbuf, sizeof(ctxbuf)};
  std::vector<uint8_t> m1 = {'m', 'l', '-'};
  std::vector<uint8_t> m2 = {'d', 's', 'a', '!'};
  SECItem d1 = {siBuffer, m1.data(), (unsigned int)m1.size()};
  SECItem d2 = {siBuffer, m2.data(), (unsigned int)m2.size()};

  std::vector<uint8_t> sigbuf(MAX_ML_DSA_SIGNATURE_LEN);

  for (CK_HEDGE_TYPE hedge :
       {CKH_DETERMINISTIC_REQUIRED, CKH_HEDGE_PREFERRED, CKH_HEDGE_REQUIRED}) {
    SECItem sig = {siBuffer, sigbuf.data(), (unsigned int)sigbuf.size()};
    ASSERT_EQ(SECSuccess, do_sign(&priv, hedge, &context, &d1, &d2, &sig))
        << "sign hedge=" << hedge;
    EXPECT_EQ(sig_len(param), sig.len);

    // Valid signature verifies.
    EXPECT_EQ(SECSuccess, do_verify(&pub, &context, &d1, &d2, &sig));

    // Tampered message fails.
    std::vector<uint8_t> bad = {'X', 'l', '-'};
    SECItem badItem = {siBuffer, bad.data(), (unsigned int)bad.size()};
    EXPECT_EQ(SECFailure, do_verify(&pub, &context, &badItem, &d2, &sig));

    // Wrong context fails.
    uint8_t ctxbuf2[] = {9, 9, 9};
    SECItem context2 = {siBuffer, ctxbuf2, sizeof(ctxbuf2)};
    EXPECT_EQ(SECFailure, do_verify(&pub, &context2, &d1, &d2, &sig));
  }
}

// Deterministic signatures are reproducible; hedged ones differ.
TEST_P(MlDsaSelfTest, DeterministicIsStable) {
  CK_ML_DSA_PARAMETER_SET_TYPE param = GetParam();
  MLDSAPrivateKey priv = {};
  MLDSAPublicKey pub = {};
  ASSERT_EQ(SECSuccess, MLDSA_NewKey(param, nullptr, &priv, &pub));

  std::vector<uint8_t> m = {'a', 'b', 'c'};
  SECItem msg = {siBuffer, m.data(), (unsigned int)m.size()};
  SECItem emptyCtx = {siBuffer, nullptr, 0};

  std::vector<uint8_t> buf1(MAX_ML_DSA_SIGNATURE_LEN);
  std::vector<uint8_t> buf2(MAX_ML_DSA_SIGNATURE_LEN);
  SECItem s1 = {siBuffer, buf1.data(), (unsigned int)buf1.size()};
  SECItem s2 = {siBuffer, buf2.data(), (unsigned int)buf2.size()};
  ASSERT_EQ(SECSuccess, do_sign(&priv, CKH_DETERMINISTIC_REQUIRED, &emptyCtx,
                                &msg, nullptr, &s1));
  ASSERT_EQ(SECSuccess, do_sign(&priv, CKH_DETERMINISTIC_REQUIRED, &emptyCtx,
                                &msg, nullptr, &s2));
  ASSERT_EQ(s1.len, s2.len);
  EXPECT_EQ(0, memcmp(s1.data, s2.data, s1.len));
}

// The context buffers the whole message, starting at 1024 bytes and doubling.
// Anything longer than that goes down the grow path, which the Wycheproof
// vectors never reach. Growth is driven by the running total rather than by
// any single update, so feed the same message both ways and require the two
// signatures to agree.
TEST_P(MlDsaSelfTest, LongMessageGrowsTheBuffer) {
  CK_ML_DSA_PARAMETER_SET_TYPE param = GetParam();
  MLDSAPrivateKey priv = {};
  MLDSAPublicKey pub = {};
  ASSERT_EQ(SECSuccess, MLDSA_NewKey(param, nullptr, &priv, &pub));

  // Past 1024, and past the 2048 and 4096 doublings as well.
  std::vector<uint8_t> m(5000);
  for (size_t i = 0; i < m.size(); ++i) {
    m[i] = static_cast<uint8_t>(i);
  }
  SECItem msg = {siBuffer, m.data(), (unsigned int)m.size()};
  SECItem emptyCtx = {siBuffer, nullptr, 0};

  std::vector<uint8_t> oneShotBuf(MAX_ML_DSA_SIGNATURE_LEN);
  SECItem oneShot = {siBuffer, oneShotBuf.data(),
                     (unsigned int)oneShotBuf.size()};
  ASSERT_EQ(SECSuccess, do_sign(&priv, CKH_DETERMINISTIC_REQUIRED, &emptyCtx,
                                &msg, nullptr, &oneShot));
  EXPECT_EQ(sig_len(param), oneShot.len);
  EXPECT_EQ(SECSuccess, do_verify(&pub, &emptyCtx, &msg, nullptr, &oneShot));

  // The same message in 100-byte chunks, so the buffer grows a piece at a time.
  MLDSAContext* ctx = nullptr;
  ASSERT_EQ(SECSuccess,
            MLDSA_SignInit(&priv, CKH_DETERMINISTIC_REQUIRED, &emptyCtx, &ctx));
  for (size_t off = 0; off < m.size(); off += 100) {
    unsigned int n = (unsigned int)std::min<size_t>(100, m.size() - off);
    SECItem chunk = {siBuffer, m.data() + off, n};
    ASSERT_EQ(SECSuccess, MLDSA_SignUpdate(ctx, &chunk));
  }
  std::vector<uint8_t> chunkedBuf(MAX_ML_DSA_SIGNATURE_LEN);
  SECItem chunked = {siBuffer, chunkedBuf.data(),
                     (unsigned int)chunkedBuf.size()};
  ASSERT_EQ(SECSuccess, MLDSA_SignFinal(ctx, &chunked));
  MLDSA_DestroyContext(ctx);

  ASSERT_EQ(oneShot.len, chunked.len);
  EXPECT_EQ(0, memcmp(oneShot.data, chunked.data, oneShot.len));
  EXPECT_EQ(SECSuccess, do_verify(&pub, &emptyCtx, &msg, nullptr, &chunked));
}

INSTANTIATE_TEST_SUITE_P(MlDsaSelfTest, MlDsaSelfTest,
                         ::testing::Values(CKP_ML_DSA_44, CKP_ML_DSA_65,
                                           CKP_ML_DSA_87));

// Argument checking and the error paths that the Wycheproof vectors cannot
// reach, since those only ever supply well-formed calls.

// A parameter set is a CK_ULONG; this is not one of the three defined values.
static const CK_ML_DSA_PARAMETER_SET_TYPE kBogusParamSet = 0xffff;

class MlDsaArgumentTest : public ::testing::Test {
 protected:
  void SetUp() override {
    ASSERT_EQ(SECSuccess, MLDSA_NewKey(CKP_ML_DSA_44, nullptr, &priv_, &pub_));
    msg_ = {siBuffer, msgbuf_, sizeof(msgbuf_)};
    emptyCtx_ = {siBuffer, nullptr, 0};
    sigbuf_.resize(MAX_ML_DSA_SIGNATURE_LEN);
    sig_ = {siBuffer, sigbuf_.data(), (unsigned int)sigbuf_.size()};
  }

  MLDSAContext* SignContext() {
    MLDSAContext* ctx = nullptr;
    EXPECT_EQ(SECSuccess, MLDSA_SignInit(&priv_, CKH_DETERMINISTIC_REQUIRED,
                                         &emptyCtx_, &ctx));
    return ctx;
  }

  MLDSAContext* VerifyContext() {
    MLDSAContext* ctx = nullptr;
    EXPECT_EQ(SECSuccess, MLDSA_VerifyInit(&pub_, &emptyCtx_, &ctx));
    return ctx;
  }

  MLDSAPrivateKey priv_ = {};
  MLDSAPublicKey pub_ = {};
  unsigned char msgbuf_[6] = {'m', 'l', '-', 'd', 's', 'a'};
  SECItem msg_;
  SECItem emptyCtx_;
  std::vector<uint8_t> sigbuf_;
  SECItem sig_;
};

TEST_F(MlDsaArgumentTest, NewKeyRejectsBadArguments) {
  MLDSAPrivateKey priv = {};
  MLDSAPublicKey pub = {};

  EXPECT_EQ(SECFailure, MLDSA_NewKey(CKP_ML_DSA_44, nullptr, nullptr, &pub));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_NewKey(CKP_ML_DSA_44, nullptr, &priv, nullptr));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());

  EXPECT_EQ(SECFailure, MLDSA_NewKey(kBogusParamSet, nullptr, &priv, &pub));
  EXPECT_EQ(SEC_ERROR_INVALID_ALGORITHM, PORT_GetError());
}

TEST_F(MlDsaArgumentTest, InitRejectsBadArguments) {
  MLDSAContext* ctx = nullptr;

  EXPECT_EQ(SECFailure, MLDSA_SignInit(nullptr, CKH_DETERMINISTIC_REQUIRED,
                                       &emptyCtx_, &ctx));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_SignInit(&priv_, CKH_DETERMINISTIC_REQUIRED,
                                       &emptyCtx_, nullptr));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());

  EXPECT_EQ(SECFailure, MLDSA_VerifyInit(nullptr, &emptyCtx_, &ctx));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_VerifyInit(&pub_, &emptyCtx_, nullptr));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
}

// Both directions reject an unknown parameter set up front, rather than let
// the caller buffer a whole message against a key that can never be used.
// Signing gets there by range-checking the signing key, verification by
// checking the parameter set on its own.
TEST_F(MlDsaArgumentTest, InitRejectsUnknownParameterSet) {
  MLDSAPrivateKey priv = priv_;
  priv.paramSet = kBogusParamSet;
  MLDSAPublicKey pub = pub_;
  pub.paramSet = kBogusParamSet;

  MLDSAContext* ctx = nullptr;
  EXPECT_EQ(SECFailure, MLDSA_SignInit(&priv, CKH_DETERMINISTIC_REQUIRED,
                                       &emptyCtx_, &ctx));
  EXPECT_EQ(SEC_ERROR_INVALID_ALGORITHM, PORT_GetError());
  EXPECT_EQ(nullptr, ctx);

  EXPECT_EQ(SECFailure, MLDSA_VerifyInit(&pub, &emptyCtx_, &ctx));
  EXPECT_EQ(SEC_ERROR_INVALID_ALGORITHM, PORT_GetError());
  EXPECT_EQ(nullptr, ctx);
}

// A context belongs to one direction only; the other direction's update and
// final calls have to reject it.
TEST_F(MlDsaArgumentTest, UpdateAndFinalRejectTheWrongDirection) {
  MLDSAContext* signCtx = SignContext();
  ASSERT_NE(nullptr, signCtx);
  MLDSAContext* verifyCtx = VerifyContext();
  ASSERT_NE(nullptr, verifyCtx);

  EXPECT_EQ(SECFailure, MLDSA_SignUpdate(nullptr, &msg_));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_SignUpdate(verifyCtx, &msg_));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());

  EXPECT_EQ(SECFailure, MLDSA_VerifyUpdate(nullptr, &msg_));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_VerifyUpdate(signCtx, &msg_));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());

  EXPECT_EQ(SECFailure, MLDSA_SignFinal(nullptr, &sig_));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_SignFinal(signCtx, nullptr));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_SignFinal(verifyCtx, &sig_));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());

  EXPECT_EQ(SECFailure, MLDSA_VerifyFinal(nullptr, &sig_));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_VerifyFinal(verifyCtx, nullptr));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());
  EXPECT_EQ(SECFailure, MLDSA_VerifyFinal(signCtx, &sig_));
  EXPECT_EQ(SEC_ERROR_INVALID_ARGS, PORT_GetError());

  MLDSA_DestroyContext(signCtx);
  MLDSA_DestroyContext(verifyCtx);
}

TEST_F(MlDsaArgumentTest, SignFinalRejectsAShortSignatureBuffer) {
  MLDSAContext* ctx = SignContext();
  ASSERT_NE(nullptr, ctx);
  ASSERT_EQ(SECSuccess, MLDSA_SignUpdate(ctx, &msg_));

  SECItem tooSmall = {siBuffer, sigbuf_.data(),
                      static_cast<unsigned int>(ML_DSA_44_SIGNATURE_LEN) - 1};
  EXPECT_EQ(SECFailure, MLDSA_SignFinal(ctx, &tooSmall));
  EXPECT_EQ(SEC_ERROR_OUTPUT_LEN, PORT_GetError());

  // The context survives, so a correctly sized buffer still works.
  EXPECT_EQ(SECSuccess, MLDSA_SignFinal(ctx, &sig_));
  MLDSA_DestroyContext(ctx);
}

TEST_F(MlDsaArgumentTest, DestroyContextAcceptsNull) {
  MLDSA_DestroyContext(nullptr);
}

// Key generation known-answer tests: deriving from the seed must reproduce the
// FIPS-204 verification and signing keys, checked via their SHA3-256 digests.
class MlDsaKeygenKatTest : public ::testing::TestWithParam<MlDsaKeygenKat> {};

TEST_P(MlDsaKeygenKatTest, Keygen) {
  const MlDsaKeygenKat& kat = GetParam();
  std::vector<uint8_t> seed = from_hex(kat.seed);
  ASSERT_EQ(static_cast<size_t>(ML_DSA_SEED_LEN), seed.size());

  MLDSAPrivateKey priv = {};
  MLDSAPublicKey pub = {};
  SECItem seedItem = {siBuffer, seed.data(), (unsigned int)seed.size()};
  ASSERT_EQ(SECSuccess, MLDSA_NewKey(kat.paramSet, &seedItem, &priv, &pub));

  uint8_t digest[SHA3_256_LENGTH];
  std::vector<uint8_t> expectedVk = from_hex(kat.vk_sha3_256);
  std::vector<uint8_t> expectedSk = from_hex(kat.sk_sha3_256);

  ASSERT_EQ(SECSuccess, SHA3_256_HashBuf(digest, pub.keyVal, pub.keyValLen));
  EXPECT_EQ(0, memcmp(digest, expectedVk.data(), SHA3_256_LENGTH))
      << "verification key digest mismatch";

  ASSERT_EQ(SECSuccess, SHA3_256_HashBuf(digest, priv.keyVal, priv.keyValLen));
  EXPECT_EQ(0, memcmp(digest, expectedSk.data(), SHA3_256_LENGTH))
      << "signing key digest mismatch";
}

INSTANTIATE_TEST_SUITE_P(MlDsaKeygenKatTest, MlDsaKeygenKatTest,
                         ::testing::ValuesIn(kMlDsaKeygenKats));

// Wycheproof ML-DSA vectors, read from gtests/common/wycheproof/source_vectors
// at run time. These cover signature verification -- including malformed keys
// and signatures that FIPS 204 requires to be rejected -- and deterministic
// signature generation from both a seed and an expanded signing key.

struct MlDsaTestVector {
  uint64_t id;
  bool valid;
  std::vector<uint8_t> msg;
  std::vector<uint8_t> ctx;
  std::vector<uint8_t> sig;
  bool has_msg = false;
  bool has_rnd = false;
};

static SECItem as_item(const std::vector<uint8_t>& v) {
  SECItem item = {siBuffer, const_cast<uint8_t*>(v.data()),
                  static_cast<unsigned int>(v.size())};
  return item;
}

class MlDsaWycheproofTest : public ::testing::Test {
 protected:
  typedef std::function<void(const MlDsaTestVector&)> Operation;

  void Run(const std::string& file, CK_ML_DSA_PARAMETER_SET_TYPE paramSet,
           const std::string& schema, Operation op) {
    paramSet_ = paramSet;
    op_ = op;
    WycheproofHeader(file, ParameterSetName(paramSet), schema,
                     [this](JsonReader& r) { RunGroup(r); });
  }

  void Verify(const MlDsaTestVector& t) {
    MLDSAPublicKey pub = {};
    if (publicKey_.size() > sizeof(pub.keyVal)) {
      // Too long to hold in a key at all, so the vector must be a negative one.
      EXPECT_FALSE(t.valid);
      return;
    }
    pub.paramSet = paramSet_;
    memcpy(pub.keyVal, publicKey_.data(), publicKey_.size());
    pub.keyValLen = static_cast<unsigned int>(publicKey_.size());

    SECItem msg = as_item(t.msg);
    SECItem ctx = as_item(t.ctx);
    SECItem sig = as_item(t.sig);

    MLDSAContext* mctx = nullptr;
    if (MLDSA_VerifyInit(&pub, &ctx, &mctx) != SECSuccess) {
      EXPECT_FALSE(t.valid) << "VerifyInit failed for a valid vector";
      return;
    }
    EXPECT_EQ(SECSuccess, MLDSA_VerifyUpdate(mctx, &msg));
    SECStatus rv = MLDSA_VerifyFinal(mctx, &sig);
    MLDSA_DestroyContext(mctx);
    EXPECT_EQ(t.valid ? SECSuccess : SECFailure, rv);
  }

  void Sign(const MlDsaTestVector& t) {
    // freebl has no API for either external-mu signing (a test case with a mu
    // but no message) or hedged signing with caller-supplied randomness.
    if (!t.has_msg || t.has_rnd) {
      return;
    }

    MLDSAPrivateKey priv = {};
    if (privateKey_.empty()) {
      // The signing key is given as a seed. Derive it, and check the derived
      // verification key against the group's while we are here.
      SECItem seed = as_item(privateSeed_);
      MLDSAPublicKey pub = {};
      if (MLDSA_NewKey(paramSet_, &seed, &priv, &pub) != SECSuccess) {
        EXPECT_FALSE(t.valid) << "key generation failed for a valid vector";
        return;
      }
      if (!publicKey_.empty()) {
        EXPECT_EQ(publicKey_,
                  std::vector<uint8_t>(pub.keyVal, pub.keyVal + pub.keyValLen));
      }
    } else {
      // The signing key is given expanded.
      if (privateKey_.size() > sizeof(priv.keyVal)) {
        EXPECT_FALSE(t.valid);
        return;
      }
      priv.paramSet = paramSet_;
      memcpy(priv.keyVal, privateKey_.data(), privateKey_.size());
      priv.keyValLen = static_cast<unsigned int>(privateKey_.size());
    }

    SECItem msg = as_item(t.msg);
    SECItem ctx = as_item(t.ctx);
    std::vector<uint8_t> sigbuf(MAX_ML_DSA_SIGNATURE_LEN);
    SECItem sig = {siBuffer, sigbuf.data(), (unsigned int)sigbuf.size()};

    SECStatus rv =
        do_sign(&priv, CKH_DETERMINISTIC_REQUIRED, &ctx, &msg, nullptr, &sig);
    ASSERT_EQ(t.valid ? SECSuccess : SECFailure, rv);
    if (!t.valid) {
      return;
    }
    EXPECT_EQ(t.sig, std::vector<uint8_t>(sig.data, sig.data + sig.len));
  }

 private:
  static std::string ParameterSetName(CK_ML_DSA_PARAMETER_SET_TYPE paramSet) {
    switch (paramSet) {
      case CKP_ML_DSA_44:
        return "ML-DSA-44";
      case CKP_ML_DSA_65:
        return "ML-DSA-65";
      case CKP_ML_DSA_87:
        return "ML-DSA-87";
    }
    ADD_FAILURE() << "unsupported parameter set";
    return "";
  }

  static void ReadTestAttr(MlDsaTestVector& t, const std::string& n,
                           JsonReader& r) {
    if (n == "msg") {
      t.msg = r.ReadHex();
      t.has_msg = true;
    } else if (n == "ctx") {
      t.ctx = r.ReadHex();
    } else if (n == "sig") {
      t.sig = r.ReadHex();
    } else if (n == "rnd") {
      r.SkipValue();
      t.has_rnd = true;
    } else if (n == "mu") {
      r.SkipValue();
    } else {
      FAIL() << "unsupported test case field: " << n;
    }
  }

  void RunGroup(JsonReader& r) {
    std::vector<MlDsaTestVector> tests;
    publicKey_.clear();
    privateKey_.clear();
    privateSeed_.clear();

    while (r.NextItem()) {
      std::string n = r.ReadLabel();
      if (n == "") {
        break;
      }
      if (n == "publicKey") {
        // Null for groups whose signing key has no matching public key.
        publicKey_ = ReadOptionalHex(r);
      } else if (n == "privateKey") {
        privateKey_ = r.ReadHex();
      } else if (n == "privateSeed") {
        privateSeed_ = r.ReadHex();
      } else if (n == "type" || n == "source" || n == "publicKeyDer" ||
                 n == "privateKeyPkcs8") {
        // publicKeyDer and privateKeyPkcs8 hold the same keys in SPKI and
        // PKCS#8 form; these tests drive freebl, which takes the raw keys.
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

  static std::vector<uint8_t> ReadOptionalHex(JsonReader& r) {
    if (r.PeekValue() == 'n') {  // null
      r.SkipValue();
      return std::vector<uint8_t>();
    }
    return r.ReadHex();
  }

  CK_ML_DSA_PARAMETER_SET_TYPE paramSet_;
  Operation op_;
  std::vector<uint8_t> publicKey_;
  std::vector<uint8_t> privateKey_;
  std::vector<uint8_t> privateSeed_;
};

#define ML_DSA_WYCHEPROOF_TESTS(name, bits, paramSet)                         \
  TEST_F(MlDsaWycheproofTest, name##Verify) {                                 \
    Run("mldsa_" #bits "_verify", paramSet, "mldsa_verify_schema.json",       \
        [this](const MlDsaTestVector& t) { Verify(t); });                     \
  }                                                                           \
  TEST_F(MlDsaWycheproofTest, name##SignSeed) {                               \
    Run("mldsa_" #bits "_sign_seed", paramSet, "mldsa_sign_seed_schema.json", \
        [this](const MlDsaTestVector& t) { Sign(t); });                       \
  }                                                                           \
  TEST_F(MlDsaWycheproofTest, name##SignNoSeed) {                             \
    Run("mldsa_" #bits "_sign_noseed", paramSet,                              \
        "mldsa_sign_noseed_schema.json",                                      \
        [this](const MlDsaTestVector& t) { Sign(t); });                       \
  }

ML_DSA_WYCHEPROOF_TESTS(MlDsa44, 44, CKP_ML_DSA_44)
ML_DSA_WYCHEPROOF_TESTS(MlDsa65, 65, CKP_ML_DSA_65)
ML_DSA_WYCHEPROOF_TESTS(MlDsa87, 87, CKP_ML_DSA_87)

}  // namespace nss_test
