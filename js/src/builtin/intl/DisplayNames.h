/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef builtin_intl_DisplayNames_h
#define builtin_intl_DisplayNames_h

#include <stddef.h>
#include <stdint.h>

#include "jstypes.h"
#include "NamespaceImports.h"

#include "js/Class.h"
#include "js/TypeDecls.h"
#include "js/Value.h"
#include "vm/NativeObject.h"
#include "vm/StringType.h"

namespace mozilla::intl {
class DisplayNames;
}

namespace js {
struct ClassSpec;
}

namespace js::intl {

struct DisplayNamesOptions;

class DisplayNamesObject : public NativeObject {
 public:
  static const JSClass class_;
  static const JSClass& protoClass_;

  JS_DEFINE_TYPED_SLOT(0, LOCALE, Object, String, Undefined);
  JS_DEFINE_TYPED_SLOT(1, CALENDAR, String, Undefined);
  JS_DEFINE_TYPED_SLOT(2, OPTIONS, Int32, Undefined);
  JS_DEFINE_TYPED_SLOT(3, LOCALE_DISPLAY_NAMES_SLOT, Private, Undefined);
  static constexpr uint32_t SLOT_COUNT = 4;

  // Estimated memory use for ULocaleDisplayNames (see IcuMemoryUsage).
  static constexpr size_t EstimatedMemoryUse = 1238;

  bool isLocaleResolved() const { return getFixedSlotTyped(LOCALE).isString(); }

  JSObject* getRequestedLocales() const {
    const auto& slot = getFixedSlotTyped(LOCALE);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return &slot.toObject();
  }

  void setRequestedLocales(JSObject* requestedLocales) {
    setFixedSlotTyped(LOCALE, ObjectValue(*requestedLocales));
  }

  JSLinearString* getLocale() const {
    const auto& slot = getFixedSlotTyped(LOCALE);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return &slot.toString()->asLinear();
  }

  void setLocale(JSLinearString* locale) {
    setFixedSlotTyped(LOCALE, StringValue(locale));
  }

  JSLinearString* getCalendar() const {
    const auto& slot = getFixedSlotTyped(CALENDAR);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return &slot.toString()->asLinear();
  }

  void setCalendar(JSLinearString* calendar) {
    setFixedSlotTyped(CALENDAR, StringValue(calendar));
  }

  DisplayNamesOptions getOptions() const;

  void setOptions(const DisplayNamesOptions& options);

  mozilla::intl::DisplayNames* getDisplayNames() const {
    const auto& slot = getFixedSlotTyped(LOCALE_DISPLAY_NAMES_SLOT);
    if (slot.isUndefined()) {
      return nullptr;
    }
    return static_cast<mozilla::intl::DisplayNames*>(slot.toPrivate());
  }

  void setDisplayNames(mozilla::intl::DisplayNames* displayNames) {
    setFixedSlotTyped(LOCALE_DISPLAY_NAMES_SLOT, PrivateValue(displayNames));
  }

 private:
  static const JSClassOps classOps_;
  static const ClassSpec classSpec_;

  static void finalize(JS::GCContext* gcx, JSObject* obj);
};

}  // namespace js::intl

#endif /* builtin_intl_DisplayNames_h */
