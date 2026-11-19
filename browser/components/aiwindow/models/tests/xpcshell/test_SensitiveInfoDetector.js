/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { SensitiveInfoDetector } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/SensitiveInfoDetector.sys.mjs"
);

add_task(function test_detector_initialization() {
  const detector = new SensitiveInfoDetector();
  Assert.ok(detector, "Detector instance created");
  Assert.ok(detector.patterns, "Detector has patterns");
  Assert.greater(
    Object.keys(detector.patterns).length,
    0,
    "Detector has at least one pattern"
  );
});

add_task(function test_containsSensitiveInfo_ssn() {
  const detector = new SensitiveInfoDetector();

  const withSSN = "My SSN is 123-45-6789 and I need help.";
  Assert.ok(
    detector.containsSensitiveInfo(withSSN),
    "Detects US Social Security Number"
  );

  const withoutSSN = "My account number is 12345";
  Assert.ok(
    !detector.containsSensitiveInfo(withoutSSN),
    "Does not flag non-SSN number"
  );

  const invalidSSN = "123-45-678";
  Assert.ok(
    !detector.containsSensitiveInfo(invalidSSN),
    "Does not flag invalid SSN format (missing digit)"
  );

  Assert.ok(
    detector.containsSensitiveInfo("My SSN is 123 45 6789"),
    "Detects SSN with spaces"
  );

  for (const text of [
    "000-12-3456",
    "666-12-3456",
    "912-34-5678",
    "123-00-4567",
    "123-45-0000",
    "123-45 6789",
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag unissuable or mixed-separator SSN: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_sin() {
  const detector = new SensitiveInfoDetector();

  const withSIN = "My SIN is 130-692-544 for taxes.";
  Assert.ok(
    detector.containsSensitiveInfo(withSIN),
    "Detects Canadian Social Insurance Number"
  );

  Assert.ok(
    detector.containsSensitiveInfo("My SIN is 130 692 544"),
    "Detects SIN with spaces"
  );

  const withoutSIN = "The number is 123-45-6789";
  Assert.ok(
    detector.containsSensitiveInfo(withoutSIN),
    "Detects a 3-2-4 SSN-formatted number via the SSN pattern"
  );

  for (const text of ["123-456-789", "046-454-286", "130-692 544"]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag invalid SIN: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_insee() {
  const detector = new SensitiveInfoDetector();

  const withINSEE = "My INSEE is 1 90 05 75 101 022 49.";
  Assert.ok(
    detector.containsSensitiveInfo(withINSEE),
    "Detects French National ID Number"
  );

  Assert.ok(
    detector.containsSensitiveInfo("My INSEE is 2 90 05 2A 101 022 56"),
    "Detects French National ID Number from Corsica"
  );

  for (const text of [
    "My INSEE is 1 90 05 75 101 022 45", // Wrong key, should be 49
    "Nutella EAN 3017620422003", // 13-digit barcode, no key
    "Order 1712345678901", // 13-digit order number, no key
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag invalid INSEE: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_gb_nino() {
  const detector = new SensitiveInfoDetector();

  for (const nino of ["AB 12 34 56 C", "JG103759A", "ab123456c"]) {
    Assert.ok(
      detector.containsSensitiveInfo(`My NI number is ${nino}`),
      `Detects UK National Insurance number: ${nino}`
    );
  }

  for (const text of [
    "Card shows AB 12 34 56 C",
    "AB123456C is my national insurance number",
    "NINO: JG103759A",
  ]) {
    Assert.ok(
      detector.containsSensitiveInfo(text),
      `Detects UK National Insurance number: ${text}`
    );
  }

  for (const text of [
    "QQ 12 34 56 C", // Q is never used as a prefix letter
    "GB 12 34 56 A", // GB prefix is never issued
    "AB 12 34 56 E", // Suffix must be A-D
    "AB 12 3456 C", // Inconsistent spacing
    "SKU HP123456A in stock", // Compact form needs a keyword nearby
    "Part number AB123456C", // Compact form needs a keyword nearby
    "Northern Ireland NI office ref AB123456C", // "NI" alone isn't a keyword
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag invalid National Insurance number: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_gb_nhs() {
  const detector = new SensitiveInfoDetector();

  for (const nhsNumber of [
    "401 023 2137",
    "601-112-3457",
    "120 385 1235",
    "290-112-3457",
  ]) {
    Assert.ok(
      detector.containsSensitiveInfo(`My NHS number is ${nhsNumber}`),
      `Detects UK NHS number: ${nhsNumber}`
    );
  }

  for (const text of [
    "401 023 2138", // Wrong check digit, should be 7
    "450 101 2345", // Check digit would be 10, never issued
    "501 023 2138", // Valid check digit, but 5xx is a test range
    "121 385 1238", // Valid check digit, but CHI month 13
    "000 185 1233", // Valid check digit, but CHI day 00
    "401 023-2137", // Mixed separators
    "4010232137", // No separators
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag invalid NHS number: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_email() {
  const detector = new SensitiveInfoDetector();

  const withEmail = "Contact me at user@example.com for details.";
  Assert.ok(detector.containsSensitiveInfo(withEmail), "Detects email address");

  const withComplexEmail = "Send to john.doe+tag@subdomain.example.co.uk";
  Assert.ok(
    detector.containsSensitiveInfo(withComplexEmail),
    "Detects complex email address"
  );

  const withoutEmail = "Visit example dot com for info";
  Assert.ok(
    !detector.containsSensitiveInfo(withoutEmail),
    "Does not flag non-email text"
  );
});

add_task(function test_containsSensitiveInfo_phone() {
  const detector = new SensitiveInfoDetector();

  const withPhone1 = "Call me at 202-555-0123";
  Assert.ok(
    detector.containsSensitiveInfo(withPhone1),
    "Detects phone with dashes"
  );

  const withPhone2 = "My number is (202) 555-0123";
  Assert.ok(
    detector.containsSensitiveInfo(withPhone2),
    "Detects phone with parentheses"
  );

  const withPhone3 = "Dial +1-202-555-0123 for support";
  Assert.ok(
    detector.containsSensitiveInfo(withPhone3),
    "Detects phone with country code"
  );

  const withPhone4 = "Phone: 202.555.0123";
  Assert.ok(
    detector.containsSensitiveInfo(withPhone4),
    "Detects phone with dots"
  );

  const withPhone5 = "My number is (202)5550123";
  Assert.ok(
    detector.containsSensitiveInfo(withPhone5),
    "Detects phone with parentheses and no other separators"
  );

  const shortNumber = "Call 911 for emergency";
  Assert.ok(
    !detector.containsSensitiveInfo(shortNumber),
    "Does not flag short numbers"
  );

  for (const text of [
    "Order #4829173650 confirmed", // 10 digits without separators or +1
    "Account 123-555-0123", // Area code can't start with 0 or 1
    "Account 202-123-4567", // Exchange can't start with 0 or 1
    "202) 555-0123", // Unbalanced parenthesis
    "SKU 202-5550123", // 3-7 split without parentheses looks like ranges and IDs
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag non-phone number: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_french_phone() {
  const detector = new SensitiveInfoDetector();

  const phoneWithCountryCode = "Dial +33 1 94 24 99 99";
  Assert.ok(
    detector.containsSensitiveInfo(phoneWithCountryCode),
    "Detects French phone numbers with the leading country code"
  );

  const phoneWithCountryCodeDifferentFormat = "Dial +33 1.94.24.99.99";
  Assert.ok(
    detector.containsSensitiveInfo(phoneWithCountryCodeDifferentFormat),
    "Detects French phone numbers with the leading country code and different format"
  );

  const phoneWithInternationalPrefix = "Dial 0033 1 94 24 99 99";
  Assert.ok(
    detector.containsSensitiveInfo(phoneWithInternationalPrefix),
    "Detects French phone numbers with the 00 international prefix"
  );

  const phoneWithoutCountryCode = "Dial 06 12 34 56 78";
  Assert.ok(
    detector.containsSensitiveInfo(phoneWithoutCountryCode),
    "Detects French phone numbers without the leading country code"
  );

  Assert.ok(
    !detector.containsSensitiveInfo("Ref 33123456789"),
    "Does not flag numbers starting with 33 without a + or 00 prefix"
  );
});

add_task(function test_containsSensitiveInfo_gb_phone() {
  const detector = new SensitiveInfoDetector();

  for (const phone of [
    "07700 900123",
    "020 7946 0958",
    "0161 496 0123",
    "+44 7700 900123",
    "+44 (0)20 7946 0958",
    "07700-900-123",
    "+447700900123",
    "0044 20 7946 0958",
  ]) {
    Assert.ok(
      detector.containsSensitiveInfo(`Call me on ${phone}`),
      `Detects UK phone number: ${phone}`
    );
  }

  for (const text of [
    "Freephone 0800 123 4567", // 08 is a non-personal range
    "Ref 0123 456789", // 10 digits, UK numbers have 11
    "Order 01234 5678", // 9 digits, UK numbers have 11
    "Ref 0123 4567 8901", // 12 digits, UK numbers have 11
    "Ref 0161 496 0123 456", // Digits continue past 11
    "07700900123", // Domestic numbers need a separator
    "+44 20 7946 095", // 9 national digits, UK numbers have 10
    "+44 7700 9001234", // 11 national digits, UK numbers have 10
    "07700 900 1 23", // Groups after the first need 3 or more digits
    "+44 77 00 90 01 23", // Groups after the first need 3 or more digits
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag non-phone number: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_creditCard() {
  const detector = new SensitiveInfoDetector();

  const withValidCard = "Card number: 4111-1111-1111-1111";
  Assert.ok(
    detector.containsSensitiveInfo(withValidCard),
    "Detects valid credit card (Visa test card with dashes)"
  );

  const withValidCardNoSpaces = "Card: 4111111111111111";
  Assert.ok(
    detector.containsSensitiveInfo(withValidCardNoSpaces),
    "Detects valid credit card (no spaces)"
  );

  const invalidCard = "1234-5678-9012-3456";
  Assert.ok(
    !detector.containsSensitiveInfo(invalidCard),
    "Does not flag invalid credit card (fails Luhn check)"
  );
});

add_task(function test_containsSensitiveInfo_ipv4() {
  const detector = new SensitiveInfoDetector();

  const withPublicIP = "Server at 8.8.8.8 is down.";
  Assert.ok(
    detector.containsSensitiveInfo(withPublicIP),
    "Detects public IPv4 address"
  );

  const withPrivateIP = "Local server at 192.168.1.1";
  Assert.ok(
    !detector.containsSensitiveInfo(withPrivateIP),
    "Does not flag private IPv4 (192.168.x.x)"
  );

  const withLocalhost = "Server at 127.0.0.1";
  Assert.ok(
    !detector.containsSensitiveInfo(withLocalhost),
    "Does not flag localhost"
  );

  const withPrivate10 = "Network at 10.0.0.1";
  Assert.ok(
    !detector.containsSensitiveInfo(withPrivate10),
    "Does not flag private IPv4 (10.x.x.x)"
  );

  const withPrivate172 = "Server at 172.16.0.1";
  Assert.ok(
    !detector.containsSensitiveInfo(withPrivate172),
    "Does not flag private IPv4 (172.16-31.x.x)"
  );
});

add_task(function test_containsSensitiveInfo_ipv6() {
  const detector = new SensitiveInfoDetector();

  const withIPv6 = "Server at 2001:0db8:85a3:0000:0000:8a2e:0370:7334";
  Assert.ok(detector.containsSensitiveInfo(withIPv6), "Detects IPv6 address");

  const shortIPv6 = "Connect to 2001:db8::1";
  Assert.ok(
    !detector.containsSensitiveInfo(shortIPv6),
    "Does not detect abbreviated IPv6 (pattern limitation)"
  );
});

add_task(function test_containsSensitiveInfo_macAddress() {
  const detector = new SensitiveInfoDetector();

  const withMacColon = "Device MAC: 00:1A:2B:3C:4D:5E";
  Assert.ok(
    detector.containsSensitiveInfo(withMacColon),
    "Detects MAC address with colons"
  );

  const withMacDash = "MAC address: 00-1A-2B-3C-4D-5E";
  Assert.ok(
    detector.containsSensitiveInfo(withMacDash),
    "Detects MAC address with dashes"
  );

  const partialMac = "Device: 00:1A:2B";
  Assert.ok(
    !detector.containsSensitiveInfo(partialMac),
    "Does not flag partial MAC address"
  );
});

add_task(function test_containsSensitiveInfo_streetAddress() {
  const detector = new SensitiveInfoDetector();

  const withStreet1 = "I live at 123 Main Street";
  Assert.ok(
    detector.containsSensitiveInfo(withStreet1),
    "Detects street address with 'Street'"
  );

  const withStreet2 = "Address: 456 Oak Ave";
  Assert.ok(
    detector.containsSensitiveInfo(withStreet2),
    "Detects street address with 'Ave'"
  );

  const withStreet3 = "Located at 789 Park Blvd.";
  Assert.ok(
    detector.containsSensitiveInfo(withStreet3),
    "Detects street address with 'Blvd.'"
  );

  const noStreet = "I went to the park";
  Assert.ok(
    !detector.containsSensitiveInfo(noStreet),
    "Does not flag generic text with street words"
  );

  for (const address of [
    "221B Baker Street",
    "350 5th Avenue",
    "i live at 123 main street",
    "456 oak ave",
  ]) {
    Assert.ok(
      detector.containsSensitiveInfo(address),
      `Detects street address: ${address}`
    );
  }

  for (const text of [
    "Buying a 2 TB external drive", // Generic suffix needs a capitalised name
    "1 test drive", // Generic suffix needs a capitalised name
    "I saw 2 patients with Dr Smith", // Contains a function word
    "Spent 3 hours on the road", // Contains function words
    "Lived 3 blocks down the street", // Contains function words
    "Won 3 cases in court", // Contains a function word
    "Top 5 Tips For The Road", // Contains function words
    "5 ways to find the best way", // More than 3 words between
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag prose with street words: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_gb_streetAddress() {
  const detector = new SensitiveInfoDetector();

  for (const address of [
    "742 Evergreen Terrace",
    "12 Hawthorn Close",
    "742 evergreen terrace",
  ]) {
    Assert.ok(
      detector.containsSensitiveInfo(address),
      `Detects UK street address: ${address}`
    );
  }

  Assert.ok(
    !detector.containsSensitiveInfo("Visited 2 botanical gardens"),
    "Does not flag prose with UK street words (generic suffix needs a capitalised name)"
  );
});

add_task(function test_containsSensitiveInfo_fr_streetAddress() {
  const detector = new SensitiveInfoDetector();

  for (const address of [
    "5 Av. Anatole France",
    "12 Rue de la Paix",
    "29 Boulevard Haussmann",
    "12 bis rue d'Alésia",
    "3 place de la Concorde",
    "8 RUE DE LA PAIX",
    "12 rue de la paix",
  ]) {
    Assert.ok(
      detector.containsSensitiveInfo(address),
      `Detects French street address: ${address}`
    );
  }

  for (const text of [
    "5 square meters", // Generic street type needs a capitalised name
    "J'ai 2 cours de maths demain", // Generic street type needs a capitalised name
    "3 rue the day", // Function word
    "Top 3 Route Options", // English-word street type without a particle
    "2 Square Feet", // English-word street type without a particle
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag English text with French street words: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_gb_postcode() {
  const detector = new SensitiveInfoDetector();

  for (const postcode of [
    "SW1A 1AA",
    "M1 1AE",
    "CR2 6XH",
    "DN55 1PT",
    "sw1a 1aa",
  ]) {
    Assert.ok(
      detector.containsSensitiveInfo(`I live at ${postcode}`),
      `Detects UK postcode: ${postcode}`
    );
  }

  for (const text of [
    "Selling my AA1 1AA", // AA isn't a postcode area
    "Buying the PS5 2ND edition", // PS isn't a postcode area
    "BMW M3 2ND GEN", // Ends in an ordinal
    "bmw m3 2nd gen", // Ends in an ordinal
    "Postcode is SW1A1AA", // No space between the two halves
    "MacBook Air M2 1TB", // Ends in a storage size
    "MacBook Pro M3 2TB SSD", // Ends in a storage size
    "Galaxy S3 1GB RAM", // Ends in a storage size
    "macbook m4 8gb", // Ends in a storage size
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag non-postcode: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_poBox() {
  const detector = new SensitiveInfoDetector();

  const withPOBox1 = "Mail to P.O. Box 12345";
  Assert.ok(detector.containsSensitiveInfo(withPOBox1), "Detects P.O. Box");

  const withPOBox2 = "Send to Post Office Box 67890";
  Assert.ok(
    detector.containsSensitiveInfo(withPOBox2),
    "Detects Post Office Box"
  );

  const withPOBox3 = "PO Box 999";
  Assert.ok(detector.containsSensitiveInfo(withPOBox3), "Detects PO Box");
});

add_task(function test_containsSensitiveInfo_routingNumber() {
  const detector = new SensitiveInfoDetector();

  const withValidRouting = "Routing number: 111000025";
  Assert.ok(
    detector.containsSensitiveInfo(withValidRouting),
    "Detects valid routing number"
  );

  const invalidRouting = "Routing number: 123456789";
  Assert.ok(
    !detector.containsSensitiveInfo(invalidRouting),
    "Does not flag invalid routing number (fails checksum)"
  );

  const shortNumber = "Routing number: 12345678";
  Assert.ok(
    !detector.containsSensitiveInfo(shortNumber),
    "Does not flag 8-digit number"
  );

  for (const text of [
    "My routing number is 021000021",
    "Routing no. 111000025",
    "ABA routing number, which is 021000021",
    "021000021 is my routing number",
    "Mon numéro de routage est le 021000021",
    "N° ABA : 021000021",
  ]) {
    Assert.ok(
      detector.containsSensitiveInfo(text),
      `Detects routing number with keyword: ${text}`
    );
  }

  for (const text of [
    "Order 021000021", // No routing keyword
    "https://shop.example/item/021000021", // No routing keyword
    "Order routing failed for order 021000021", // "routing" without "number"
    "021000021 routing notes", // "no" is part of a longer word
    "Suivi du routage du colis 021000021", // "routage" without "numéro"
    "My routing number is with Chase. Order 021000021", // Different sentence
    "Routing number\n021000021", // Different line
    "The routing number is 2 digits longer than 021000021", // Gap contains a number
    "Routing number for the joint checking account we opened is 021000021", // More than 5 words between
  ]) {
    Assert.ok(
      !detector.containsSensitiveInfo(text),
      `Does not flag routing number without keyword nearby: ${text}`
    );
  }
});

add_task(function test_containsSensitiveInfo_multipleTypes() {
  const detector = new SensitiveInfoDetector();

  const multipleTypes =
    "Email user@example.com and call 202-555-0123 at 123 Main St.";
  Assert.ok(
    detector.containsSensitiveInfo(multipleTypes),
    "Detects text with multiple sensitive info types"
  );
});

add_task(function test_containsSensitiveInfo_emptyAndInvalid() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(!detector.containsSensitiveInfo(""), "Empty string returns false");

  Assert.ok(!detector.containsSensitiveInfo(null), "Null returns false");

  Assert.ok(
    !detector.containsSensitiveInfo(undefined),
    "Undefined returns false"
  );

  Assert.ok(!detector.containsSensitiveInfo(123), "Number returns false");

  Assert.ok(!detector.containsSensitiveInfo({}), "Object returns false");
});

add_task(function test_containsSensitiveInfo_cleanText() {
  const detector = new SensitiveInfoDetector();

  const cleanText =
    "The quick brown fox jumps over the lazy dog. This is a test.";
  Assert.ok(
    !detector.containsSensitiveInfo(cleanText),
    "Clean text with no sensitive info returns false"
  );

  const urlText = "Visit https://example.com for more information";
  Assert.ok(
    !detector.containsSensitiveInfo(urlText),
    "URL without sensitive info returns false"
  );
});

add_task(function test_containsSensitiveInfo_edgeCases() {
  const detector = new SensitiveInfoDetector();

  const almostSSN = "123-45-678 is missing a digit";
  Assert.ok(
    !detector.containsSensitiveInfo(almostSSN),
    "Almost-SSN with wrong format not detected"
  );

  const almostEmail = "user@incomplete";
  Assert.ok(
    !detector.containsSensitiveInfo(almostEmail),
    "Incomplete email not detected"
  );

  const dateFormat = "Date: 12-34-5678";
  Assert.ok(
    !detector.containsSensitiveInfo(dateFormat),
    "Date-like format not flagged as SSN (wrong digit grouping)"
  );
});

add_task(function test_containsSensitiveKeywords_medical() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    detector.containsSensitiveKeywords(
      "Searching for cancer treatment options"
    ),
    "Detects medical keyword: cancer"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Looking for a therapist near me"),
    "Detects medical keyword: therapist"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Pregnancy test results positive"),
    "Detects medical keyword: pregnancy"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Depression symptoms and treatment"),
    "Detects medical keyword: depression"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Booking an NHS dentist appointment"),
    "Detects en-GB medical keyword: NHS"
  );

  Assert.ok(
    detector.containsSensitiveKeywords(
      "Options de traitement contre le cancer"
    ),
    "Detects French medical keyword: cancer"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Je cherche un thérapeute près de moi"),
    "Detects French medical keyword: thérapeute"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Symptômes de dépression et traitement"),
    "Detects French medical keyword: dépression"
  );

  Assert.ok(
    !detector.containsSensitiveKeywords("Healthy recipes for dinner"),
    "Does not flag non-medical health context"
  );
});

add_task(function test_containsSensitiveKeywords_finance() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    detector.containsSensitiveKeywords("How to improve my credit score"),
    "Detects finance keyword: credit score"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Mortgage refinance rates today"),
    "Detects finance keyword: mortgage"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Filing bankruptcy in California"),
    "Detects finance keyword: bankruptcy"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Best investment portfolio strategy"),
    "Detects finance keyword: portfolio"
  );

  Assert.ok(
    detector.containsSensitiveKeywords(
      "Shopping for a new loan calculator app"
    ),
    "Detects finance keyword: loan"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("When does my next pay cheque arrive"),
    "Detects en-GB finance keyword: pay cheque"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Paycheque arrived late this month"),
    "Detects en-GB finance keyword: paycheque"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Where do I find my sort code"),
    "Detects en-GB finance keyword: sort code"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Déclaration d'impôt sur le revenu"),
    "Detects French finance keyword: impôt"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Taux hypothèque aujourd'hui"),
    "Detects French finance keyword: hypothèque"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Déclarer faillite en France"),
    "Detects French finance keyword: faillite"
  );
});

add_task(function test_containsSensitiveKeywords_legal() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    detector.containsSensitiveKeywords("Filing for divorce in Texas"),
    "Detects legal keyword: divorce"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Immigration visa application process"),
    "Detects legal keyword: visa"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Child custody hearing preparation"),
    "Detects legal keyword: custody"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Criminal defense attorney near me"),
    "Detects legal keyword: criminal"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Hiring a solicitor to buy a house"),
    "Detects en-GB legal keyword: solicitor"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Demande de divorce en France"),
    "Detects French legal keyword: divorce"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Audience pour la garde des enfants"),
    "Detects French legal keyword: garde"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Avocat pénaliste près de moi"),
    "Detects French legal keyword: avocat"
  );
});

add_task(function test_containsSensitiveKeywords_political() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    detector.containsSensitiveKeywords("Democrat vs Republican policies"),
    "Detects political keyword: Democrat"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("How to vote in the next election"),
    "Detects political keyword: election"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Liberal vs conservative viewpoints"),
    "Detects political keyword: liberal"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Tories lose seats in the north"),
    "Detects en-GB political keyword: tories"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Débat entre socialiste et communiste"),
    "Detects French political keyword: socialiste"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Comment voter à la prochaine élection"),
    "Detects French political keyword: élection"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Points de vue libéral et conservateur"),
    "Detects French political keyword: libéral"
  );
});

add_task(function test_containsSensitiveKeywords_religion() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    detector.containsSensitiveKeywords("Catholic church near me"),
    "Detects religion keyword: Catholic"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Islamic prayer times today"),
    "Detects religion keyword: Islamic"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Jewish holidays calendar"),
    "Detects religion keyword: Jewish"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Atheism vs agnosticism debate"),
    "Detects religion keyword: atheism"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Église catholique près de moi"),
    "Detects French religion keyword: catholique"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Heures de prière islamique"),
    "Detects French religion keyword: islamique"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Débat entre athéisme et agnosticisme"),
    "Detects French religion keyword: athéisme"
  );
});

add_task(function test_containsSensitiveKeywords_demographics() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    detector.containsSensitiveKeywords("LGBTQ rights and protections"),
    "Detects demographic keyword: LGBTQ"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Transgender healthcare services"),
    "Detects demographic keyword: transgender"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Understanding gender identity"),
    "Detects demographic keyword: gender identity"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Race and ethnicity demographics"),
    "Detects demographic keyword: race"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Droits des personnes transgenres"),
    "Detects French demographic keyword: transgenre"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Comprendre l'identité de genre"),
    "Detects French demographic keyword: identité de genre"
  );

  Assert.ok(
    detector.containsSensitiveKeywords(
      "Orientation sexuelle et discrimination"
    ),
    "Detects French demographic keyword: orientation sexuelle"
  );
});

add_task(function test_containsSensitiveKeywords_clean() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    !detector.containsSensitiveKeywords("Best restaurants in New York"),
    "Clean text about restaurants"
  );

  Assert.ok(
    !detector.containsSensitiveKeywords("JavaScript tutorial for beginners"),
    "Clean text about programming"
  );

  Assert.ok(
    !detector.containsSensitiveKeywords("Hiking trails near San Francisco"),
    "Clean text about outdoor activities"
  );

  Assert.ok(
    !detector.containsSensitiveKeywords("Movie reviews and ratings"),
    "Clean text about entertainment"
  );
});

add_task(function test_containsSensitiveKeywords_plurals() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    detector.containsSensitiveKeywords("Multiple symptoms detected"),
    "Detects plural: symptoms (from symptom)"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Visiting churches this weekend"),
    "Detects plural: churches (from church)"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Comparing loan rates"),
    "Detects singular: loan"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Surgeries scheduled for next week"),
    "Detects y->ies plural: surgeries (from surgery)"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Filing bankruptcies is complicated"),
    "Detects y->ies plural: bankruptcies (from bankruptcy)"
  );
});

add_task(function test_containsSensitiveKeywords_caseInsensitive() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    detector.containsSensitiveKeywords("CANCER treatment options"),
    "Detects uppercase keyword"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Cancer Treatment Options"),
    "Detects mixed case keyword"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("cancer treatment options"),
    "Detects lowercase keyword"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Looking for MORTGAGE rates"),
    "Detects uppercase finance keyword"
  );

  Assert.ok(
    detector.containsSensitiveKeywords("Filing for DIVORCE"),
    "Detects uppercase legal keyword"
  );
});

add_task(function test_containsSensitiveKeywords_emptyAndInvalid() {
  const detector = new SensitiveInfoDetector();

  Assert.ok(
    !detector.containsSensitiveKeywords(""),
    "Empty string returns false"
  );

  Assert.ok(!detector.containsSensitiveKeywords(null), "Null returns false");

  Assert.ok(
    !detector.containsSensitiveKeywords(undefined),
    "Undefined returns false"
  );

  Assert.ok(!detector.containsSensitiveKeywords(123), "Number returns false");
});
