alter table if exists kb_docs
  add column if not exists account_id text references accounts(id) on delete cascade;

update kb_docs
set account_id = 'default'
where account_id is null;

create index if not exists idx_kb_docs_account_id
  on kb_docs(account_id);

create index if not exists idx_kb_docs_account_url
  on kb_docs(account_id, url);

create or replace function kb_match_docs_for_account(
  query_embedding vector(1536),
  match_count int default 5,
  match_threshold float default 0.75,
  filter_account_id text default 'default'
)
returns table (
  id bigint,
  url text,
  title text,
  chunk text,
  similarity float
)
language sql stable
as $$
  select
    kb_docs.id,
    kb_docs.url,
    kb_docs.title,
    kb_docs.chunk,
    1 - (kb_docs.embedding <=> query_embedding) as similarity
  from kb_docs
  where kb_docs.account_id = filter_account_id
    and 1 - (kb_docs.embedding <=> query_embedding) >= match_threshold
  order by kb_docs.embedding <=> query_embedding
  limit match_count;
$$;
