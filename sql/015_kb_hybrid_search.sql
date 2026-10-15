-- 015: RAG con índice vectorial y búsqueda híbrida (vector + texto completo).

-- Sin índice, cada consulta recorría todos los embeddings de kb_docs.
create index if not exists idx_kb_docs_embedding_hnsw
  on kb_docs using hnsw (embedding vector_cosine_ops);

-- Los nombres propios, precios y SKUs fallan por similitud; el texto completo los encuentra.
alter table kb_docs
  add column if not exists search_tsv tsvector
  generated always as (to_tsvector('spanish', coalesce(title, '') || ' ' || chunk)) stored;

create index if not exists idx_kb_docs_search_tsv on kb_docs using gin (search_tsv);

-- Reciprocal Rank Fusion: combina ambos rankings sin calibrar escalas distintas.
create or replace function kb_hybrid_search_for_account(
  query_embedding vector(1536),
  query_text text,
  filter_account_id text,
  match_count integer default 5
)
returns table (id bigint, url text, title text, chunk text, score double precision)
language sql stable
as $$
  with semantic as (
    select d.id, row_number() over (order by d.embedding <=> query_embedding) as rank
    from kb_docs d
    where d.account_id = filter_account_id
    order by d.embedding <=> query_embedding
    limit match_count * 4
  ),
  lexical as (
    select d.id, row_number() over (order by ts_rank_cd(d.search_tsv, q) desc) as rank
    from kb_docs d, websearch_to_tsquery('spanish', query_text) q
    where d.account_id = filter_account_id and d.search_tsv @@ q
    order by ts_rank_cd(d.search_tsv, q) desc
    limit match_count * 4
  )
  select d.id, d.url, d.title, d.chunk,
    coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + l.rank), 0) as score
  from semantic s
  full outer join lexical l on l.id = s.id
  join kb_docs d on d.id = coalesce(s.id, l.id)
  order by score desc
  limit match_count;
$$;

revoke all on function kb_hybrid_search_for_account(vector, text, text, integer) from public, anon, authenticated;
grant execute on function kb_hybrid_search_for_account(vector, text, text, integer) to service_role;
