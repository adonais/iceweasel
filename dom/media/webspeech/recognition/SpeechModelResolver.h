/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHMODELRESOLVER_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHMODELRESOLVER_H_

#include "nsIMLModelResolver.h"

namespace mozilla::dom {

// The speech-recognition implementation of the generic HWInference model
// resolver (registered for the "speech-recognition" task). Lives in the
// trusted parent (main) process.
//
// Resolve() expands an id from the in-tree model table (see
// SpeechRecognitionModelMapping) to its concrete ModelHub artifact; it throws
// for any other id. This is what keeps the (less trusted) utility process from
// ever naming a model/revision/filename itself.
//
// AuthorizeDownload() skips the prompt when the model is already installed,
// honors the testing prefs, and otherwise shows the model-download permission
// doorhanger, allowing the download only on a real user Allow. Content can
// only ask; it never authorizes a download.
class SpeechModelResolver final : public nsIMLModelResolver {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMLMODELRESOLVER

  SpeechModelResolver() = default;

 private:
  ~SpeechModelResolver() = default;
};

}  // namespace mozilla::dom

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHMODELRESOLVER_H_
