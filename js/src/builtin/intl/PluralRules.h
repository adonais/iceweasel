/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef builtin_intl_PluralRules_h
#define builtin_intl_PluralRules_h

#include <stddef.h>
#include <stdint.h>

#include "js/Class.h"
#include "js/TypeDecls.h"
#include "js/Value.h"
#include "vm/NativeObject.h"

namespace mozilla::intl {
class PluralRules;
}

namespace js::intl {

struct PluralRulesOptions;

class PluralRulesObject : public NativeObject {
 public:
  static const JSClass class_;
  static const JSClass& protoClass_;

  JS_DEFINE_TYPED_SLOT(0, LOCALE_SLOT, Object, String, Undefined);
  JS_DEFINE_TYPED_SLOT(1, OPTIONS_SLOT, Double, Undefined);
  JS_DEFINE_TYPED_SLOT(2, PLURAL_RULES_SLOT, Private, Undefined);
  static constexpr uint32_t SLOT_COUNT = 3;

  // Estimated memory use for UPluralRules (see IcuMemoryUsage).
  // Includes usage for UNumberFormat and UNumberRangeFormatter since our
  // PluralRules implementations contains a NumberFormat and a NumberRangeFormat
  // object.
  static constexpr size_t UPluralRulesEstimatedMemoryUse = 5736;

  bool isLocaleResolved() const {
    return getFixedSlotTyped(LOCALE_SLOT).isString();
  }

  JSObject* getRequestedLocales() const {
    const auto& slot = getFixedSlotTyped(LOCALE_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return &slot.toObject();
  }

  void setRequestedLocales(JSObject* requestedLocales) {
    setFixedSlotTyped(LOCALE_SLOT, JS::ObjectValue(*requestedLocales));
  }

  JSLinearString* getLocale() const {
    const auto& slot = getFixedSlotTyped(LOCALE_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return &slot.toString()->asLinear();
  }

  void setLocale(JSLinearString* locale) {
    setFixedSlotTyped(LOCALE_SLOT, JS::StringValue(locale));
  }

  PluralRulesOptions getOptions() const;

  void setOptions(const PluralRulesOptions& options);

  mozilla::intl::PluralRules* getPluralRules() const {
    const auto& slot = getFixedSlotTyped(PLURAL_RULES_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return static_cast<mozilla::intl::PluralRules*>(slot.toPrivate());
  }

  void setPluralRules(mozilla::intl::PluralRules* pluralRules) {
    setFixedSlotTyped(PLURAL_RULES_SLOT, PrivateValue(pluralRules));
  }

 private:
  static const JSClassOps classOps_;
  static const ClassSpec classSpec_;

  static void finalize(JS::GCContext* gcx, JSObject* obj);
};

}  // namespace js::intl

#endif /* builtin_intl_PluralRules_h */
