/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "chrome/common/ipc_message.h"
#include "gtest/gtest.h"
#include "ipc/nsGUIEventIPC.h"
#include "mozilla/TouchEvents.h"
#include "mozilla/UniquePtr.h"

namespace mozilla {

static bool RoundTrip(const WidgetTouchEvent& aIn, WidgetTouchEvent* aOut) {
  UniquePtr<IPC::Message> msg(new IPC::Message(MSG_ROUTING_NONE, 0));
  {
    IPC::MessageWriter writer(*msg);
    IPC::ParamTraits<WidgetTouchEvent>::Write(&writer, aIn);
  }
  IPC::MessageReader reader(*msg);
  return IPC::ParamTraits<WidgetTouchEvent>::Read(&reader, aOut);
}

TEST(WidgetTouchEventIPC, ValidMessageRoundTrips)
{
  // Every message that IsValidMessageForIPC pairs with eTouchEventClass must
  // survive the round trip; the receiver-side check in
  // ParamTraits<WidgetEvent>::ReadForDerivedClass must not reject them.
  for (EventMessage message : {eTouchStart, eTouchMove, eTouchEnd, eTouchCancel,
                               eTouchPointerCancel}) {
    WidgetTouchEvent in(/* aIsTrusted */ true, message, /* aWidget */ nullptr);
    WidgetTouchEvent out(/* aIsTrusted */ true, eTouchStart,
                         /* aWidget */ nullptr);
    EXPECT_TRUE(RoundTrip(in, &out)) << "message=" << message;
    EXPECT_EQ(out.mMessage, message);
  }
}

TEST(WidgetTouchEventIPC, InvalidMessageIsRejected)
{
  // ParamTraits<WidgetEvent>::ReadForDerivedClass must reject any mMessage
  // that IsValidMessageForIPC does not pair with eTouchEventClass.  Otherwise
  // a compromised content process could feed an out-of-range value to e.g.
  // MultiTouchInput's switch-on-mMessage, leaving its MultiTouchType enum
  // uninitialized in release builds.  The cases below cover both messages
  // that look touch-adjacent (eTouchRawUpdate is internal-only) and messages
  // that belong to entirely different event classes.
  for (EventMessage message :
       {eVoidEvent, eTouchRawUpdate, eMouseDown, eKeyDown, eWheel, ePointerDown,
        eDragStart, eCompositionStart, eSetSelection}) {
    WidgetTouchEvent in(/* aIsTrusted */ true, message, /* aWidget */ nullptr);
    WidgetTouchEvent out(/* aIsTrusted */ true, eTouchStart,
                         /* aWidget */ nullptr);
    EXPECT_FALSE(RoundTrip(in, &out)) << "message=" << message;
  }
}

}  // namespace mozilla
