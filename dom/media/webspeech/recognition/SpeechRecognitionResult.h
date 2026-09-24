/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONRESULT_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONRESULT_H_

#include "SpeechRecognitionAlternative.h"
#include "js/TypeDecls.h"
#include "nsCOMPtr.h"
#include "nsCycleCollectionParticipant.h"
#include "nsTArray.h"
#include "nsWrapperCache.h"

namespace mozilla::dom {

class SpeechRecognitionResult final : public nsISupports,
                                      public nsWrapperCache {
 public:
  explicit SpeechRecognitionResult(SpeechRecognition* aParent);

  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(SpeechRecognitionResult)

  nsISupports* GetParentObject() const;

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  uint32_t Length() const;

  already_AddRefed<SpeechRecognitionAlternative> Item(uint32_t aIndex);

  bool IsFinal() const;

  already_AddRefed<SpeechRecognitionAlternative> IndexedGetter(uint32_t aIndex,
                                                               bool& aPresent);

  nsTArray<RefPtr<SpeechRecognitionAlternative>> mItems;

  void SetFinal(bool aIsFinal) { mIsFinal = aIsFinal; }

 private:
  ~SpeechRecognitionResult();

  RefPtr<SpeechRecognition> mParent;
  bool mIsFinal = true;  // Default to true for backwards compatibility
};

}  // namespace mozilla::dom

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONRESULT_H_
