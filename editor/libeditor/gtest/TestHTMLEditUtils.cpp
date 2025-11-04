/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/BasePrincipal.h"
#include "mozilla/OriginAttributes.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Text.h"
#include "EditorDOMPoint.h"
#include "HTMLEditUtils.h"
#include "nsCOMPtr.h"
#include "nsGenericHTMLElement.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsString.h"

namespace mozilla {

using namespace dom;

using AncestorType = HTMLEditUtils::AncestorType;
using AncestorTypes = HTMLEditUtils::AncestorTypes;
using EditablePointOption = HTMLEditUtils::EditablePointOption;
using EditablePointOptions = HTMLEditUtils::EditablePointOptions;

static already_AddRefed<Document> CreateHTMLDoc() {
  nsCOMPtr<nsIURI> uri;
  NS_NewURI(getter_AddRefs(uri), "data:text/html,");

  RefPtr<BasePrincipal> principal =
      BasePrincipal::CreateContentPrincipal(uri, OriginAttributes());
  MOZ_RELEASE_ASSERT(principal);

  nsCOMPtr<Document> doc;
  MOZ_ALWAYS_SUCCEEDS(NS_NewDOMDocument(getter_AddRefs(doc),
                                        u""_ns,   // aNamespaceURI
                                        u""_ns,   // aQualifiedName
                                        nullptr,  // aDoctype
                                        uri, uri, principal,
                                        false,    // aLoadedAsData
                                        nullptr,  // aEventObject
                                        DocumentFlavor::HTML));
  MOZ_RELEASE_ASSERT(doc);

  RefPtr<Element> html = doc->CreateHTMLElement(nsGkAtoms::html);
  html->SetInnerHTMLTrusted(u"<html><head></head><body></body></html>"_ns,
                            principal, IgnoreErrors());
  doc->AppendChild(*html, IgnoreErrors());

  return doc.forget();
}

struct MOZ_STACK_CLASS DeepestEditablePointTest final {
  const char16_t* const mInnerHTML;
  const char* const mContentSelector;
  const EditablePointOptions mOptions;
  const char* const mExpectedContainerSelector;
  const char16_t* const mExpectedTextData;
  const uint32_t mExpectedOffset;

  friend std::ostream& operator<<(std::ostream& aStream,
                                  const DeepestEditablePointTest& aTest) {
    return aStream << "Scan \"" << aTest.mContentSelector
                   << "\" with options=" << ToString(aTest.mOptions).c_str()
                   << " in \"" << NS_ConvertUTF16toUTF8(aTest.mInnerHTML).get()
                   << "\"";
  }
};

TEST(HTMLEditUtilsTest, GetDeepestEditableStartPointOf)
{
  const RefPtr<Document> doc = CreateHTMLDoc();
  const RefPtr<nsGenericHTMLElement> body = doc->GetBody();
  MOZ_RELEASE_ASSERT(body);
  for (const auto& testData : {
           DeepestEditablePointTest{
               u"<div contenteditable><div><br></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><img></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <img>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><hr></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <hr>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>abc</div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               u"abc",
               0  // Find "a"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><p>abc</p></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div > p",
               u"abc",
               0  // Find "a"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><span>abc</span></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div > span",
               u"abc",
               0  // Find "a"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>   abc</div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               u"   abc",
               3  // Find "a"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><span>   abc</span></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div > span",
               u"   abc",
               3  // Find "a"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>   abc</div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::RecognizeInvisibleWhiteSpaces},
               "div[contenteditable] > div",
               u"   abc",
               0  // Find the first white-space
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><span>   abc</span></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::RecognizeInvisibleWhiteSpaces},
               "div[contenteditable] > div > span",
               u"   abc",
               0  // Find the first white-space
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><span></span>abc</div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div > span",
               nullptr,
               0  // Find the empty <span>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><!-- comment -->abc</div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               u"abc",
               0  // Find "a"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><!-- comment -->abc</div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtComment},
               "div[contenteditable] > div",
               nullptr,
               0  // Find the comment
           },
           // inline-block may have leading white-spaces.  Therefore, even if
           // the start container is an inline element which follows visible
           // characters, it should return the first visible character in the
           // inline-block.
           DeepestEditablePointTest{
               u"<div contenteditable><div>abc<b><span style=\"display: "
               u"inline-block\">   def</span></b></div></div>",
               "div[contenteditable] > div > b",
               {},
               "div[contenteditable] > div > b > span",
               u"   def",
               3  // Find "d"
           },
           // There is a child <table>
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] td",
               nullptr,
               0  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtTableElement},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <table>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtAnyTableElement},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <table>
           },
           // In a table structure
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] table",
               {},
               "div[contenteditable] td",
               nullptr,
               0  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] table",
               {EditablePointOption::StopAtTableElement},
               "div[contenteditable] td",
               nullptr,
               0  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] table",
               {EditablePointOption::StopAtAnyTableElement},
               "div[contenteditable] table",
               nullptr,
               0  // Find <td>
           },
           // <ul>
           DeepestEditablePointTest{
               u"<div contenteditable><div><ul><li><br></li></ul></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] li",
               nullptr,
               0  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><ul><li><br></li></ul></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListItemElement},
               "div[contenteditable] ul",
               nullptr,
               0  // Find <li>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><ul><li><br></li></ul></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListElement},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <ul>
           },
           // <ol>
           DeepestEditablePointTest{
               u"<div contenteditable><div><ol><li><br></li></ol></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] li",
               nullptr,
               0  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><ol><li><br></li></ol></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListItemElement},
               "div[contenteditable] ol",
               nullptr,
               0  // Find <li>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><ol><li><br></li></ol></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListElement},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <ol>
           },
           // <dl> and <dt>
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dt><br></dt></dl></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] dt",
               nullptr,
               0  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dt><br></dt></dl></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListItemElement},
               "div[contenteditable] dl",
               nullptr,
               0  // Find <dt>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dt><br></dt></dl></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListElement},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <dl>
           },
           // <dl> and <dd>
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dd><br></dd></dl></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] dd",
               nullptr,
               0  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dd><br></dd></dl></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListItemElement},
               "div[contenteditable] dl",
               nullptr,
               0  // Find <dd>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dd><br></dd></dl></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListElement},
               "div[contenteditable] > div",
               nullptr,
               0  // Find <dl>
           },
       }) {
    body->SetInnerHTMLTrusted(nsDependentString(testData.mInnerHTML),
                              doc->NodePrincipal(), IgnoreErrors());
    const Element* const content = body->QuerySelector(
        nsDependentCString(testData.mContentSelector), IgnoreErrors());
    MOZ_RELEASE_ASSERT(content);
    const nsIContent* const expectedContainer = [&]() -> const nsIContent* {
      const Element* const containerElement = body->QuerySelector(
          nsDependentCString(testData.mExpectedContainerSelector),
          IgnoreErrors());
      if (!testData.mExpectedTextData) {
        return containerElement;
      }
      for (const nsIContent* child = containerElement->GetFirstChild(); child;
           child = child->GetNextSibling()) {
        if (const auto* text = Text::FromNodeOrNull(child)) {
          nsAutoString data;
          text->GetData(data);
          if (data.Equals(testData.mExpectedTextData)) {
            return text;
          }
        }
      }
      return nullptr;
    }();
    MOZ_RELEASE_ASSERT(expectedContainer);
    const EditorRawDOMPoint result =
        HTMLEditUtils::GetDeepestEditableStartPointOf<EditorRawDOMPoint>(
            *content, testData.mOptions);
    EXPECT_EQ(result.GetContainer(), expectedContainer)
        << testData << "(Got: " << ToString(RefPtr{result.GetContainer()})
        << ")";
    EXPECT_EQ(result.Offset(), testData.mExpectedOffset) << testData;
  }
}

TEST(HTMLEditUtilsTest, GetDeepestEditableEndPointOf)
{
  const RefPtr<Document> doc = CreateHTMLDoc();
  const RefPtr<nsGenericHTMLElement> body = doc->GetBody();
  MOZ_RELEASE_ASSERT(body);
  for (const auto& testData : {
           DeepestEditablePointTest{
               u"<div contenteditable><div><br></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               nullptr,
               // XXX Should be 0 due to an invisible <br>?
               1  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><img></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               nullptr,
               1  // Find <img>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><hr></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               nullptr,
               1  // Find <hr>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>abc</div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               u"abc",
               3  // Find "c"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><p>abc</p></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div > p",
               u"abc",
               3  // Find "c"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><span>abc</span></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div > span",
               u"abc",
               3  // Find "c"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>abc   </div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               u"abc   ",
               3  // Find "c"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><span>abc   </span></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div > span",
               u"abc   ",
               3  // Find "a"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>abc   </div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::RecognizeInvisibleWhiteSpaces},
               "div[contenteditable] > div",
               u"abc   ",
               6  // Find the last white-space
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><span>abc   </span></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::RecognizeInvisibleWhiteSpaces},
               "div[contenteditable] > div > span",
               u"abc   ",
               6  // Find the last white-space
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>abc<span></span></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div > span",
               nullptr,
               0  // Find the empty <span>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>abc<!-- comment --></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] > div",
               u"abc",
               3  // Find "c"
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div>abc<!-- comment --></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtComment},
               "div[contenteditable] > div",
               nullptr,
               2  // Find the comment
           },
           // inline-block may have leading white-spaces.  Therefore, even if
           // the start container is an inline element which is followed by
           // visible characters, it should return the last visible character
           // in the inline-block.
           DeepestEditablePointTest{
               u"<div contenteditable><div><b><span style=\"display: "
               u"inline-block\">abc   </span></b>def</div></div>",
               "div[contenteditable] > div > b",
               {},
               "div[contenteditable] > div > b > span",
               u"abc   ",
               3  // Find "c"
           },
           // There is a child <table>
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] td",
               nullptr,
               1  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtTableElement},
               "div[contenteditable] > div",
               nullptr,
               1  // Find <table>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtAnyTableElement},
               "div[contenteditable] > div",
               nullptr,
               1  // Find <table>
           },
           // In a table structure
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] table",
               {},
               "div[contenteditable] td",
               nullptr,
               1  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] table",
               {EditablePointOption::StopAtTableElement},
               "div[contenteditable] td",
               nullptr,
               1  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><table><td><br></table></div></div>",
               "div[contenteditable] table",
               {EditablePointOption::StopAtAnyTableElement},
               "div[contenteditable] table",
               nullptr,
               1  // Find <td>
           },
           // <ul>
           DeepestEditablePointTest{
               u"<div contenteditable><div><ul><li><br></li></ul></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] li",
               nullptr,
               1  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><ul><li><br></li></ul></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListItemElement},
               "div[contenteditable] ul",
               nullptr,
               1  // Find <li>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><ul><li><br></li></ul></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListElement},
               "div[contenteditable] > div",
               nullptr,
               1  // Find <ul>
           },
           // <ol>
           DeepestEditablePointTest{
               u"<div contenteditable><div><ol><li><br></li></ol></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] li",
               nullptr,
               1  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><ol><li><br></li></ol></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListItemElement},
               "div[contenteditable] ol",
               nullptr,
               1  // Find <li>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><ol><li><br></li></ol></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListElement},
               "div[contenteditable] > div",
               nullptr,
               1  // Find <ol>
           },
           // <dl> and <dt>
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dt><br></dt></dl></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] dt",
               nullptr,
               1  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dt><br></dt></dl></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListItemElement},
               "div[contenteditable] dl",
               nullptr,
               1  // Find <dt>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dt><br></dt></dl></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListElement},
               "div[contenteditable] > div",
               nullptr,
               1  // Find <dl>
           },
           // <dl> and <dd>
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dd><br></dd></dl></div></div>",
               "div[contenteditable] > div",
               {},
               "div[contenteditable] dd",
               nullptr,
               1  // Find <br>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dd><br></dd></dl></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListItemElement},
               "div[contenteditable] dl",
               nullptr,
               1  // Find <dd>
           },
           DeepestEditablePointTest{
               u"<div contenteditable><div><dl><dd><br></dd></dl></div></div>",
               "div[contenteditable] > div",
               {EditablePointOption::StopAtListElement},
               "div[contenteditable] > div",
               nullptr,
               1  // Find <dl>
           },
       }) {
    body->SetInnerHTMLTrusted(nsDependentString(testData.mInnerHTML),
                              doc->NodePrincipal(), IgnoreErrors());
    const Element* const content = body->QuerySelector(
        nsDependentCString(testData.mContentSelector), IgnoreErrors());
    MOZ_RELEASE_ASSERT(content);
    const nsIContent* const expectedContainer = [&]() -> const nsIContent* {
      const Element* const containerElement = body->QuerySelector(
          nsDependentCString(testData.mExpectedContainerSelector),
          IgnoreErrors());
      if (!testData.mExpectedTextData) {
        return containerElement;
      }
      for (const nsIContent* child = containerElement->GetLastChild(); child;
           child = child->GetPreviousSibling()) {
        if (const auto* text = Text::FromNodeOrNull(child)) {
          nsAutoString data;
          text->GetData(data);
          if (data.Equals(testData.mExpectedTextData)) {
            return text;
          }
        }
      }
      return nullptr;
    }();
    MOZ_RELEASE_ASSERT(expectedContainer);
    const EditorRawDOMPoint result =
        HTMLEditUtils::GetDeepestEditableEndPointOf<EditorRawDOMPoint>(
            *content, testData.mOptions);
    EXPECT_EQ(result.GetContainer(), expectedContainer)
        << testData << "(Got: " << ToString(RefPtr{result.GetContainer()})
        << ")";
    EXPECT_EQ(result.Offset(), testData.mExpectedOffset) << testData;
  }
}

struct MOZ_STACK_CLASS AncestorElementTest final {
  const char16_t* const mInnerHTML;
  const char* const mContentSelector;
  const AncestorTypes mAncestorTypes;
  const char* const mAncestorLimiterSelector;
  const char* const mExpectedSelectorForAncestor;
  const char* const mExpectedSelectorForInclusiveAncestor;

  friend std::ostream& operator<<(std::ostream& aStream,
                                  const AncestorElementTest& aTest) {
    return aStream << "Scan from \"" << aTest.mContentSelector
                   << "\" with ancestor types="
                   << ToString(aTest.mAncestorTypes).c_str() << " in \""
                   << NS_ConvertUTF16toUTF8(aTest.mInnerHTML).get() << "\"";
  }
};

TEST(HTMLEditUtilsTest, GetAncestorElement_ClosestBlockElement)
{
  using AncestorType = HTMLEditUtils::AncestorType;
  const RefPtr<Document> doc = CreateHTMLDoc();
  const RefPtr<nsGenericHTMLElement> body = doc->GetBody();
  MOZ_RELEASE_ASSERT(body);
  for (const auto& testData : {
           AncestorElementTest{
               u"<div contenteditable><div><span><div><span><br>"
               u"</span></div></span></div></div>",
               "[contenteditable] > div > span > div > span",
               {AncestorType::ClosestBlockElement},
               "[contenteditable]",
               "[contenteditable] > div > span > div",
               "[contenteditable] > div > span > div"},
           AncestorElementTest{
               u"<div contenteditable><div><span><div><span><br>"
               u"</span></div></span></div></div>",
               "[contenteditable] > div > span > div",
               {AncestorType::ClosestBlockElement},
               "[contenteditable]",
               "[contenteditable] > div",
               "[contenteditable] > div > span > div"},
           AncestorElementTest{
               u"<div contenteditable><div><span><br></span></div></div>",
               "[contenteditable] > div",
               {AncestorType::ClosestBlockElement},
               "[contenteditable]",
               // Should return the editing host because of the closest ancestor
               // of the deepest <div>.
               "[contenteditable]",
               "[contenteditable] > div"},
           AncestorElementTest{
               u"<div contenteditable><span><br></span></div>",
               "[contenteditable] > span",
               {AncestorType::ClosestBlockElement},
               "[contenteditable]",
               // Should return the editing host because of a block.
               "[contenteditable]",
               "[contenteditable]"},
           AncestorElementTest{
               u"<div contenteditable><span><br></span></div>",
               "[contenteditable] > span",
               {AncestorType::ClosestBlockElement,
                AncestorType::ReturnAncestorLimiterIfNoProperAncestor},
               "[contenteditable]",
               "[contenteditable]",
               "[contenteditable]"},
           AncestorElementTest{u"<div contenteditable><span><br></span></div>",
                               "[contenteditable] > span",
                               {AncestorType::ClosestBlockElement,
                                AncestorType::EditableElement},
                               "[contenteditable]",
                               "[contenteditable]",
                               "[contenteditable]"},
           AncestorElementTest{
               u"<div contenteditable><span><br></span></div>",
               "[contenteditable] > span",
               {AncestorType::ClosestBlockElement,
                AncestorType::EditableElement,
                AncestorType::ReturnAncestorLimiterIfNoProperAncestor},
               "[contenteditable]",
               "[contenteditable]",
               "[contenteditable]"},
           AncestorElementTest{
               u"<span contenteditable><span><br></span></span>",
               "[contenteditable] > span",
               {AncestorType::ClosestBlockElement,
                AncestorType::EditableElement,
                AncestorType::ReturnAncestorLimiterIfNoProperAncestor},
               "[contenteditable]",
               // Should return the inline editing host because of the ancestor
               // limiter.
               "[contenteditable]",
               "[contenteditable]"},
           AncestorElementTest{
               u"<span contenteditable><span><br></span></span>",
               "[contenteditable] > span",
               {AncestorType::ClosestBlockElement,
                AncestorType::EditableElement},
               "[contenteditable]",
               // Should not return the body because of not editable.
               nullptr,
               nullptr},
           AncestorElementTest{
               u"<div><span contenteditable><br></span>",
               "[contenteditable]",
               {AncestorType::ClosestBlockElement,
                AncestorType::EditableElement,
                AncestorType::ReturnAncestorLimiterIfNoProperAncestor},
               "div",  // parent of the editing host
               // nullptr because of starting to scan from non-editable element.
               nullptr,
               // the editing host.
               "[contenteditable]",
           },
       }) {
    body->SetInnerHTMLTrusted(nsDependentString(testData.mInnerHTML),
                              doc->NodePrincipal(), IgnoreErrors());
    const Element* const content = body->QuerySelector(
        nsDependentCString(testData.mContentSelector), IgnoreErrors());
    MOZ_RELEASE_ASSERT(content);
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForAncestor
              ? body->QuerySelector(
                    nsDependentCString(testData.mExpectedSelectorForAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForInclusiveAncestor
              ? body->QuerySelector(
                    nsDependentCString(
                        testData.mExpectedSelectorForInclusiveAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetInclusiveAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetInclusiveAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
  }
}

TEST(HTMLEditUtilsTest, GetAncestorElement_MostDistantInlineElementInBlock)
{
  using AncestorType = HTMLEditUtils::AncestorType;
  const RefPtr<Document> doc = CreateHTMLDoc();
  const RefPtr<nsGenericHTMLElement> body = doc->GetBody();
  MOZ_RELEASE_ASSERT(body);
  for (const auto& testData : {
           AncestorElementTest{
               u"<div contenteditable><span><br></span></div>",
               "[contenteditable] > span",
               {AncestorType::MostDistantInlineElementInBlock,
                AncestorType::EditableElement,
                AncestorType::ReturnAncestorLimiterIfNoProperAncestor},
               "[contenteditable]",
               // Should return the editing host because of editable.
               "[contenteditable]",
               "[contenteditable] > span"},
           AncestorElementTest{
               u"<div contenteditable><b><i><div><u><s><br>"
               u"</s></u></div></i></b></div>",
               "[contenteditable] s",
               {AncestorType::MostDistantInlineElementInBlock},
               "[contenteditable]",
               // Should return the <u> because of the deepest <div>.
               "[contenteditable] u",
               "[contenteditable] u"},
           AncestorElementTest{u"<div contenteditable><b><i><div><u><s><br>"
                               u"</s></u></div></i></b></div>",
                               "[contenteditable] u",
                               {AncestorType::MostDistantInlineElementInBlock},
                               "[contenteditable]",
                               // Should return nullptr because of no ancestor
                               // in the deepest <div>.
                               nullptr,
                               "[contenteditable] u"},
           AncestorElementTest{
               u"<div contenteditable><b><i><div><u><s><br>"
               u"</s></u></div></i></b></div>",
               "[contenteditable] div",
               {AncestorType::MostDistantInlineElementInBlock},
               "[contenteditable]",
               "[contenteditable] b",
               // Should return nullptr because of starting from the <div>.
               nullptr},
           AncestorElementTest{
               u",<s><span contenteditable><b><i><br></i></b></span></s>",
               "[contenteditable] i",
               {AncestorType::MostDistantInlineElementInBlock},
               "[contenteditable]",
               // Should return the editing host because of inline.
               "[contenteditable]",
               "[contenteditable]"},
           AncestorElementTest{
               u"<s><span contenteditable><b><i><br></i></b></span></s>",
               "[contenteditable] i",
               {AncestorType::MostDistantInlineElementInBlock,
                AncestorType::ReturnAncestorLimiterIfNoProperAncestor},
               "[contenteditable]",
               // Should return the editing host because of inline.
               "[contenteditable]",
               "[contenteditable]"},
           AncestorElementTest{
               u"<s><span contenteditable><b><i><br></i></b></span></s>",
               "[contenteditable] i",
               {AncestorType::MostDistantInlineElementInBlock,
                AncestorType::EditableElement},
               nullptr,
               // Should return the editing host because of the editable root.
               "[contenteditable]",
               "[contenteditable]"},
       }) {
    body->SetInnerHTMLTrusted(nsDependentString(testData.mInnerHTML),
                              doc->NodePrincipal(), IgnoreErrors());
    const Element* const content = body->QuerySelector(
        nsDependentCString(testData.mContentSelector), IgnoreErrors());
    MOZ_RELEASE_ASSERT(content);
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForAncestor
              ? body->QuerySelector(
                    nsDependentCString(testData.mExpectedSelectorForAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForInclusiveAncestor
              ? body->QuerySelector(
                    nsDependentCString(
                        testData.mExpectedSelectorForInclusiveAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetInclusiveAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetInclusiveAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
  }
}

TEST(HTMLEditUtilsTest, GetAncestorElement_ButtonElement)
{
  using AncestorType = HTMLEditUtils::AncestorType;
  const RefPtr<Document> doc = CreateHTMLDoc();
  const RefPtr<nsGenericHTMLElement> body = doc->GetBody();
  MOZ_RELEASE_ASSERT(body);
  for (const auto& testData : {
           AncestorElementTest{
               u"<div contenteditable><button><span><br></span></button></div>",
               "[contenteditable] > button > span",
               {AncestorType::ClosestBlockElement,
                AncestorType::ClosestButtonElement},
               "[contenteditable]",
               "[contenteditable] > button",
               "[contenteditable] > button"},
           AncestorElementTest{
               u"<div contenteditable><button><br></button></div>",
               "[contenteditable] > button",
               {AncestorType::ClosestBlockElement,
                AncestorType::ClosestButtonElement},
               "[contenteditable]",
               "[contenteditable]",
               "[contenteditable] > button"},
           AncestorElementTest{
               u"<div contenteditable><b><button><i><br>"
               u"</i></button></b></div>",
               "[contenteditable] button > i",
               {AncestorType::MostDistantInlineElementInBlock,
                AncestorType::StopAtClosestButtonElement},
               "[contenteditable]",
               // because of no inline elements between <button> and <i>.
               nullptr,
               "[contenteditable] button > i"},
           AncestorElementTest{u"<div contenteditable><b><button><i><u><br>"
                               u"</u></i></button></b></div>",
                               "[contenteditable] button > i > u",
                               {AncestorType::MostDistantInlineElementInBlock,
                                AncestorType::StopAtClosestButtonElement},
                               "[contenteditable]",
                               // because of <i> is a child of <button>.
                               "i",
                               "i"},
           AncestorElementTest{u"<div contenteditable><b><button><i><br>"
                               u"</i></button></b></div>",
                               "[contenteditable] button > i",
                               {AncestorType::MostDistantInlineElementInBlock,
                                AncestorType::ClosestButtonElement},
                               "[contenteditable]",
                               "[contenteditable] button",
                               "[contenteditable] button"},
           AncestorElementTest{
               u"<div contenteditable><b><button><br></button></b></div>",
               "[contenteditable] > b > button",
               {AncestorType::MostDistantInlineElementInBlock,
                AncestorType::ClosestButtonElement},
               "[contenteditable]",
               "[contenteditable] > b",
               "[contenteditable] > b > button"},
       }) {
    body->SetInnerHTMLTrusted(nsDependentString(testData.mInnerHTML),
                              doc->NodePrincipal(), IgnoreErrors());
    const Element* const content = body->QuerySelector(
        nsDependentCString(testData.mContentSelector), IgnoreErrors());
    MOZ_RELEASE_ASSERT(content);
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForAncestor
              ? body->QuerySelector(
                    nsDependentCString(testData.mExpectedSelectorForAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForInclusiveAncestor
              ? body->QuerySelector(
                    nsDependentCString(
                        testData.mExpectedSelectorForInclusiveAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetInclusiveAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetInclusiveAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
  }
}

TEST(HTMLEditUtilsTest, GetAncestorElement_IgnoreHRElement)
{
  using AncestorType = HTMLEditUtils::AncestorType;
  const RefPtr<Document> doc = CreateHTMLDoc();
  const RefPtr<nsGenericHTMLElement> body = doc->GetBody();
  MOZ_RELEASE_ASSERT(body);
  for (const auto& testData : {
           AncestorElementTest{u"<div contenteditable><hr></div>",
                               "[contenteditable] > hr",
                               {AncestorType::ClosestBlockElement,
                                AncestorType::IgnoreHRElement},
                               "[contenteditable]",
                               "[contenteditable]",
                               "[contenteditable]"},
           AncestorElementTest{
               u"<div contenteditable><button><hr></button></div>",
               "[contenteditable] > button > hr",
               {AncestorType::ClosestBlockElement,
                AncestorType::ClosestButtonElement,
                AncestorType::IgnoreHRElement},
               "[contenteditable]",
               "[contenteditable] > button",
               "[contenteditable] > button"},
           AncestorElementTest{u"<div contenteditable><span><hr></span></div>",
                               "[contenteditable] > span > hr",
                               {AncestorType::MostDistantInlineElementInBlock,
                                AncestorType::IgnoreHRElement},
                               "[contenteditable]",
                               "[contenteditable] > span",
                               "[contenteditable] > span"},
       }) {
    body->SetInnerHTMLTrusted(nsDependentString(testData.mInnerHTML),
                              doc->NodePrincipal(), IgnoreErrors());
    const Element* const content = body->QuerySelector(
        nsDependentCString(testData.mContentSelector), IgnoreErrors());
    MOZ_RELEASE_ASSERT(content);
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForAncestor
              ? body->QuerySelector(
                    nsDependentCString(testData.mExpectedSelectorForAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForInclusiveAncestor
              ? body->QuerySelector(
                    nsDependentCString(
                        testData.mExpectedSelectorForInclusiveAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetInclusiveAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetInclusiveAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
  }
}

TEST(HTMLEditUtilsTest, GetAncestorElement_ClosestContainerElement)
{
  using AncestorType = HTMLEditUtils::AncestorType;
  const RefPtr<Document> doc = CreateHTMLDoc();
  const RefPtr<nsGenericHTMLElement> body = doc->GetBody();
  MOZ_RELEASE_ASSERT(body);
  for (const auto& testData : {
           AncestorElementTest{
               u"<div contenteditable><div><span><br></span></div></div>",
               "[contenteditable] > div > span > br",
               {AncestorType::ClosestContainerElement},
               "[contenteditable]",
               "[contenteditable] > div > span",
               "[contenteditable] > div > span"},
           AncestorElementTest{
               u"<div contenteditable><div><span><br></span></div></div>",
               "[contenteditable] > div > span",
               {AncestorType::ClosestContainerElement},
               "[contenteditable]",
               "[contenteditable] > div",
               "[contenteditable] > div > span"},
           AncestorElementTest{
               u"<div contenteditable><div><span><br></span></div></div>",
               "[contenteditable] > div",
               {AncestorType::ClosestContainerElement},
               "[contenteditable]",
               "[contenteditable]",
               "[contenteditable] > div"},
           AncestorElementTest{u"<br contenteditable>",
                               "br[contenteditable]",
                               {AncestorType::ClosestContainerElement},
                               "br[contenteditable]",
                               // Should return nullptr because of scanning
                               // start from the parent of ancestor limiter.
                               nullptr,
                               // <br> is not a container.
                               nullptr},
           AncestorElementTest{
               u"<br contenteditable>",
               "br[contenteditable]",
               {AncestorType::ClosestContainerElement,
                AncestorType::ReturnAncestorLimiterIfNoProperAncestor},
               "br[contenteditable]",
               // Should return nullptr because of scanning start from the
               // parent of ancestor limiter.
               nullptr,
               // <br> is the ancestor limiter.
               "br[contenteditable]"},
       }) {
    body->SetInnerHTMLTrusted(nsDependentString(testData.mInnerHTML),
                              doc->NodePrincipal(), IgnoreErrors());
    const Element* const content = body->QuerySelector(
        nsDependentCString(testData.mContentSelector), IgnoreErrors());
    MOZ_RELEASE_ASSERT(content);
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForAncestor
              ? body->QuerySelector(
                    nsDependentCString(testData.mExpectedSelectorForAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
    {
      const Element* const expectedElement =
          testData.mExpectedSelectorForInclusiveAncestor
              ? body->QuerySelector(
                    nsDependentCString(
                        testData.mExpectedSelectorForInclusiveAncestor),
                    IgnoreErrors())
              : nullptr;
      const Element* const result = HTMLEditUtils::GetInclusiveAncestorElement(
          *body->QuerySelector(nsDependentCString(testData.mContentSelector),
                               IgnoreErrors()),
          testData.mAncestorTypes,
          BlockInlineCheck::UseComputedDisplayOutsideStyle,
          testData.mAncestorLimiterSelector
              ? body->QuerySelector(
                    nsDependentCString(testData.mAncestorLimiterSelector),
                    IgnoreErrors())
              : nullptr);
      EXPECT_EQ(result, expectedElement)
          << "GetInclusiveAncestorElement: " << testData
          << "(Got: " << ToString(RefPtr{result}) << ")";
    }
  }
}

}  // namespace mozilla
