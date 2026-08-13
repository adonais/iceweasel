/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ContentClassifierFeatureUtils_h
#define mozilla_ContentClassifierFeatureUtils_h

class nsIChannel;
class nsILoadInfo;

namespace mozilla {

class ContentClassifierRequest;

namespace extensions {
class WebExtensionPolicy;
}

class ContentClassifierFeatureUtils final {
 public:
  static bool IsThirdPartyRequest(const ContentClassifierRequest& aRequest);
  static bool IsNonRecommendedAddonRequest(
      const ContentClassifierRequest& aRequest);
  static void HarmfulAddonCancelChannelCallback(nsIChannel* aChannel);

  // Returns the WebExtensionPolicy associated with the triggering or loading
  // principal of |aLoadInfo|, or nullptr if neither principal belongs to an
  // addon (or the addon is no longer installed).
  static extensions::WebExtensionPolicy* GetAddonPolicyFromLoadInfo(
      nsILoadInfo* aLoadInfo);
};

}  // namespace mozilla

#endif  // mozilla_ContentClassifierFeatureUtils_h
