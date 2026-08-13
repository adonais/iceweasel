/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a dummy version of Chromium source file
// base/trace_event/base_tracing_forward.h to provide a stub implementation.

#ifndef BASE_TRACE_EVENT_BASE_TRACING_FORWARD_H_
#define BASE_TRACE_EVENT_BASE_TRACING_FORWARD_H_

namespace perfetto {

class TracedValue;
class TracedDictionary;

template <typename T>
void WriteIntoTracedValue(TracedValue context, T&& value);

template <typename T, typename ResultType = void, typename = void>
struct check_traced_value_support;

}  // namespace perfetto

#endif  // BASE_TRACE_EVENT_BASE_TRACING_FORWARD_H_
