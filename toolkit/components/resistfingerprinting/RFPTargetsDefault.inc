/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// #ifdef NIGHTLY_BUILD is supported as a preprocessor macro.
// If any others are needed, update extract_rfp_targets.py

DESKTOP_DEFAULT(CanvasRandomization)
DESKTOP_DEFAULT(EfficientCanvasRandomization)
DESKTOP_DEFAULT(FontVisibilityLangPack)
DESKTOP_DEFAULT(JSMathFdlibm)
DESKTOP_DEFAULT(ScreenAvailToResolution)
DESKTOP_DEFAULT(NavigatorHWConcurrencyTiered)
DESKTOP_DEFAULT(MaxTouchPointsCollapse)

#ifdef NIGHTLY_BUILD
// All WebGL Vendor targets are included; however
// Randomize overrides Constant which overrides Sanitize.
// We include them all so that relaxing one will still enforce the others
DESKTOP_DEFAULT(WebGLRendererConstant)
DESKTOP_DEFAULT(WebGLVendorRandomize)
DESKTOP_DEFAULT(WebGLVendorConstant)
DESKTOP_DEFAULT(WebGLVendorSanitize)
ANDROID_DEFAULT(WebGLRendererConstant)
ANDROID_DEFAULT(WebGLVendorRandomize)
ANDROID_DEFAULT(WebGLVendorConstant)
ANDROID_DEFAULT(WebGLVendorSanitize)
#endif

ANDROID_DEFAULT(CanvasRandomization)
ANDROID_DEFAULT(EfficientCanvasRandomization)
ANDROID_DEFAULT(FontVisibilityLangPack)
ANDROID_DEFAULT(JSMathFdlibm)
ANDROID_DEFAULT(ScreenAvailToResolution)
ANDROID_DEFAULT(NavigatorHWConcurrencyTiered)
ANDROID_DEFAULT(MaxTouchPointsCollapse)
