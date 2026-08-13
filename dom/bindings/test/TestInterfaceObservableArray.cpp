/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/TestInterfaceObservableArray.h"

#include "mozilla/dom/BindingUtils.h"
#include "mozilla/dom/TestInterfaceObservableArrayBinding.h"
#include "nsPIDOMWindow.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(TestInterfaceObservableArrayBase, mParent,
                                      mSetBooleanCallback,
                                      mDeleteBooleanCallback,
                                      mSetObjectCallback, mDeleteObjectCallback)

NS_IMPL_CYCLE_COLLECTING_ADDREF(TestInterfaceObservableArrayBase)
NS_IMPL_CYCLE_COLLECTING_RELEASE(TestInterfaceObservableArrayBase)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(TestInterfaceObservableArrayBase)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

TestInterfaceObservableArrayBase::TestInterfaceObservableArrayBase(
    nsPIDOMWindowInner* aParent, const ObservableArrayCallbacks& aCallbacks)
    : mParent(aParent) {
  if (aCallbacks.mSetBooleanCallback.WasPassed()) {
    mSetBooleanCallback = &aCallbacks.mSetBooleanCallback.Value();
  }
  if (aCallbacks.mDeleteBooleanCallback.WasPassed()) {
    mDeleteBooleanCallback = &aCallbacks.mDeleteBooleanCallback.Value();
  }
  if (aCallbacks.mSetObjectCallback.WasPassed()) {
    mSetObjectCallback = &aCallbacks.mSetObjectCallback.Value();
  }
  if (aCallbacks.mDeleteObjectCallback.WasPassed()) {
    mDeleteObjectCallback = &aCallbacks.mDeleteObjectCallback.Value();
  }
}

nsPIDOMWindowInner* TestInterfaceObservableArrayBase::GetParentObject() const {
  return mParent;
}

JSObject* TestInterfaceObservableArrayBase::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  MOZ_CRASH("Must be overridden");
}

void TestInterfaceObservableArrayBase::OnSetObservableArrayObject(
    JSContext* aCx, JS::Handle<JSObject*> aValue, uint32_t aIndex,
    ErrorResult& aRv) {
  if (mSetObjectCallback) {
    MOZ_KnownLive(mSetObjectCallback)
        ->Call(aValue, aIndex, aRv, "OnSetObservableArrayObject",
               CallbackFunction::eRethrowExceptions);
  }
}

void TestInterfaceObservableArrayBase::OnDeleteObservableArrayObject(
    JSContext* aCx, JS::Handle<JSObject*> aValue, uint32_t aIndex,
    ErrorResult& aRv) {
  if (mDeleteObjectCallback) {
    MOZ_KnownLive(mDeleteObjectCallback)
        ->Call(aValue, aIndex, aRv, "OnDeleteObservableArrayObject",
               CallbackFunction::eRethrowExceptions);
  }
}

void TestInterfaceObservableArrayBase::OnSetObservableArrayBoolean(
    bool aValue, uint32_t aIndex, ErrorResult& aRv) {
  if (mSetBooleanCallback) {
    MOZ_KnownLive(mSetBooleanCallback)
        ->Call(aValue, aIndex, aRv, "OnSetObservableArrayBoolean",
               CallbackFunction::eRethrowExceptions);
  }
}

void TestInterfaceObservableArrayBase::OnDeleteObservableArrayBoolean(
    bool aValue, uint32_t aIndex, ErrorResult& aRv) {
  if (mDeleteBooleanCallback) {
    MOZ_KnownLive(mDeleteBooleanCallback)
        ->Call(aValue, aIndex, aRv, "OnDeleteObservableArrayBoolean",
               CallbackFunction::eRethrowExceptions);
  }
}

bool TestInterfaceObservableArrayBase::BooleanElementAtInternal(
    uint32_t aIndex, ErrorResult& aRv) {
  return TestInterfaceObservableArrayBase_Binding::
      ObservableArrayBooleanHelpers::ElementAt(this, aIndex, aRv);
}

void TestInterfaceObservableArrayBase::ObjectElementAtInternal(
    JSContext* aCx, uint32_t aIndex, JS::MutableHandle<JSObject*> aValue,
    ErrorResult& aRv) {
  TestInterfaceObservableArrayBase_Binding::ObservableArrayObjectHelpers::
      ElementAt(this, aCx, aIndex, aValue, aRv);
}

void TestInterfaceObservableArrayBase::BooleanReplaceElementAtInternal(
    uint32_t aIndex, bool aValue, ErrorResult& aRv) {
  TestInterfaceObservableArrayBase_Binding::ObservableArrayBooleanHelpers::
      ReplaceElementAt(this, aIndex, aValue, aRv);
}

void TestInterfaceObservableArrayBase::ObjectReplaceElementAtInternal(
    JSContext* aCx, uint32_t aIndex, JS::Handle<JSObject*> aValue,
    ErrorResult& aRv) {
  TestInterfaceObservableArrayBase_Binding::ObservableArrayObjectHelpers::
      ReplaceElementAt(this, aIndex, aValue, aRv);
}

void TestInterfaceObservableArrayBase::BooleanAppendElementInternal(
    bool aValue, ErrorResult& aRv) {
  TestInterfaceObservableArrayBase_Binding::ObservableArrayBooleanHelpers::
      AppendElement(this, aValue, aRv);
}

void TestInterfaceObservableArrayBase::ObjectAppendElementInternal(
    JSContext* aCx, JS::Handle<JSObject*> aValue, ErrorResult& aRv) {
  TestInterfaceObservableArrayBase_Binding::ObservableArrayObjectHelpers::
      AppendElement(this, aValue, aRv);
}

void TestInterfaceObservableArrayBase::BooleanRemoveLastElementInternal(
    ErrorResult& aRv) {
  TestInterfaceObservableArrayBase_Binding::ObservableArrayBooleanHelpers::
      RemoveLastElement(this, aRv);
}

void TestInterfaceObservableArrayBase::ObjectRemoveLastElementInternal(
    ErrorResult& aRv) {
  TestInterfaceObservableArrayBase_Binding::ObservableArrayObjectHelpers::
      RemoveLastElement(this, aRv);
}

uint32_t TestInterfaceObservableArrayBase::BooleanLengthInternal(
    ErrorResult& aRv) {
  return TestInterfaceObservableArrayBase_Binding::
      ObservableArrayBooleanHelpers::Length(this, aRv);
}

uint32_t TestInterfaceObservableArrayBase::ObjectLengthInternal(
    ErrorResult& aRv) {
  return TestInterfaceObservableArrayBase_Binding::
      ObservableArrayObjectHelpers::Length(this, aRv);
}

NS_IMPL_CYCLE_COLLECTION_INHERITED(TestInterfaceObservableArray,
                                   TestInterfaceObservableArrayBase,
                                   mSetInterfaceCallback,
                                   mDeleteInterfaceCallback)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(TestInterfaceObservableArray)
NS_INTERFACE_MAP_END_INHERITING(TestInterfaceObservableArrayBase)

NS_IMPL_ADDREF_INHERITED(TestInterfaceObservableArray,
                         TestInterfaceObservableArrayBase)
NS_IMPL_RELEASE_INHERITED(TestInterfaceObservableArray,
                          TestInterfaceObservableArrayBase)

TestInterfaceObservableArray::TestInterfaceObservableArray(
    nsPIDOMWindowInner* aParent, const ObservableArrayCallbacks& aCallbacks)
    : TestInterfaceObservableArrayBase(aParent, aCallbacks) {
  if (aCallbacks.mSetInterfaceCallback.WasPassed()) {
    mSetInterfaceCallback = &aCallbacks.mSetInterfaceCallback.Value();
  }
  if (aCallbacks.mDeleteInterfaceCallback.WasPassed()) {
    mDeleteInterfaceCallback = &aCallbacks.mDeleteInterfaceCallback.Value();
  }
}

// static
already_AddRefed<TestInterfaceObservableArray>
TestInterfaceObservableArray::Constructor(
    const GlobalObject& aGlobal, const ObservableArrayCallbacks& aCallbacks,
    ErrorResult& aRv) {
  nsCOMPtr<nsPIDOMWindowInner> window =
      do_QueryInterface(aGlobal.GetAsSupports());
  if (!window) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  RefPtr<TestInterfaceObservableArray> r =
      new TestInterfaceObservableArray(window, aCallbacks);
  return r.forget();
}

JSObject* TestInterfaceObservableArray::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return TestInterfaceObservableArray_Binding::Wrap(aCx, this, aGivenProto);
}

void TestInterfaceObservableArray::OnSetObservableArrayInterface(
    TestInterfaceObservableArray* aValue, uint32_t aIndex, ErrorResult& aRv) {
  if (mSetInterfaceCallback && aValue) {
    MOZ_KnownLive(mSetInterfaceCallback)
        ->Call(*aValue, aIndex, aRv, "OnSetObservableArrayInterface",
               CallbackFunction::eRethrowExceptions);
  }
}

void TestInterfaceObservableArray::OnDeleteObservableArrayInterface(
    TestInterfaceObservableArray* aValue, uint32_t aIndex, ErrorResult& aRv) {
  if (mDeleteInterfaceCallback && aValue) {
    MOZ_KnownLive(mDeleteInterfaceCallback)
        ->Call(*aValue, aIndex, aRv, "OnDeleteObservableArrayInterface",
               CallbackFunction::eRethrowExceptions);
  }
}

already_AddRefed<TestInterfaceObservableArray>
TestInterfaceObservableArray::InterfaceElementAtInternal(uint32_t aIndex,
                                                         ErrorResult& aRv) {
  return TestInterfaceObservableArray_Binding::ObservableArrayInterfaceHelpers::
      ElementAt(this, aIndex, aRv);
}

void TestInterfaceObservableArray::InterfaceReplaceElementAtInternal(
    uint32_t aIndex, TestInterfaceObservableArray& aValue, ErrorResult& aRv) {
  TestInterfaceObservableArray_Binding::ObservableArrayInterfaceHelpers::
      ReplaceElementAt(this, aIndex, aValue, aRv);
}

void TestInterfaceObservableArray::InterfaceAppendElementInternal(
    TestInterfaceObservableArray& aValue, ErrorResult& aRv) {
  TestInterfaceObservableArray_Binding::ObservableArrayInterfaceHelpers::
      AppendElement(this, aValue, aRv);
}

void TestInterfaceObservableArray::InterfaceRemoveLastElementInternal(
    ErrorResult& aRv) {
  TestInterfaceObservableArray_Binding::ObservableArrayInterfaceHelpers::
      RemoveLastElement(this, aRv);
}

uint32_t TestInterfaceObservableArray::InterfaceLengthInternal(
    ErrorResult& aRv) {
  return TestInterfaceObservableArray_Binding::ObservableArrayInterfaceHelpers::
      Length(this, aRv);
}

}  // namespace mozilla::dom
