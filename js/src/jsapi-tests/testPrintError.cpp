/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <cstdio>  // fclose, fflush, open_memstream
#include <string>

#include "js/ErrorReport.h"  // JS::PrintError
#include "js/Exception.h"  // JS::ExceptionStack, JS::StealPendingExceptionStack
#include "js/Warnings.h"   // JS::SetWarningReporter, JS::WarnUTF8
#include "jsapi-tests/tests.h"

class AutoStreamBuffer {
  char* buffer;
  size_t size;
  FILE* fp;

 public:
  AutoStreamBuffer() { fp = open_memstream(&buffer, &size); }

  ~AutoStreamBuffer() {
    fclose(fp);
    free(buffer);
  }

  FILE* stream() { return fp; }

  bool contains(const char* str) {
    if (fflush(fp) != 0) {
      fprintf(stderr, "Error flushing stream\n");
      return false;
    }
    if (strcmp(buffer, str) != 0) {
      fprintf(stderr, "Expected |%s|, got |%s|\n", str, buffer);
      return false;
    }
    return true;
  }
};

BEGIN_TEST(testPrintError_Works) {
  AutoStreamBuffer buf;

  CHECK(!execDontReport("throw null;", "testPrintError_Works.js", 3));

  JS::ExceptionStack exnStack(cx);
  CHECK(JS::StealPendingExceptionStack(cx, &exnStack));

  JS::ErrorReportBuilder builder(cx);
  CHECK(builder.init(cx, exnStack, JS::ErrorReportBuilder::NoSideEffects));
  JS::PrintError(buf.stream(), builder, false);

  CHECK(buf.contains("testPrintError_Works.js:3:1 uncaught exception: null\n"));

  return true;
}
END_TEST(testPrintError_Works)

BEGIN_TEST(testPrintError_SkipWarning) {
  JS::SetWarningReporter(cx, warningReporter);
  CHECK(JS::WarnUTF8(cx, "warning message"));
  CHECK(warningSuccess);
  return true;
}

static bool warningSuccess;

static void warningReporter(JSContext* cx, JSErrorReport* report) {
  AutoStreamBuffer buf;
  JS::PrintError(buf.stream(), report, false);
  warningSuccess = buf.contains("");
}
END_TEST(testPrintError_SkipWarning)

bool cls_testPrintError_SkipWarning::warningSuccess = false;

BEGIN_TEST(testPrintError_PrintWarning) {
  JS::SetWarningReporter(cx, warningReporter);
  CHECK(JS::WarnUTF8(cx, "warning message"));
  CHECK(warningSuccess);
  return true;
}

static bool warningSuccess;

static void warningReporter(JSContext* cx, JSErrorReport* report) {
  AutoStreamBuffer buf;
  JS::PrintError(buf.stream(), report, true);
  warningSuccess = buf.contains("warning: warning message\n");
}
END_TEST(testPrintError_PrintWarning)

bool cls_testPrintError_PrintWarning::warningSuccess = false;

#define BURRITO "\xF0\x9F\x8C\xAF"

BEGIN_TEST(testPrintError_UTF16CodeUnits) {
  AutoStreamBuffer buf;

  static const char utf8code[] =
      "function f() {\n  var x = `\n" BURRITO "`; " BURRITO "; } f();";

  CHECK(!execDontReport(utf8code, "testPrintError_UTF16CodeUnits.js", 1));

  JS::ExceptionStack exnStack(cx);
  CHECK(JS::StealPendingExceptionStack(cx, &exnStack));

  JS::ErrorReportBuilder builder(cx);
  CHECK(builder.init(cx, exnStack, JS::ErrorReportBuilder::NoSideEffects));
  JS::PrintError(buf.stream(), builder, false);

  CHECK(
      buf.contains("testPrintError_UTF16CodeUnits.js:3:6 SyntaxError: illegal "
                   "character U+1F32F:\n"
                   "testPrintError_UTF16CodeUnits.js:3:6 " BURRITO "`; " BURRITO
                   "; } f();\n"
                   "testPrintError_UTF16CodeUnits.js:3:6 .....^\n"));

  return true;
}
END_TEST(testPrintError_UTF16CodeUnits)

#undef BURRITO

// Steal the pending exception and return the string an uncaught-exception
// report would produce for it, using the given side-effect-free reporting mode.
static std::string StealUncaughtToString(
    JSContext* cx, JS::ErrorReportBuilder::SniffingBehavior behavior) {
  JS::ExceptionStack exnStack(cx);
  MOZ_RELEASE_ASSERT(JS::StealPendingExceptionStack(cx, &exnStack));

  JS::ErrorReportBuilder builder(cx);
  MOZ_RELEASE_ASSERT(builder.init(cx, exnStack, behavior));
  return std::string(builder.toStringResult().c_str());
}

BEGIN_TEST(testPrintError_UncaughtObjectPreview) {
  static constexpr auto ListNames =
      JS::ErrorReportBuilder::NoSideEffectsListPropertyNames;
  static constexpr auto NoSideEffects = JS::ErrorReportBuilder::NoSideEffects;

  // With NoSideEffectsListPropertyNames, a thrown non-Error object is described
  // by its own string-keyed property names instead of the unhelpful bare
  // "uncaught exception: Object".
  CHECK(!execDontReport("throw {reason: 'boom'};", __FILE__, __LINE__));
  CHECK(StealUncaughtToString(cx, ListNames) ==
        "uncaught exception: Object { reason }");

  CHECK(!execDontReport("throw {name: 'foo', message: 'bar'};", __FILE__,
                        __LINE__));
  CHECK(StealUncaughtToString(cx, ListNames) ==
        "uncaught exception: Object { message, name }");

  // An object with no own string-keyed properties falls back to the bare name.
  CHECK(!execDontReport("throw {};", __FILE__, __LINE__));
  CHECK(StealUncaughtToString(cx, ListNames) == "uncaught exception: Object");

  // Accessor properties are listed by key, without ever invoking the getter.
  CHECK(!execDontReport("throw {get reason() { return 'boom'; }};", __FILE__,
                        __LINE__));
  CHECK(StealUncaughtToString(cx, ListNames) ==
        "uncaught exception: Object { reason }");

  // Uses object's ClassName when there are no properties.
  CHECK(!execDontReport("throw new Map();", __FILE__, __LINE__));
  CHECK(StealUncaughtToString(cx, ListNames) == "uncaught exception: Map");

  // NoSideEffects keeps reporting the bare class name: that string is exposed
  // to web content through window.onerror.
  CHECK(!execDontReport("throw {reason: 'boom'};", __FILE__, __LINE__));
  CHECK(StealUncaughtToString(cx, NoSideEffects) ==
        "uncaught exception: Object");

  return true;
}
END_TEST(testPrintError_UncaughtObjectPreview)
