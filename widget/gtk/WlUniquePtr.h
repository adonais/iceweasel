/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef WlUniquePtr_h_
#define WlUniquePtr_h_

// Provides WlUniquePtr to wayland classes.
#include "mozilla/UniquePtr.h"
#include "nsWaylandDisplay.h"

namespace mozilla {

struct WDeleter {
  constexpr WDeleter() = default;
  void operator()(wl_data_device* aPtr) const { wl_data_device_destroy(aPtr); }
  void operator()(zwp_primary_selection_device_v1* aPtr) const {
    zwp_primary_selection_device_v1_destroy(aPtr);
  }
  void operator()(gtk_primary_selection_device* aPtr) const {
    gtk_primary_selection_device_destroy(aPtr);
  }
};

template <typename T>
using WlUniquePtr = UniquePtr<T, WDeleter>;

}  // namespace mozilla

#endif
