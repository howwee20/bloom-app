-- Add policy fields and ledger journal entry function

alter table policy add column if not exists balance_mode text;
alter table policy add column if not exists spend_power_limit_cents bigint;
alter table policy add column if not exists bridge_limit_cents bigint;
alter table policy add column if not exists haircuts_json jsonb not null default '{}'::jsonb;

create or replace function post_journal_entry(
  p_user_id uuid,
  p_external_source text,
  p_external_id text,
  p_memo text,
  p_postings jsonb
) returns uuid
language plpgsql
as $$
declare
  v_entry_id uuid;
  v_debits bigint;
  v_credits bigint;
begin
  select coalesce(sum((p->>'amount_cents')::bigint) filter (where (p->>'direction') = 'debit'), 0)
    into v_debits
    from jsonb_array_elements(p_postings) p;

  select coalesce(sum((p->>'amount_cents')::bigint) filter (where (p->>'direction') = 'credit'), 0)
    into v_credits
    from jsonb_array_elements(p_postings) p;

  if v_debits <> v_credits then
    raise exception 'Journal entry must balance';
  end if;

  insert into ledger_journal_entries (user_id, external_source, external_id, memo)
    values (p_user_id, p_external_source, p_external_id, p_memo)
    returning id into v_entry_id;

  insert into ledger_postings (journal_entry_id, ledger_account_id, direction, amount_cents)
    select v_entry_id,
           (p->>'ledger_account_id')::uuid,
           (p->>'direction')::text,
           (p->>'amount_cents')::bigint
      from jsonb_array_elements(p_postings) p;

  return v_entry_id;
exception when unique_violation then
  select id into v_entry_id
    from ledger_journal_entries
    where external_source = p_external_source
      and external_id = p_external_id;
  return v_entry_id;
end;
$$;
