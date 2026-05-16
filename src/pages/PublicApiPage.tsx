import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const ENDPOINT = `https://${PROJECT_ID}.functions.supabase.co/public-stats`;

const CodeBlock = ({ code, lang = "" }: { code: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
        <code className={`language-${lang}`}>{code}</code>
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-2 top-2 h-7 w-7"
        onClick={copy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
};

const PublicApiPage = () => {
  const [sample, setSample] = useState<string>("Loading…");

  useEffect(() => {
    fetch(ENDPOINT)
      .then((r) => r.json())
      .then((j) => setSample(JSON.stringify(j, null, 2)))
      .catch((e) => setSample(`Error: ${e.message}`));
  }, []);

  const fetchExample = `fetch("${ENDPOINT}")
  .then(r => r.json())
  .then(data => {
    console.log("Registered wallets:", data.registered_wallets_count);
    console.log("Total registered LANA:", data.total_registered_lana);
    console.log("Current split:", data.current_split);
  });`;

  const curlExample = `curl ${ENDPOINT}`;

  const schema = `{
  "generated_at": "ISO timestamp",
  "source": "https://www.lanawatch.us",

  // Total number of registered wallets in the registry
  "registered_wallets_count": number,

  // Sum of all registered LANA (latest balance snapshot, matches Balance history tab)
  "total_registered_lana": number,

  // Number of transactions registered today (UTC)
  "transactions_today_count": number,

  // Total LANA amount of today's transactions (UTC)
  "transactions_today_total_lana": number,

  // All-time number of transactions in the registry
  "transactions_all_time_count": number,

  // All-time sum of LANA across all transactions
  "transactions_all_time_total_lana": number,

  // Last 30 days of transactions (oldest first); count + daily LANA total
  "transactions_per_day_last_30": [
    { "date": "YYYY-MM-DD", "count": number, "total_amount_lana": number }
  ],

  // Wallets of type "Lana.Discount"
  "lana_discount_wallets": [
    { "wallet_id": "L...", "name": "string|null" }
  ],

  // Wallets of type "LanaPays.Us" (with the split they were created in)
  "lanapays_us_wallets": [
    { "wallet_id": "L...", "split_created": number|null, "name": "string|null" }
  ],

  // Current split number from system parameters (KIND 38888)
  "current_split": number|null,

  // LanaKnight transactions registered in the CURRENT split only
  "lanaknight_transactions_current_split": [
    {
      "transaction_id": "string|null",
      "block_id": number|null,
      "amount": number,
      "detected_at": "ISO timestamp",
      "split": number,
      "wallet_address": "L...|null",
      "wallet_name": "string|null"
    }
  ]
}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Public Data API</h1>
          <p className="mt-2 text-muted-foreground">
            A free, read-only JSON endpoint that any website or AI agent can call to embed
            live data from the Decentralised Lana Register. CORS is open. No API key
            required. Cached for 60 seconds.
          </p>
        </header>

        <Card className="mb-6 p-6">
          <h2 className="mb-3 text-lg font-semibold">Endpoint</h2>
          <CodeBlock code={ENDPOINT} />
          <div className="mt-3">
            <a
              href={ENDPOINT}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Open in browser <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Card>

        <Card className="mb-6 p-6">
          <h2 className="mb-3 text-lg font-semibold">What it returns</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            A single JSON object with the following shape (all values come directly from
            the database — no Nostr filtering):
          </p>
          <CodeBlock code={schema} lang="json" />
        </Card>

        <Card className="mb-6 p-6">
          <h2 className="mb-3 text-lg font-semibold">Examples</h2>
          <h3 className="mt-4 mb-2 text-sm font-semibold">JavaScript (browser)</h3>
          <CodeBlock code={fetchExample} lang="js" />
          <h3 className="mt-4 mb-2 text-sm font-semibold">cURL</h3>
          <CodeBlock code={curlExample} lang="bash" />
        </Card>

        <Card className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Live response preview</h2>
          <CodeBlock code={sample} lang="json" />
        </Card>
      </div>
    </div>
  );
};

export default PublicApiPage;
