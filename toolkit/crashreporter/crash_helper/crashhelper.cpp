/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <cstdlib>
#include <climits>

#if defined(XP_WIN)
#  include <windows.h>  // for HANDLE
#elif defined(XP_DARWIN)
#  include <mach/port.h>  // for mach_port_t
#elif defined(XP_LINUX)
// For DirectAuxvDumpInfo
#  include "mozilla/toolkit/crashreporter/rust_minidump_writer_linux_ffi_generated.h"
#endif  // defined(XP_LINUX)
#include "mozilla/crash_helper_ffi_generated.h"

#include "mozilla/Casting.h"

using mozilla::BitwiseCast;

static int parse_int_or_exit(const BreakpadChar* aArg) {
  errno = 0;
  wchar_t* str_end = nullptr;
  long value =
#if defined(XP_WIN)
      wcstol(BitwiseCast<const wchar_t*>(aArg), &str_end, 10);
#else
      strtol(aArg, /* str_end */ nullptr, 10);
#endif  // defined(XP_WIN)

  if ((errno != 0) || (value < 0) || (value > INT_MAX) ||
      (BitwiseCast<const wchar_t*>(aArg) == str_end)) {
    exit(EXIT_FAILURE);
  }

  return static_cast<int>(value);
}

static BreakpadRawData parse_breakpad_data(const BreakpadChar* aArg) {
#if defined(XP_MACOSX)
  return aArg;
#elif defined(XP_WIN)
  errno = 0;
  const wchar_t* str_start = BitwiseCast<const wchar_t*>(aArg);
  wchar_t* str_end = nullptr;
#  if defined(HAVE_64BIT_BUILD)
  uint64_t value = wcstoull(str_start, &str_end, 10);
#  else
  uint32_t value = wcstoul(str_start, &str_end, 10);
#  endif  // defined(HAVE_64BIT_BUILD)

  if ((errno != 0) || (str_end == str_start)) {
    exit(EXIT_FAILURE);
  }

  return BitwiseCast<HANDLE>(value);
#else     // Linux and friends
  return parse_int_or_exit(aArg);
#endif
}

#define CAST_ARG(a) (mozilla::BitwiseCast<BreakpadChar*>(a))

#define GET_CLIENT_PID_ARG(arguments) (CAST_ARG((arguments)[1]))
#define GET_BREAKPAD_DATA_ARG(arguments) (CAST_ARG((arguments)[2]))
#define GET_MINIDUMP_PATH_ARG(arguments) (CAST_ARG((arguments)[3]))
#define GET_CONNECTOR_ARG(arguments) (CAST_ARG((arguments)[4]))
#define GET_BUILD_ID_ARG(arguments) (CAST_ARG((arguments)[5]))
#ifdef XP_WIN
#  define GET_LISTENER_ARG(arguments) (CAST_ARG((arguments)[6]))
#  define GET_CLIENT_HANDLE_ARG(arguments) (CAST_ARG((arguments)[7]))
#  define ARG_NUM (8)
#else
static char sDummy[1] = "";
#  define GET_LISTENER_ARG(arguments) (CAST_ARG(sDummy))
#  define GET_CLIENT_HANDLE_ARG(arguments) (CAST_ARG(sDummy))
#  define ARG_NUM (6)
#endif  // XP_WIN

#if defined(XP_WIN)
int wmain(int argc, wchar_t* argv[])
#else
int main(int argc, char* argv[])
#endif  // defined(XP_WIN)
{
  if (argc < ARG_NUM) {
    exit(EXIT_FAILURE);
  }

  Pid client_pid =
      static_cast<Pid>(parse_int_or_exit(GET_CLIENT_PID_ARG(argv)));
  BreakpadRawData breakpad_data =
      parse_breakpad_data(GET_BREAKPAD_DATA_ARG(argv));
  BreakpadChar* minidump_path = GET_MINIDUMP_PATH_ARG(argv);
  BreakpadChar* connector = GET_CONNECTOR_ARG(argv);
  BreakpadChar* build_id = GET_BUILD_ID_ARG(argv);
  BreakpadChar* listener = GET_LISTENER_ARG(argv);
  BreakpadChar* client_handle = GET_CLIENT_HANDLE_ARG(argv);

  int res = crash_generator_logic_desktop(client_pid, client_handle,
                                          breakpad_data, minidump_path,
                                          build_id, listener, connector);
  exit(res);
}
