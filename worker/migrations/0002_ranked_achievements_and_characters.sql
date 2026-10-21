ALTER TABLE players
  ADD COLUMN achievement_points INTEGER NOT NULL DEFAULT 0
  CHECK (achievement_points BETWEEN 0 AND 50000);

-- 舊版只有成就數量；先以數量作為最低相容積分，之後由新版客戶端補上加權分數。
UPDATE players SET achievement_points = ach WHERE achievement_points = 0;

DROP INDEX IF EXISTS scores_rank_idx;
ALTER TABLE scores RENAME TO scores_legacy;

CREATE TABLE scores (
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  diff        TEXT NOT NULL CHECK (diff IN ('easy', 'normal', 'hard')),
  character   TEXT NOT NULL DEFAULT 'young' CHECK (character IN ('young', 'elder', 'punk')),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 12),
  score       INTEGER NOT NULL CHECK (score >= 0),
  survive     INTEGER NOT NULL CHECK (survive BETWEEN 0 AND 3600),
  cigs        INTEGER NOT NULL DEFAULT 0 CHECK (cigs BETWEEN 0 AND 10000),
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, diff, character)
) STRICT;

INSERT INTO scores (player_id, diff, character, name, score, survive, cigs, updated_at)
SELECT player_id, diff, 'young', name, score, survive, cigs, updated_at FROM scores_legacy;

DROP TABLE scores_legacy;

CREATE INDEX scores_rank_idx
  ON scores (diff, score DESC, updated_at ASC);

CREATE INDEX scores_character_rank_idx
  ON scores (diff, character, score DESC, updated_at ASC);

CREATE INDEX players_achievement_points_idx
  ON players (achievement_points DESC, ach DESC, updated_at ASC);
