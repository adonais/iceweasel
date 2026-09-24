/* eslint-disable no-useless-concat */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { FormAutofillNameUtils } from "resource://gre/modules/shared/FormAutofillNameUtils.sys.mjs";
import { FormAutofillUtils } from "resource://gre/modules/shared/FormAutofillUtils.sys.mjs";
import { PhoneNumber } from "resource://gre/modules/shared/PhoneNumber.sys.mjs";
import { FormAutofill } from "resource://autofill/FormAutofill.sys.mjs";
import { AddressParser } from "resource://gre/modules/shared/AddressParser.sys.mjs";

/**
 * The AddressRecord class serves to handle and normalize internal address records.
 * AddressRecord is used for processing and consistent data representation.
 */
export class AddressRecord {
  static NAME_COMPONENTS = ["given-name", "additional-name", "family-name"];

  static STREET_ADDRESS_COMPONENTS = [
    "address-line1",
    "address-line2",
    "address-line3",
  ];
  static TEL_COMPONENTS = [
    "tel-country-code",
    "tel-national",
    "tel-area-code",
    "tel-local",
    "tel-local-prefix",
    "tel-local-suffix",
  ];

  static computeFields(address) {
    this.#computeNameFields(address);
    this.#computeAddressLineFields(address);
    this.#computeStreetAndHouseNumberFields(address);
    this.#computeCountryFields(address);
    this.#computeTelFields(address);
  }

  static #computeNameFields(address) {
    // Compute split names
    if (!("given-name" in address)) {
      const nameParts = FormAutofillNameUtils.splitName(address.name);
      address["given-name"] = nameParts.given;
      address["additional-name"] = nameParts.middle;
      address["family-name"] = nameParts.family;
    }
  }

  static #computeAddressLineFields(address) {
    // Compute address lines
    if (!("address-line1" in address)) {
      let streetAddress = [];
      if (address["street-address"]) {
        streetAddress = address["street-address"]
          .split("\n")
          .map(s => s.trim());
      }
      for (let i = 0; i < 3; i++) {
        address[`address-line${i + 1}`] = streetAddress[i] || "";
      }
      if (streetAddress.length > 3) {
        address["address-line3"] = FormAutofillUtils.toOneLineAddress(
          streetAddress.slice(2)
        );
      }
    }
  }

  static #computeStreetAndHouseNumberFields(address) {
    if (!("address-housenumber" in address) && "street-address" in address) {
      let streetAddress = address["street-address"];
      let parsedAddress = AddressParser.parseStreetAddress(streetAddress);
      if (parsedAddress) {
        address["address-housenumber"] = parsedAddress.street_number;

        let splitNumber = AddressParser.parseHouseSuffix(
          streetAddress,
          parsedAddress
        );
        if (splitNumber?.length >= 2) {
          address["address-extra-housesuffix"] = splitNumber[1];
        }
      }
    }
  }

  static #computeCountryFields(address) {
    // Compute country name
    if (!("country-name" in address)) {
      address["country-name"] =
        FormAutofill.countries.get(address.country) ?? "";
    }
  }

  static #computeTelFields(address) {
    // Compute tel
    if (!("tel-national" in address)) {
      if (address.tel) {
        let tel = PhoneNumber.Parse(
          address.tel,
          address.country || FormAutofill.DEFAULT_REGION
        );
        if (tel) {
          if (tel.countryCode) {
            address["tel-country-code"] = tel.countryCode;
          }
          if (tel.nationalNumber) {
            address["tel-national"] = tel.nationalNumber;
          }

          // PhoneNumberUtils doesn't support parsing the components of a telephone
          // number so we hard coded the parser for US numbers only. We will need
          // to figure out how to parse numbers from other regions when we support
          // new countries in the future.
          if (tel.nationalNumber && tel.countryCode == "+1") {
            let telComponents = tel.nationalNumber.match(
              /(\d{3})((\d{3})(\d{4}))$/
            );
            if (telComponents) {
              address["tel-area-code"] = telComponents[1];
              address["tel-local"] = telComponents[2];
              address["tel-local-prefix"] = telComponents[3];
              address["tel-local-suffix"] = telComponents[4];
            }
          }
        } else {
          // Treat "tel" as "tel-national" directly if it can't be parsed.
          address["tel-national"] = address.tel;
        }
      }

      this.TEL_COMPONENTS.forEach(c => {
        address[c] = address[c] || "";
      });
    }
  }

  /**
   * Bring a record's fields to their canonical form: country codes, name parts,
   * street address lines and telephone numbers. The inverse of computeFields,
   * which derives the presentational fields from these.
   */
  static normalizeFields(address) {
    AddressRecord.#normalizeCountryFields(address);
    AddressRecord.#normalizeNameFields(address);
    AddressRecord.#normalizeAddressFields(address);
    AddressRecord.#normalizeTelFields(address);
  }

  static #normalizeCountryFields(address) {
    // When we can't identify the country code, it is possible because that the region exists
    // in regionNames.properties but not in libaddressinput.
    const country =
      FormAutofillUtils.identifyCountryCode(
        address.country || address["country-name"]
      ) || address.country;

    // Only values included in the region list will be saved.
    let hasLocalizedName = false;
    try {
      if (country) {
        let localizedName = Services.intl.getRegionDisplayNames(undefined, [
          country,
        ]);
        hasLocalizedName = localizedName != country;
      }
    } catch (e) {}

    if (country && hasLocalizedName) {
      address.country = country;
    } else {
      address.country = FormAutofill.DEFAULT_REGION;
    }

    delete address["country-name"];
  }

  static #normalizeNameFields(address) {
    if (
      !address.name &&
      (address["given-name"] ||
        address["additional-name"] ||
        address["family-name"])
    ) {
      address.name = FormAutofillNameUtils.joinNameParts({
        given: address["given-name"] ?? "",
        middle: address["additional-name"] ?? "",
        family: address["family-name"] ?? "",
      });
    }

    delete address["given-name"];
    delete address["additional-name"];
    delete address["family-name"];
  }

  static #normalizeAddressFields(address) {
    if (address["address-housenumber"]) {
      let streetField = "";
      if (address["address-line1"]) {
        streetField = "address-line1";
      } else if (address["street-address"]) {
        streetField = "street-address";
      }
      if (streetField) {
        let region = address.country || FormAutofill.DEFAULT_REGION;
        let reversed = FormAutofillUtils.getAddressReversed(region);

        if (reversed) {
          address[streetField] =
            address[streetField] + " " + address["address-housenumber"];
        } else {
          address[streetField] =
            address["address-housenumber"] + " " + address[streetField];
        }
      }

      delete address["address-housenumber"];
    }

    if (AddressRecord.STREET_ADDRESS_COMPONENTS.some(c => !!address[c])) {
      // Treat "street-address" as "address-line1" if it contains only one line
      // and "address-line1" is omitted.
      if (
        !address["address-line1"] &&
        address["street-address"] &&
        !address["street-address"].includes("\n")
      ) {
        address["address-line1"] = address["street-address"];
        delete address["street-address"];
      }

      // Concatenate "address-line*" if "street-address" is omitted.
      if (!address["street-address"]) {
        address["street-address"] = AddressRecord.STREET_ADDRESS_COMPONENTS.map(
          c => address[c]
        )
          .join("\n")
          .replace(/\n+$/, "");
      }
    }
    AddressRecord.STREET_ADDRESS_COMPONENTS.forEach(c => delete address[c]);
  }

  static #normalizeTelFields(address) {
    if (address.tel || AddressRecord.TEL_COMPONENTS.some(c => !!address[c])) {
      FormAutofillUtils.compressTel(address);

      let possibleRegion = address.country || FormAutofill.DEFAULT_REGION;
      let tel = PhoneNumber.Parse(address.tel, possibleRegion);

      if (tel && tel.internationalNumber) {
        // Force to save numbers in E.164 format if parse success.
        address.tel = tel.internationalNumber;
      }
    }
    AddressRecord.TEL_COMPONENTS.forEach(c => delete address[c]);
  }
}
