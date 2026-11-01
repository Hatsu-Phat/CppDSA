#!/bin/sh
set -e
chmod 755 /dev/shm 2>/dev/null || true
chmod 755 /tmp 2>/dev/null || true
chmod 755 /var/tmp 2>/dev/null || true
exec dumb-init -- "$@"
