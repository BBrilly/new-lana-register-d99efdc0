ALTER TABLE public.unregistered_lana_events
  ADD COLUMN IF NOT EXISTS nostr_deletion_published boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nostr_deletion_event_ids text[],
  ADD COLUMN IF NOT EXISTS nostr_deletion_published_at timestamptz;