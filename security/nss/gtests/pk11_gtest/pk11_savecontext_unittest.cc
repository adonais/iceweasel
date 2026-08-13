// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at http://mozilla.org/MPL/2.0/.

#include "gtest/gtest.h"
#include "nss_scoped_ptrs.h"

#include <nss.h>
#include <pk11pub.h>
#include <secerr.h>

namespace nss_test {

class Pkcs11SaveContextTest : public ::testing::Test {
 protected:
  void SetUp() override {
    globalctx_.reset(NSS_InitContext("", "", "", "", NULL,
                                     NSS_INIT_READONLY | NSS_INIT_NOCERTDB |
                                         NSS_INIT_NOMODDB | NSS_INIT_FORCEOPEN |
                                         NSS_INIT_NOROOTINIT));
    ASSERT_TRUE(globalctx_);
  }

  std::vector<uint8_t> ReferenceDigest(const std::vector<uint8_t>& data) {
    ScopedPK11Context cx(PK11_CreateDigestContext(SEC_OID_SHA256));
    EXPECT_TRUE(cx);
    EXPECT_EQ(SECSuccess, PK11_DigestBegin(cx.get()));
    EXPECT_EQ(SECSuccess,
              PK11_DigestOp(cx.get(), data.data(),
                            static_cast<unsigned int>(data.size())));
    std::vector<uint8_t> out(SHA256_LENGTH, 0);
    unsigned int outLen = 0;
    EXPECT_EQ(SECSuccess,
              PK11_DigestFinal(cx.get(), out.data(), &outLen,
                               static_cast<unsigned int>(out.size())));
    EXPECT_EQ(SHA256_LENGTH, static_cast<int>(outLen));
    return out;
  }

  ScopedNSSInitContext globalctx_;
};

TEST_F(Pkcs11SaveContextTest, SavedStateIsRestorable) {
  const std::vector<uint8_t> first(64, 0xa5);
  const std::vector<uint8_t> second(32, 0x5a);

  std::vector<uint8_t> full;
  full.reserve(first.size() + second.size());
  full.insert(full.end(), first.begin(), first.end());
  full.insert(full.end(), second.begin(), second.end());
  const std::vector<uint8_t> reference = ReferenceDigest(full);

  // Hash the first chunk, then snapshot the context.
  ScopedPK11Context cx(PK11_CreateDigestContext(SEC_OID_SHA256));
  ASSERT_TRUE(cx);
  ASSERT_EQ(SECSuccess, PK11_DigestBegin(cx.get()));
  ASSERT_EQ(SECSuccess, PK11_DigestOp(cx.get(), first.data(),
                                      static_cast<unsigned int>(first.size())));

  unsigned char stackBuf[4096];
  int len = -1;
  ASSERT_EQ(SECSuccess,
            PK11_SaveContext(cx.get(), stackBuf, &len, sizeof(stackBuf)));
  ASSERT_GT(len, 0);

  // Restore into a fresh context, feed it the second chunk, and finish.
  ScopedPK11Context restored(PK11_CreateDigestContext(SEC_OID_SHA256));
  ASSERT_TRUE(restored);
  ASSERT_EQ(SECSuccess, PK11_RestoreContext(restored.get(), stackBuf, len));
  ASSERT_EQ(SECSuccess,
            PK11_DigestOp(restored.get(), second.data(),
                          static_cast<unsigned int>(second.size())));

  std::vector<uint8_t> out(SHA256_LENGTH, 0);
  unsigned int outLen = 0;
  ASSERT_EQ(SECSuccess,
            PK11_DigestFinal(restored.get(), out.data(), &outLen,
                             static_cast<unsigned int>(out.size())));
  ASSERT_EQ(SHA256_LENGTH, static_cast<int>(outLen));
  EXPECT_EQ(reference, out);
}

TEST_F(Pkcs11SaveContextTest, TooSmallBufferFails) {
  const std::vector<uint8_t> data(64, 0xa5);

  ScopedPK11Context cx(PK11_CreateDigestContext(SEC_OID_SHA256));
  ASSERT_TRUE(cx);
  ASSERT_EQ(SECSuccess, PK11_DigestBegin(cx.get()));
  ASSERT_EQ(SECSuccess, PK11_DigestOp(cx.get(), data.data(),
                                      static_cast<unsigned int>(data.size())));

  unsigned char tiny[1];
  int len = -1;
  EXPECT_EQ(SECFailure, PK11_SaveContext(cx.get(), tiny, &len, sizeof(tiny)));
  EXPECT_EQ(SEC_ERROR_OUTPUT_LEN, PORT_GetError());
}

}  // namespace nss_test
