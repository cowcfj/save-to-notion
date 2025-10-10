#!/usr/bin/env bash
# no-op deepsource poll shim
# This script used to poll DeepSource; it's been replaced with a disabled workflow
# to avoid CI timeouts. Keep a harmless shim so any remaining callers succeed quickly.

echo "[deepsource-poll] disabled: deepsource polling has been turned off in CI."
exit 0
# Optional environment variables:
