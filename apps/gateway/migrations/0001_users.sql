CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sandbox TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE github_installations (
  installation_id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  account_login TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE retired_sandbox_names (
  name TEXT PRIMARY KEY,
  retired_at INTEGER NOT NULL
);
