/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONPHRASE_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONPHRASE_H_

#include "mozilla/dom/BindingDeclarations.h"
#include "nsCycleCollectionParticipant.h"
#include "nsIGlobalObject.h"
#include "nsString.h"
#include "nsWrapperCache.h"

namespace mozilla::dom {

class SpeechRecognitionPhrase final : public nsWrapperCache {
 public:
  NS_INLINE_DECL_CYCLE_COLLECTING_NATIVE_REFCOUNTING(SpeechRecognitionPhrase)
  NS_DECL_CYCLE_COLLECTION_NATIVE_WRAPPERCACHE_CLASS(SpeechRecognitionPhrase)

  static already_AddRefed<SpeechRecognitionPhrase> Constructor(
      const GlobalObject& aGlobal, const nsAString& aPhrase, float aBoost,
      ErrorResult& aRv);

  explicit SpeechRecognitionPhrase(nsIGlobalObject* aGlobal,
                                   const nsAString& aPhrase, float aBoost);

  nsIGlobalObject* GetParentObject() const { return mGlobal; }

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  void GetPhrase(nsAString& aPhrase) const { aPhrase = mPhrase; }

  float Boost() const { return mBoost; }

 private:
  ~SpeechRecognitionPhrase() = default;

  nsCOMPtr<nsIGlobalObject> mGlobal;
  nsString mPhrase;
  float mBoost;
};

}  // namespace mozilla::dom

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONPHRASE_H_
