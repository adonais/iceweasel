# Minimal image with clang-format.
#
FROM debian:trixie-20260803-slim
LABEL maintainer="John Schanck <jschanck@mozilla.com>"

VOLUME /builds/worker/checkouts

# %include-run-task

# Track the clang version used by Firefox
# Check https://searchfox.org/firefox-main/source/taskcluster/kinds/toolchain/clang.yml
#   Find $config where $config.run.toolchain-alias.by-project.default == linux64-clang
#   Get specific tags from .../taskcluster/kinds/fetch/toolchains.yml
# Note: This won't get exact patch levels, but that's OK for code formatting.
# Keep in sync with expected_version in ../../../automation/clang-format/run_clang_format.sh.
ARG CLANG_VERSION=22

RUN export DEBIAN_FRONTEND=noninteractive \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      git \
      locales \
      mercurial \
 && rm -rf /var/lib/apt/lists/* \
 && apt-get autoremove -y && apt-get clean -y

COPY apt.llvm.org.asc /etc/apt/trusted.gpg.d/
COPY llvm.sources /etc/apt/sources.list.d/
RUN export DEBIAN_FRONTEND=noninteractive \
 && apt-get update \
 && apt-get install -y --no-install-recommends clang-format-$CLANG_VERSION \
 && rm -rf /var/lib/apt/lists/* \
 && apt-get autoremove -y && apt-get clean -y \
 && update-alternatives --install /usr/bin/clang-format \
      clang-format $(which clang-format-$CLANG_VERSION) $CLANG_VERSION

ENV \
  SHELL=/bin/bash \
  USER=worker \
  LOGNAME=$USER \
  HOME=/home/$USER \
  LANG=en_US.UTF-8 \
  LC_ALL=$LANG \
  HOST=localhost \
  DOMSUF=localdomain

RUN locale-gen $LANG \
 && DEBIAN_FRONTEND=noninteractive dpkg-reconfigure locales \
 && useradd -d $HOME -s $SHELL -m $USER
WORKDIR $HOME

RUN chown -R $USER: $HOME

# Note: no USER directive. In CI, run-task needs to start as root; `mach
# clang-format` passes `--user worker` instead.

# Set a default command for debugging.
CMD ["/bin/bash", "--login"]
