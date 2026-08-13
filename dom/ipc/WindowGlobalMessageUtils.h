/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_window_global_message_utils_h_
#define mozilla_dom_window_global_message_utils_h_

#include "ipc/IPCMessageUtilsSpecializations.h"
#include "mozilla/dom/WindowGlobalActorsBinding.h"

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::DocumentLanguageMetadata,
                                  mHtmlLangAttribute, mTextSample);

}  // namespace IPC

#endif  // mozilla_dom_window_global_message_utils_h_
