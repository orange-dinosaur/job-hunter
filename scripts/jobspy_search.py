# /// script
# requires-python = ">=3.10"
# dependencies = ["python-jobspy==1.4.1"]
# ///
"""Search job boards with JobSpy and print one JSON entry per site.

Each site runs on its own, so a failing site does not hide the others.
An entry holds the offers found and the first error, if any.
"""

import argparse
import datetime
import json
import logging
import math
import sys

COLUMNS = [
    "title",
    "company",
    "location",
    "job_url",
    "is_remote",
    "min_amount",
    "max_amount",
    "currency",
    "interval",
    "date_posted",
    "description",
]


def records(df):
    """Turn a JobSpy DataFrame into plain dicts with None for missing values."""
    out = []
    for row in df.reindex(columns=COLUMNS).to_dict(orient="records"):
        for key, value in row.items():
            if value is None or (isinstance(value, float) and math.isnan(value)):
                row[key] = None
            elif isinstance(value, (datetime.date, datetime.datetime)):
                row[key] = value.isoformat()[:10]
            elif hasattr(value, "item"):  # numpy scalars
                row[key] = value.item()
        out.append(row)
    return out


def place(value):
    name, sep, km = value.rpartition(":")
    if not sep or not name:
        raise argparse.ArgumentTypeError(f"use NAME:KM, got {value!r}")
    return name, float(km)


class ErrorLog(logging.Handler):
    """Keeps the errors JobSpy logs instead of raising, such as HTTP 429."""

    def __init__(self):
        super().__init__(logging.ERROR)
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def search_site(site, args):
    from jobspy import scrape_jobs

    queries = [(name, km, False) for name, km in args.place]
    if args.remote:
        queries.append(("Italy", None, True))

    log = ErrorLog()
    logging.getLogger(f"jobspy.{site}").addHandler(log)
    offers, seen, error = [], set(), None
    for term in args.term:
        for location, km, remote in queries:
            log.messages.clear()
            try:
                df = scrape_jobs(
                    site_name=[site],
                    search_term=term,
                    location=location,
                    distance=round(km / 1.609) if km is not None else 50,
                    is_remote=remote,
                    results_wanted=args.results,
                    hours_old=args.hours_old,
                    country_indeed="italy",
                    fetch_description=True,
                    verbose=0,
                )
            except Exception as err:  # noqa: BLE001
                error = error or f"{term} in {location}: {err}"
                continue
            if log.messages:
                error = error or f"{term} in {location}: {log.messages[0]}"
            for job in records(df):
                if job["job_url"] not in seen:
                    seen.add(job["job_url"])
                    offers.append(job)
    return {"site": site, "offers": offers, "error": error}


def self_check():
    import pandas as pd

    df = pd.DataFrame(
        [
            {
                "title": "Dev",
                "company": "Acme",
                "job_url": "https://x/1",
                "is_remote": True,
                "min_amount": 30000.0,
                "max_amount": float("nan"),
                "date_posted": datetime.date(2026, 11, 18),
                "description": None,
            }
        ]
    )
    [job] = records(df)
    assert set(job) == set(COLUMNS), job
    assert job["max_amount"] is None and job["description"] is None, job
    assert job["date_posted"] == "2026-11-18", job
    assert job["min_amount"] == 30000.0 and job["is_remote"] is True, job
    json.dumps(job)
    assert place("Reggio Emilia:30") == ("Reggio Emilia", 30.0)
    log = ErrorLog()
    logger = logging.getLogger("jobspy.self_check")
    logger.addHandler(log)
    logger.propagate = False
    logger.error("response status code 429")
    assert log.messages == ["response status code 429"], log.messages
    print("self-check ok")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--term", action="append", default=[])
    parser.add_argument("--place", action="append", type=place, default=[])
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--sites", default="indeed,linkedin,glassdoor")
    parser.add_argument("--results", type=int, default=20)
    parser.add_argument("--hours-old", type=int, default=24 * 14)
    args = parser.parse_args()

    if args.self_check:
        self_check()
        return
    if not args.term or not (args.place or args.remote):
        parser.error("give at least one --term and one --place or --remote")

    sites = [search_site(s, args) for s in args.sites.split(",")]
    json.dump(sites, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
