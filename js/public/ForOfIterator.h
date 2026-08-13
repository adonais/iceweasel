/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A convenience class that makes it easy to perform the operations of a for-of
 * loop.
 */

#ifndef js_ForOfIterator_h
#define js_ForOfIterator_h

#include "mozilla/Attributes.h"  // MOZ_STACK_CLASS

#include <stdint.h>  // UINT32_MAX, uint32_t

#include "jstypes.h"  // JS_PUBLIC_API

#include "js/RootingAPI.h"  // JS::{Handle,Rooted}
#include "js/Value.h"       // JS::Value, JS::{,Mutable}Handle<JS::Value>

struct JS_PUBLIC_API JSContext;
class JS_PUBLIC_API JSObject;

namespace JS {

/**
 * A convenience class for imitating a JS for-of loop. Typical usage:
 *
 *     JS::ForOfIterator it(cx);
 *     if (!it.init(iterable)) {
 *       return false;
 *     }
 *     JS::Rooted<JS::Value> val(cx);
 *     while (true) {
 *       bool done;
 *       if (!it.next(&val, &done)) {
 *         return false;
 *       }
 *       if (done) {
 *         break;
 *       }
 *       if (!DoStuff(cx, val)) {
 *         return false;
 *       }
 *     }
 */
class MOZ_STACK_CLASS JS_PUBLIC_API ForOfIterator {
 protected:
  JSContext* cx_;

  // Use realm fuses (see `IsArrayWithDefaultIterator` in vm/Iteration.cpp) to
  // try to optimize iteration across arrays.
  //
  //  Case 1: Regular Iteration
  //      isOptimizedArray_ - false.
  //      iteratorOrArray_ - pointer to the iterator object.
  //      nextMethod_ - value of |iterator|.next.
  //      arrayIndex_ - unused.
  //
  //  Case 2: Optimized Array Iteration
  //      isOptimizedArray_ - true.
  //      iteratorOrArray_ - pointer to the array object.
  //      nextMethod_ - the undefined value.
  //      arrayIndex_ - current position in array.
  //
  // The cases are distinguished by |isOptimizedArray_|. In the optimized-array
  // case, |iteratorOrArray_| is the array itself.
  Rooted<JSObject*> iteratorOrArray_;
  Rooted<Value> nextMethod_;

  uint32_t arrayIndex_ = 0;
  bool isOptimizedArray_ = false;

  ForOfIterator(const ForOfIterator&) = delete;
  ForOfIterator& operator=(const ForOfIterator&) = delete;

 public:
  explicit ForOfIterator(JSContext* cx)
      : cx_(cx), iteratorOrArray_(cx), nextMethod_(cx) {}

  enum NonIterableBehavior { ThrowOnNonIterable, AllowNonIterable };

  /**
   * Initialize the iterator.  If AllowNonIterable is passed then if getting
   * the @@iterator property from iterable returns undefined init() will just
   * return true instead of throwing.  Callers must then check
   * valueIsIterable() before continuing with the iteration.
   */
  [[nodiscard]] bool init(
      Handle<Value> iterable,
      NonIterableBehavior nonIterableBehavior = ThrowOnNonIterable);

  /**
   * Get the next value from the iterator.  If false *done is true
   * after this call, do not examine val.
   */
  [[nodiscard]] bool next(MutableHandle<Value> val, bool* done);

  /**
   * Close the iterator.
   * For the case that completion type is throw.
   */
  void closeThrow();

  /**
   * If initialized with throwOnNonCallable = false, check whether
   * the value is iterable.
   */
  bool valueIsIterable() const { return iteratorOrArray_ != nullptr; }

 private:
  inline bool nextFromOptimizedArray(MutableHandle<Value> val, bool* done);
};

}  // namespace JS

#endif  // js_ForOfIterator_h
