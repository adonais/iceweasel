/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a dummy version of Chromium source file
// base/sampling_heap_profiler/poisson_allocation_sampler.h to provide a stub implementation.

#ifndef BASE_SAMPLING_HEAP_PROFILER_POISSON_ALLOCATION_SAMPLER_H_
#define BASE_SAMPLING_HEAP_PROFILER_POISSON_ALLOCATION_SAMPLER_H_

namespace base {

struct PoissonAllocationSampler {
  struct ScopedMuteThreadSamples {
    // Empty destructor to prevent unused warning.
    ~ScopedMuteThreadSamples() {}
  };
};

}  // namespace base

#endif  // BASE_SAMPLING_HEAP_PROFILER_POISSON_ALLOCATION_SAMPLER_H_
