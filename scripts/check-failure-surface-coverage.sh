#!/bin/bash
# Compare the declared failure-surface ledger against live reality.
#
# The ledger in src/config/failure-surfaces.ts is a statement of intent. Nothing
# stops reality from moving underneath it: a new CronJob ships, a crontab line
# is added, and the ledger silently becomes fiction. That is exactly how the
# ECOSYSTEM_MAP ended up still advertising a Grafana retired in August.
#
# So the ledger is only worth having if something checks it. This script is that
# something. It reports two kinds of drift:
#
#   UNDECLARED — exists in the cluster or on the host, absent from the ledger.
#                This is the dangerous direction: an unwatched surface nobody
#                has even written down. Exits non-zero.
#   STALE      — declared in the ledger, no longer exists. Cleanup, not danger.
#
# It also prints the surfaces whose failures currently reach nobody. That list
# is meant to be non-empty and visible rather than zero and hidden.
set -uo pipefail
cd "$(dirname "$0")/.."

RED=$'\033[0;31m'; YELLOW=$'\033[1;33m'; GREEN=$'\033[0;32m'; NC=$'\033[0m'
status=0

declared() {
  # Pull surface names of one kind straight from the TypeScript source. Parsing
  # the source keeps one copy of the ledger; a generated JSON sidecar would be
  # another thing that can silently disagree.
  grep -o "surface: '[^']*', kind: '$1'" src/config/failure-surfaces.ts | sed "s/surface: '//; s/', kind: '$1'//"
  grep -B1 "kind: '$1'" src/config/failure-surfaces.ts | grep -o "surface: '[^']*'" | sed "s/surface: '//; s/'//"
}

check() {
  local kind="$1" live="$2" label="$3"
  local dec; dec=$(declared "$kind" | sort -u)
  echo
  echo "=== ${label} ==="

  local undeclared; undeclared=$(comm -23 <(echo "$live" | sort -u | grep -v '^$') <(echo "$dec"))
  local stale;      stale=$(comm -13 <(echo "$live" | sort -u | grep -v '^$') <(echo "$dec"))

  if [ -n "$undeclared" ]; then
    echo "${RED}UNDECLARED (exists, not in ledger — unwatched and unrecorded):${NC}"
    echo "$undeclared" | sed 's/^/  - /'
    status=1
  fi
  if [ -n "$stale" ]; then
    echo "${YELLOW}STALE (in ledger, no longer exists):${NC}"
    echo "$stale" | sed 's/^/  - /'
  fi
  [ -z "$undeclared" ] && [ -z "$stale" ] && echo "${GREEN}in sync${NC} ($(echo "$dec" | grep -cv '^$') declared)"
}

check 'k8s-cronjob' \
  "$(kubectl -n statex-apps get cronjobs -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null)" \
  'Kubernetes CronJobs'

# Match the script basename each crontab line invokes; that is the stable part.
# Wrappers are plumbing, not surfaces: entries are wrapped by run-and-report.sh
# (outcome reporting) and sometimes with-deploy-lock.sh (mutex). The payload
# script is the thing that can fail, so the wrappers are filtered out.
check 'host-crontab' \
  "$(crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$' \
     | grep -oE '[a-z0-9./-]*\.sh' | awk '{print $0}' \
     | sed 's|.*/||; s/\.sh$//' \
     | grep -vE '^(with-deploy-lock|run-and-report)$' | sort -u)" \
  'Host crontab entries'

# Only ecosystem-owned timers. OS timers (apt, man-db, logrotate, sysstat,
# mdcheck, e2scrub...) are excluded deliberately: not ours to fix, and alerting
# on them adds noise without adding agency.
check 'host-systemd-timer' \
  "$(systemctl list-timers --all --no-pager 2>/dev/null | grep -oE '^[a-z-]*\.timer|[a-z-]+\.timer' \
     | sed 's/\.timer//' | sort -u \
     | grep -E '^(alfares-|statex-|gnome-gui-recover)')" \
  'Ecosystem systemd timers'

# User-scope timers are a separate systemd instance with its own bus, so they do
# not appear in `systemctl list-timers` above. They were missed entirely on the
# first pass for exactly that reason -- including vault-eso-token-renew, which
# keeps the External Secrets Operator token alive. Enumerated separately so the
# same omission cannot happen again silently.
#
# systemd-user-bus is appended by hand: it is not a timer but the reachability
# of the user bus itself, declared as a surface so a bus outage reports once
# rather than as five simultaneous timer failures.
check 'host-user-timer' \
  "$(XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}" systemctl --user list-timers --all --no-pager 2>/dev/null \
     | grep -oE '[a-z0-9-]+\.timer' | sed 's/\.timer//' | sort -u \
     | grep -E '^(statex-|vault-|ips-|next-tasks)'; \
   echo systemd-user-bus)" \
  'Ecosystem user-scope systemd timers'

echo
echo "=== Surfaces whose failures currently reach nobody ==="
# Read straight off the ledger so this cannot drift from the declaration.
# Read straight off the ledger source so this can never disagree with the
# declaration it is reporting on.
awk "
  /surface: '/ { match(\$0, /surface: '[^']*'/); s = substr(\$0, RSTART+10, RLENGTH-11) }
  /kind: '/    { match(\$0, /kind: '[^']*'/);    k = substr(\$0, RSTART+7, RLENGTH-8) }
  /owningRepo: '/ { match(\$0, /owningRepo: '[^']*'/); o = substr(\$0, RSTART+13, RLENGTH-14) }
  # Anchored so prose in the file header that mentions the value is not
  # mistaken for a declaration.
  /^ *failureDestination: 'nothing',/ { printf \"  - %s (%s, owner: %s)\n\", s, k, o; n++ }
  END { if (n == 0) print \"  none\"; else printf \"  (%d surfaces)\n\", n }
" src/config/failure-surfaces.ts

echo
[ "$status" -eq 0 ] && echo "${GREEN}No undeclared surfaces.${NC}" || echo "${RED}Undeclared surfaces found — add them to src/config/failure-surfaces.ts${NC}"
exit "$status"
