/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_Highlight_h
#define mozilla_dom_Highlight_h

#include <fmt/format.h>

#include "mozilla/Attributes.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/ECMACollectionMixin.h"
#include "mozilla/dom/HighlightBinding.h"
#include "nsCycleCollectionParticipant.h"
#include "nsTArray.h"
#include "nsTHashSet.h"
#include "nsWrapperCache.h"

class nsFrameSelection;
class nsPIDOMWindowInner;

namespace mozilla::dom {
class AbstractRange;
class Document;
class Element;
class HighlightRegistry;
class Selection;
class ShadowRoot;

/**
 * @brief Collection of all data of a highlight instance.
 *
 * This struct is intended to be allocated on the stack and passed on
 * to the `nsFrameSelection` and layout code.
 */
struct HighlightSelectionData {
  friend auto format_as(const HighlightSelectionData& aData) {
    nsAutoCString highlightName;
    if (aData.mHighlightName) {
      highlightName = nsAtomCString(aData.mHighlightName);
    }
    return fmt::format("{{ mHighlightName=\"{}\", mHighlight={} }}",
                       highlightName.get(),
                       static_cast<void*>(aData.mHighlight.get()));
  }
  friend std::ostream& operator<<(std::ostream& aStream,
                                  const HighlightSelectionData& aData) {
    return aStream << format_as(aData);
  }

  RefPtr<nsAtom> mHighlightName;
  RefPtr<Highlight> mHighlight;
};

/**
 * @brief Representation of a custom `Highlight`.
 *
 * A `Highlight` is defined in JS as a collection of `AbstractRange`s.
 * Furthermore, a custom highlight contains the highlight type and priority.
 *
 * A highlight is added to a document using the `HighlightRegistry` interface.
 * A highlight can be added to a document using different names as well as to
 * multiple `HighlightRegistries`.
 * To propagate runtime changes of the highlight to its registries, an
 * observer pattern is implemented.
 *
 * The spec defines this class as a `setlike`. Insertion and deletion operations
 * are overridden to notify the `HighlightRegistry` instances that contain this
 * highlight.
 *
 * @see https://drafts.csswg.org/css-highlight-api-1/#creation
 */
class Highlight final : public nsISupports,
                        public nsWrapperCache,
                        public SetlikeMixin<RefPtr<AbstractRange>> {
 public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(Highlight)

  template <typename T, typename... Args>
  friend already_AddRefed<T> mozilla::MakeAndAddRef(Args&&... aArgs);

 protected:
  Highlight(const Sequence<OwningNonNull<AbstractRange>>& aInitialRanges,
            nsPIDOMWindowInner* aWindow);
  ~Highlight() = default;

 public:
  /**
   * @brief Adds `this` to `aHighlightRegistry`.
   *
   * Highlights must know of all registry objects which contain them, so that
   * the registries can be notified when a property of the Highlight changes.
   *
   * Since a Highlight can be part of a registry using different names,
   * the name has to be provided as well.
   */
  void AddToHighlightRegistry(HighlightRegistry& aHighlightRegistry,
                              nsAtom& aHighlightName);

  /**
   * @brief Removes `this` from `aHighlightRegistry`.
   */
  void RemoveFromHighlightRegistry(HighlightRegistry& aHighlightRegistry,
                                   nsAtom& aHighlightName);

  // WebIDL interface
  nsPIDOMWindowInner* GetParentObject() const { return mWindow; }

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<Highlight> Constructor(
      const GlobalObject& aGlobal,
      const Sequence<OwningNonNull<AbstractRange>>& aInitialRanges,
      ErrorResult& aRv);

  /**
   * @brief Priority of this highlight.
   *
   * Priority is used to stack overlapping highlights.
   */
  int32_t Priority() const { return mPriority; }

  /**
   * @brief Set the priority of this Highlight.
   *
   * Priority is used to stack overlapping highlights.
   */
  void SetPriority(int32_t aPriority);

  /**
   * @brief The HighlightType of this Highlight (Highlight, Spelling Error,
   * Grammar Error)
   */
  HighlightType Type() const { return mHighlightType; }

  /**
   * @brief Sets the HighlightType (Highlight, Spelling Error, Grammar Error)
   */
  void SetType(HighlightType aHighlightType);

  /**
   * @brief Adds a `Range` to this highlight and notifies all
   * `HighlightRegistry` instances.
   */
  MOZ_CAN_RUN_SCRIPT void Add(AbstractRange& aRange, ErrorResult& aRv) override;

  /**
   * @brief Removes all ranges from this highlight and notifies all
   * `HighlightRegistry` instances.
   */
  MOZ_CAN_RUN_SCRIPT void Clear() override;

  /**
   * @brief Removes `aRange` from this highlight and notifies all
   * `HighlightRegistry` instances.
   *
   * @return As per spec, returns true if the range was deleted.
   */
  MOZ_CAN_RUN_SCRIPT bool Delete(AbstractRange& aRange) override;

  /**
   * @brief Returns ranges of this highlight present at the given point.
   *
   * This method uses `range.getClientRects()` to determine if a range is
   * present at the given point.
   * Ranges in a shadow tree are only considered if the shadow root is in
   * `aShadowRoots`. If `aPointShadowRoot` is non-null, only ranges in that
   * shadow tree are considered (the point itself is inside it).
   *
   * @param aX               x coordinate
   * @param aY               y coordinate
   * @param aShadowRoots     List of shadow roots to consider
   * @param aElementAtPoint  The element at the hit-tested point.
   */
  nsTArray<RefPtr<AbstractRange>> RangesAtPoint(
      float aX, float aY,
      const Sequence<OwningNonNull<mozilla::dom::ShadowRoot>>& aShadowRoots,
      mozilla::dom::Element* aElementAtPoint) const;

 private:
  void Repaint();

  RefPtr<nsPIDOMWindowInner> mWindow;

  /**
   * Type of this highlight.
   * @see HighlightType
   */
  HighlightType mHighlightType{HighlightType::Highlight};

  /**
   * Priority of this highlight.
   *
   * If highlights are overlapping, the priority can
   * be used to prioritize. If the priorities of all
   * Highlights involved are equal, the highlights are
   * stacked in order of ther insertion into the
   * `HighlightRegistry`.
   */
  int32_t mPriority{0};

  /**
   * All highlight registries that contain this Highlight.
   *
   * A highlight can be included in several registries
   * using several names.
   *
   * Note: Storing `HighlightRegistry` as raw pointer is safe here
   * because it unregisters itself from `this` when it is destroyed/CC'd
   */
  nsTHashMap<nsPtrHashKey<HighlightRegistry>, nsTHashSet<RefPtr<nsAtom>>>
      mHighlightRegistries;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_Highlight_h
