/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsPersistentProperties_h_
#define nsPersistentProperties_h_

#include "mozilla/ArenaAllocator.h"
#include "nsCOMPtr.h"
#include "nsIPersistentProperties2.h"
#include "nsIUnicharInputStream.h"
#include "nsString.h"
#include "nsTHashMap.h"

class nsPersistentProperties final : public nsIPersistentProperties {
 public:
  nsPersistentProperties() = default;

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIPROPERTIES
  NS_DECL_NSIPERSISTENTPROPERTIES

 private:
  ~nsPersistentProperties() = default;

 protected:
  nsCOMPtr<nsIUnicharInputStream> mIn;

  nsTHashMap<nsDepCharHashKey, const char16_t*> mTable{16};
  mozilla::ArenaAllocator<2048, 4> mArena;
};

class nsPropertyElement final : public nsIPropertyElement {
 public:
  nsPropertyElement() = default;

  nsPropertyElement(const nsACString& aKey, const nsAString& aValue)
      : mKey(aKey), mValue(aValue) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSIPROPERTYELEMENT

  static nsresult Create(REFNSIID aIID, void** aResult);

 private:
  ~nsPropertyElement() = default;

 protected:
  nsCString mKey;
  nsString mValue;
};

#endif /* nsPersistentProperties_h_ */
