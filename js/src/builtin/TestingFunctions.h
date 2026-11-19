/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef builtin_TestingFunctions_h
#define builtin_TestingFunctions_h

#include "mozilla/Maybe.h"

#include <stddef.h>
#include <stdint.h>

#include "NamespaceImports.h"  // JSContext, JSFunction, HandleObject, HandleValue, Value

#include "js/AllocPolicy.h"
#include "js/Utility.h"
#include "js/Vector.h"

namespace js {

// Information about an allocated object for the startRecordingAllocations and
// stopRecordingAllocations testing functions.
struct RecordedAllocation {
  UniqueTwoByteChars typeName;
  UniqueChars className;
  UniqueTwoByteChars descriptiveTypeName;
  const char* coarseType;
  uint64_t size;
  bool inNursery;
};

using RecordedAllocations = Vector<RecordedAllocation, 0, SystemAllocPolicy>;

// State used by testing functions. Owned by the JSContext and lazily allocated
// when a testing function needs it.
struct TestingFunctionData {
  // Log of structured clone operations on objects created by makeSerializable.
  struct SerializableActivityLog {
    static constexpr size_t MaxLength = 100;
    uint32_t buffer[MaxLength];
    size_t length = 0;

    bool append(int32_t id, char action) {
      if (length + 2 > MaxLength) {
        return false;
      }
      buffer[length++] = id;
      buffer[length++] = uint32_t(action);
      return true;
    }
  };
  SerializableActivityLog serializableActivityLog;

  // Allocations recorded between startRecordingAllocations and
  // stopRecordingAllocations.
  mozilla::Maybe<RecordedAllocations> recordedAllocations;
};

[[nodiscard]] bool InitTestingFunctions();

[[nodiscard]] bool DefineTestingFunctions(JSContext* cx, HandleObject obj,
                                          bool fuzzingSafe,
                                          bool disableOOMFunctions);

[[nodiscard]] bool testingFunc_assertFloat32(JSContext* cx, unsigned argc,
                                             Value* vp);

[[nodiscard]] bool testingFunc_assertRecoveredOnBailout(JSContext* cx,
                                                        unsigned argc,
                                                        Value* vp);

[[nodiscard]] bool testingFunc_serialize(JSContext* cx, unsigned argc,
                                         Value* vp);

extern JSScript* TestingFunctionArgumentToScript(JSContext* cx, HandleValue v,
                                                 JSFunction** funp = nullptr);

#ifdef FUZZING_JS_FUZZILLI
uint32_t FuzzilliHashDouble(double value);

uint32_t FuzzilliHashBigInt(BigInt* bigInt);

void FuzzilliHashObjectInl(JSContext* cx, JSObject* obj, uint32_t* out);
void FuzzilliHashObject(JSContext* cx, JSObject* obj);
#endif

} /* namespace js */

#endif /* builtin_TestingFunctions_h */
