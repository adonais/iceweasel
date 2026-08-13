/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a dummy version of Chromium source file base/files/file_tracing.h to
// provide a stub implementation.

#ifndef BASE_FILES_FILE_TRACING_H_
#define BASE_FILES_FILE_TRACING_H_

#define SCOPED_FILE_TRACE_WITH_SIZE(name, size)
#define SCOPED_FILE_TRACE(name) SCOPED_FILE_TRACE_WITH_SIZE(name, 0)

namespace base {

class FileTracing {
 public:
  static bool IsCategoryEnabled() { return false; }
  class ScopedEnabler {};
  class ScopedTrace {};

  FileTracing(const FileTracing&) = delete;
  FileTracing& operator=(const FileTracing&) = delete;
};

}  // namespace base

#endif  // BASE_FILES_FILE_TRACING_H_
