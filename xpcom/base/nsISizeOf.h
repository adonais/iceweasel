/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsISizeOf_h___
#define nsISizeOf_h___

#include "mozilla/MemoryReporting.h"
#include "nsISupports.h"

#define NS_ISIZEOF_IID \
  {0x61d05579, 0xd7ec, 0x485c, {0xa4, 0x0c, 0x31, 0xc7, 0x9a, 0x5c, 0xf9, 0xf3}}

class nsISizeOf : public nsISupports {
 public:
  NS_INLINE_DECL_STATIC_IID(NS_ISIZEOF_IID)

  /**
   * Measures the size of the object and the things that it points to.
   * Be careful to not call this more than once on a particular object!
   * SizeOfExcludingThis does not make sense here because this is a refcounted
   * object.
   */
  virtual size_t SizeOfIncludingThis(
      mozilla::MallocSizeOf aMallocSizeOf) const = 0;
};

#endif /* nsISizeOf_h___ */
