FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    asterisk \
    asterisk-core-sounds-en \
    php8.1-cli \
    php8.1-pgsql \
    php8.1-curl \
    && rm -rf /var/lib/apt/lists/*

# Copy AGI scripts (phpagi.php is bundled in agi/ directory)
COPY agi/ /usr/share/asterisk/agi-bin/
RUN chmod +x /usr/share/asterisk/agi-bin/*.php

# Copy config files
COPY extensions.conf /etc/asterisk/extensions.conf
COPY sip.conf        /etc/asterisk/sip.conf
COPY queues.conf     /etc/asterisk/queues.conf
COPY manager.conf    /etc/asterisk/manager.conf
COPY rtp.conf        /etc/asterisk/rtp.conf

# Custom hold music directory
RUN mkdir -p /var/lib/asterisk/sounds/custom

EXPOSE 5060/udp 5060/tcp 5038 10000-20000/udp

CMD ["asterisk", "-f", "-vvv"]
