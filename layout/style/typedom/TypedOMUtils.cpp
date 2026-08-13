/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "TypedOMUtils.h"

#include "mozilla/Assertions.h"
#include "mozilla/ServoStyleConsts.h"
#include "mozilla/dom/CSSKeywordValueBinding.h"
#include "mozilla/dom/CSSPerspectiveBinding.h"

namespace mozilla::dom {

namespace {

static_assert(StyleNUMERIC_BASE_TYPE_COUNT == CSSNUMERIC_BASE_TYPE_COUNT);

static_assert(uint8_t(StyleNumericBaseType::Length) ==
              uint8_t(CSSNumericBaseType::Length));
static_assert(uint8_t(StyleNumericBaseType::Angle) ==
              uint8_t(CSSNumericBaseType::Angle));
static_assert(uint8_t(StyleNumericBaseType::Time) ==
              uint8_t(CSSNumericBaseType::Time));
static_assert(uint8_t(StyleNumericBaseType::Frequency) ==
              uint8_t(CSSNumericBaseType::Frequency));
static_assert(uint8_t(StyleNumericBaseType::Resolution) ==
              uint8_t(CSSNumericBaseType::Resolution));
static_assert(uint8_t(StyleNumericBaseType::Flex) ==
              uint8_t(CSSNumericBaseType::Flex));
static_assert(uint8_t(StyleNumericBaseType::Percent) ==
              uint8_t(CSSNumericBaseType::Percent));

}  // namespace

void ToCSSKeywordish(const CSSPerspectiveValue& aValue,
                     CSSKeywordish& aResult) {
  MOZ_DIAGNOSTIC_ASSERT(aValue.IsUTF8String() || aValue.IsCSSKeywordValue());

  if (aValue.IsUTF8String()) {
    aResult.SetAsUTF8String() = aValue.GetAsUTF8String();
    return;
  }

  aResult.SetAsCSSKeywordValue() = &aValue.GetAsCSSKeywordValue();
}

}  // namespace mozilla::dom
