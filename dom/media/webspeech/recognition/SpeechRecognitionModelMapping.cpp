/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8  et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SpeechRecognitionModelMapping.h"

#include "SpeechRecognitionModels.h"
#include "mozilla/Preferences.h"
#include "mozilla/intl/Locale.h"
#include "mozilla/intl/LocaleService.h"
#include "nsFmtString.h"

namespace mozilla::dom {

nsCString SpeechModelIdentifier::ToString() const {
  return nsFmtCString("{}/{}/{}", mModelName.get(), mFileName.get(),
                      mRevision.get());
}

Maybe<SpeechModelMatch> SpeechModelFor(const nsACString& aLanguage) {
  intl::Locale requested;
  if (intl::LocaleParser::TryParse(aLanguage, requested).isErr()) {
    return Nothing();
  }

  // media.webspeech.recognition.model.<language subtag> restricts the choice
  // to the model it names.
  Span<const char> subtag = requested.Language().Span();
  nsAutoCString prefKey("media.webspeech.recognition.model.");
  prefKey.Append(subtag.data(), subtag.size());
  nsAutoCString prefModelId;
  Preferences::GetCString(prefKey.get(), prefModelId);

  AutoTArray<nsCString, 1> requestedLocales{nsCString(aLanguage)};
  for (const auto& m : kSpeechRecognitionModels) {
    if (!m.id) {
      break;
    }
    if (!prefModelId.IsEmpty() && !prefModelId.Equals(m.id)) {
      continue;
    }

    AutoTArray<nsCString, 128> available;
    for (const char* const* l = m.supported_locales; *l; ++l) {
      available.AppendElement(nsDependentCString(*l));
    }

    AutoTArray<nsCString, 1> negotiated;
    intl::LocaleService::GetInstance()->NegotiateLanguages(
        requestedLocales, available, EmptyCString(),
        intl::LocaleService::kLangNegStrategyFiltering, negotiated);
    if (negotiated.IsEmpty()) {
      continue;
    }

    return Some(SpeechModelMatch{nsCString(m.id), std::move(negotiated[0])});
  }

  return Nothing();
}

SpeechModelMatch DefaultSpeechModel() {
  return {nsCString(kSpeechRecognitionModels[0].id), {}};
}

bool ResolveSpeechModelId(const nsACString& aId, SpeechModelIdentifier& aOut) {
  for (const auto& m : kSpeechRecognitionModels) {
    if (!m.id) {
      break;
    }
    if (aId.Equals(m.id)) {
      aOut = {nsCString(m.repo), nsCString(m.filename), nsCString(m.revision),
              m.size_mb};
      return true;
    }
  }
  return false;
}

uint32_t SpeechModelSizeMB(const nsACString& aModel,
                           const nsACString& aRevision,
                           const nsACString& aFilename) {
  for (const auto& m : kSpeechRecognitionModels) {
    if (!m.id) {
      break;
    }
    if (aModel.Equals(m.repo) && aRevision.Equals(m.revision) &&
        aFilename.Equals(m.filename)) {
      return m.size_mb;
    }
  }
  return 0;
}

}  // namespace mozilla::dom
