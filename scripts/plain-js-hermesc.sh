#!/bin/sh
# POSIX entry point for plain-js-hermesc.js - see there.
exec node "$(dirname "$0")/plain-js-hermesc.js" "$@"
