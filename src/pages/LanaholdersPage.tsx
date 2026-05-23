import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Snowflake } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { usePublicWalletBalances, WalletWithBalance } from "@/hooks/usePublicWalletBalances";
import { cn } from "@/lib/utils";

// All wallet types EXCEPT Lana.Discount
const WALLET_TYPES = ["Wallet", "Main Wallet", "Knights", "LanaPays.Us", "Lana8Wonder", "Retail"];

interface Holder {
  key: string;
  name: string;
  totalBalance: number;
  walletCount: number;
  anyFrozen: boolean;
  frozenCount: number;
  wallets: WalletWithBalance[];
}

const LanaholdersPage = () => {
  const navigate = useNavigate();
  const { walletBalances, isLoading, fxRates } = usePublicWalletBalances(WALLET_TYPES);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const holders = useMemo<Holder[]>(() => {
    const map = new Map<string, Holder>();
    for (const w of walletBalances) {
      const key = w.main_wallet_id || w.nostr_hex_id || w.name || "unknown";
      const name = w.display_name || w.name || "(Unknown)";
      if (!map.has(key)) {
        map.set(key, { key, name, totalBalance: 0, walletCount: 0, anyFrozen: false, frozenCount: 0, wallets: [] });
      }
      const h = map.get(key)!;
      h.totalBalance += w.balance;
      h.walletCount += 1;
      h.wallets.push(w);
      if (w.frozen) { h.frozenCount += 1; h.anyFrozen = true; }
    }
    const arr = Array.from(map.values()).filter(h => h.totalBalance > 0);
    arr.sort((a, b) => sortDir === "desc" ? b.totalBalance - a.totalBalance : a.totalBalance - b.totalBalance);
    return arr;
  }, [walletBalances, sortDir]);

  const eurRate = fxRates?.EUR ?? 0;
  const grandTotal = useMemo(() => holders.reduce((s, h) => s + h.totalBalance, 0), [holders]);

  const fmtLana = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
  const fmtEur = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card className="p-4 sm:p-6">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Lanaholders</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Ranked by total LANA held across all wallet types (excluding Lana.Discount) — {holders.length} holders
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Grand total</div>
              <div className="font-bold text-lg text-primary">{fmtLana(grandTotal)} LANA</div>
              {eurRate > 0 && (
                <div className="text-xs text-muted-foreground">≈ €{fmtEur(grandTotal * eurRate)}</div>
              )}
            </div>
          </div>

          {eurRate > 0 && (
            <div className="mb-4 p-3 rounded-lg border bg-muted/30 flex flex-wrap gap-3 items-center text-sm">
              <span className="font-medium text-muted-foreground">FX rate (Kind 38888):</span>
              <Badge variant="outline">1 LANA = €{eurRate.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 8 })}</Badge>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Wallets</TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 -mr-3 font-medium"
                        onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                      >
                        LANA {sortDir === "desc" ? "↓" : "↑"}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">EUR</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No Lanaholders found
                      </TableCell>
                    </TableRow>
                  ) : (
                    holders.map((h, idx) => (
                      <TableRow
                        key={h.key}
                        className={cn(h.anyFrozen && "bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-950/50")}
                      >
                        <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {h.anyFrozen && <Snowflake className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
                            <span className="font-medium">{h.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{h.walletCount}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmtLana(h.totalBalance)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {eurRate > 0 ? `€${fmtEur(h.totalBalance * eurRate)}` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {h.anyFrozen ? (
                            <Badge variant="outline" className="gap-1 border-sky-300 text-sky-700 dark:text-sky-300">
                              <Snowflake className="h-3 w-3" />
                              {h.frozenCount}/{h.walletCount} frozen
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Active</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default LanaholdersPage;
