/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHGRAMMAR_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHGRAMMAR_H_

#include "js/TypeDecls.h"
#include "nsCOMPtr.h"
#include "nsCycleCollectionParticipant.h"
#include "nsString.h"
#include "nsWrapperCache.h"

namespace mozilla {
class ErrorResult;

namespace dom {

class GlobalObject;

class SpeechGrammar final : public nsISupports, public nsWrapperCache {
 public:
  explicit SpeechGrammar(nsISupports* aParent);

  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(SpeechGrammar)

  nsISupports* GetParentObject() const;

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<SpeechGrammar> Constructor(
      const GlobalObject& aGlobal);

  static already_AddRefed<SpeechGrammar> WebkitSpeechGrammar(
      const GlobalObject& aGlobal, ErrorResult& aRv) {
    return Constructor(aGlobal);
  }

  void GetSrc(nsString& aRetVal, ErrorResult& aRv) const;

  void SetSrc(const nsAString& aArg, ErrorResult& aRv);

  float GetWeight(ErrorResult& aRv) const;

  void SetWeight(float aArg, ErrorResult& aRv);

 private:
  ~SpeechGrammar();

  nsCOMPtr<nsISupports> mParent;

  nsString mSrc;
};

}  // namespace dom
}  // namespace mozilla

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHGRAMMAR_H_
