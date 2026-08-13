# This docker image is used to build python wheels.
FROM          $DOCKER_IMAGE_PARENT
MAINTAINER    Alexandre Lissy <alissy@mozilla.com>

# We need to declare all potentially cache volumes as caches. Also,
# making high I/O paths volumes increase I/O throughput because of
# AUFS slowness.
VOLUME  /builds/worker/checkouts
VOLUME  /builds/worker/workspace

RUN apt-get update && apt-get install -y build-essential \
                    libcairo2-dev \
                    libdbus-1-dev \
                    libglib2.0-dev \
                    patchelf \
                    python3-dev \
                    python3-pip

RUN if apt-cache show libgirepository-2.0-dev 2>&1 1>/dev/null; \
                    then apt-get install -y libgirepository-2.0-dev; \
                    else apt-get install -y libgirepository1.0-dev; \
                    fi


CMD ["/bin/bash", "--login"]
