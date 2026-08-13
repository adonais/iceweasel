/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/Array.h"
#include <cstdint>
#include <iterator>
#include <type_traits>

void TestInitialValueByConstructor() {
  using namespace mozilla;
  // Style 1
  Array<int32_t, 3> arr1(1, 2, 3);
  MOZ_RELEASE_ASSERT(arr1[0] == 1);
  MOZ_RELEASE_ASSERT(arr1[1] == 2);
  MOZ_RELEASE_ASSERT(arr1[2] == 3);
  // Style 2
  Array<int32_t, 3> arr2{5, 6, 7};
  MOZ_RELEASE_ASSERT(arr2[0] == 5);
  MOZ_RELEASE_ASSERT(arr2[1] == 6);
  MOZ_RELEASE_ASSERT(arr2[2] == 7);
  // Style 3
  Array<int32_t, 3> arr3({8, 9, 10});
  MOZ_RELEASE_ASSERT(arr3[0] == 8);
  MOZ_RELEASE_ASSERT(arr3[1] == 9);
  MOZ_RELEASE_ASSERT(arr3[2] == 10);
}

void TestStdData() {
  using namespace mozilla;
  Array<int32_t, 4> arr(1, 2, 3, 4);
  static_assert(std::is_same_v<decltype(std::data(arr)), int32_t*>);
  MOZ_RELEASE_ASSERT(*std::data(arr) == 1);
  MOZ_RELEASE_ASSERT(std::data(arr) == &arr[0]);
  MOZ_RELEASE_ASSERT(std::data(arr) == arr.begin());

  const Array<int32_t, 1> const_arr(1);
  static_assert(std::is_same_v<decltype(std::data(const_arr)), const int32_t*>);
  MOZ_RELEASE_ASSERT(*std::data(arr) == 1);
}

int main() {
  TestInitialValueByConstructor();
  TestStdData();
  return 0;
}
