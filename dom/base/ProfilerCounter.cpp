/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/ProfilerCounter.h"

#include "mozilla/ChromeProfilerCounter.h"
#include "mozilla/dom/ProfilerCounterBinding.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(ProfilerCounter, mParent)
NS_IMPL_CYCLE_COLLECTING_ADDREF(ProfilerCounter)
NS_IMPL_CYCLE_COLLECTING_RELEASE(ProfilerCounter)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(ProfilerCounter)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

ProfilerCounter::ProfilerCounter(
    nsISupports* aParent, already_AddRefed<ChromeProfilerCounter> aCounter)
    : mParent(aParent), mCounter(aCounter) {
  mCounter->Register();
}

ProfilerCounter::~ProfilerCounter() {
  // Unregister when the JS wrapper gets garbage collected. the native counter
  // may outlive this via the profiler's ref.
  mCounter->Unregister();
}

void ProfilerCounter::Add(int64_t aDelta) { mCounter->Add(aDelta); }

JSObject* ProfilerCounter::WrapObject(JSContext* aCx,
                                      JS::Handle<JSObject*> aGivenProto) {
  return ProfilerCounter_Binding::Wrap(aCx, this, aGivenProto);
}

}  // namespace mozilla::dom
