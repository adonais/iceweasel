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

}  // namespace mozilla
