#!/bin/sh
# Check that a deployed copy of the site is up and locked down. Usage: scripts/smoke_check.sh [base-url]
# Retries the first request for a while, because a stopped Fly machine takes a few seconds to wake.
BASE="${1:-https://blech-datasette-t100.fly.dev}"
failed=0

check() {  # check <expected status> <path> [text the body must contain]
  status=$(curl -s -o /tmp/smoke_body -w "%{http_code}" --retry 8 --retry-delay 5 --retry-all-errors --max-time 30 "$BASE$2")
  if [ "$status" != "$1" ]; then
    echo "FAIL $2: expected $1, got $status"; failed=1; return
  fi
  if [ -n "$3" ] && ! grep -q "$3" /tmp/smoke_body; then
    echo "FAIL $2: body does not contain $3"; failed=1; return
  fi
  echo "ok   $2 ($1)"
}

check 200 /                                                         "airports"
check 200 /globe                                                    "data-origin"
check 200 /routes/SFO                                               "heatmap"
check 200 /route/SFO/LHR/2019                                       "route-chart"
check 200 "/t100/airports.json?_shape=objects"                  '"Raleigh/Durham, NC"'
check 200 "/t100/top_airports.json?year=2025&_shape=objects"        '"ATL"'
check 200 "/t100/routes_by_year.json?origin=SFO&_shape=objects"     '"LAX"'
check 200 "/t100/route.json?origin=SFO&dest=LHR&_shape=objects"     '"carrier"'
check 404 /route/SFO/LH
check 403 "/t100/-/query.json?sql=select+1"
check 403 /t100.db

exit $failed
