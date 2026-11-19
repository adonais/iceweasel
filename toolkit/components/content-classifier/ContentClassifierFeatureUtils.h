/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ContentClassifierFeatureUtils_h
#define mozilla_ContentClassifierFeatureUtils_h

class nsIChannel;
class nsILoadInfo;

namespace mozilla {

class ContentClassifierRequest;
enum class ClassifyMode;

namespace extensions {
class WebExtensionPolicy;
}

class ContentClassifierFeatureUtils final {
 public:
  // Request filter for the ETP features and their exception lists. Returns
  // whether |aRequest| should be classified in |aMode|:
  // - Annotate: every request, including first-party ones, which get the
  //   first-party tracking flag.
  // - Cancel: third-party requests only, except those the loading extension
  //   has explicit host permission for (see
  //   UrlClassifierCommon::AddonMayLoad).
  static bool ShouldClassifyForETP(const ContentClassifierRequest& aRequest,
                                   ClassifyMode aMode);
  // Same as ShouldClassifyForETP, but skips passive content (images and
  // media) in every mode.
  static bool ShouldClassifyNonPassiveForETP(
      const ContentClassifierRequest& aRequest, ClassifyMode aMode);
  static bool IsNonRecommendedAddonRequest(
      const ContentClassifierRequest& aRequest, ClassifyMode aMode);
  static void HarmfulAddonCancelChannelCallback(nsIChannel* aChannel);

  // Returns the WebExtensionPolicy associated with the triggering or loading
  // principal of |aLoadInfo|, or nullptr if neither principal belongs to an
  // addon (or the addon is no longer installed).
  static extensions::WebExtensionPolicy* GetAddonPolicyFromLoadInfo(
      nsILoadInfo* aLoadInfo);
};

}  // namespace mozilla

#endif  // mozilla_ContentClassifierFeatureUtils_h
