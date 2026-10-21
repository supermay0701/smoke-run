PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 12),
  ach         INTEGER NOT NULL DEFAULT 0 CHECK (ach BETWEEN 0 AND 200),
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS scores (
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  diff        TEXT NOT NULL CHECK (diff IN ('easy', 'normal', 'hard')),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 12),
  score       INTEGER NOT NULL CHECK (score >= 0),
  survive     INTEGER NOT NULL CHECK (survive BETWEEN 0 AND 3600),
  cigs        INTEGER NOT NULL DEFAULT 0 CHECK (cigs BETWEEN 0 AND 10000),
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, diff)
) STRICT;

CREATE INDEX IF NOT EXISTS scores_rank_idx
  ON scores (diff, score DESC, updated_at ASC);

CREATE INDEX IF NOT EXISTS players_ach_idx
  ON players (ach DESC, updated_at ASC);

