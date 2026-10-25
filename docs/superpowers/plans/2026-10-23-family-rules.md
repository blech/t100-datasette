# Family rules: leftovers grouped by maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group aircraft types that no family rule matches by their maker, with a per-kind "Other" for single-type makers and makerless types, and drop the broad "Light piston / utility" rule.

**Architecture:** `rebuild_aircraft_family` in `build_database.py` already maps each type to a family by the first matching CSV rule, else a group fallback. The fallback becomes two-pass: collect the unmatched types, count them per `aircraft_types.maker`, then name each one's family from its maker (two or more unmatched) or its BTS kind (otherwise).

**Tech Stack:** Python, sqlite3, pytest.

**Spec:** `docs/superpowers/specs/2026-10-23-family-rules-design.md`

## Global Constraints

- Real (rule-matched) families do not change, apart from rule 172 being deleted.
- `aircraft_family.aircraft_class` for a leftover still comes from the type's BTS group (Piston, Helicopter, Turboprop, Other jet); `fallback` stays 1 for every leftover; `subfamily` stays "".
- Maker names are used as the `maker` column gives them, with no merging.
- No schema change (`schema.sql` untouched). No backup copy of `t100.db`. Production is not touched by this plan.

## Review Focus

- A maker with exactly one unmatched type goes to the per-kind "Other", not to its own family.
- A type with a null or empty maker goes to the per-kind "Other".
- A maker's unmatched types of different kinds (Cessna piston and turboprop) share one family.
- Rebuilding twice gives the same result (the rebuild deletes and refills the table).

---

### Task 1: Maker grouping in `rebuild_aircraft_family`

**Files:**
- Modify: `build_database.py` (`_GROUP_FALLBACK`, `rebuild_aircraft_family`)
- Modify: `data/aircraft_families.csv` (delete the "Light piston / utility" line)
- Modify: `tests/test_rollups.py`, `templates/about.html`

**Interfaces:**
- Produces: `aircraft_family.family` for a leftover is `"<maker> (other models)"` when its maker has two or more unmatched types, else `"Other " + kind.lower()` where kind is `_KIND_BY_GROUP[group]` (so "Other helicopter", "Other piston, single-engine"). Unknown groups keep "Other jet".

- [ ] **Step 1: Write the failing tests** in `tests/test_rollups.py`: `test_unmatched_types_of_a_maker_with_two_or_more_form_a_family` (two Cessna types, one piston group "0", one turboprop group "4", both unmatched, maker "Cessna": both in "Cessna (other models)" with classes Piston and Turboprop, fallback 1); `test_a_makers_single_unmatched_type_joins_the_per_kind_other` (one "Lockheed" type, group "2": family "Other piston, four-engine"); `test_unmatched_types_with_no_maker_join_the_per_kind_other` (maker None, group "1": "Other piston, twin-engine"); `test_rule_matched_types_are_not_counted_as_leftovers` (one matched Boeing 737 type and one unmatched Boeing type: the unmatched one goes to the per-kind other, not "Boeing (other models)"); `test_rebuilding_twice_gives_the_same_families`. Update the expectations at `tests/test_rollups.py:62` (`901` → `"Other turboprop, one or two engines"`). Set the `maker` column in the test types directly (`UPDATE aircraft_types SET maker = ?`) since `rebuild_aircraft_family` alone does not fill it.
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_rollups.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `build_database.py`: rename `_GROUP_FALLBACK` to `_GROUP_CLASS` holding only the class per group (default "Other jet"); in `rebuild_aircraft_family` first collect rows with a matching rule, collect the unmatched `(code, name, group, maker)`, count unmatched per non-empty maker, then name each unmatched type's family as in Interfaces. Delete the "Light piston / utility" line (priority 172) from `data/aircraft_families.csv`.
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/test_rollups.py -q`. Expected: pass. Fix `test_helicopters_are_grouped_by_maker...` (the `Other helicopter` assertion at line 267) only if its two helicopters now share a maker, and say so in the commit message.
- [ ] **Step 5: Update** the About page sentence in `templates/about.html` (about 90 families; unmatched types fall back on their maker, or on BTS's kind, "Other jet, twin-engine").
- [ ] **Step 6: Run** the whole suite: `.venv/bin/python -m pytest -q` and `npm test`. Expected: all pass (update `static/charts/test/aircraft.test.js` sample names only if a test fails on them).
- [ ] **Step 7: Commit** `build_database.py data/aircraft_families.csv tests/test_rollups.py templates/about.html`.

### Task 2: Rebuild locally and list every change

**Files:**
- Modify: local `t100.db` (derived tables only, in place, no backup copy)
- Create: a before-and-after CSV in the scratchpad directory (not committed)

**Interfaces:**
- Consumes: Task 1's `rebuild_aircraft_family`.

- [ ] **Step 1: Save the current mapping** to the scratchpad: `SELECT aircraft_type, name, family FROM aircraft_family`.
- [ ] **Step 2: Rebuild** with `drop_outdated_derived_tables` then `rebuild_derived_tables` on `t100.db`. Expected: `aircraft_family` 447 rows.
- [ ] **Step 3: Verify** the count of distinct families (about 90), that every rule-matched type kept its family, that no unmatched type has an empty family, and that departures totals are unchanged (350,650,414).
- [ ] **Step 4: Write** the before-and-after list (type, before, after) of every type whose family changed, to the scratchpad, and open it for the user.
- [ ] **Step 5: Run** the Python tests again and report.
