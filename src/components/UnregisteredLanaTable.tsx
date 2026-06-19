import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Copy, ExternalLink, Snowflake } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { SortField, UnregisteredLanaRow } from "@/hooks/useUnregisteredLanaEvents";

interface Props {
  rows: UnregisteredLanaRow[];
  isLoading: boolean;
  totalLana: number;
  count: number;
  title: string;
  subtitle: string;
  emptyMessage: string;
  showFrozenColumn?: boolean;
  sortField: SortField;
  sortDirection: "asc" | "desc";
  toggleSort: (f: SortField) => void;
  limit?: number | null;
}

const fmtLana = (lana: number) => lana.toLocaleString(undefined, { maximumFractionDigits: 8 });
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString();
};
const truncate = (s: string, n = 14) => (s.length <= n ? s : `${s.slice(0, 6)}…${s.slice(-4)}`);

const UnregisteredLanaTable = ({
  rows, isLoading, totalLana, count, title, subtitle, emptyMessage,
  showFrozenColumn, sortField, sortDirection, toggleSort, limit,
}: Props) => {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    toast.success("Copied");
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-sm">Count: {count}</Badge>
          <Badge variant="secondary" className="text-sm font-mono">
            Total: {totalLana.toLocaleString(undefined, { maximumFractionDigits: 8 })} LANA
          </Badge>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3" onClick={() => toggleSort("detected_at")}>
                  Detected <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">
                <Button variant="ghost" size="sm" className="-mr-3" onClick={() => toggleSort("unregistered_amount")}>
                  Amount (LANA) <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>87003</TableHead>
              {showFrozenColumn && <TableHead>Status</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={showFrozenColumn ? 7 : 6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={showFrozenColumn ? 7 : 6} className="text-center py-8 text-muted-foreground">{emptyMessage}</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(r.detected_at)}</TableCell>
                <TableCell>
                  {r.wallet_address ? (
                    <button
                      onClick={() => copy(r.wallet_address!)}
                      className="font-mono text-xs hover:text-primary inline-flex items-center gap-1 break-all"
                      title={r.wallet_address}
                    >
                      {truncate(r.wallet_address)}
                      <Copy className={`h-3 w-3 ${copied === r.wallet_address ? "text-primary" : "opacity-50"}`} />
                    </button>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{r.wallet_type ?? "—"}</Badge></TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtLana(r.unregistered_amount)}</TableCell>
                <TableCell className="max-w-xs">
                  <span className="text-xs text-muted-foreground line-clamp-2" title={r.notes ?? ""}>
                    {r.notes ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  {r.nostr_87003_event_id ? (
                    <a
                      href={`https://nostr.band/${r.nostr_87003_event_id}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs font-mono text-primary inline-flex items-center gap-1 hover:underline"
                      title={r.nostr_87003_event_id}
                    >
                      {truncate(r.nostr_87003_event_id, 12)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                {showFrozenColumn && (
                  <TableCell>
                    {r.frozen ? (
                      <Badge variant="secondary" className="bg-sky-50 text-sky-900 gap-1">
                        <Snowflake className="h-3 w-3" />
                        {r.freeze_reason ?? "frozen"}
                      </Badge>
                    ) : <span className="text-xs text-muted-foreground">active</span>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default UnregisteredLanaTable;
