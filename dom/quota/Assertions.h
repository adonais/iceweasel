/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_ASSERTIONS_H_
#define DOM_QUOTA_ASSERTIONS_H_

#include <cstdint>

#include "nsLiteralString.h"
#include "nsString.h"

namespace mozilla::dom::quota {

template <typename T>
void AssertNoOverflow(uint64_t aDest, T aArg);

template <typename T, typename U>
void AssertNoUnderflow(T aDest, U aArg,
                       const nsACString& context = EmptyCString());

// Implementation detail of AssertNoUnderflow, not meant to be called
// directly. Throttles how often a given context is reported (to the browser
// console/telemetry) using exponential backoff, to avoid flooding.
// aContext is used to have different counters.
// Thread-safe on its own (guarded by a dedicated mutex), since
// AssertNoUnderflow is called from several unrelated thread-affinity domains.
bool ShouldReportUnderflow(const nsACString& aContext);

bool IsOnIOThread();

void AssertIsOnIOThread();

void DiagnosticAssertIsOnIOThread();

void AssertCurrentThreadOwnsQuotaMutex();

}  // namespace mozilla::dom::quota

// QM_ASSERT_NO_UNDERFLOW/QM_ASSERT_NO_UNDERFLOW_2 should be used instead of
// calling AssertNoUnderflow directly, so that the context argument (which
// involves string concatenation) isn't constructed on builds where
// AssertNoUnderflow doesn't consume it.
//
// QM_ASSERT_NO_UNDERFLOW(aDest, aArg) derives the context from aDest's own
// source text (via __func__ and #aDest), which is enough when aDest already
// names the field being checked.
//
// QM_ASSERT_NO_UNDERFLOW_2(aDest, aArg, aFieldContext) should be used instead
// when aDest's source text isn't itself a useful label. aFieldContext is
// appended after __func__ instead of #aDest.
#if defined(NIGHTLY_BUILD) || defined(DEBUG)
#  define QM_ASSERT_NO_UNDERFLOW(aDest, aArg) \
    mozilla::dom::quota::AssertNoUnderflow(   \
        aDest, aArg,                          \
        nsDependentCString(__func__) + "::"_ns + nsDependentCString(#aDest))
#  define QM_ASSERT_NO_UNDERFLOW_2(aDest, aArg, aFieldContext) \
    mozilla::dom::quota::AssertNoUnderflow(                    \
        aDest, aArg,                                           \
        nsDependentCString(__func__) + "::"_ns + nsAutoCString(aFieldContext))
#else
#  define QM_ASSERT_NO_UNDERFLOW(aDest, aArg) \
    mozilla::dom::quota::AssertNoUnderflow(aDest, aArg)
#  define QM_ASSERT_NO_UNDERFLOW_2(aDest, aArg, aFieldContext) \
    mozilla::dom::quota::AssertNoUnderflow(aDest, aArg)
#endif

#endif  // DOM_QUOTA_ASSERTIONS_H_
