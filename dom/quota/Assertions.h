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
void AssertNoOverflow(int64_t aDest, T aArg);

template <typename T, typename U>
void AssertNoUnderflow(T aDest, U aArg);

template <typename T>
void AssertNotNegative(T aValue, const nsACString& context = EmptyCString());

// Prefer QM_CLAMP_TO_ZERO over using this function directly
uint64_t ClampToZero(int64_t aValue,
                     const nsACString& context = EmptyCString());

// Implementation detail of AssertNotNegative and ReportUsageDriftIfAny, not
// meant to be called directly. Throttles how often a given context is
// reported (to the browser console/telemetry) using exponential backoff, to
// avoid flooding. aContext is used to have different counters, so callers
// with distinct contexts can't suppress each other's reports.
// Thread-safe on its own (guarded by a dedicated mutex), since it's called
// from several unrelated thread-affinity domains.
bool ShouldReportDiagnostic(const nsACString& aContext);

bool IsOnIOThread();

void AssertIsOnIOThread();

void DiagnosticAssertIsOnIOThread();

void AssertCurrentThreadOwnsQuotaMutex();

}  // namespace mozilla::dom::quota

// QM_ASSERT_NOT_NEGATIVE/QM_ASSERT_NOT_NEGATIVE_2 should be used instead of
// calling AssertNotNegative directly, so that the context argument (which
// involves string concatenation) isn't constructed on builds where
// AssertNotNegative doesn't consume it.
//
// QM_ASSERT_NOT_NEGATIVE(aValue) derives the context from aValue's own source
// text (via __func__ and #aValue), which is enough when aValue already names
// the field being checked.
//
// QM_ASSERT_NOT_NEGATIVE_2(aValue, aFieldContext) should be used instead when
// aValue's source text isn't itself a useful label. aFieldContext is
// appended after __func__ instead of #aValue.
#if defined(NIGHTLY_BUILD) || defined(DEBUG)
#  define QM_ASSERT_NOT_NEGATIVE(aValue)    \
    mozilla::dom::quota::AssertNotNegative( \
        aValue,                             \
        nsDependentCString(__func__) + "::"_ns + nsDependentCString(#aValue))
#  define QM_ASSERT_NOT_NEGATIVE_2(aValue, aFieldContext) \
    mozilla::dom::quota::AssertNotNegative(               \
        aValue,                                           \
        nsDependentCString(__func__) + "::"_ns + nsAutoCString(aFieldContext))
#else
#  define QM_ASSERT_NOT_NEGATIVE(aValue) \
    mozilla::dom::quota::AssertNotNegative(aValue)
#  define QM_ASSERT_NOT_NEGATIVE_2(aValue, aFieldContext) \
    mozilla::dom::quota::AssertNotNegative(aValue)
#endif

// Used when we don't shouldn't expose negative values (e.g.
// navigator.storage.estimate()). Because this isn't really suppose to happen,
// this will also MOZ_ASSERT on debug builds, and have telemetry on nightly
// builds.
// See bug 2066923 for details.
#if defined(NIGHTLY_BUILD) || defined(DEBUG)
#  define QM_CLAMP_TO_ZERO(aValue)    \
    mozilla::dom::quota::ClampToZero( \
        aValue,                       \
        nsDependentCString(__func__) + "::"_ns + nsDependentCString(#aValue))
#else
#  define QM_CLAMP_TO_ZERO(aValue) mozilla::dom::quota::ClampToZero(aValue)
#endif

#endif  // DOM_QUOTA_ASSERTIONS_H_
