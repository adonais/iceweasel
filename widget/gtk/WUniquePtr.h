/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef WUniquePtr_h_
#define WUniquePtr_h_

// Provides WUniquePtr to wayland classes.

#include "mozilla/UniquePtr.h"
#include "nsWaylandDisplay.h"

namespace mozilla {

struct WFreeDeleter {
  constexpr WFreeDeleter() = default;
  void operator()(wl_data_device* aPtr) const { wl_data_device_destroy(aPtr); }
  void operator()(zwp_primary_selection_device_v1* aPtr) const {
    zwp_primary_selection_device_v1_destroy(aPtr);
  }
  void operator()(gtk_primary_selection_device* aPtr) const {
    gtk_primary_selection_device_destroy(aPtr);
  }
  void operator()(wl_surface* aPtr) const { wl_surface_destroy(aPtr); }
  void operator()(wl_subsurface* aPtr) const { wl_subsurface_destroy(aPtr); }
  void operator()(wl_callback* aPtr) const { wl_callback_destroy(aPtr); }
  void operator()(wp_viewport* aPtr) const { wp_viewport_destroy(aPtr); }
  void operator()(wl_region* aPtr) const { wl_region_destroy(aPtr); }
  void operator()(wp_fractional_scale_v1* aPtr) const {
    wp_fractional_scale_v1_destroy(aPtr);
  }
  void operator()(xx_fractional_scale_v2* aPtr) const {
    xx_fractional_scale_v2_destroy(aPtr);
  }
  void operator()(wp_color_management_surface_v1* aPtr) const {
    wp_color_management_surface_v1_destroy(aPtr);
  }
  void operator()(wp_color_representation_surface_v1* aPtr) const {
    wp_color_representation_surface_v1_destroy(aPtr);
  }
  void operator()(wp_image_description_v1* aPtr) const {
    wp_image_description_v1_destroy(aPtr);
  }
};

template <typename T>
using WUniquePtr = UniquePtr<T, WFreeDeleter>;

}  // namespace mozilla

#endif
