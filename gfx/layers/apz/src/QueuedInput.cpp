/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "QueuedInput.h"

#include "AsyncPanZoomController.h"
#include "InputBlockState.h"
#include "InputData.h"
#include "OverscrollHandoffState.h"

namespace mozilla {
namespace layers {

QueuedInput::QueuedInput(const MultiTouchInput& aInput, TouchBlockState& aBlock)
    : mInput(std::make_unique<MultiTouchInput>(aInput)), mBlock(&aBlock) {}

QueuedInput::QueuedInput(const ScrollWheelInput& aInput,
                         WheelBlockState& aBlock)
    : mInput(std::make_unique<ScrollWheelInput>(aInput)), mBlock(&aBlock) {}

QueuedInput::QueuedInput(const MouseInput& aInput, DragBlockState& aBlock)
    : mInput(std::make_unique<MouseInput>(aInput)), mBlock(&aBlock) {}

QueuedInput::QueuedInput(const PanGestureInput& aInput,
                         PanGestureBlockState& aBlock)
    : mInput(std::make_unique<PanGestureInput>(aInput)), mBlock(&aBlock) {}

QueuedInput::QueuedInput(const PinchGestureInput& aInput,
                         PinchGestureBlockState& aBlock)
    : mInput(std::make_unique<PinchGestureInput>(aInput)), mBlock(&aBlock) {}

QueuedInput::QueuedInput(const KeyboardInput& aInput,
                         KeyboardBlockState& aBlock)
    : mInput(std::make_unique<KeyboardInput>(aInput)), mBlock(&aBlock) {}

InputData* QueuedInput::Input() { return mInput.get(); }

InputBlockState* QueuedInput::Block() { return mBlock.get(); }

}  // namespace layers
}  // namespace mozilla
