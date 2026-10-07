#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

#
# Config stuff for OS_TARGET=WINNT
#

include $(CORE_DEPTH)/coreconf/WIN32.mk

# NSPR's WIN95 target prefixes its import libraries only for GCC, like ours.
NSPR31_LIB_PREFIX = $(IMPORT_LIB_PREFIX)
