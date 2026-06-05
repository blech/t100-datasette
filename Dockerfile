#syntax=docker/dockerfile:1

FROM python:3.14-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_NO_DEV=1

COPY . /src
WORKDIR /src

RUN uv sync --locked

CMD ["uv", "run", "datasette", "--host", "0.0.0.0", "--port", "8808", "-c", "datasette.yml", "--template-dir", "templates", "--plugins-dir", "plugins", "/mnt/db/t100.db"]
