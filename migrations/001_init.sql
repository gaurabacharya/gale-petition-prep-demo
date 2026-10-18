create table cases (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  kind text not null check (kind in ('passport', 'degree', 'offer_letter')),
  filename text not null,
  raw_text text not null,
  created_at timestamptz not null default now(),
  unique (case_id, kind)
);

create table fields (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  doc_kind text not null check (doc_kind in ('passport', 'degree', 'offer_letter')),
  name text not null,
  value text not null default '',
  quote text not null default '',
  source text not null check (source in ('mrz', 'llm', 'attorney')),
  confidence text not null check (confidence in ('high', 'low')),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  unique (case_id, doc_kind, name)
);

create table letters (
  case_id uuid primary key references cases(id) on delete cascade,
  body text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  action text not null,
  detail jsonb not null default '{}'::jsonb
);
