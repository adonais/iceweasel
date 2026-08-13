// Copyright 2019 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "sandbox/win/src/signed_policy.h"

#include <ntstatus.h>
#include <stdint.h>

#include <string>

#include "base/containers/contains.h"
#include "sandbox/win/src/ipc_tags.h"
#include "sandbox/win/src/policy_engine_opcodes.h"
#include "sandbox/win/src/policy_params.h"
#include "sandbox/win/src/sandbox_nt_util.h"
#include "sandbox/win/src/sandbox_policy.h"
#include "sandbox/win/src/win_utils.h"

namespace {
bool IsValidNtPath(const base::FilePath& name) {
  UNICODE_STRING uni_name;
  ::RtlInitUnicodeString(&uni_name, name.value().c_str());
  OBJECT_ATTRIBUTES obj_attr;
  InitializeObjectAttributes(&obj_attr, &uni_name, OBJ_CASE_INSENSITIVE,
                             nullptr, nullptr);

  static const auto NtQueryAttributesFile =
      reinterpret_cast<NtQueryAttributesFileFunction>(::GetProcAddress(
          ::GetModuleHandleW(L"ntdll.dll"), "NtQueryAttributesFile"));

  FILE_BASIC_INFORMATION file_info;
  return NtQueryAttributesFile &&
         NT_SUCCESS(NtQueryAttributesFile(&obj_attr, &file_info));
}
}  // namespace

namespace sandbox {

bool SignedPolicy::GenerateRules(base::FilePath dll_path,
                                 LowLevelPolicy* policy) {
#if !defined(MOZ_SANDBOX)
  // Disallow patterns to allow for future API changes.
  if (base::Contains(dll_path.value(), L'*')) {
    return false;
  }
#endif
  if (!dll_path.IsAbsolute()) {
    return false;
  }

  auto nt_path_name = GetNtPathFromWin32Path(dll_path.DirName().value());
  base::FilePath nt_filename;
  if (nt_path_name) {
    base::FilePath nt_path(nt_path_name.value());
    nt_filename = nt_path.Append(dll_path.BaseName());
  } else if (IsValidNtPath(dll_path)) {
    nt_filename = dll_path;
  } else {
    return false;
  }

  // Create a rule to ASK_BROKER if name matches.
  PolicyRule signed_policy(ASK_BROKER);
  if (!signed_policy.AddStringMatch(IF, NameBased::NAME,
                                    nt_filename.value().c_str())) {
    return false;
  }
  if (!policy->AddRule(IpcTag::NTCREATESECTION, &signed_policy)) {
    return false;
  }

  return true;
}

NTSTATUS SignedPolicy::CreateSectionAction(
    EvalResult eval_result,
    const ClientInfo& client_info,
    const base::win::ScopedHandle& local_file_handle,
    HANDLE* target_section_handle) {
  // The only action supported is ASK_BROKER which means create the requested
  // section as specified.
  if (ASK_BROKER != eval_result)
    return false;

  HANDLE local_section_handle = nullptr;
  NTSTATUS status = GetNtExports()->CreateSection(
      &local_section_handle,
      SECTION_QUERY | SECTION_MAP_WRITE | SECTION_MAP_READ |
          SECTION_MAP_EXECUTE,
      nullptr, 0, PAGE_EXECUTE, SEC_IMAGE, local_file_handle.get());

  if (status != STATUS_SUCCESS || !local_section_handle) {
    return status;
  }

  // Duplicate section handle back to the target. `local_section_handle` must
  // be a valid real handle and `client_info.process` is trusted.
  if (!::DuplicateHandle(::GetCurrentProcess(), local_section_handle,
                         client_info.process, target_section_handle, 0, false,
                         DUPLICATE_CLOSE_SOURCE | DUPLICATE_SAME_ACCESS)) {
    return STATUS_ACCESS_DENIED;
  }
  return status;
}

}  // namespace sandbox
