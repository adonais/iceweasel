/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_layers_LayerTreeLog_h
#define mozilla_layers_LayerTreeLog_h

#include "mozilla/Logging.h"

namespace mozilla::layers {

// Logs the lifetime of compositors and the layer trees attached to them across
// the parent, GPU and content processes. Layers IDs are logged in hex.
extern LazyLogModule gLayerTreeLog;

}  // namespace mozilla::layers

#define LAYERTREE_LOG(...)                                              \
  MOZ_LOG_FMT(mozilla::layers::gLayerTreeLog, mozilla::LogLevel::Debug, \
              __VA_ARGS__)

#endif  // mozilla_layers_LayerTreeLog_h
