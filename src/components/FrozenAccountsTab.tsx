import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Lock, Copy, Check, ChevronDown, ChevronRight, Loader2, Unlock } from "lucide-react";
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
  { value: "frozen_own_threatening", label: "OWN — Threatening" },
  { value: "frozen_own_public_attack", label: "OWN — Public attack" },
  { value: "frozen_own_no_responsibility", label: "OWN — Failing to accept responsibility" },
];

const FREEZE_LABELS: Record<string, string> = {
  frozen_l8w: "Late Registration",
  frozen_max_cap: "Max Cap Exceeded",
  frozen_too_wild: "Suspicious Activity",
  frozen_unreg_Lanas: "Unreg. Lanas Exceeded",
  frozen_lanapays_outdated: "Out-dated LanaPays.Us",
  frozen_retail_unallowed: "Retail — un-allowed TX",
  frozen_retail_over_limit: "Retail — over the Limit",
  frozen_own_threatening: "OWN — Threatening",
  frozen_own_public_attack: "OWN — Public attack",
  frozen_own_no_responsibility: "OWN — Failing to accept responsibility",
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
          .select(`id, wallet_id, wallet_type, frozen, freeze_reason, main_wallet_id, updated_at, main_wallet:main_wallets(name, display_name, nostr_hex_id)`)
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

      // Authoritative freeze dates from the KIND 87010 history (fallback: updated_at)
      const freezeDates = new Map<string, string>();
      const { data: history } = await supabase
        .from("wallet_freeze_events")
        .select("wallet_uuid, effective_at")
        .eq("status", "frozen")
        .order("effective_at", { ascending: false })
        .limit(10000);

      for (const h of history || []) {
        if (h.wallet_uuid && !freezeDates.has(h.wallet_uuid)) {
          freezeDates.set(h.wallet_uuid, h.effective_at as string);
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
        frozen_at: freezeDates.get(w.id) || w.updated_at || null,
      }));
    },

  });

  const addressList = (frozenWallets || []).map((w) => w.wallet_id);
  const { data: balanceMap, isLoading: balancesLoading } = useAddressBalances(addressList, "frozen-accounts");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkKey, setBulkKey] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, {
      key: string;
      name: string;
      nostrHexId: string | null;
      wallets: FrozenWallet[];
    }>();
    for (const w of frozenWallets || []) {
      const key = w.main_wallet_id || w.nostr_hex_id || "unknown";
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: w.owner_display_name || w.owner_name || "—",
          nostrHexId: w.nostr_hex_id,
          wallets: [],
        });
      }
      map.get(key)!.wallets.push(w);
    }
    return Array.from(map.values()).sort((a, b) => b.wallets.length - a.wallets.length);
  }, [frozenWallets]);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const groupBalance = (wallets: FrozenWallet[]) =>
    wallets.reduce((s, w) => s + (w.wallet_id ? balanceMap?.get(w.wallet_id) ?? 0 : 0), 0);

  const handleBulkUnfreeze = async (group: { key: string; nostrHexId: string | null; wallets: FrozenWallet[]; name: string }) => {
    setBulkKey(group.key);
    try {
      const { error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: group.wallets.map((w) => w.id),
          freeze: false,
          nostr_hex_id: group.nostrHexId,
        },
      });
      if (error) throw error;
      toast.success(`Unfroze ${group.wallets.length} wallet(s) for ${group.name}`);
      queryClient.invalidateQueries({ queryKey: ["frozen-wallets-admin"] });
    } catch (err) {
      console.error("Bulk unfreeze error:", err);
      toast.error("Failed to unfreeze wallets");
    } finally {
      setBulkKey(null);
    }
  };


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
            Frozen wallets grouped by user ({groups.length} users · {frozenWallets?.length ?? 0} wallets).
            Expand a user to manage single wallets, or unfreeze them all at once.
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
                    <TableHead className="w-10"></TableHead>
                    <TableHead>#</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Nostr Hex ID</TableHead>
                    <TableHead className="text-center">Frozen Wallets</TableHead>
                    <TableHead className="text-right">Balance (LANA)</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group, index) => {
                    const isOpen = expanded.has(group.key);
                    return (
                      <Fragment key={group.key}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleGroup(group.key)}
                        >
                          <TableCell>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{group.name}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {group.nostrHexId ? (
                              <button
                                type="button"
                                onClick={(e) => copyHex(e, group.nostrHexId!)}
                                className="inline-flex items-center gap-1 hover:text-primary"
                                title={group.nostrHexId}
                              >
                                <span>{group.nostrHexId.slice(0, 8)}…{group.nostrHexId.slice(-6)}</span>
                                {copiedHex === group.nostrHexId ? (
                                  <Check className="h-3 w-3 text-success" />
                                ) : (
                                  <Copy className="h-3 w-3 opacity-60" />
                                )}
                              </button>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="destructive" className="gap-1">
                              <Lock className="h-3 w-3" />
                              {group.wallets.length}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {balancesLoading && !balanceMap
                              ? "…"
                              : groupBalance(group.wallets).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              disabled={bulkKey === group.key}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBulkUnfreeze(group);
                              }}
                            >
                              {bulkKey === group.key ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Unlock className="h-3 w-3" />
                              )}
                              Unfreeze all
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={7} className="p-0">
                              <div className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Wallet Type</TableHead>
                                      <TableHead>Wallet Address</TableHead>
                                      <TableHead className="text-right">Balance (LANA)</TableHead>
                                      <TableHead>Reason</TableHead>
                                      <TableHead>Frozen At</TableHead>
                                      <TableHead className="text-right">Manage</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {group.wallets.map((wallet) => (
                                      <TableRow key={wallet.id}>
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
                                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                          {wallet.frozen_at ? new Date(wallet.frozen_at).toLocaleString() : "—"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRowClick(wallet)}
                                          >
                                            Manage
                                          </Button>
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
                  })}
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
