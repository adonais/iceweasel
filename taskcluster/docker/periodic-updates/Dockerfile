FROM $DOCKER_IMAGE_PARENT
MAINTAINER Julien Cristau <jcristau@mozilla.com>

COPY --from=docker.io/astral/uv:0.13.4 /uv /uvx /bin/

ENV PATH ${PATH}:${HOME}/.local/bin

ADD setup.sh /setup/setup.sh

RUN cd /setup && ./setup.sh

COPY runme.sh /
COPY scripts/* /home/worker/scripts/

CMD ["/runme.sh"]
