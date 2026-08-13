/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LAYOUT_STYLE_TYPEDOM_TYPEDOMUTILS_H_
#define LAYOUT_STYLE_TYPEDOM_TYPEDOMUTILS_H_

#include "mozilla/dom/CSSKeywordValueBindingFwd.h"
#include "mozilla/dom/CSSNumericValueBinding.h"
#include "mozilla/dom/CSSPerspectiveBindingFwd.h"

namespace mozilla::dom {

constexpr static const size_t CSSNUMERIC_BASE_TYPE_COUNT = 7;

static_assert(static_cast<size_t>(CSSNumericBaseType::Percent) + 1 ==
              CSSNUMERIC_BASE_TYPE_COUNT);

static constexpr std::array<Optional<int32_t> CSSNumericType::*,
                            CSSNUMERIC_BASE_TYPE_COUNT>
    CSSNUMERIC_TYPE_FIELDS = {
        // clang-format off
        &CSSNumericType::mLength,
        &CSSNumericType::mAngle,
        &CSSNumericType::mTime,
        &CSSNumericType::mFrequency,
        &CSSNumericType::mResolution,
        &CSSNumericType::mFlex,
        &CSSNumericType::mPercent,
        // clang-format on
};

// Extract the CSSKeywordish branch from a flattened CSSPerspectiveValue union.
//
// The caller is expected to pass only pre-checked CSSPerspectiveValue values
// matching the CSSKeywordish variants (UTF8String or CSSKeywordValue).
void ToCSSKeywordish(const CSSPerspectiveValue& aValue, CSSKeywordish& aResult);

}  // namespace mozilla::dom

#endif  // LAYOUT_STYLE_TYPEDOM_TYPEDOMUTILS_H_
