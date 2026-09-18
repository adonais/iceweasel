FROM $DOCKER_IMAGE_PARENT

# Required software
ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update -q && \
    apt-get install -yyq --no-install-recommends \
    bzip2 \
    ca-certificates \
    curl \
    gcc \
    jq \
    libdpkg-perl \
    libgetopt-simple-perl \
    liblzma-dev \
    locales \
    python3 \
    libpython3-dev \
    python3-dev \
    python3-pip \
    xz-utils
COPY requirements.txt /

RUN locale-gen en_CA.UTF-8
ENV LANG en_CA.UTF-8
ENV LANGUAGE en_CA.UTF-8
ENV LANG_ALL en_CA.UTF-8
ENV LC_ALL en_CA.UTF-8

RUN ["pip", "install", "-r", "/requirements.txt"]

# scripts
COPY --chown=worker:worker scripts/* /builds/worker/bin/

COPY runme.sh /runme.sh
RUN chmod 755 /builds/worker/bin/* /*.sh
COPY --chown=worker:worker *.pubkey /builds/worker/keys/

USER worker

CMD ["/runme.sh"]
