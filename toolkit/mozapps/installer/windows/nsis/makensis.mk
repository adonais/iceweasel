# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

ifndef CONFIG_DIR
$(error CONFIG_DIR must be set before including makensis.mk)
endif

ABS_CONFIG_DIR := $(abspath $(CONFIG_DIR))

SFX_MODULE ?= $(error SFX_MODULE is not defined)

ifdef NSIS_USE_UPX
USE_UPX := --use-upx
endif

NSIS_STAGE_ARGS = --config-dir=$(CONFIG_DIR) \
  $(addprefix --install=,$(addprefix $(srcdir)/,$(INSTALLER_FILES))) \
  $(addprefix --install=,$(addprefix $(topsrcdir)/$(MOZ_BRANDING_DIRECTORY)/,$(BRANDING_FILES))) \
  $(addprefix --install=,$(addprefix $(MOZILLA_DIR)/toolkit/mozapps/installer/windows/nsis/,$(NSIS_TOOLKIT_FILES))) \
  $(addprefix --install=,$(addprefix $(MOZILLA_DIR)/other-licenses/nsis/Plugins/,$(NSIS_CUSTOM_PLUGINS))) \
  --defines-in=$(srcdir)/nsis/defines.nsi.in --defines-out=$(CONFIG_DIR)/defines.nsi \
  --topsrcdir=$(topsrcdir) \
  --preprocess-locale-script=$(topsrcdir)/toolkit/mozapps/installer/windows/nsis/preprocess-locale.py \
  $(addprefix --locale-arg=,$(PPL_LOCALE_ARGS)) --ab-cd=$(AB_CD) --preprocess-locale \
  $(NSIS_INSTALLER_DEFINES) $(ACDEFINES) -DTOPOBJDIR=$(topobjdir)

ifdef ZIP_IN
installer:: $(CONFIG_DIR)/setup.exe $(ZIP_IN)
# In automation, the installers are created by repackage tasks, from setup.exe
# and the package, so don't spend time creating them in the build.
ifndef MOZ_AUTOMATION
	$(NSINSTALL) -D '$(ABS_DIST)/$(PKG_PATH)'
	$(PYTHON3) $(MOZILLA_DIR)/mach repackage installer \
	  -o '$(ABS_DIST)/$(PKG_PATH)$(PKG_INST_BASENAME).exe' \
	  --package-name '$(MOZ_PKG_DIR)' \
	  --package '$(ZIP_IN)' \
	  --tag $(topsrcdir)/$(MOZ_BUILD_APP)/installer/windows/app.tag \
	  --setupexe $(CONFIG_DIR)/setup.exe \
	  --sfx-stub $(SFX_MODULE) \
	  $(USE_UPX)
ifdef MOZ_STUB_INSTALLER
	$(PYTHON3) $(MOZILLA_DIR)/mach repackage installer \
	  -o '$(ABS_DIST)/$(PKG_PATH)$(PKG_STUB_BASENAME).exe' \
	  --tag $(topsrcdir)/browser/installer/windows/stub.tag \
	  --setupexe $(CONFIG_DIR)/setup-stub.exe \
	  --sfx-stub $(SFX_MODULE) \
	  $(USE_UPX)
endif
endif
else
installer::
	$(error ZIP_IN must be set when building installer)
endif
