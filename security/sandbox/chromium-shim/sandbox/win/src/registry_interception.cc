// Copyright (c) 2006-2008 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "sandbox/win/src/registry_interception.h"

#include <ntstatus.h>
#include <stdint.h>

#include "sandbox/win/src/crosscall_client.h"
#include "sandbox/win/src/ipc_tags.h"
#include "sandbox/win/src/policy_params.h"
#include "sandbox/win/src/policy_target.h"
#include "sandbox/win/src/sandbox_factory.h"
#include "sandbox/win/src/sandbox_nt_util.h"
#include "sandbox/win/src/sharedmem_ipc_client.h"
#include "sandbox/win/src/target_services.h"
#include "sandbox/win/TargetGeckoClient.h"

namespace sandbox {
namespace {

bool ShouldAskBroker(IpcTag ipc_tag, HANDLE root_directory,
                     std::wstring_view name, uint32_t desired_access) {
  NtHeapWString full_name;
  std::wstring_view full_name_view;
  if (root_directory) {
    full_name = AllocAndGetFullPath(root_directory, name);
    if (!full_name.is_valid()) {
      return false;
    }
    full_name_view = full_name.view();
  } else {
    full_name_view = name;
  }
  CountedParameterSet<OpenKey> params;
  params[OpenKey::ACCESS] = ParamPickerMake(desired_access);
  params[OpenKey::NAME] = ParamPickerMake(full_name_view);
  return QueryBroker(ipc_tag, params.GetBase());
}

bool ValidateObjectAttributes(const OBJECT_ATTRIBUTES* in_object,
                              std::wstring_view& name, uint32_t& attributes,
                              HANDLE& root) {
  __try {
    if (!in_object->ObjectName || !in_object->ObjectName->Buffer) {
      return false;
    }

    std::wstring_view temp_name = {
        in_object->ObjectName->Buffer,
        in_object->ObjectName->Length / sizeof(wchar_t)};
    // We don't support embedded NUL characters. This also acts as a test for
    // the string buffer memory being valid.
    if (ContainsNulCharacter(temp_name)) {
      return false;
    }
    name = temp_name;
    attributes = in_object->Attributes;
    root = in_object->RootDirectory;
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
  }
  return false;
}

}  // namespace

NTSTATUS WINAPI TargetNtCreateKey(NtCreateKeyFunction orig_CreateKey,
                                  PHANDLE key, ACCESS_MASK desired_access,
                                  POBJECT_ATTRIBUTES object_attributes,
                                  ULONG title_index, PUNICODE_STRING class_name,
                                  ULONG create_options, PULONG disposition) {
  // Check if the process can create it first.
  NTSTATUS status =
      orig_CreateKey(key, desired_access, object_attributes, title_index,
                     class_name, create_options, disposition);
  if (NT_SUCCESS(status) || status == STATUS_OBJECT_NAME_NOT_FOUND) {
    return status;
  }

  SYSCALL_BROKERING_WITH_CONTEXT(object_attributes->ObjectName);

  // We don't trust that the IPC can work this early.
  if (!SandboxFactory::GetTargetServices()->GetState()->InitCalled()) {
    return status;
  }

  do {
    if (!ValidParameter(key, sizeof(HANDLE), WRITE)) {
      break;
    }

    if (disposition && !ValidParameter(disposition, sizeof(ULONG), WRITE)) {
      break;
    }

    // At this point we don't support class_name.
    if (class_name && class_name->Buffer && class_name->Length) {
      break;
    }

    // We don't support creating link keys, volatile keys and backup/restore.
    if (create_options) {
      break;
    }

    void* memory = GetGlobalIPCMemory();
    if (!memory) {
      break;
    }

    std::wstring_view name;
    uint32_t attributes = 0;
    HANDLE root_directory = 0;
    if (!ValidateObjectAttributes(object_attributes, name, attributes,
                                  root_directory)) {
      break;
    }

    if (!ShouldAskBroker(IpcTag::NTCREATEKEY, root_directory, name,
                         desired_access)) {
      break;
    }

    SharedMemIPCClient ipc(memory);
    CrossCallReturn answer = {0};

    ResultCode code =
        CrossCall(ipc, IpcTag::NTCREATEKEY, name, attributes, root_directory,
                  desired_access, title_index, create_options, &answer);

    if (SBOX_ALL_OK != code) {
      break;
    }

    if (!NT_SUCCESS(answer.nt_status)) {
      // TODO(nsylvain): We should return answer.nt_status here instead
      // of status. We can do this only after we checked the policy.
      // otherwise we will returns ACCESS_DENIED for all paths
      // that are not specified by a policy, even though your token allows
      // access to that path, and the original call had a more meaningful
      // error. Bug 4369
      break;
    }

    __try {
      *key = answer.handle;

      if (disposition) {
        *disposition = answer.extended[0].unsigned_int;
      }

      status = answer.nt_status;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
      break;
    }
    SYSCALL_BROKERED();
  } while (false);

  return status;
}

NTSTATUS WINAPI CommonNtOpenKey(NTSTATUS status, PHANDLE key,
                                ACCESS_MASK desired_access,
                                POBJECT_ATTRIBUTES object_attributes) {
  // We don't trust that the IPC can work this early.
  if (!SandboxFactory::GetTargetServices()->GetState()->InitCalled()) {
    return status;
  }

  do {
    if (!ValidParameter(key, sizeof(HANDLE), WRITE)) {
      break;
    }

    void* memory = GetGlobalIPCMemory();
    if (!memory) {
      break;
    }

    std::wstring_view name;
    uint32_t attributes = 0;
    HANDLE root_directory = 0;
    if (!ValidateObjectAttributes(object_attributes, name, attributes,
                                  root_directory)) {
      break;
    }

    if (!ShouldAskBroker(IpcTag::NTOPENKEY, root_directory, name,
                         desired_access)) {
      break;
    }

    SharedMemIPCClient ipc(memory);
    CrossCallReturn answer = {0};
    ResultCode code = CrossCall(ipc, IpcTag::NTOPENKEY, name, attributes,
                                root_directory, desired_access, &answer);

    if (SBOX_ALL_OK != code) {
      break;
    }

    if (!NT_SUCCESS(answer.nt_status)) {
      // TODO(nsylvain): We should return answer.nt_status here instead
      // of status. We can do this only after we checked the policy.
      // otherwise we will returns ACCESS_DENIED for all paths
      // that are not specified by a policy, even though your token allows
      // access to that path, and the original call had a more meaningful
      // error. Bug 4369
      break;
    }

    __try {
      *key = answer.handle;
      status = answer.nt_status;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
      break;
    }
  } while (false);

  return status;
}

NTSTATUS WINAPI TargetNtOpenKey(NtOpenKeyFunction orig_OpenKey, PHANDLE key,
                                ACCESS_MASK desired_access,
                                POBJECT_ATTRIBUTES object_attributes) {
  // Check if the process can open it first.
  NTSTATUS status = orig_OpenKey(key, desired_access, object_attributes);
  if (NT_SUCCESS(status) || status == STATUS_OBJECT_NAME_NOT_FOUND) {
    return status;
  }

  SYSCALL_BROKERING_WITH_CONTEXT(object_attributes->ObjectName);

  status = CommonNtOpenKey(status, key, desired_access, object_attributes);
  if (NT_SUCCESS(status)) {
    SYSCALL_BROKERED();
  }
  return status;
}

NTSTATUS WINAPI TargetNtOpenKeyEx(NtOpenKeyExFunction orig_OpenKeyEx,
                                  PHANDLE key, ACCESS_MASK desired_access,
                                  POBJECT_ATTRIBUTES object_attributes,
                                  ULONG open_options) {
  // Check if the process can open it first.
  NTSTATUS status =
      orig_OpenKeyEx(key, desired_access, object_attributes, open_options);

  // We do not support open_options at this time. The 2 current known values
  // are REG_OPTION_CREATE_LINK, to open a symbolic link, and
  // REG_OPTION_BACKUP_RESTORE to open the key with special privileges.
  if (NT_SUCCESS(status) || open_options != 0 ||
      status == STATUS_OBJECT_NAME_NOT_FOUND) {
    return status;
  }

  SYSCALL_BROKERING_WITH_CONTEXT(object_attributes->ObjectName);

  status = CommonNtOpenKey(status, key, desired_access, object_attributes);
  if (NT_SUCCESS(status)) {
    SYSCALL_BROKERED();
  }
  return status;
}

}  // namespace sandbox
