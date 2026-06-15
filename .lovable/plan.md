
## Problem
The cron `kind-cron-87003-monitoring-unregistered-coins` publishes Kind 87003 and sends NIP-04 DMs for **every** unregistered_lana_event, regardless of size. We already have a system parameter `freeze_lana_account_above` (currently 100) which is the threshold above which an account is frozen. Below that, the amount is tolerated and should not trigger a notification.

## Fix
In `supabase/functions/kind-cron-87003-monitoring-unregistered-coins/index.ts`:

1. After fetching `system_parameters`, also read `freeze_lana_account_above` (fallback 100 if missing/null).
2. After filtering `ownedEvents`, add a second filter:
   - Skip events where `unregistered_amount < threshold`.
   - Log: `⏭️ Skipping event <id> - amount X < threshold Y`.
   - Increment `skippedCount` (or a new `belowThresholdCount`) and do NOT mark them published — they remain in the queue so that if more unregistered coins arrive for the same wallet/TX and push the aggregated total ≥ threshold, the next cron run will publish.
3. Include the count in the summary response (`belowThreshold: N`).

## Out of scope
- No change to the DB trigger `detect_unregistered_lana` (we still record all events for auditing).
- No change to the auto-freeze logic.
- No UI changes.

## Files
- `supabase/functions/kind-cron-87003-monitoring-unregistered-coins/index.ts`
