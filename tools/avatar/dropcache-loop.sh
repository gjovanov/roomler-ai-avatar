#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 G ROX EOOD
#
# Drops the WSL VM's page cache every 30 s while clips render (tools/podcast/chain.ts starts it as root and stops it
# at the end; it also ends by itself after $1 seconds, 12 h by default). Why (2026-10-27): with other builds keeping
# the VM busy, autoMemoryReclaim=gradual never handed the VM's page cache back to Windows; the VM sat on 25 GB of
# it, the host had 2.5 GB available with nothing rendering, and loading the model (read through that same cache, so
# briefly held twice) tripped the renders' memory guard on most clips. Dropping clean pages only costs the builds
# some re-reads.
#   (as root) dropcache-loop.sh [seconds]
end=$((SECONDS + ${1:-43200}))
while [ "$SECONDS" -lt "$end" ]; do
  sync
  echo 1 > /proc/sys/vm/drop_caches
  sleep 30
done
