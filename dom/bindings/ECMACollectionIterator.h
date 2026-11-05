/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Iterators for WebIDL setlike/maplike interfaces backed by ECMASet/ECMAMap.
// Unlike IterableIterator (which uses logical indices), these go through a
// Cursor of the storage, matching ES Set/Map iterator semantics during
// mutation.

#ifndef mozilla_dom_ECMACollectionIterator_h
#define mozilla_dom_ECMACollectionIterator_h

#include "mozilla/dom/ECMACollectionMixin.h"
#include "mozilla/dom/IterableIterator.h"
#include "mozilla/dom/ToJSValue.h"
#include "nsAtom.h"

namespace mozilla::dom {

inline bool AtomStringConverter::ToJS(JSContext* aCx,
                                      const RefPtr<nsAtom>& aAtom,
                                      JS::MutableHandle<JS::Value> aResult) {
  MOZ_ASSERT(aAtom);
  return ToJSValue(aCx, nsDependentAtomString(aAtom), aResult);
}

namespace binding_detail {

// Converts a stored key of the setlike/maplike interface T to JS, through the
// KeyConverter of T if it has one.
template <typename T, typename K>
bool ECMAKeyToJSValue(JSContext* aCx, const K& aKey,
                      JS::MutableHandle<JS::Value> aResult) {
  if constexpr (requires { typename T::KeyConverter; }) {
    return T::KeyConverter::ToJS(aCx, aKey, aResult);
  } else {
    return ToJSValue(aCx, aKey, aResult);
  }
}

// The ECMASet or ECMAMap of the setlike or maplike interface T.
template <typename T>
struct ECMAStorageTraits {
  using Type = typename T::MaplikeStorage;
  static Type& Get(T& aObj) { return aObj.Maplike(); }
};
template <typename T>
  requires requires { typename T::SetlikeStorage; }
struct ECMAStorageTraits<T> {
  using Type = typename T::SetlikeStorage;
  static Type& Get(T& aObj) { return aObj.Setlike(); }
};

// Shared base for the setlike/maplike iterators. Holds the iterated object, the
// Cursor of its storage, and the cycle-collection plumbing. Subclasses only
// implement Next() for their element shape.
template <typename T>
class ECMACollectionIteratorBase : public IterableIteratorBase {
  using Storage = ECMAStorageTraits<T>;
  using Collection = typename Storage::Type;

 public:
  ECMACollectionIteratorBase(T* aIterableObj, IteratorType aIteratorType)
      : mIterableObj(aIterableObj),
        mCursor(std::in_place, Storage::Get(*aIterableObj)),
        mIteratorType(aIteratorType) {
    MOZ_ASSERT(mIterableObj);
  }

 protected:
  virtual ~ECMACollectionIteratorBase() = default;

  void UnlinkHelper() final {
    MarkDone();
    mIterableObj = nullptr;
  }

  void TraverseHelper(nsCycleCollectionTraversalCallback& cb) override {
    ECMACollectionIteratorBase<T>* tmp = this;
    NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mIterableObj);
  }

  // The entry the cursor reaches next, or nullptr once it is done.
  const typename Collection::EntryType* NextEntry() {
    if (!mCursor) {
      return nullptr;
    }
    const auto* entry = mCursor->Next();
    if (!entry) {
      MarkDone();
    }
    return entry;
  }

  void MarkDone() { mCursor.reset(); }

  static void ReturnDone(JSContext* aCx, JS::MutableHandle<JSObject*> aResult,
                         ErrorResult& aRv) {
    JS::Rooted<JS::Value> value(aCx, JS::UndefinedValue());
    iterator_utils::DictReturn(aCx, aResult, true, value, aRv);
  }

  RefPtr<T> mIterableObj;
  Maybe<typename Collection::Cursor> mCursor;
  IteratorType mIteratorType;
};

// Iterator for setlike interfaces backed by an ECMASet.
// T is the WebIDL interface type.
// The interface must derive from SetlikeMixin.
template <typename T>
class ECMASetIterator : public ECMACollectionIteratorBase<T> {
  using Base = ECMACollectionIteratorBase<T>;

 public:
  using IteratorType = typename Base::IteratorType;
  using Base::Base;

  void Next(JSContext* aCx, JS::MutableHandle<JSObject*> aResult,
            ErrorResult& aRv) {
    const auto* entry = this->NextEntry();
    if (!entry) {
      this->ReturnDone(aCx, aResult, aRv);
      return;
    }

    JS::Rooted<JS::Value> value(aCx);
    if (!ECMAKeyToJSValue<T>(aCx, entry->mValue, &value)) {
      aRv.NoteJSContextException(aCx);
      return;
    }

    switch (this->mIteratorType) {
      case IteratorType::Keys:
      case IteratorType::Values:
        iterator_utils::DictReturn(aCx, aResult, false, value, aRv);
        return;
      case IteratorType::Entries:
        iterator_utils::KeyAndValueReturn(aCx, value, value, aResult, aRv);
        return;
      default:
        MOZ_CRASH("Invalid iterator type");
    }
  }
};

// Iterator for maplike interfaces backed by an ECMAMap.
// T is the WebIDL interface type.
// The interface must derive from MaplikeMixin.
template <typename T>
class ECMAMapIterator : public ECMACollectionIteratorBase<T> {
  using Base = ECMACollectionIteratorBase<T>;

 public:
  using IteratorType = typename Base::IteratorType;
  using Base::Base;

  void Next(JSContext* aCx, JS::MutableHandle<JSObject*> aResult,
            ErrorResult& aRv) {
    const auto* entry = this->NextEntry();
    if (!entry) {
      this->ReturnDone(aCx, aResult, aRv);
      return;
    }

    // entry is only valid until the map is mutated, which converting to JS
    // does not do.
    JS::Rooted<JS::Value> key(aCx);
    JS::Rooted<JS::Value> value(aCx);
    if (this->mIteratorType != IteratorType::Values &&
        !ECMAKeyToJSValue<T>(aCx, entry->mKey, &key)) {
      aRv.NoteJSContextException(aCx);
      return;
    }
    if (this->mIteratorType != IteratorType::Keys &&
        !ToJSValue(aCx, entry->mValue, &value)) {
      aRv.NoteJSContextException(aCx);
      return;
    }

    switch (this->mIteratorType) {
      case IteratorType::Keys:
        iterator_utils::DictReturn(aCx, aResult, false, key, aRv);
        return;
      case IteratorType::Values:
        iterator_utils::DictReturn(aCx, aResult, false, value, aRv);
        return;
      case IteratorType::Entries:
        iterator_utils::KeyAndValueReturn(aCx, key, value, aResult, aRv);
        return;
      default:
        MOZ_CRASH("Invalid iterator type");
    }
  }
};

// Wrappable versions that add WrapObject for JS exposure.
template <typename T, bool (*WrapFunc)(JSContext*, ECMASetIterator<T>*,
                                       JS::MutableHandle<JSObject*>)>
class WrappableECMASetIterator final : public ECMASetIterator<T> {
 public:
  using ECMASetIterator<T>::ECMASetIterator;

  bool WrapObject(JSContext* aCx, JS::Handle<JSObject*> aGivenProto,
                  JS::MutableHandle<JSObject*> aObj) {
    MOZ_ASSERT(!aGivenProto);
    return (*WrapFunc)(aCx, this, aObj);
  }
};

template <typename T, bool (*WrapFunc)(JSContext*, ECMAMapIterator<T>*,
                                       JS::MutableHandle<JSObject*>)>
class WrappableECMAMapIterator final : public ECMAMapIterator<T> {
 public:
  using ECMAMapIterator<T>::ECMAMapIterator;

  bool WrapObject(JSContext* aCx, JS::Handle<JSObject*> aGivenProto,
                  JS::MutableHandle<JSObject*> aObj) {
    MOZ_ASSERT(!aGivenProto);
    return (*WrapFunc)(aCx, this, aObj);
  }
};

}  // namespace binding_detail
}  // namespace mozilla::dom

#endif  // mozilla_dom_ECMACollectionIterator_h
