/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef builtin_intl_Locale_h
#define builtin_intl_Locale_h

#include <stdint.h>

#include "js/Class.h"
#include "vm/NativeObject.h"
#include "vm/StringType.h"

namespace js::intl {

class LocaleObject : public NativeObject {
 public:
  static const JSClass class_;
  static const JSClass protoClass_;

  JS_DEFINE_TYPED_SLOT(0, LANGUAGE_TAG_SLOT, String);
  JS_DEFINE_TYPED_SLOT(1, BASENAME_SLOT, String);
  JS_DEFINE_TYPED_SLOT(2, UNICODE_EXTENSION_SLOT, String, Undefined);
  static constexpr uint32_t SLOT_COUNT = 3;

  void initialize(JSLinearString* languageTag, JSLinearString* baseName,
                  JSLinearString* unicodeExtension) {
    initFixedSlotTyped(LANGUAGE_TAG_SLOT, JS::StringValue(languageTag));
    initFixedSlotTyped(BASENAME_SLOT, JS::StringValue(baseName));
    if (unicodeExtension) {
      initFixedSlotTyped(UNICODE_EXTENSION_SLOT,
                         JS::StringValue(unicodeExtension));
    } else {
      MOZ_ASSERT(getFixedSlotTyped(UNICODE_EXTENSION_SLOT).isUndefined());
    }
  }

  /**
   * Returns the complete language tag, including any extensions and privateuse
   * subtags.
   */
  JSLinearString* getLanguageTag() const {
    return &getFixedSlotTyped(LANGUAGE_TAG_SLOT).toString()->asLinear();
  }

  /**
   * Returns the basename subtags, i.e. excluding any extensions and privateuse
   * subtags.
   */
  JSLinearString* getBaseName() const {
    return &getFixedSlotTyped(BASENAME_SLOT).toString()->asLinear();
  }

  /**
   * Returns Unicode locale extension subtag or `nullptr` if no Unicode
   * extension sequence is present.
   */
  JSLinearString* getUnicodeExtension() const {
    const auto& slot = getFixedSlotTyped(UNICODE_EXTENSION_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return &slot.toString()->asLinear();
  }

 private:
  static const ClassSpec classSpec_;
};

}  // namespace js::intl

#endif /* builtin_intl_Locale_h */
