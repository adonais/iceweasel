# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

package:
	@$(MAKE) -C browser/installer

package-compare:
	@$(MAKE) -C browser/installer package-compare

stage-package:
	@$(MAKE) -C browser/installer stage-package

install::
	@$(MAKE) -C browser/installer install

upload::
	@$(MAKE) -C browser/installer upload

ifdef MAKENSISU
INSTALLER_REPACK_DEPS = browser/installer/windows/nsis-stage.stamp
endif

installers-%: $(INSTALLER_REPACK_DEPS)
	$(MAKE) -C browser/locales $@

merge-% langpack-% chrome-%:
	$(MAKE) -C browser/locales $@
