import { Fragment, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Snowflake, Loader2, Sparkles, Search, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { usePublicWalletBalances, WalletWithBalance } from "@/hooks/usePublicWalletBalances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WALLET_TYPES = ["Lana8Wonder"];

const FREEZE_CODES = [
  { value: "frozen_max_cap", label: "Maximum Cap Exceeded" },
  { value: "frozen_l8w", label: "Late Wallet Registration" },
  { value: "frozen_too_wild", label: "Suspicious Activity" },
  { value: "frozen_unreg_Lanas", label: "Unregistered Lanas Exceeded" },
  { value: "frozen_lanapays_outdated", label: "Out-dated Wallet for LanaPays.Us" },
  { value: "frozen_retail_unallowed", label: "Retail Wallet — un-allowed transactions" },
  { value: "frozen_retail_over_limit", label: "Retail Wallet — over the Limit" },
];

interface Holder {
  key: string;
  name: string;
  realName: string | null;
  nostrHexId: string | null;
  totalBalance: number;
  walletCount: number;
  frozenCount: number;
  wallets: WalletWithBalance[];
}

type FreezeTarget =
  | { kind: "holder"; holder: Holder }
  | { kind: "wallet"; holder: Holder; wallet: WalletWithBalance };

const Lana8WonderHoldersTab = () => {
  const { walletBalances, isLoading, fxRates } = usePublicWalletBalances(WALLET_TYPES);
  const [target, setTarget] = useState<FreezeTarget | null>(null);
  const [freezeReason, setFreezeReason] = useState("frozen_too_wild");
  const [isFreezing, setIsFreezing] = useState(false);
  const [frozenKeys, setFrozenKeys] = useState<Set<string>>(new Set());
  const [frozenWalletIds, setFrozenWalletIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (key: string) => {
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

  const holders = useMemo<Holder[]>(() => {
    const map = new Map<string, Holder>();
    for (const w of walletBalances) {
      const key = w.main_wallet_id || w.nostr_hex_id || w.name || "unknown";
      const name = w.display_name || w.name || "(Unknown)";
      if (!map.has(key)) {
        map.set(key, {
          key, name,
          realName: w.name ?? null,
          nostrHexId: w.nostr_hex_id ?? null,
          totalBalance: 0, walletCount: 0, frozenCount: 0, wallets: [],
        });
      }
      const h = map.get(key)!;
      h.totalBalance += w.balance;
      h.walletCount += 1;
      h.wallets.push(w);
      if (w.frozen) h.frozenCount += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.totalBalance - a.totalBalance);
  }, [walletBalances]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return holders;
    return holders.filter(h =>
      h.name.toLowerCase().includes(q) ||
      (h.realName?.toLowerCase().includes(q) ?? false) ||
      (h.nostrHexId?.toLowerCase().includes(q) ?? false) ||
      h.wallets.some(w => w.wallet_id?.toLowerCase().includes(q))
    );
  }, [holders, search]);

  const eurRate = fxRates?.EUR ?? 0;
  const grandTotal = filtered.reduce((s, h) => s + h.totalBalance, 0);

  const fmtLana = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  const fmtEur = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleFreezeConfirm = async () => {
    if (!target) return;
    const holder = target.holder;
    const toFreeze =
      target.kind === "wallet"
        ? [target.wallet.id]
        : holder.wallets.filter(w => !w.frozen && w.balance > 0).map(w => w.id);

    if (toFreeze.length === 0) {
      toast.info("Nothing to freeze");
      setTarget(null);
      return;
    }
    setIsFreezing(true);
    try {
      const { error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: toFreeze,
          freeze: true,
          freeze_reason: freezeReason,
          nostr_hex_id: holder.nostrHexId,
        },
      });
      if (error) throw error;
      toast.success(
        target.kind === "wallet"
          ? `Froze wallet for ${holder.name}`
          : `Froze ${toFreeze.length} Lana8Wonder wallet${toFreeze.length === 1 ? "" : "s"} for ${holder.name}`
      );
      if (target.kind === "wallet") {
        setFrozenWalletIds(prev => new Set(prev).add(target.wallet.id));
      } else {
        setFrozenKeys(prev => new Set(prev).add(holder.key));
      }
      setTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Error freezing wallets");
    } finally {
      setIsFreezing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Lana8Wonder Holders
          </CardTitle>
          <CardDescription>
            Holders ranked by total LANA across <strong>Lana8Wonder</strong> wallets — {filtered.length} holders, total {fmtLana(grandTotal)} LANA
            {eurRate > 0 && <> (≈ €{fmtEur(grandTotal * eurRate)})</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or wallet ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Wallets</TableHead>
                    <TableHead className="text-right">LANA</TableHead>
                    <TableHead className="text-right">EUR</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No Lana8Wonder holders found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((h, idx) => {
                      const allFrozen = h.frozenCount === h.walletCount && h.walletCount > 0;
                      const justFrozen = frozenKeys.has(h.key);
                      const isOpen = expanded.has(h.key);
                      const freezable = h.wallets.filter(w => !w.frozen && !frozenWalletIds.has(w.id) && w.balance > 0).length;
                      return (
                        <Fragment key={h.key}>
                          <TableRow className="cursor-pointer" onClick={() => toggleExpand(h.key)}>
                            <TableCell>
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>
                              <span className="font-medium">{h.name}</span>
                              {h.nostrHexId && (
                                <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[260px]">
                                  {h.nostrHexId}
                                </div>
                              )}
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
                              {allFrozen || justFrozen ? (
                                <Badge variant="destructive" className="gap-1">
                                  <Snowflake className="h-3 w-3" />
                                  Frozen
                                </Badge>
                              ) : h.frozenCount > 0 ? (
                                <Badge variant="outline" className="gap-1 border-sky-300 text-sky-700 dark:text-sky-300">
                                  <Snowflake className="h-3 w-3" />
                                  {h.frozenCount}/{h.walletCount}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">Active</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="gap-1"
                                disabled={allFrozen || !h.nostrHexId || freezable === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTarget({ kind: "holder", holder: h });
                                  setFreezeReason("frozen_too_wild");
                                }}
                              >
                                <Snowflake className="h-3.5 w-3.5" />
                                Freeze all ({freezable})
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={8} className="p-0">
                                <div className="p-4">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Wallet Type</TableHead>
                                        <TableHead>Wallet ID</TableHead>
                                        <TableHead className="text-center">Split</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {h.wallets
                                        .slice()
                                        .sort((a, b) => b.balance - a.balance)
                                        .map((w) => {
                                          const isFrozen = w.frozen || frozenWalletIds.has(w.id);
                                          return (
                                            <TableRow key={w.id} className={cn(isFrozen && "bg-sky-50 dark:bg-sky-950/30")}>
                                              <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                  {isFrozen && <Snowflake className="h-3.5 w-3.5 text-sky-500" />}
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
                                                {fmtLana(w.balance)} LANA
                                              </TableCell>
                                              <TableCell className="text-center">
                                                {isFrozen ? (
                                                  <Badge variant="destructive" className="gap-1">
                                                    <Snowflake className="h-3 w-3" />
                                                    Frozen
                                                  </Badge>
                                                ) : (
                                                  <Badge variant="outline" className="text-muted-foreground">Active</Badge>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <Button
                                                  size="sm"
                                                  variant="destructive"
                                                  className="gap-1"
                                                  disabled={isFrozen || !h.nostrHexId}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTarget({ kind: "wallet", holder: h, wallet: w });
                                                    setFreezeReason("frozen_too_wild");
                                                  }}
                                                >
                                                  <Snowflake className="h-3.5 w-3.5" />
                                                  Freeze
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
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
          </CardContent>
        </Card>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-destructive" />
              {target?.kind === "wallet"
                ? `Freeze wallet for ${target.holder.name}`
                : `Freeze all Lana8Wonder wallets for ${target?.holder.name}`}
            </DialogTitle>
            <DialogDescription>
              {target?.kind === "wallet" ? (
                <>
                  This will freeze a single Lana8Wonder wallet holding {fmtLana(target.wallet.balance)} LANA.
                </>
              ) : target ? (
                <>
                  This will freeze {target.holder.wallets.filter(w => !w.frozen && w.balance > 0).length} Lana8Wonder wallet(s)
                  totalling {fmtLana(target.holder.totalBalance)} LANA.
                </>
              ) : null}
              {" "}Action is broadcast via KIND 30889 to all relays.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={freezeReason} onValueChange={setFreezeReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select freeze reason" />
              </SelectTrigger>
              <SelectContent>
                {FREEZE_CODES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={isFreezing}>Cancel</Button>
            <Button variant="destructive" onClick={handleFreezeConfirm} disabled={isFreezing} className="gap-2">
              {isFreezing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className="h-4 w-4" />}
              Confirm Freeze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Lana8WonderHoldersTab;
