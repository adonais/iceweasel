/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_ASSERTIONSIMPL_H_
#define DOM_QUOTA_ASSERTIONSIMPL_H_

#include <type_traits>

#include "mozilla/Assertions.h"
#include "mozilla/CheckedInt.h"
#include "mozilla/dom/quota/Assertions.h"
#include "mozilla/dom/quota/QuotaCommon.h"

namespace mozilla::dom::quota {

namespace detail {

template <typename T, bool = std::is_unsigned_v<T>>
struct IntChecker {
  static void Assert(T aInt) {
    static_assert(std::is_integral_v<T>, "Not an integer!");
    MOZ_ASSERT(aInt >= 0);
  }
};

template <typename T>
struct IntChecker<T, true> {
  static void Assert(T aInt) {
    static_assert(std::is_integral_v<T>, "Not an integer!");
  }
};

}  // namespace detail

template <typename T>
void AssertNoOverflow(int64_t aDest, T aArg) {
  detail::IntChecker<T>::Assert(aDest);
  detail::IntChecker<T>::Assert(aArg);
  MOZ_ASSERT((CheckedInt64{aDest} + aArg).isValid());
}

template <typename T, typename U>
void AssertNoUnderflow(T aDest, U aArg) {
  detail::IntChecker<T>::Assert(aDest);
  detail::IntChecker<T>::Assert(aArg);
  MOZ_ASSERT(uint64_t(aDest) >= uint64_t(aArg));
}

template <typename T>
void AssertNotNegative(T aValue, const nsACString& context) {
  static_assert(std::is_signed_v<T>, "Expected a signed integer!");
#if defined(NIGHTLY_BUILD) || defined(DEBUG)
  {
    const auto scope =
        context.IsEmpty()
            ? Nothing{}
            : Some(quota::ScopedLogExtraInfo{
                  quota::ScopedLogExtraInfo::kTagContextTainted, context});
    const bool notNegative = aValue >= 0;
    MOZ_ASSERT(notNegative);
    QM_TRY(OkIf(notNegative), QM_VOID, QM_NO_CLEANUP,
           ([&context]() { return ShouldReportDiagnostic(context); }));
  }
#endif
}

// Reports when a usage value tracked in memory disagrees with real value (e.g.
// a file's actual size).
// This is used to help find which client/code path is corrupting quota usage
// counters (bug 1585978).
inline void ReportUsageDriftIfAny(int64_t aTracked, int64_t aReal,
                                  const nsACString& aContext) {
#if defined(NIGHTLY_BUILD) || defined(DEBUG)
  MOZ_ASSERT_DEBUG_OR_FUZZING(aTracked == aReal);
  QM_SCOPED_CONTEXT(aContext);
  QM_TRY(OkIf(aTracked == aReal), QM_VOID, QM_NO_CLEANUP,
         ([&aContext]() { return ShouldReportDiagnostic(aContext); }));
#endif
}

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_ASSERTIONSIMPL_H_
