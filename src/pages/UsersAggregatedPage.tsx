import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronDown, ChevronRight, Copy, Check, Snowflake } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
}

const UsersAggregatedPage = () => {
  const navigate = useNavigate();
  const { walletBalances, isLoading } = usePublicWalletBalances(WALLET_TYPES);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const groups = useMemo<UserGroup[]>(() => {
    const map = new Map<string, UserGroup>();
    for (const w of walletBalances) {
      const key = w.main_wallet_id || w.nostr_hex_id || w.name || "unknown";
      const name = w.display_name || w.name || "(Unknown)";
      if (!map.has(key)) {
        map.set(key, { key, name, nostrHexId: w.nostr_hex_id ?? null, totalBalance: 0, wallets: [] });
      }
      const g = map.get(key)!;
      g.totalBalance += w.balance;
      g.wallets.push(w);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => sortDir === "desc" ? b.totalBalance - a.totalBalance : a.totalBalance - b.totalBalance);
    return arr;
  }, [walletBalances, sortDir]);

  const grandTotal = useMemo(() => groups.reduce((s, g) => s + g.totalBalance, 0), [groups]);

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(val);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card className="p-4 sm:p-6">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Users — Aggregated Balances</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Sum of "Wallet" and "Main Wallet" balances per user ({groups.length} users)
              </p>
            </div>
            <div className="text-right">
              <span className="text-sm text-muted-foreground">Grand total: </span>
              <span className="font-bold text-lg text-primary">
                {grandTotal.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
              </span>
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
                    <TableHead className="w-10"></TableHead>
                    <TableHead>#</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="text-center">Wallets</TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 -mr-3 font-medium"
                        onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
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
                      return (
                        <Fragment key={g.key}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => toggle(g.key)}
                          >
                            <TableCell>
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{g.name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{g.wallets.length}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {g.totalBalance.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow key={g.key + "-detail"} className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={5} className="p-0">
                                <div className="p-4">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Wallet Type</TableHead>
                                        <TableHead>Wallet ID</TableHead>
                                        <TableHead className="text-center">Split</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {g.wallets
                                        .slice()
                                        .sort((a, b) => b.balance - a.balance)
                                        .map((w) => (
                                          <TableRow key={w.id} className={cn(w.frozen && "bg-sky-50 dark:bg-sky-950/30")}>
                                            <TableCell>
                                              <div className="flex items-center gap-1.5">
                                                {w.frozen && <Snowflake className="h-3.5 w-3.5 text-sky-500" />}
                                                <Badge variant="outline" className="text-xs">{w.wallet_type}</Badge>
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
                                                    onClick={(e) => { e.stopPropagation(); copy(w.wallet_id!); }}
                                                  >
                                                    {copiedId === w.wallet_id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                                                  </Button>
                                                </div>
                                              ) : <span className="text-muted-foreground">-</span>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                              {w.split_created != null ? (
                                                <Badge variant="outline" className="text-xs font-mono">#{w.split_created}</Badge>
                                              ) : <span className="text-muted-foreground">-</span>}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                              {w.balance.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
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

export default UsersAggregatedPage;
