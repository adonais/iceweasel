ARG BASE_IMAGE
FROM $BASE_IMAGE

CMD ["/bin/bash", "--login"]

RUN zypper refresh && zypper install -y \
      ca-certificates \
    && zypper clean --all
