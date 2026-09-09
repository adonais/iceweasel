/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Wrapper around Gecko's CSS error reporting mechanism.

#![allow(unsafe_code)]

use cssparser::{BasicParseErrorKind, ParseError, ParseErrorKind, SourceLocation};
use cssparser::{CowRcStr, ToCss};
use selectors::parser::SelectorParseErrorKind;
use selectors::SelectorList;
use std::ffi::CStr;
use std::fmt::Write;
use std::ptr;
use style::error_reporting::{ContextualParseError, ParseErrorReporter};
use style::gecko_bindings::bindings;
use style::gecko_bindings::structs::URLExtraData as RawUrlExtraData;
use style::gecko_bindings::structs::{nsIURI, Loader, StyleSheet as DomStyleSheet};
use style::selector_parser::SelectorImpl;
use style::stylesheets::UrlExtraData;
use style_traits::{PropertySyntaxParseError, StyleParseErrorKind};

pub type ErrorKind = ParseErrorKind<StyleParseErrorKind>;

/// An error reporter with all the data we need to report errors.
pub struct ErrorReporter {
    window_id: u64,
    uri: *mut nsIURI,
}

impl ErrorReporter {
    /// Create a new instance of the Gecko error reporter, if error reporting is
    /// enabled.
    pub fn new(
        sheet: *mut DomStyleSheet,
        loader: *mut Loader,
        extra_data: *mut RawUrlExtraData,
    ) -> Option<Self> {
        let mut window_id = 0;

        let enabled =
            unsafe { bindings::Gecko_ErrorReportingEnabled(sheet, loader, &mut window_id) };

        if !enabled {
            return None;
        }

        let uri = unsafe {
            extra_data
                .as_ref()
                .map(|d| d.mBaseURI.raw())
                .unwrap_or(ptr::null_mut())
        };

        Some(ErrorReporter { window_id, uri })
    }
}

#[derive(Debug)]
enum Action {
    Nothing,
    Skip,
    Drop,
}

trait ErrorHelpers<'a> {
    fn error_data(self) -> (CowRcStr<'a>, ErrorKind);
    fn error_params(self) -> ErrorParams<'a>;
    fn selectors(&self) -> &'a [SelectorList<SelectorImpl>];
    fn to_gecko_message(&self) -> (Option<&'static CStr>, &'static CStr, Action);
}

#[derive(Default)]
struct ErrorParams<'a> {
    prefix_param: Option<CowRcStr<'a>>,
    main_param: Option<CowRcStr<'a>>,
}

fn needs_escape(c: char) -> bool {
    // matches cssparser::serialize_name
    c <= '\u{1f}' || c == '\u{7f}'
}

/// The text we quote in error messages is the source text of the offending rule
/// or declaration, which trails whitespace and, for a rule, the opening brace.
fn snippet_of<'a>(s: &'a str) -> CowRcStr<'a> {
    let s = s.trim().trim_end_matches('{').trim_end();
    if !s.contains(needs_escape) {
        return s.into();
    }
    let mut escaped = String::with_capacity(s.len());
    for c in s.chars() {
        if needs_escape(c) {
            let _ = write!(escaped, "\\{:x} ", c as u32);
        } else {
            escaped.push(c);
        }
    }
    escaped.into()
}

/// If an error parameter is present in the given error, return it. Additionally return
/// a second parameter if it exists, for use in the prefix for the eventual error message.
fn extract_error_params<'a>(err: ErrorKind, snippet: &CowRcStr<'a>) -> Option<ErrorParams<'a>> {
    // Selector errors are reported with a prefix message that takes a `%1$S`.
    let prefix = match err {
        ParseErrorKind::Custom(StyleParseErrorKind::SelectorError(
            SelectorParseErrorKind::EmptySelector | SelectorParseErrorKind::DanglingCombinator,
        )) => None,
        ParseErrorKind::Custom(StyleParseErrorKind::SelectorError(..)) => Some(snippet.clone()),
        _ => None,
    };
    Some(ErrorParams {
        main_param: None,
        prefix_param: prefix,
    })
}

impl<'a> ErrorHelpers<'a> for ContextualParseError<'a> {
    fn error_data(self) -> (CowRcStr<'a>, ErrorKind) {
        match self {
            ContextualParseError::UnsupportedPropertyDeclaration(s, err, _)
            | ContextualParseError::UnsupportedPropertyDescriptor(s, err)
            | ContextualParseError::UnsupportedFontFaceDescriptor(s, err)
            | ContextualParseError::UnsupportedFontFeatureValuesDescriptor(s, err)
            | ContextualParseError::UnsupportedFontPaletteValuesDescriptor(s, err)
            | ContextualParseError::InvalidKeyframeRule(s, err)
            | ContextualParseError::InvalidFontFeatureValuesRule(s, err)
            | ContextualParseError::InvalidRule(s, err)
            | ContextualParseError::UnsupportedRule(s, err)
            | ContextualParseError::UnsupportedViewportDescriptorDeclaration(s, err)
            | ContextualParseError::UnsupportedCounterStyleDescriptorDeclaration(s, err)
            | ContextualParseError::InvalidMediaRule(s, err)
            | ContextualParseError::UnsupportedValue(s, err)
            | ContextualParseError::UnsupportedViewTransitionDescriptor(s, err) => {
                (snippet_of(s), err.kind)
            },
            ContextualParseError::NeverMatchingHostSelector(s)
            | ContextualParseError::InvalidCounterStyleWithoutSymbols(s)
            | ContextualParseError::InvalidCounterStyleNotEnoughSymbols(s) => (
                s.into(),
                ParseErrorKind::Custom(StyleParseErrorKind::UnspecifiedError.into()),
            ),
            ContextualParseError::InvalidCounterStyleWithoutAdditiveSymbols
            | ContextualParseError::InvalidCounterStyleExtendsWithSymbols
            | ContextualParseError::InvalidCounterStyleExtendsWithAdditiveSymbols => (
                "".into(),
                ParseErrorKind::Custom(StyleParseErrorKind::UnspecifiedError.into()),
            ),
        }
    }

    fn error_params(self) -> ErrorParams<'a> {
        let (s, error) = self.error_data();
        let mut params = extract_error_params(error, &s).unwrap_or_default();
        params.main_param.get_or_insert_with(|| s);
        params
    }

    fn selectors(&self) -> &'a [SelectorList<SelectorImpl>] {
        match *self {
            ContextualParseError::UnsupportedPropertyDeclaration(_, _, selectors) => selectors,
            _ => &[],
        }
    }

    fn to_gecko_message(&self) -> (Option<&'static CStr>, &'static CStr, Action) {
        let (msg, action): (&CStr, Action) = match *self {
            ContextualParseError::UnsupportedPropertyDeclaration(
                _,
                ParseError {
                    kind: ParseErrorKind::Basic(BasicParseErrorKind::UnexpectedToken),
                    ..
                },
                _,
            )
            | ContextualParseError::UnsupportedPropertyDeclaration(
                _,
                ParseError {
                    kind: ParseErrorKind::Basic(BasicParseErrorKind::AtRuleInvalid),
                    ..
                },
                _,
            ) => (cstr!("PEParseDeclarationDeclExpected"), Action::Skip),
            ContextualParseError::UnsupportedPropertyDeclaration(
                _,
                ParseError {
                    kind: ParseErrorKind::Custom(ref err),
                    ..
                },
                _,
            ) => match *err {
                StyleParseErrorKind::OtherInvalidValue => {
                    (cstr!("PEValueParsingError"), Action::Drop)
                },
                StyleParseErrorKind::UnexpectedImportantDeclaration => {
                    (cstr!("PEImportantDeclError"), Action::Drop)
                },
                _ => (cstr!("PEUnknownProperty"), Action::Drop),
            },
            ContextualParseError::UnsupportedPropertyDeclaration(..) => {
                (cstr!("PEUnknownProperty"), Action::Drop)
            },
            ContextualParseError::UnsupportedFontFaceDescriptor(..) => {
                (cstr!("PEUnknownFontDesc"), Action::Skip)
            },
            ContextualParseError::InvalidKeyframeRule(..) => {
                (cstr!("PEKeyframeBadName"), Action::Nothing)
            },
            ContextualParseError::InvalidRule(
                _,
                ParseError {
                    kind:
                        ParseErrorKind::Custom(StyleParseErrorKind::UnexpectedTokenWithinNamespace),
                    ..
                },
            ) => (cstr!("PEAtNSUnexpected"), Action::Nothing),
            ContextualParseError::InvalidRule(
                _,
                ParseError {
                    kind: ParseErrorKind::Custom(StyleParseErrorKind::DisallowedImportRule),
                    ..
                },
            ) => (cstr!("PEDisallowedImportRule"), Action::Nothing),
            ContextualParseError::InvalidRule(
                _,
                ParseError {
                    kind: ParseErrorKind::Basic(BasicParseErrorKind::AtRuleInvalid),
                    ..
                },
            ) => (cstr!("PEUnknownAtRule"), Action::Nothing),
            ContextualParseError::InvalidRule(_, ref err) => {
                let prefix = match err.kind {
                    ParseErrorKind::Custom(StyleParseErrorKind::SelectorError(ref err)) => {
                        match *err {
                            SelectorParseErrorKind::UnexpectedTokenInAttributeSelector => {
                                Some(cstr!("PEAttSelUnexpected"))
                            },
                            SelectorParseErrorKind::ExpectedBarInAttr => {
                                Some(cstr!("PEAttSelNoBar"))
                            },
                            SelectorParseErrorKind::BadValueInAttr => {
                                Some(cstr!("PEAttSelBadValue"))
                            },
                            SelectorParseErrorKind::NoQualifiedNameInAttributeSelector => {
                                Some(cstr!("PEAttributeNameOrNamespaceExpected"))
                            },
                            SelectorParseErrorKind::InvalidQualNameInAttr => {
                                Some(cstr!("PEAttributeNameExpected"))
                            },
                            SelectorParseErrorKind::ExplicitNamespaceUnexpectedToken => {
                                Some(cstr!("PETypeSelNotType"))
                            },
                            SelectorParseErrorKind::ExpectedNamespace => {
                                Some(cstr!("PEUnknownNamespacePrefix"))
                            },
                            SelectorParseErrorKind::EmptySelector => {
                                Some(cstr!("PESelectorGroupNoSelector"))
                            },
                            SelectorParseErrorKind::DanglingCombinator => {
                                Some(cstr!("PESelectorGroupExtraCombinator"))
                            },
                            SelectorParseErrorKind::UnsupportedPseudoClassOrElement => {
                                Some(cstr!("PEPseudoSelUnknown"))
                            },
                            SelectorParseErrorKind::PseudoElementExpectedColon => {
                                Some(cstr!("PEPseudoSelEndOrUserActionPC"))
                            },
                            SelectorParseErrorKind::NoIdentForPseudo => {
                                Some(cstr!("PEPseudoClassArgNotIdent"))
                            },
                            SelectorParseErrorKind::PseudoElementExpectedIdent => {
                                Some(cstr!("PEPseudoSelBadName"))
                            },
                            SelectorParseErrorKind::ClassNeedsIdent => {
                                Some(cstr!("PEClassSelNotIdent"))
                            },
                            _ => None,
                        }
                    },
                    ParseErrorKind::Custom(
                        StyleParseErrorKind::PropertySyntaxField(_)
                        | StyleParseErrorKind::PropertyInheritsField(_),
                    ) => {
                        // Keeps PEBadSelectorRSIgnored from being reported when a syntax descriptor
                        // error or inherits descriptor error was already reported.
                        return (None, cstr!(""), Action::Nothing);
                    },
                    _ => None,
                };
                return (prefix, cstr!("PEBadSelectorRSIgnored"), Action::Nothing);
            },
            ContextualParseError::InvalidMediaRule(_, ref err) => {
                let err: &CStr = match err.kind {
                    ParseErrorKind::Custom(StyleParseErrorKind::MediaQueryExpectedFeatureName) => {
                        cstr!("PEMQExpectedFeatureName")
                    },
                    ParseErrorKind::Custom(StyleParseErrorKind::MediaQueryExpectedFeatureValue) => {
                        cstr!("PEMQExpectedFeatureValue")
                    },
                    ParseErrorKind::Custom(StyleParseErrorKind::MediaQueryUnexpectedOperator) => {
                        cstr!("PEMQUnexpectedOperator")
                    },
                    ParseErrorKind::Custom(StyleParseErrorKind::RangedExpressionWithNoValue) => {
                        cstr!("PEMQNoMinMaxWithoutValue")
                    },
                    _ => cstr!("PEMQUnexpectedToken"),
                };
                (err, Action::Nothing)
            },
            ContextualParseError::UnsupportedRule(..) => (cstr!("PEDeclDropped"), Action::Nothing),
            ContextualParseError::NeverMatchingHostSelector(..) => {
                (cstr!("PENeverMatchingHostSelector"), Action::Nothing)
            },
            ContextualParseError::UnsupportedViewportDescriptorDeclaration(..)
            | ContextualParseError::UnsupportedCounterStyleDescriptorDeclaration(..)
            | ContextualParseError::InvalidCounterStyleWithoutSymbols(..)
            | ContextualParseError::InvalidCounterStyleNotEnoughSymbols(..)
            | ContextualParseError::InvalidCounterStyleWithoutAdditiveSymbols
            | ContextualParseError::InvalidCounterStyleExtendsWithSymbols
            | ContextualParseError::InvalidCounterStyleExtendsWithAdditiveSymbols
            | ContextualParseError::UnsupportedPropertyDescriptor(..)
            | ContextualParseError::UnsupportedFontFeatureValuesDescriptor(..)
            | ContextualParseError::UnsupportedFontPaletteValuesDescriptor(..)
            | ContextualParseError::InvalidFontFeatureValuesRule(..) => {
                (cstr!("PEUnknownAtRule"), Action::Skip)
            },
            ContextualParseError::UnsupportedValue(_, ParseError { ref kind, .. }) => {
                match *kind {
                    ParseErrorKind::Custom(StyleParseErrorKind::PropertySyntaxField(ref kind)) => {
                        let name = match kind {
                            PropertySyntaxParseError::NoSyntax => {
                                cstr!("PEPRSyntaxFieldMissing")
                            },
                            PropertySyntaxParseError::EmptyInput => {
                                cstr!("PEPRSyntaxFieldEmptyInput")
                            },
                            PropertySyntaxParseError::ExpectedPipeBetweenComponents => {
                                cstr!("PEPRSyntaxFieldExpectedPipe")
                            },
                            PropertySyntaxParseError::InvalidNameStart => {
                                cstr!("PEPRSyntaxFieldInvalidNameStart")
                            },
                            PropertySyntaxParseError::InvalidName => {
                                cstr!("PEPRSyntaxFieldInvalidName")
                            },
                            PropertySyntaxParseError::UnclosedDataTypeName => {
                                cstr!("PEPRSyntaxFieldUnclosedDataTypeName")
                            },
                            PropertySyntaxParseError::UnexpectedEOF => {
                                cstr!("PEPRSyntaxFieldUnexpectedEOF")
                            },
                            PropertySyntaxParseError::UnknownDataTypeName => {
                                cstr!("PEPRSyntaxFieldUnknownDataTypeName")
                            },
                        };
                        (name, Action::Nothing)
                    },
                    ParseErrorKind::Custom(StyleParseErrorKind::PropertyInheritsField(
                        ref kind,
                    )) => {
                        let name = match kind {
                            style_traits::PropertyInheritsParseError::NoInherits => {
                                cstr!("PEPRInheritsFieldMissing")
                            },
                            style_traits::PropertyInheritsParseError::InvalidInherits => {
                                cstr!("PEPRInheritsFieldInvalid")
                            },
                        };
                        (name, Action::Nothing)
                    },
                    // Not the best error message, since we weren't parsing a
                    // declaration, just a value.
                    _ => (cstr!("PEValueParsingError"), Action::Nothing),
                }
            },
            ContextualParseError::UnsupportedViewTransitionDescriptor(..) => {
                (cstr!("PEUnknownVTDesc"), Action::Skip)
            },
        };
        (None, msg, action)
    }
}

impl ErrorReporter {
    pub fn report(&self, location: SourceLocation, error: ContextualParseError) {
        let (pre, name, action) = error.to_gecko_message();
        let suffix = match action {
            Action::Nothing => ptr::null(),
            Action::Skip => cstr!("PEDeclSkipped").as_ptr(),
            Action::Drop => cstr!("PEDeclDropped").as_ptr(),
        };
        let selectors = error.selectors();
        let desugared_selector_list = match selectors.len() {
            0 => None,
            1 => Some(selectors[0].to_css_string()),
            _ => {
                let mut desugared = selectors.last().unwrap().clone();
                for parent in selectors.iter().rev().skip(1) {
                    desugared = desugared.replace_parent_selector(&parent);
                }
                Some(desugared.to_css_string())
            },
        };
        let selector_list_ptr = desugared_selector_list
            .as_ref()
            .map_or(ptr::null(), |s| s.as_ptr()) as *const _;
        let params = error.error_params();
        let param = params.main_param;
        let pre_param = params.prefix_param;
        let param_ptr = param.as_ref().map_or(ptr::null(), |p| p.as_ptr());
        let pre_param_ptr = pre_param.as_ref().map_or(ptr::null(), |p| p.as_ptr());
        unsafe {
            bindings::Gecko_ReportUnexpectedCSSError(
                self.window_id,
                self.uri,
                name.as_ptr() as *const _,
                param_ptr as *const _,
                param.as_ref().map_or(0, |p| p.len()) as u32,
                pre.map_or(ptr::null(), |p| p.as_ptr()) as *const _,
                pre_param_ptr as *const _,
                pre_param.as_ref().map_or(0, |p| p.len()) as u32,
                suffix as *const _,
                selector_list_ptr,
                desugared_selector_list
                    .as_ref()
                    .map_or(0, |string| string.len()) as u32,
                location.line,
                location.column,
            );
        }
    }
}

impl ParseErrorReporter for ErrorReporter {
    fn report_error(
        &self,
        _url: &UrlExtraData,
        location: SourceLocation,
        error: ContextualParseError,
    ) {
        self.report(location, error)
    }
}
