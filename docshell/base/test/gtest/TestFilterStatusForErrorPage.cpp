/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsDocShell.h"
#include "nsError.h"
#include "nsIChannel.h"

// NS_ERROR_OS_LOCAL_NETWORK_ACCESS_DENIED (bug 2053432) is raised by necko
// when the OS itself blocks a connection (e.g. Android 16+'s Local Network
// Protection) before Firefox's own site-permission LNA flow ever gets a
// chance to run. FilterStatusForErrorPage must let it through unchanged, on
// any frame, or nsDocShell::EndPageLoad silently rewrites it to NS_OK and
// the failure is never reported to the embedder at all.
TEST(TestDocShellFilterStatusForErrorPage, OsLocalNetworkAccessDeniedIsShown)
{
  for (bool isTopFrame : {true, false}) {
    for (bool useErrorPages : {true, false}) {
      nsresult filtered = nsDocShell::FilterStatusForErrorPage(
          NS_ERROR_OS_LOCAL_NETWORK_ACCESS_DENIED, nullptr, 0, isTopFrame,
          useErrorPages);
      EXPECT_EQ(filtered, NS_ERROR_OS_LOCAL_NETWORK_ACCESS_DENIED);
    }
  }
}
