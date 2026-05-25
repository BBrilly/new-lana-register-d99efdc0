import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Snowflake, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { usePublicWalletBalances, WalletWithBalance } from "@/hooks/usePublicWalletBalances";
import { cn } from "@/lib/utils";

interface Group {
  key: string;
  name: string;
  totalBalance: number;
  walletCount: number;
  frozenCount: number;
  anyFrozen: boolean;
  wallets: WalletWithBalance[];
}

const RetailWalletsPage = () => {
  const navigate = useNavigate();
  const { walletBalances, isLoading, fxRates, copiedId, copyWalletId } = usePublicWalletBalances(["Retail"]);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const w of walletBalances) {
      const key = w.main_wallet_id || w.nostr_hex_id || w.name || "unknown";
      const name = w.display_name || w.name || "(Unknown)";
      if (!map.has(key)) {
        map.set(key, { key, name, totalBalance: 0, walletCount: 0, frozenCount: 0, anyFrozen: false, wallets: [] });
      }
      const g = map.get(key)!;
      g.totalBalance += w.balance;
      g.walletCount += 1;
      g.wallets.push(w);
      if (w.frozen) { g.frozenCount += 1; g.anyFrozen = true; }
    }
    const arr = Array.from(map.values());
    arr.forEach(g => g.wallets.sort((a, b) => b.balance - a.balance));
    arr.sort((a, b) => sortDir === "desc" ? b.totalBalance - a.totalBalance : a.totalBalance - b.totalBalance);
    return arr;
  }, [walletBalances, sortDir]);

  const eurRate = fxRates?.EUR ?? 0;
  const grandTotal = useMemo(() => groups.reduce((s, g) => s + g.totalBalance, 0), [groups]);

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
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Retail Wallets</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Grouped by user, sorted by total LANA — {groups.length} users / {walletBalances.length} wallets
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

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="text-center">Wallets</TableHead>
                    <TableHead className="text-right">
                      <Button variant="ghost" size="sm" className="gap-1 -mr-3 font-medium"
                        onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}>
                        Total LANA {sortDir === "desc" ? "↓" : "↑"}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">EUR</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No Retail wallets found
                      </TableCell>
                    </TableRow>
                  ) : (
                    groups.map((g, idx) => {
                      const isOpen = !!expanded[g.key];
                      return (
                        <>
                          <TableRow
                            key={g.key}
                            className={cn("cursor-pointer", g.anyFrozen && "bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-950/50")}
                            onClick={() => setExpanded(e => ({ ...e, [g.key]: !e[g.key] }))}
                          >
                            <TableCell className="p-2 text-muted-foreground">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {g.anyFrozen && <Snowflake className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
                                <span className="font-medium">{g.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{g.walletCount}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{fmtLana(g.totalBalance)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {eurRate > 0 ? `€${fmtEur(g.totalBalance * eurRate)}` : "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              {g.anyFrozen ? (
                                <Badge variant="outline" className="gap-1 border-sky-300 text-sky-700 dark:text-sky-300">
                                  <Snowflake className="h-3 w-3" />
                                  {g.frozenCount}/{g.walletCount} frozen
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">Active</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                          {isOpen && g.wallets.map(w => (
                            <TableRow key={w.id} className={cn("bg-muted/20", w.frozen && "bg-sky-50/60 dark:bg-sky-950/20")}>
                              <TableCell></TableCell>
                              <TableCell></TableCell>
                              <TableCell colSpan={2}>
                                <div className="flex items-center gap-2 text-xs">
                                  {w.frozen && <Snowflake className="h-3 w-3 text-sky-500 shrink-0" />}
                                  <code className="font-mono break-all text-muted-foreground">{w.wallet_id}</code>
                                  {w.wallet_id && (
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                                      onClick={(e) => { e.stopPropagation(); copyWalletId(w.wallet_id!); }}>
                                      {copiedId === w.wallet_id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-sm">{fmtLana(w.balance)}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {eurRate > 0 ? `€${fmtEur(w.balance * eurRate)}` : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                {w.frozen && (
                                  <Badge variant="outline" className="text-xs gap-1 border-sky-300 text-sky-700 dark:text-sky-300">
                                    <Snowflake className="h-3 w-3" /> frozen
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      );
                    })
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

export default RetailWalletsPage;
