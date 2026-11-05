/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsIWeakReferenceUtils_h_
#define nsIWeakReferenceUtils_h_

#include <type_traits>

#include "nsCOMPtr.h"
#include "nsIWeakReference.h"

typedef nsCOMPtr<nsIWeakReference> nsWeakPtr;

/**
 *
 */

// a type-safe shortcut for calling the |QueryReferent()| member function
// T must inherit from nsIWeakReference, but the cast may be ambiguous.
template <class T, class DestinationType>
inline nsresult CallQueryReferent(T* aSource, DestinationType** aDestination) {
  MOZ_ASSERT(aSource, "null parameter");
  MOZ_ASSERT(aDestination, "null parameter");

  return aSource->QueryReferent(NS_GET_IID(DestinationType),
                                reinterpret_cast<void**>(aDestination));
}

inline const nsQueryReferent do_QueryReferent(nsIWeakReference* aRawPtr,
                                              nsresult* aError = nullptr) {
  return nsQueryReferent(aRawPtr, aError);
}

/**
 * Deprecated, use |do_GetWeakReference| instead.
 */
extern nsIWeakReference* NS_GetWeakReference(nsISupports*,
                                             nsresult* aResult = nullptr);
extern nsIWeakReference* NS_GetWeakReference(nsISupportsWeakReference*,
                                             nsresult* aResult = nullptr);
namespace mozilla::detail {
template <class T>
concept ProvidesWeakReferenceTearoff =
    requires { T::kHasWeakReferenceTearoff; } && T::kHasWeakReferenceTearoff;

/**
 * Helper function to prevent calls to do_GetWeakReference that are guaranteed
 * to always return null, as they cannot implement nsISupportsWeakReference.
 */
template <class T>
inline already_AddRefed<nsIWeakReference> GetCheckedWeakReference(
    T* aRawPtr, nsresult* aError) {
  static_assert(std::is_base_of_v<nsISupports, T>,
                "do_GetWeakReference() requires an nsISupports object");
  static_assert(!std::is_base_of_v<nsIWeakReference, T>,
                "do_GetWeakReference() on a weak reference itself is very "
                "likely a programmer error");
  static_assert(!std::is_final_v<T> ||
                    std::is_base_of_v<nsISupportsWeakReference, T> ||
                    ProvidesWeakReferenceTearoff<T>,
                "do_GetWeakReference() on a final class that does not "
                "implement nsISupportsWeakReference always returns null; "
                "derive from nsSupportsWeakReference or keep a strong ref");
  return dont_AddRef(NS_GetWeakReference(aRawPtr, aError));
}
}  // namespace mozilla::detail

/**
 * |do_GetWeakReference| is a convenience function that bundles up all the work
 * needed to get a weak reference to an arbitrary object, i.e., the
 * |QueryInterface|, test, and call through to |GetWeakReference|, and put it
 * into your |nsCOMPtr|. It is specifically designed to cooperate with
 * |nsCOMPtr| (or |nsWeakPtr|) like so: |nsWeakPtr myWeakPtr =
 * do_GetWeakReference(aPtr);|.
 */
template <class T>
inline already_AddRefed<nsIWeakReference> do_GetWeakReference(
    T* aRawPtr, nsresult* aError = nullptr) {
  return mozilla::detail::GetCheckedWeakReference(aRawPtr, aError);
}

template <class T>
inline already_AddRefed<nsIWeakReference> do_GetWeakReference(
    const RefPtr<T>& aPtr, nsresult* aError = nullptr) {
  return mozilla::detail::GetCheckedWeakReference(aPtr.get(), aError);
}

template <class T>
inline already_AddRefed<nsIWeakReference> do_GetWeakReference(
    const nsCOMPtr<T>& aPtr, nsresult* aError = nullptr) {
  return mozilla::detail::GetCheckedWeakReference(aPtr.get(), aError);
}

#endif
