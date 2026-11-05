/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef XPCOM_BASE_NSIDUTILS_H_
#define XPCOM_BASE_NSIDUTILS_H_

#include "nsID.h"
#include "nsString.h"
#include "nsTString.h"

/**
 * Trims the brackets around the nsID string, since it wraps its ID with
 * brackets: {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}.
 */
template <typename T>
// NSID_LENGTH is the length of the bracketed string plus a nul character. We
// are removing 2 brackets, so the total length we need is NSID_LENGTH - 2.
class NSID_TrimBrackets : public nsTAutoStringN<T, NSID_LENGTH - 2> {
 public:
  explicit NSID_TrimBrackets(const nsID& aID) {
    nsIDToCString toCString(aID);
    // The string from nsIDToCString::get() is stored in an NSID_LENGTH array,
    // and the length includes a nul terminator. Thus, we want a length of
    // NSID_LENGTH - 3 as we are excluding 3 characters: `{` at the front, and
    // `}` and the nul terminator at the end.
    this->AssignASCII(toCString.get() + 1, NSID_LENGTH - 3);
  }
};

using NSID_TrimBracketsUTF16 = NSID_TrimBrackets<char16_t>;
using NSID_TrimBracketsASCII = NSID_TrimBrackets<char>;

#endif  // XPCOM_BASE_NSIDUTILS_H_
