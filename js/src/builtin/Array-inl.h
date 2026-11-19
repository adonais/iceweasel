/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef builtin_Array_inl_h
#define builtin_Array_inl_h

#include "builtin/Array.h"

#include "vm/ArrayObject.h"
#include "vm/GlobalObject.h"
#include "vm/JSObject.h"
#include "vm/Realm.h"

#include "vm/ArgumentsObject-inl.h"
#include "vm/JSObject-inl.h"
#include "vm/ObjectOperations-inl.h"

namespace js {

inline bool GetElement(JSContext* cx, HandleObject obj, uint32_t index,
                       MutableHandleValue vp) {
  if (obj->is<NativeObject>() &&
      index < obj->as<NativeObject>().getDenseInitializedLength()) {
    vp.set(obj->as<NativeObject>().getDenseElement(index));
    if (!vp.isMagic(JS_ELEMENTS_HOLE)) {
      return true;
    }
  }

  if (obj->is<ArgumentsObject>()) {
    if (obj->as<ArgumentsObject>().maybeGetElement(index, vp)) {
      return true;
    }
  }

  return GetElement(cx, obj, obj, index, vp);
}

/*
 * Whether obj may have indexed properties anywhere besides its dense elements.
 * This includes other indexed properties in its shape hierarchy, and indexed
 * properties or elements along its prototype chain.
 */
inline bool ObjectMayHaveExtraIndexedProperties(JSObject* obj) {
  // Inline fast path for arrays with Array.prototype as proto.
  if (obj->is<ArrayObject>() && !obj->as<ArrayObject>().isIndexed()) {
    JSObject* proto = obj->staticPrototype();
    if (!proto) {
      return false;
    }
    Realm* realm = obj->nonCCWRealm();
    if (proto == obj->nonCCWGlobal().maybeGetPrototype(JSProto_Array) &&
        realm->realmFuses.arrayProtoHasNoIndexedPropsFuse.intact()) {
      return false;
    }
  }
  return ObjectMayHaveExtraIndexedPropertiesSlow(obj);
}

}  // namespace js

#endif  // builtin_Array_inl_h
