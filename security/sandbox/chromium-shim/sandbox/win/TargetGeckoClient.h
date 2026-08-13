/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef SANDBOX_WIN_TARGETGECKOCLIENT_H_
#define SANDBOX_WIN_TARGETGECKOCLIENT_H_

#include <stddef.h>
#include <string_view>
#include <winternl.h>

#include "mozilla/Attributes.h"
#include "TargetGeckoServices.h"

namespace mozilla::sandboxing {

inline constexpr std::string_view kTargetPrefix = "Target";

// Strips the "Target" prefix from an interception function's __func__ at no
// runtime cost. N is the deduced array bound (a compile-time constant), so the
// static_assert guards against misuse in a too-short function on every
// compiler, without depending on __func__'s value being a constant expression
// (which Clang allows but GCC does not).
template <size_t N>
constexpr std::string_view FuncNoTarget(const char (&aFunc)[N]) {
  static_assert(N > kTargetPrefix.size() + 1,
                "SYSCALL_BROKERING* must be used in a Target* function");
  return std::string_view(aFunc + kTargetPrefix.size(),
                          N - 1 - kTargetPrefix.size());
}

class MOZ_RAII SyscallBrokering {
 public:
  // aFunctionName must come from FuncNoTarget; its referent must outlive this.
  explicit SyscallBrokering(std::string_view aFunctionName,
                            const UNICODE_STRING* aContext = nullptr);

  SyscallBrokering(const SyscallBrokering&) = delete;
  SyscallBrokering(SyscallBrokering&&) = delete;
  SyscallBrokering& operator=(const SyscallBrokering&) = delete;
  SyscallBrokering& operator=(SyscallBrokering&&) = delete;

  ~SyscallBrokering();

  void Brokered() { mBrokered = true; }

 private:
  std::string_view mFunctionName;
  std::wstring_view mContext;
  bool mBrokered;
};

class MOZ_RAII AutoProfileMarker {
 public:
  template <size_t N>
  explicit AutoProfileMarker(const char (&aName)[N])
      : AutoProfileMarker(std::string_view(aName, N - 1)) {}

  AutoProfileMarker(const AutoProfileMarker&) = delete;
  AutoProfileMarker(AutoProfileMarker&&) = delete;
  AutoProfileMarker& operator=(const AutoProfileMarker&) = delete;
  AutoProfileMarker& operator=(AutoProfileMarker&&) = delete;

  ~AutoProfileMarker();

 private:
  explicit AutoProfileMarker(std::string_view aName);
  std::string_view mName;
};

}  // namespace mozilla::sandboxing

#define SYSCALL_BROKERING_WITH_CONTEXT(context)                \
  mozilla::sandboxing::SyscallBrokering syscallBrokering(      \
      mozilla::sandboxing::FuncNoTarget(__func__), context)

#define SYSCALL_BROKERING()                                    \
  mozilla::sandboxing::SyscallBrokering syscallBrokering(      \
      mozilla::sandboxing::FuncNoTarget(__func__))

#define SYSCALL_BROKERED() syscallBrokering.Brokered()

#endif  // SANDBOX_WIN_TARGETGECKOCLIENT_H_
