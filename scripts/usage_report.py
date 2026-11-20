#!/usr/bin/env python3
"""Summarise the anonymous visit logs written by plugins/t100_usage.py. Standard library only, so it also runs on the Fly
machine:  python3 usage_report.py /mnt/db/usage [--month 2026-10] [--prune 12]"""
import argparse
import re
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

LOG_NAME = re.compile(r"^visits-(\d{4})-(\d\d)\.log$")
TOP = 15
SLOW_MS = 5000  # a request counted as slow, in the total of them
MIN_TIMED = 3  # timed requests a page needs before it is ranked, so one odd request doesn't rank a page


def parse_line(line):
    parts = line.rstrip("\n").split("\t")
    # six fields, or seven with the milliseconds to the first byte (lines written before that was recorded have six)
    if len(parts) not in (6, 7) or not re.fullmatch(r"\d{4}-\d\d-\d\dT[\d:]{8}Z", parts[0]) or not parts[3].isdigit():
        return None
    if len(parts) == 7 and not parts[6].isdigit():
        return None
    when, token, route, status, referrer, kind = parts[:6]
    return {"day": when[:10], "token": token, "route": route, "status": int(status), "referrer": referrer, "kind": kind,
            "ms": int(parts[6]) if len(parts) == 7 else None}


def _ranked(counter):
    return sorted(counter.items(), key=lambda item: (-item[1], item[0]))


def summarise(records):
    days, tokens, routes, referrers = {}, {}, Counter(), Counter()
    timings = defaultdict(list)
    for r in records:
        if r["ms"] is not None:
            timings[r["route"]].append(r["ms"])
        day = days.setdefault(r["day"], {"views": 0, "visitors": 0, "bots": 0, "other": 0})
        if r["kind"] == "human":
            day["views"] += 1
            tokens.setdefault(r["day"], set()).add(r["token"])
            routes[r["route"]] += 1
            if r["referrer"]:
                referrers[r["referrer"]] += 1
        elif r["kind"] == "bot":
            day["bots"] += 1
        else:
            day["other"] += 1
    for d, seen in tokens.items():
        days[d]["visitors"] = len(seen)
    return {"days": dict(sorted(days.items())), "routes": _ranked(routes), "referrers": _ranked(referrers), "slow": _slowest(timings)}


def _slowest(timings):
    """(route, requests, median, 90th percentile, slowest, over SLOW_MS) in ms for each page with MIN_TIMED or more timed requests,
    the slowest 90th percentile first. Medians show what a page usually costs, the 90th percentile and slowest what a cold cache or
    a heavy query costs the unlucky visitor."""
    rows = []
    for route, ms in timings.items():
        if len(ms) >= MIN_TIMED:
            ordered = sorted(ms)
            p90 = ordered[max(0, -(-9 * len(ordered) // 10) - 1)]  # nearest rank
            rows.append((route, len(ordered), round(statistics.median(ordered)), p90, ordered[-1], sum(1 for v in ordered if v >= SLOW_MS)))
    return sorted(rows, key=lambda r: (-r[3], -r[4], r[0]))


def render(summary):
    if not summary["days"]:
        return "No visits recorded.\n"
    out = [f"{'day':<12}{'views':>7}{'visitors':>10}{'bots':>7}{'other':>7}"]
    for day, d in summary["days"].items():
        out.append(f"{day:<12}{d['views']:>7}{d['visitors']:>10}{d['bots']:>7}{d['other']:>7}")
    out.append("(views and visitors are people; bots and other are crawlers and the data pages, counted apart)")
    for title, rows in (("Top pages", summary["routes"]), ("Top referrers", summary["referrers"])):
        out += ["", title]
        out += [f"{n:>7}  {name}" for name, n in rows[:TOP]] or ["      none"]
    if summary["slow"]:
        out += ["", f"Slowest pages (milliseconds to the first byte, pages with {MIN_TIMED}+ timed requests; slow = {SLOW_MS // 1000} s or more)",
                f"{'requests':>9}{'median':>8}{'p90':>8}{'slowest':>9}{'slow':>6}  page"]
        out += [f"{n:>9}{med:>8}{p90:>8}{worst:>9}{slow:>6}  {route}" for route, n, med, p90, worst, slow in summary["slow"][:TOP]]
    return "\n".join(out) + "\n"


def prune(directory, keep_months, today=None):
    """Delete visit files more than `keep_months` before this month. Returns the names removed."""
    today = today or date.today()
    cutoff = today.year * 12 + today.month - 1 - keep_months
    removed = []
    for path in sorted(Path(directory).iterdir()):
        m = LOG_NAME.match(path.name)
        if m and int(m[1]) * 12 + int(m[2]) - 1 < cutoff:
            path.unlink()
            removed.append(path.name)
    return removed


def read_records(directory, month=None):
    for path in sorted(Path(directory).glob("visits-*.log")):
        if month and path.name != f"visits-{month}.log":
            continue
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                record = parse_line(line)
                if record:
                    yield record


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("directory", help="the T100_USAGE_LOG directory")
    parser.add_argument("--month", help="only this month, YYYY-MM")
    parser.add_argument("--prune", type=int, metavar="MONTHS", help="afterwards, delete visit files older than this many months")
    args = parser.parse_args(argv)
    if not Path(args.directory).is_dir():
        print(f"usage_report: no such directory: {args.directory}", file=sys.stderr)
        return 1
    print(render(summarise(read_records(args.directory, args.month))), end="")
    if args.prune is not None:
        removed = prune(args.directory, args.prune)
        print(f"\nPruned {len(removed)} file(s)" + (": " + ", ".join(removed) if removed else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
