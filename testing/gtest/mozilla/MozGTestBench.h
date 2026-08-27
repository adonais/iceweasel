/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GTEST_MOZGTESTBENCH_H
#define GTEST_MOZGTESTBENCH_H

#include <functional>

namespace mozilla {

void GTestBench(const char* aSuite, const char* aName,
                const std::function<void()>& aTest);

// aTest may return false to abort the performance test. This is useful when
// testing runtime specific properties, such as whether a certain SIMD path is
// available on the current host.
void GTestBench(const char* aSuite, const char* aName,
                const std::function<bool()>& aTest);

}  // namespace mozilla

#define MOZ_GTEST_BENCH(suite, test, lambdaOrFunc)                   \
  TEST(suite, test)                                                  \
  {                                                                  \
    mozilla::GTestBench(#suite, #test, std::function(lambdaOrFunc)); \
  }

#define MOZ_GTEST_BENCH_F(suite, test, lambdaOrFunc)                 \
  TEST_F(suite, test) {                                              \
    mozilla::GTestBench(#suite, #test, std::function(lambdaOrFunc)); \
  }

#endif  // GTEST_MOZGTESTBENCH_H
