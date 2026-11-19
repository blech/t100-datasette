#!/usr/bin/env python3
"""Download the CAA's UK Airport Data tables (CSV) for 2015 onwards. Standard library only.

    uv run python scripts/fetch_caa.py                  # annual tables, 2015 to 2025
    uv run python scripts/fetch_caa.py 2024 2025        # some years
    uv run python scripts/fetch_caa.py --monthly 2025   # the monthly tables too, in <year>/<mm>/
    uv run python scripts/fetch_caa.py --pdf            # PDFs as well as CSVs

Each year's annual page (and month pages) lists its files as links labelled like
"Table 12 1 Intl Air Pax Route Analysis (CSV, 340 KB)"; the download URLs are opaque ids, so they are read off
the pages. A file is saved under its label (without the format and size) in source_downloads/uk/<year>/, and a
file already there is skipped, so the script can be rerun. Years before 2015 are zips on another page."""
import argparse
import html
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://www.caa.co.uk"
YEAR_PAGE = BASE + "/data-and-analysis/uk-aviation-market/airports/uk-airport-data/uk-airport-data-{year}/"
MONTHS = ["january", "february", "march", "april", "may", "june",
          "july", "august", "september", "october", "november", "december"]
OUT = Path(__file__).resolve().parent.parent / "source_downloads" / "uk"
PAUSE = 1.0
LINK = re.compile(r'href="(/Documents/Download/[^"]+)"[^>]*>(.*?)</a>', re.S)
LABEL = re.compile(r"^(?P<name>.*?)\s*\((?P<kind>[A-Za-z]+),[^)]*\)$")


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; data fetch script)"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def links(page_html):
    """(url, name, kind) for each download link on a page."""
    for href, inner in LINK.findall(page_html):
        text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", inner)).split())
        match = LABEL.match(text)
        if match:
            yield BASE + href, match["name"], match["kind"].lower()


def safe_name(name):
    return re.sub(r'[/\\:*?"<>|]+', " ", name).strip()


def fetch_page(page_url, folder, kinds):
    try:
        page = get(page_url).decode("utf-8", "replace")
    except Exception as error:  # a month not yet published, say
        print(f"  skip {page_url}: {error}", file=sys.stderr)
        return 0, 0
    time.sleep(PAUSE)
    fetched = skipped = 0
    seen = set()
    for url, name, kind in links(page):
        if kind not in kinds:
            continue
        filename = f"{safe_name(name)}.{kind}"
        if filename in seen:  # two links with one label: keep both
            filename = f"{safe_name(name)} {url.rsplit('/', 1)[1]}.{kind}"
        seen.add(filename)
        target = folder / filename
        if target.exists():
            skipped += 1
            continue
        folder.mkdir(parents=True, exist_ok=True)
        data = get(url)
        partial = target.with_name(target.name + ".part")
        partial.write_bytes(data)
        partial.replace(target)
        print(f"  {target.relative_to(OUT)} ({len(data):,} bytes)")
        fetched += 1
        time.sleep(PAUSE)
    return fetched, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("years", nargs="*", type=int, default=list(range(2015, 2026)))
    parser.add_argument("--monthly", action="store_true", help="also fetch each month's tables")
    parser.add_argument("--pdf", action="store_true", help="also fetch the PDFs")
    args = parser.parse_args()
    kinds = {"csv", "pdf"} if args.pdf else {"csv"}
    for year in args.years:
        year_url = YEAR_PAGE.format(year=year)
        pages = [(f"{year_url}annual-{year}/", OUT / str(year))]
        if args.monthly:
            pages += [(f"{year_url}{month}-{year}/", OUT / str(year) / f"{number:02d}")
                      for number, month in enumerate(MONTHS, 1)]
        for page_url, folder in pages:
            fetched, skipped = fetch_page(page_url, folder, kinds)
            print(f"{page_url.removeprefix(BASE)}: {fetched} fetched, {skipped} already there")


if __name__ == "__main__":
    main()
