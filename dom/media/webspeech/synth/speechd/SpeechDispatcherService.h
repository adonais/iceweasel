/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_SYNTH_SPEECHD_SPEECHDISPATCHERSERVICE_H_
#define DOM_MEDIA_WEBSPEECH_SYNTH_SPEECHD_SPEECHDISPATCHERSERVICE_H_

#include "mozilla/StaticPtr.h"
#include "nsIObserver.h"
#include "nsISpeechService.h"
#include "nsIThread.h"
#include "nsRefPtrHashtable.h"
#include "nsTArray.h"

struct SPDConnection;

namespace mozilla {
namespace dom {

class SpeechDispatcherCallback;
class SpeechDispatcherVoice;

class SpeechDispatcherService final : public nsIObserver,
                                      public nsISpeechService {
  friend class SpeechDispatcherCallback;

 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIOBSERVER
  NS_DECL_NSISPEECHSERVICE

  SpeechDispatcherService();

  void Init();

  void Setup();

  void EventNotify(uint32_t aMsgId, uint32_t aState);

  static SpeechDispatcherService* GetInstance(bool create = true);
  static already_AddRefed<SpeechDispatcherService> GetInstanceForService();

  static StaticRefPtr<SpeechDispatcherService> sSingleton;

 private:
  virtual ~SpeechDispatcherService();

  void NotifyError(const nsString& aError);

  void RegisterVoices();

  bool mInitialized;

  SPDConnection* mSpeechdClient;

  nsRefPtrHashtable<nsUint32HashKey, SpeechDispatcherCallback> mCallbacks;

  nsCOMPtr<nsIThread> mInitThread;

  nsRefPtrHashtable<nsStringHashKey, SpeechDispatcherVoice> mVoices;
};

}  // namespace dom
}  // namespace mozilla
#endif  // DOM_MEDIA_WEBSPEECH_SYNTH_SPEECHD_SPEECHDISPATCHERSERVICE_H_
