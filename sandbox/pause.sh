#!/bin/sh
set -eu

# Usage: cinder-pause STOP|CONT <pid file>
# Signals OpenCode and every process below it. OpenCode starts shell commands in their own
# sessions, so signalling its process group would miss them; walking the parent links
# doesn't. A process that detaches to PID 1 escapes, as with any parent-based freeze.
signal="$1"
root="$(cat "$2")"

tree() {
  members=" $root "
  grew=1
  while [ "$grew" = 1 ]; do
    grew=0
    for stat in /proc/[0-9]*/stat; do
      line="$(cat "$stat" 2> /dev/null)" || continue
      pid="${stat#/proc/}"
      pid="${pid%/stat}"
      set -- ${line##*) }
      case "$members" in
        *" $pid "*) ;;
        *" $2 "*)
          members="$members$pid "
          grew=1
          ;;
      esac
    done
  done
  echo "$members"
}

case "$signal" in
  STOP)
    kill -STOP "$root"
    signalled=""
    current="$(tree)"
    while [ "$current" != "$signalled" ]; do
      for pid in $current; do
        kill -STOP "$pid" 2> /dev/null || true
      done
      signalled="$current"
      current="$(tree)"
    done
    ;;
  CONT)
    for pid in $(tree); do
      [ "$pid" = "$root" ] || kill -CONT "$pid" 2> /dev/null || true
    done
    kill -CONT "$root"
    ;;
  *)
    echo "usage: cinder-pause STOP|CONT <pid file>" >&2
    exit 2
    ;;
esac
