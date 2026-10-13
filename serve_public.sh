#!/bin/sh
# Locked-down public server: read-only database, no arbitrary SQL, no downloads, cached responses.
# Run from the repo root. DB defaults to t100.db, PORT to 8808; set HOST=0.0.0.0 inside a container.
exec uv run datasette serve \
  --immutable "${DB:-t100.db}" \
  --config datasette.yml \
  --plugins-dir plugins \
  --template-dir templates \
  --static static:static \
  --setting default_allow_sql off \
  --setting allow_download off \
  --setting allow_csv_stream off \
  --setting default_cache_ttl 86400 \
  --host "${HOST:-127.0.0.1}" --port "${PORT:-8808}"
