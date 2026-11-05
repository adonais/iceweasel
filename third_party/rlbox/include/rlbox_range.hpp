#pragma once
// IWYU pragma: private, include "rlbox.hpp"
// IWYU pragma: friend "rlbox_.*\.hpp"

#include <cstdint>

#include "rlbox_helpers.hpp"
#include "rlbox_types.hpp"

namespace rlbox::detail {

// Checks that a given range is entirely within a sandbox
template<typename T_Sbx>
inline void check_sandbox_pointer_range_is_contained(const void* ptr,
                                                     size_t size)
{
  auto ptr_start_val = reinterpret_cast<uintptr_t>(ptr);
  detail::dynamic_check(ptr_start_val,
                        "Performing memory operation on a null pointer");
  // If size is 0, we'll just check for size of 1
  if (size == 0) {
    size = 1;
  }
  auto ptr_end_val = checked_add(static_cast<uintptr_t>(ptr_start_val),
                                 (size - 1),
                                 "Ptr end computation overflow");

  auto ptr_start = reinterpret_cast<void*>(ptr_start_val);
  auto ptr_end = reinterpret_cast<void*>(ptr_end_val);

  bool safe = rlbox_sandbox<T_Sbx>::is_in_same_sandbox(ptr_start, ptr_end);
  if (!safe) {
    printf("range has overflowed sandbox bounds: %p, %p\n", ptr_start, ptr_end);
    abort();
  }
}

}