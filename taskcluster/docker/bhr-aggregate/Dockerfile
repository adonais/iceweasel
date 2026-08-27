FROM $DOCKER_IMAGE_PARENT

VOLUME /builds/worker/checkouts

RUN apt-get install python3-pip
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m pip install --break-system-packages --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt
