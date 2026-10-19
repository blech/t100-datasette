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

check 200 /                                                         "usa-map"
check 200 /airports                                                 "Busiest"
check 200 /airports/globe                                           "data-origin"
check 200 /airports/SFO                                             "heatmap"
check 200 /airports/SFO/globe                                       "data-origin"
check 200 /airports/SFO/LHR/2019                                    "route-chart"
check 200 /about                                                   "Known gaps"
check 200 /aircraft                                                "heat-kind"
check 200 /aircraft/engines                                         "engine-chart"
check 200 /aircraft/boeing-737                                      "family-chart"
check 404 /aircraft/no-such-plane
check 200 /airlines                                                 "heat-kind"
check 200 /airlines/delta                                          "size-chart"
check 200 /airlines/delta/globe                                    'id="globe"'
check 404 /airlines/no-such-airline
check 301 /carriers
check 301 /carriers/delta
check 301 /routes/SFO
check 301 /globe
check 301 /globe/SFO
check 301 "/?year=2019"
check 301 /route/SFO/LHR/2019
check 200 "/t100/airports.json?_shape=objects"                  '"Raleigh/Durham, NC"'
check 200 "/t100/top_airports.json?year=2025&_shape=objects"        '"ATL"'
check 200 "/t100/routes_by_year.json?origin=SFO&_shape=objects"     '"LAX"'
check 200 "/t100/route.json?origin=SFO&dest=LHR&_shape=objects"     '"carrier"'
check 200 "/t100/family_by_year.json?_shape=objects"                '"Boeing 737"'
check 200 "/t100/carrier_group_by_year.json?_shape=objects"         '"Delta (incl. Northwest)"'
check 200 "/t100/engines_by_year.json?_shape=objects"               '"distance_band"'
check 200 "/t100/carrier_concentration.json?_shape=objects"         '"top4"'
check 200 "/t100/busiest_airports.json?year=2025&_shape=objects"    '"ATL"'
check 200 "/t100/family_detail.json?family=Boeing+737&_shape=objects" '"737 NG"'
check 404 /airports/SFO/LH
check 200 "/t100/airline_list.json?_shape=objects"                  '"Delta (incl. Northwest)"'
check 200 "/t100/carrier_route_counts.json?group=delta&airline=&min=12&_shape=objects" '"pairs"'
check 403 "/t100/-/query.json?sql=select+1"
check 403 /t100.db

exit $failed
