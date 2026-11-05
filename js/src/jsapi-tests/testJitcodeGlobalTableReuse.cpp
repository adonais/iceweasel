/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <string.h>

#include "jit/BaselineJIT.h"
#include "jit/JitCode.h"
#include "jit/JitcodeMap.h"
#include "jit/JitRuntime.h"
#include "js/GCAPI.h"
#include "js/ProfilingFrameIterator.h"
#include "js/ProfilingStack.h"
#include "jsapi-tests/tests.h"
#include "vm/JSContext.h"

#include "vm/JSScript-inl.h"

BEGIN_TEST(testJitcodeGlobalTable_sampledAddressAfterCodeReuse) {
  if (!js::jit::IsBaselineJitEnabled(cx)) {
    return true;
  }

  JS::Rooted<js::jit::JitCode*> code(
      cx, js::jit::JitCode::FromExecutable(
              cx->runtime()->jitRuntime()->baselineInterpreter().codeRaw()));
  js::jit::JitcodeGlobalTable table;
  uint8_t addresses[32];
  void* sampledAddr = addresses + 12;

  // The ranges are synthetic: no code is executed from them. Clearing the
  // JitCode pointer simulates collection before another entry reuses the range.
  auto first = js::jit::MakeJitcodeGlobalEntry<js::jit::DummyEntry>(
      cx, code, addresses + 8, addresses + 16);
  CHECK(first);
  auto* firstEntry = first.get();
  CHECK(table.addEntry(std::move(first)));
  CHECK(table.lookupForSampler(sampledAddr, 1) == firstEntry);
  CHECK(table.lookupForSampler(sampledAddr, 3) == firstEntry);
  *firstEntry->jitcodePtr() = nullptr;

  auto second = js::jit::MakeJitcodeGlobalEntry<js::jit::DummyEntry>(
      cx, code, addresses + 8, addresses + 16);
  CHECK(second);
  auto* secondEntry = second.get();
  CHECK(table.addEntry(std::move(second)));
  CHECK(checkLookup(table, sampledAddr, 1, firstEntry, 3));
  CHECK(checkLookup(table, sampledAddr, 4, secondEntry, UINT64_MAX));
  CHECK(table.lookupForSampler(sampledAddr, 5) == secondEntry);
  CHECK(table.lookupForSampler(sampledAddr, 7) == secondEntry);
  CHECK(checkLookup(table, sampledAddr, 3, firstEntry, 3));
  CHECK(checkLookup(table, sampledAddr, 5, secondEntry, UINT64_MAX));
  *secondEntry->jitcodePtr() = nullptr;

  auto third = js::jit::MakeJitcodeGlobalEntry<js::jit::DummyEntry>(
      cx, code, addresses + 10, addresses + 24);
  CHECK(third);
  auto* thirdEntry = third.get();
  CHECK(table.addEntry(std::move(third)));
  CHECK(table.lookupForSampler(sampledAddr, 9) == thirdEntry);
  CHECK(checkLookup(table, sampledAddr, 3, firstEntry, 3));
  CHECK(checkLookup(table, sampledAddr, 5, secondEntry, 7));
  CHECK(checkLookup(table, sampledAddr, 7, secondEntry, 7));
  CHECK(checkLookup(table, sampledAddr, 9, thirdEntry, UINT64_MAX));
  CHECK(checkLookup(table, addresses + 8, 3, firstEntry, 3));
  return true;
}

bool checkLookup(js::jit::JitcodeGlobalTable& table, void* addr,
                 uint64_t samplePos, js::jit::JitcodeGlobalEntry* expected,
                 uint64_t expectedLastSamplePos) {
  uint64_t lastSamplePos;
  CHECK(table.lookupForSamplePosition(addr, samplePos, &lastSamplePos) ==
        expected);
  CHECK_EQUAL(lastSamplePos, expectedLastSamplePos);
  return true;
}
END_TEST(testJitcodeGlobalTable_sampledAddressAfterCodeReuse)

BEGIN_TEST(testJitcodeGlobalTable_sampledAddressAfterGC) {
  if (!js::jit::IsBaselineJitEnabled(cx)) {
    return true;
  }

  js::SetContextProfilingStack(cx, &profilingStack);
  js::EnableContextProfilingStack(cx, true);
  CHECK(cx->runtime()->jitRuntime()->isProfilerInstrumentationEnabled(
      cx->runtime()));

  EXEC(
      "function victim(x) { return x + 1; }"
      "for (var i = 0; i < 200; i++) victim(i);");
  JS::RootedValue function(cx);
  EVAL("victim", &function);
  JS::Rooted<JSScript*> script(
      cx, function.toObject().as<JSFunction>().nonLazyScript());
  CHECK(script->hasBaselineScript());

  js::jit::JitCode* code = script->baselineScript()->method();
  void* sampledAddr = code->raw() + (code->rawEnd() - code->raw()) / 2;
  js::jit::JitcodeGlobalTable* table =
      cx->runtime()->jitRuntime()->getJitcodeGlobalTable();

  // The buffer range start stays at 0, so this sample is never evicted.
  CHECK(table->lookupForSampler(sampledAddr, 1));
  CHECK(resolvesToVictim(sampledAddr));

  JS::PrepareForFullGC(cx);
  JS::NonIncrementalGC(cx, JS::GCOptions::Shrink, JS::GCReason::API);
  CHECK(!script->hasBaselineScript());
  CHECK(resolvesToVictim(sampledAddr));
  return true;
}

ProfilingStack profilingStack;

bool resolvesToVictim(void* addr) {
  uint32_t frameCount = 0;
  for (JS::ProfiledFrameHandle handle : JS::GetProfiledFrames(cx, addr, 1)) {
    CHECK(handle.label());
    CHECK(strncmp(handle.label(), "victim ", 7) == 0);
    frameCount++;
  }
  CHECK_EQUAL(frameCount, 1u);
  return true;
}

void uninit() override {
  js::EnableContextProfilingStack(cx, false);
  js::SetContextProfilingStack(cx, nullptr);
  RuntimeTest::uninit();
}
END_TEST(testJitcodeGlobalTable_sampledAddressAfterGC)
