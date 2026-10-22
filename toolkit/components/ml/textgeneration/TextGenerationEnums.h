/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_hwinference_TextGenerationEnums_h
#define mozilla_hwinference_TextGenerationEnums_h

#include "mozilla/dom/BindingIPCUtils.h"
#include "mozilla/dom/TextGeneratorBinding.h"

namespace IPC {

template <>
struct ParamTraits<mozilla::dom::TextGenerationRole>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::TextGenerationRole> {};

template <>
struct ParamTraits<mozilla::dom::TextGenerationFinishReason>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::TextGenerationFinishReason> {};

template <>
struct ParamTraits<mozilla::dom::TextGenerationSamplerType>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::TextGenerationSamplerType> {};

template <>
struct ParamTraits<mozilla::dom::TextGenerationKVCacheDtype>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::TextGenerationKVCacheDtype> {};

}  // namespace IPC

#endif  // mozilla_hwinference_TextGenerationEnums_h
