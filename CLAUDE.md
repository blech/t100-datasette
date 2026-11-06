# CLAUDE.md

Datasette project visualising BTS T-100 flight data (1990-2025). `README.md` is the reference for pages, tables and canned queries; read the relevant part rather than assuming. This file only holds what is easy to get wrong.

## Running it

- `./start.sh` (`uv run datasette --port 8808 --reload .`). Pass the directory `.`, never just `t100.db`: directory mode is what loads `datasette.yml`, `plugins/`, `templates/` and `static/`. Naming only the database silently ignores all of them.
- **Port 8808 is the user's own manually run server. Never stop it.** To check a change in a running app, start your own instance on another port (e.g. `uv run datasette --port 8818 .`, without `--host 0.0.0.0`) and stop it when done.
- `./serve_public.sh` is the locked-down read-only mode.

## The database

- `t100.db` is ~2.9GB, uncommitted (`*.db` and `*.csv` are gitignored apart from the `data/` rules files). Don't scan it casually: use indexed queries and `LIMIT`, and prefer the rollup tables to the segment tables.
- The derived/rollup tables are rebuilt with `build_database.rebuild_derived_tables` after loading data or editing `data/aircraft_families.csv` / `data/carrier_groups.csv`.
- `schema.sql` is generated from `build_database.py`. Change the Python, not the SQL.
- New tables/columns must exist on the Fly volume before a code deploy, or the post-deploy smoke check fails.
- When a new year of data is loaded, bump `max_year` under `plugins: t100_globe` in `datasette.yml`.

## Where things live

- `plugins/t100_globe.py`: the front page and all `/airports/...` page routes (old paths redirect). Other plugins are small: `t100_guard.py`, `t100_render_links.py`, `t100_usage.py`, `t100_direction.py`, `t100_schema.py`.
- `datasette.yml`: settings and every canned query (the SQL behind the charts).
- `templates/`: Jinja pages, all extending `t100_base.html` (the doctype, head, nav, footer; pages fill its blocks, and the maps override `body`); `_nav.html`, `_footer.html` etc. are shared partials.
- `static/`: plain ES modules. Edit these; there is no build step in development. `common/` is shared (number formatting in `numbers.js`, palette, popovers), `nav/` is the header and theme chooser, `globe/`, `charts/`, `home/`, `dedicated/` are per-page code. Vendored libraries live in `vendor/` dirs.

## JavaScript bundle

- Templates load page scripts with `{{ script_url('charts/rollup.js') }}` (never a literal `/static/...` path) and preload with `modulepreload(...)`, both from `plugins/t100_assets.py`. Without `static/dist/manifest.json` they give the source modules, which is development's normal state.
- `npm run bundle` (esbuild, `scripts/bundle.mjs`) builds `static/dist/`: hashed, minified, split. It is gitignored, built by the Docker image and CI, and its entry points are whatever `script_url('...')` calls the templates contain. Don't edit `static/dist/`.
- To see what production serves, run `npm run bundle` and restart; delete `static/dist/` to go back. The Python tests ignore any local bundle.

## Tests and deploy

- `uv run pytest` (Python) and `npm test` (syntax check plus `node --test` over the static modules). Run both for changes that touch both sides.
- Every push to `main` runs the tests, deploys to Fly, then runs `scripts/smoke_check.sh` against the live site. Don't push to `main` casually.

## Conventions

- **The changelog is hand-written.** `templates/changelog.html` is the user's own record, in their own voice, and they write it deliberately to keep track of changes. Don't add or edit entries, and don't generate one from git history. If a change deserves an entry, say so in your summary and let them write it. The same applies to uncommitted edits in that file: leave them alone.
- Larger features are designed first: specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/` (dated filenames). `docs/site-coherence.md` is the roadmap for look-and-feel consistency (number precision, popovers, colour, navigation); check it before introducing a new formatting or colour convention.
- Numbers shown to users go through the shared formatter (`static/common/numbers.js`), not ad-hoc `toFixed` or d3 `~s`.
- Keep README.md in step when pages, tables or canned queries change.
