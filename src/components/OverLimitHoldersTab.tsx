import { Fragment, useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Snowflake, AlertTriangle, Loader2, Flame, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { usePublicWalletBalances, WalletWithBalance } from "@/hooks/usePublicWalletBalances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WALLET_TYPES = ["Main Wallet", "Wallet"];

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
  nostrHexId: string | null;
  totalBalance: number;
  walletCount: number;
  frozenCount: number;
  wallets: WalletWithBalance[];
}

const OverLimitHoldersTab = () => {
  const { walletBalances, isLoading, fxRates } = usePublicWalletBalances(WALLET_TYPES);
  const [limit, setLimit] = useState<number | null>(null);
  const [showOnlyOver, setShowOnlyOver] = useState(true);
  const [selectedHolder, setSelectedHolder] = useState<Holder | null>(null);
  const [freezeReason, setFreezeReason] = useState("frozen_max_cap");
  const [isFreezing, setIsFreezing] = useState(false);
  const [frozenKeys, setFrozenKeys] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    supabase
      .from("system_parameters")
      .select("max_cap_lanas_on_split")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.max_cap_lanas_on_split;
        if (v) setLimit(parseFloat(v));
      });
  }, []);

  const holders = useMemo<Holder[]>(() => {
    const map = new Map<string, Holder>();
    for (const w of walletBalances) {
      const key = w.main_wallet_id || w.nostr_hex_id || w.name || "unknown";
      const name = w.display_name || w.name || "(Unknown)";
      if (!map.has(key)) {
        map.set(key, {
          key, name,
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
    return Array.from(map.values())
      .filter(h => h.totalBalance > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance);
  }, [walletBalances]);

  const eurRate = fxRates?.EUR ?? 0;
  const overLimit = limit != null ? holders.filter(h => h.totalBalance > limit) : [];
  const displayed = showOnlyOver ? overLimit : holders;
  const totalExcess = limit != null
    ? holders.reduce((sum, h) => sum + Math.max(0, h.totalBalance - limit), 0)
    : 0;

  const fmtLana = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  const fmtEur = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleFreezeConfirm = async () => {
    if (!selectedHolder) return;
    const toFreeze = selectedHolder.wallets.filter(w => !w.frozen && w.balance > 0).map(w => w.id);
    if (toFreeze.length === 0) {
      toast.info("No wallets with balance to freeze");
      setSelectedHolder(null);
      return;
    }
    setIsFreezing(true);
    try {
      const { error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: toFreeze,
          freeze: true,
          freeze_reason: freezeReason,
          nostr_hex_id: selectedHolder.nostrHexId,
        },
      });
      if (error) throw error;
      toast.success(`Froze ${toFreeze.length} wallet${toFreeze.length === 1 ? "" : "s"} for ${selectedHolder.name}`);
      setFrozenKeys(prev => new Set(prev).add(selectedHolder.key));
      setSelectedHolder(null);
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
            <Flame className="h-5 w-5 text-primary" />
            Lanaholders Over Limit
          </CardTitle>
          <CardDescription>
            Holders ranked by total LANA across <strong>Main Wallet</strong> and <strong>Wallet</strong> types.
            Max cap from KIND 38888 (<code>max_cap_lanas_on_split</code>): <strong>{limit != null ? `${fmtLana(limit)} LANA` : "—"}</strong>
            {eurRate > 0 && limit != null && <> (≈ €{fmtEur(limit * eurRate)})</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-sky-50 dark:bg-sky-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Total LANA waiting to enter circulation (excess above cap)
            </div>
            <div className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-300">
              {fmtLana(totalExcess)} LANA
              {eurRate > 0 && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  ≈ €{fmtEur(totalExcess * eurRate)}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Sum of (balance − {limit != null ? fmtLana(limit) : "—"}) across {overLimit.length} over-limit holder{overLimit.length === 1 ? "" : "s"}.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={showOnlyOver ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOnlyOver(true)}
            >
              Over limit only ({overLimit.length})
            </Button>
            <Button
              variant={!showOnlyOver ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOnlyOver(false)}
            >
              All holders ({holders.length})
            </Button>
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
                    <TableHead className="text-right">Excess</TableHead>
                    <TableHead className="text-right">EUR</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No holders found
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayed.map((h, idx) => {
                      const isOver = limit != null && h.totalBalance > limit;
                      const allFrozen = h.frozenCount === h.walletCount && h.walletCount > 0;
                      const justFrozen = frozenKeys.has(h.key);
                      const isOpen = expanded.has(h.key);
                      return (
                        <Fragment key={h.key}>
                        <TableRow
                          className={cn(
                            "cursor-pointer",
                            isOver && !allFrozen && "bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-950/50",
                          )}
                          onClick={() => toggleExpand(h.key)}
                        >
                          <TableCell>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {isOver && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                              <span className="font-medium">{h.name}</span>
                            </div>
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
                          <TableCell className={cn(
                            "text-right font-medium",
                            isOver ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground"
                          )}>
                            {limit != null && h.totalBalance > limit
                              ? `+${fmtLana(h.totalBalance - limit)}`
                              : "—"}
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
                            ) : isOver ? (
                              <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                                Over limit
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
                              disabled={allFrozen || !h.nostrHexId}
                              onClick={(e) => { e.stopPropagation(); setSelectedHolder(h); setFreezeReason(isOver ? "frozen_max_cap" : "frozen_too_wild"); }}
                            >
                              <Snowflake className="h-3.5 w-3.5" />
                              Freeze all
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={9} className="p-0">
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
                                    {h.wallets
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
                                            {fmtLana(w.balance)} LANA
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
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedHolder} onOpenChange={(o) => !o && setSelectedHolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-destructive" />
              Freeze all wallets for {selectedHolder?.name}
            </DialogTitle>
            <DialogDescription>
              This will freeze {selectedHolder?.wallets.filter(w => !w.frozen).length ?? 0} wallet(s)
              ({WALLET_TYPES.join(" + ")}) totalling {selectedHolder ? fmtLana(selectedHolder.totalBalance) : 0} LANA.
              Action is broadcast via KIND 30889 to all relays.
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
            <Button variant="outline" onClick={() => setSelectedHolder(null)} disabled={isFreezing}>Cancel</Button>
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

export default OverLimitHoldersTab;
