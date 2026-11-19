/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

#include "gtest/gtest.h"
#include "mozilla/ChromeScriptPath.h"

using mozilla::GetReportableChromeScriptPath;

TEST(ChromeScriptPath, Schemes)
{
  EXPECT_STREQ(GetReportableChromeScriptPath(
                   "resource://gre/modules/AppConstants.sys.mjs"),
               "gre/modules/AppConstants.sys.mjs");
  EXPECT_STREQ(
      GetReportableChromeScriptPath("chrome://browser/content/browser.js"),
      "browser/content/browser.js");
  EXPECT_STREQ(GetReportableChromeScriptPath(
                   "moz-src:///browser/components/Foo.sys.mjs"),
               "browser/components/Foo.sys.mjs");
}

TEST(ChromeScriptPath, Redirects)
{
  EXPECT_STREQ(GetReportableChromeScriptPath(
                   "resource://gre/a.js -> resource://gre/b.js"),
               "gre/b.js");
  EXPECT_STREQ(GetReportableChromeScriptPath(
                   "chrome://a/content/a.js -> file:///home/user/b.js"),
               "b.js");
}

TEST(ChromeScriptPath, Extensions)
{
  EXPECT_STREQ(GetReportableChromeScriptPath(
                   "jar:file:///home/user/profile/extensions/x@y.xpi!/a.js"),
               "x@y.xpi!/a.js");
}

TEST(ChromeScriptPath, LeafName)
{
  EXPECT_STREQ(GetReportableChromeScriptPath(
                   "file:///home/user/.mozilla/firefox/p/chrome/boot.sys.mjs"),
               "boot.sys.mjs");
  EXPECT_STREQ(GetReportableChromeScriptPath(
                   "C:\\Program Files\\Mozilla Firefox\\defaults\\pref\\x.js"),
               "x.js");
  EXPECT_STREQ(GetReportableChromeScriptPath("C:\\Users/Name\\mixed.js"),
               "mixed.js");
  EXPECT_STREQ(GetReportableChromeScriptPath("plain.js"), "plain.js");
  EXPECT_STREQ(GetReportableChromeScriptPath(""), "");
}
