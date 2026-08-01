ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS freeze_split integer,
  ADD COLUMN IF NOT EXISTS freeze_until_split integer,
  ADD COLUMN IF NOT EXISTS freeze_reason_details text NOT NULL DEFAULT '';

ALTER TABLE public.wallet_freeze_events
  ADD COLUMN IF NOT EXISTS split integer,
  ADD COLUMN IF NOT EXISTS until_split integer,
  ADD COLUMN IF NOT EXISTS reason_details text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.own_person_freeze_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  facilitator_pubkey text NOT NULL,
  frozen_person_hex text NOT NULL,
  process_event_id text NOT NULL,
  status text NOT NULL,
  content text,
  effective_at timestamptz NOT NULL,
  frozen_at timestamptz,
  until_split integer,
  split_at_event integer,
  event_created_at timestamptz NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.own_person_freeze_events TO anon;
GRANT SELECT ON public.own_person_freeze_events TO authenticated;
GRANT ALL ON public.own_person_freeze_events TO service_role;

ALTER TABLE public.own_person_freeze_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view own person freeze events"
ON public.own_person_freeze_events FOR SELECT
USING (true);

CREATE INDEX IF NOT EXISTS idx_opfe_person ON public.own_person_freeze_events (frozen_person_hex);
CREATE INDEX IF NOT EXISTS idx_opfe_created ON public.own_person_freeze_events (event_created_at DESC);