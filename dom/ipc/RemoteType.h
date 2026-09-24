/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_RemoteType_h
#define mozilla_dom_RemoteType_h

#include "mozilla/HashFunctions.h"
#include "mozilla/Result.h"
#include "nsString.h"

namespace mozilla {
class OriginAttributes;
}

namespace IPC {
template <typename T>
struct ParamTraits;
class MessageWriter;
class MessageReader;
}  // namespace IPC

namespace mozilla::dom {

/**
 * Parsed information about a given RemoteType string. A remote type is used as
 * the key for determining which process type to load in.
 */
struct RemoteType {
  // Primary "Kind" enum for the remote type.
  //
  // These must match the similar ones in E10SUtils.sys.mjs and ProcInfo.h and
  // ChromeUtils.webidl.  Process names as reported by about:memory are defined
  // in ContentChild:RecvSetRemoteType.  Add your value there too or it will be
  // called "Web Content".
  enum class Kind : uint8_t {
    // Error case for an "invalid" RemoteType instance.
    // Remote Types of this Kind are falsy, and cannot be sent over IPC.
    Unknown,

    // The parent process.
    // This process is exclusively used for displaying core and/or legacy
    // trusted browser UI.
    NotRemote,

    // An unspecialized content process, which has loaded nothing.
    // Only a process with this Kind can change its RemoteType at runtime.
    Prealloc,

    // Process used to host arbitrary untrusted web content.
    // Privileged interfaces should not be exposed to web content processes.
    WebContent,

    // Process used to host arbitrary untrusted web content with the COOP and
    // COEP headers.
    // Privileged interfaces should not be exposed to web content processes.
    WebCoopCoep,

    // Process used to host arbitrary untrusted web service workers.
    // Privileged interfaces should not be exposed to web content processes.
    WebServiceWorker,

    // Process used to host arbitrary untrusted content from the local
    // filesystem (i.e. file:/// URIs).
    // This process is less sandboxed, as by necessity it is allowed to read the
    // local filesystem.
    File,

    // Process used to host privileged browser UI.
    // Privileged APIs used by pages like the newtab page must be restricted to
    // only be usable within this remote type.
    PrivilegedAbout,

    // Process used to host privileged web content, such as AMO and SUMO.
    PrivilegedMozilla,

    // Process used to host WebExtension content, including background scripts,
    // toplevel documents, and service workers.
    Extension,

    // Process used to host inference models.
    Inference,
  };

  // Static getter for the NotRemote remote type.
  //
  // This returns a `const RemoteType&` referencing a static `NotRemote` type to
  // allow returning this type in context which otherwise would return a `const
  // RemoteType&`.
  //
  // Other kinds should use the normal `RemoteType` constructor or `SharedWeb`
  static const RemoteType& NotRemote();

  // Static factory method for Web remote types.
  //
  // This creates a SharedWeb remote type without site isolation or other
  // customizations. Use the `With*` methods to create isolated remote types.
  static RemoteType SharedWeb(const OriginAttributes& aAttrs);

  RemoteType();
  ~RemoteType();
  RemoteType(const RemoteType&);
  RemoteType& operator=(const RemoteType&);

  // NOTE: Currently we don't support move operators.
  // If we decide to implement them in the future, it should probably be done
  // manually to ensure the moved-from RemoteType becomes Unknown.

  explicit RemoteType(Kind aKind);

  // Support for equality & hashing operations on the RemoteType object.
  bool operator==(const RemoteType& aOther) const;
  bool operator!=(const RemoteType& aOther) const { return !(*this == aOther); }
  HashNumber Hash() const;

  // Checking for validity.
  bool IsKnown() const { return mKind != Kind::Unknown; }
  explicit operator bool() const { return IsKnown(); }

  // Attempts to parse a stringified RemoteType.
  // On failure, returns an `Unknown` RemoteType object.
  static RemoteType Parse(const nsACString& aRemoteType);

  // Convert a parsed RemoteType back into its string representation.
  // WARNING: The resulting value is not Telemetry-safe, see StringifyKind().
  nsCString Stringify() const;

  // Get a telemetry-safe kind string for this RemoteType.
  nsCString StringifyKind() const;

  // String value encoding RemoteType metadata (e.g. site origin & OAs).
  // WARNING: The resulting value is not Telemetry-safe.
  nsAutoCString StringifyMeta() const;

  // Which kind of RemoteType is this? You can also use the helper methods below
  // instead of matching on every case.
  Kind GetKind() const { return mKind; }

  // Get the [Site]OriginNoSuffix used for isolating this process.
  // Only valid to call if HasOrigin().
  const nsCString& OriginNoSuffix() const {
    MOZ_ASSERT(HasOrigin());
    return mOriginNoSuffix;
  }

  // NOTE: These origin attributes are only specified for web remote types, and
  // will be left as default for all other remote types.
  uint32_t UserContextId() const { return mUserContextId; }
  uint32_t PrivateBrowsingId() const { return mPrivateBrowsingId; }
  bool IsPrivateBrowsing() const { return mPrivateBrowsingId != 0; }
  const nsString& GeckoViewSessionContextId() const {
    return mGeckoViewSessionContextId;
  }

  OriginAttributes GetOriginAttributes() const;

  // Check if there are any non-default attributes.
  bool HasAttrs() const;
  bool HasOrigin() const { return !mOriginNoSuffix.IsEmpty(); }
  bool HasMeta() const { return HasOrigin() || HasAttrs(); }

  bool IsNotRemote() const { return mKind == Kind::NotRemote; }
  bool IsPrealloc() const { return mKind == Kind::Prealloc; }
  bool IsWeb() const {
    return mKind == Kind::WebContent || mKind == Kind::WebCoopCoep ||
           mKind == Kind::WebServiceWorker;
  }
  bool IsSharedWeb() const { return IsWeb() && !HasOrigin(); }
  bool IsIsolatedWeb() const { return IsWeb() && HasOrigin(); }
  bool IsWebCoopCoep() const { return mKind == Kind::WebCoopCoep; }
  bool IsWebServiceWorker() const { return mKind == Kind::WebServiceWorker; }
  bool IsFile() const { return mKind == Kind::File; }
  bool IsPrivilegedAbout() const { return mKind == Kind::PrivilegedAbout; }
  bool IsPrivilegedMozilla() const { return mKind == Kind::PrivilegedMozilla; }
  bool IsExtension() const { return mKind == Kind::Extension; }
  bool IsInference() const { return mKind == Kind::Inference; }
  bool IsJitDisabled() const { return mDisableJit; }

  // Does this RemoteType support being created from a prealloc process?
  bool SupportsPrealloc() const;

  // Construct a new RemoteType identical to the current RemoteType, but with
  // the "disableJit" flag set.
  // WARNING: Asserts if called on a non-Web remote type.
  RemoteType WithDisableJit(bool aDisableJit) const;

  // Turn this shared web RemoteType into an IsolatedWeb RemoteType which is
  // isolated by the provided SiteOriginNoSuffix. A specific kind for the
  // isolated remoteType can also be provided, and must be WebContent,
  // WebServiceWorker, or WebCoopCoep.
  // WARNING: Asserts if called on a non-SharedWeb remote type.
  RemoteType WithSiteOrigin(const nsACString& aSiteOriginNoSuffix,
                            Kind aNewKind = Kind::WebContent) const;

  // Allow formatting a RemoteType with {fmt} or operator<<
  friend nsCString format_as(const RemoteType& aRemoteType) {
    return aRemoteType.Stringify();
  }
  friend std::ostream& operator<<(std::ostream& aStream,
                                  const RemoteType& aRemoteType) {
    return aStream << aRemoteType.Stringify();
  }

 private:
  // Implementation detail of `Parse`, which does not assert validity.
  static RemoteType ParseNoValidityCheck(const nsACString& aRemoteType);

  // Check that the given RemoteType does not violate any internal invariants.
  // An invalid RemoteType should never be exposed outside of RemoteType
  // internals, so this is private.
  [[nodiscard]] Result<Ok, const char*> CheckValidity() const;
  void ReleaseAssertValidity() const;
  void DebugAssertValidity() const {
#ifdef DEBUG
    ReleaseAssertValidity();
#endif
  }

  Kind mKind = Kind::Unknown;

  // Additional Isolation Flags.
  bool mDisableJit = false;

  // The [Site]OriginNoSuffix used for isolating this process.
  nsCString mOriginNoSuffix;

  // This is a subset of the members from `OriginAttributes`, which are allowed
  // to influence process selection.
  uint32_t mUserContextId = 0;
  uint32_t mPrivateBrowsingId = 0;
  nsString mGeckoViewSessionContextId;

  template <typename T>
  struct Attr {
    nsLiteralCString mName;
    T RemoteType::* mMember;
  };

  // Tuple describing the various RemoteType attributes which should be
  // serialized into the remote type with URIParams.
  static constexpr std::tuple kAttrs{
      Attr{"userContextId"_ns, &RemoteType::mUserContextId},
      Attr{"privateBrowsingId"_ns, &RemoteType::mPrivateBrowsingId},
      Attr{"geckoViewUserContextId"_ns,
           &RemoteType::mGeckoViewSessionContextId},
      Attr{"disableJit"_ns, &RemoteType::mDisableJit}};
};

}  // namespace mozilla::dom

namespace IPC {

template <>
struct ParamTraits<mozilla::dom::RemoteType> {
  using paramType = mozilla::dom::RemoteType;
  static void Write(MessageWriter* aWriter, const paramType& aParam);
  static bool Read(MessageReader* aReader, paramType* aResult);
};

}  // namespace IPC

#endif  // mozilla_dom_RemoteType_h
