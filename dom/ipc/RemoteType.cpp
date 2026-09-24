/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/RemoteType.h"

#include "OriginAttributes.h"
#include "ipc/IPCMessageUtilsSpecializations.h"
#include "mozilla/BasePrincipal.h"
#include "mozilla/NeverDestroyed.h"
#include "mozilla/NullPrincipal.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "nsURLHelper.h"

namespace mozilla::dom {

// URLParams value used to indicate a boolean 'true' value.
// The lack of the attribute is used to indicate 'false'.
static constexpr nsLiteralCString kRemoteTypeAttrTrue = "1"_ns;

/* static */
const RemoteType& RemoteType::NotRemote() {
  static NeverDestroyed<RemoteType> sNotRemote(Kind::NotRemote);
  return *sNotRemote;
}

/* static */
RemoteType RemoteType::SharedWeb(const OriginAttributes& aAttrs) {
  RemoteType type(Kind::WebContent);
  type.mUserContextId = aAttrs.mUserContextId;
  type.mPrivateBrowsingId = aAttrs.mPrivateBrowsingId;
  type.mGeckoViewSessionContextId = aAttrs.mGeckoViewSessionContextId;
  type.DebugAssertValidity();
  return type;
}

RemoteType::RemoteType() = default;
RemoteType::~RemoteType() = default;

RemoteType::RemoteType(RemoteType::Kind aKind) : mKind(aKind) {
  ReleaseAssertValidity();
}

RemoteType::RemoteType(const RemoteType&) = default;
RemoteType& RemoteType::operator=(const RemoteType&) = default;

bool RemoteType::operator==(const RemoteType& aOther) const {
  bool isEqual =
      mKind == aOther.mKind && mOriginNoSuffix == aOther.mOriginNoSuffix &&
      std::apply(
          [&, this](auto&&... aAttrs) -> bool {
            return ((this->*aAttrs.mMember == aOther.*aAttrs.mMember) && ...);
          },
          kAttrs);
  // Sanity checks to catch if someone misses a flag in one of the methods.
  MOZ_ASSERT_IF(isEqual, Hash() == aOther.Hash());
  MOZ_ASSERT_IF(isEqual, Stringify() == aOther.Stringify());
  return isEqual;
}

// We can directly add integers & enums to the hash, but need to call HashString
// before adding strings to the hash.
template <typename T>
static auto PreHashAttr(const T& aValue) {
  if constexpr (std::is_integral_v<T> || std::is_enum_v<T>) {
    return aValue;
  } else {
    return HashString(aValue);
  }
}

HashNumber RemoteType::Hash() const {
  return std::apply(
      [&, this](auto&&... aAttrs) -> HashNumber {
        return HashGeneric(PreHashAttr(mKind), HashString(mOriginNoSuffix),
                           PreHashAttr(this->*aAttrs.mMember)...);
      },
      kAttrs);
}

// NOTE: This specifically parses the "kind" part of the remote type string,
// rather than the value returned from `StringifyKind`. This is only relevant
// for `NotRemote`, which uses "parent" for `StringifyKind`, but VoidCString()
// for `Stringify`.
//
// FIXME: We should make this more aligned by changing the representation of
// `NotRemote` to "parent" (bug 1508757)
static RemoteType::Kind ParseKind(const nsACString& aKindStr) {
  if (aKindStr.IsVoid()) {
    return RemoteType::Kind::NotRemote;
  }
  if (aKindStr == "prealloc"_ns) {
    return RemoteType::Kind::Prealloc;
  }
  // NOTE: The 'webIsolated' and 'web' prefixes are interpreted the same, and
  // generated based on the presence of a URL in ToString() to maintain
  // a level of backwards compatibility with tests assuming the old format.
  if (aKindStr == "web"_ns || aKindStr == "webIsolated"_ns) {
    return RemoteType::Kind::WebContent;
  }
  if (aKindStr == "webCOOP+COEP") {
    return RemoteType::Kind::WebCoopCoep;
  }
  if (aKindStr == "webServiceWorker") {
    return RemoteType::Kind::WebServiceWorker;
  }
  if (aKindStr == "file"_ns) {
    return RemoteType::Kind::File;
  }
  if (aKindStr == "privilegedabout"_ns) {
    return RemoteType::Kind::PrivilegedAbout;
  }
  if (aKindStr == "privilegedmozilla"_ns) {
    return RemoteType::Kind::PrivilegedMozilla;
  }
  if (aKindStr == "extension"_ns) {
    return RemoteType::Kind::Extension;
  }
  if (aKindStr == "inference"_ns) {
    return RemoteType::Kind::Inference;
  }
  return RemoteType::Kind::Unknown;
}

static bool ParseAttr(const nsACString& aValue, bool& aMember) {
  aMember = true;
  return aValue == kRemoteTypeAttrTrue;
}

static bool ParseAttr(const nsACString& aValue, uint32_t& aMember) {
  nsresult rv = NS_OK;
  aMember = aValue.ToInteger(&rv);
  return NS_SUCCEEDED(rv);
}

static bool ParseAttr(const nsACString& aValue, nsString& aMember) {
  aMember = NS_ConvertUTF8toUTF16(aValue);
  return true;
}

/* static */ RemoteType RemoteType::ParseNoValidityCheck(
    const nsACString& aRemoteType) {
  RemoteType type;

  int32_t equalIdx = aRemoteType.FindChar('=');
  if (equalIdx == kNotFound) {
    type.mKind = ParseKind(aRemoteType);
    return type;
  }

  type.mKind = ParseKind(Substring(aRemoteType, 0, equalIdx));
  nsDependentCSubstring site(aRemoteType, equalIdx + 1);

  int32_t caretIdx = site.RFindChar('^');
  if (caretIdx != kNotFound) {
    bool ok = URLParams::Parse(
        Substring(site, caretIdx + 1), true,
        [&](const nsACString& aName, const nsACString& aValue) {
          return std::apply(
              [&](auto&&... aAttrs) {
                return ((aName == aAttrs.mName &&
                         ParseAttr(aValue, type.*aAttrs.mMember)) ||
                        ...);
              },
              kAttrs);
        });
    NS_ENSURE_TRUE(ok, RemoteType{});
    type.mOriginNoSuffix = Substring(site, 0, caretIdx);
  } else {
    type.mOriginNoSuffix = site;
  }
  return type;
}

/* static */ RemoteType RemoteType::Parse(const nsACString& aRemoteType) {
  RemoteType type = ParseNoValidityCheck(aRemoteType);

  // Ensure the type parsed to a valid RemoteType, as we never want to expose an
  // non-Unknown but invalid RemoteType outside of this .cpp file.
  if (auto result = type.CheckValidity(); result.isErr()) {
    NS_WARNING(result.inspectErr());
    return RemoteType{};
  }

  // Ensure the string representation of the remote type matches aRemoteType.
  // This is much stricter than e.g. principal or OriginAttributes parsing, but
  // we shouldn't be storing RemoteType instances in the profile, so it should
  // be OK to be strict here.
  NS_ENSURE_TRUE(type.Stringify() == aRemoteType, RemoteType{});
  return type;
}

nsCString RemoteType::StringifyKind() const {
  DebugAssertValidity();
  switch (mKind) {
    case RemoteType::Kind::NotRemote:
      // NOTE: Unlike other remote types, the full RemoteType string for
      // NotRemote is VoidCString(). We hope to change this in bug 1508757.
      return "parent"_ns;
    case RemoteType::Kind::Prealloc:
      return "prealloc"_ns;
    case RemoteType::Kind::WebContent:
      // NOTE: See the comment in ParseKind for why we do this.
      return HasOrigin() ? "webIsolated"_ns : "web"_ns;
    case RemoteType::Kind::WebCoopCoep:
      return "webCOOP+COEP"_ns;
    case RemoteType::Kind::WebServiceWorker:
      return "webServiceWorker"_ns;
    case RemoteType::Kind::File:
      return "file"_ns;
    case RemoteType::Kind::PrivilegedAbout:
      return "privilegedabout"_ns;
    case RemoteType::Kind::PrivilegedMozilla:
      return "privilegedmozilla"_ns;
    case RemoteType::Kind::Extension:
      return "extension"_ns;
    case RemoteType::Kind::Inference:
      return "inference"_ns;
    case RemoteType::Kind::Unknown:
      // This is not a valid remote type, but we return a string here to avoid
      // crashes in logs if an unknown remote type is printed.
      return "<unknown>"_ns;
    default:
      MOZ_CRASH("Unsupported Kind in StringifyKind");
  }
}

static void SetAttr(URLParams& aParam, const nsACString& aName,
                    const bool& aMember) {
  if (aMember) {
    aParam.Set(aName, kRemoteTypeAttrTrue);
  }
}

static void SetAttr(URLParams& aParam, const nsACString& aName,
                    const uint32_t& aMember) {
  if (aMember != 0) {
    aParam.Set(aName, nsPrintfCString("%" PRIu32, aMember));
  }
}

static void SetAttr(URLParams& aParam, const nsACString& aName,
                    const nsString& aMember) {
  if (!aMember.IsEmpty()) {
    aParam.Set(aName, NS_ConvertUTF16toUTF8(aMember));
  }
}

nsAutoCString RemoteType::StringifyMeta() const {
  DebugAssertValidity();

  nsAutoCString meta(mOriginNoSuffix);

  if (HasAttrs()) {
    URLParams params;
    std::apply(
        [&, this](auto&&... aAttrs) {
          (SetAttr(params, aAttrs.mName, this->*aAttrs.mMember), ...);
        },
        kAttrs);

    nsAutoCString paramsStr;
    params.Serialize(paramsStr, /* encode */ true);

    meta += "^"_ns + paramsStr;
  }

  return meta;
}

nsCString RemoteType::Stringify() const {
  DebugAssertValidity();

  // FIXME: We should change the representation of not-remote! (bug 1508757)
  if (IsNotRemote()) {
    return VoidCString();
  }

  nsCString kindStr = StringifyKind();
  if (HasMeta()) {
    kindStr += "="_ns + StringifyMeta();
  }

  return kindStr;
}

static bool AttrIsSet(const bool& aValue) { return aValue; }
static bool AttrIsSet(const uint32_t& aValue) { return aValue != 0; }
static bool AttrIsSet(const nsString& aValue) { return !aValue.IsEmpty(); }

bool RemoteType::HasAttrs() const {
  return std::apply(
      [this](auto&&... aArgs) {
        return (AttrIsSet(this->*aArgs.mMember) || ...);
      },
      kAttrs);
}

Result<Ok, const char*> RemoteType::CheckValidity() const {
  // If we don't have a WebContent kind, no extra fields can be used.
  if (!IsWeb() && HasMeta()) {
    return Err("Invalid RemoteType: Non-web type has metadata");
  }

  if (HasOrigin()) {
    nsCOMPtr<nsIURI> uri;
    if (NS_FAILED(NS_NewURI(getter_AddRefs(uri), mOriginNoSuffix))) {
      return Err("Invalid RemoteType: Invalid OriginNoSuffix URI");
    }

    nsCOMPtr<nsIPrincipal> principal;
    if (uri->SchemeIs(NS_NULLPRINCIPAL_SCHEME)) {
      // The null principal should not have a precursor, as if it does, we
      // should have constructed the RemoteType using that precursor.
      bool hasQuery = false;
      if (NS_FAILED(uri->GetHasQuery(&hasQuery)) || hasQuery) {
        return Err("Invalid RemoteType: Null principal has precursor");
      }

      principal = NullPrincipal::Create(GetOriginAttributes(), uri);
      if (!principal) {
        return Err("Invalid RemoteType: Failed to create null principal");
      }
    } else {
      principal =
          BasePrincipal::CreateContentPrincipal(uri, GetOriginAttributes());
      if (!principal) {
        return Err("Invalid RemoteType: Failed to create content principal");
      }
      if (!principal->GetIsContentPrincipal()) {
        return Err("Invalid RemoteType: Principal is not a content principal");
      }
    }

    // Currently we always isolate by site, never by origin, so a remote type
    // should only contain a site origin.
    nsAutoCString origin;
    nsAutoCString siteOrigin;
    MOZ_ALWAYS_SUCCEEDS(principal->GetOriginNoSuffix(origin));
    MOZ_ALWAYS_SUCCEEDS(principal->GetSiteOriginNoSuffix(siteOrigin));
    if (origin != mOriginNoSuffix) {
      return Err("Invalid RemoteType: Non-canonical OriginNoSuffix");
    }
    if (origin != siteOrigin) {
      return Err("Invalid RemoteType: Non-site OriginNoSuffix");
    }
  } else if (IsWebCoopCoep() || IsWebServiceWorker()) {
    // These remote types require a URI specified.
    return Err(
        "Invalid RemoteType: Web{CoopCoep/ServiceWorker} without site origin");
  }

  return Ok{};
}

void RemoteType::ReleaseAssertValidity() const {
  auto result = CheckValidity();
  if (result.isErr()) {
    // The returned error is one of the above string literals.
    MOZ_CRASH_UNSAFE(result.inspectErr());
  }
}

bool RemoteType::SupportsPrealloc() const {
  MOZ_ASSERT(IsKnown());
  MOZ_ASSERT(mKind != Kind::Prealloc);

  // NOTE: Extension processes do not support prealloc due to bug 1638119
  return mKind != Kind::NotRemote && mKind != Kind::File &&
         mKind != Kind::PrivilegedAbout && mKind != Kind::Extension &&
         !mDisableJit;
}

OriginAttributes RemoteType::GetOriginAttributes() const {
  OriginAttributes attrs;
  attrs.mUserContextId = mUserContextId;
  attrs.mPrivateBrowsingId = mPrivateBrowsingId;
  attrs.mGeckoViewSessionContextId = mGeckoViewSessionContextId;
  return attrs;
}

RemoteType RemoteType::WithDisableJit(bool aDisableJit) const {
  MOZ_RELEASE_ASSERT(IsWeb());
  RemoteType copy(*this);
  copy.mDisableJit = aDisableJit;

  copy.DebugAssertValidity();
  return copy;
}

RemoteType RemoteType::WithSiteOrigin(const nsACString& aSiteOriginNoSuffix,
                                      Kind aNewKind) const {
  MOZ_RELEASE_ASSERT(IsSharedWeb());
  RemoteType copy(*this);
  copy.mKind = aNewKind;
  copy.mOriginNoSuffix = aSiteOriginNoSuffix;

  // NOTE: We release-assert validity, as an invalid aSiteOriginURI or Kind
  // could create an invalid RemoteType.
  copy.ReleaseAssertValidity();
  MOZ_RELEASE_ASSERT(copy.IsIsolatedWeb());
  return copy;
}

}  // namespace mozilla::dom

// NOTE: This could probably be made more efficient by removing the
// serialization to a string, but this keeps the logic simpler for now.
namespace IPC {

void ParamTraits<mozilla::dom::RemoteType>::Write(MessageWriter* aWriter,
                                                  const paramType& aParam) {
  MOZ_ASSERT(aParam.IsKnown(), "Cannot send unknown RemoteType");
  WriteParam(aWriter, aParam.Stringify());
}

bool ParamTraits<mozilla::dom::RemoteType>::Read(MessageReader* aReader,
                                                 paramType* aResult) {
  nsCString s;
  if (!ReadParam(aReader, &s)) {
    return false;
  }
  *aResult = mozilla::dom::RemoteType::Parse(s);
  return aResult->IsKnown();
}

}  // namespace IPC
