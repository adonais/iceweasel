# aarch64 counterpart of docker/builds. Carries the extras consumed by the
# aarch64 test matrix: golang for the bogo tests, and clang + the sanitizer
# runtime for the ASan build. The parent (base-aarch64 == base) is noble, whose
# clang is modern enough for the ARMv8 crypto intrinsics under ASan, so no
# external clang repo is needed.
FROM $DOCKER_IMAGE_PARENT

VOLUME /builds/worker/checkouts
VOLUME /builds/worker/workspace
VOLUME /builds/worker/.cache

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    clang \
    libclang-rt-18-dev \
    cmake \
    libelf-dev \
    libdw-dev \
    libssl-dev \
    valgrind \
 && rm -rf /var/lib/apt/lists/* \
 && apt-get autoremove -y && apt-get clean -y

# Install golang for bogo tests (arm64 build).
RUN curl https://dl.google.com/go/go1.23.1.linux-arm64.tar.gz -sLf | tar xzf - -C $HOME
ENV PATH "$PATH:$HOME/go/bin"

# Set a default command for debugging.
CMD ["/bin/bash", "--login"]
