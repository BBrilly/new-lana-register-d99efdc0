import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Snowflake, Loader2, Wallet as WalletIcon } from "lucide-react";
import { usePublicWalletBalances, WalletWithBalance } from "@/hooks/usePublicWalletBalances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WALLET_TYPES = ["LanaPays.Us"];

const FREEZE_CODES = [
  { value: "frozen_l8w", label: "Late Wallet Registration" },
  { value: "frozen_max_cap", label: "Maximum Cap Exceeded" },
  { value: "frozen_too_wild", label: "Suspicious Activity" },
  { value: "frozen_unreg_Lanas", label: "Unregistered Lanas Exceeded" },
  { value: "frozen_lanapays_outdated", label: "Out-dated Wallet for LanaPays.Us" },
  { value: "frozen_retail_unallowed", label: "Retail Wallet — un-allowed transactions" },
  { value: "frozen_retail_over_limit", label: "Retail Wallet — over the Limit" },
];

const LanaPaysHoldersTab = () => {
  const { walletBalances, isLoading, fxRates } = usePublicWalletBalances(WALLET_TYPES);
  const [currentSplit, setCurrentSplit] = useState<number | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletWithBalance | null>(null);
  const [freezeReason, setFreezeReason] = useState("frozen_l8w");
  const [isFreezing, setIsFreezing] = useState(false);
  const [frozenIds, setFrozenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("system_parameters")
      .select("split")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.split;
        if (v) setCurrentSplit(parseInt(v, 10));
      });
  }, []);

  const eligibleMaxSplit = currentSplit != null ? currentSplit - 2 : null;

  const sorted = useMemo(() => {
    return [...walletBalances]
      .filter(w => w.balance > 0 || w.split_created != null)
      .sort((a, b) => b.balance - a.balance);
  }, [walletBalances]);

  const eurRate = fxRates?.EUR ?? 0;
  const grandTotal = sorted.reduce((s, w) => s + w.balance, 0);

  const fmtLana = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  const fmtEur = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isEligible = (w: WalletWithBalance) =>
    !w.frozen &&
    w.split_created != null &&
    eligibleMaxSplit != null &&
    w.split_created <= eligibleMaxSplit;

  const handleFreezeConfirm = async () => {
    if (!selectedWallet) return;
    setIsFreezing(true);
    try {
      const { error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: [selectedWallet.id],
          freeze: true,
          freeze_reason: freezeReason,
          nostr_hex_id: selectedWallet.nostr_hex_id,
        },
      });
      if (error) throw error;
      toast.success(`Froze LanaPays.Us wallet for ${selectedWallet.display_name || selectedWallet.name}`);
      setFrozenIds(prev => new Set(prev).add(selectedWallet.id));
      setSelectedWallet(null);
    } catch (err: any) {
      toast.error(err.message || "Error freezing wallet");
    } finally {
      setIsFreezing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WalletIcon className="h-5 w-5 text-primary" />
            LanaPays.Us Wallets
          </CardTitle>
          <CardDescription>
            Per-wallet view sorted by balance (largest first) — {sorted.length} wallets, total {fmtLana(grandTotal)} LANA
            {eurRate > 0 && <> (≈ €{fmtEur(grandTotal * eurRate)})</>}.
            Current split (KIND 38888): <strong>{currentSplit ?? "—"}</strong>.
            Freeze button shown for wallets created in split ≤ <strong>{eligibleMaxSplit ?? "—"}</strong> (current − 2 and older).
          </CardDescription>
        </CardHeader>
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
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Split</TableHead>
                    <TableHead className="text-right">LANA</TableHead>
                    <TableHead className="text-right">EUR</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No LanaPays.Us wallets found
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((w, idx) => {
                      const eligible = isEligible(w);
                      const wasFrozen = frozenIds.has(w.id) || w.frozen;
                      return (
                        <TableRow
                          key={w.id}
                          className={cn(eligible && !wasFrozen && "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/40")}
                        >
                          <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">{w.display_name || w.name || "(Unknown)"}</div>
                            <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[260px]">
                              {w.wallet_id}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {w.split_created != null ? (
                              <Badge variant={eligible ? "outline" : "secondary"} className={cn(eligible && "border-amber-400 text-amber-700 dark:text-amber-300")}>
                                {w.split_created}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{fmtLana(w.balance)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {eurRate > 0 ? `€${fmtEur(w.balance * eurRate)}` : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {wasFrozen ? (
                              <Badge variant="destructive" className="gap-1">
                                <Snowflake className="h-3 w-3" />
                                Frozen
                              </Badge>
                            ) : eligible ? (
                              <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                                Eligible
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
                              disabled={!eligible || !w.nostr_hex_id}
                              onClick={() => { setSelectedWallet(w); setFreezeReason("frozen_l8w"); }}
                            >
                              <Snowflake className="h-3.5 w-3.5" />
                              Freeze
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedWallet} onOpenChange={(o) => !o && setSelectedWallet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-destructive" />
              Freeze LanaPays.Us wallet
            </DialogTitle>
            <DialogDescription>
              {selectedWallet?.display_name || selectedWallet?.name} — split {selectedWallet?.split_created},
              balance {selectedWallet ? fmtLana(selectedWallet.balance) : 0} LANA.
              Broadcast via KIND 30889 to all relays.
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
            <Button variant="outline" onClick={() => setSelectedWallet(null)} disabled={isFreezing}>Cancel</Button>
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

export default LanaPaysHoldersTab;
