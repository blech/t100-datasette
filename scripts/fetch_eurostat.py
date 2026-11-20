#!/usr/bin/env python3
"""Download Eurostat air transport datasets as .tsv.gz. Standard library only.

    uv run python scripts/fetch_eurostat.py                   # every avia_par_xx and avia_gor_xx (routes, by country)
    uv run python scripts/fetch_eurostat.py avia_paoa avia_tf_cm   # named datasets
    uv run python scripts/fetch_eurostat.py --force           # fetch again even where a file is there

The datasets are read from Eurostat's catalogue, so a country added there is picked up. avia_par_xx is passengers,
flights and seats between each of a country's main airports and its partner airports; avia_gor_xx is the same for
freight. Files are saved as source_downloads/eu/estat_<code>.tsv.gz, the name the Eurostat database page's own
downloads have, and one already there is skipped unless --force (Eurostat updates the tables twice a month).
Downloads go through curl."""
import argparse
import gzip
import re
import sys
import subprocess
import time
from pathlib import Path

CATALOGUE = "https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt?lang=en"
DATA = "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/{code}?format=TSV&compressed=true"
OUT = Path(__file__).resolve().parent.parent / "source_downloads" / "eu"
ROUTE_DATASETS = re.compile(r'"(avia_(?:par|gor)_[a-z]{2})"')
PAUSE = 1.0


def get(url):
    # through curl, which uses the system's certificates: uv's Python doesn't trust the root Eurostat's chain ends at
    return subprocess.run(["curl", "-fsSL", "--max-time", "600", "-A", "Mozilla/5.0 (compatible; data fetch script)", url],
                          check=True, capture_output=True).stdout


def route_datasets():
    return sorted(set(ROUTE_DATASETS.findall(get(CATALOGUE).decode("utf-8", "replace"))))


def fetch(code, force):
    target = OUT / f"estat_{code}.tsv.gz"
    if target.exists() and not force:
        return "already there"
    data = get(DATA.format(code=code))
    first_line = gzip.decompress(data).split(b"\n", 1)[0]
    if not first_line.startswith(b"freq,"):
        raise ValueError(f"not a Eurostat TSV: {first_line[:80]!r}")
    OUT.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")
    partial.write_bytes(data)
    partial.replace(target)
    return f"{len(data):,} bytes"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("codes", nargs="*", help="dataset codes (default: every avia_par_xx and avia_gor_xx)")
    parser.add_argument("--force", action="store_true", help="fetch files that are already there again")
    args = parser.parse_args()
    codes = args.codes or route_datasets()
    failed = []
    for code in codes:
        try:
            print(f"{code}: {fetch(code, args.force)}")
        except Exception as error:
            print(f"{code}: failed, {error}", file=sys.stderr)
            failed.append(code)
        time.sleep(PAUSE)
    if failed:
        sys.exit(f"{len(failed)} failed: {' '.join(failed)}")


if __name__ == "__main__":
    main()
