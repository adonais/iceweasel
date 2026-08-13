/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "clang/Frontend/FrontendPluginRegistry.h"

#include "CustomAttributesAction.h"
#include "MozCheckAction.h"
#include "mozsearch-plugin/MozsearchAction.h"

using namespace clang;

// MozsearchAction needs to run before CustomAttributesAction because
// CustomAttributesAction removes all annotations and MozsearchAction
// reads some of them.
// Therefore it needs to be added to the registry first.
//
// Note that because of the Static Initialization Order Fiasco, to be
// able to control the order in which the FrontendPluginRegistry::Add
// constructors run, they need to be in the same translation unit.

#ifdef ENABLE_MOZSEARCH_PLUGIN
static FrontendPluginRegistry::Add<MozsearchAction>
    X("mozsearch-index", "create the mozsearch index database");
#endif

#ifndef CLANG_TIDY
static FrontendPluginRegistry::Add<CustomAttributesAction>
    Y("moz-custom-attributes", "prepare custom attributes for moz-check");
#endif

static FrontendPluginRegistry::Add<MozCheckAction> Z("moz-check",
                                                     "check moz action");
