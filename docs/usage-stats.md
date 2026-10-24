# Usage statistics: proposed approach

Status: implemented on `feature/usage-stats` (2026-10-24): `plugins/t100_usage.py`, `scripts/usage_report.py`, a Privacy section on the About page, and `T100_USAGE_LOG` in `fly.toml`. Decisions on the open questions at the end: airport codes are kept in the route; the salt is per UTC day; the User-Agent is in the hash; raw files are kept 12 months (`--prune 12`); crawler traffic on the data pages is tagged `other` rather than dropped. Also decided: only `/t100/…` and `/-/…` requests that are HTML or an error are logged as `other`, so the chart queries each page makes don't fill the log.

## Goal

Know roughly how many people use the site, which pages they look at and where they come from, without storing IP addresses or anything that identifies a person, and without a consent banner or a new paid service.

Non-goals: following individuals across days, geography, device fingerprinting, dashboards.

## What exists today

- `flyctl logs` shows one uvicorn access line per request. Fly keeps only a short rolling buffer.
- The logged address is Fly's internal proxy (`172.16.6.50`), not the visitor, and the User-Agent isn't logged. So the logs count requests but can't tell visitors apart.
- Bots inflate them: crawlers walk the old Datasette table-style URLs (`/t100/route?dest=…&origin=…`) at a request or two a second.
- Fly's own metrics dashboard shows request rates with no change from us. Useful as a baseline, but not per page or per visitor.
- The only thing stored on a visitor's device is the theme choice in `localStorage`, which is a user-chosen preference and not an identifier.

## Proposal

A small Datasette plugin (`plugins/t100_usage.py`) using the `asgi_wrapper` hook. For each **page view** it appends one line to a log file on the Fly volume. A stdlib report script summarises the file.

### What counts as a page view

Only HTML pages from an allowlist: `/`, `/globe`, `/about`, `/airports/<code>`, `/airports/<code>/globe`, `/airports/<code>/<code>[/<year>]`. Not counted: `/static/…`, the JSON requests the pages make, redirects (3xx) and the old `/t100/…` table URLs. The old URLs are counted separately as `other` so crawler volume stays visible.

### The visitor token

`token = first 12 hex of sha256(salt + client_ip + user_agent)`

- **Client IP:** the `Fly-Client-IP` header that Fly's proxy adds, falling back to the socket address. The IP is used in memory to compute the hash and is never written down.
- **Salt:** random, one per UTC day, kept in a small file on the volume. When the date changes the file is overwritten with a new random salt. Yesterday's salt no longer exists, so the hash can't be reversed by trying candidate IPs, and the same person gets a different token each day.
- **Result:** distinct tokens per day approximates distinct visitors that day. It can't show returning visitors, which is deliberate.
- **Why not a salt held only in memory:** the Fly machine stops when idle (`auto_stop_machines = 'stop'`), so every restart would reset it and split one visit into several. A file on the volume survives restarts and still only lives one day.
- **Why not a salt derived from a permanent secret and the date:** anyone with the secret could test every IPv4 address against the log. A salt that is deleted can't be tested.

### The log line

Tab-separated, one per page view, in `visits-YYYY-MM.log`:

`time (UTC)  token  route  status  referrer-host  kind`

- **route:** the pattern, not the path: `/airports/{code}/{code}/{year}`, with no airport codes. Keeping them would be useful for "which airports are popular". See open questions.
- **Query string:** never stored.
- **referrer-host:** the host only, for example `news.ycombinator.com`, empty if absent or our own site.
- **kind:** `human`, or `bot` if the User-Agent matches a short list (bot, crawl, spider, curl, wget, python-requests and so on). The User-Agent itself isn't stored.

### Safety

- Off unless `T100_USAGE_LOG` points at a directory, so local development and the test suite are unaffected. `fly.toml` sets it to `/mnt/db/usage`.
- A failure to write (full disk, permissions) is swallowed: logging must never break a page.
- Writes are single short appends, so one process needs no locking.

### Report

`scripts/usage_report.py <dir> [--month 2026-10]`, standard library only: page views and distinct tokens per day, top routes, top referrers, human/bot split. It runs on the machine with `flyctl ssh console -C "python3 …"`, or locally against logs fetched with `flyctl ssh sftp`.

### Retention

Raw files are kept 12 months. Each line already holds no personal data, so this is housekeeping rather than a legal requirement. The report script can prune older files. Size is about 100 bytes a line, so even 10,000 views a day is about 30MB a month, against roughly 800MB free on the volume.

### Privacy statement

One short paragraph on the About page, saying plainly what is recorded (page, time, referring site, a daily-rotating anonymous token), what isn't (IP addresses, cookies, anything that follows a person between days) and that the theme setting is stored on the device only. No banner: nothing is stored on the visitor's device for tracking, and nothing identifying is kept on the server.

I'm not a lawyer. On my reading, a token from a salt discarded daily is anonymous, but IP addresses are processed in memory and by Fly's proxy regardless.

## Build plan

TDD throughout, small fixtures, no database needed.

1. **Pure functions:** `route_pattern(path)`, `is_page(path, status)`, `referrer_host(header, own_host)`, `classify(user_agent)`, `token(salt, ip, ua)`. Tests include: query strings never appear, redirects and static paths are skipped, the old `/t100/…` routes are tagged `other`, a bot User-Agent is flagged, a missing `Fly-Client-IP` falls back safely.
2. **Salt store:** creates the file, reuses it within a UTC day, replaces it on a new day, and the old value is gone. Tests use a fake clock.
3. **Middleware:** writes a line for a page view and none for assets. A write error doesn't change the response. Nothing is written when `T100_USAGE_LOG` is unset. Tests drive it as an ASGI app with no server.
4. **Plugin registration and `fly.toml` env.** The Dockerfile already copies `plugins/`.
5. **`usage_report.py`** with tests over a sample log.
6. **About-page paragraph** and README note.
7. **Deployment:** no data load needed. After the CI deploy, load a few pages and check that the file appears on the volume and that its lines have no IPs. `scripts/smoke_check.sh` gets no change.

## If the app ever runs on more than one machine

A Fly volume belongs to one machine, so each machine would have its own log files and its own salt file. Today that doesn't arise: `fly.toml` has `max_machines_running = 1`, CI deploys with `--ha=false`, and the database itself lives on that single volume (a second machine would need its own 2.6GB copy). If it did happen:

- Each machine's logs would have to be collected and merged by the report script. That is one `flyctl ssh` per machine.
- Salts would differ per machine, so one visitor could be counted once on each. Distinct-visitor counts would run slightly high.
- The fix would be to write the line to stdout as well (or instead) and ship it centrally, which is the log shipper from the alternatives below. The plugin's line format would stay the same.

## Alternatives considered

- **Ship Fly logs to Axiom or Better Stack** ([fly-log-shipper](https://github.com/superfly/fly-log-shipper), a second Fly app plus a sink account). It keeps history, but the logs still lack visitors and User-Agent, so it adds a service without answering the question. It can be added later if dashboards are wanted.
- **A hosted cookieless tracker** (Plausible, GoatCounter, Umami). Least work, and it has dashboards and bot filtering, but it adds a third-party script or another service, and the data isn't in our hands.
- **A random ID in `localStorage` or a cookie.** Simple, but it's a persistent identifier on the device, which is what would require consent.

## Open questions

- Record airport codes in the route (for "popular airports") or only the pattern? Codes in a path aren't personal, but they make lines more distinctive. I'd record them, since that's most of the interest.
- Salt per UTC day (my suggestion) or per session-length window, for stronger privacy at the cost of less accurate counts?
- Include the User-Agent in the hash? It separates people behind the same address (a household) but adds entropy. I'd include it.
- 12 months retention, or shorter?
- Should the old `/t100/…` crawler traffic be dropped from the log rather than tagged `other`?
