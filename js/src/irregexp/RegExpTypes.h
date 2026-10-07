/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file forward-defines Irregexp classes that need to be visible
// to the rest of Spidermonkey and re-exports them into js::irregexp.

#ifndef regexp_RegExpTypes_h
#define regexp_RegExpTypes_h

#include "js/UniquePtr.h"

class JSLinearString;

namespace js {
class MatchPairs;
}

namespace v8 {
namespace internal {

class ByteArrayData {
 public:
  ByteArrayData(uint32_t length) : length_(length) {}

  uint32_t length() { return length_; };
  uint8_t* data();

  uint8_t get(uint32_t index) {
    MOZ_ASSERT(index < length());
    return data()[index];
  }
  void set(uint32_t index, uint8_t val) {
    MOZ_ASSERT(index < length());
    data()[index] = val;
  }

  // Used for FixedIntegerArray.
  template <typename T>
  T getTyped(uint32_t index);
  template <typename T>
  void setTyped(uint32_t index, T value);

#ifdef DEBUG
  const static uint32_t ExpectedMagic = 0x12344321;
  uint32_t magic() const { return magic_; }

 private:
  uint32_t magic_ = ExpectedMagic;
#endif

 private:
  template <typename T>
  T* typedData();

  uint32_t length_;
};

class Isolate;

namespace regexp {

class Stack;
class StackScope;

struct InputOutputData {
  JSLinearString* input;

  // Index into input (in chars) at which to begin matching.
  size_t startIndex;

  js::MatchPairs* matches;

  // Whether this execution of the regexp can resume after an interrupt.
  // If not, it will return ERROR when interrupted, and the caller must
  // handle the interrupt. Setting this to true is an assertion that
  // nothing is unrooted in the caller.
  uint32_t canResume;

  InputOutputData(JSLinearString* input, size_t startIndex,
                  js::MatchPairs* matches, bool canResume)
      : input(input),
        startIndex(startIndex),
        matches(matches),
        canResume(canResume) {}

  // Note: return int32_t instead of size_t to prevent signed => unsigned
  // conversions in caller functions.
  static constexpr int32_t offsetOfInput() {
    return int32_t(offsetof(InputOutputData, input));
  }
  static constexpr int32_t offsetOfStartIndex() {
    return int32_t(offsetof(InputOutputData, startIndex));
  }
  static constexpr int32_t offsetOfMatches() {
    return int32_t(offsetof(InputOutputData, matches));
  }
  static constexpr int32_t offsetOfCanResume() {
    return int32_t(offsetof(InputOutputData, canResume));
  }
};

}  // namespace regexp
}  // namespace internal
}  // namespace v8

namespace js {
namespace irregexp {

using Isolate = v8::internal::Isolate;
using RegExpStack = v8::internal::regexp::Stack;
using RegExpStackScope = v8::internal::regexp::StackScope;
using ByteArrayData = v8::internal::ByteArrayData;
using ByteArray = js::UniquePtr<v8::internal::ByteArrayData, JS::FreePolicy>;
using InputOutputData = v8::internal::regexp::InputOutputData;

}  // namespace irregexp
}  // namespace js

#endif  // regexp_RegExpTypes_h
