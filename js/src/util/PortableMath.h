/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef util_PortableMath_h
#define util_PortableMath_h

#include "mozilla/Casting.h"
#include "mozilla/FloatingPoint.h"

#include <math.h>

#include "js/Value.h"
#include "vm/JSContext.h"

namespace js {

inline double NumberDiv(double a, double b) {
  AutoUnsafeCallWithABI unsafe;
  if (b == 0) {
    if (a == 0 || std::isnan(a)) {
      return JS::GenericNaN();
    }
    if (mozilla::IsNegative(a) != mozilla::IsNegative(b)) {
      return mozilla::NegativeInfinity<double>();
    }
    return mozilla::PositiveInfinity<double>();
  }

  return a / b;
}

inline double NumberMod(double a, double b) {
  AutoUnsafeCallWithABI unsafe;
  if (b == 0) {
    return JS::GenericNaN();
  }

  // Fast path: both operands are integer-valued and fit in Int64. The exact
  // remainder of two integer-valued doubles is itself always representable as
  // a double, so converting |m| back below never rounds.
  int64_t ai, bi;
  if (mozilla::NumberEqualsInt64(a, &ai) &&
      mozilla::NumberEqualsInt64(b, &bi)) {
    // N % -1 == 0. Special-casing this also avoids INT64_MIN % -1.
    if (bi != -1) {
      int64_t m = ai % bi;
      if (m != 0) {
        return double(m);
      }
    }

    // Zero remainder takes the sign of a
    return std::copysign(0.0, a);
  }

  double r = fmod(a, b);
#if defined(XP_WIN)
  // Some versions of Windows (Win 10 v1803, v1809) miscompute the sign of zero
  // results from fmod. The sign should match the sign of the LHS. This bug
  // only affects 64-bit builds. See bug 1527007.
  if (mozilla::IsPositiveZero(r) && mozilla::IsNegative(a)) {
    return -0.0;
  }
#endif
  return r;
}

template <typename T>
inline T GetBiggestNumberLessThan(T x) {
  MOZ_ASSERT(!mozilla::IsNegative(x));
  MOZ_ASSERT(std::isfinite(x));
  using Bits = typename mozilla::FloatingPoint<T>::Bits;
  Bits bits = mozilla::BitwiseCast<Bits>(x);
  MOZ_ASSERT(bits > 0, "will underflow");
  return mozilla::BitwiseCast<T>(bits - 1);
}

}  // namespace js

#endif /* util_PortableMath_h */
