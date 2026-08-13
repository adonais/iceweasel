# Pinned focal image carrying the legacy compilers NSS must keep compiling
# with, for RHEL-floor coverage: gcc-8 (RHEL 8), gcc-11 (RHEL 9) and an old
# clang (clang-10). None of these are available on noble, so this image stays on
# focal. These are compile-only build jobs (the extra-compiler builds are not
# run as tests), so the older glibc here never reaches a test runner.
FROM ubuntu:focal

VOLUME /builds/worker/checkouts
VOLUME /builds/worker/workspace
VOLUME /builds/worker/.cache

# %include-run-task

ENV DEBIAN_FRONTEND noninteractive
RUN dpkg --add-architecture i386 \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    clang-10 \
    clang-format-10 \
    curl \
    g++-multilib \
    g++-8-multilib \
    git \
    gyp \
    lib32z1-dev \
    libssl-dev \
    libssl-dev:i386 \
    libxml2-utils \
    linux-libc-dev:i386 \
    llvm-dev \
    locales \
    mercurial \
    ninja-build \
    pkg-config \
    python3 \
    software-properties-common \
    sqlite3 \
    zlib1g-dev \
 && add-apt-repository ppa:ubuntu-toolchain-r/test -y \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
    g++-11-multilib \
 && rm -rf /var/lib/apt/lists/* \
 && apt-get autoremove -y && apt-get clean -y

RUN update-alternatives --install /usr/bin/clang-format \
    clang-format $(which clang-format-10) 10

ENV SHELL /bin/bash
ENV USER worker
ENV LOGNAME $USER
ENV HOME /builds/worker
ENV LANG en_US.UTF-8
ENV LC_ALL $LANG
ENV HOST localhost
ENV DOMSUF localdomain

RUN locale-gen $LANG \
 && dpkg-reconfigure locales

RUN useradd -d $HOME -s $SHELL -m $USER && \
    mkdir -p /builds/worker/workspace && \
    mkdir -p /builds/worker/artifacts && \
    chown -R $USER /builds/worker
WORKDIR $HOME

# Set a default command for debugging.
CMD ["/bin/bash", "--login"]
