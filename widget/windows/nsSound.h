/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsSound_h_
#define _nsSound_h_

#include "mozilla/StaticPtr.h"
#include "nsCOMPtr.h"
#include "nsIObserver.h"
#include "nsISound.h"

class nsIThread;
class nsIRunnable;

class nsSound : public nsISound,
                public nsIObserver

{
 public:
  nsSound() = default;
  static already_AddRefed<nsISound> GetInstance();

  NS_DECL_ISUPPORTS
  NS_DECL_NSISOUND
  NS_DECL_NSIOBSERVER

 private:
  virtual ~nsSound() = default;
  void PurgeLastSound();

 private:
  nsresult CreatePlayerThread();

  nsCOMPtr<nsIThread> mPlayerThread;
  nsCOMPtr<nsIRunnable> mSoundPlayer;
  bool mInited{false};

  static mozilla::StaticRefPtr<nsISound> sInstance;
};

#endif /* _nsSound_h_ */
