CREATE TABLE public.wallet_freeze_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_uuid uuid,
  wallet_address text NOT NULL,
  nostr_hex_id text NOT NULL,
  status text NOT NULL,
  reason text NOT NULL DEFAULT '',
  amount_lanoshis bigint NOT NULL DEFAULT 0,
  effective_at timestamp with time zone NOT NULL DEFAULT now(),
  frozen_at timestamp with time zone,
  nostr_event_id text,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_freeze_events TO anon;
GRANT SELECT ON public.wallet_freeze_events TO authenticated;
GRANT ALL ON public.wallet_freeze_events TO service_role;

ALTER TABLE public.wallet_freeze_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view wallet freeze events"
ON public.wallet_freeze_events FOR SELECT
USING (true);

CREATE INDEX idx_wfe_wallet_address ON public.wallet_freeze_events (wallet_address);
CREATE INDEX idx_wfe_wallet_uuid_status ON public.wallet_freeze_events (wallet_uuid, status, effective_at DESC);