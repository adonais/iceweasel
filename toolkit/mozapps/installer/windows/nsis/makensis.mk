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

$(CONFIG_DIR)/setup.exe::
ifdef MOZ_USE_MAKEFILE_INSTALLER_BUILD
	$(INSTALL) $(addprefix $(MOZILLA_DIR)/toolkit/mozapps/installer/windows/nsis/,$(NSIS_TOOLKIT_FILES)) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(MOZILLA_DIR)/other-licenses/nsis/Plugins/,$(NSIS_CUSTOM_PLUGINS)) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(MOZILLA_DIR)/other-licenses/nsis/,$(NSIS_CUSTOM_UI)) $(CONFIG_DIR)
	cd $(CONFIG_DIR) && $(MAKENSISU) $(MAKENSISU_FLAGS) installer.nsi
ifdef MOZ_STUB_INSTALLER
	cd $(CONFIG_DIR) && $(MAKENSISU) $(MAKENSISU_FLAGS) stub.nsi
endif
endif

ifdef ZIP_IN
installer:: $(CONFIG_DIR)/setup.exe $(ZIP_IN)
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
else
installer::
	$(error ZIP_IN must be set when building installer)
endif

HELPER_DEPS = $(GLOBAL_DEPS) \
              $(addprefix $(srcdir)/,$(INSTALLER_FILES)) \
              $(addprefix $(topsrcdir)/$(MOZ_BRANDING_DIRECTORY)/,$(BRANDING_FILES)) \
              $(srcdir)/nsis/defines.nsi.in \
              $(topsrcdir)/toolkit/mozapps/installer/windows/nsis/preprocess-locale.py \
              $(addprefix $(MOZILLA_DIR)/toolkit/mozapps/installer/windows/nsis/,$(NSIS_TOOLKIT_FILES)) \
              $(addprefix $(MOZILLA_DIR)/other-licenses/nsis/Plugins/,$(NSIS_CUSTOM_PLUGINS))

# For building the uninstaller during the application build so it can be
# included for mar file generation.
$(CONFIG_DIR)/helper.exe: $(HELPER_DEPS)
ifdef MOZ_USE_MAKEFILE_INSTALLER_BUILD
	$(RM) -r $(CONFIG_DIR)
	$(MKDIR) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(srcdir)/,$(INSTALLER_FILES)) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(topsrcdir)/$(MOZ_BRANDING_DIRECTORY)/,$(BRANDING_FILES)) $(CONFIG_DIR)
	$(call py_action,preprocessor defines.nsi,-Fsubstitution $(NSIS_INSTALLER_DEFINES) $(ACDEFINES) \
	-DTOPOBJDIR=$(topobjdir) \
	  $(srcdir)/nsis/defines.nsi.in -o $(CONFIG_DIR)/defines.nsi)
	$(PYTHON3) $(topsrcdir)/toolkit/mozapps/installer/windows/nsis/preprocess-locale.py \
	  --preprocess-locale $(topsrcdir) \
	  $(PPL_LOCALE_ARGS) $(AB_CD) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(MOZILLA_DIR)/toolkit/mozapps/installer/windows/nsis/,$(NSIS_TOOLKIT_FILES)) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(MOZILLA_DIR)/other-licenses/nsis/Plugins/,$(NSIS_CUSTOM_PLUGINS)) $(CONFIG_DIR)
	cd $(CONFIG_DIR) && $(MAKENSISU) $(MAKENSISU_FLAGS) uninstaller.nsi
else
	$(call py_action,nsis_stage helper,$(NSIS_STAGE_ARGS))
	$(call py_action,nsis_build helper.exe,--config-dir=$(CONFIG_DIR) --nsi=uninstaller.nsi \
	--makensis=$(MAKENSISU) $(addprefix --makensis-flag=,$(MAKENSISU_FLAGS)) \
	--output=$(CONFIG_DIR)/helper.exe)
endif

uninstaller:: $(CONFIG_DIR)/helper.exe
	$(NSINSTALL) -D $(DIST)/bin/uninstall
	cp $(CONFIG_DIR)/helper.exe $(DIST)/bin/uninstall

ifdef MOZ_MAINTENANCE_SERVICE
ifdef MOZ_USE_MAKEFILE_INSTALLER_BUILD
maintenanceservice_installer::
	$(RM) -r $(CONFIG_DIR)
	$(MKDIR) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(srcdir)/,$(INSTALLER_FILES)) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(topsrcdir)/$(MOZ_BRANDING_DIRECTORY)/,$(BRANDING_FILES)) $(CONFIG_DIR)
	$(call py_action,preprocessor defines.nsi,-Fsubstitution $(NSIS_INSTALLER_DEFINES) $(ACDEFINES) \
	-DTOPOBJDIR=$(topobjdir) \
	  $(srcdir)/nsis/defines.nsi.in -o $(CONFIG_DIR)/defines.nsi)
	$(PYTHON3) $(topsrcdir)/toolkit/mozapps/installer/windows/nsis/preprocess-locale.py \
	  --preprocess-locale $(topsrcdir) \
	  $(PPL_LOCALE_ARGS) $(AB_CD) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(MOZILLA_DIR)/toolkit/mozapps/installer/windows/nsis/,$(NSIS_TOOLKIT_FILES)) $(CONFIG_DIR)
	$(INSTALL) $(addprefix $(MOZILLA_DIR)/other-licenses/nsis/Plugins/,$(NSIS_CUSTOM_PLUGINS)) $(CONFIG_DIR)
	cd $(CONFIG_DIR) && $(MAKENSISU) $(MAKENSISU_FLAGS) maintenanceservice_installer.nsi
	$(NSINSTALL) -D $(DIST)/bin/
	cp $(CONFIG_DIR)/maintenanceservice_installer.exe $(DIST)/bin
endif
endif
