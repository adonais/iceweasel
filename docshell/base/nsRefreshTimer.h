/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsRefreshTimer_h_
#define nsRefreshTimer_h_

#include "nsINamed.h"
#include "nsITimer.h"

#include "nsCOMPtr.h"

class nsDocShell;
class nsIURI;
class nsIPrincipal;

class nsRefreshTimer : public nsITimerCallback, public nsINamed {
 public:
  nsRefreshTimer(nsDocShell* aDocShell, nsIURI* aURI, nsIPrincipal* aPrincipal,
                 int32_t aDelay);

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSITIMERCALLBACK
  NS_DECL_NSINAMED

  int32_t GetDelay() { return mDelay; }

  MOZ_KNOWN_LIVE RefPtr<nsDocShell> mDocShell;
  MOZ_KNOWN_LIVE nsCOMPtr<nsIURI> mURI;
  MOZ_KNOWN_LIVE nsCOMPtr<nsIPrincipal> mPrincipal;
  int32_t mDelay;

 private:
  virtual ~nsRefreshTimer();
};

#endif /* nsRefreshTimer_h_ */
