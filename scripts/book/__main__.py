"""Build the airport book: uv run --group book python -m scripts.book [options]. See README.md, "Airport book"."""

import argparse
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

from scripts.book.data import airport_facts, book_airports
from scripts.book.pdf import broken_spreads, library_env, needs_library_path, write_pdf
from scripts.book.posters import PosterError, load_diagrams, load_posters
from scripts.book.render import ENDPAPERS, PAGE_SIZES, book_html

REPO = Path(__file__).resolve().parents[2]
POSTERS = Path.home() / "Documents (Local)" / "code" / "airportcity" / "posters"
DIAGRAMS = REPO / "static" / "svg" / "diagram"
# the print posters, CODE-rail.svg where there is one, else CODE.svg. Not CODE-rail-rot.svg (turned a quarter, for an
# airport wider than it's tall): north-up throughout keeps the same-scale posters comparable from spread to spread.
PRINT_VARIANTS = ("rail",)


def endpapers(value: str) -> tuple[str, str]:
    kinds = tuple(k.strip() for k in value.split(","))
    if len(kinds) != 2 or any(k not in ENDPAPERS for k in kinds):
        raise argparse.ArgumentTypeError(f"two of {', '.join(ENDPAPERS)}, front then back, e.g. posters,codes")
    return kinds


def default_db() -> Path:
    """t100.db in the main checkout, which is the same file from any worktree."""
    common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=REPO,
                            capture_output=True, text=True, check=True).stdout.strip()
    return Path(common).parent / "t100.db"


def parse(argv):
    p = argparse.ArgumentParser(prog="python -m scripts.book", description="Build the airport book as a PDF.")
    p.add_argument("--db", type=Path, help="t100.db (default: the main checkout's)")
    p.add_argument("--posters", type=Path, default=POSTERS / "print",
                   help=f"print posters, one facing each data page (default: {POSTERS / 'print'})")
    p.add_argument("--endpaper-posters", type=Path, default=POSTERS,
                   help=f"plain posters (aeroways and roads), for a poster endpaper (default: {POSTERS})")
    p.add_argument("--out", type=Path, default=REPO / "book" / "out" / "airport-book.pdf")
    p.add_argument("--year", type=int, default=2025, help="the book's year: ranks, destinations, airlines")
    p.add_argument("--first-year", type=int, default=1990)
    p.add_argument("--top-passengers", type=int, default=50)
    p.add_argument("--top-freight", type=int, default=50)
    p.add_argument("--only", help="comma-separated codes, for a quick draft of a few spreads")
    p.add_argument("--page-size", choices=sorted(PAGE_SIZES), default="letter")
    p.add_argument("--endpapers", type=endpapers, default=("posters", "codes"),
                   help="pages 2 and the one before the back cover: posters, diagrams or codes, front then back (default: posters,codes)")
    p.add_argument("--diagrams", type=Path, default=DIAGRAMS, help="runway diagram SVGs, for diagram endpapers")
    p.add_argument("--html", action="store_true", help="write the HTML instead of the PDF (no WeasyPrint needed)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse(sys.argv[1:] if argv is None else argv)
    if not args.html and argv is None and needs_library_path():
        # macOS reads the library path only when a process starts, so restart with Homebrew's Pango on it
        os.execve(sys.executable, [sys.executable, "-m", "scripts.book", *sys.argv[1:]], library_env())
    db = args.db or default_db()
    conn = sqlite3.connect(f"{db.resolve().as_uri()}?mode=ro", uri=True)
    try:
        entries = book_airports(conn, args.year, args.top_passengers, args.top_freight)
        if args.only:
            wanted = [c.strip().upper() for c in args.only.split(",") if c.strip()]
            unknown = sorted(set(wanted) - {e.code for e in entries})
            if unknown:
                print(f"not in the book: {', '.join(unknown)}", file=sys.stderr)
                return 2
            entries = [e for e in entries if e.code in wanted]
        try:
            codes = [e.code for e in entries]
            posters = load_posters(args.posters, codes, variants=PRINT_VARIANTS)
            endpaper_posters = load_posters(args.endpaper_posters, codes) if "posters" in args.endpapers else None
            diagrams = load_diagrams(args.diagrams, [e.code for e in entries]) if "diagrams" in args.endpapers else None
        except PosterError as e:
            print(e, file=sys.stderr)
            return 2
        airports = [(e, airport_facts(conn, e, args.first_year, args.year)) for e in entries]
    finally:
        conn.close()
    subtitle = f"The {args.top_passengers} busiest by passengers and the {args.top_freight} busiest by freight in {args.year}"
    options = dict(page_size=args.page_size, subtitle=subtitle, endpapers=args.endpapers, diagrams=diagrams,
                   endpaper_posters=endpaper_posters)
    html = book_html(airports, posters, **options)
    if args.html:
        out = args.out.with_suffix(".html")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html)
        print(f"{len(airports)} airports: {out}")
        return 0
    data_pages, poster_pages, pages = write_pdf(html, args.out, REPO)
    print(f"{pages} pages, {len(airports)} airports: {args.out}")
    broken = broken_spreads(data_pages, poster_pages)
    if broken:
        codes = [e.code for (e, _), d in zip(airports, data_pages) if d in broken]
        print(f"spreads broken (data page not facing its poster, or too long for one page): {', '.join(codes)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
