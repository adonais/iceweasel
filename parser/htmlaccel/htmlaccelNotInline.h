/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_htmlaccel_htmlaccelNotInline_h
#define mozilla_htmlaccel_htmlaccelNotInline_h

#include "mozilla/Attributes.h"

namespace mozilla::htmlaccel {
// True iff the buffer contains less-than, ampersand, carriage return,
// or U+0000.
//
// This one could probably be inline without LLVM issues when SIMD
// acceleration is statically enabled, but it's probably not worth
// the complexity to do that.
MOZ_NEVER_INLINE bool ContainsMarkup(const char16_t* aPtr,
                                     const char16_t* aEnd);

// HTML Serializer functions

// NOTE! The SkipNonEscaped functions only skip full SIMD strides, but the
// CountEscaped functions also handle the tail that doesn't fit in a SIMD
// stride.

/// Returns the length of the prefix that does not contain less-than,
/// greater-than, ampersand, or no-break space.
/// Examines the input in multiples of 16 code units and does not examine
/// the tail that is left over.
MOZ_NEVER_INLINE size_t SkipNonEscapedInTextNode(const char16_t* aPtr,
                                                 const char16_t* aEnd);

/// Returns the length of the prefix that does not contain less-than,
/// greater-than, ampersand, or no-break space.
/// Examines the input in multiples of 16 code units and does not examine
/// the tail that is left over.
MOZ_NEVER_INLINE size_t SkipNonEscapedInTextNode(const char* aPtr,
                                                 const char* aEnd);

/// Returns the length of the prefix that does not contain less-than,
/// greater-than, ampersand, no-break space, or double quote.
/// Examines the input in multiples of 16 code units and does not examine
/// the tail that is left over.
MOZ_NEVER_INLINE size_t SkipNonEscapedInAttributeValue(const char16_t* aPtr,
                                                       const char16_t* aEnd);

/// Count occurrences of less-than, greater-than, ampersand, and no-break space.
MOZ_NEVER_INLINE uint32_t CountEscapedInTextNode(const char16_t* aPtr,
                                                 const char16_t* aEnd);

/// Count occurrences of less-than, greater-than, ampersand, and no-break space.
MOZ_NEVER_INLINE uint32_t CountEscapedInTextNode(const char* aPtr,
                                                 const char* aEnd);

/// Count occurrences of less-than, greater-than, ampersand, no-break space, and
/// double quote.
MOZ_NEVER_INLINE uint32_t CountEscapedInAttributeValue(const char16_t* aPtr,
                                                       const char16_t* aEnd);

// HTML Tokenizer functions

// Logically these should be MOZ_ALWAYS_INLINE_EVEN_DEBUG if LLVM was working
// as expected. However, these are MOZ_NEVER_INLINE to work around
// https://github.com/llvm/llvm-project/issues/160886 . This way, we get
// a little bit of LICM for the SIMD constants that need to be loaded
// from the constant pool instead of getting materialized by splatting
// an immediate. Once the LLVM bug is fixed, these should be changed
// to MOZ_ALWAYS_INLINE_EVEN_DEBUG to allow the constants to move further
// up to the top of nsHtml5Tokenizer::stateLoop.

/// The innerHTML / DOMParser case for the data state in the HTML parser
MOZ_NEVER_INLINE int32_t AccelerateDataFastest(const char16_t* aPtr,
                                               const char16_t* aEnd);

/// View Source case for the data state in the HTML parser
MOZ_NEVER_INLINE int32_t AccelerateDataViewSource(const char16_t* aPtr,
                                                  const char16_t* aEnd);

/// Normal network case for the data state in the HTML parser
MOZ_NEVER_INLINE int32_t AccelerateDataLineCol(const char16_t* aPtr,
                                               const char16_t* aEnd);

}  // namespace mozilla::htmlaccel

#endif  // mozilla_htmlaccel_htmlaccelNotInline_h
