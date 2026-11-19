/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "shell/DebugSession.h"

#include "mozilla/Utf8.h"

#include <string.h>

#include "jsapi.h"
#include "NamespaceImports.h"

#include "builtin/JSON.h"
#include "js/CallAndConstruct.h"
#include "js/CompilationAndEvaluation.h"
#include "js/Conversions.h"
#include "js/Exception.h"
#include "js/friend/WindowProxy.h"
#include "js/GlobalObject.h"
#include "js/JSON.h"
#include "js/Modules.h"
#include "js/Promise.h"
#include "js/PropertyAndElement.h"
#include "js/SourceText.h"
#include "js/Utility.h"
#include "js/Wrapper.h"
#include "shell/DebugSessionHostSource.h"
#include "shell/DebugSessionSource.h"
#include "shell/jsshell.h"
#include "util/StringBuilder.h"
#include "vm/JSAtomState.h"
#include "vm/JSContext.h"

using namespace js;
using namespace js::shell;

// [SMDOC] Shell DebugSession
//
// The debugSessionCreate and debugSessionCommand shell functions implement a
// debugger built on the DebugSession module in DebugSession.sys.mjs (shared
// with WebDriver BiDi) instead of the full Debugger API.
//
// With --fuzzing-safe, this is the only debugger API available in the JS shell.
// This lets us limit fuzzing to operations used by real browser debuggers
// rather than Debugger API edge cases.
//
// DebugSessionHost.js and DebugSession.sys.mjs run in a hidden "debug session
// host" global. This global is only reachable from the shell's
// debugSessionCreate and debugSessionCommand testing functions. All data
// passed to/from this global is serialized as JSON, to avoid exposing internal
// Debugger API objects through these functions (the only exception is the
// debuggee global, which is passed to the host when the session is created).
// Exceptions are replaced by new errors in the caller's realm.
//
// Pauses are handled with a list of data actions (resume, step, or evaluate an
// expression in a paused frame) instead of callbacks. Evaluated expressions can
// still call shell functions in the debuggee's realm, but can't change the
// debug session during a pause.

// Exceptions thrown by code of the debug session host global must not reach
// the caller, because the exception object would give it access to that
// global.
static bool TakeDebugSessionExceptionMessage(JSContext* cx,
                                             UniqueChars* message) {
  if (!JS_IsExceptionPending(cx) || JS_IsThrowingOutOfMemory(cx)) {
    return false;
  }
  RootedValue exn(cx);
  if (!JS_GetPendingException(cx, &exn)) {
    return false;
  }
  JS_ClearPendingException(cx);

  RootedString str(cx, JS::ToString(cx, exn));
  if (str) {
    *message = JS_EncodeStringToUTF8(cx, str);
  }
  if (JS_IsExceptionPending(cx)) {
    if (JS_IsThrowingOutOfMemory(cx)) {
      return false;
    }
    JS_ClearPendingException(cx);
  }
  if (!*message) {
    // Converting the exception to a string failed, for example because of
    // over-recursion. Callers rely on |message| being set when the exception
    // has been taken.
    *message = js::DuplicateString("an exception was thrown");
    if (!*message) {
      JS_ReportOutOfMemory(cx);
      return false;
    }
  }
  return true;
}

// Return the JSON of |v| in the current realm, or "null" if |v| has no JSON
// representation.
static JSString* ToDebugSessionJSON(JSContext* cx, HandleValue v) {
  RootedValue value(cx, v);
  JSStringBuilder sb(cx);
  if (!Stringify(cx, &value, nullptr, UndefinedValue(), sb,
                 StringifyBehavior::Normal)) {
    return nullptr;
  }
  if (sb.empty()) {
    return cx->names().null;
  }
  return sb.finishString();
}

static bool HostModuleLoaded(JSContext* cx, HandleValue hostDefined) {
  RootedObject module(cx, &hostDefined.toObject());
  return JS::ModuleLink(cx, module);
}

static bool HostModuleLoadFailed(JSContext* cx, HandleValue hostDefined,
                                 HandleValue error) {
  JS_SetPendingException(cx, error);
  return false;
}

static bool CreateDebugSessionHost(JSContext* cx, MutableHandleObject host) {
  JS::RealmOptions options;
  SetStandardRealmOptions(cx, options);
  options.creationOptions().setNewCompartmentAndZone();
  options.creationOptions().setInvisibleToDebugger(true);

  RootedObject global(cx,
                      JS_NewGlobalObject(cx, &ShellGlobalClass, nullptr,
                                         JS::DontFireOnNewGlobalHook, options));
  if (!global) {
    return false;
  }

  JSAutoRealm ar(cx, global);
  ShellCompartmentPrivate* priv = EnsureShellCompartmentPrivate(cx);
  if (!priv) {
    return false;
  }
  priv->isDebugSessionHost = true;

  if (!JS_DefineDebuggerObject(cx, global)) {
    return false;
  }

  JS::CompileOptions moduleOptions(cx);
  moduleOptions.setFileAndLine("DebugSession.sys.mjs", 1);
  JS::SourceText<mozilla::Utf8Unit> moduleSource;
  if (!moduleSource.init(cx, DebugSessionSource, strlen(DebugSessionSource),
                         JS::SourceOwnership::Borrowed)) {
    return false;
  }
  RootedObject module(cx, JS::CompileModule(cx, moduleOptions, moduleSource));
  if (!module) {
    return false;
  }
  RootedValue hostDefined(cx, ObjectValue(*module));
  if (!JS::LoadRequestedModules(cx, module, hostDefined, HostModuleLoaded,
                                HostModuleLoadFailed)) {
    return false;
  }
  RootedValue evaluationPromise(cx);
  if (!JS::ModuleEvaluate(cx, module, &evaluationPromise)) {
    return false;
  }
  if (evaluationPromise.isObject()) {
    RootedObject promise(cx, &evaluationPromise.toObject());
    if (JS::GetPromiseState(promise) == JS::PromiseState::Rejected) {
      RootedValue reason(cx, JS::GetPromiseResult(promise));
      JS_SetPendingException(cx, reason);
      return false;
    }
  }
  RootedValue namespaceValue(cx);
  JSObject* ns = JS::GetModuleNamespace(cx, module);
  if (!ns) {
    return false;
  }
  namespaceValue.setObject(*ns);

  JS::CompileOptions hostOptions(cx);
  hostOptions.setFileAndLine("DebugSessionHost.js", 1);
  JS::SourceText<mozilla::Utf8Unit> hostSource;
  if (!hostSource.init(cx, DebugSessionHostSource,
                       strlen(DebugSessionHostSource),
                       JS::SourceOwnership::Borrowed)) {
    return false;
  }
  RootedValue hostFunction(cx);
  RootedValue hostValue(cx);
  if (!JS::Evaluate(cx, hostOptions, hostSource, &hostFunction) ||
      !JS_CallFunctionValue(cx, nullptr, hostFunction,
                            JS::HandleValueArray(namespaceValue), &hostValue)) {
    return false;
  }
  MOZ_RELEASE_ASSERT(hostValue.isObject());
  host.set(&hostValue.toObject());
  return true;
}

// Get the debug session host, creating it if needed. On failure |detail| is set
// to the message of the exception thrown by the host global's code, if any.
static bool GetDebugSessionHost(JSContext* cx, MutableHandleObject host,
                                UniqueChars* detail) {
  ShellContext* sc = GetShellContext(cx);
  if (!sc->debugSessionHost) {
    RootedObject newHost(cx);
    if (!CreateDebugSessionHost(cx, &newHost)) {
      TakeDebugSessionExceptionMessage(cx, detail);
      return false;
    }
    sc->debugSessionHost = newHost;
  }
  host.set(sc->debugSessionHost);
  return true;
}

// Call |method| of the debug session host with |args| (primitives or debuggee
// globals) and return the parsed "result" of the JSON it returns, or report its
// "error".
static bool CallDebugSessionHost(JSContext* cx, const char* method,
                                 const JS::HandleValueArray& args,
                                 MutableHandleValue result) {
  RootedObject host(cx);
  RootedValue json(cx);
  UniqueChars detail;
  const char* failure = nullptr;
  if (!GetDebugSessionHost(cx, &host, &detail)) {
    if (!detail) {
      return false;
    }
    failure = "failed to create debug session host";
  } else {
    JSAutoRealm ar(cx, host);
    JS::RootedValueVector hostArgs(cx);
    for (size_t i = 0; i < args.length(); i++) {
      RootedValue arg(cx, args[i]);
      if (!JS_WrapValue(cx, &arg) || !hostArgs.append(arg)) {
        return false;
      }
    }
    RootedValue fun(cx);
    if (!JS_GetProperty(cx, host, method, &fun) ||
        !JS_CallFunctionValue(cx, host, fun, hostArgs, &json)) {
      if (!TakeDebugSessionExceptionMessage(cx, &detail)) {
        return false;
      }
      failure = "debug session host failed";
    } else {
      MOZ_RELEASE_ASSERT(json.isString());
    }
  }
  if (failure) {
    MOZ_ASSERT(detail);
    JS_ReportErrorUTF8(cx, "%s: %s", failure, detail.get());
    return false;
  }
  if (!JS_WrapValue(cx, &json)) {
    return false;
  }

  RootedString jsonString(cx, json.toString());
  RootedValue parsed(cx);
  if (!JS_ParseJSON(cx, jsonString, &parsed)) {
    return false;
  }
  MOZ_RELEASE_ASSERT(parsed.isObject());
  RootedObject parsedObj(cx, &parsed.toObject());

  bool hasError;
  if (!JS_HasOwnProperty(cx, parsedObj, "error", &hasError)) {
    return false;
  }
  if (hasError) {
    RootedValue error(cx);
    if (!JS_GetProperty(cx, parsedObj, "error", &error)) {
      return false;
    }
    RootedString errorString(cx, JS::ToString(cx, error));
    if (!errorString) {
      return false;
    }
    UniqueChars message = JS_EncodeStringToUTF8(cx, errorString);
    if (!message) {
      return false;
    }
    JS_ReportErrorUTF8(cx, "%s", message.get());
    return false;
  }

  return JS_GetProperty(cx, parsedObj, "result", result);
}

bool js::shell::DebugSessionCreate(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  if (!args.requireAtLeast(cx, "debugSessionCreate", 1)) {
    return false;
  }
  RootedObject debuggee(cx);
  if (args[0].isObject()) {
    debuggee = CheckedUnwrapStatic(&args[0].toObject());
    if (debuggee) {
      debuggee = js::ToWindowIfWindowProxy(debuggee);
    }
  }
  if (!debuggee || !JS_IsGlobalObject(debuggee)) {
    JS_ReportErrorASCII(cx, "debugSessionCreate: expected a global object");
    return false;
  }

  JS::RootedValueArray<1> hostArgs(cx);
  hostArgs[0].setObject(*debuggee);
  return CallDebugSessionHost(cx, "create", hostArgs, args.rval());
}

bool js::shell::DebugSessionCommand(JSContext* cx, unsigned argc, Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  if (!args.requireAtLeast(cx, "debugSessionCommand", 1)) {
    return false;
  }
  if (!args[0].isString()) {
    JS_ReportErrorASCII(cx, "debugSessionCommand: expected a command");
    return false;
  }

  JS::RootedValueArray<2> hostArgs(cx);
  hostArgs[0].set(args[0]);
  if (args.length() > 1) {
    RootedString argJSON(cx, ToDebugSessionJSON(cx, args[1]));
    if (!argJSON) {
      return false;
    }
    hostArgs[1].setString(argJSON);
  }
  return CallDebugSessionHost(cx, "command", hostArgs, args.rval());
}
