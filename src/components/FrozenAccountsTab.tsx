import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Lock, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAddressBalances } from "@/hooks/useAddressBalances";

const FREEZE_CODES = [
  { value: "frozen_l8w", label: "Late Wallet Registration" },
  { value: "frozen_max_cap", label: "Maximum Cap Exceeded" },
  { value: "frozen_too_wild", label: "Suspicious Activity" },
  { value: "frozen_unreg_Lanas", label: "Unreg. Lanas Exceeded" },
  { value: "frozen_lanapays_outdated", label: "Out-dated LanaPays.Us" },
  { value: "frozen_retail_unallowed", label: "Retail — un-allowed TX" },
  { value: "frozen_retail_over_limit", label: "Retail — over the Limit" },
];

const FREEZE_LABELS: Record<string, string> = {
  frozen_l8w: "Late Registration",
  frozen_max_cap: "Max Cap Exceeded",
  frozen_too_wild: "Suspicious Activity",
  frozen_unreg_Lanas: "Unreg. Lanas Exceeded",
  frozen_lanapays_outdated: "Out-dated LanaPays.Us",
  frozen_retail_unallowed: "Retail — un-allowed TX",
  frozen_retail_over_limit: "Retail — over the Limit",
};

interface FrozenWallet {
  id: string;
  wallet_id: string | null;
  wallet_type: string;
  frozen: boolean;
  freeze_reason: string;
  owner_name: string | null;
  owner_display_name: string | null;
  nostr_hex_id: string | null;
  main_wallet_id: string;
  frozen_at: string | null;
}

const FrozenAccountsTab = () => {
  const queryClient = useQueryClient();
  const [selectedWallet, setSelectedWallet] = useState<FrozenWallet | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newReason, setNewReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const copyHex = async (e: React.MouseEvent, hex: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      toast.success("Nostr hex ID copied");
      setTimeout(() => setCopiedHex(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const { data: frozenWallets, isLoading } = useQuery({
    queryKey: ["frozen-wallets-admin"],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const allWallets: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("wallets")
          .select(`id, wallet_id, wallet_type, frozen, freeze_reason, main_wallet_id, main_wallet:main_wallets(name, display_name, nostr_hex_id)`)
          .eq("frozen", true)
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) { hasMore = false; }
        else {
          allWallets.push(...data);
          hasMore = data.length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }
      }

      return allWallets.map((w): FrozenWallet => ({
        id: w.id,
        wallet_id: w.wallet_id,
        wallet_type: w.wallet_type,
        frozen: w.frozen,
        freeze_reason: w.freeze_reason || "",
        owner_name: (w.main_wallet as any)?.name || null,
        owner_display_name: (w.main_wallet as any)?.display_name || null,
        nostr_hex_id: (w.main_wallet as any)?.nostr_hex_id || null,
        main_wallet_id: w.main_wallet_id,
      }));
    },
  });

  const addressList = (frozenWallets || []).map((w) => w.wallet_id);
  const { data: balanceMap, isLoading: balancesLoading } = useAddressBalances(addressList, "frozen-accounts");

  const handleRowClick = (wallet: FrozenWallet) => {
    setSelectedWallet(wallet);
    setNewReason(wallet.freeze_reason || "frozen_l8w");
    setDialogOpen(true);
  };

  const handleUpdateReason = async () => {
    if (!selectedWallet) return;
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: [selectedWallet.id],
          freeze: true,
          freeze_reason: newReason,
          nostr_hex_id: selectedWallet.nostr_hex_id,
        },
      });

      if (error) throw error;
      toast.success("Freeze reason updated and broadcasted to relays");
      queryClient.invalidateQueries({ queryKey: ["frozen-wallets-admin"] });
      setDialogOpen(false);
    } catch (err) {
      console.error("Error updating freeze reason:", err);
      toast.error("Failed to update freeze reason");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnfreeze = async () => {
    if (!selectedWallet) return;
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: [selectedWallet.id],
          freeze: false,
          nostr_hex_id: selectedWallet.nostr_hex_id,
        },
      });

      if (error) throw error;
      toast.success("Wallet unfrozen and broadcasted to relays");
      queryClient.invalidateQueries({ queryKey: ["frozen-wallets-admin"] });
      setDialogOpen(false);
    } catch (err) {
      console.error("Error unfreezing:", err);
      toast.error("Failed to unfreeze wallet");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-destructive" />
            <CardTitle>Frozen Accounts</CardTitle>
          </div>
          <CardDescription>
            All wallets currently marked as frozen ({frozenWallets?.length ?? 0} total). Click a row to manage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !frozenWallets || frozenWallets.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No frozen wallets found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Nostr Hex ID</TableHead>
                    <TableHead>Wallet Type</TableHead>
                    <TableHead>Wallet Address</TableHead>
                    <TableHead className="text-right">Balance (LANA)</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {frozenWallets.map((wallet, index) => (
                    <TableRow
                      key={wallet.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(wallet)}
                    >
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">
                        {wallet.owner_display_name || wallet.owner_name || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {wallet.nostr_hex_id ? (
                          <button
                            type="button"
                            onClick={(e) => copyHex(e, wallet.nostr_hex_id!)}
                            className="inline-flex items-center gap-1 hover:text-primary"
                            title={wallet.nostr_hex_id}
                          >
                            <span>{wallet.nostr_hex_id.slice(0, 8)}…{wallet.nostr_hex_id.slice(-6)}</span>
                            {copiedHex === wallet.nostr_hex_id ? (
                              <Check className="h-3 w-3 text-success" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-60" />
                            )}
                          </button>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{wallet.wallet_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {wallet.wallet_id
                          ? `${wallet.wallet_id.slice(0, 8)}...${wallet.wallet_id.slice(-6)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {balancesLoading && !balanceMap ? (
                          <span className="text-muted-foreground">…</span>
                        ) : wallet.wallet_id && balanceMap?.has(wallet.wallet_id) ? (
                          balanceMap.get(wallet.wallet_id)!.toFixed(2)
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {FREEZE_LABELS[wallet.freeze_reason] || wallet.freeze_reason || "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="gap-1">
                          <Lock className="h-3 w-3" />
                          Frozen
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Freeze Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Frozen Wallet</DialogTitle>
          </DialogHeader>
          {selectedWallet && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Owner:</span>
                <span className="font-medium">{selectedWallet.owner_display_name || selectedWallet.owner_name || "—"}</span>
                <span className="text-muted-foreground">Type:</span>
                <span>{selectedWallet.wallet_type}</span>
                <span className="text-muted-foreground">Address:</span>
                <span className="font-mono text-xs break-all">{selectedWallet.wallet_id || "—"}</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Freeze Reason</label>
                <Select value={newReason} onValueChange={setNewReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREEZE_CODES.map((code) => (
                      <SelectItem key={code.value} value={code.value}>
                        {code.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="destructive" onClick={handleUnfreeze} disabled={isUpdating}>
              Unfreeze Wallet
            </Button>
            <Button onClick={handleUpdateReason} disabled={isUpdating}>
              {isUpdating ? "Updating..." : "Update Reason"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FrozenAccountsTab;
