/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_ECMACollectionMixin_h
#define mozilla_dom_ECMACollectionMixin_h

#include <concepts>

#include "js/RootingAPI.h"
#include "mozilla/Attributes.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/Maybe.h"
#include "mozilla/StaticAnalysisFunctions.h"
#include "mozilla/dom/ECMACollections.h"
#include "nsAtom.h"

struct JSContext;

namespace mozilla::dom {

template <typename T>
using ECMAArg = typename binding_detail::ECMAArgTraits<T>::Type;

// Concept enforcing the converter contract for SetlikeMixin and MaplikeMixin.
// A type C satisfies ConverterFor<T> if it provides:
//   - ExternalType: the type callers use to key in (e.g. nsAString)
//   - ToStorage(ExternalType) -> Maybe<T>
//
// ToJS(JSContext*, T, JS::MutableHandle<JS::Value>) -> bool is intentionally
// not checked here: JS::MutableHandle cannot be used as a requires-expression
// parameter (clang rejects it), and ToJS is validated at instantiation time in
// ECMACollectionIterator.h where it is actually called.
template <typename C, typename T>
concept ConverterFor = requires(const typename C::ExternalType& ext) {
  typename C::ExternalType;
  { C::ToStorage(ext) } -> std::same_as<Maybe<T>>;
};

// The mutating operations are MOZ_CAN_RUN_SCRIPT because implementations may
// notify layout of the change. C++ callers that only need the storage updated
// should go through Setlike() instead.
template <typename T, typename Converter = void>
class SetlikeMixin {
 public:
  using SetlikeStorage = ECMASet<T>;

  SetlikeStorage& Setlike() { return mSetData; }
  const SetlikeStorage& Setlike() const { return mSetData; }

  // The size getter of the bindings.
  uint32_t Size() const { return mSetData.Size(); }

  // Inserts aKey, doing nothing if it is already present. Overrides that can
  // reject the insertion report the reason through aRv, in which case the
  // storage is left unchanged.
  MOZ_CAN_RUN_SCRIPT virtual void Add(ECMAArg<T> aKey, ErrorResult& aRv) {
    mSetData.Add(aKey);
  }
  // Returns true if aKey existed and was removed, false if not found.
  MOZ_CAN_RUN_SCRIPT virtual bool Delete(ECMAArg<T> aKey) {
    return mSetData.Delete(aKey);
  }
  MOZ_CAN_RUN_SCRIPT virtual void Clear() { mSetData.Clear(); }
  // Returns true if aKey is present.
  virtual bool Has(ECMAArg<T> aKey) { return mSetData.Has(aKey); }

 protected:
  SetlikeStorage mSetData;
};

// Overriding a virtual hides the external-type overload of the same name;
// re-expose it with `using SetlikeMixin::Name;`. Names not overridden need
// nothing.
template <typename T, ConverterFor<T> Converter>
class SetlikeMixin<T, Converter> {
  using ExternalType = typename Converter::ExternalType;
  using ArgTraits = binding_detail::ECMAArgTraits<T>;

 public:
  using SetlikeStorage = ECMASet<T>;
  // The bindings convert stored keys to JS through this.
  using KeyConverter = Converter;

  SetlikeStorage& Setlike() { return mSetData; }
  const SetlikeStorage& Setlike() const { return mSetData; }

  // The size getter of the bindings.
  uint32_t Size() const { return mSetData.Size(); }

  // Non-virtual: converts external type to stored type, then dispatches to the
  // virtual stored-type overload so implementations only need one override.
  // native owns the converted key for the duration of the call, which is what
  // MOZ_KnownLive asserts here and in the other converting overloads.
  MOZ_CAN_RUN_SCRIPT void Add(const ExternalType& aKey, ErrorResult& aRv) {
    auto native = Converter::ToStorage(aKey);
    if (native) {
      Add(MOZ_KnownLive(ArgTraits::FromStored(*native)), aRv);
    }
  }
  MOZ_CAN_RUN_SCRIPT bool Delete(const ExternalType& aKey) {
    auto native = Converter::ToStorage(aKey);
    return native && Delete(MOZ_KnownLive(ArgTraits::FromStored(*native)));
  }
  bool Has(const ExternalType& aKey) {
    auto native = Converter::ToStorage(aKey);
    return native.isSome() && Has(ArgTraits::FromStored(*native));
  }

  // Virtual stored-type overloads — implementations override these.
  // Add inserts aKey, doing nothing if it is already present. Overrides that
  // can reject the insertion report the reason through aRv, in which case the
  // storage is left unchanged.
  MOZ_CAN_RUN_SCRIPT virtual void Add(ECMAArg<T> aKey, ErrorResult& aRv) {
    mSetData.Add(aKey);
  }
  // Returns true if aKey existed and was removed, false if not found.
  MOZ_CAN_RUN_SCRIPT virtual bool Delete(ECMAArg<T> aKey) {
    return mSetData.Delete(aKey);
  }
  MOZ_CAN_RUN_SCRIPT virtual void Clear() { mSetData.Clear(); }
  // Returns true if aKey is present.
  virtual bool Has(ECMAArg<T> aKey) { return mSetData.Has(aKey); }

 protected:
  SetlikeStorage mSetData;
};

// The mutating operations are MOZ_CAN_RUN_SCRIPT because implementations may
// notify layout of the change. C++ callers that only need the storage updated
// should go through Maplike() instead.
template <typename K, typename V, typename Converter = void>
class MaplikeMixin {
  using GetResult = typename binding_detail::ECMAMapValueTraits<V>::GetResult;

 public:
  using MaplikeStorage = ECMAMap<K, V>;

  MaplikeStorage& Maplike() { return mMapData; }
  const MaplikeStorage& Maplike() const { return mMapData; }

  // The size getter of the bindings.
  uint32_t Size() const { return mMapData.Size(); }

  // Maps aKey to aValue, updating an existing entry in place. Overrides that
  // can reject the entry report the reason through aRv, in which case the
  // storage is left unchanged.
  MOZ_CAN_RUN_SCRIPT virtual void Set(ECMAArg<K> aKey, ECMAArg<V> aValue,
                                      ErrorResult& aRv) {
    mMapData.Set(aKey, aValue);
  }
  // Returns true if aKey existed and was removed, false if not found.
  MOZ_CAN_RUN_SCRIPT virtual bool Delete(ECMAArg<K> aKey) {
    return mMapData.Delete(aKey);
  }
  MOZ_CAN_RUN_SCRIPT virtual void Clear() { mMapData.Clear(); }
  // Returns true if aKey is present.
  virtual bool Has(ECMAArg<K> aKey) { return mMapData.Has(aKey); }
  // Returns a pointer to the value for aKey, or nullptr if not found.
  virtual GetResult Get(ECMAArg<K> aKey) { return mMapData.Get(aKey); }

 protected:
  MaplikeStorage mMapData;
};

// Overriding a virtual hides the external-key overload of the same name;
// re-expose it with `using MaplikeMixin::Name;`. Names not overridden need
// nothing.
template <typename K, typename V, ConverterFor<K> Converter>
class MaplikeMixin<K, V, Converter> {
  using ExternalKeyType = typename Converter::ExternalType;
  using ArgTraits = binding_detail::ECMAArgTraits<K>;
  using GetResult = typename binding_detail::ECMAMapValueTraits<V>::GetResult;

 public:
  using MaplikeStorage = ECMAMap<K, V>;
  // The bindings convert stored keys to JS through this.
  using KeyConverter = Converter;

  MaplikeStorage& Maplike() { return mMapData; }
  const MaplikeStorage& Maplike() const { return mMapData; }

  // The size getter of the bindings.
  uint32_t Size() const { return mMapData.Size(); }

  // Non-virtual: converts external key to stored key, dispatches to virtual.
  // native owns the converted key for the duration of the call, which is what
  // MOZ_KnownLive asserts here and in Delete below.
  MOZ_CAN_RUN_SCRIPT void Set(const ExternalKeyType& aKey, ECMAArg<V> aValue,
                              ErrorResult& aRv) {
    auto native = Converter::ToStorage(aKey);
    if (native) {
      Set(MOZ_KnownLive(ArgTraits::FromStored(*native)), aValue, aRv);
    }
  }
  MOZ_CAN_RUN_SCRIPT bool Delete(const ExternalKeyType& aKey) {
    auto native = Converter::ToStorage(aKey);
    return native && Delete(MOZ_KnownLive(ArgTraits::FromStored(*native)));
  }
  bool Has(const ExternalKeyType& aKey) {
    auto native = Converter::ToStorage(aKey);
    return native.isSome() && Has(ArgTraits::FromStored(*native));
  }
  GetResult Get(const ExternalKeyType& aKey) {
    auto native = Converter::ToStorage(aKey);
    if (!native) {
      return nullptr;
    }
    return Get(ArgTraits::FromStored(*native));
  }

  // Virtual stored-key overloads — implementations override these.
  // Set maps aKey to aValue, updating an existing entry in place. Overrides
  // that can reject the entry report the reason through aRv, in which case the
  // storage is left unchanged.
  MOZ_CAN_RUN_SCRIPT virtual void Set(ECMAArg<K> aKey, ECMAArg<V> aValue,
                                      ErrorResult& aRv) {
    mMapData.Set(aKey, aValue);
  }
  // Returns true if aKey existed and was removed, false if not found.
  MOZ_CAN_RUN_SCRIPT virtual bool Delete(ECMAArg<K> aKey) {
    return mMapData.Delete(aKey);
  }
  MOZ_CAN_RUN_SCRIPT virtual void Clear() { mMapData.Clear(); }
  // Returns true if aKey is present.
  virtual bool Has(ECMAArg<K> aKey) { return mMapData.Has(aKey); }
  // Returns a pointer to the value for aKey, or nullptr if not found.
  virtual GetResult Get(ECMAArg<K> aKey) { return mMapData.Get(aKey); }

 protected:
  MaplikeStorage mMapData;
};

// Converter for setlike<DOMString>/maplike<DOMString, ...> interfaces that
// store nsAtom keys internally. ToJS is defined inline in
// ECMACollectionIterator.h, which has the necessary ToJSValue.h include.
struct AtomStringConverter {
  using ExternalType = nsAString;

  static Maybe<RefPtr<nsAtom>> ToStorage(const nsAString& aStr) {
    return Some(NS_AtomizeMainThread(aStr));
  }
  static bool ToJS(JSContext* aCx, const RefPtr<nsAtom>& aAtom,
                   JS::MutableHandle<JS::Value> aResult);
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_ECMACollectionMixin_h
