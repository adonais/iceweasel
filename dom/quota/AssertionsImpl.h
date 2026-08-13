/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_ASSERTIONSIMPL_H_
#define DOM_QUOTA_ASSERTIONSIMPL_H_

#include <type_traits>

#include "mozilla/Assertions.h"
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
void AssertNoOverflow(uint64_t aDest, T aArg) {
  detail::IntChecker<T>::Assert(aDest);
  detail::IntChecker<T>::Assert(aArg);
  MOZ_ASSERT(UINT64_MAX - aDest >= uint64_t(aArg));
}

template <typename T, typename U>
void AssertNoUnderflow(T aDest, U aArg, const nsACString& context) {
  detail::IntChecker<T>::Assert(aDest);
  detail::IntChecker<T>::Assert(aArg);
#if defined(NIGHTLY_BUILD) || defined(DEBUG)
  {
    const auto scope =
        context.IsEmpty()
            ? Nothing{}
            : Some(quota::ScopedLogExtraInfo{
                  quota::ScopedLogExtraInfo::kTagContextTainted, context});
    const bool noUnderflow = uint64_t(aDest) >= uint64_t(aArg);
    MOZ_ASSERT(noUnderflow);
    QM_TRY(OkIf(noUnderflow), QM_VOID, QM_NO_CLEANUP,
           ([&context]() { return ShouldReportUnderflow(context); }));
  }
#endif
}

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_ASSERTIONSIMPL_H_
