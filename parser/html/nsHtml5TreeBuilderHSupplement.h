/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#define NS_HTML5_TREE_BUILDER_HANDLE_ARRAY_LENGTH 512
private:
using Encoding = mozilla::Encoding;
template <typename T>
using NotNull = mozilla::NotNull<T>;

nsHtml5OplessBuilder* mBuilder;

// The spec's "parser sanitizer configuration" and the bookkeeping the
// insertion hooks need for it. Null unless sanitizing while parsing, which
// only ever happens with a non-null mBuilder. Defined in
// nsHtml5TreeBuilderCppSupplement.h.
class SanitizerState;
mozilla::UniquePtr<SanitizerState> mSanitizerState;

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// If mBuilder is not null, the tree op machinery is not in use and
// the fields below aren't in use, either.
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
nsHtml5Highlighter* mViewSource;
mozilla::ImportScanner mImportScanner;
nsTArray<nsHtml5TreeOperation> mOpQueue;
nsTArray<nsHtml5SpeculativeLoad> mSpeculativeLoadQueue;
nsAHtml5TreeOpSink* mOpSink;
mozilla::UniquePtr<nsIContent*[]> mHandles;
int32_t mHandlesUsed;
nsTArray<mozilla::UniquePtr<nsIContent*[]>> mOldHandles;
nsHtml5TreeOpStage* mSpeculativeLoadStage;
nsresult mBroken;
// Controls whether the current HTML script goes through the more complex
// path that accommodates the possibility of the script becoming a
// parser-blocking script and the possibility of the script inserting
// content into this parse using document.write (as it is observable from
// the Web).
//
// Notably, in some cases scripts that do NOT NEED the more complex path
// BREAK the parse if they incorrectly go onto the complex path as their
// other handling doesn't necessarily take care of the responsibilities
// associated with the more complex path. See comments in
// `nsHtml5TreeBuilder::createElement` in the CppSupplement for details.
bool mCurrentHtmlScriptCannotDocumentWriteOrBlock;
bool mPreventScriptExecution;
/**
 * Whether to actually generate speculative load operations that actually
 * represent speculative loads as opposed to other operations traveling
 * in the same queue. True for normal loads and false for XHR, plain text,
 * and View Source. Needed, because we can't just null-check
 * mSpeculativeLoadStage, since it is used for transferring encoding
 * information even in the XHR/plain text/View Source cases.
 */
bool mGenerateSpeculativeLoads;

bool mHasSeenImportMap;

/**
 * A temporary ptr to the CustomElementRegistry for scoped registries.
 * We hold this RefPtr during parsing, which avoids having to pass further
 * into the parser internals. Whenever SetFragmentContext is called, we
 * want to set this, then clear it out once finished.
 */
mozilla::Maybe<RefPtr<mozilla::dom::CustomElementRegistry>>
    mCustomElementRegistry;

#ifdef DEBUG
bool mActive;
#endif

// DocumentModeHandler
/**
 * Tree builder uses this to report quirkiness of the document
 */
void documentMode(nsHtml5DocumentMode m);

nsIContentHandle* getDocumentFragmentForTemplate(nsIContentHandle* aTemplate);
void setDocumentFragmentForTemplate(nsIContentHandle* aTemplate,
                                    nsIContentHandle* aFragment);

nsIContentHandle* getShadowRootFromHost(
    nsIContentHandle* aHost, nsIContentHandle* aTemplateNode,
    nsHtml5String aShadowRootMode, bool aShadowRootIsClonable,
    bool aShadowRootIsSerializable, bool aShadowRootDelegatesFocus,
    bool aShadowRootCustomElementRegistry,
    nsHtml5String aShadowRootSlotAssignment,
    nsHtml5String aShadowRootReferenceTarget);

nsIContentHandle* getFormPointerForContext(nsIContentHandle* aContext);

/**
 * Using nsIContent** instead of nsIContent* is the parser deals with DOM
 * nodes in a way that works off the main thread. Non-main-thread code
 * can't refcount or otherwise touch nsIContent objects in any way.
 * Yet, the off-the-main-thread code needs to have a way to hold onto a
 * particular node and repeatedly operate on the same node.
 *
 * The way this works is that the off-the-main-thread code has an
 * nsIContent** for each DOM node and a given nsIContent** is only ever
 * actually dereferenced into an actual nsIContent* on the main thread.
 * When the off-the-main-thread code requests a new node, it gets an
 * nsIContent** immediately and a tree op is enqueued for later allocating
 * an actual nsIContent object and writing a pointer to it into the memory
 * location pointed to by the nsIContent**.
 *
 * Since tree ops are in a queue, the node creating tree op will always
 * run before tree ops that try to further operate on the node that the
 * nsIContent** is a handle to.
 *
 * On-the-main-thread parts of the parser use nsIContent* instead of
 * nsIContent**. Since both cases share the same parser core, the parser
 * core casts both to nsIContentHandle*.
 */
nsIContentHandle* AllocateContentHandle();

void accumulateCharactersForced(const char16_t* aBuf, int32_t aStart,
                                int32_t aLength) {
  accumulateCharacters(aBuf, aStart, aLength);
}

void MarkAsBrokenAndRequestSuspensionWithBuilder(nsresult aRv) {
  mBuilder->MarkAsBroken(aRv);
  requestSuspension();
}

void MarkAsBrokenAndRequestSuspensionWithoutBuilder(nsresult aRv) {
  MarkAsBroken(aRv);
  requestSuspension();
}

void MarkAsBrokenFromPortability(nsresult aRv);

public:
explicit nsHtml5TreeBuilder(nsHtml5OplessBuilder* aBuilder);

nsHtml5TreeBuilder(nsAHtml5TreeOpSink* aOpSink, nsHtml5TreeOpStage* aStage,
                   bool aGenerateSpeculativeLoads);

~nsHtml5TreeBuilder();

bool WantsLineAndColumn() {
  // Perhaps just checking mBuilder would be sufficient.
  // For createContextualFragment, we have non-null mBuilder and
  // false for mPreventScriptExecution. However, do the line and
  // column that get attached to script elements make any sense
  // anyway in that case?
  return !(mBuilder && mPreventScriptExecution);
}

void StartPlainTextViewSource(const nsAutoString& aTitle);

void StartPlainText();

void StartPlainTextBody();

bool HasScriptThatMayDocumentWriteOrBlock();

void SetOpSink(nsAHtml5TreeOpSink* aOpSink) { mOpSink = aOpSink; }

void ClearOps() { mOpQueue.Clear(); }

/**
 * Flushes tree ops.
 * @return Ok(true) if there were ops to flush, Ok(false)
 *         if there were no ops to flush and Err() on OOM.
 */
mozilla::Result<bool, nsresult> Flush(bool aDiscretionary = false);

void FlushLoads();

/**
 * Sets the document charset via the speculation queue.
 *
 * @param aCommitEncodingSpeculation true iff the main thread should
 *                           treat the first speculation as an
 *                           encoding speculation.
 */
void SetDocumentCharset(NotNull<const Encoding*> aEncoding,
                        nsCharsetSource aCharsetSource,
                        bool aCommitEncodingSpeculation);

/**
 * Updates the charset source via the op queue.
 */
void UpdateCharsetSource(nsCharsetSource aCharsetSource);

void StreamEnded();

void NeedsCharsetSwitchTo(NotNull<const Encoding*> aEncoding, int32_t aSource,
                          int32_t aLineNumber);

void MaybeComplainAboutCharset(const char* aMsgId, bool aError,
                               int32_t aLineNumber);

void TryToEnableEncodingMenu();

void AddSnapshotToScript(nsAHtml5TreeBuilderState* aSnapshot, int32_t aLine);

void DropHandles();

void SetPreventScriptExecution(bool aPrevent) {
  mPreventScriptExecution = aPrevent;
}

void SetCustomElementRegistry(
    mozilla::Maybe<RefPtr<mozilla::dom::CustomElementRegistry>> aRegistry) {
  mCustomElementRegistry = std::move(aRegistry);
}

/**
 * Sets the spec's "parser sanitizer configuration" (null not to sanitize
 * while parsing) and "remove javascript navigation URLs" for the next parse.
 * The caller has to keep aSanitizer alive until the parse ends; the parse end
 * drops it.
 */
void SetSanitizer(mozilla::dom::Sanitizer* aSanitizer, bool aSafe);

/**
 * Whether the sanitizer replaced an adoption agency algorithm clone with its
 * children, in which case the clone is not in the tree and the algorithm
 * leaves lastNode where it is. Redirects the clone's content to where the
 * content of aCommonAncestor goes: the algorithm never inserts the clone, so
 * this is the only point at which that location is known.
 */
bool sanitizerRedirectsClone(nsIContentHandle* aClone,
                             nsIContentHandle* aCommonAncestor) {
  return MOZ_UNLIKELY(mSanitizerState) &&
         SanitizerRedirectsCloneImpl(static_cast<nsIContent*>(aClone),
                                     static_cast<nsIContent*>(aCommonAncestor));
}

/**
 * Re-points the content of a furthest block that the sanitizer replaced with
 * its children at aParent, where the adoption agency algorithm moves the
 * content the block already has. The two overloads take the two shapes of
 * insertion target the algorithm has at that point: a plain parent, and a
 * foster parenting location.
 */
void sanitizerRedirectFurthestBlock(nsIContentHandle* aFurthestBlock,
                                    nsIContentHandle* aParent) {
  if (MOZ_UNLIKELY(mSanitizerState)) {
    SanitizerRedirectFurthestBlockImpl(static_cast<nsIContent*>(aFurthestBlock),
                                       static_cast<nsIContent*>(aParent));
  }
}

void sanitizerRedirectFurthestBlockToFosterParent(
    nsIContentHandle* aFurthestBlock, nsIContentHandle* aTable,
    nsIContentHandle* aStackParent) {
  if (MOZ_UNLIKELY(mSanitizerState)) {
    SanitizerRedirectFurthestBlockToFosterParentImpl(
        static_cast<nsIContent*>(aFurthestBlock),
        static_cast<nsIContent*>(aTable),
        static_cast<nsIContent*>(aStackParent));
  }
}

/**
 * Sanitizes a template start tag token before the declarative shadow DOM
 * steps read its attributes, and reports whether the sanitizer drops the
 * template element the token creates. The spec sanitizes the template element
 * before it applies declarative shadow DOM, so that a configuration that
 * removes shadowrootmode (or the template itself) suppresses the shadow root.
 */
bool sanitizerDropsTemplateToken(nsHtml5HtmlAttributes* aAttributes) {
  return MOZ_UNLIKELY(mSanitizerState) &&
         SanitizerDropsTemplateTokenImpl(aAttributes);
}

// The sanitizing-while-parsing side of the insertion hooks. Kept out of line
// so that a parse without a sanitizer pays only the mSanitizerState null
// check, which is what the hooks above and below guard these with.
MOZ_NEVER_INLINE bool SanitizerRedirectsCloneImpl(nsIContent* aClone,
                                                  nsIContent* aCommonAncestor);
MOZ_NEVER_INLINE void SanitizerRedirectFurthestBlockImpl(
    nsIContent* aFurthestBlock, nsIContent* aParent);
MOZ_NEVER_INLINE void SanitizerRedirectFurthestBlockToFosterParentImpl(
    nsIContent* aFurthestBlock, nsIContent* aTable, nsIContent* aStackParent);
MOZ_NEVER_INLINE bool SanitizerDropsTemplateTokenImpl(
    nsHtml5HtmlAttributes* aAttributes);
MOZ_NEVER_INLINE void SanitizedAppendElement(nsIContent* aChild,
                                             nsIContent* aParent);
MOZ_NEVER_INLINE void SanitizedAppendCharacters(nsIContent* aParent,
                                                char16_t* aBuffer,
                                                int32_t aLength);
MOZ_NEVER_INLINE void SanitizedAppendComment(nsIContent* aParent,
                                             char16_t* aBuffer,
                                             int32_t aLength);
MOZ_NEVER_INLINE void SanitizedFosterParentCharacters(char16_t* aBuffer,
                                                      int32_t aLength,
                                                      nsIContent* aTable,
                                                      nsIContent* aStackParent);
MOZ_NEVER_INLINE void SanitizedFosterParentChild(nsIContent* aChild,
                                                 nsIContent* aTable,
                                                 nsIContent* aStackParent);

bool HasBuilder() { return mBuilder; }

// Whether the parse still has the spec's "parser sanitizer configuration",
// which the parse end drops.
bool HasSanitizer() { return !!mSanitizerState; }

/**
 * Makes sure the buffers are large enough to be able to tokenize aLength
 * UTF-16 code units before having to make the buffers larger.
 *
 * @param aLength the number of UTF-16 code units to be tokenized before the
 *                next call to this method.
 * @return true if successful; false if out of memory
 */
bool EnsureBufferSpace(int32_t aLength);

void EnableViewSource(nsHtml5Highlighter* aHighlighter);

void errDeepTree();

void errStrayStartTag(nsAtom* aName);

void errStrayEndTag(nsAtom* aName);

void errUnclosedElements(int32_t aIndex, nsAtom* aName);

void errUnclosedElementsImplied(int32_t aIndex, nsAtom* aName);

void errUnclosedElementsCell(int32_t aIndex);

void errStrayDoctype();

void errAlmostStandardsDoctype();

void errQuirkyDoctype();

void errNonSpaceInTrailer();

void errNonSpaceAfterFrameset();

void errNonSpaceInFrameset();

void errNonSpaceAfterBody();

void errNonSpaceInColgroupInFragment();

void errNonSpaceInNoscriptInHead();

void errFooBetweenHeadAndBody(nsAtom* aName);

void errStartTagWithoutDoctype();

void errNoSelectInTableScope();

void errStartSelectWhereEndSelectExpected();

void errStartTagWithSelectOpen(nsAtom* aName);

void errBadStartTagInNoscriptInHead(nsAtom* aName);

void errImage();

void errIsindex();

void errFooSeenWhenFooOpen(nsAtom* aName);

void errHeadingWhenHeadingOpen();

void errFramesetStart();

void errNoCellToClose();

void errStartTagInTable(nsAtom* aName);

void errFormWhenFormOpen();

void errTableSeenWhileTableOpen();

void errStartTagInTableBody(nsAtom* aName);

void errEndTagSeenWithoutDoctype();

void errEndTagAfterBody();

void errEndTagSeenWithSelectOpen(nsAtom* aName);

void errGarbageInColgroup();

void errEndTagBr();

void errNoElementToCloseButEndTagSeen(nsAtom* aName);

void errHtmlStartTagInForeignContext(nsAtom* aName);

void errNoTableRowToClose();

void errNonSpaceInTable();

void errUnclosedChildrenInRuby();

void errStartTagSeenWithoutRuby(nsAtom* aName);

void errSelfClosing();

void errNoCheckUnclosedElementsOnStack();

void errEndTagDidNotMatchCurrentOpenElement(nsAtom* aName, nsAtom* aOther);

void errEndTagViolatesNestingRules(nsAtom* aName);

void errEndWithUnclosedElements(nsAtom* aName);

void errListUnclosedStartTags(int32_t aIgnored);

void MarkAsBroken(nsresult aRv);

/**
 * Checks if this parser is broken. Returns a non-NS_OK (i.e. non-0)
 * value if broken.
 */
nsresult IsBroken() { return mBroken; }
