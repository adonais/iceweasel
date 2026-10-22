# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

include  $(topsrcdir)/toolkit/mozapps/installer/package-name.mk

package:
	@$(MAKE) -C mobile/android/installer

stage-package:
	$(MAKE) -C mobile/android/installer stage-package

upload::
	@$(MAKE) -C mobile/android/installer upload

# make -j1 because dependencies in l10n build targets don't work
# with parallel builds
merge-% chrome-%:
	$(MAKE) -j1 -C mobile/android/locales $@
