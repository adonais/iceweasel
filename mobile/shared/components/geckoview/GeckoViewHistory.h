/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GECKOVIEWHISTORY_H
#define GECKOVIEWHISTORY_H

#include "mozilla/BaseHistory.h"
#include "nsTObserverArray.h"
#include "nsURIHashKey.h"
#include "nsINamed.h"
#include "nsITimer.h"
#include "nsIURI.h"

#include "mozilla/Maybe.h"
#include "mozilla/StaticPtr.h"

#include <functional>

class nsIWidget;

namespace mozilla {
namespace dom {
class Document;
}
}  // namespace mozilla

struct VisitedURI {
  nsCOMPtr<nsIURI> mURI;
  bool mVisited = false;
};

class GeckoViewHistory final : public mozilla::BaseHistory {
 public:
  NS_DECL_ISUPPORTS

  // IHistory
  NS_IMETHOD VisitURI(nsIWidget*, nsIURI*, nsIURI* aLastVisitedURI,
                      uint32_t aFlags, uint64_t aBrowserId) final;
  NS_IMETHOD SetURITitle(nsIURI*, const nsAString&) final;

  static already_AddRefed<GeckoViewHistory> GetSingleton();

  void StartPendingVisitedQueries(PendingVisitedQueries&&) final;

  GeckoViewHistory();

  void QueryVisitedState(nsIWidget* aWidget,
                         mozilla::dom::ContentParent* aInterestedProcess,
                         nsTArray<RefPtr<nsIURI>>&& aURIs);
  void HandleVisitedState(const nsTArray<VisitedURI>& aVisitedURIs,
                          ContentParentSet* aInterestedProcesses);

  // Asks the embedding app whether aHost was visited within
  // [aAfterEpochMillis, aBeforeEpochMillis), invoking aCallback with
  // Some(true) if it was visited, Some(false) if it was not, and Nothing if the
  // status could not be determined (no listener, or the query failed). This
  // distinction matters because callers must not treat an unknown result the
  // same as a definitive "not visited". aCallback is always invoked exactly
  // once.
  void QueryHostVisitedSince(
      nsIWidget* aWidget, const nsACString& aHost, int64_t aAfterEpochMillis,
      int64_t aBeforeEpochMillis,
      std::function<void(mozilla::Maybe<bool>)>&& aCallback);

 private:
  virtual ~GeckoViewHistory();

  void QueryVisitedStateInContentProcess(const PendingVisitedQueries&);
  void QueryVisitedStateInParentProcess(const PendingVisitedQueries&);

  static mozilla::StaticRefPtr<GeckoViewHistory> sHistory;
};

#endif
