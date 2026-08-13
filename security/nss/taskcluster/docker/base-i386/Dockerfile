# i386 multilib layer on top of the architecture-neutral base image, for the
# x86 builders and tests that cross-compile and run 32-bit (ia32) binaries.
FROM $DOCKER_IMAGE_PARENT

ENV DEBIAN_FRONTEND noninteractive
RUN dpkg --add-architecture i386 \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
    g++-multilib \
    lib32z1-dev \
    linux-libc-dev:i386 \
 && rm -rf /var/lib/apt/lists/* \
 && apt-get autoremove -y && apt-get clean -y

# Set a default command for debugging.
CMD ["/bin/bash", "--login"]
