/*
 * Copyright 2019 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "wasm/WasmGC.h"

#include "wasm/WasmInstance.h"
#include "wasm/WasmSummarizeInsn.h"

#include "jit/MacroAssembler-inl.h"

using namespace js;
using namespace js::jit;
using namespace js::wasm;

// Generate a stackmap for a function's stack-overflow-at-entry trap, with
// the structure:
//
//    <reg dump area>
//    |       ++ <space reserved before trap, if any>
//    |               ++ <space for Frame>
//    |                       ++ <inbound arg area>
//    |                                           |
//    Lowest Addr                                 Highest Addr
//
// The caller owns the resulting stackmap.  This assumes a grow-down stack.
//
// For non-debug builds, if the stackmap would contain no pointers, no
// stackmap is created, and nullptr is returned.  For a debug build, a
// stackmap is always created and returned.
//
// The "space reserved before trap" is the space reserved by
// MacroAssembler::wasmReserveStackChecked, in the case where the frame is
// "small", as determined by that function.
bool wasm::CreateStackMapForFunctionEntryTrap(
    const wasm::ArgTypeVector& argTypes, const RegisterOffsets& trapExitLayout,
    size_t trapExitLayoutWords, size_t nBytesReservedBeforeTrap,
    size_t nInboundStackArgBytes, wasm::StackMaps& stackMaps,
    wasm::StackMap** result) {
  // Ensure this is defined on all return paths.
  *result = nullptr;

  // The size of the wasm::Frame itself.
  const size_t nFrameBytes = sizeof(wasm::Frame);

  // The size of the register dump (trap) area.
  const size_t trapExitLayoutBytes = trapExitLayoutWords * sizeof(void*);

  // The stack map owns any alignment padding for incoming stack args.
  MOZ_ASSERT(nInboundStackArgBytes % sizeof(void*) == 0);
  const size_t nInboundStackArgBytesAligned =
      AlignStackArgAreaSize(nInboundStackArgBytes);
  const size_t numStackArgWords = nInboundStackArgBytesAligned / sizeof(void*);

  // This is the total number of bytes covered by the map.
  const size_t nTotalBytes = trapExitLayoutBytes + nBytesReservedBeforeTrap +
                             nFrameBytes + nInboundStackArgBytesAligned;

#ifndef DEBUG
  bool hasRefs = false;
  for (ABIArgIter i(argTypes, ABIKind::Wasm); !i.done(); i++) {
    if (i.mirType() == MIRType::WasmAnyRef) {
      hasRefs = true;
      break;
    }
  }

  // There are no references, and this is a non-debug build, so don't bother
  // building the stackmap.
  if (!hasRefs) {
    return true;
  }
#endif

  wasm::StackMap* stackMap = stackMaps.create(nTotalBytes / sizeof(void*));
  if (!stackMap) {
    return false;
  }
  stackMap->setExitStubWords(trapExitLayoutWords);
  stackMap->setFrameOffsetFromTop(nFrameBytes / sizeof(void*) +
                                  numStackArgWords);

  // REG DUMP AREA
  wasm::ExitStubMapVector trapExitExtras;
  if (!GenerateStackmapEntriesForTrapExit(
          argTypes, trapExitLayout, trapExitLayoutWords, &trapExitExtras)) {
    return false;
  }
  MOZ_ASSERT(trapExitExtras.length() == trapExitLayoutWords);

  for (size_t i = 0; i < trapExitLayoutWords; i++) {
    if (trapExitExtras[i]) {
      stackMap->set(i, wasm::StackMap::AnyRef);
    }
  }

  // INBOUND ARG AREA
  const size_t stackArgOffset =
      (trapExitLayoutBytes + nBytesReservedBeforeTrap + nFrameBytes) /
      sizeof(void*);
  for (ABIArgIter i(argTypes, ABIKind::Wasm); !i.done(); i++) {
    ABIArg argLoc = *i;
    if (argLoc.kind() == ABIArg::Stack &&
        argTypes[i.index()] == MIRType::WasmAnyRef) {
      uint32_t offset = argLoc.offsetFromArgBase();
      MOZ_ASSERT(offset < nInboundStackArgBytes);
      MOZ_ASSERT(offset % sizeof(void*) == 0);
      stackMap->set(stackArgOffset + offset / sizeof(void*),
                    wasm::StackMap::AnyRef);
    }
  }

#ifdef DEBUG
  for (uint32_t i = 0; i < nFrameBytes / sizeof(void*); i++) {
    MOZ_ASSERT(stackMap->get(stackMap->header.numMappedWords -
                             stackMap->header.frameOffsetFromTop + i) ==
               StackMap::Kind::POD);
  }
#endif

  *result = stackMaps.finalize(stackMap);
  return true;
}

#ifdef JS_JITSPEW
void StackMap::show(uint32_t codeOffset) const {
  uint32_t nWords = numMappedWords();
  uint32_t nTotal = nWords + 64;
  char* str = (char*)js_malloc(nTotal);
  if (!str) {
    return;
  }
  memset(str, 0, nTotal);
  snprintf(str, nTotal, "%u words: LO{ ", nWords);
  uint32_t offs = strlen(str);
  for (uint32_t i = 0; i < nWords; i++) {
    char c = '.';
    switch (get(i)) {
      case StackMap::Kind::POD:
        break;
      case StackMap::Kind::AnyRef:
        c = 'R';
        break;
      case StackMap::Kind::StructDataPointer:
        c = 'S';
        break;
      case StackMap::Kind::ArrayDataPointer:
        c = 'A';
        break;
      case StackMap::Kind::Limit:
      default:
        MOZ_CRASH();
    }
    MOZ_RELEASE_ASSERT(offs < nTotal);
    str[offs++] = c;
  }
  snprintf(&str[offs], nTotal - offs, " }HI");
  MOZ_RELEASE_ASSERT(str[nTotal - 1] == 0);
  JitSpew(jit::JitSpew_Codegen, "%06x  # <-- @ w::StackMap: %s", codeOffset,
          str);
  js_free(str);
}

const char* wasm::NameOfTrap(Trap t) {
  switch (t) {
    case Trap::Unreachable:
      return "Unreachable";
    case Trap::IntegerOverflow:
      return "IntegerOverflow";
    case Trap::InvalidConversionToInteger:
      return "InvalidConversionToInteger";
    case Trap::IntegerDivideByZero:
      return "IntegerDivideByZero";
    case Trap::OutOfBounds:
      return "OutOfBounds";
    case Trap::UnalignedAccess:
      return "UnalignedAccess";
    case Trap::IndirectCallToNull:
      return "IndirectCallToNull";
    case Trap::IndirectCallBadSig:
      return "IndirectCallBadSig";
    case Trap::NullPointerDereference:
      return "NullPointerDereference";
    case Trap::BadCast:
      return "BadCast";
    case Trap::StackOverflow:
      return "StackOverflow";
    case Trap::CheckInterrupt:
      return "CheckInterrupt";
#  ifdef ENABLE_WASM_JSPI
    case Trap::ThrowSuspendError:
      return "ThrowSuspendError";
#  endif
    case Trap::Unimplemented:
      return "Unimplemented";
    case Trap::ThrowReported:
      return "ThrowReported";
    case Trap::Limit:
      return "Limit";
    default:
      MOZ_CRASH();
  }
}
#endif

bool wasm::TrapMightResume(Trap t) {
  switch (t) {
    case Trap::CheckInterrupt:
      return true;
    case Trap::Unreachable:
    case Trap::IntegerOverflow:
    case Trap::InvalidConversionToInteger:
    case Trap::IntegerDivideByZero:
    case Trap::OutOfBounds:
    case Trap::UnalignedAccess:
    case Trap::IndirectCallToNull:
    case Trap::IndirectCallBadSig:
    case Trap::NullPointerDereference:
    case Trap::BadCast:
    case Trap::StackOverflow:
#ifdef ENABLE_WASM_JSPI
    case Trap::ThrowSuspendError:
#endif
    case Trap::Unimplemented:
    case Trap::ThrowReported:
      return false;
    case Trap::Limit:
      break;
  }
  MOZ_CRASH();
}

bool wasm::GenerateStackmapEntriesForTrapExit(
    const ArgTypeVector& args, const RegisterOffsets& trapExitLayout,
    const size_t trapExitLayoutNumWords, ExitStubMapVector* extras) {
  MOZ_ASSERT(extras->empty());

  if (!extras->appendN(false, trapExitLayoutNumWords)) {
    return false;
  }

  for (ABIArgIter i(args, ABIKind::Wasm); !i.done(); i++) {
    if (!i->argInRegister() || i.mirType() != MIRType::WasmAnyRef) {
      continue;
    }

    size_t offsetFromTop = trapExitLayout.getOffset(i->gpr());

    // If this doesn't hold, the associated register wasn't saved by
    // the trap exit stub.  Better to crash now than much later, in
    // some obscure place, and possibly with security consequences.
    MOZ_RELEASE_ASSERT(offsetFromTop < trapExitLayoutNumWords);

    // offsetFromTop is an offset in words down from the highest
    // address in the exit stub save area.  Switch it around to be an
    // offset up from the bottom of the (integer register) save area.
    size_t offsetFromBottom = trapExitLayoutNumWords - 1 - offsetFromTop;

    (*extras)[offsetFromBottom] = true;
  }

  return true;
}

template <class Addr>
void wasm::EmitWasmPreBarrierGuard(MacroAssembler& masm, Register instance,
                                   Register scratch, Addr addr,
                                   Label* skipBarrier,
                                   MaybeTrapSiteDesc trapSiteDesc) {
  // If no incremental GC has started, we don't need the barrier.
  masm.loadPtr(
      Address(instance, Instance::offsetOfAddressOfNeedsMarkingBarrier()),
      scratch);
  masm.branchTest32(Assembler::Zero, Address(scratch, 0), Imm32(0x1),
                    skipBarrier);

  // If the previous value is not a GC thing, we don't need the barrier.
  FaultingCodeRange fcr = masm.loadPtr(addr, scratch);
  masm.branchWasmAnyRefIsGCThing(false, scratch, skipBarrier);

  // Emit metadata for a potential null access when reading the previous value.
  if (trapSiteDesc) {
    masm.appendAndVerify(wasm::Trap::NullPointerDereference,
                         TrapMachineInsnForLoadWord(), fcr, *trapSiteDesc);
  }
}

template void wasm::EmitWasmPreBarrierGuard<Address>(
    MacroAssembler& masm, Register instance, Register scratch, Address addr,
    Label* skipBarrier, MaybeTrapSiteDesc trapSiteDesc);
template void wasm::EmitWasmPreBarrierGuard<BaseIndex>(
    MacroAssembler& masm, Register instance, Register scratch, BaseIndex addr,
    Label* skipBarrier, MaybeTrapSiteDesc trapSiteDesc);

void wasm::EmitWasmPreBarrierCallImmediate(MacroAssembler& masm,
                                           Register instance, Register scratch,
                                           Register valueAddr,
                                           size_t valueOffset) {
  MOZ_ASSERT(valueAddr == PreBarrierReg);

  // Add the offset to the PreBarrierReg, if any.
  if (valueOffset != 0) {
    masm.addPtr(Imm32(valueOffset), valueAddr);
  }

#if defined(DEBUG) && defined(JS_CODEGEN_ARM64)
  // The prebarrier assumes that x20 == sp.
  Label ok;
  masm.Cmp(sp, vixl::Operand(x20));
  masm.B(&ok, Assembler::Equal);
  masm.breakpoint();
  masm.bind(&ok);
#endif

  // Load and call the pre-write barrier code. It will preserve all volatile
  // registers.
  masm.loadPtr(Address(instance, Instance::offsetOfPreBarrierCode()), scratch);
  masm.call(scratch);

  // Remove the offset we folded into PreBarrierReg, if any.
  if (valueOffset != 0) {
    masm.subPtr(Imm32(valueOffset), valueAddr);
  }
}

void wasm::EmitWasmPreBarrierCallIndex(MacroAssembler& masm, Register instance,
                                       Register scratch1, Register scratch2,
                                       BaseIndex addr) {
  MOZ_ASSERT(addr.base == PreBarrierReg);

  // Save the original base so we can restore it later.
  masm.movePtr(AsRegister(addr.base), scratch2);

  // Compute the final address into PrebarrierReg, as the barrier expects it
  // there.
  masm.computeEffectiveAddress(addr, PreBarrierReg);

#if defined(DEBUG) && defined(JS_CODEGEN_ARM64)
  // The prebarrier assumes that x20 == sp.
  Label ok;
  masm.Cmp(sp, vixl::Operand(x20));
  masm.B(&ok, Assembler::Equal);
  masm.breakpoint();
  masm.bind(&ok);
#endif

  // Load and call the pre-write barrier code. It will preserve all volatile
  // registers.
  masm.loadPtr(Address(instance, Instance::offsetOfPreBarrierCode()), scratch1);
  masm.call(scratch1);

  // Restore the original base
  masm.movePtr(scratch2, AsRegister(addr.base));
}

#ifdef ENABLE_WASM_JSPI
void wasm::EmitWasmResumeBarrierGuard(MacroAssembler& masm, Register instance,
                                      Register scratch, Label* enterBarrier) {
  // If an incremental GC has started, we need the barrier.
  masm.loadPtr(
      Address(instance, Instance::offsetOfAddressOfNeedsMarkingBarrier()),
      scratch);
  masm.branchTest32(Assembler::NonZero, Address(scratch, 0), Imm32(0x1),
                    enterBarrier);
}

void wasm::EmitWasmResumeBarrier(MacroAssembler& masm, Register instance,
                                 Register cont) {
  // The builtin thunk will assume that instance is in InstanceReg.
  MOZ_ASSERT(instance == InstanceReg);

  // Reserve stack space for the call.
  unsigned argDecrement;
  {
    ABIArgGenerator abi(ABIKind::Wasm);
    ABIArg arg;
    arg = abi.next(MIRType::Pointer);
    argDecrement = StackDecrementForCall(
        WasmStackAlignment, sizeof(wasm::Frame) + masm.framePushed(),
        abi.stackBytesConsumedSoFar());
  }
  masm.reserveStack(argDecrement);
  masm.assertStackAlignment(WasmStackAlignment);

  // Pass the cont argument.
  ABIArgGenerator abi(ABIKind::Wasm);
  ABIArg arg;
  arg = abi.next(MIRType::Pointer);
  if (arg.kind() == ABIArg::GPR) {
    masm.movePtr(cont, arg.gpr());
  } else {
    MOZ_ASSERT(arg.kind() == ABIArg::Stack);
    masm.storePtr(cont,
                  Address(masm.getStackPointer(), arg.offsetFromArgBase()));
  }

  masm.storePtr(InstanceReg, Address(masm.getStackPointer(),
                                     WasmCallerInstanceOffsetBeforeCall));

  masm.call(SymbolicAddress::ResumeBarrier);

  masm.freeStack(argDecrement);
}
#endif

void wasm::EmitWasmPostBarrierGuard(MacroAssembler& masm,
                                    const mozilla::Maybe<Register>& object,
                                    Register otherScratch, Register setValue,
                                    Label* skipBarrier) {
  // If the pointer being stored is to a tenured object, no barrier.
  masm.branchWasmAnyRefIsNurseryCell(false, setValue, otherScratch,
                                     skipBarrier);

  // If there is a containing object and it is in the nursery, no barrier.
  if (object) {
    masm.branchPtrInNurseryChunk(Assembler::Equal, *object, otherScratch,
                                 skipBarrier);
  }
}

void wasm::CheckWholeCellLastElementCache(MacroAssembler& masm,
                                          Register instance, Register object,
                                          Register temp, Label* skipBarrier) {
  masm.loadPtr(
      Address(instance,
              wasm::Instance::offsetOfAddressOfLastBufferedWholeCell()),
      temp);
  masm.branchPtr(Assembler::Equal, Address(temp, 0), object, skipBarrier);
}

#ifdef DEBUG
bool wasm::IsPlausibleStackMapKey(const uint8_t* base,
                                  uint32_t stackmapOffset) {
  // See block comment at the declaration of this function for explanation.
  const uint8_t* nextPC = base + size_t(stackmapOffset);

  // Most stackmaps are associated with call instructions.  Look backwards to
  // see if that's plausible, while being aware of the limitations described in
  // the abovementioned block comment, at least for targets with variable-length
  // insn encodings (x86, x64, Arm-Thumb2 [which we don't generate],
  // RiscV-compressed [which we don't currently generate]).

#  if defined(JS_CODEGEN_X64) || defined(JS_CODEGEN_X86)
  const uint8_t* insn = nextPC;
  if ((insn[-2] == 0xFF && (insn[-1] & 0xF8) == 0xD0) ||  // call *%r_
      insn[-5] == 0xE8) {                                 // call simm32
    return true;
  }

#  elif defined(JS_CODEGEN_ARM64)
  if ((uintptr_t(nextPC) & 3) != 0) {
    return false;  // misaligned
  }
  const uint32_t* insn = (const uint32_t*)nextPC;
  if (((insn[-1] & 0xfffffc1f) == 0xd63f0000) ||  // blr reg
      ((insn[-1] & 0xfc000000) == 0x94000000)) {  // bl simm26
    return true;
  }

#  elif defined(JS_CODEGEN_ARM)
  if ((uintptr_t(nextPC) & 3) != 0) {
    return false;  // misaligned or Thumb
  }
  const uint32_t* insn = (const uint32_t*)nextPC;
  if (((insn[-1] & 0xfffffff0) == 0xe12fff30) ||  // blx reg (ARM, enc A1)
      ((insn[-1] & 0x0f000000) == 0x0b000000)) {  // bl.cc simm24 (ARM, enc A1)
    return true;
  }

#  elif defined(JS_CODEGEN_RISCV64)
  if ((uintptr_t(nextPC) & 3) != 0) {
    return false;  // misaligned
  }
  const uint32_t* insn = (const uint32_t*)nextPC;
  if (((insn[-1] & kBaseOpcodeMask) == JALR) ||  // jalr
      ((insn[-1] & kBaseOpcodeMask) == JAL) ||   // jal
      ((insn[-2] & kBaseOpcodeMask) == JAL &&
       insn[-1] == 0x00000013 /* addi zero, zero, 0 */)) {  // jal; nop
    return true;
  }

#  elif defined(JS_CODEGEN_MIPS64)
  // TODO (bug 1699696): Implement this.  As with the platforms above, we need
  // to identify call instructions that we generate.
  // FIXME (also for Loong64): this should be implemented properly.  Not doing
  // so increases the likelyhood of the trap/stackmap machinery having
  // undetected bugs on these targets.
  return true;

#  elif defined(JS_CODEGEN_LOONG64)
  // TODO(loong64): Implement IsValidStackMapKey.
  return true;

#  else
  MOZ_CRASH(
      "IsValidStackMapKey: call-instruction identification "
      "requires implementation on this platform");
#  endif

  // It's not associated with a call instruction, so it must instead be
  // associated with some instruction that can trap.  We can check that by using
  // SummarizeTrapInstruction, and for that we need the start point of the
  // instruction, but what we have to hand is the start point of the following
  // instruction.  So the best we can do is to use SummarizeTrapInstruction to
  // inspect up to one-instruction-length's worth of byte offsets before
  // `nextPC`, to see if any of them is a trapping instruction of the right kind
  // and length.

  // The minimum and maximum instruction lengths we are looking for, with
  // clamping so we don't back up into negative offset land.
  uint32_t minLen =
      std::min(stackmapOffset, FaultingCodeRange::minInsnLength());
  uint32_t maxLen =
      std::min(stackmapOffset, FaultingCodeRange::maxInsnLength());

  uint32_t len = 0;
  bool found = false;
  SummarizeResult summary;

  // Inspect instructions in `nextPC -minLen, -(minLen+1), .. -maxLen`, to see
  // if any of them are a trapping instruction of the right kind.
  for (len = minLen; len <= maxLen; len++) {
    const uint8_t* maybeTrappingInsn = (uint8_t*)nextPC - len;
    summary = SummarizeTrapInstruction(maybeTrappingInsn);
    if (!summary.identified()) {
      // Wasn't identified.  In effect, not found.
      continue;
    }
    if (summary.length() != len) {
      // Was identified, but is the wrong length.
      continue;
    }
    // So we've found something plausible.
    found = true;
    MOZ_ASSERT(maybeTrappingInsn + len == nextPC);
    break;
  }

  if (!found) {
    // There's no mention of a trapping instruction that immediately precedes
    // `nextPC`.  Give up.  Note that we can also get here if
    // SummarizeTrapInstruction fails to identify a valid trapping insn, or
    // fails to compute its length.  That would be a bug in
    // SummarizeTrapInstruction, which should be fixed.
    return false;
  }

  // The instruction was identified and has the right length.
  MOZ_ASSERT(summary.kind() != TrapMachineInsn::INVALID);
  return true;
}
#endif

void StackMaps::checkInvariants(const uint8_t* base) const {
#ifdef DEBUG
  // Check that each entry in the stackmap hash table points to a plausible
  // instruction.
  for (auto iter = codeOffsetToStackMap_.iter(); !iter.done(); iter.next()) {
    MOZ_ASSERT(IsPlausibleStackMapKey(base, iter.get().key()),
               "wasm stackmap does not reference a valid insn");
  }
#endif
}

#ifdef DEBUG
void wasm::CheckStackMapsForTraps(const jit::MacroAssembler& masm,
                                  const StackMaps& stackMaps,
                                  const TrapSitesFrontierArray& trapSitesBefore,
                                  const TrapSitesFrontierArray& trapSitesAfter,
                                  bool (*checkThisTrapKind)(Trap)) {
  // Collect some stats
  uint32_t numTrapsTotal = 0;
  uint32_t numTrapsToCheck = 0;
  for (Trap kind : mozilla::MakeEnumeratedRange(Trap::Limit)) {
    MOZ_ASSERT(trapSitesBefore[kind] <= trapSitesAfter[kind]);
    size_t kindCount = trapSitesAfter[kind] - trapSitesBefore[kind];
    numTrapsTotal += kindCount;
    if (checkThisTrapKind(kind)) {
      numTrapsToCheck += kindCount;
    }
  }

  JitSpew(JitSpew_Codegen,
          "Verifying stackmaps: %u trapSites total, %u to check", numTrapsTotal,
          numTrapsToCheck);

  // Perform the actual checking
  bool stackmapCheckOK = true;

  for (Trap kind : mozilla::MakeEnumeratedRange(Trap::Limit)) {
    size_t kindCount = trapSitesAfter[kind] - trapSitesBefore[kind];
    if (kindCount > 0 && !checkThisTrapKind(kind)) {
      JitSpew(JitSpew_Codegen, "  skipping  %zu trapSites of kind %s",
              kindCount, NameOfTrap(kind));
      continue;
    }

    const TrapSitesForKind& sitesForKind = masm.trapSites().get(kind);
    // Strictly speaking, this doesn't need to be true.  However, we expect
    // callers to use this routine to check trapsites they have just generated,
    // not to check some arbitrary slice of older trapsites.
    MOZ_ASSERT(sitesForKind.length() == trapSitesAfter[kind]);

    for (uint32_t tsi = trapSitesBefore[kind]; tsi < trapSitesAfter[kind];
         tsi++) {
      // This is the offset of the first byte of the trapping instruction.  In
      // order to verify it has a stackmap, we need to find the associated
      // stackmap key, by adding the length of the instruction onto the
      // trapsite key.  And we find the length by asking
      // SummarizeTrapInstruction.
      uint32_t trapsiteKey = sitesForKind.getPCoffset(tsi);

      SummarizeResult summary = SummarizeTrapInstruction(masm, trapsiteKey);
      if (!summary.identified()) {
        JitSpew(JitSpew_Codegen,
                "  FAIL     could not identify trap insn at 0x%06x",
                trapsiteKey);
        // Failure of this is serious: it means the trapsiteKey we got doesn't
        // point at a plausible trap instruction.
        MOZ_CRASH(
            "wasm::CheckStackMapsForTraps: "
            "could not identify trapping instruction");
      }

      JitSpew(JitSpew_Codegen,
              "  checking  tsKey=0x%06x  tsKind=%s  "
              "insn.len=%u  insn.tmi=%s",
              trapsiteKey, NameOfTrap(kind), summary.length(),
              ToString(summary.kind()));

      // So this is the stack map key we expect.
      uint32_t stackmapKey = trapsiteKey + summary.length();
      const StackMap* stackmap = stackMaps.lookup(stackmapKey);
      stackmapCheckOK = stackmapCheckOK && !!stackmap;
      JitSpew(JitSpew_Codegen, "   %s  tsKey=0x%06x  smKey=0x%06x  kind=%s",
              stackmap ? "present" : "MISSING", trapsiteKey, stackmapKey,
              NameOfTrap(kind));
      if (!stackmap) {
        // There are two reasons we can get here.  The more obvious is that
        // there isn't a stackmap corresponding to the trap at `trapsiteKey`,
        // so the fix is to add one.
        //
        // The less obvious reason is that there is a stackmap, but
        // SummarizeTrapInstruction computes an incorrect `summary.length()`,
        // hence `stackmapKey` is wrong.  On x86_{32,64}, instruction length
        // computation is non-trivial, so this is a real possibility that
        // should be investigated.
        //
        // Recall that the key used to create a stackmap for a trap is derived
        // from the trapping instruction's FaultingCodeRange, which is derived
        // from assembler offsets, and is not computed by
        // SummarizeTrapInstruction.  Hence, technically, an incorrect
        // `stackmapKey` value indicates an inconsistency between the length
        // from the FaultingCodeRange and the length as computed by
        // SummarizeTrapInstruction.  Given that the FaultingCodeRange
        // mechanism is very simple, it's more likely SummarizeTrapInstruction
        // is wrong.
        MOZ_CRASH(
            "wasm::CheckStackMapsForTraps: "
            "trapping instruction lacks a stackmap");
      }
    }
  }
  MOZ_ASSERT(stackmapCheckOK);
}
#endif
