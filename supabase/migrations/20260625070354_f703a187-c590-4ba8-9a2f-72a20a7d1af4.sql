
CREATE TABLE public.own_exit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  pubkey text NOT NULL,
  process_event_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('exit','enter')),
  content text,
  event_created_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  applied boolean NOT NULL DEFAULT false
);

CREATE INDEX own_exit_events_pubkey_proc_idx
  ON public.own_exit_events (pubkey, process_event_id, event_created_at DESC);
CREATE INDEX own_exit_events_created_idx
  ON public.own_exit_events (event_created_at DESC);

GRANT SELECT ON public.own_exit_events TO anon, authenticated;
GRANT ALL ON public.own_exit_events TO service_role;

ALTER TABLE public.own_exit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_exit_events public read"
  ON public.own_exit_events FOR SELECT
  USING (true);
