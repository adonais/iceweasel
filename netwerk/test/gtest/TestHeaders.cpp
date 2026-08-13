#include "gtest/gtest.h"
#include "nsHttpHeaderArray.h"
#include "nsHttpRequestHead.h"
#include "nsIHttpHeaderVisitor.h"
#include "nsTArray.h"

using namespace mozilla::net;

namespace {

// Records the names of every header it is asked to visit, so a test can assert
// which headers a given VisitorFilter yields.
class HeaderNameCollector final : public nsIHttpHeaderVisitor {
 public:
  NS_DECL_ISUPPORTS

  NS_IMETHOD VisitHeader(const nsACString& aHeader,
                         const nsACString& aValue) override {
    mHeaders.AppendElement(nsCString(aHeader));
    return NS_OK;
  }

  bool Contains(const nsACString& aHeader) const {
    for (const auto& header : mHeaders) {
      if (header.Equals(aHeader, nsCaseInsensitiveCStringComparator)) {
        return true;
      }
    }
    return false;
  }

  nsTArray<nsCString> mHeaders;

 private:
  ~HeaderNameCollector() = default;
};

NS_IMPL_ISUPPORTS(HeaderNameCollector, nsIHttpHeaderVisitor)

}  // namespace

// A user-agent override applied by the user agent itself (e.g. desktop-mode /
// general.useragent.override, via SetDocshellUserAgentOverride) is meant to be
// a *default* header, not a script-authored override. CORS request-header
// safelisting consults VisitNonDefaultRequestHeaders (eFilterSkipDefault), so a
// default-variety header must be skipped there; otherwise the override would
// make an otherwise-simple request CORS-unsafe. See bug 1992709.
TEST(TestHeaders, UserAgentEnforceDefaultIsNotCorsUnsafe)
{
  nsHttpRequestHead head;

  nsresult rv =
      head.SetHeader(nsHttp::User_Agent, "OverriddenUA/1.0"_ns, false,
                     nsHttpHeaderArray::eVarietyRequestEnforceDefault);
  ASSERT_EQ(rv, NS_OK);

  // A genuine script-set header takes the default (override) path.
  rv = head.SetHeader("X-Script-Header"_ns, "value"_ns, false);
  ASSERT_EQ(rv, NS_OK);

  ASSERT_TRUE(head.HasHeader(nsHttp::User_Agent));

  // eFilterSkipDefault drops default-variety headers: the UA override is
  // hidden, the script override is exposed.
  RefPtr<HeaderNameCollector> nonDefault = new HeaderNameCollector();
  rv = head.VisitHeaders(nonDefault, nsHttpHeaderArray::eFilterSkipDefault);
  ASSERT_EQ(rv, NS_OK);
  EXPECT_FALSE(nonDefault->Contains("User-Agent"_ns))
      << "A UA override set by the user agent must not be exposed as a "
         "non-default request header, or it would make the request CORS-unsafe";
  EXPECT_TRUE(nonDefault->Contains("X-Script-Header"_ns))
      << "Script-set headers must remain overrides";

  // An unfiltered visit still yields both headers.
  RefPtr<HeaderNameCollector> all = new HeaderNameCollector();
  rv = head.VisitHeaders(all, nsHttpHeaderArray::eFilterAll);
  ASSERT_EQ(rv, NS_OK);
  EXPECT_TRUE(all->Contains("User-Agent"_ns));
  EXPECT_TRUE(all->Contains("X-Script-Header"_ns));
}

// Contrast: the very same User-Agent header, set as a plain override (which is
// what the channel did before bug 1992709, by discarding the requested
// variety), *is* exposed as a non-default header and so would be CORS-unsafe.
TEST(TestHeaders, UserAgentOverrideIsCorsUnsafe)
{
  nsHttpRequestHead head;

  nsresult rv = head.SetHeader(nsHttp::User_Agent, "OverriddenUA/1.0"_ns, false,
                               nsHttpHeaderArray::eVarietyRequestOverride);
  ASSERT_EQ(rv, NS_OK);

  RefPtr<HeaderNameCollector> nonDefault = new HeaderNameCollector();
  rv = head.VisitHeaders(nonDefault, nsHttpHeaderArray::eFilterSkipDefault);
  ASSERT_EQ(rv, NS_OK);
  EXPECT_TRUE(nonDefault->Contains("User-Agent"_ns));
}

TEST(TestHeaders, DuplicateHSTS)
{
  // When the Strict-Transport-Security header is sent multiple times, its
  // effective value is the value of the first item. It is not merged as other
  // headers are.
  mozilla::net::nsHttpHeaderArray headers;
  nsresult rv = headers.SetHeaderFromNet(
      mozilla::net::nsHttp::Strict_Transport_Security,
      "Strict_Transport_Security"_ns, "max-age=360"_ns, true);
  ASSERT_EQ(rv, NS_OK);

  nsAutoCString h;
  rv = headers.GetHeader(mozilla::net::nsHttp::Strict_Transport_Security, h);
  ASSERT_EQ(rv, NS_OK);
  ASSERT_EQ(h.get(), "max-age=360");

  rv = headers.SetHeaderFromNet(mozilla::net::nsHttp::Strict_Transport_Security,
                                "Strict_Transport_Security"_ns,
                                "max-age=720"_ns, true);
  ASSERT_EQ(rv, NS_OK);

  rv = headers.GetHeader(mozilla::net::nsHttp::Strict_Transport_Security, h);
  ASSERT_EQ(rv, NS_OK);
  ASSERT_EQ(h.get(), "max-age=360");
}
