import asyncio
import re
import stat
from datetime import datetime, timezone

import pytest

from plugins.t100_usage import DailySalt, classify, log_kind, referrer_host, route_pattern, visit_line, visit_token
from tests.helpers import add_segments, make_datasette
from tests.test_routes_by_year import seg

FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0"


def test_route_pattern_keeps_the_path_but_not_the_year():
    assert route_pattern("/") == "/"
    assert route_pattern("/about") == "/about"
    assert route_pattern("/airports/SFO/LAX/2019") == "/airports/SFO/LAX/{year}"
    assert route_pattern("/airports/SFO") == "/airports/SFO"


def test_route_pattern_cannot_break_a_log_line():
    assert "\t" not in route_pattern("/a\tb") and "\n" not in route_pattern("/a\nb\r")
    assert len(route_pattern("/" + "x" * 500)) <= 120


@pytest.mark.parametrize("header,own,expected", [
    ("https://news.ycombinator.com/item?id=1", "t100.husk.org", "news.ycombinator.com"),
    ("https://Example.COM:8080/x?y=1", "t100.husk.org", "example.com"),
    ("https://user:pw@example.org/", "t100.husk.org", "example.org"),
    ("https://t100.husk.org/airports/SFO", "t100.husk.org", ""),
    ("https://t100.husk.org:443/", "t100.husk.org:443", ""),
    (None, "t100.husk.org", ""),
    ("", "t100.husk.org", ""),
    ("not a url", "t100.husk.org", ""),
])
def test_referrer_host_is_the_host_only(header, own, expected):
    assert referrer_host(header, own) == expected


@pytest.mark.parametrize("ua,kind", [
    (FIREFOX, "human"),
    ("Googlebot/2.1 (+http://www.google.com/bot.html)", "bot"),
    ("curl/8.4.0", "bot"),
    ("python-requests/2.31", "bot"),
    ("Scrapy/2.11", "bot"),
    ("", "bot"),
    (None, "bot"),
])
def test_classify_flags_robots_by_user_agent(ua, kind):
    assert classify(ua) == kind


def test_the_visitor_token_depends_on_everything_and_hides_the_address():
    t = visit_token("salt", "203.0.113.9", FIREFOX)
    assert re.fullmatch(r"[0-9a-f]{12}", t)
    assert t == visit_token("salt", "203.0.113.9", FIREFOX)
    assert t != visit_token("other", "203.0.113.9", FIREFOX)
    assert t != visit_token("salt", "203.0.113.10", FIREFOX)
    assert t != visit_token("salt", "203.0.113.9", "curl/8")
    assert "203" not in t


class Clock:
    def __init__(self, day):
        self.now = datetime(2026, 10, day, 12, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.now


def test_the_salt_is_reused_within_a_day_and_replaced_the_next(tmp_path):
    clock = Clock(24)
    salt = DailySalt(tmp_path / "usage", clock)
    first = salt.get()
    assert first == DailySalt(tmp_path / "usage", clock).get()  # survives a restart
    clock.now = datetime(2026, 10, 24, 23, 59, tzinfo=timezone.utc)
    assert salt.get() == first
    clock.now = datetime(2026, 10, 25, 0, 1, tzinfo=timezone.utc)
    second = salt.get()
    assert second != first and len(second) >= 32


def test_yesterdays_salt_is_gone_and_the_file_is_private(tmp_path):
    clock = Clock(24)
    salt = DailySalt(tmp_path, clock)
    old = salt.get()
    clock.now = datetime(2026, 10, 25, 1, 0, tzinfo=timezone.utc)
    salt.get()
    files = [p for p in tmp_path.iterdir() if not p.name.startswith("visits-")]
    assert files and all(old not in p.read_text() for p in files)
    assert all(stat.S_IMODE(p.stat().st_mode) == 0o600 for p in files)


def test_the_log_line_is_tab_separated_in_utc():
    line = visit_line(datetime(2026, 10, 24, 12, 30, 5, tzinfo=timezone.utc), "abc123def456", "/airports/SFO", 200, "x.org", "human")
    assert line == "2026-10-24T12:30:05Z\tabc123def456\t/airports/SFO\t200\tx.org\thuman\n"


@pytest.mark.parametrize("path,status,ctype,ua,kind", [
    ("/", 200, "text/html; charset=utf-8", FIREFOX, "human"),
    ("/airports/SFO/LAX/2019", 200, "text/html; charset=utf-8", FIREFOX, "human"),
    ("/airports/SFO", 200, "text/html; charset=utf-8", "Googlebot/2.1", "bot"),
    ("/airports/SFO", 301, "text/html", FIREFOX, None),
    ("/nonsense", 404, "text/html; charset=utf-8", FIREFOX, None),
    ("/static/charts/routepage.js", 200, "text/javascript", FIREFOX, None),
    ("/t100/routes_by_year.json", 200, "application/json", FIREFOX, None),
    ("/t100/t100_international", 200, "text/html; charset=utf-8", FIREFOX, "other"),
    ("/t100/t100_international", 403, "text/plain; charset=utf-8", "python-requests/2.31", "other"),
    ("/t100/routes_by_year.json", 400, "application/json", FIREFOX, "other"),
    ("/-/api", 200, "text/html; charset=utf-8", FIREFOX, "other"),
    ("/airports/SFO.json", 200, "application/json", FIREFOX, None),
])
def test_which_requests_are_logged_and_as_what(path, status, ctype, ua, kind):
    assert log_kind(path, status, ctype, ua) == kind


# ---- the middleware, through the real app ----

def fetch(ds, path, headers=None):
    async def go():
        await ds.invoke_startup()
        return await ds.client.get(path, headers=headers or {})

    return asyncio.run(go())


@pytest.fixture
def site(db_path):
    add_segments(db_path, "t100_international", [seg("ATL", "LHR", 2019, 12, 2000)])
    return db_path


def lines(directory):
    out = []
    for p in sorted(directory.glob("visits-*.log")):
        out += p.read_text().splitlines()
    return out


def test_nothing_is_written_unless_the_log_directory_is_configured(site, tmp_path, monkeypatch):
    monkeypatch.delenv("T100_USAGE_LOG", raising=False)
    here = tmp_path / "cwd"
    here.mkdir()
    monkeypatch.chdir(here)
    assert fetch(make_datasette(site), "/airports/ATL").status_code == 200
    assert list(here.iterdir()) == []


def test_a_page_view_is_logged_without_the_address_or_the_query(site, tmp_path, monkeypatch):
    log = tmp_path / "usage"
    monkeypatch.setenv("T100_USAGE_LOG", str(log))
    headers = {"fly-client-ip": "203.0.113.9", "user-agent": FIREFOX, "referer": "https://news.ycombinator.com/item?id=1"}
    assert fetch(make_datasette(site), "/airports/ATL?theme=night&year=2019", headers).status_code == 200
    (line,) = lines(log)
    time, token, route, status, referrer, kind = line.split("\t")
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", time)
    assert (route, status, referrer, kind) == ("/airports/ATL", "200", "news.ycombinator.com", "human")
    assert re.fullmatch(r"[0-9a-f]{12}", token)
    everything = "".join(p.read_text() for p in log.iterdir())
    for secret in ("203.0.113.9", "theme=night", "year=2019", "Firefox", "Mozilla"):
        assert secret not in everything, secret
    assert re.fullmatch(r"visits-\d{4}-\d\d\.log", next(log.glob("visits-*")).name)


def test_the_same_visitor_gets_the_same_token_and_another_does_not(site, tmp_path, monkeypatch):
    log = tmp_path / "usage"
    monkeypatch.setenv("T100_USAGE_LOG", str(log))
    ds = make_datasette(site)
    a = {"fly-client-ip": "203.0.113.9", "user-agent": FIREFOX}
    fetch(ds, "/airports/ATL", a)
    fetch(ds, "/about", a)
    fetch(ds, "/about", {**a, "fly-client-ip": "198.51.100.7"})
    tokens = [line.split("\t")[1] for line in lines(log)]
    assert tokens[0] == tokens[1] != tokens[2]


def test_assets_and_chart_data_are_not_logged_but_crawler_noise_is_tagged(site, tmp_path, monkeypatch):
    log = tmp_path / "usage"
    monkeypatch.setenv("T100_USAGE_LOG", str(log))
    ds = make_datasette(site)
    bot = {"user-agent": "python-requests/2.31"}
    fetch(ds, "/static/nav/main.js")
    fetch(ds, "/t100/routes_by_year.json?origin=ATL&_shape=objects")
    fetch(ds, "/t100/t100_international?_next=5", bot)
    fetch(ds, "/airports/ATL", bot)
    got = [line.split("\t") for line in lines(log)]
    assert [(g[2], g[3], g[5]) for g in got] == [("/t100/t100_international", "403", "other"), ("/airports/ATL", "200", "bot")]


def test_a_log_that_cannot_be_written_never_breaks_the_page(site, tmp_path, monkeypatch):
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("in the way")
    monkeypatch.setenv("T100_USAGE_LOG", str(blocker / "usage"))
    assert fetch(make_datasette(site), "/airports/ATL", {"user-agent": FIREFOX}).status_code == 200
