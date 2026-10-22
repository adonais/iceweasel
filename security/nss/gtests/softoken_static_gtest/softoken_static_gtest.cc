/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// These tests exercise softoken-internal helpers in lib/softoken/lowpbe.c that
// are not exported from libsoftokn3. The suite links softokn_static directly
// and, unlike the other gtests, must NOT initialize NSS: doing so would load a
// second copy of softoken/freebl as a PKCS#11 module alongside the statically
// linked one. It therefore provides its own main() that skips NSS_Initialize.

#include "nspr.h"
#include "seccomon.h"
#include "secitem.h"
#include "secport.h"
#include "secerr.h"
#include "lowpbe.h"

#define GTEST_HAS_RTTI 0
#include "gtest/gtest.h"

namespace nss_test {

#ifndef NSS_DISABLE_DEPRECATED_RC2
extern "C" void sftk_PBELockInit(void);
extern "C" void sftk_PBELockShutdown(void);

TEST(SoftokenRC2PaddingTest, ZeroLengthCiphertextIsRejected) {
  sftk_PBELockInit();

  unsigned char saltData[8] = {0};
  SECItem salt = {siBuffer, saltData, sizeof(saltData)};

  NSSPKCS5PBEParameter* param = nsspkcs5_NewParam(
      SEC_OID_PKCS12_PBE_WITH_SHA1_AND_40_BIT_RC2_CBC, HASH_AlgSHA1, &salt, 1);
  ASSERT_NE(nullptr, param);
  EXPECT_EQ(SEC_OID_RC2_CBC, param->encAlg);

  unsigned char pwData[] = "password";
  SECItem pwitem = {siBuffer, pwData, sizeof(pwData) - 1};

  unsigned char cipherData[1] = {0};
  SECItem emptyCipher = {siBuffer, cipherData, 0};

  SECItem* plain =
      nsspkcs5_CipherData(param, &pwitem, &emptyCipher, PR_FALSE, nullptr);
  EXPECT_EQ(nullptr, plain);
  EXPECT_EQ(SEC_ERROR_BAD_PASSWORD, PORT_GetError());

  nsspkcs5_DestroyPBEParameter(param);

  sftk_PBELockShutdown();
}
#endif  // NSS_DISABLE_DEPRECATED_RC2

}  // namespace nss_test

int main(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
