/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "js/ForOfIterator.h"

#include "js/Exception.h"
#include "js/friend/ErrorMessages.h"  // js::GetErrorMessage, JSMSG_*
#include "vm/Interpreter.h"
#include "vm/Iteration.h"
#include "vm/JSContext.h"
#include "vm/JSObject.h"

#include "vm/JSContext-inl.h"
#include "vm/JSObject-inl.h"

using namespace js;
using JS::ForOfIterator;

bool ForOfIterator::init(HandleValue iterable,
                         NonIterableBehavior nonIterableBehavior) {
  JSContext* cx = cx_;
  RootedObject iterableObj(cx, ToObject(cx, iterable));
  if (!iterableObj) {
    return false;
  }

  MOZ_ASSERT(!isOptimizedArray_);

  if (IsArrayWithDefaultIterator<MustBePacked::No>(iterableObj, cx)) {
    // Array is optimizable.
    isOptimizedArray_ = true;
    arrayIndex_ = 0;
    iteratorOrArray_ = iterableObj;
    nextMethod_.setUndefined();
    return true;
  }

  RootedValue callee(cx);
  RootedId iteratorId(cx, PropertyKey::Symbol(cx->wellKnownSymbols().iterator));
  if (!GetProperty(cx, iterableObj, iterable, iteratorId, &callee)) {
    return false;
  }

  // If obj[@@iterator] is undefined and we were asked to allow non-iterables,
  // bail out now without setting iteratorOrArray_.  This will make
  // valueIsIterable(), which our caller should check, return false.
  if (nonIterableBehavior == AllowNonIterable && callee.isUndefined()) {
    return true;
  }

  // Throw if obj[@@iterator] isn't callable.
  // js::Invoke is about to check for this kind of error anyway, but it would
  // throw an inscrutable error message about |method| rather than this nice
  // one about |obj|.
  if (!callee.isObject() || !callee.toObject().isCallable()) {
    UniqueChars bytes =
        DecompileValueGenerator(cx, JSDVG_SEARCH_STACK, iterable, nullptr);
    if (!bytes) {
      return false;
    }
    JS_ReportErrorNumberUTF8(cx, GetErrorMessage, nullptr, JSMSG_NOT_ITERABLE,
                             bytes.get());
    return false;
  }

  RootedValue res(cx);
  if (!js::Call(cx, callee, iterable, &res)) {
    return false;
  }

  if (!res.isObject()) {
    return ThrowCheckIsObject(cx, CheckIsObjectKind::GetIterator);
  }

  RootedObject iteratorObj(cx, &res.toObject());
  if (!GetProperty(cx, iteratorObj, iteratorObj, cx->names().next, &res)) {
    return false;
  }

  iteratorOrArray_ = iteratorObj;
  nextMethod_ = res;
  return true;
}

inline bool ForOfIterator::nextFromOptimizedArray(MutableHandleValue vp,
                                                  bool* done) {
  MOZ_ASSERT(isOptimizedArray_);

  if (!CheckForInterrupt(cx_)) {
    return false;
  }

  ArrayObject* arr = &iteratorOrArray_->as<ArrayObject>();

  if (arrayIndex_ >= arr->length()) {
    vp.setUndefined();
    *done = true;
    return true;
  }
  *done = false;

  // Try to get array element via direct access.
  if (arrayIndex_ < arr->getDenseInitializedLength()) {
    vp.set(arr->getDenseElement(arrayIndex_));
    if (!vp.isMagic(JS_ELEMENTS_HOLE)) {
      ++arrayIndex_;
      return true;
    }
  }

  return GetElement(cx_, iteratorOrArray_, iteratorOrArray_, arrayIndex_++, vp);
}

bool ForOfIterator::next(MutableHandleValue vp, bool* done) {
  MOZ_ASSERT(iteratorOrArray_);
  if (isOptimizedArray_) {
    return nextFromOptimizedArray(vp, done);
  }

  RootedValue v(cx_);
  if (!js::Call(cx_, nextMethod_, iteratorOrArray_, &v)) {
    return false;
  }

  if (!v.isObject()) {
    return ThrowCheckIsObject(cx_, CheckIsObjectKind::IteratorNext);
  }

  RootedObject resultObj(cx_, &v.toObject());
  if (!GetProperty(cx_, resultObj, resultObj, cx_->names().done, &v)) {
    return false;
  }

  *done = ToBoolean(v);
  if (*done) {
    vp.setUndefined();
    return true;
  }

  return GetProperty(cx_, resultObj, resultObj, cx_->names().value, vp);
}

void ForOfIterator::closeThrow() {
  MOZ_ASSERT(iteratorOrArray_);

  if (isOptimizedArray_) {
    // |iteratorOrArray_| is the array object. IsArrayWithDefaultIterator
    // ensured %ArrayIteratorPrototype% does not have a |return| property, so
    // IteratorClose is a no-op.
    return;
  }

  // Don't handle uncatchable exceptions to match `for-of` bytecode behavior,
  // which also doesn't run IteratorClose when an interrupt was requested.
  if (!cx_->isExceptionPending()) {
    return;
  }

  // Save the current exception state. The destructor restores the saved
  // exception state, unless there's a new pending exception.
  JS::AutoSaveExceptionState savedExc(cx_);

  // Perform IteratorClose on the iterator.
  MOZ_ALWAYS_TRUE(
      CloseIterOperation(cx_, iteratorOrArray_, CompletionKind::Throw));

  // CloseIterOperation clears any pending exception.
  MOZ_ASSERT(!cx_->isExceptionPending());
}
