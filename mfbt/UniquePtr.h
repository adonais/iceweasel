/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Smart pointer managing sole ownership of a resource. */

#ifndef mozilla_UniquePtr_h
#define mozilla_UniquePtr_h

#include <memory>
#include <utility>

#include "mozilla/Attributes.h"

namespace mozilla {

template <typename T, class D = std::default_delete<T>>
using UniquePtr = std::unique_ptr<T, D>;

}  // namespace mozilla

namespace mozilla {

namespace detail {

template <typename T>
struct UniqueSelector {
  typedef UniquePtr<T> SingleObject;
};

template <typename T>
struct UniqueSelector<T[]> {
  typedef UniquePtr<T[]> UnknownBound;
};

template <typename T, decltype(sizeof(int)) N>
struct UniqueSelector<T[N]> {
  typedef UniquePtr<T[N]> KnownBound;
};

}  // namespace detail

/**
 * WrapUnique is a helper function to transfer ownership from a raw pointer
 * into a UniquePtr<T>. It can only be used with a single non-array type.
 *
 * It is generally used this way:
 *
 *   auto p = WrapUnique(new char);
 *
 * It can be used when std::make_unique is not usable, for example, when the
 * constructor you are using is private, or you want to use aggregate
 * initialization.
 */

template <typename T>
typename detail::UniqueSelector<T>::SingleObject WrapUnique(T* aPtr) {
  return UniquePtr<T>(aPtr);
}

}  // namespace mozilla

/**
TempPtrToSetter(UniquePtr<T>*) -> T**-ish
TempPtrToSetter(std::unique_ptr<T>*) -> T**-ish

Make a temporary class to support assigning to UniquePtr/unique_ptr via passing
a pointer to the callee.

Often, APIs will be shaped like this trivial example:
```
nsresult Foo::NewChildBar(Bar** out) {
  if (!IsOk()) return NS_ERROR_FAILURE;
  *out = new Bar(this);
  return NS_OK;
}
```

In order to make this work with unique ptrs, it's often either risky or
overwrought:
```
Bar* bar = nullptr;
const auto cleanup = MakeScopeExit([&]() {
  if (bar) {
    delete bar;
  }
});
if (FAILED(foo->NewChildBar(&bar)) {
  // handle it
}
```

```
UniquePtr<Bar> bar;
{
  Bar* raw = nullptr;
  const auto res = foo->NewChildBar(&bar);
  bar.reset(raw);
  if (FAILED(res) {
    // handle it
  }
}
```
TempPtrToSettable is a shorthand for the latter approach, allowing something
cleaner but also safe:

```
UniquePtr<Bar> bar;
if (FAILED(foo->NewChildBar(TempPtrToSetter(&bar))) {
  // handle it
}
```
*/

namespace mozilla {
namespace detail {

template <class T, class UniquePtrT>
class MOZ_TEMPORARY_CLASS TempPtrToSetterT final {
 private:
  UniquePtrT* const mDest;
  T* mNewVal;

 public:
  explicit TempPtrToSetterT(UniquePtrT* dest)
      : mDest(dest), mNewVal(mDest->get()) {}

  operator T**() { return &mNewVal; }

  ~TempPtrToSetterT() {
    if (mDest->get() != mNewVal) {
      mDest->reset(mNewVal);
    }
  }
};

}  // namespace detail

template <class T, class Deleter>
auto TempPtrToSetter(UniquePtr<T, Deleter>* const p) {
  return detail::TempPtrToSetterT<T, UniquePtr<T, Deleter>>{p};
}

}  // namespace mozilla

namespace std {

// No operator<, operator>, operator<=, operator>= for now because simplicity.

template <typename T, class D>
bool operator==(const mozilla::UniquePtr<T, D>& aX, const T* aY) {
  return aX.get() == aY;
}

template <typename T, class D>
bool operator==(const T* aY, const mozilla::UniquePtr<T, D>& aX) {
  return aY == aX.get();
}

template <typename T, class D>
bool operator!=(const mozilla::UniquePtr<T, D>& aX, const T* aY) {
  return aX.get() != aY;
}

template <typename T, class D>
bool operator!=(const T* aY, const mozilla::UniquePtr<T, D>& aX) {
  return aY != aX.get();
}
}  // namespace std

#endif /* mozilla_UniquePtr_h */
