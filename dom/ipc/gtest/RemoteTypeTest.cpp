/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/OriginAttributes.h"
#include "mozilla/dom/RemoteType.h"
#include "mozilla/gtest/MozAssertions.h"

namespace mozilla::dom {

TEST(RemoteTypeTest, FormatSimple)
{
  // NotRemote is special in that it has a different value for Stringify() and
  // StringifyKind(). This will be changed in the future.
  EXPECT_TRUE(RemoteType::NotRemote().IsKnown());
  EXPECT_EQ(RemoteType::NotRemote().Stringify(), VoidCString());
  EXPECT_EQ(RemoteType::NotRemote().StringifyKind(), "parent"_ns);
  EXPECT_FALSE(RemoteType::NotRemote().HasMeta());
  EXPECT_EQ(RemoteType::NotRemote().StringifyMeta(), ""_ns);

  auto formatSimple = [](RemoteType::Kind aKind, const nsACString& aString) {
    RemoteType remoteType(aKind);
    EXPECT_TRUE(remoteType.IsKnown());
    EXPECT_EQ(remoteType.StringifyKind(), aString);
    EXPECT_FALSE(remoteType.HasMeta());
    EXPECT_EQ(remoteType.StringifyMeta(), ""_ns);
    EXPECT_EQ(remoteType.Stringify(), aString);
  };

  formatSimple(RemoteType::Kind::Prealloc, "prealloc"_ns);
  formatSimple(RemoteType::Kind::WebContent, "web"_ns);
  formatSimple(RemoteType::Kind::File, "file"_ns);
  formatSimple(RemoteType::Kind::PrivilegedAbout, "privilegedabout"_ns);
  formatSimple(RemoteType::Kind::PrivilegedMozilla, "privilegedmozilla"_ns);
  formatSimple(RemoteType::Kind::Extension, "extension"_ns);
  formatSimple(RemoteType::Kind::Inference, "inference"_ns);
}

TEST(RemoteTypeTest, FormatCompound)
{
  auto formatCompound = [](RemoteType aRemoteType, const nsACString& aKind,
                           const nsACString& aMeta) {
    EXPECT_TRUE(aRemoteType.IsKnown());
    EXPECT_EQ(aRemoteType.StringifyKind(), aKind);
    EXPECT_TRUE(aRemoteType.HasMeta());
    EXPECT_EQ(aRemoteType.StringifyMeta(), aMeta);
    nsCString expected = aKind + "="_ns + aMeta;
    EXPECT_EQ(aRemoteType.Stringify(), expected);
  };

  OriginAttributes attrs;
  attrs.mUserContextId = 2;
  attrs.mPrivateBrowsingId = 1;

  formatCompound(
      RemoteType::SharedWeb(attrs).WithDisableJit(true).WithSiteOrigin(
          "https://example.com"_ns),
      "webIsolated"_ns,
      "https://example.com^userContextId=2&privateBrowsingId=1&disableJit=1"_ns);

  formatCompound(RemoteType::SharedWeb({})
                     .WithSiteOrigin("https://example.com"_ns)
                     .WithDisableJit(true),
                 "webIsolated"_ns, "https://example.com^disableJit=1"_ns);
  formatCompound(
      RemoteType::SharedWeb({}).WithSiteOrigin("https://example.com"_ns),
      "webIsolated"_ns, "https://example.com"_ns);

  formatCompound(RemoteType::SharedWeb({}).WithSiteOrigin(
                     "https://example.com"_ns, RemoteType::Kind::WebCoopCoep),
                 "webCOOP+COEP"_ns, "https://example.com"_ns);
  formatCompound(
      RemoteType::SharedWeb({}).WithSiteOrigin(
          "https://example.com"_ns, RemoteType::Kind::WebServiceWorker),
      "webServiceWorker"_ns, "https://example.com"_ns);
}

TEST(RemoteTypeTest, ParseValid)
{
  EXPECT_EQ(RemoteType::Parse(VoidCString()), RemoteType::NotRemote());

  EXPECT_EQ(RemoteType::Parse("prealloc"_ns),
            RemoteType(RemoteType::Kind::Prealloc));
  EXPECT_EQ(RemoteType::Parse("file"_ns), RemoteType(RemoteType::Kind::File));
  EXPECT_EQ(RemoteType::Parse("privilegedabout"_ns),
            RemoteType(RemoteType::Kind::PrivilegedAbout));
  EXPECT_EQ(RemoteType::Parse("privilegedmozilla"_ns),
            RemoteType(RemoteType::Kind::PrivilegedMozilla));
  EXPECT_EQ(RemoteType::Parse("extension"_ns),
            RemoteType(RemoteType::Kind::Extension));
  EXPECT_EQ(RemoteType::Parse("inference"_ns),
            RemoteType(RemoteType::Kind::Inference));

  EXPECT_EQ(RemoteType::Parse("web"_ns),
            RemoteType(RemoteType::Kind::WebContent));
  EXPECT_EQ(RemoteType::Parse("web=^disableJit=1"_ns),
            RemoteType::SharedWeb({}).WithDisableJit(true));
  {
    OriginAttributes attrs;
    attrs.mUserContextId = 2;
    attrs.mPrivateBrowsingId = 1;
    EXPECT_EQ(RemoteType::Parse("web=^userContextId=2&privateBrowsingId=1"_ns),
              RemoteType::SharedWeb(attrs));
  }
  {
    OriginAttributes attrs;
    attrs.mGeckoViewSessionContextId = u"session 1"_ns;
    EXPECT_EQ(RemoteType::Parse("web=^geckoViewUserContextId=session+1"_ns),
              RemoteType::SharedWeb(attrs));
  }

  EXPECT_EQ(RemoteType::Parse("webIsolated=https://example.com"_ns),
            RemoteType::SharedWeb({}).WithSiteOrigin("https://example.com"_ns));
  EXPECT_EQ(RemoteType::Parse("webCOOP+COEP=https://example.com"_ns),
            RemoteType::SharedWeb({}).WithSiteOrigin(
                "https://example.com"_ns, RemoteType::Kind::WebCoopCoep));
  EXPECT_EQ(RemoteType::Parse("webServiceWorker=https://example.com"_ns),
            RemoteType::SharedWeb({}).WithSiteOrigin(
                "https://example.com"_ns, RemoteType::Kind::WebServiceWorker));
}

TEST(RemoteTypeTest, ParseInvalid)
{
  constexpr nsLiteralCString kRemoteTypes[] = {
      ""_ns,
      "unknown"_ns,
      "parent"_ns,
      "web=^unknown=1"_ns,
      "web=^disableJit=0"_ns,
      "web=^disableJit=true"_ns,
      "web=^userContextId=abc"_ns,
      "web=^userContextId=1&userContextId=2"_ns,
      "web=^privateBrowsingId=1&userContextId=2"_ns,
      "web=https://example.com"_ns,
      "web=^"_ns,
      "webIsolated=https://example.com^"_ns,
      "webIsolated=https://example.com/"_ns,
      "webIsolated=https://user@example.com"_ns,
      "webIsolated="_ns,
      "webCOOP+COEP"_ns,
      "webServiceWorker"_ns,
      "file=^userContextId=1"_ns,
      "privilegedabout=https://example.com"_ns,
      "privilegedabout=^userContextId=1"_ns,
  };

  for (const auto& string : kRemoteTypes) {
    EXPECT_FALSE(RemoteType::Parse(string)) << string;
  }
}

}  // namespace mozilla::dom
