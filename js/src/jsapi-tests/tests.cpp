/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jsapi-tests/tests.h"

#include "mozilla/Sprintf.h"
#include "mozilla/Utf8.h"  // mozilla::Utf8Unit

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "js/CharacterEncoding.h"
#include "js/CompilationAndEvaluation.h"  // JS::Evaluate
#include "js/Conversions.h"
#include "js/Equality.h"      // JS::SameValue
#include "js/GlobalObject.h"  // JS::DefaultGlobalClassOps, JS_NewGlobalObject
#include "js/Initialization.h"
#include "js/Prefs.h"
#include "js/PropertyAndElement.h"  // JS_DefineFunction
#include "js/RootingAPI.h"
#include "js/SourceText.h"  // JS::Source{Ownership,Text}
#include "js/Warnings.h"    // JS::SetWarningReporter

// A singly linked list of tests which doesn't require runtime intialization.
//
// We rely on the runtime initialization of global variables containing test
// instances to add themselves to these lists, which depends on them already
// being in a valid state.
template <typename T>
class JSAPITestList {
  T* first = nullptr;
  T* last = nullptr;

 public:
  T* getFirst() const { return first; }

  void pushBack(T* element) {
    MOZ_ASSERT(!element->next);
    MOZ_ASSERT(bool(first) == bool(last));

    if (!first) {
      first = element;
      last = element;
      return;
    }

    last->next = element;
    last = element;
  }
};

static JSAPITestList<JSAPIRuntimeTest> runtimeTests;
static JSAPITestList<JSAPIFrontendTest> frontendTests;

JSAPITestString& JSAPITestString::operator+=(const char* s) {
  if (!chars.append(s, strlen(s))) {
    abort();
  }
  return *this;
}

JSAPITestString& JSAPITestString::operator+=(const JSAPITestString& s) {
  if (!chars.append(s.begin(), s.length())) {
    abort();
  }
  return *this;
}

JSAPITestString operator+(const JSAPITestString& a, const char* b) {
  JSAPITestString result = a;
  result += b;
  return result;
}

JSAPITestString operator+(const JSAPITestString& a, const JSAPITestString& b) {
  JSAPITestString result = a;
  result += b;
  return result;
}

bool JSAPITest::fail(const JSAPITestString& msg, const char* filename,
                     int lineno) {
  char location[256];
  SprintfLiteral(location, "%s:%d:", filename, lineno);

  JSAPITestString message(location);
  message += msg;

  maybeAppendException(message);

  fprintf(stderr, "%.*s\n", int(message.length()), message.begin());

  if (msgs.length() != 0) {
    msgs += " | ";
  }
  msgs += message;

  return false;
}

JSAPIRuntimeTest::JSAPIRuntimeTest() : cx(nullptr), reuseGlobal(false) {
  runtimeTests.pushBack(this);
}

JSAPIRuntimeTest::~JSAPIRuntimeTest() {
  MOZ_RELEASE_ASSERT(!cx);
  MOZ_RELEASE_ASSERT(!global);
}

bool JSAPIRuntimeTest::init(JSContext* maybeReusableContext) {
  if (maybeReusableContext && reuseGlobal) {
    cx = maybeReusableContext;
    global.init(cx, JS::CurrentGlobalOrNull(cx));
    return init();
  }

  MaybeFreeContext(maybeReusableContext);

  cx = createContext();
  if (!cx) {
    return false;
  }

  js::UseInternalJobQueues(cx);

  if (!JS::InitSelfHostedCode(cx)) {
    return false;
  }
  global.init(cx);
  createGlobal();
  if (!global) {
    return false;
  }
  JS::EnterRealm(cx, global);
  return init();
}

JSContext* JSAPIRuntimeTest::maybeForgetContext() {
  if (!reuseGlobal) {
    return nullptr;
  }

  JSContext* reusableCx = cx;
  global.reset();
  cx = nullptr;
  return reusableCx;
}

/* static */
void JSAPIRuntimeTest::MaybeFreeContext(JSContext* maybeCx) {
  if (maybeCx) {
    JS::LeaveRealm(maybeCx, nullptr);
    JS_DestroyContext(maybeCx);
  }
}

void JSAPIRuntimeTest::uninit() {
  global.reset();
  MaybeFreeContext(cx);
  cx = nullptr;
  msgs.clear();
}

bool JSAPIRuntimeTest::exec(const char* utf8, const char* filename,
                            int lineno) {
  JS::CompileOptions opts(cx);
  opts.setFileAndLine(filename, lineno);

  JS::SourceText<mozilla::Utf8Unit> srcBuf;
  JS::RootedValue v(cx);
  return (srcBuf.init(cx, utf8, strlen(utf8), JS::SourceOwnership::Borrowed) &&
          JS::Evaluate(cx, opts, srcBuf, &v)) ||
         fail(JSAPITestString(utf8), filename, lineno);
}

bool JSAPIRuntimeTest::execDontReport(const char* utf8, const char* filename,
                                      int lineno) {
  JS::CompileOptions opts(cx);
  opts.setFileAndLine(filename, lineno);

  JS::SourceText<mozilla::Utf8Unit> srcBuf;
  JS::RootedValue v(cx);
  return srcBuf.init(cx, utf8, strlen(utf8), JS::SourceOwnership::Borrowed) &&
         JS::Evaluate(cx, opts, srcBuf, &v);
}

bool JSAPIRuntimeTest::evaluate(const char* utf8, const char* filename,
                                int lineno, JS::MutableHandleValue vp) {
  JS::CompileOptions opts(cx);
  opts.setFileAndLine(filename, lineno);

  JS::SourceText<mozilla::Utf8Unit> srcBuf;
  return (srcBuf.init(cx, utf8, strlen(utf8), JS::SourceOwnership::Borrowed) &&
          JS::Evaluate(cx, opts, srcBuf, vp)) ||
         fail(JSAPITestString(utf8), filename, lineno);
}

JSAPITestString JSAPIRuntimeTest::jsvalToSource(JS::HandleValue v) {
  JS::Rooted<JSString*> str(cx, JS_ValueToSource(cx, v));
  if (str) {
    if (JS::UniqueChars bytes = JS_EncodeStringToUTF8(cx, str)) {
      return JSAPITestString(bytes.get());
    }
  }
  JS_ClearPendingException(cx);
  return JSAPITestString("<<error converting value to string>>");
}

JSAPITestString JSAPIRuntimeTest::toSource(char c) {
  char buf[2] = {c, '\0'};
  return JSAPITestString(buf);
}

JSAPITestString JSAPIRuntimeTest::toSource(long v) {
  char buf[40];
  SprintfLiteral(buf, "%ld", v);
  return JSAPITestString(buf);
}

JSAPITestString JSAPIRuntimeTest::toSource(unsigned long v) {
  char buf[40];
  SprintfLiteral(buf, "%lu", v);
  return JSAPITestString(buf);
}

JSAPITestString JSAPIRuntimeTest::toSource(long long v) {
  char buf[40];
  SprintfLiteral(buf, "%lld", v);
  return JSAPITestString(buf);
}

JSAPITestString JSAPIRuntimeTest::toSource(unsigned long long v) {
  char buf[40];
  SprintfLiteral(buf, "%llu", v);
  return JSAPITestString(buf);
}

JSAPITestString JSAPIRuntimeTest::toSource(double d) {
  char buf[40];
  SprintfLiteral(buf, "%17lg", d);
  return JSAPITestString(buf);
}

JSAPITestString JSAPIRuntimeTest::toSource(unsigned int v) {
  return toSource((unsigned long)v);
}

JSAPITestString JSAPIRuntimeTest::toSource(int v) { return toSource((long)v); }

JSAPITestString JSAPIRuntimeTest::toSource(bool v) {
  return JSAPITestString(v ? "true" : "false");
}

JSAPITestString JSAPIRuntimeTest::toSource(JS::RegExpFlags flags) {
  JSAPITestString str;
  if (flags.hasIndices()) {
    str += "d";
  }
  if (flags.global()) {
    str += "g";
  }
  if (flags.ignoreCase()) {
    str += "i";
  }
  if (flags.multiline()) {
    str += "m";
  }
  if (flags.dotAll()) {
    str += "s";
  }
  if (flags.unicode()) {
    str += "u";
  }
  if (flags.unicodeSets()) {
    str += "v";
  }
  if (flags.sticky()) {
    str += "y";
  }
  return str;
}

JSAPITestString JSAPIRuntimeTest::toSource(JSAtom* v) {
  JS::RootedValue val(cx, JS::StringValue((JSString*)v));
  return jsvalToSource(val);
}

bool JSAPIRuntimeTest::checkSame(const JS::Value& actualArg,
                                 const JS::Value& expectedArg,
                                 const char* actualExpr,
                                 const char* expectedExpr, const char* filename,
                                 int lineno) {
  bool same = false;
  JS::RootedValue actual(cx, actualArg);
  JS::RootedValue expected(cx, expectedArg);
  if (JS::SameValue(cx, actual, expected, &same) && same) {
    return true;
  }

  fail(JSAPITestString("CHECK_SAME failed: expected JS::SameValue(cx, ") +
           actualExpr + ", " + expectedExpr + "), got !JS::SameValue(cx, " +
           jsvalToSource(actual) + ", " + jsvalToSource(expected) + ")",
       filename, lineno);
  return false;
}

void JSAPIRuntimeTest::maybeAppendException(JSAPITestString& message) {
  if (JS_IsExceptionPending(cx)) {
    message += " -- ";

    js::gc::AutoSuppressGC gcoff(cx);
    JS::RootedValue v(cx);
    JS_GetPendingException(cx, &v);
    JS_ClearPendingException(cx);
    JS::Rooted<JSString*> s(cx, JS::ToString(cx, v));
    if (s) {
      if (JS::UniqueChars bytes = JS_EncodeStringToLatin1(cx, s)) {
        message += bytes.get();
      }
    }
  }
}

/* static */
const JSClass* JSAPIRuntimeTest::basicGlobalClass() {
  static const JSClass c = {
      "global",
      JSCLASS_GLOBAL_FLAGS,
      &JS::DefaultGlobalClassOps,
  };
  return &c;
}

/* static */
void JSAPIRuntimeTest::reportWarning(JSContext* cx, JSErrorReport* report) {
  MOZ_RELEASE_ASSERT(report->isWarning());

  fprintf(stderr, "%s:%u:%s\n",
          report->filename ? report->filename.c_str() : "<no filename>",
          (unsigned int)report->lineno, report->message().c_str());
}

/* static */
bool JSAPIRuntimeTest::print(JSContext* cx, unsigned argc, JS::Value* vp) {
  JS::CallArgs args = JS::CallArgsFromVp(argc, vp);

  JS::Rooted<JSString*> str(cx);
  for (unsigned i = 0; i < args.length(); i++) {
    str = JS::ToString(cx, args[i]);
    if (!str) {
      return false;
    }
    JS::UniqueChars bytes = JS_EncodeStringToUTF8(cx, str);
    if (!bytes) {
      return false;
    }
    printf("%s%s", i ? " " : "", bytes.get());
  }

  putchar('\n');
  fflush(stdout);
  args.rval().setUndefined();
  return true;
}

bool JSAPIRuntimeTest::definePrint() {
  return JS_DefineFunction(cx, global, "print", (JSNative)print, 0, 0);
}

JSContext* JSAPIRuntimeTest::createContext() {
  JSContext* cx = JS_NewContext(8L * 1024 * 1024);
  if (!cx) {
    return nullptr;
  }
  JS::SetWarningReporter(cx, &reportWarning);
  return cx;
}

JSObject* JSAPIRuntimeTest::createGlobal(JSPrincipals* principals) {
  /* Create the global object. */
  JS::RootedObject newGlobal(cx);
  JS::RealmOptions options;
  options.creationOptions().setSharedMemoryAndAtomicsEnabled(true);
  newGlobal = JS_NewGlobalObject(cx, getGlobalClass(), principals,
                                 JS::FireOnNewGlobalHook, options);
  if (!newGlobal) {
    return nullptr;
  }

  global = newGlobal;
  return newGlobal;
}

JSAPIFrontendTest::JSAPIFrontendTest() { frontendTests.pushBack(this); }

TempFile::TempFile() : name(), stream() {}

TempFile::~TempFile() {
  if (stream) {
    close();
  }
  if (name) {
    remove();
  }
}

FILE* TempFile::open(const char* fileName) {
  stream = fopen(fileName, "wb+");
  if (!stream) {
    fprintf(stderr, "error opening temporary file '%s': %s\n", fileName,
            strerror(errno));
    exit(1);
  }
  name = fileName;
  return stream;
}

void TempFile::close() {
  if (fclose(stream) == EOF) {
    fprintf(stderr, "error closing temporary file '%s': %s\n", name,
            strerror(errno));
    exit(1);
  }
  stream = nullptr;
}

void TempFile::remove() {
  if (::remove(name) != 0) {
    fprintf(stderr, "error deleting temporary file '%s': %s\n", name,
            strerror(errno));
    exit(1);
  }
  name = nullptr;
}

TestJSPrincipals::TestJSPrincipals(int rc) { refcount = rc; }

bool TestJSPrincipals::write(JSContext* cx, JSStructuredCloneWriter* writer) {
  MOZ_CRASH("TestJSPrincipals::write not implemented");
}

ExternalData::ExternalData(const char* str)
    : contents_(strdup(str)), len_(strlen(str) + 1) {}
void ExternalData::free() {
  MOZ_ASSERT(!wasFreed());
  ::free(contents_);
  contents_ = nullptr;
}

mozilla::UniquePtr<void, JS::BufferContentsDeleter> ExternalData::pointer() {
  MOZ_ASSERT(!uniquePointerCreated_,
             "Not allowed to create multiple unique pointers to contents");
  uniquePointerCreated_ = true;
  return {contents_, {ExternalData::freeCallback, this}};
}

/* static */
void ExternalData::freeCallback(void* contents, void* userData) {
  auto self = static_cast<ExternalData*>(userData);
  MOZ_ASSERT(self->contents() == contents);
  self->free();
}

AutoGCParameter::AutoGCParameter(JSContext* cx, JSGCParamKey key,
                                 uint32_t value)
    : cx_(cx), key_(key), value_() {
  value_ = JS_GetGCParameter(cx, key);
  JS_SetGCParameter(cx, key, value);
}

AutoGCParameter::~AutoGCParameter() { JS_SetGCParameter(cx_, key_, value_); }

#ifdef JS_GC_ZEAL

AutoLeaveZeal::AutoLeaveZeal(JSContext* cx)
    : cx_(cx), zealBits_(0), frequency_(0) {
  uint32_t dummy;
  JS::GetGCZealBits(cx_, &zealBits_, &frequency_, &dummy);
  JS::SetGCZeal(cx_, 0, 0);
  JS::PrepareForFullGC(cx_);
  JS::NonIncrementalGC(cx_, JS::GCOptions::Normal, JS::GCReason::DEBUG_GC);
}

AutoLeaveZeal::~AutoLeaveZeal() {
  JS::SetGCZeal(cx_, 0, 0);
  for (size_t i = 0; i < sizeof(zealBits_) * 8; i++) {
    if (zealBits_ & (1 << i)) {
      JS::SetGCZeal(cx_, i, frequency_);
    }
  }

#  ifdef DEBUG
  uint32_t zealBitsAfter, frequencyAfter, dummy;
  JS::GetGCZealBits(cx_, &zealBitsAfter, &frequencyAfter, &dummy);
  MOZ_ASSERT(zealBitsAfter == zealBits_);
  MOZ_ASSERT(frequencyAfter == frequency_);
#  endif
}
#else

AutoLeaveZeal::AutoLeaveZeal(JSContext* cx) {}
AutoLeaveZeal::~AutoLeaveZeal() {}

#endif

struct CommandOptions {
  bool list = false;
  bool frontendOnly = false;
  bool help = false;
  const char* filter = nullptr;
};

void parseArgs(int argc, char* argv[], CommandOptions& options) {
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
      options.help = true;
      continue;
    }

    if (strcmp(argv[i], "--list") == 0) {
      options.list = true;
      continue;
    }

    if (strcmp(argv[i], "--frontend-only") == 0) {
      options.frontendOnly = true;
      continue;
    }

    if (!options.filter) {
      options.filter = argv[i];
      continue;
    }

    printf("error: Unrecognized option: %s\n", argv[i]);
    options.help = true;
  }
}

template <typename TestT>
void PrintTests(JSAPITestList<TestT> list) {
  for (TestT* test = list.getFirst(); test; test = test->next) {
    printf("%s\n", test->name());
  }
}

template <typename TestT, typename InitF, typename RunF, typename BeforeUninitF>
void RunTests(int& total, int& failures, CommandOptions& options,
              JSAPITestList<TestT> list, InitF init, RunF run,
              BeforeUninitF beforeUninit) {
  for (TestT* test = list.getFirst(); test; test = test->next) {
    const char* name = test->name();
    if (options.filter && strstr(name, options.filter) == nullptr) {
      continue;
    }

    total += 1;

    printf("%s\n", name);

    // Make sure the test name is printed before we enter the test that can
    // crash on failure.
    fflush(stdout);

    if (!init(test)) {
      printf("TEST-UNEXPECTED-FAIL | %s | Failed to initialize.\n", name);
      failures++;
      test->uninit();
      continue;
    }

    if (run(test)) {
      printf("TEST-PASS | %s | ok\n", name);
    } else {
      JSAPITestString messages = test->messages();
      printf("%s | %s | %.*s\n",
             (test->knownFail ? "TEST-KNOWN-FAIL" : "TEST-UNEXPECTED-FAIL"),
             name, (int)messages.length(), messages.begin());
      if (!test->knownFail) {
        failures++;
      }
    }

    beforeUninit(test);

    test->uninit();
  }
}

int main(int argc, char* argv[]) {
  int total = 0;
  int failures = 0;
  CommandOptions options;
  parseArgs(argc, argv, options);

  if (options.help) {
    printf("Usage: jsapi-tests [OPTIONS] [FILTER]\n");
    printf("\n");
    printf("Options:\n");
    printf("    -h, --help          Display this message\n");
    printf("        --list          List all tests\n");
    printf(
        "        --frontend-only Run tests for frontend-only APIs, with "
        "light-weight entry point\n");
    return 0;
  }

  // Override prefs for jsapi-tests.
  JS::Prefs::setAtStartup_experimental_weakrefs_expose_cleanupSome(true);
  JS::Prefs::setAtStartup_experimental_symbols_as_weakmap_keys(true);

  if (!options.frontendOnly) {
    if (!JS_Init()) {
      printf("TEST-UNEXPECTED-FAIL | jsapi-tests | JS_Init() failed.\n");
      return 1;
    }
  } else {
    if (!JS_FrontendOnlyInit()) {
      printf("TEST-UNEXPECTED-FAIL | jsapi-tests | JS_Init() failed.\n");
      return 1;
    }
  }

  if (options.list) {
    PrintTests(runtimeTests);
    PrintTests(frontendTests);
    return 0;
  }

  // Reinitializing the global for every test is quite slow, due to having to
  // recompile all self-hosted builtins. Allow tests to opt-in to reusing the
  // global.
  JSContext* maybeReusedContext = nullptr;

  if (!options.frontendOnly) {
    RunTests(
        total, failures, options, runtimeTests,
        [&maybeReusedContext](JSAPIRuntimeTest* test) {
          return test->init(maybeReusedContext);
        },
        [](JSAPIRuntimeTest* test) { return test->run(test->global); },
        [&maybeReusedContext](JSAPIRuntimeTest* test) {
          // Return a non-nullptr pointer if the context & global can safely be
          // reused for the next test.
          maybeReusedContext = test->maybeForgetContext();
        });
  }
  RunTests(
      total, failures, options, frontendTests,
      [](JSAPIFrontendTest* test) { return test->init(); },
      [](JSAPIFrontendTest* test) { return test->run(); },
      [](JSAPIFrontendTest* test) {});

  if (!options.frontendOnly) {
    JSAPIRuntimeTest::MaybeFreeContext(maybeReusedContext);

    MOZ_RELEASE_ASSERT(!JSRuntime::hasLiveRuntimes());
    JS_ShutDown();
  } else {
    JS_FrontendOnlyShutDown();
  }

  if (failures) {
    printf("\n%d unexpected failure%s.\n", failures,
           (failures == 1 ? "" : "s"));
    return 1;
  }
  printf("\nPassed: ran %d tests.\n", total);
  return 0;
}
