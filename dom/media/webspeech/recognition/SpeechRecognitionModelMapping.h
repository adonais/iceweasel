/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8  et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONMODELMAPPING_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONMODELMAPPING_H_

#include "mozilla/Maybe.h"
#include "nsString.h"

namespace mozilla::dom {

// ModelHub engine id and task used for every speech recognition model. Shared
// so the download path in the parent process and the read-only availability
// queries in the utility process agree on them.
inline constexpr auto kSpeechRecognitionEngineId = "parakeet-gguf"_ns;
inline constexpr auto kSpeechRecognitionTask = "speech-recognition"_ns;

// The concrete ModelHub artifact a set of requested languages maps to.
struct SpeechModelIdentifier {
  nsCString mModelName;
  nsCString mFileName;
  nsCString mRevision = "main"_ns;
  uint32_t mSizeMB = 0;
  nsCString ToString() const;
};

struct SpeechModelMatch {
  nsCString mId;
  nsCString mLocale;
};

// The first model in models.yaml recognizing aLanguage and that model's own
// locale for it. Nothing if no model recognizes the language.
Maybe<SpeechModelMatch> SpeechModelFor(const nsACString& aLanguage);

// The first model in models.yaml, with no locale so the engine uses its own
// default. Used when neither SpeechRecognition.lang nor the document provides
// a language.
SpeechModelMatch DefaultSpeechModel();

// Expands aId (as returned by SpeechModelFor) to the concrete
// ModelHub artifact it names. Returns false if aId is unknown. Used trusted-
// side (see SpeechModelResolver) to validate an id supplied by the utility
// process before it is passed to ModelHub.
bool ResolveSpeechModelId(const nsACString& aId, SpeechModelIdentifier& aOut);

// Approximate download size in MB of the model artifact identified by
// aModel/aRevision/aFilename, for display in the download permission prompt.
// Returns 0 for an unknown artifact. Keyed by the artifact (not languages) so
// the download gate, which only sees the generic model coordinates, can look
// it up. The model table lives only in this translation unit's .cpp.
uint32_t SpeechModelSizeMB(const nsACString& aModel,
                           const nsACString& aRevision,
                           const nsACString& aFilename);

}  // namespace mozilla::dom

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONMODELMAPPING_H_
