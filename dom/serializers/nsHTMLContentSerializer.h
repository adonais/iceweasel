/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * nsIContentSerializer implementation that can be used with an
 * nsIDocumentEncoder to convert an HTML (not XHTML!) DOM to an HTML
 * string that could be parsed into more or less the original DOM.
 */

#ifndef nsHTMLContentSerializer_h_
#define nsHTMLContentSerializer_h_

#include "nsString.h"
#include "nsXHTMLContentSerializer.h"

class nsAtom;

class nsHTMLContentSerializer final : public nsXHTMLContentSerializer {
 public:
  nsHTMLContentSerializer();
  virtual ~nsHTMLContentSerializer();

  NS_IMETHOD AppendElementStart(
      mozilla::dom::Element* aElement,
      mozilla::dom::Element* aOriginalElement) override;

  NS_IMETHOD AppendElementEnd(mozilla::dom::Element* aElement,
                              mozilla::dom::Element* aOriginalElement) override;

  NS_IMETHOD AppendDocumentStart(mozilla::dom::Document* aDocument) override;

 protected:
  /**
   * Serializes all of aElement's attributes into aStr.
   *
   * @param aElement    the element whose attributes are serialized.
   * @param aTagName    local name of the element being serialized, used to
   *                    apply element-specific rules (e.g. <li>, <meta>).
   * @param aNamespace  namespace ID of the element (e.g. kNameSpaceID_XHTML).
   * @param aStr        output string the serialized attributes are appended to.
   * @return            true on success, false on failure (e.g. out of memory).
   */
  [[nodiscard]] bool SerializeHTMLAttributes(mozilla::dom::Element* aElement,
                                             nsAtom* aTagName,
                                             int32_t aNamespace,
                                             nsAString& aStr);

  [[nodiscard]] virtual bool AppendAndTranslateEntities(
      const nsAString& aStr, nsAString& aOutputStr) override;

 private:
  static const uint8_t kEntities[];
  static const uint8_t kAttrEntities[];
  static const char* const kEntityStrings[];
};

nsresult NS_NewHTMLContentSerializer(nsIContentSerializer** aSerializer);

#endif
