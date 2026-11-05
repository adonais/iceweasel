/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LibSecret_h
#define LibSecret_h

#include "OSKeyStore.h"
#include "mozilla/GRefPtr.h"
#include "nsString.h"

nsresult MaybeLoadLibSecret();

class LibSecret final : public AbstractOSKeyStore {
 public:
  LibSecret();

  virtual nsresult RetrieveSecret(const nsACString& label,
                                  /* out */ nsACString& secret) override;
  virtual nsresult StoreSecret(const nsACString& secret,
                               const nsACString& label) override;
  virtual nsresult DeleteSecret(const nsACString& label) override;

  virtual ~LibSecret();

 private:
  // Passed to every libsecret call and cancelled at xpcom-will-shutdown.
  //
  // A call can wait forever on a keyring prompt (for example, gnome-keyring
  // asking to create or unlock the default keyring with no prompter shown).
  // These calls run on the background I/O pool, which is joined without a
  // timeout at xpcom-shutdown-threads, so cancelling them first keeps a
  // pending prompt from hanging shutdown.
  RefPtr<GCancellable> mCancellable;
};

#endif  // LibSecret_h
