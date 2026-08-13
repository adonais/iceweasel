/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_TestInterfaceObservableArray_h
#define mozilla_dom_TestInterfaceObservableArray_h

#include "TestInterfaceObservableArrayBase.h"

namespace mozilla::dom {

class SetDeleteInterfaceCallback;

// Implementation of test binding for webidl ObservableArray type, using
// primitives for value type
class TestInterfaceObservableArray final
    : public TestInterfaceObservableArrayBase {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(TestInterfaceObservableArray,
                                           TestInterfaceObservableArrayBase)

  virtual JSObject* WrapObject(JSContext* aCx,
                               JS::Handle<JSObject*> aGivenProto) override;
  static already_AddRefed<TestInterfaceObservableArray> Constructor(
      const GlobalObject& aGlobal, const ObservableArrayCallbacks& aCallbacks,
      ErrorResult& rv);

  MOZ_CAN_RUN_SCRIPT_BOUNDARY
  void OnSetObservableArrayInterface(TestInterfaceObservableArray* aValue,
                                     uint32_t aIndex, ErrorResult& aRv);

  MOZ_CAN_RUN_SCRIPT_BOUNDARY
  void OnDeleteObservableArrayInterface(TestInterfaceObservableArray* aValue,
                                        uint32_t aIndex, ErrorResult& aRv);

  already_AddRefed<TestInterfaceObservableArray> InterfaceElementAtInternal(
      uint32_t aIndex, ErrorResult& aRv);

  void InterfaceReplaceElementAtInternal(uint32_t aIndex,
                                         TestInterfaceObservableArray& aValue,
                                         ErrorResult& aRv);

  void InterfaceAppendElementInternal(TestInterfaceObservableArray& aValue,
                                      ErrorResult& aRv);

  void InterfaceRemoveLastElementInternal(ErrorResult& aRv);

  uint32_t InterfaceLengthInternal(ErrorResult& aRv);

 private:
  explicit TestInterfaceObservableArray(
      nsPIDOMWindowInner* aParent, const ObservableArrayCallbacks& aCallbacks);
  virtual ~TestInterfaceObservableArray() = default;

  RefPtr<SetDeleteInterfaceCallback> mSetInterfaceCallback;
  RefPtr<SetDeleteInterfaceCallback> mDeleteInterfaceCallback;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_TestInterfaceObservableArray_h
