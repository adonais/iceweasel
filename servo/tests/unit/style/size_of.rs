/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use selectors::parser::{SelectorParseError, SelectorParseErrorKind};
use style::invalidation::element::invalidation_map::Dependency;
use style::properties;

size_of_test!(test_size_of_dependency, Dependency, 16);

size_of_test!(
    test_size_of_property_declaration,
    properties::PropertyDeclaration,
    32
);

// This is huge, but we allocate it on the stack and then never move it,
// we only pass `&mut SourcePropertyDeclaration` references around.
size_of_test!(
    test_size_of_parsed_declaration,
    properties::SourcePropertyDeclaration,
    568
);

size_of_test!(
    test_size_of_selector_parse_error_kind,
    SelectorParseErrorKind,
    1
);
size_of_test!(
    test_size_of_style_parse_error_kind,
    ::style_traits::StyleParseErrorKind,
    2
);

size_of_test!(test_size_of_selector_parse_error, SelectorParseError, 2);
size_of_test!(
    test_size_of_style_traits_parse_error,
    ::style_traits::ParseError,
    2
);
