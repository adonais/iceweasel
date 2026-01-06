/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "jit/StubFolding.h"

#include "mozilla/Maybe.h"

#include "gc/GC.h"
#include "jit/BaselineCacheIRCompiler.h"
#include "jit/BaselineIC.h"
#include "jit/CacheIR.h"
#include "jit/CacheIRCloner.h"
#include "jit/CacheIRCompiler.h"
#include "jit/CacheIRSpewer.h"
#include "jit/CacheIRWriter.h"
#include "jit/JitScript.h"
#include "jit/ShapeList.h"

#include "vm/List-inl.h"

using namespace js;
using namespace js::jit;

bool js::jit::TryFoldingStubs(JSContext* cx, ICFallbackStub* fallback,
                              JSScript* script, ICScript* icScript) {
  ICEntry* icEntry = icScript->icEntryForStub(fallback);
  ICStub* entryStub = icEntry->firstStub();

  // Don't fold unless there are at least two stubs.
  if (entryStub == fallback) {
    return true;
  }
  ICCacheIRStub* firstStub = entryStub->toCacheIRStub();
  if (firstStub->next()->isFallback()) {
    return true;
  }

  const uint8_t* firstStubData = firstStub->stubDataStart();
  const CacheIRStubInfo* stubInfo = firstStub->stubInfo();

  // Check to see if:
  //   a) all of the stubs in this chain have the exact same code.
  //   b) all of the stubs have the same stub field data, except
  //      for a single GuardShape where they differ.
  //   c) at least one stub after the first has a non-zero entry count.
  //   d) All shapes in the GuardShape have the same realm.
  //
  // If all of these conditions hold, then we generate a single stub
  // that covers all the existing cases by replacing GuardShape with
  // GuardMultipleShapes.

  uint32_t numActive = 0;
  mozilla::Maybe<uint32_t> foldableFieldOffset;
  GCVector<Value, 8> shapeList(cx);

  // Try to add a shape to the list. Can fail on OOM or for cross-realm shapes.
  // Returns true if the shape was successfully added to the list, and false
  // (with no pending exception) otherwise.
  auto addShape = [&shapeList, cx](uintptr_t rawShape) -> bool {
    Shape* shape = reinterpret_cast<Shape*>(rawShape);
    // Only add same realm shapes.
    if (shape->realm() != cx->realm()) {
      return false;
    }

    gc::ReadBarrier(shape);

    if (!shapeList.append(PrivateValue(shape))) {
      cx->recoverFromOutOfMemory();
      return false;
    }
    return true;
  };

  for (ICCacheIRStub* other = firstStub->nextCacheIR(); other;
       other = other->nextCacheIR()) {
    // Verify that the stubs share the same code.
    if (other->stubInfo() != stubInfo) {
      return true;
    }
    const uint8_t* otherStubData = other->stubDataStart();

    if (other->enteredCount() > 0) {
      numActive++;
    }

    uint32_t fieldIndex = 0;
    size_t offset = 0;
    while (stubInfo->fieldType(fieldIndex) != StubField::Type::Limit) {
      StubField::Type fieldType = stubInfo->fieldType(fieldIndex);

      if (StubField::sizeIsWord(fieldType)) {
        uintptr_t firstRaw = stubInfo->getStubRawWord(firstStubData, offset);
        uintptr_t otherRaw = stubInfo->getStubRawWord(otherStubData, offset);

        if (firstRaw != otherRaw) {
          if (fieldType != StubField::Type::WeakShape) {
            // Case 1: a field differs that is not a Shape. We only support
            // folding GuardShape to GuardMultipleShapes.
            return true;
          }
          if (foldableFieldOffset.isNothing()) {
            // Case 2: this is the first field where the stub data differs.
            foldableFieldOffset.emplace(offset);
            if (!addShape(firstRaw) || !addShape(otherRaw)) {
              return true;
            }
          } else if (*foldableFieldOffset == offset) {
            // Case 3: this is the corresponding offset in a different stub.
            if (!addShape(otherRaw)) {
              return true;
            }
          } else {
            // Case 4: we have found more than one field that differs.
            return true;
          }
        }
      } else {
        MOZ_ASSERT(StubField::sizeIsInt64(fieldType));

        // We do not support folding any ops with int64-sized fields.
        if (stubInfo->getStubRawInt64(firstStubData, offset) !=
            stubInfo->getStubRawInt64(otherStubData, offset)) {
          return true;
        }
      }

      offset += StubField::sizeInBytes(fieldType);
      fieldIndex++;
    }

    // We should never attach two completely identical stubs.
    MOZ_ASSERT(foldableFieldOffset.isSome());
  }

  if (numActive == 0) {
    return true;
  }

  // Clone the CacheIR, replacing GuardShape with GuardMultipleShapes.
  CacheIRWriter writer(cx);
  CacheIRReader reader(stubInfo);
  CacheIRCloner cloner(firstStub);

  // Initialize the operands.
  CacheKind cacheKind = stubInfo->kind();
  for (uint32_t i = 0; i < NumInputsForCacheKind(cacheKind); i++) {
    writer.setInputOperandId(i);
  }

  bool success = false;
  while (reader.more()) {
    CacheOp op = reader.readOp();
    switch (op) {
      case CacheOp::GuardShape: {
        auto [objId, shapeOffset] = reader.argsForGuardShape();
        if (shapeOffset == *foldableFieldOffset) {
          // Ensure that the allocation of the ShapeListObject doesn't trigger a
          // GC and free the stubInfo we're currently reading. Note that
          // AutoKeepJitScripts isn't sufficient, because optimized stubs can be
          // discarded even if the JitScript is preserved.
          gc::AutoSuppressGC suppressGC(cx);

          Rooted<ShapeListObject*> shapeObj(cx, ShapeListObject::create(cx));
          if (!shapeObj) {
            return false;
          }
          for (uint32_t i = 0; i < shapeList.length(); i++) {
            if (!shapeObj->append(cx, shapeList[i])) {
              return false;
            }

            MOZ_ASSERT(static_cast<Shape*>(shapeList[i].toPrivate())->realm() ==
                       shapeObj->realm());
          }

          writer.guardMultipleShapes(objId, shapeObj);
          success = true;
        } else {
          WeakHeapPtr<Shape*>& ptr =
              stubInfo->getStubField<StubField::Type::WeakShape>(firstStub,
                                                                 shapeOffset);
          writer.guardShape(objId, ptr.unbarrieredGet());
        }
        break;
      }
      default:
        cloner.cloneOp(op, reader, writer);
        break;
    }
  }
  if (!success) {
    // If the shape field that differed was not part of a GuardShape,
    // we can't fold these stubs together.
    return true;
  }

  // Replace the existing stubs with the new folded stub.
  fallback->discardStubs(cx->zone(), icEntry);

  ICAttachResult result = AttachBaselineCacheIRStub(
      cx, writer, cacheKind, script, icScript, fallback, "StubFold");
  if (result == ICAttachResult::OOM) {
    ReportOutOfMemory(cx);
    return false;
  }
  MOZ_ASSERT(result == ICAttachResult::Attached);

  JitSpew(JitSpew_StubFolding,
          "Folded stub at offset %u (icScript: %p) with %zu shapes (%s:%u:%u)",
          fallback->pcOffset(), icScript, shapeList.length(),
          script->filename(), script->lineno(),
          script->column().oneOriginValue());

  fallback->setMayHaveFoldedStub();
  return true;
}

bool js::jit::AddToFoldedStub(JSContext* cx, const CacheIRWriter& writer,
                              ICScript* icScript, ICFallbackStub* fallback) {
  ICEntry* icEntry = icScript->icEntryForStub(fallback);
  ICStub* entryStub = icEntry->firstStub();

  // We only update folded stubs if they're the only stub in the IC.
  if (entryStub == fallback) {
    return false;
  }
  ICCacheIRStub* stub = entryStub->toCacheIRStub();
  if (!stub->next()->isFallback()) {
    return false;
  }

  const CacheIRStubInfo* stubInfo = stub->stubInfo();
  const uint8_t* stubData = stub->stubDataStart();

  mozilla::Maybe<uint32_t> shapeFieldOffset;
  RootedValue newShape(cx);
  Rooted<ShapeListObject*> foldedShapes(cx);

  CacheIRReader stubReader(stubInfo);
  CacheIRReader newReader(writer);
  while (newReader.more() && stubReader.more()) {
    CacheOp newOp = newReader.readOp();
    CacheOp stubOp = stubReader.readOp();
    switch (stubOp) {
      case CacheOp::GuardMultipleShapes: {
        // Check that the new stub has a corresponding GuardShape.
        if (newOp != CacheOp::GuardShape) {
          return false;
        }

        // Check that the object being guarded is the same.
        if (newReader.objOperandId() != stubReader.objOperandId()) {
          return false;
        }

        // Check that the field offset is the same.
        uint32_t newShapeOffset = newReader.stubOffset();
        uint32_t stubShapesOffset = stubReader.stubOffset();
        if (newShapeOffset != stubShapesOffset) {
          return false;
        }
        MOZ_ASSERT(shapeFieldOffset.isNothing());
        shapeFieldOffset.emplace(newShapeOffset);

        // Get the shape from the new stub
        StubField shapeField =
            writer.readStubField(newShapeOffset, StubField::Type::WeakShape);
        Shape* shape = reinterpret_cast<Shape*>(shapeField.asWord());
        newShape = PrivateValue(shape);

        // Get the shape array from the old stub.
        JSObject* shapeList = stubInfo->getStubField<StubField::Type::JSObject>(
            stub, stubShapesOffset);
        foldedShapes = &shapeList->as<ShapeListObject>();
        MOZ_ASSERT(foldedShapes->compartment() == shape->compartment());

        // Don't add a shape if it's from a different realm than the first
        // shape.
        //
        // Since the list was created in the realm which guarded all the shapes
        // added to it, we can use its realm to check and ensure we're not
        // adding a cross-realm shape.
        //
        // The assert verifies this property by checking the first element has
        // the same realm (and since everything in the list has the same realm,
        // checking the first element suffices)
        Realm* shapesRealm = foldedShapes->realm();
        MOZ_ASSERT_IF(!foldedShapes->isEmpty(),
                      foldedShapes->getUnbarriered(0)->realm() == shapesRealm);
        if (shapesRealm != shape->realm()) {
          return false;
        }

        break;
      }
      default: {
        // Check that the op is the same.
        if (newOp != stubOp) {
          return false;
        }

        // Check that the arguments are the same.
        uint32_t argLength = CacheIROpInfos[size_t(newOp)].argLength;
        for (uint32_t i = 0; i < argLength; i++) {
          if (newReader.readByte() != stubReader.readByte()) {
            return false;
          }
        }
      }
    }
  }

  if (shapeFieldOffset.isNothing()) {
    // The stub did not contain the GuardMultipleShapes op. This can happen if a
    // folded stub has been discarded by GC sweeping.
    return false;
  }

  // Check to verify that all the other stub fields are the same.
  if (!writer.stubDataEqualsIgnoring(stubData, *shapeFieldOffset)) {
    return false;
  }

  // Limit the maximum number of shapes we will add before giving up.
  // If we give up, transition the stub.
  if (foldedShapes->length() == ShapeListObject::MaxLength) {
    MOZ_ASSERT(fallback->state().mode() != ICState::Mode::Generic);
    fallback->state().forceTransition();
    fallback->discardStubs(cx->zone(), icEntry);
    return false;
  }

  if (!foldedShapes->append(cx, newShape)) {
    cx->recoverFromOutOfMemory();
    return false;
  }

  JitSpew(JitSpew_StubFolding, "ShapeListObject %p: new length: %u",
          foldedShapes.get(), foldedShapes->length());

  return true;
}
