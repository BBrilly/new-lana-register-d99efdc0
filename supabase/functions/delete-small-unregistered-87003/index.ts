import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SimplePool, finalizeEvent } from 'https://esm.sh/nostr-tools@2.7.0';
import { decode } from 'https://esm.sh/nostr-tools@2.7.0/nip19';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function nsecToHex(nsec: string): string {
  const decoded = decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
  return Array.from(decoded.data as Uint8Array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

async function publishEvent(signedEvent: any, relays: string[]) {
  const pool = new SimplePool();
  const results: { relay: string; success: boolean; error?: string }[] = [];
  try {
    await Promise.all(
      relays.map(
        (relay) =>
          new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              results.push({ relay, success: false, error: 'timeout' });
              resolve();
            }, 10000);
            try {
              const pubs = pool.publish([relay], signedEvent);
              Promise.race([
                Promise.all(pubs),
                new Promise((_, rej) => setTimeout(() => rej(new Error('publish timeout')), 8000)),
              ])
                .then(() => {
                  clearTimeout(timeout);
                  results.push({ relay, success: true });
                  resolve();
                })
                .catch((e) => {
                  clearTimeout(timeout);
                  results.push({ relay, success: false, error: String(e?.message || e) });
                  resolve();
                });
            } catch (e: any) {
              clearTimeout(timeout);
              results.push({ relay, success: false, error: String(e?.message || e) });
              resolve();
            }
          })
      )
    );
  } finally {
    pool.close(relays);
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const maxAmount = Number(body.maxAmount ?? 1);
    const sinceToday = body.sinceToday !== false;
    const dryRun = body.dryRun === true;
    const batchSize = Math.min(Math.max(Number(body.batchSize ?? 100), 1), 250);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Load nsec
    const { data: keySetting, error: keyErr } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'nostr_registrar_nsec')
      .single();
    if (keyErr || !keySetting?.value) {
      return new Response(JSON.stringify({ success: false, error: 'nsec not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const privHex = nsecToHex(keySetting.value.trim());
    const privBytes = hexToBytes(privHex);

    // 2. Load relays
    const { data: sysParams } = await supabase
      .from('system_parameters')
      .select('relays')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    const relays = ((sysParams?.relays as string[]) || []).filter((r) => r.startsWith('wss://'));
    if (relays.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'no relays' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`📡 Using ${relays.length} relays`);

    // 3. Fetch candidates
    let q = supabase
      .from('unregistered_lana_events')
      .select('id, unregistered_amount, nostr_87003_event_id, nostr_dm_event_id, nostr_87003_published_at')
      .eq('nostr_87003_published', true)
      .lt('unregistered_amount', maxAmount)
      .eq('nostr_deletion_published', false)
      .not('nostr_87003_event_id', 'is', null)
      .limit(10000);
    if (sinceToday) {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      q = q.gte('nostr_87003_published_at', startOfDay.toISOString());
    }
    const { data: candidates, error: candErr } = await q;
    if (candErr) {
      return new Response(JSON.stringify({ success: false, error: candErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const total = candidates?.length || 0;
    console.log(`📋 Found ${total} candidates (maxAmount<${maxAmount}, sinceToday=${sinceToday})`);

    if (total === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, batches: 0, dryRun, message: 'nothing to delete' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          processed: total,
          batches: Math.ceil(total / batchSize),
          willPublishDeletionEvents: Math.ceil(total / batchSize) * 2,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Process batches
    const deletionEventIds: string[] = [];
    let batchCount = 0;
    let processed = 0;
    const content = 'Auto-cleanup: published in error for dust amount (<1 LANA)';

    for (let i = 0; i < candidates!.length; i += batchSize) {
      const batch = candidates!.slice(i, i + batchSize);
      batchCount++;

      const ids87003 = batch.map((b) => b.nostr_87003_event_id).filter(Boolean) as string[];
      const idsDm = batch.map((b) => b.nostr_dm_event_id).filter(Boolean) as string[];

      const batchDeletionIds: string[] = [];

      // Kind 5 for 87003
      if (ids87003.length > 0) {
        const evt = finalizeEvent(
          {
            kind: 5,
            created_at: Math.floor(Date.now() / 1000),
            tags: [...ids87003.map((id) => ['e', id]), ['k', '87003']],
            content,
          },
          privBytes
        );
        const res = await publishEvent(evt, relays);
        const ok = res.some((r) => r.success);
        console.log(`Batch ${batchCount}: Kind5/87003 ${evt.id} → ${res.filter((r) => r.success).length}/${relays.length} ok`);
        if (ok) {
          batchDeletionIds.push(evt.id);
          deletionEventIds.push(evt.id);
        }
      }

      // Kind 5 for DM (kind 4)
      if (idsDm.length > 0) {
        const evt = finalizeEvent(
          {
            kind: 5,
            created_at: Math.floor(Date.now() / 1000),
            tags: [...idsDm.map((id) => ['e', id]), ['k', '4']],
            content,
          },
          privBytes
        );
        const res = await publishEvent(evt, relays);
        const ok = res.some((r) => r.success);
        console.log(`Batch ${batchCount}: Kind5/DM ${evt.id} → ${res.filter((r) => r.success).length}/${relays.length} ok`);
        if (ok) {
          batchDeletionIds.push(evt.id);
          deletionEventIds.push(evt.id);
        }
      }

      // Mark DB rows
      if (batchDeletionIds.length > 0) {
        const { error: updErr } = await supabase
          .from('unregistered_lana_events')
          .update({
            nostr_deletion_published: true,
            nostr_deletion_event_ids: batchDeletionIds,
            nostr_deletion_published_at: new Date().toISOString(),
          })
          .in(
            'id',
            batch.map((b) => b.id)
          );
        if (updErr) console.error(`❌ DB update batch ${batchCount}:`, updErr.message);
        else processed += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dryRun: false,
        total,
        processed,
        batches: batchCount,
        deletionEventIds,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('Fatal:', e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
