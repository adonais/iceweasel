/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <string.h>

#include "gtest/gtest.h"
#include "nsNetUtil.h"
#include "nsString.h"

namespace {

nsCString Sanitize(const nsACString& aSpec) {
  nsCString sanitized;
  NS_GetSanitizedSpecFromSpec(aSpec, sanitized);
  return sanitized;
}

// NS_GetSanitizedSpecFromSpec parses nothing unless the spec holds a literal
// '@', on the grounds that a password can only reach nsIURI through a userinfo
// component. These cases pin the domain of that fast path: a spec here that
// turned out to carry a password would be one the fast path leaks.
TEST(TestSanitizedSpec, NoPasswordIsUnchanged)
{
  const char* const kSpecs[] = {
      // No '@' anywhere.
      "https://example.com/script.js",
      "file:///C:/Users/someone/page.html",
      "resource://gre/modules/Foo.sys.mjs",
      "chrome://global/content/Bar.js",
      "jar:file:///path/omni.ja!/modules/Baz.js",
      "data:text/javascript,void%200",
      "blob:https://example.com/6a2cd6e0",
      "about:blank",
      "",
      // '@' outside the authority: in a path, a query or a ref.
      "https://example.com/node_modules/@babel/runtime/x.js",
      "https://example.com/@user",
      "https://example.com/?to=a@b.com",
      "https://example.com/x.js#@anchor",
      "file:///home/me/@scoped/thing.js",
      "chrome://global/content/@weird.js",
      // Userinfo with a username but no password.
      "https://user@example.com/script.js",
      // Not parseable as a URI at all, so the spec is passed through.
      "eval",
      "@",
  };

  for (const char* spec : kSpecs) {
    nsAutoCString in(spec);
    EXPECT_EQ(Sanitize(in), in) << "spec: " << spec;
  }
}

// Specs that do carry a password must never come back holding it.
TEST(TestSanitizedSpec, PasswordIsHidden)
{
  const char* const kSpecs[] = {
      "https://user:hunter2@example.com/script.js",
      "https://user:hunter2@example.com/@path",
      "https://user:hunter2@example.com/?q=@x",
      "http://a:hunter2@example.com:8080/x.js",
      // The userinfo runs to the last '@' in the authority, so the password
      // here is "hunter2@evil" and all of it has to go.
      "https://user:hunter2@evil@example.com/x.js",
  };

  for (const char* spec : kSpecs) {
    nsAutoCString in(spec);
    nsCString out = Sanitize(in);
    EXPECT_EQ(strstr(out.get(), "hunter2"), nullptr)
        << "password leaked for spec: " << spec << " -> " << out.get();
    EXPECT_NE(out, in) << "spec: " << spec;
  }
}

}  // namespace
