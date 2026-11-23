// One entry per schema version. Append new migrations; never edit a shipped one.
export const migrations: string[] = [
  `
  CREATE TABLE operations (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    offer_id TEXT REFERENCES offers(id),
    model TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER,
    cost_usd REAL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_creation_tokens INTEGER,
    model_usage TEXT,
    session_id TEXT,
    error TEXT
  );

  CREATE TABLE search_runs (
    id INTEGER PRIMARY KEY,
    operation_id INTEGER REFERENCES operations(id),
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    sources_ok TEXT NOT NULL DEFAULT '[]',
    sources_failed TEXT NOT NULL DEFAULT '[]',
    offers_found INTEGER NOT NULL DEFAULT 0,
    offers_new INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE offers (
    id TEXT PRIMARY KEY,
    dedupe_key TEXT NOT NULL UNIQUE,
    url TEXT,
    sources TEXT NOT NULL DEFAULT '[]',
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    locations TEXT NOT NULL DEFAULT '[]',
    remote INTEGER,
    salary_text TEXT,
    language TEXT,
    posted_at TEXT,
    first_seen_run_id INTEGER REFERENCES search_runs(id),
    last_seen_run_id INTEGER REFERENCES search_runs(id),
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'shortlisted', 'prepared', 'applied', 'interview',
                        'offer_received', 'rejected', 'discarded')),
    status_note TEXT,
    fit_score INTEGER,
    dealbreaker TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX offers_url ON offers(url);

  CREATE TABLE offer_scores (
    offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    criterion TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    reason TEXT NOT NULL,
    PRIMARY KEY (offer_id, criterion)
  );

  CREATE TABLE offer_gaps (
    offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    text TEXT NOT NULL
  );
  CREATE INDEX offer_gaps_offer ON offer_gaps(offer_id);

  CREATE TABLE cv_versions (
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    origin TEXT NOT NULL CHECK (origin IN ('import', 'suggestion', 'restore')),
    origin_ref TEXT,
    file_path TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE cv_suggestions (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    offer_ids TEXT NOT NULL DEFAULT '[]',
    count INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed')),
    resolved_version_id INTEGER REFERENCES cv_versions(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE companies (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sector TEXT CHECK (sector IN ('it_software', 'manufacturing', 'consulting',
      'public_administration', 'banking_insurance', 'utilities_energy',
      'retail_consumer', 'healthcare', 'logistics', 'other')),
    size TEXT CHECK (size IN ('startup', 'sme', 'large', 'unknown')),
    kind TEXT CHECK (kind IN ('end_client', 'it_consultancy', 'staffing_agency',
      'public_body', 'unknown')),
    town TEXT,
    website TEXT,
    careers_url TEXT,
    reason TEXT,
    origin TEXT NOT NULL CHECK (origin IN ('offer', 'search')),
    watched INTEGER NOT NULL DEFAULT 0 CHECK (watched IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  `,
  `ALTER TABLE offers ADD COLUMN scored_at TEXT;`,
  `
  CREATE TABLE status_history (
    offer_id TEXT NOT NULL REFERENCES offers(id),
    status TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX status_history_offer ON status_history(offer_id);
  INSERT INTO status_history SELECT id, status, updated_at FROM offers;
  ALTER TABLE offers ADD COLUMN followed_up_at TEXT;

  -- Every status write records itself, whichever code path makes it.
  CREATE TRIGGER offers_status_insert AFTER INSERT ON offers
  BEGIN
    INSERT INTO status_history VALUES (NEW.id, NEW.status, NEW.updated_at);
  END;
  CREATE TRIGGER offers_status_update AFTER UPDATE OF status ON offers
    WHEN OLD.status != NEW.status
  BEGIN
    INSERT INTO status_history VALUES (NEW.id, NEW.status, NEW.updated_at);
  END;
  `,
];
