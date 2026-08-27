/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_StickyTimeDuration_h
#define mozilla_StickyTimeDuration_h

#include <cmath>

#include "mozilla/CheckedInt.h"
#include "mozilla/FloatingPoint.h"
#include "mozilla/TimeStamp.h"

namespace mozilla {

/**
 * A ValueCalculator class that performs additional checks before performing
 * arithmetic operations such that if either operand is Forever (or the
 * negative equivalent) the result remains Forever (or the negative equivalent
 * as appropriate).
 *
 * In addition to the Forever/-Forever operands, Multiply also saturates to
 * Forever/-Forever when the product would overflow the range of int64_t.
 * Add and Subtract don't check for that case since we don't expect that to
 * happen often except under test conditions, in which case the wrapping
 * behavior is probably acceptable.
 */
class StickyTimeDurationValueCalculator {
 public:
  static int64_t Add(int64_t aA, int64_t aB) {
    MOZ_ASSERT((aA != INT64_MAX || aB != INT64_MIN) &&
                   (aA != INT64_MIN || aB != INT64_MAX),
               "'Infinity + -Infinity' and '-Infinity + Infinity'"
               " are undefined");

    // Forever + x = Forever
    // x + Forever = Forever
    if (aA == INT64_MAX || aB == INT64_MAX) {
      return INT64_MAX;
    }
    // -Forever + x = -Forever
    // x + -Forever = -Forever
    if (aA == INT64_MIN || aB == INT64_MIN) {
      return INT64_MIN;
    }

    return aA + aB;
  }

  // Note that we can't just define Add and have BaseTimeDuration call Add with
  // negative arguments since INT64_MAX != -INT64_MIN so the saturating logic
  // won't work.
  static int64_t Subtract(int64_t aA, int64_t aB) {
    MOZ_ASSERT((aA != INT64_MAX && aA != INT64_MIN) || aA != aB,
               "'Infinity - Infinity' and '-Infinity - -Infinity'"
               " are undefined");

    // Forever - x  = Forever
    // x - -Forever = Forever
    if (aA == INT64_MAX || aB == INT64_MIN) {
      return INT64_MAX;
    }
    // -Forever - x = -Forever
    // x - Forever  = -Forever
    if (aA == INT64_MIN || aB == INT64_MAX) {
      return INT64_MIN;
    }

    return aA - aB;
  }

  template <typename T>
  static int64_t Multiply(int64_t aA, T aB) {
    // Specializations for double, float, and int64_t are provided following.
    return Multiply(aA, static_cast<int64_t>(aB));
  }

  static int64_t Divide(int64_t aA, int64_t aB) {
    MOZ_ASSERT(aB != 0, "Division by zero");
    MOZ_ASSERT((aA != INT64_MAX && aA != INT64_MIN) ||
                   (aB != INT64_MAX && aB != INT64_MIN),
               "Dividing +/-Infinity by +/-Infinity is undefined");

    // Forever / +x = Forever
    // Forever / -x = -Forever
    // -Forever / +x = -Forever
    // -Forever / -x = Forever
    if (aA == INT64_MAX || aA == INT64_MIN) {
      return (aA >= 0) ^ (aB >= 0) ? INT64_MIN : INT64_MAX;
    }
    // x /  Forever = 0
    // x / -Forever = 0
    if (aB == INT64_MAX || aB == INT64_MIN) {
      return 0;
    }

    return aA / aB;
  }

  static double DivideDouble(int64_t aA, int64_t aB) {
    MOZ_ASSERT(aB != 0, "Division by zero");
    MOZ_ASSERT((aA != INT64_MAX && aA != INT64_MIN) ||
                   (aB != INT64_MAX && aB != INT64_MIN),
               "Dividing +/-Infinity by +/-Infinity is undefined");

    // Forever / +x = Forever
    // Forever / -x = -Forever
    // -Forever / +x = -Forever
    // -Forever / -x = Forever
    if (aA == INT64_MAX || aA == INT64_MIN) {
      return (aA >= 0) ^ (aB >= 0) ? NegativeInfinity<double>()
                                   : PositiveInfinity<double>();
    }
    // x /  Forever = 0
    // x / -Forever = 0
    if (aB == INT64_MAX || aB == INT64_MIN) {
      return 0.0;
    }

    return static_cast<double>(aA) / aB;
  }

  static int64_t Modulo(int64_t aA, int64_t aB) {
    MOZ_ASSERT(aA != INT64_MAX && aA != INT64_MIN,
               "Infinity modulo x is undefined");

    return aA % aB;
  }
};

template <>
inline int64_t StickyTimeDurationValueCalculator::Multiply<int64_t>(
    int64_t aA, int64_t aB) {
  MOZ_ASSERT((aA != 0 || (aB != INT64_MIN && aB != INT64_MAX)) &&
                 ((aA != INT64_MIN && aA != INT64_MAX) || aB != 0),
             "Multiplication of infinity by zero");

  // Forever  * +x = Forever
  // Forever  * -x = -Forever
  // -Forever * +x = -Forever
  // -Forever * -x = Forever
  //
  // i.e. If one or more of the arguments is +/-Forever, then
  // return -Forever if the signs differ, or +Forever otherwise.
  if (aA == INT64_MAX || aA == INT64_MIN || aB == INT64_MAX ||
      aB == INT64_MIN) {
    return (aA >= 0) ^ (aB >= 0) ? INT64_MIN : INT64_MAX;
  }

  // The same applies when the product of two finite operands would overflow
  // the range of int64_t.
  const CheckedInt<int64_t> result = CheckedInt<int64_t>(aA) * aB;
  if (!result.isValid()) {
    return (aA >= 0) ^ (aB >= 0) ? INT64_MIN : INT64_MAX;
  }

  return result.value();
}

template <>
inline int64_t StickyTimeDurationValueCalculator::Multiply<double>(int64_t aA,
                                                                   double aB) {
  MOZ_ASSERT((aA != 0 || (!std::isinf(aB))) &&
                 ((aA != INT64_MIN && aA != INT64_MAX) || aB != 0.0),
             "Multiplication of infinity by zero");

  // As with Multiply<int64_t>, if one or more of the arguments is
  // +/-Forever or +/-Infinity, then return -Forever if the signs differ,
  // or +Forever otherwise.
  if (aA == INT64_MAX || aA == INT64_MIN || std::isinf(aB)) {
    return (aA >= 0) ^ (aB >= 0.0) ? INT64_MIN : INT64_MAX;
  }

  // The product of two finite operands can still fall outside the range of
  // int64_t, and converting an out-of-range double to int64_t is undefined
  // behavior, so the range must be checked before the implicit conversion
  // below. Note that static_cast<double>(INT64_MAX) rounds up to 2^63, which
  // is not representable as an int64_t, so that boundary counts as overflow
  // too.
  const double result = static_cast<double>(aA) * aB;
  if (result >= static_cast<double>(INT64_MAX) ||
      result <= static_cast<double>(INT64_MIN)) {
    return (aA >= 0) ^ (aB >= 0.0) ? INT64_MIN : INT64_MAX;
  }

  return result;
}

template <>
inline int64_t StickyTimeDurationValueCalculator::Multiply<float>(int64_t aA,
                                                                  float aB) {
  MOZ_ASSERT(std::isinf(aB) == std::isinf(static_cast<double>(aB)),
             "Casting to float loses infinite-ness");

  return Multiply(aA, static_cast<double>(aB));
}

/**
 * Specialization of BaseTimeDuration that uses
 * StickyTimeDurationValueCalculator for arithmetic on the mValue member.
 *
 * Use this class when you need a time duration that is expected to hold values
 * of Forever (or the negative equivalent) *and* when you expect that
 * time duration to be used in arithmetic operations (and not just value
 * comparisons).
 */
typedef BaseTimeDuration<StickyTimeDurationValueCalculator> StickyTimeDuration;

// Template specializations to allow arithmetic between StickyTimeDuration
// and TimeDuration objects by falling back to the safe behavior.
inline StickyTimeDuration operator+(const TimeDuration& aA,
                                    const StickyTimeDuration& aB) {
  return StickyTimeDuration(aA) + aB;
}
inline StickyTimeDuration operator+(const StickyTimeDuration& aA,
                                    const TimeDuration& aB) {
  return aA + StickyTimeDuration(aB);
}

inline StickyTimeDuration operator-(const TimeDuration& aA,
                                    const StickyTimeDuration& aB) {
  return StickyTimeDuration(aA) - aB;
}
inline StickyTimeDuration operator-(const StickyTimeDuration& aA,
                                    const TimeDuration& aB) {
  return aA - StickyTimeDuration(aB);
}

inline StickyTimeDuration& operator+=(StickyTimeDuration& aA,
                                      const TimeDuration& aB) {
  return aA += StickyTimeDuration(aB);
}
inline StickyTimeDuration& operator-=(StickyTimeDuration& aA,
                                      const TimeDuration& aB) {
  return aA -= StickyTimeDuration(aB);
}

inline double operator/(const TimeDuration& aA, const StickyTimeDuration& aB) {
  return StickyTimeDuration(aA) / aB;
}
inline double operator/(const StickyTimeDuration& aA, const TimeDuration& aB) {
  return aA / StickyTimeDuration(aB);
}

inline StickyTimeDuration operator%(const TimeDuration& aA,
                                    const StickyTimeDuration& aB) {
  return StickyTimeDuration(aA) % aB;
}
inline StickyTimeDuration operator%(const StickyTimeDuration& aA,
                                    const TimeDuration& aB) {
  return aA % StickyTimeDuration(aB);
}

}  // namespace mozilla

#endif /* mozilla_StickyTimeDuration_h */
