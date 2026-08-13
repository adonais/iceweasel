/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a stripped down version of the Chromium source file base/logging.cc
// This prevents dependency on the Chromium logging and dependency creep in
// general.
// At some point we should find a way to hook this into our own logging see
// bug 1013988.
// The formatting in this file matches the original Chromium file to aid future
// merging.

#include "base/logging.h"

#if defined(OS_WIN)
#include <windows.h>
#endif

#if defined(OS_POSIX)
#include <errno.h>
#include <string.h>
#endif

#include <algorithm>

#include "base/logging/logging_settings.h"
#include "base/strings/stringprintf.h"
#include "mozilla/Assertions.h"

namespace logging {

namespace {

int g_min_log_level = 0;

LoggingDestination g_logging_destination = LOG_DEFAULT;

// For LOG_ERROR and above, always print to stderr.
const int kAlwaysPrintErrorLevel = LOGGING_ERROR;

// A log message handler that gets notified of every log message we process.
LogMessageHandlerFunction g_log_message_handler = nullptr;

}  // namespace

std::string BuildCrashString(const char* file, int line,
                             const char* message_without_prefix) {
  // Only log last path component.
  if (file) {
    const char* slash = UNSAFE_TODO(strrchr(file,
#if BUILDFLAG(IS_WIN)
                                            '\\'
#else
                                            '/'
#endif  // BUILDFLAG(IS_WIN)
                                            ));
    if (slash) {
      file = UNSAFE_TODO(slash + 1);
    }
  }

  return base::StringPrintf("%s:%d: %s", file, line, message_without_prefix);
}

// This is never instantiated, it's just used for EAT_STREAM_PARAMETERS to have
// an object of the correct type on the LHS of the unused part of the ternary
// operator.
std::ostream* g_swallow_stream;

void SetMinLogLevel(int level) {
  g_min_log_level = std::min(LOGGING_FATAL, level);
}

int GetMinLogLevel() {
  return g_min_log_level;
}

bool ShouldCreateLogMessage(int severity) {
  if (severity < g_min_log_level) {
    return false;
  }

  // Return true here unless we know ~LogMessage won't do anything. Note that
  // ~LogMessage writes to stderr if severity_ >= kAlwaysPrintErrorLevel, even
  // when g_logging_destination is LOG_NONE.
  return g_logging_destination != LOG_NONE || g_log_message_handler ||
         severity >= kAlwaysPrintErrorLevel;
}

int GetVlogLevelHelper(const char* file, size_t N) {
  return 0;
}

LogMessage::LogMessage(const char* file, int line, LogSeverity severity)
    : severity_(severity), file_(file), line_(line) {
  message_start_ = stream_.str().length();
}

LogMessage::~LogMessage() {
  if (severity_ == LOGGING_FATAL) {
    MOZ_CRASH("Hit fatal chromium sandbox condition.");
  }
}

std::string LogMessage::BuildCrashString() const {
  return logging::BuildCrashString(file(), line(),
                                   UNSAFE_TODO(str().c_str() + message_start_));
}

LogMessageFatal::~LogMessageFatal() {
  MOZ_CRASH("Hit fatal chromium sandbox condition.");
}

SystemErrorCode GetLastSystemErrorCode() {
#if defined(OS_WIN)
  return ::GetLastError();
#elif defined(OS_POSIX)
  return errno;
#else
#error Not implemented
#endif
}

#if BUILDFLAG(IS_WIN)
Win32ErrorLogMessage::Win32ErrorLogMessage(const char* file, int line,
                                           LogSeverity severity,
                                           SystemErrorCode err)
    : LogMessage(file, line, severity), err_(err) {
  (void)err_;
}

Win32ErrorLogMessage::~Win32ErrorLogMessage() {}
#elif BUILDFLAG(IS_POSIX) || BUILDFLAG(IS_FUCHSIA)
ErrnoLogMessage::ErrnoLogMessage(const char* file,
                                 int line,
                                 LogSeverity severity,
                                 SystemErrorCode err)
    : LogMessage(file, line, severity), err_(err) {
  (void)err_;
}

ErrnoLogMessage::~ErrnoLogMessage() {
}
#endif  // BUILDFLAG(IS_WIN))

void RawLog(int level, const char* message) {
}

} // namespace logging
