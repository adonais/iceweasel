/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MediaTransportHandler.h"

#include "mozilla/Preferences.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "mozilla/TimeStamp.h"
#include "nsComponentManagerUtils.h"
#include "nsISocketTransportService.h"
#include "nsPISocketTransportService.h"
#include "nsServiceManagerUtils.h"

#define GTEST_HAS_RTTI 0
#include "gtest/gtest.h"

using namespace mozilla;

namespace {

class MediaTransportHandlerTest : public ::testing::Test {
 protected:
  void SetUp() override {
    // So gathering does not depend on what interfaces this machine has.
    Preferences::SetBool("media.peerconnection.ice.loopback", true);
    mSts = do_GetService(NS_SOCKETTRANSPORTSERVICE_CONTRACTID);
    ASSERT_TRUE(mSts);
  }

  void TearDown() override {
    Preferences::ClearUser("media.peerconnection.ice.loopback");
  }

  // Sets up an ICE context and one transport, and waits for a candidate.
  static bool GatherACandidate(MediaTransportHandler& aHandler) {
    bool gathered = false;
    MediaEventListener listener = aHandler.GetCandidateGathered().Connect(
        GetMainThreadSerialEventTarget(),
        [&gathered](const std::string&, const CandidateInfo& aInfo) {
          if (!aInfo.mCandidate.empty()) {
            gathered = true;
          }
        });
    aHandler.CreateIceCtx("MediaTransportHandlerTest");
    EXPECT_EQ(NS_OK, aHandler.SetIceConfig(nsTArray<dom::RTCIceServer>(),
                                           dom::RTCIceTransportPolicy::All));
    aHandler.EnsureProvisionalTransport("transport_0", "ufrag",
                                        "passwordpasswordpassword", 1);
    aHandler.StartIceGathering(false, false, nsTArray<NrIceStunAddr>());
    const TimeStamp deadline = TimeStamp::Now() + TimeDuration::FromSeconds(10);
    SpinEventLoopUntil("MediaTransportHandlerTest::GatherACandidate"_ns,
                       [&] { return gathered || TimeStamp::Now() > deadline; });
    listener.Disconnect();
    return gathered;
  }

  // What going offline for a profile change does to STS: the shutdown
  // observers run, and then the STS thread is joined right away.
  void ShutDownSts() {
    nsCOMPtr<nsPISocketTransportService> sts = do_QueryInterface(mSts);
    ASSERT_EQ(NS_OK, sts->Shutdown(false));
  }

  void RestartSts() {
    nsCOMPtr<nsPISocketTransportService> sts = do_QueryInterface(mSts);
    ASSERT_EQ(NS_OK, sts->Init());
  }

  nsCOMPtr<nsISocketTransportService> mSts;
};

TEST_F(MediaTransportHandlerTest, SurvivesStsRestart) {
  RefPtr<MediaTransportHandler> handler = MediaTransportHandler::Create();
  ASSERT_TRUE(GatherACandidate(*handler));

  ShutDownSts();
  // STS is finished shutting down and no longer accepting runnables, so the
  // implementation is destroyed right here, off STS. That is only safe if STS
  // shutdown made it release everything it held there.
  handler = nullptr;
  RestartSts();

  // Handlers made after STS comes back must work.
  handler = MediaTransportHandler::Create();
  EXPECT_TRUE(GatherACandidate(*handler));
  handler = nullptr;
}

}  // namespace
