# Cron Jobs Setup Guide

This document lists all cron jobs required for the application to function correctly.
After remixing or deploying to a new environment, you must set up these cron jobs.

## Prerequisites

Enable the `pg_cron` and `pg_net` extensions in your database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

## Required Cron Jobs

Replace `YOUR_PROJECT_REF` with your actual project reference ID and `YOUR_ANON_KEY` with your anon key.

---

### 1. Blockchain Monitor
**Interval:** Every minute (`* * * * *`)
**Purpose:** Monitors the blockchain for new blocks and transactions involving registered wallets.

```sql
SELECT cron.schedule(
  'blockchain-monitor',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/blockchain-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"automated": true}'::jsonb
  ) AS request_id;
  $$
);
```

---

### 2. KIND 87005 – New Lana Registration
**Interval:** Every 5 minutes (`*/5 * * * *`)
**Purpose:** Publishes KIND 87005 Nostr events for newly registered LANA coins.

```sql
SELECT cron.schedule(
  'kind-87005-new-lana-registration',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/kind-87005-new-lana-registration',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

### 3. KIND 87003 – Monitoring Unregistered Coins
**Interval:** Every 5 minutes (`*/5 * * * *`)
**Purpose:** Publishes KIND 87003 Nostr events for detected unregistered LANA transactions.

```sql
SELECT cron.schedule(
  'kind-cron-87003-monitoring-unregistered-coins',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/kind-cron-87003-monitoring-unregistered-coins',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

### 4. Sync Wallet KIND 30889
**Interval:** Every 10 minutes (`*/10 * * * *`)
**Purpose:** Syncs wallet data from KIND 30889 Nostr events (wallet registrations from LanaRegistrar).

```sql
SELECT cron.schedule(
  'sync-wallet-kind-30889',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-wallet-kind-30889',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

### 5. Sync Profile Data
**Interval:** Every 10 minutes (`*/10 * * * *`)
**Purpose:** Syncs Nostr profile data (name, display_name, picture) for all registered wallets.

```sql
SELECT cron.schedule(
  'sync-profile-data',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-profile-data',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

### 6. KIND 37772 – LanaKnight Registry
**Interval:** Every 10 minutes (`*/10 * * * *`)
**Purpose:** Publishes KIND 37772 Nostr events for the LanaKnight registry.

```sql
SELECT cron.schedule(
  'kind-cron-37772-lanaknight-registry',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/kind-cron-37772-lanaknight-registry',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

### 7. Sync System Parameters
**Interval:** Every hour (`0 * * * *`)
**Purpose:** Fetches and syncs system parameters (relays, exchange rates, trusted signers) from Nostr.

```sql
SELECT cron.schedule(
  'sync-system-parameters',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-system-parameters',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

## Summary Table

| # | Cron Job | Schedule | Frequency |
|---|---------|----------|-----------|
| 1 | `blockchain-monitor` | `* * * * *` | Every minute |
| 2 | `kind-87005-new-lana-registration` | `*/5 * * * *` | Every 5 minutes |
| 3 | `kind-cron-87003-monitoring-unregistered-coins` | `*/5 * * * *` | Every 5 minutes |
| 4 | `sync-wallet-kind-30889` | `*/10 * * * *` | Every 10 minutes |
| 5 | `sync-profile-data` | `*/10 * * * *` | Every 10 minutes |
| 6 | `kind-cron-37772-lanaknight-registry` | `*/10 * * * *` | Every 10 minutes |
| 7 | `sync-system-parameters` | `0 * * * *` | Hourly |

---

## 8. KIND 87057 — OWN Person Freeze / Unfreeze Monitor

**Interval:** Every 10 minutes (`*/10 * * * *`)
**Purpose:** Reads KIND 87057 facilitator notices from relays, verifies facilitator authority via KIND 87044/37044, stores them in `own_person_freeze_events`, freezes/unfreezes the person's wallets (reason `frozen_own_person`, with SPLIT bounds) and republishes KIND 87010 + KIND 30889.

```sql
SELECT cron.schedule(
  'kind-cron-87057-own-person-freeze-monitor',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/kind-cron-87057-own-person-freeze-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```
