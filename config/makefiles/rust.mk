# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

# /!\ In this file, we export multiple variables globally via make rather than
# in recipes via the `env` command to avoid round-trips to msys on Windows, which
# tend to break environment variable values in interesting ways.

# /!\ Avoid the use of double-quotes in this file, so that the cargo
# commands can be executed directly by make, without doing a round-trip
# through a shell.

# Permit users to pass flags to cargo from their mozconfigs (e.g. --color=always).
cargo_build_flags = $(CARGOFLAGS)

ifdef RUST_LIBRARY_CARGO_PROFILE_SUFFIX
cargo_profile_dir := $(MOZ_CARGO_PROFILE_PREFIX)-$(RUST_LIBRARY_CARGO_PROFILE_SUFFIX)
cargo_build_flags += --profile $(cargo_profile_dir)
else
cargo_profile_dir := $(MOZ_CARGO_DEFAULT_PROFILE_DIR)
cargo_build_flags += $(MOZ_CARGO_DEFAULT_PROFILE_ARGS)
endif

cargo_crate_type_flag := $(if $(RUST_LIBRARY_CARGO_CRATE_TYPE),--crate-type $(RUST_LIBRARY_CARGO_CRATE_TYPE),)

cargo_build_flags += $(MOZ_CARGO_FROZEN_ARGS)
cargo_build_flags += --manifest-path $(CARGO_FILE)
ifdef BUILD_VERBOSE_LOG
cargo_build_flags += -vv
endif

ifneq (,$(USE_CARGO_JSON_MESSAGE_FORMAT))
cargo_build_flags += --message-format=json
endif

# Enable color output if original stdout was a TTY and color settings
# aren't already present. This essentially restores the default behavior
# of cargo when running via `mach`.
ifdef MACH_STDOUT_ISATTY
ifeq (,$(findstring --color,$(cargo_build_flags)))
ifdef NO_ANSI
cargo_build_flags += --color=never
else
cargo_build_flags += --color=always
endif
endif
endif

# Without -j > 1, make will not pass jobserver info down to cargo. Force
# one job when requested as a special case.
cargo_build_flags += $(filter -j1,$(MAKEFLAGS))
cargo_build_flags += $(MOZ_CARGO_BUILD_STD_ARGS)

# These flags are passed via `cargo rustc` and only apply to the final rustc
# invocation (i.e., only the top-level crate, not its dependencies).
cargo_rustc_flags = $(CARGO_RUSTCFLAGS)
# Enable link-time optimization for release builds.
ifdef RUST_LIBRARY_LTO
cargo_rustc_flags += -Clto
endif

ifdef CARGO_INCREMENTAL
export CARGO_INCREMENTAL
endif

rustflags_override = $(MOZ_RUST_DEFAULT_FLAGS)

# Allow tools such as clippy to inject extra driver flags (e.g. -W/-D) via an
# environment variable. These are folded into RUSTFLAGS here (rather than
# passed on the cargo CLI), which sidesteps any ordering issue with the `--`
# separator and applies to both target and host recipes.
ifdef extra_rustflags
rustflags_override += $(extra_rustflags)
endif

rustflags_override += $(MOZ_RUSTFLAGS_AFTER_EXTRA)

ifdef MOZ_RUSTC_WRAPPER
export RUSTC_WRAPPER=$(MOZ_RUSTC_WRAPPER)
endif

# `cargo clippy` only lints workspace members, which leaves out every crate the
# top-level Cargo.toml excludes from the workspace. See build/cargo-clippy-wrapper.
force-cargo-%-clippy: export RUSTC_WRAPPER := $(MOZ_CARGO_CLIPPY_WRAPPER)

ifeq (WINNT,$(HOST_OS_ARCH))
# //?/ is the long path prefix which seems to confuse make, so we remove it
# (things should work without it).
normalize_sep = $(patsubst //?/%,%,$(subst \,/,$(1)))
else
normalize_sep = $(1)
endif

# We start with host variables because the rust host and the rust target might be the same,
# in which case we want the latter to take priority.
export CC_$(MOZ_CARGO_HOST_CC_ENV_SUFFIX)=$(MOZ_CARGO_HOST_CC)
export CXX_$(MOZ_CARGO_HOST_CC_ENV_SUFFIX)=$(MOZ_CARGO_HOST_CXX)
export AR_$(MOZ_CARGO_HOST_CC_ENV_SUFFIX)=$(HOST_AR)

export CC_$(MOZ_CARGO_CC_ENV_SUFFIX)=$(MOZ_CARGO_CC)
export CXX_$(MOZ_CARGO_CC_ENV_SUFFIX)=$(MOZ_CARGO_CXX)
export AR_$(MOZ_CARGO_CC_ENV_SUFFIX)=$(AR)

# cc-rs may not know whether we are using a compiler wrapper, so explicitly
# tell it that we do.
ifdef CC_KNOWN_WRAPPER_CUSTOM
export CC_KNOWN_WRAPPER_CUSTOM
endif

# When --with-compiler-wrapper is used, CC/CXX become a space-separated pair of
# paths (`<wrapper> <compiler>`). On Windows, if the cargo recipe crosses into an
# msys2 shell, msys2 mistakes that value for a Windows path-list and rewrites it
# (`D:/a C:/b` -> `D;C:\...\a C;C:\...\b`), which breaks cc-rs with "os error 123".
# Exclude these exact variable names from msys2's path conversion (it does not
# support wildcards). Harmless for single-path CC/CXX, so we do it unconditionally
# on Windows.
ifeq (WINNT,$(HOST_OS_ARCH))
export MSYS2_ENV_CONV_EXCL := $(if $(MSYS2_ENV_CONV_EXCL),$(MSYS2_ENV_CONV_EXCL);)CC_$(MOZ_CARGO_CC_ENV_SUFFIX);CXX_$(MOZ_CARGO_CC_ENV_SUFFIX);CC_$(MOZ_CARGO_HOST_CC_ENV_SUFFIX);CXX_$(MOZ_CARGO_HOST_CC_ENV_SUFFIX)
endif

export CFLAGS_$(MOZ_CARGO_HOST_CC_ENV_SUFFIX)=$(MOZ_CARGO_HOST_CFLAGS_BASE) $(filter $(MOZ_CARGO_HOST_CFLAGS_FILTER),$(COMPUTED_HOST_CFLAGS))
export CXXFLAGS_$(MOZ_CARGO_HOST_CC_ENV_SUFFIX)=$(MOZ_CARGO_HOST_CXXFLAGS_BASE) $(filter $(MOZ_CARGO_HOST_CXXFLAGS_FILTER),$(COMPUTED_HOST_CXXFLAGS))
export CFLAGS_$(MOZ_CARGO_CC_ENV_SUFFIX)=$(MOZ_CARGO_CFLAGS_BASE) $(filter $(MOZ_CARGO_CFLAGS_FILTER),$(RUST_LTO_CFLAGS) $(COMPUTED_CFLAGS) $(RUST_PGO_CFLAGS))
export CXXFLAGS_$(MOZ_CARGO_CC_ENV_SUFFIX)=$(MOZ_CARGO_CXXFLAGS_BASE) $(filter $(MOZ_CARGO_CXXFLAGS_FILTER),$(RUST_LTO_CFLAGS) $(COMPUTED_CXXFLAGS) $(RUST_PGO_CFLAGS))

define sanitizer_options
export $1:=$$($1:%=%:)intercept_tls_get_addr=0
endef
$(foreach var,$(MOZ_RUST_SANITIZER_OPTION_VARS),$(eval $(call sanitizer_options,$(var))))

export BINDGEN_EXTRA_CLANG_ARGS
export CARGO_TARGET_DIR
export RUSTFLAGS
export RUSTC
export RUSTDOC
export RUSTDOCFLAGS
export RUSTFMT
export LIBCLANG_PATH=$(MOZ_LIBCLANG_PATH)
export CLANG_PATH=$(MOZ_CLANG_PATH)
export PKG_CONFIG
export PKG_CONFIG_ALLOW_CROSS=1
export PKG_CONFIG_PATH
ifneq (,$(PKG_CONFIG_SYSROOT_DIR))
export PKG_CONFIG_SYSROOT_DIR
endif
ifneq (,$(PKG_CONFIG_LIBDIR))
export PKG_CONFIG_LIBDIR
endif
export RUST_BACKTRACE=full
export MOZ_TOPOBJDIR=$(topobjdir)
export MOZ_FOLD_LIBS
GLEAN_PYTHON_VENV_DIR = $(GLEAN_PARSER_VENV)
export GLEAN_PYTHON_VENV_DIR
export PYTHON3
export CARGO_PROFILE_RELEASE_OPT_LEVEL
export CARGO_PROFILE_DEV_OPT_LEVEL

ifdef MOZ_RUST_COREAUDIO_SDK_PATH
export COREAUDIO_SDK_PATH=$(MOZ_RUST_COREAUDIO_SDK_PATH)
endif
ifdef IPHONEOS_SDK_DIR
# export for build/macosx/xcrun
export IPHONEOS_SDK_DIR
endif
# Use the same prefix as set through modules/zlib/src/mozzconf.h
# for libz-rs-sys, since we still use the headers from there.
export LIBZ_RS_SYS_PREFIX=MOZ_Z_

ifndef RUSTC_BOOTSTRAP
RUSTC_BOOTSTRAP := $(MOZ_RUSTC_BOOTSTRAP_DEFAULT)
export RUSTC_BOOTSTRAP
endif

# `cargo` subcommands other than `build` that `mach cargo` can drive and need
# build scripts to run.
other_cargo_subcommands := check clippy fix udeps

target_rust_ltoable := force-cargo-library-build $(addprefix force-cargo-library-,$(other_cargo_subcommands))
target_rust_nonltoable := force-cargo-test-run force-cargo-program-build $(addprefix force-cargo-program-,$(other_cargo_subcommands))

ifdef MOZ_RUSTC_BOOTSTRAP_FORCE
RUSTC_BOOTSTRAP := $(MOZ_RUSTC_BOOTSTRAP_FORCE)
endif

target_rustflags := $(rustflags_override) $(RUST_SANCOV_FLAGS) $(RUSTFLAGS) $(MOZ_RUSTFLAGS_TARGET_COMMON)

$(target_rust_ltoable): RUSTFLAGS:=$(target_rustflags) $(MOZ_RUSTFLAGS_TARGET_LTOABLE)
$(target_rust_nonltoable): RUSTFLAGS:=$(target_rustflags)

TARGET_RECIPES := $(target_rust_ltoable) $(target_rust_nonltoable)

HOST_RECIPES := \
  $(foreach a,library program,$(foreach b,build $(other_cargo_subcommands),force-cargo-host-$(a)-$(b)))

$(HOST_RECIPES): RUSTFLAGS:=$(rustflags_override)

$(TARGET_RECIPES) $(HOST_RECIPES): RUSTFLAGS += $(MOZ_RUSTFLAGS_CODEGEN)

# We use the + prefix to pass down the jobserver fds to cargo, but we
# don't use the prefix when make -n is used, so that cargo doesn't run
# in that case)
define RUN_CARGO_INNER
$(if $(findstring n,$(filter-out --%, $(MAKEFLAGS))),,+)$(CARGO) $(1) $(cargo_build_flags) $(CARGO_EXTRA_FLAGS) $(cargo_extra_cli_flags)
endef

ifdef CARGO_CONTINUE_ON_ERROR
define RUN_CARGO
-$(RUN_CARGO_INNER)
endef
else
define RUN_CARGO
$(RUN_CARGO_INNER)
endef
endif

# This function is intended to be called by:
#
#   $(call CARGO_BUILD,EXTRA_ENV_VAR1=X EXTRA_ENV_VAR2=Y ...)
#
# but, given the idiosyncracies of make, can also be called without arguments:
#
#   $(call CARGO_BUILD)
define CARGO_BUILD
$(call RUN_CARGO,rustc$(if $(BUILDSTATUS), --timings)$(if $(findstring k,$(filter-out --%, $(MAKEFLAGS))), --keep-going))
endef

export MOZ_CLANG_NEWER_THAN_RUSTC_LLVM
export MOZ_CARGO_WRAP_LDFLAGS
export MOZ_CARGO_WRAP_LD
export MOZ_CARGO_WRAP_LD_CXX
export MOZ_CARGO_WRAP_HOST_LDFLAGS
export MOZ_CARGO_WRAP_HOST_LD
export MOZ_CARGO_WRAP_HOST_LD_CXX
# Exporting from make always exports a value. Setting a value per-recipe
# would export an empty value for the host recipes. When not doing a
# cross-compile, the --target for those is the same, and cargo will use
# CARGO_TARGET_*_LINKER for its linker, so we always pass the
# cargo-linker wrapper, and fill MOZ_CARGO_WRAP_{HOST_,}LD* more or less
# appropriately for all recipes.
# Like for CC/C*FLAGS, we want the target values to trump the host values when
# both variables are the same.
ifdef MOZ_CARGO_HOST_LINKER_ENV_VAR
export $(MOZ_CARGO_HOST_LINKER_ENV_VAR):=$(MOZ_CARGO_HOST_LINKER)
endif
ifdef MOZ_CARGO_LINKER_ENV_VAR
export $(MOZ_CARGO_LINKER_ENV_VAR):=$(MOZ_CARGO_LINKER)
endif

$(TARGET_RECIPES): MOZ_CARGO_WRAP_LDFLAGS:=$(filter-out $(MOZ_CARGO_LDFLAGS_FILTER_OUT),$(LDFLAGS))
force-cargo-program-build: MOZ_CARGO_WRAP_LDFLAGS:=$(filter-out $(MOZ_CARGO_PROGRAM_LDFLAGS_FILTER_OUT),$(MOZ_CARGO_WRAP_LDFLAGS))

ifdef MOZ_RUST_PROGRAM_LDFLAGS
force-cargo-program-build: MOZ_CARGO_WRAP_LDFLAGS+=$(MOZ_RUST_PROGRAM_LDFLAGS)
endif
ifdef MOZ_RUST_PROGRAM_RUSTCFLAGS
force-cargo-program-build: CARGO_RUSTCFLAGS += $(MOZ_RUST_PROGRAM_RUSTCFLAGS)
endif

$(TARGET_RECIPES): RUSTFLAGS += $(MOZ_RUSTFLAGS_DEFAULT_LINKER_LIBRARIES)

$(HOST_RECIPES): MOZ_CARGO_WRAP_LDFLAGS:=$(MOZ_CARGO_HOST_LDFLAGS)
$(TARGET_RECIPES) $(HOST_RECIPES): MOZ_CARGO_WRAP_HOST_LDFLAGS:=$(MOZ_CARGO_HOST_LDFLAGS)

$(TARGET_RECIPES): MOZ_CARGO_WRAP_LD:=$(MOZ_CARGO_LD)
$(TARGET_RECIPES): MOZ_CARGO_WRAP_LD_CXX:=$(MOZ_CARGO_LD_CXX)
$(HOST_RECIPES): MOZ_CARGO_WRAP_LD:=$(MOZ_CARGO_HOST_LD)
$(HOST_RECIPES): MOZ_CARGO_WRAP_LD_CXX:=$(MOZ_CARGO_HOST_LD_CXX)
$(TARGET_RECIPES) $(HOST_RECIPES): MOZ_CARGO_WRAP_HOST_LD:=$(MOZ_CARGO_HOST_LD)
$(TARGET_RECIPES) $(HOST_RECIPES): MOZ_CARGO_WRAP_HOST_LD_CXX:=$(MOZ_CARGO_HOST_LD_CXX)

define make_default_rule
$(1):

endef

# make_cargo_rule(target, real-target [, extra-deps])
# Generates a rule suitable to rebuild $(target) only if its dependencies are
# obsolete.
# It relies on the fact that upon build, cargo generates a dependency file named
# `$(target).d'. Unfortunately the lhs of the rule has an absolute path,
# so we extract it under the name $(target)_deps below.
#
# If the dependencies are empty, the file was not created so we force a rebuild.
# Otherwise we add it to the dependency list.
#
# The actual rule is a bit tricky. The `+' prefix allow for recursive parallel
# make, and it's skipped (`:') if we already triggered a rebuild as part of the
# dependency chain.
#
# Another tricky thing: some dependencies may contain escaped spaces, and they
# need to be preserved, but $(wordlist) and $(foreach) split on spaces, so we
# replace escaped spaces with some unlikely string, and replace them back after.
escape_sequence=_^_^_^_
escape_spaces = $(subst \ ,$(escape_sequence),$(1))
unescape_spaces = $(subst $(escape_sequence),\ ,$(1))

define make_cargo_rule
$(notdir $(1))_deps := $$(call unescape_spaces,$$(call normalize_sep,$$(wordlist 2, 10000000, $$(call escape_spaces,$$(if $$(wildcard $(basename $(1)).d),$$(shell cat $(basename $(1)).d))))))
$(1): $(CARGO_FILE) $(3) $(topsrcdir)/Cargo.lock $$(if $$($(notdir $(1))_deps),$$($(notdir $(1))_deps),$(2))
	$$(REPORT_BUILD)
	$$(if $$($(notdir $(1))_deps),+$(MAKE) $(2),:)
	@touch $$@

$$(foreach dep, $$(call escape_spaces,$$($(notdir $(1))_deps)),$$(eval $$(call make_default_rule,$$(call unescape_spaces,$$(dep)))))
endef

ifdef RUST_LIBRARY_FILE

rust_features_flag := --features '$(addsuffix $(COMMA),$(RUST_LIBRARY_FEATURES))mozilla-central-workspace-hack'

ifdef MOZ_RUST_LIBRARY_RUSTCFLAGS
force-cargo-library-build: CARGO_RUSTCFLAGS += $(MOZ_RUST_LIBRARY_RUSTCFLAGS)
endif

# Assume any system libraries rustc links against are already in the target's LIBS.
#
# We need to run cargo unconditionally, because cargo is the only thing that
# has full visibility into how changes in Rust sources might affect the final
# build.
force-cargo-library-build:
	$(call BUILDSTATUS,START_Rust $(notdir $(RUST_LIBRARY_FILE)))
	$(call CARGO_BUILD) --lib $(cargo_crate_type_flag) $(MOZ_CARGO_TARGET_ARGS) $(rust_features_flag) -- $(cargo_rustc_flags)
	$(call BUILDSTATUS,END_Rust $(notdir $(RUST_LIBRARY_FILE)))
# When we are building in --enable-release mode; we add an additional check to confirm
# that we are not importing any networking-related functions in rust code. This reduces
# the chance of proxy bypasses originating from rust code.
# The check only works when rust code is built with -Clto but without MOZ_LTO_RUST_CROSS.
# Sanitizers and sancov also fail because compiler-rt hooks network functions.
ifndef MOZ_PROFILE_GENERATE
ifeq ($(OS_ARCH), Linux)
ifeq (,$(RUST_SANCOV_FLAGS)$(MOZ_ASAN)$(MOZ_TSAN)$(MOZ_UBSAN))
ifndef MOZ_LTO_RUST_CROSS
ifdef RUST_LIBRARY_LTO
	$(call py_action,check_binary $(@F),--networking $(RUST_LIBRARY_FILE))
endif
endif
endif
endif
endif

$(eval $(call make_cargo_rule,$(RUST_LIBRARY_FILE),force-cargo-library-build))

SUGGEST_INSTALL_ON_FAILURE = (ret=$$?; if [ $$ret = 101 ]; then echo If $1 is not installed, install it using: cargo install $1; fi; exit $$ret)

ifndef CARGO_NO_AUTO_ARG
force-cargo-library-%:
	$(call RUN_CARGO,$*) --lib $(MOZ_CARGO_TARGET_ARGS) $(rust_features_flag) || $(call SUGGEST_INSTALL_ON_FAILURE,cargo-$*)
else
force-cargo-library-%:
	$(call RUN_CARGO,$*) || $(call SUGGEST_INSTALL_ON_FAILURE,cargo-$*)
endif

else
force-cargo-library-%:
	@true

endif # RUST_LIBRARY_FILE

ifdef RUST_TESTS

rust_test_options := $(foreach test,$(RUST_TESTS),-p $(test))

rust_test_features_flag := --features '$(addsuffix $(COMMA),$(RUST_TEST_FEATURES))mozilla-central-workspace-hack'

# Don't stop at the first failure. We want to list all failures together.
rust_test_flag := --no-fail-fast

# Cargo writes the test binaries under the profile directory selected in
# cargo_build_flags above.
rust_test_bindir := $(CARGO_TARGET_DIR)/$(RUST_TARGET)/$(cargo_profile_dir)/deps

# Test executables need their shared library dependencies from dist/bin at
# run time.
#
# Linux and macOS set an rpath (run-time search path). Windows doesn't have an
# rpath, and searches the test binary's directory and the PATH by default.
ifneq ($(OS_TARGET),WINNT)
force-cargo-test-run: RUSTFLAGS += -C link-arg=-Wl,-rpath,$(ABS_DIST)/bin
endif

# Linux only applies rpath to direct dependencies of the test binary. Transitive 
# dependencies are optimized out by the linker, which is an issue for NSS.
#
# `cargo test` inserts the test binary's directory into the library search path
# on all platforms, so we can copy potential transitive dependencies for 
# non-macOS platforms there.
ifneq ($(OS_ARCH),Darwin)
stage_test_libs = mkdir -p $(rust_test_bindir)$(if $(wildcard $(ABS_DIST)/bin/$(DLL_PREFIX)*$(DLL_SUFFIX)), && cp $(ABS_DIST)/bin/$(DLL_PREFIX)*$(DLL_SUFFIX) $(rust_test_bindir)/)
else
stage_test_libs = :
endif

force-cargo-test-run:
	$(stage_test_libs)
	$(call RUN_CARGO,test $(MOZ_CARGO_TARGET_ARGS) $(rust_test_flag) $(rust_test_options) $(rust_test_features_flag))

endif # RUST_TESTS

ifdef HOST_RUST_LIBRARY_FILE

host_rust_features_flag := --features '$(addsuffix $(COMMA),$(HOST_RUST_LIBRARY_FEATURES))mozilla-central-workspace-hack'

force-cargo-host-library-build:
	$(call BUILDSTATUS,START_Rust $(notdir $(HOST_RUST_LIBRARY_FILE)))
	$(call CARGO_BUILD) --lib $(MOZ_CARGO_HOST_TARGET_ARGS) $(host_rust_features_flag)
	$(call BUILDSTATUS,END_Rust $(notdir $(HOST_RUST_LIBRARY_FILE)))

$(eval $(call make_cargo_rule,$(HOST_RUST_LIBRARY_FILE),force-cargo-host-library-build))

ifndef CARGO_NO_AUTO_ARG
force-cargo-host-library-%:
	$(call RUN_CARGO,$*) --lib $(MOZ_CARGO_HOST_TARGET_ARGS) $(host_rust_features_flag)
else
force-cargo-host-library-%:
	$(call RUN_CARGO,$*) --lib $(filter-out --release $(MOZ_CARGO_HOST_TARGET_ARGS)) $(host_rust_features_flag)
endif

else
force-cargo-host-library-%:
	@true
endif # HOST_RUST_LIBRARY_FILE

ifdef RUST_PROGRAMS

program_features_flag := --features '$(addsuffix $(COMMA),$(RUST_PROGRAM_FEATURES))mozilla-central-workspace-hack'

force-cargo-program-build: $(call resfile,module)
	$(call BUILDSTATUS,START_Rust $(RUST_CARGO_PROGRAMS))
	$(call CARGO_BUILD) $(addprefix --bin ,$(RUST_CARGO_PROGRAMS)) $(MOZ_CARGO_TARGET_ARGS) $(program_features_flag) -- $(addprefix -C link-arg=$(CURDIR)/,$(call resfile,module)) $(CARGO_RUSTCFLAGS)
	$(call BUILDSTATUS,END_Rust $(RUST_CARGO_PROGRAMS))

$(foreach RUST_PROGRAM,$(RUST_PROGRAMS), $(eval $(call make_cargo_rule,$(RUST_PROGRAM),force-cargo-program-build,$(call resfile,module))))

ifdef MOZ_COPY_PDBS
define rust_program_pdb_rule
$(basename $(1)).pdb: $(1)
	cp $(dir $(1))$(subst -,_,$(basename $(notdir $(1)))).pdb $$@
endef

$(foreach RUST_PROGRAM,$(RUST_PROGRAMS),$(if $(findstring -,$(notdir $(RUST_PROGRAM))),$(eval $(call rust_program_pdb_rule,$(RUST_PROGRAM)))))
endif

ifndef CARGO_NO_AUTO_ARG
force-cargo-program-%:
	$(call RUN_CARGO,$*) $(addprefix --bin ,$(RUST_CARGO_PROGRAMS)) $(MOZ_CARGO_TARGET_ARGS) $(program_features_flag)
else
force-cargo-program-%:
	$(call RUN_CARGO,$*)
endif

else
force-cargo-program-%:
	@true
endif # RUST_PROGRAMS
ifdef HOST_RUST_PROGRAMS

host_program_features_flag := --features '$(addsuffix $(COMMA),$(HOST_RUST_PROGRAM_FEATURES))mozilla-central-workspace-hack'

force-cargo-host-program-build:
	$(call BUILDSTATUS,START_Rust $(HOST_RUST_CARGO_PROGRAMS))
	$(call CARGO_BUILD) $(addprefix --bin ,$(HOST_RUST_CARGO_PROGRAMS)) $(MOZ_CARGO_HOST_TARGET_ARGS) $(host_program_features_flag)
	$(call BUILDSTATUS,END_Rust $(HOST_RUST_CARGO_PROGRAMS))

$(foreach HOST_RUST_PROGRAM,$(HOST_RUST_PROGRAMS), $(eval $(call make_cargo_rule,$(HOST_RUST_PROGRAM),force-cargo-host-program-build)))

ifndef CARGO_NO_AUTO_ARG
force-cargo-host-program-%:
	$(call BUILDSTATUS,START_Rust $(HOST_RUST_CARGO_PROGRAMS))
	$(call RUN_CARGO,$*) $(addprefix --bin ,$(HOST_RUST_CARGO_PROGRAMS)) $(MOZ_CARGO_HOST_TARGET_ARGS) $(host_program_features_flag)
	$(call BUILDSTATUS,END_Rust $(HOST_RUST_CARGO_PROGRAMS))
else
force-cargo-host-program-%:
	$(call RUN_CARGO,$*) $(addprefix --bin ,$(HOST_RUST_CARGO_PROGRAMS)) $(filter-out --release $(MOZ_CARGO_TARGET_ARGS))
endif

else
force-cargo-host-program-%:
	@true

endif # HOST_RUST_PROGRAMS
