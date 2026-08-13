ARG BASE_IMAGE
FROM $BASE_IMAGE

CMD ["/bin/bash", "--login"]

RUN dnf install -y \
      ca-certificates \
    && dnf clean all
