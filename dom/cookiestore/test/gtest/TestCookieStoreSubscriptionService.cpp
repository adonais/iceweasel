/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/dom/CookieStoreSubscriptionService.h"
#include "mozilla/dom/PCookieStore.h"
#include "mozilla/dom/ServiceWorkerRegistrarTypes.h"
#include "mozilla/ipc/PBackgroundSharedTypes.h"

using namespace mozilla;
using namespace mozilla::dom;

namespace {

ServiceWorkerRegistrationData Registration(const nsACString& aScope) {
  const nsCString scope(aScope);

  ServiceWorkerRegistrationData data;
  data.scope() = scope;
  data.principal() = mozilla::ipc::ContentPrincipalInfo(
      OriginAttributes(), scope, scope, Nothing(), scope);
  return data;
}

// The service is a singleton and keeps the loaded registrations forever, so
// every test has to use its own scope to stay independent from the others.
nsTArray<CookieSubscription> LoadAndGet(const nsACString& aScope,
                                        const nsACString& aValue) {
  ServiceWorkerRegistrationData registration = Registration(aScope);

  CookieStoreSubscriptionService* service =
      CookieStoreSubscriptionService::Instance();
  service->Load(registration, aValue);

  nsTArray<CookieSubscription> subscriptions;
  service->GetSubscriptions(registration.principal(), aScope, subscriptions);
  return subscriptions;
}

}  // namespace

TEST(CookieStoreSubscriptionService, RestoreNameAndURL)
{
  nsTArray<CookieSubscription> subscriptions = LoadAndGet(
      "https://example.com/named/"_ns,
      R"([{"name":"cookieName","url":"https://example.com/named/a"}])"_ns);

  ASSERT_EQ(1u, subscriptions.Length());
  ASSERT_TRUE(subscriptions[0].name().isSome());
  EXPECT_TRUE(subscriptions[0].name()->EqualsLiteral("cookieName"));
  EXPECT_TRUE(
      subscriptions[0].url().EqualsLiteral("https://example.com/named/a"));
}

TEST(CookieStoreSubscriptionService, RestoreURLOnly)
{
  nsTArray<CookieSubscription> subscriptions =
      LoadAndGet("https://example.com/nameless/"_ns,
                 R"([{"url":"https://example.com/nameless/a"}])"_ns);

  ASSERT_EQ(1u, subscriptions.Length());
  EXPECT_TRUE(subscriptions[0].name().isNothing());
  EXPECT_TRUE(
      subscriptions[0].url().EqualsLiteral("https://example.com/nameless/a"));
}

TEST(CookieStoreSubscriptionService, RestoreMultiple)
{
  nsTArray<CookieSubscription> subscriptions =
      LoadAndGet("https://example.com/multiple/"_ns,
                 R"([{"name":"a","url":"https://example.com/multiple/a"},)"
                 R"({"name":"b","url":"https://example.com/multiple/b"}])"_ns);

  ASSERT_EQ(2u, subscriptions.Length());
  EXPECT_TRUE(subscriptions[0].name()->EqualsLiteral("a"));
  EXPECT_TRUE(subscriptions[1].name()->EqualsLiteral("b"));
}

TEST(CookieStoreSubscriptionService, MalformedDocument)
{
  EXPECT_TRUE(
      LoadAndGet("https://example.com/broken/"_ns, "[{\"url\":"_ns).IsEmpty());
  EXPECT_TRUE(LoadAndGet("https://example.com/empty/"_ns, ""_ns).IsEmpty());
  EXPECT_TRUE(LoadAndGet("https://example.com/object/"_ns,
                         R"({"url":"https://example.com/object/a"})"_ns)
                  .IsEmpty());
  EXPECT_TRUE(
      LoadAndGet("https://example.com/emptyarray/"_ns, "[]"_ns).IsEmpty());
}

TEST(CookieStoreSubscriptionService, InvalidEntriesAreSkipped)
{
  nsTArray<CookieSubscription> subscriptions =
      LoadAndGet("https://example.com/invalid/"_ns,
                 R"([42,)"
                 R"({},)"
                 R"({"url":42},)"
                 R"({"name":42,"url":"https://example.com/invalid/a"},)"
                 R"({"url":"https://example.com/invalid/b"}])"_ns);

  ASSERT_EQ(1u, subscriptions.Length());
  EXPECT_TRUE(
      subscriptions[0].url().EqualsLiteral("https://example.com/invalid/b"));
}
