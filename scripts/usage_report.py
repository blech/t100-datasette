#!/usr/bin/env python3
"""Summarise the anonymous visit logs written by plugins/t100_usage.py. Standard library only, so it also runs on the Fly
machine:  python3 usage_report.py /mnt/db/usage [--month 2026-10] [--prune 12]"""
import argparse
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

LOG_NAME = re.compile(r"^visits-(\d{4})-(\d\d)\.log$")
TOP = 15


def parse_line(line):
    parts = line.rstrip("\n").split("\t")
    if len(parts) != 6 or not re.fullmatch(r"\d{4}-\d\d-\d\dT[\d:]{8}Z", parts[0]) or not parts[3].isdigit():
        return None
    when, token, route, status, referrer, kind = parts
    return {"day": when[:10], "token": token, "route": route, "status": int(status), "referrer": referrer, "kind": kind}


def _ranked(counter):
    return sorted(counter.items(), key=lambda item: (-item[1], item[0]))


def summarise(records):
    days, tokens, routes, referrers = {}, {}, Counter(), Counter()
    for r in records:
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
    return {"days": dict(sorted(days.items())), "routes": _ranked(routes), "referrers": _ranked(referrers)}


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
