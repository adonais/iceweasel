/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/UniquePtr.h"

#include "gtest/gtest.h"
#include "LulMain.h"
#include "GeckoProfiler.h"       // for TracingKind
#include "platform-linux-lul.h"  // for read_procmaps

#include <cstring>

// Set this to 0 to make LUL be completely silent during tests.
// Set it to 1 to get logging output from LUL, presumably for
// the purpose of debugging it.
#define DEBUG_LUL_TEST 0

// LUL needs a callback for its logging sink.
static void gtest_logging_sink_for_LulIntegration(const char* str) {
  if (DEBUG_LUL_TEST == 0) {
    return;
  }
  // Ignore any trailing \n, since LOG will add one anyway.
  size_t n = strlen(str);
  if (n > 0 && str[n - 1] == '\n') {
    char* tmp = strdup(str);
    tmp[n - 1] = 0;
    fprintf(stderr, "LUL-in-gtest: %s\n", tmp);
    free(tmp);
  } else {
    fprintf(stderr, "LUL-in-gtest: %s\n", str);
  }
}

TEST(LulIntegration, unwind_consistency)
{
  // Set up LUL and get it to read unwind info for libxul.so, which is
  // all we care about here, plus (incidentally) practically every
  // other object in the process too.
  lul::LUL* lul = new lul::LUL(gtest_logging_sink_for_LulIntegration);
  read_procmaps(lul);

  // Run unwind tests and receive information about how many there
  // were and how many were successful.
  lul->EnableUnwinding();
  int nTests = 0, nTestsPassed = 0;
  RunLulUnitTests(&nTests, &nTestsPassed, lul);
  EXPECT_TRUE(nTests == 6) << "Unexpected number of tests";
  EXPECT_EQ(nTestsPassed, nTests) << "Not all tests passed";

  delete lul;
}

#if defined(GP_ARCH_loongarch64) || defined(GP_ARCH_riscv64)
TEST(LulIntegration, frame_chasing_spidermonkey_layout)
{
  // This tests for the transition at the boundary of JS ABI frames and native
  // ABI frames. Currently, this is only relevant on loongarch64 and riscv64,
  // where the two do not coincide.

  lul::LUL lul(gtest_logging_sink_for_LulIntegration);
  lul.EnableUnwinding();

  // The synthetic stack for testing:
  //
  //                         (+)
  //                0                   7
  // olderNativeFP  +-------------------+ +0x180
  //                |        ...        |
  //      nativeFP  +-------------------+ +0x150
  //                |   olderNativePC   |
  //                +-------------------+
  //                |   olderNativeFP   |
  //                +-------------------+
  //                |        ...        |
  //                +-------------------+
  //                |     nativePC      |
  //                +-------------------+
  //                |     nativeFP      |
  //    enterJitFP  +-------------------+ +0x110
  //                |  EnterJIT saves   |
  //                |  entry args, etc. |
  //                +-------------------+
  //                |    enterJitPC     |
  //                +-------------------+
  //                |    enterJitFP     |
  //    olderJitFP  +-------------------+ +0x50
  //                |        ...        |
  //                +-------------------+
  //                |    olderJitPC     |
  //                +-------------------+
  //                |    olderJitFP     |
  // youngestJitFP  +-------------------+ +0x20
  //                |        ...        |
  //     stackBase  +-------------------+ 0x100000
  //                         (-)

  constexpr uintptr_t stackBase = 0x100000;
  constexpr uintptr_t youngestJitFP = stackBase + 0x20;
  constexpr uintptr_t olderJitFP = stackBase + 0x50;
  constexpr uintptr_t enterJitFP = stackBase + 0x110;
  constexpr uintptr_t nativeFP = stackBase + 0x150;
  constexpr uintptr_t olderNativeFP = stackBase + 0x180;

  constexpr uintptr_t youngestJitPC = 0x1110;
  constexpr uintptr_t olderJitPC = 0x2220;
  constexpr uintptr_t enterJitPC = 0x3330;
  constexpr uintptr_t nativePC = 0x4440;
  constexpr uintptr_t olderNativePC = 0x5550;

  auto stackImg = mozilla::MakeUnique<lul::StackImage>();
  stackImg->mStartAvma = stackBase;
  stackImg->mLen = 0x200;

  const auto writeWord = [&](uintptr_t address, uintptr_t value) {
    std::memcpy(&stackImg->mContents[address - stackBase], &value,
                sizeof(value));
  };
  writeWord(youngestJitFP, olderJitFP);
  writeWord(youngestJitFP + sizeof(uintptr_t), olderJitPC);
  writeWord(olderJitFP, enterJitFP);
  writeWord(olderJitFP + sizeof(uintptr_t), enterJitPC);
  writeWord(enterJitFP, nativeFP);
  writeWord(enterJitFP + sizeof(uintptr_t), nativePC);
  writeWord(nativeFP - 2 * sizeof(uintptr_t), olderNativeFP);
  writeWord(nativeFP - sizeof(uintptr_t), olderNativePC);

  lul::UnwindRegs startRegs{};
  startRegs.pc = lul::TaggedUWord(youngestJitPC);
  startRegs.sp = lul::TaggedUWord(stackBase);
  startRegs.fp = lul::TaggedUWord(youngestJitFP);

  uintptr_t framePCs[8] = {};
  uintptr_t frameSPs[8] = {};
  size_t framesUsed = 0;
  size_t framePointerFramesAcquired = 0;
  lul.Unwind(framePCs, frameSPs, &framesUsed, &framePointerFramesAcquired, 8,
             &startRegs, stackImg.get());

  ASSERT_EQ(framesUsed, 5U);
  EXPECT_EQ(framePointerFramesAcquired, 4U);
  EXPECT_EQ(framePCs[0], youngestJitPC);
  EXPECT_EQ(frameSPs[0], stackBase);
  EXPECT_EQ(framePCs[1], olderJitPC);
  EXPECT_EQ(frameSPs[1], youngestJitFP + 2 * sizeof(uintptr_t));
  EXPECT_EQ(framePCs[2], enterJitPC);
  EXPECT_EQ(frameSPs[2], olderJitFP + 2 * sizeof(uintptr_t));
  EXPECT_EQ(framePCs[3], nativePC);
  EXPECT_EQ(frameSPs[3], enterJitFP + 2 * sizeof(uintptr_t));
  EXPECT_EQ(framePCs[4], olderNativePC);
  EXPECT_EQ(frameSPs[4], nativeFP);
}
#endif
