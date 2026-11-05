#include "google_breakpad/processor/minidump.h"
#include "nscore.h"

using namespace google_breakpad;

// Return true if the specified minidump contains a stream of |stream_type|.
extern "C" NS_EXPORT bool DumpHasStream(const char* dump_file,
                                        uint32_t stream_type) {
  Minidump dump(dump_file);
  if (!dump.Read()) return false;

  uint32_t length;
  if (!dump.SeekToStreamType(stream_type, &length) || length == 0) return false;

  return true;
}

// Return true if the specified minidump contains a memory region
// that contains the instruction pointer from the exception record.
extern "C" NS_EXPORT bool DumpHasInstructionPointerMemory(
    const char* dump_file) {
  Minidump minidump(dump_file);
  if (!minidump.Read()) return false;

  MinidumpException* exception = minidump.GetException();
  MinidumpMemoryList* memory_list = minidump.GetMemoryList();
  if (!exception || !memory_list) {
    return false;
  }

  MinidumpContext* context = exception->GetContext();
  if (!context) return false;

  uint64_t instruction_pointer;
  if (!context->GetInstructionPointer(&instruction_pointer)) {
    return false;
  }

  MinidumpMemoryRegion* region =
      memory_list->GetMemoryRegionForAddress(instruction_pointer);
  return region != nullptr;
}
