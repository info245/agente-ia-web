-- 015: RAG con índice vectorial y búsqueda híbrida (vector + texto completo).

-- Sin índice, cada consulta recorría todos los embeddings de kb_docs.
-- Construirlo con 1536 dimensiones necesita más que los 32 MB por defecto del plan gratuito.
set maintenance_work_mem = '128MB';
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
language plpgsql
as $$
#variable_conflict use_column
begin
  -- Sin esto, HNSW devuelve los 40 vecinos de toda la tabla y el filtro por cuenta puede dejarlos en 0.
  -- Supabase no permite fijarlo en la cabecera de la función (SET), solo en ejecución.
  perform set_config('hnsw.iterative_scan', 'strict_order', true);
  return query
  with semantic as (
    select d.id, row_number() over (order by d.embedding <=> query_embedding) as rank
    from kb_docs d
    where d.account_id = filter_account_id
    order by d.embedding <=> query_embedding
    limit match_count * 4
  ),
  lexical as (
    select d.id, row_number() over (order by ts_rank_cd(d.search_tsv, q) desc) as rank
    -- OR entre términos: una pregunta completa casi nunca contiene todas sus palabras en un fragmento.
    from kb_docs d,
      to_tsquery('spanish', replace(plainto_tsquery('spanish', query_text)::text, ' & ', ' | ')) q
    where d.account_id = filter_account_id and d.search_tsv @@ q
    order by ts_rank_cd(d.search_tsv, q) desc
    limit match_count * 4
  )
  select d.id, d.url, d.title, d.chunk,
    (coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + l.rank), 0))::double precision as score
  from semantic s
  full outer join lexical l on l.id = s.id
  join kb_docs d on d.id = coalesce(s.id, l.id)
  order by 5 desc
  limit match_count;
end;
$$;

revoke all on function kb_hybrid_search_for_account(vector, text, text, integer) from public, anon, authenticated;
grant execute on function kb_hybrid_search_for_account(vector, text, text, integer) to service_role;
