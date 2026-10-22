/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/MouseEvents.h"
#include "mozilla/layers/APZBridgeChild.h"
#include "mozilla/layers/APZCTreeManagerChild.h"
#include "mozilla/layers/APZThreadUtils.h"
#include "nsThreadUtils.h"

using namespace mozilla;
using namespace mozilla::layers;

namespace {

class DestroyingAPZBridgeChild final : public APZBridgeChild {
 public:
  DestroyingAPZBridgeChild(APZCTreeManagerChild& aManager, bool& aIsDestroyed)
      : APZBridgeChild(0), mManager(aManager), mIsDestroyed(aIsDestroyed) {}

  APZEventResult ReceiveInputEvent(InputData& aEvent,
                                   InputBlockCallback&& aCallback) override {
    bool& isDestroyed = mIsDestroyed;
    mManager.Destroy();
    EXPECT_FALSE(isDestroyed);
    return APZEventResult();
  }

 private:
  ~DestroyingAPZBridgeChild() override { mIsDestroyed = true; }

  APZCTreeManagerChild& mManager;
  bool& mIsDestroyed;
};

}  // namespace

class APZBridgeTester : public ::testing::Test {
 protected:
  void SetUp() override {
    APZThreadUtils::SetControllerThread(NS_GetCurrentThread());
  }

  void TearDown() override { APZThreadUtils::SetControllerThread(nullptr); }
};

TEST_F(APZBridgeTester, DestroyOwnerDuringMouseInput) {
  bool isDestroyed = false;
  auto manager = MakeRefPtr<APZCTreeManagerChild>();
  manager->SetBridge(
      MakeRefPtr<DestroyingAPZBridgeChild>(*manager, isDestroyed));

  WidgetMouseEvent event(true, eMouseMove, nullptr, WidgetMouseEvent::eReal);
  EXPECT_EQ(manager->Bridge()->ReceiveInputEvent(event).GetStatus(),
            nsEventStatus_eIgnore);
  EXPECT_TRUE(isDestroyed);
}
