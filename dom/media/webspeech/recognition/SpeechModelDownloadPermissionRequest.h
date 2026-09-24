/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHMODELDOWNLOADPERMISSIONREQUEST_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHMODELDOWNLOADPERMISSIONREQUEST_H_

#include <functional>

#include "SpeechRecognitionModelMapping.h"
#include "nsStringFwd.h"

namespace mozilla::dom {

class CanonicalBrowsingContext;

// Obtains the user's consent to download aModel, running aResolver(true) on
// Allow and aResolver(false) on deny. Shows the model-download doorhanger in
// aBrowsingContext's tab, tagged with aProgressToken so it can follow the
// download's progress notifications. Honors the testing-pref shortcut. Parent
// (main) process only.
void ShowSpeechModelDownloadConsent(const SpeechModelIdentifier& aModel,
                                    CanonicalBrowsingContext* aBrowsingContext,
                                    const nsString& aProgressToken,
                                    std::function<void(bool)>&& aResolver);

}  // namespace mozilla::dom

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHMODELDOWNLOADPERMISSIONREQUEST_H_
