/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Entry for the Document or ShadowRoot's identifier map.
 */

#ifndef mozilla_IdentifierMapEntry_h
#define mozilla_IdentifierMapEntry_h

#include <utility>

#include "PLDHashTable.h"
#include "mozilla/MemoryReporting.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/dom/TreeOrderedArray.h"
#include "nsAtom.h"
#include "nsHashKeys.h"
#include "nsTArray.h"
#include "nsTHashtable.h"

class nsIContent;
class nsINode;

namespace mozilla {
namespace dom {
class Document;
class Element;
class HTMLCollection;
class IdentifierMapContentList;
}  // namespace dom

/**
 * Right now our identifier map entries contain information for 'name'
 * and 'id' mappings of a given string. This is so that
 * nsHTMLDocument::ResolveName only has to do one hash lookup instead
 * of two. It's not clear whether this still matters for performance.
 *
 * We also store the document.all result list here. This is mainly so that
 * when all elements with the given ID are removed and we remove
 * the ID's IdentifierMapEntry, the document.all result is released too.
 * Perhaps the document.all results should have their own hashtable
 * in nsHTMLDocument.
 */
class IdentifierMapEntry : public PLDHashEntryHdr {
  typedef dom::Document Document;
  typedef dom::Element Element;

  /**
   * @see Document::IDTargetObserver, this is just here to avoid include hell.
   */
  typedef bool (*IDTargetObserver)(Element* aOldElement, Element* aNewelement,
                                   void* aData);

 public:
  // We use DependentAtomOrString as our external key interface.  This allows
  // consumers to use an nsAString, for example, without forcing a copy.
  struct DependentAtomOrString final {
    MOZ_IMPLICIT DependentAtomOrString(nsAtom* aAtom)
        : mAtom(aAtom), mString(nullptr) {}
    MOZ_IMPLICIT DependentAtomOrString(const nsAString& aString)
        : mAtom(nullptr), mString(&aString) {}
    DependentAtomOrString(const DependentAtomOrString& aOther) = default;

    nsAtom* mAtom;
    const nsAString* mString;
  };

  typedef const DependentAtomOrString& KeyType;
  typedef const DependentAtomOrString* KeyTypePointer;

  explicit IdentifierMapEntry(const DependentAtomOrString* aKey);
  IdentifierMapEntry(IdentifierMapEntry&& aOther);
  ~IdentifierMapEntry();

  nsDependentAtomString GetKeyAsString() const {
    return nsDependentAtomString(mKey);
  }

  bool KeyEquals(const KeyTypePointer aOtherKey) const {
    if (aOtherKey->mAtom) {
      return mKey == aOtherKey->mAtom;
    }

    return mKey->Equals(*aOtherKey->mString);
  }

  static KeyTypePointer KeyToPointer(KeyType aKey) { return &aKey; }

  static PLDHashNumber HashKey(const KeyTypePointer aKey) {
    return aKey->mAtom ? aKey->mAtom->hash() : HashString(*aKey->mString);
  }

  enum { ALLOW_MEMMOVE = false };

  bool IsEmpty();

  void AddNameElement(Element* aElement);
  void RemoveNameElement(Element* aElement);
  Span<Element* const> GetNameElements() const { return mNameList.AsSpan(); }

  void GetWindowNameElements(nsTArray<Element*>&) const;
  dom::HTMLCollection* GetWindowNameContentList() const;
  dom::HTMLCollection& CreateWindowNameContentList(
      Document*, Span<Element*> aKnownElements);
  void InvalidateWindowNameContentList();
  bool HasWindowNameElement() const;

  void GetDocumentNameElements(nsTArray<Element*>&) const;
  dom::HTMLCollection* GetDocumentNameContentList() const;
  dom::HTMLCollection& CreateDocumentNameContentList(
      Document*, Span<Element*> aKnownElements);
  void InvalidateDocumentNameContentList();
  bool HasDocumentNameElement() const;

  // Returns the element associated with this id, or null.
  Element* GetIdElement() const {
    auto span = mIdList.AsSpan();
    return span.IsEmpty() ? nullptr : span[0];
  }

  // Returns the list of all elements associated with this id.
  Span<Element* const> GetIdElements() const { return mIdList.AsSpan(); }

  /**
   * If this entry has a non-null image element set (using SetImageElement),
   * the image element will be returned, otherwise the same as GetIdElement().
   */
  Element* GetImageIdElement() {
    return mImageElement ? mImageElement.get() : GetIdElement();
  }

  // This can fire ID change callbacks.
  void AddIdElement(Element* aElement);
  // This can fire ID change callbacks.
  void RemoveIdElement(Element* aElement);
  /**
   * Set the image element override for this ID. This will be returned by
   * GetImageIdElement() if non-null.
   */
  void SetImageElement(Element* aElement);
  bool HasIdElementExposedAsHTMLDocumentProperty() const;

  bool HasContentChangeCallback() { return mChangeCallbacks != nullptr; }
  void AddContentChangeCallback(IDTargetObserver aCallback, void* aData,
                                bool aForImage);
  void RemoveContentChangeCallback(IDTargetObserver aCallback, void* aData,
                                   bool aForImage);

  /**
   * Remove all elements and notify change listeners.
   */
  void ClearAndNotify();

  void Traverse(nsCycleCollectionTraversalCallback* aCallback);

  struct ChangeCallback {
    IDTargetObserver mCallback;
    void* mData;
    bool mForImage;
  };

  struct ChangeCallbackEntry : public PLDHashEntryHdr {
    typedef const ChangeCallback KeyType;
    typedef const ChangeCallback* KeyTypePointer;

    explicit ChangeCallbackEntry(const ChangeCallback* aKey) : mKey(*aKey) {}
    ChangeCallbackEntry(ChangeCallbackEntry&& aOther)
        : PLDHashEntryHdr(std::move(aOther)), mKey(std::move(aOther.mKey)) {}

    KeyType GetKey() const { return mKey; }
    bool KeyEquals(KeyTypePointer aKey) const {
      return aKey->mCallback == mKey.mCallback && aKey->mData == mKey.mData &&
             aKey->mForImage == mKey.mForImage;
    }

    static KeyTypePointer KeyToPointer(KeyType& aKey) { return &aKey; }
    static PLDHashNumber HashKey(KeyTypePointer aKey) {
      return HashGeneric(aKey->mCallback, aKey->mData);
    }
    enum { ALLOW_MEMMOVE = true };

    ChangeCallback mKey;
  };

  size_t SizeOfExcludingThis(MallocSizeOf aMallocSizeOf) const;

 private:
  IdentifierMapEntry(const IdentifierMapEntry& aOther) = delete;
  IdentifierMapEntry& operator=(const IdentifierMapEntry& aOther) = delete;

  void FireChangeCallbacks(Element* aOldElement, Element* aNewElement,
                           bool aImageOnly = false);

  // We use a RefPtr<nsAtom> as our internal key storage.
  RefPtr<nsAtom> mKey;
  dom::TreeOrderedArray<Element*> mIdList;
  dom::TreeOrderedArray<Element*> mNameList;
  RefPtr<dom::IdentifierMapContentList> mWindowNameContentList;
  RefPtr<dom::IdentifierMapContentList> mDocumentNameContentList;
  UniquePtr<nsTHashtable<ChangeCallbackEntry>> mChangeCallbacks;
  RefPtr<Element> mImageElement;
};

}  // namespace mozilla

#endif  // #ifndef mozilla_IdentifierMapEntry_h
