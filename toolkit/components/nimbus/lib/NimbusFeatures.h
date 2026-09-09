/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_NimbusFeatures_h
#define mozilla_NimbusFeatures_h

#include "mozilla/Preferences.h"
#include "nsTHashSet.h"

namespace mozilla {

class NimbusFeatures {
 public:
  static bool GetBool(const nsACString& aFeatureId, const nsACString& aVariable,
                      bool aDefault);

  static int GetInt(const nsACString& aFeatureId, const nsACString& aVariable,
                    int aDefault);

  static nsresult OnUpdate(const nsACString& aFeatureId,
                           const nsACString& aVariable,
                           PrefChangedFunc aUserCallback, void* aUserData);

  static nsresult OffUpdate(const nsACString& aFeatureId,
                            const nsACString& aVariable,
                            PrefChangedFunc aUserCallback, void* aUserData);

  static nsresult RecordExposureEvent(const nsACString& aFeatureId,
                                      const bool aOnce = false);
};

}  // namespace mozilla

#endif
