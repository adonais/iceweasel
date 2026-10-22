/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SelfHostingDefines.h"

// Assertions and debug printing, defined here instead of in the header above
// to make `assert` invisible to C++.
#ifdef DEBUG
#define assert(b, info) \
  do { \
    if (!(b)) { \
      AssertionFailed(__FILE__ + ":" + __LINE__ + ": " + info) \
    } \
  } while (false)
#define dbg(msg) \
  do { \
    DumpMessage(callFunction(std_Array_pop, \
                             StringSplitString(__FILE__, '/')) + \
                '#' + __LINE__ + ': ' + msg) \
  } while (false)
#else
#define assert(b, info) ; // Elided assertion.
#define dbg(msg) ; // Elided debugging output.
#endif

// All C++-implemented standard builtins library functions used in self-hosted
// code are installed via the std_functions JSFunctionSpec[] in
// SelfHosting.cpp.

/********** Abstract operations defined in ECMAScript Language Specification **********/

// ES 2017 draft (April 6, 2016) 7.3.9
function GetMethod(V, P) {
  // Step 1.
  assert(IsPropertyKey(P), "Invalid property key");

  // Step 2.
  var func = V[P];

  // Step 3.
  if (IsNullOrUndefined(func)) {
    return undefined;
  }

  // Step 4.
  if (!IsCallable(func)) {
    ThrowTypeError(JSMSG_NOT_FUNCTION, typeof func);
  }

  // Step 5.
  return func;
}

/* Spec: ECMAScript Draft, 6th edition Dec 24, 2014, 7.2.7 */
function IsPropertyKey(argument) {
  var type = typeof argument;
  return type === "string" || type === "symbol";
}

#define TO_PROPERTY_KEY(name) \
(typeof name !== "string" && typeof name !== "number" && typeof name !== "symbol" ? ToPropertyKey(name) : name)

// ES 2016 draft Mar 25, 2016 7.3.20.
function SpeciesConstructor(obj, defaultConstructor) {
  // Step 1.
  assert(IsObject(obj), "not passed an object");

  // Step 2.
  var ctor = obj.constructor;

  // Step 3.
  if (ctor === undefined) {
    return defaultConstructor;
  }

  // Step 4.
  if (!IsObject(ctor)) {
    ThrowTypeError(JSMSG_OBJECT_REQUIRED, "object's 'constructor' property");
  }

  // Steps 5.
  var s = ctor[GetBuiltinSymbol("species")];

  // Step 6.
  if (IsNullOrUndefined(s)) {
    return defaultConstructor;
  }

  // Step 7.
  if (IsConstructor(s)) {
    return s;
  }

  // Step 8.
  ThrowTypeError(
    JSMSG_NOT_CONSTRUCTOR,
    "@@species property of object's constructor"
  );
}

function GetTypeError(...args) {
  try {
    FUN_APPLY(ThrowTypeError, undefined, args);
  } catch (e) {
    return e;
  }
  assert(false, "the catch block should've returned from this function.");
}

function GetAggregateError(...args) {
  try {
    FUN_APPLY(ThrowAggregateError, undefined, args);
  } catch (e) {
    return e;
  }
  assert(false, "the catch block should've returned from this function.");
}

function GetInternalError(...args) {
  try {
    FUN_APPLY(ThrowInternalError, undefined, args);
  } catch (e) {
    return e;
  }
  assert(false, "the catch block should've returned from this function.");
}

// To be used when a function is required but calling it shouldn't do anything.
function NullFunction() {}

/*************************************** Testing functions ***************************************/
function outer() {
  return function inner() {
    return "foo";
  };
}
