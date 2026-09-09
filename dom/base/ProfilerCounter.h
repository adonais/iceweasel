/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_ProfilerCounter_h
#define mozilla_dom_ProfilerCounter_h

#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsISupports.h"
#include "nsWrapperCache.h"

namespace mozilla {

class ChromeProfilerCounter;

namespace dom {

/**
 * The thin, refcounted C++ backing object for the JS ProfilerCounter interface
 * returned by ChromeUtils.addProfilerCounter(). It owns the underlying
 * ChromeProfilerCounter and forwards calls to it, such as Add().
 */
class ProfilerCounter final : public nsISupports, public nsWrapperCache {
 public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(ProfilerCounter)

  ProfilerCounter(nsISupports* aParent,
                  already_AddRefed<ChromeProfilerCounter> aCounter);

  void Add(int64_t aDelta);

  nsISupports* GetParentObject() const { return mParent; }

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

 private:
  ~ProfilerCounter();

  nsCOMPtr<nsISupports> mParent;
  RefPtr<ChromeProfilerCounter> mCounter;
};

}  // namespace dom
}  // namespace mozilla

#endif  // mozilla_dom_ProfilerCounter_h
