/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"

#include "mozilla/Attributes.h"
#include "nsCOMPtr.h"
#include "nsDragService.h"
#include "nsIDragService.h"
#include "nsIDragSession.h"
#include "nsServiceManagerUtils.h"

namespace {

already_AddRefed<nsIDragSession> StartSession(nsIDragService* aService) {
  // StartDragSession only checks that it was given a widget provider, so the
  // service itself works as a stand-in here.
  nsCOMPtr<nsIDragSession> session = aService->StartDragSession(aService);
  return session.forget();
}

bool HasCurrentSession(nsIDragService* aService) {
  nsCOMPtr<nsIDragSession> session;
  aService->GetCurrentSession(nullptr, getter_AddRefs(session));
  return session != nullptr;
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY void EndSession(nsIDragSession* aSession) {
  nsCOMPtr<nsIDragSession> session = aSession;
  session->EndDragSession(false, 0);
}

}  // namespace

// A drag session whose native drag session is gone has to be ended, or it stays
// alive for the rest of the session and blocks every drag that follows.
TEST(CocoaStaleDragSession, EndsSessionWithoutNativeDrag)
{
  nsCOMPtr<nsIDragService> service =
      do_GetService("@mozilla.org/widget/dragservice;1");
  ASSERT_NE(service, nullptr);
  ASSERT_FALSE(HasCurrentSession(service));

  nsCOMPtr<nsIDragSession> session = StartSession(service);
  ASSERT_NE(session, nullptr);
  ASSERT_TRUE(HasCurrentSession(service));

  nsDragService::EndStaleDragSession();
  EXPECT_FALSE(HasCurrentSession(service));
}

// Sessions that automated tests drive by hand have no native drag session to
// begin with and must be left alone.
TEST(CocoaStaleDragSession, KeepsSessionForTests)
{
  nsCOMPtr<nsIDragService> service =
      do_GetService("@mozilla.org/widget/dragservice;1");
  ASSERT_NE(service, nullptr);
  ASSERT_FALSE(HasCurrentSession(service));

  nsCOMPtr<nsIDragSession> session = StartSession(service);
  ASSERT_NE(session, nullptr);
  session->InitForTests(nsIDragService::DRAGDROP_ACTION_MOVE);

  nsDragService::EndStaleDragSession();
  EXPECT_TRUE(HasCurrentSession(service));

  EndSession(session);
  EXPECT_FALSE(HasCurrentSession(service));
}
