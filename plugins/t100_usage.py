# plugins/t100_usage.py
"""Anonymous usage statistics: one line per page view in a log file, with no address, query string or User-Agent.

A visitor is a token, the start of a hash of (today's random salt, client address, User-Agent). The salt lives in a file,
is replaced at the start of each UTC day, and the old one is not kept, so a token can't be reversed by trying addresses
and doesn't link a visitor from one day to the next. Off unless T100_USAGE_LOG names a directory (see docs/usage-stats.md)."""
import hashlib
import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from datasette import hookimpl

BOTS = re.compile(
    r"bot|crawl|spider|slurp|scrap|curl|wget|python|httpx|aiohttp|go-http|java/|headless|preview|facebookexternalhit|whatsapp|monitor|uptime",
    re.I,
)
ROUTE_LENGTH = 120


def route_pattern(path):
    """The path with any year replaced, and nothing that could break a tab-separated line."""
    path = "/".join("{year}" if re.fullmatch(r"\d{4}", part) else part for part in path.split("/"))
    return re.sub(r"[^\x20-\x7e]", "?", path)[:ROUTE_LENGTH]


def referrer_host(header, own_host):
    """The referring site's host, or nothing if there is none, it is unreadable or it is this site."""
    try:
        host = urlsplit(header or "").hostname or ""
    except ValueError:
        return ""
    return "" if host == (own_host or "").split(":")[0].lower() else host


def classify(user_agent):
    return "bot" if not user_agent or BOTS.search(user_agent) else "human"


def visit_token(salt, ip, user_agent):
    return hashlib.sha256(f"{salt}\0{ip}\0{user_agent}".encode()).hexdigest()[:12]


def visit_line(when, token, route, status, referrer, kind):
    return f"{when:%Y-%m-%dT%H:%M:%SZ}\t{token}\t{route}\t{status}\t{referrer}\t{kind}\n"


def log_kind(path, status, content_type, user_agent):
    """What to log a response as: human or bot for an HTML page, other for the data pages (where crawlers go), else nothing."""
    if path.startswith("/static/"):
        return None
    html = (content_type or "").startswith("text/html")
    if path.startswith(("/t100/", "/-/")) or path in ("/t100", "/-"):
        return "other" if status >= 400 or html else None
    return classify(user_agent) if status == 200 and html else None


def _utc_now():
    return datetime.now(timezone.utc)


class DailySalt:
    """Today's random salt, kept in a private file in the log directory and replaced when the UTC date changes."""

    def __init__(self, directory, clock=_utc_now):
        self.path = Path(directory) / "salt"
        self.clock = clock
        self._cached = ("", "")

    def get(self):
        today = self.clock().date().isoformat()
        if self._cached[0] == today:
            return self._cached[1]
        try:
            day, salt = self.path.read_text().split("\n")[:2]
            if day != today or not salt:
                raise ValueError
        except (OSError, ValueError):
            salt = secrets.token_hex(16)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_name("salt.tmp")
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(f"{today}\n{salt}\n")
            os.replace(tmp, self.path)
        self._cached = (today, salt)
        return salt


def _append(directory, when, line):
    fd = os.open(Path(directory) / f"visits-{when:%Y-%m}.log", os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    with os.fdopen(fd, "ab") as f:
        f.write(line.encode())


def record(directory, salt, scope, status, content_type, now=None):
    headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
    user_agent = headers.get("user-agent", "")
    kind = log_kind(scope["path"], status, content_type, user_agent)
    if kind is None:
        return
    now = now or _utc_now()
    ip = headers.get("fly-client-ip") or (scope.get("client") or [""])[0]
    line = visit_line(
        now,
        visit_token(salt.get(), ip, user_agent),
        route_pattern(scope["path"]),
        status,
        referrer_host(headers.get("referer"), headers.get("host", "")),
        kind,
    )
    _append(directory, now, line)


# last, so it is the outermost wrapper and sees the other plugins' refusals too
@hookimpl(trylast=True)
def asgi_wrapper(datasette):
    directory = os.environ.get("T100_USAGE_LOG")
    if not directory:
        return None
    salt = DailySalt(directory)

    def wrap(app):
        async def usage(scope, receive, send):
            if scope["type"] != "http":
                await app(scope, receive, send)
                return
            seen = {}

            async def capture(message):
                if message["type"] == "http.response.start":
                    seen["status"] = message["status"]
                    seen["type"] = next((v.decode("latin-1") for k, v in message.get("headers", []) if k.lower() == b"content-type"), "")
                await send(message)

            await app(scope, receive, capture)
            try:
                if "status" in seen:
                    record(directory, salt, scope, seen["status"], seen["type"])
            except Exception:
                pass  # logging must never break a page

        return usage

    return wrap
