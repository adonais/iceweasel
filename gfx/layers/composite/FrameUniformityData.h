/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_layers_FrameUniformityData_h_
#define mozilla_layers_FrameUniformityData_h_

#include "ipc/IPCMessageUtils.h"
#include "ipc/IPCMessageUtilsSpecializations.h"
#include "js/TypeDecls.h"
#include "nsTArray.h"

namespace mozilla {
namespace layers {

class FrameUniformityData {
  friend struct IPC::ParamTraits<FrameUniformityData>;

 public:
  bool ToJS(JS::MutableHandle<JS::Value> aOutValue, JSContext* aContext);
  // Contains the calculated frame uniformities
  std::map<uintptr_t, float> mUniformities;
};

}  // namespace layers
}  // namespace mozilla

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::layers::FrameUniformityData,
                                  mUniformities);

}  // namespace IPC

#endif  // mozilla_layers_FrameUniformityData_h_
