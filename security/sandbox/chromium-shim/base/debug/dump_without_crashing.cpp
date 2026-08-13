/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a dummy version of Chromium source file
// base/debug/dump_without_crashing.cc to provide a stub implementation.

#include "base/debug/dump_without_crashing.h"

namespace base::debug {

bool DumpWithoutCrashing(const base::Location& location,
                         base::TimeDelta time_between_dumps) {
  return true;
}

}  // namespace base::debug
