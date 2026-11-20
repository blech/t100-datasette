#!/bin/sh
# Locked-down public server: read-only database, no arbitrary SQL, no downloads, cached responses.
# Run from the repo root. DB defaults to t100.db, PORT to 8808; set HOST=0.0.0.0 inside a container.
# The European airports' database (t_avia.db, built by build_t_avia.py) is served too when it sits beside DB, or where
# EUROPE_DB says; without it the /airports/europe pages answer 404 and the rest of the site is unchanged.
DB="${DB:-t100.db}"
EUROPE_DB="${EUROPE_DB:-$(dirname "$DB")/t_avia.db}"
set -- --immutable "$DB"
if [ -f "$EUROPE_DB" ]; then
  set -- "$@" --immutable "$EUROPE_DB"
fi
exec uv run datasette serve "$@" \
  --config datasette.yml \
  --plugins-dir plugins \
  --template-dir templates \
  --static static:static \
  --setting default_allow_sql off \
  --setting allow_download off \
  --setting allow_csv_stream off \
  --setting default_cache_ttl 86400 \
  --host "${HOST:-127.0.0.1}" --port "${PORT:-8808}"
