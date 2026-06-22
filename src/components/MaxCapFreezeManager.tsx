import { Fragment, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Snowflake,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePublicWalletBalances, WalletWithBalance } from "@/hooks/usePublicWalletBalances";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WALLET_TYPES = ["Wallet", "Main Wallet"];

interface UserGroup {
  key: string;
  name: string;
  nostrHexId: string | null;
  totalBalance: number;
  wallets: WalletWithBalance[];
  frozenCount: number;
  anyFrozen: boolean;
}

const MaxCapFreezeManager = () => {
  const { walletBalances, isLoading, lanaLimits, fxRates } = usePublicWalletBalances(WALLET_TYPES);
  const [threshold, setThreshold] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [freezingId, setFreezingId] = useState<string | null>(null);

  const thresholdNum = useMemo(() => {
    const n = parseFloat(threshold);
    return isNaN(n) || n <= 0 ? null : n;
  }, [threshold]);

  const groups = useMemo<UserGroup[]>(() => {
    const map = new Map<string, UserGroup>();
    for (const w of walletBalances) {
      const key = w.main_wallet_id || w.nostr_hex_id || w.name || "unknown";
      const name = w.display_name || w.name || "(Unknown)";
      if (!map.has(key)) {
        map.set(key, {
          key,
          name,
          nostrHexId: w.nostr_hex_id ?? null,
          totalBalance: 0,
          wallets: [],
          frozenCount: 0,
          anyFrozen: false,
        });
      }
      const g = map.get(key)!;
      g.totalBalance += w.balance;
      g.wallets.push(w);
      if (w.frozen) {
        g.frozenCount += 1;
        g.anyFrozen = true;
      }
    }
    let arr = Array.from(map.values());
    if (thresholdNum !== null) {
      arr = arr.filter((g) => g.totalBalance > thresholdNum);
    }
    arr.sort((a, b) =>
      sortDir === "desc" ? b.totalBalance - a.totalBalance : a.totalBalance - b.totalBalance
    );
    return arr;
  }, [walletBalances, sortDir, thresholdNum]);

  const grandTotal = useMemo(() => groups.reduce((s, g) => s + g.totalBalance, 0), [groups]);
  const lanaLimit = lanaLimits?.EUR ?? null;
  const isOverLimit = (balance: number) => lanaLimit !== null && balance > lanaLimit;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(val);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFreeze = async (w: WalletWithBalance, nostrHexId: string | null) => {
    setFreezingId(w.id);
    try {
      const { error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: [w.id],
          freeze: true,
          freeze_reason: "frozen_max_cap",
          nostr_hex_id: nostrHexId || w.nostr_hex_id || "",
        },
      });
      if (error) throw error;
      toast.success(`Wallet ${w.wallet_id?.slice(0, 12)}... frozen (frozen_max_cap)`);
      // refresh after a brief delay
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      console.error("Freeze error:", err);
      toast.error(err.message || "Error freezing wallet");
    } finally {
      setFreezingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <CardTitle>Max Cap – Freeze by Balance</CardTitle>
        </div>
        <CardDescription>
          Aggregated balances per user (Wallet + Main Wallet). Expand a row to freeze individual
          wallets. Optionally enter a LANA threshold to filter users above it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex gap-2 max-w-sm">
            <Input
              type="number"
              placeholder="Filter: total LANA above…"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            {threshold && (
              <Button variant="outline" onClick={() => setThreshold("")}>
                Clear
              </Button>
            )}
          </div>
          <div className="text-sm text-right">
            <span className="text-muted-foreground">
              {groups.length} users · Total:{" "}
            </span>
            <span className="font-bold text-primary">
              {grandTotal.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              LANA
            </span>
          </div>
        </div>

        {lanaLimits && fxRates && (
          <div className="mb-4 p-3 rounded-lg border bg-muted/30 flex flex-wrap gap-3 items-center text-xs">
            <span className="font-medium text-muted-foreground">50 unit limit in LANA:</span>
            <Badge variant="outline">
              EUR:{" "}
              {lanaLimits.EUR.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Badge>
            <Badge variant="outline">
              GBP:{" "}
              {lanaLimits.GBP.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Badge>
            <Badge variant="outline">
              USD:{" "}
              {lanaLimits.USD.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Badge>
            <span className="ml-auto flex items-center gap-1 text-muted-foreground">
              <Snowflake className="h-3 w-3 text-sky-500" /> Frozen
              <span className="mx-1">|</span>
              <AlertTriangle className="h-3 w-3 text-sky-400" /> Over limit
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-center">Wallets</TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 -mr-3 font-medium"
                      onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                    >
                      Total Balance {sortDir === "desc" ? "↓" : "↑"}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((g, idx) => {
                    const isOpen = expanded.has(g.key);
                    const overLimit = isOverLimit(g.totalBalance) && !g.anyFrozen;
                    return (
                      <Fragment key={g.key}>
                        <TableRow
                          className={cn(
                            "cursor-pointer",
                            g.anyFrozen &&
                              "bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-950/50",
                            overLimit &&
                              "bg-sky-50/60 hover:bg-sky-100/60 dark:bg-sky-900/20 dark:hover:bg-sky-900/30"
                          )}
                          onClick={() => toggle(g.key)}
                        >
                          <TableCell>
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {g.anyFrozen && (
                                <Snowflake className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                              )}
                              <span
                                className={cn(
                                  "font-medium",
                                  overLimit && "text-sky-600 dark:text-sky-400 font-semibold"
                                )}
                              >
                                {g.name}
                              </span>
                              {g.anyFrozen && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] gap-1 border-sky-300 text-sky-700 dark:text-sky-300"
                                >
                                  {g.frozenCount}/{g.wallets.length} frozen
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{g.wallets.length}</Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              overLimit && "text-sky-600 dark:text-sky-400"
                            )}
                          >
                            {overLimit && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                            {g.totalBalance.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 8,
                            })}{" "}
                            LANA
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow
                            key={g.key + "-detail"}
                            className="bg-muted/30 hover:bg-muted/30"
                          >
                            <TableCell colSpan={5} className="p-0">
                              <div className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Wallet Type</TableHead>
                                      <TableHead>Wallet ID</TableHead>
                                      <TableHead className="text-right">Balance</TableHead>
                                      <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {g.wallets
                                      .slice()
                                      .sort((a, b) => b.balance - a.balance)
                                      .map((w) => (
                                        <TableRow
                                          key={w.id}
                                          className={cn(
                                            w.frozen && "bg-sky-50 dark:bg-sky-950/30"
                                          )}
                                        >
                                          <TableCell>
                                            <div className="flex items-center gap-1.5">
                                              {w.frozen && (
                                                <Snowflake className="h-3.5 w-3.5 text-sky-500" />
                                              )}
                                              <Badge variant="outline" className="text-xs">
                                                {w.wallet_type}
                                              </Badge>
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            {w.wallet_id ? (
                                              <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs text-muted-foreground break-all">
                                                  {`${w.wallet_id.substring(0, 8)}...${w.wallet_id.slice(-6)}`}
                                                </span>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-6 w-6"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    copy(w.wallet_id!);
                                                  }}
                                                >
                                                  {copiedId === w.wallet_id ? (
                                                    <Check className="h-3 w-3 text-success" />
                                                  ) : (
                                                    <Copy className="h-3 w-3" />
                                                  )}
                                                </Button>
                                              </div>
                                            ) : (
                                              <span className="text-muted-foreground">-</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right font-semibold">
                                            {w.balance.toLocaleString("en-US", {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 8,
                                            })}{" "}
                                            LANA
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {w.frozen ? (
                                              <Badge variant="secondary" className="text-xs">
                                                Frozen
                                              </Badge>
                                            ) : (
                                              <Button
                                                variant="destructive"
                                                size="sm"
                                                className="gap-1"
                                                disabled={freezingId === w.id}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleFreeze(w, g.nostrHexId);
                                                }}
                                              >
                                                {freezingId === w.id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Snowflake className="h-3 w-3" />
                                                )}
                                                Freeze
                                              </Button>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MaxCapFreezeManager;
