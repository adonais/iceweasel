/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a dummy version of Chromium source file
// base/trace_event/trace_event.h to provide a stub implementation.

#ifndef BASE_TRACE_EVENT_TRACE_EVENT_H_
#define BASE_TRACE_EVENT_TRACE_EVENT_H_

namespace trace_event_internal {

template <typename... Args>
void Ignore(Args&&... args) {}

}  // namespace trace_event_internal

#define INTERNAL_TRACE_IGNORE(...) \
  (false ? trace_event_internal::Ignore(__VA_ARGS__) : (void)0)
#define TRACE_EVENT_BEGIN(category, name, ...) \
  INTERNAL_TRACE_IGNORE(category, name)
#define TRACE_EVENT_END0(category, name, ...) \
  INTERNAL_TRACE_IGNORE(category, name)

namespace perfetto {

class TracedDictionary {
 public:
  template <typename T>
  void Add(const char* key, T&& value) {}
};

class TracedValue {
 public:
  TracedDictionary WriteDictionary() { return TracedDictionary(); }
};

template <typename T>
void WriteIntoTracedValue(TracedValue context, T&& value) {}

}  // namespace perfetto

#endif  // BASE_TRACE_EVENT_TRACE_EVENT_H_
