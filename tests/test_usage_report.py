from datetime import date

from scripts.usage_report import main, parse_line, prune, render, summarise

LOG = """\
2026-10-24T09:00:00Z\taaa\t/\t200\tnews.ycombinator.com\thuman
2026-10-24T09:01:00Z\taaa\t/airports/SFO\t200\t\thuman
2026-10-24T10:00:00Z\tbbb\t/airports/SFO\t200\texample.org\thuman
2026-10-24T11:00:00Z\tccc\t/airports/SFO/LAX/{year}\t200\t\tbot
2026-10-24T11:05:00Z\tddd\t/t100/t100_international\t403\t\tother
2026-10-25T08:00:00Z\taaa\t/about\t200\tnews.ycombinator.com\thuman
this line is damaged
2026-10-25T08:00:00Z\tbbb
"""


def records(text=LOG):
    return [r for r in map(parse_line, text.splitlines()) if r]


def test_parse_line_reads_good_lines_and_skips_damaged_ones():
    r = parse_line("2026-10-24T09:00:00Z\taaa\t/\t200\tx.org\thuman")
    assert r == {"day": "2026-10-24", "token": "aaa", "route": "/", "status": 200, "referrer": "x.org", "kind": "human"}
    assert parse_line("this line is damaged") is None
    assert parse_line("2026-10-25T08:00:00Z\tbbb") is None
    assert parse_line("2026-10-24T09:00:00Z\taaa\t/\tnot-a-number\t\thuman") is None


def test_summarise_counts_people_not_requests_per_day():
    s = summarise(records())
    assert s["days"]["2026-10-24"] == {"views": 3, "visitors": 2, "bots": 1, "other": 1}
    assert s["days"]["2026-10-25"] == {"views": 1, "visitors": 1, "bots": 0, "other": 0}


def test_summarise_ranks_routes_and_referrers_for_humans_only():
    s = summarise(records())
    assert s["routes"][0] == ("/airports/SFO", 2)
    assert ("/airports/SFO/LAX/{year}", 1) not in s["routes"]
    assert s["referrers"][0] == ("news.ycombinator.com", 2)
    assert ("", 1) not in s["referrers"]


def test_render_shows_each_day_and_the_split():
    text = render(summarise(records()))
    assert "2026-10-24" in text and "2026-10-25" in text
    assert "/airports/SFO" in text and "news.ycombinator.com" in text
    assert "bots" in text.lower()


def test_an_empty_log_renders_without_error():
    assert "no" in render(summarise([])).lower()


def test_prune_removes_only_old_visit_files(tmp_path):
    for name in ["visits-2025-01.log", "visits-2025-09.log", "visits-2025-10.log", "visits-2026-10.log", "salt", "notes.txt"]:
        (tmp_path / name).write_text("x")
    removed = prune(tmp_path, keep_months=12, today=date(2026, 10, 24))
    assert sorted(removed) == ["visits-2025-01.log", "visits-2025-09.log"]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["notes.txt", "salt", "visits-2025-10.log", "visits-2026-10.log"]


def test_main_reads_a_directory_and_filters_by_month(tmp_path, capsys):
    (tmp_path / "visits-2026-10.log").write_text(LOG)
    (tmp_path / "visits-2026-09.log").write_text("2026-09-30T09:00:00Z\tzzz\t/old\t200\t\thuman\n")
    assert main([str(tmp_path), "--month", "2026-10"]) == 0
    out = capsys.readouterr().out
    assert "/airports/SFO" in out and "/old" not in out
    assert main([str(tmp_path)]) == 0
    assert "/old" in capsys.readouterr().out


def test_main_fails_clearly_for_a_missing_directory(tmp_path, capsys):
    assert main([str(tmp_path / "nope")]) == 1
    assert "nope" in capsys.readouterr().err
