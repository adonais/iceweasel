/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_LoadedOriginSet_h
#define mozilla_dom_LoadedOriginSet_h

#include "mozilla/Mutex.h"
#include "mozilla/OriginAttributes.h"
#include "mozilla/dom/ProcessIsolation.h"
#include "nsISupportsImpl.h"
#include "nsTHashMap.h"

class nsIPrincipal;

namespace mozilla::dom {

/**
 * The LoadedOriginSet is an append-only & threadsafe origin set. It is used to
 * track the set of origins which have ever been loaded within a given process.
 *
 * Origins in this set are stored in a 2-tier mapping to make look-ups with
 * different OriginAttribute filtering more efficient. The first tier tracks
 * each set of OAs, and an inner hashmap then tracks the originNoSuffix loaded
 * with those OAs.
 *
 * In addition to the primary originNoSuffix, loaded siteOrigins are also
 * tracked. If an originNoSuffix is only loaded as a siteOrigin, it will be
 * stored with mSiteOnly set.
 */
class LoadedOriginSet {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(LoadedOriginSet)

  explicit LoadedOriginSet(const nsACString& aRemoteType);

  enum class Level : uint8_t {
    Unloaded,
    // The principal's site-origin has been (potentially tentatively) loaded.
    SiteOnly,
    // The principal's origin is being loaded.
    // Auxiliary information (e.g. permissions) has not been sent/received yet.
    Tentative,
    // The principal's origin has been fully loaded.
    // In the parent, auxiliary info will be sent before any further main-thread
    // work, and in the child it has already been received.
    Full,
  };

  nsCString GetRemoteType();

  // Should only be called by ContentParent or ContentChild.
  void SetRemoteType(const nsACString& aRemoteType);

  // Check if this LoadedOriginSet has the given principal.
  bool Has(nsIPrincipal* aPrincipal, Level aThreshold,
           uint32_t aStripAttributesFlags = OriginAttributes::STRIP_NONE);

  // Tentatively add a new principal to the loaded origin set from any thread.
  //
  // Must only be called if it is known that AboutToLoadOrigin has been, or will
  // imminently be, called for this process & principal.
  void AddTentative(nsIPrincipal* aPrincipal) {
    (void)AddInternal(aPrincipal, /* aTentative */ true);
  }

  // Internal method to add a new principal to the loaded origin set.
  //
  // Returns the previous level the entry was loaded at.
  //
  // Should only be directly called by ContentParent::AboutToLoadOrigin and
  // ContentChild::RecvAddLoadedOrigin.
  [[nodiscard]] Level AddInternal(nsIPrincipal* aPrincipal, bool aTentative);

  bool ValidatePrincipal(
      nsIPrincipal* aPrincipal,
      const EnumSet<ValidatePrincipalOptions>& aOptions = {});

 private:
  ~LoadedOriginSet() = default;

  struct OriginEntry {
    Level mLevel = Level::Unloaded;
  };

  struct AttributeBucket {
    OriginAttributes mAttrs;
    nsTHashMap<nsCStringHashKey, OriginEntry> mOrigins;
  };

  Mutex mMutex{"LoadedOriginSet"};
  nsCString mRemoteType MOZ_GUARDED_BY(mMutex);
  nsTArray<AttributeBucket> mLoadedOrigins MOZ_GUARDED_BY(mMutex);
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_LoadedOriginSet_h
