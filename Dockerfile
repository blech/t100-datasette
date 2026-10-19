#syntax=docker/dockerfile:1

FROM python:3.14-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# No dev dependencies, and never re-sync at start-up
ENV UV_NO_DEV=1 UV_NO_SYNC=1
# serve_public.sh reads these; the database lives on the Fly volume
ENV HOST=0.0.0.0 PORT=8808 DB=/mnt/db/t100.db

WORKDIR /src
COPY pyproject.toml uv.lock ./
RUN uv sync --locked
COPY datasette.yml serve_public.sh schema.sql ./
COPY plugins plugins
COPY templates templates
COPY static static

CMD ["./serve_public.sh"]
