import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Snowflake, Sun, Loader2, User, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WalletRow {
  id: string;
  wallet_id: string | null;
  wallet_type: string;
  notes: string | null;
  frozen: boolean;
  balance?: number;
}

interface ProfileInfo {
  id: string;
  name: string;
  display_name: string | null;
  nostr_hex_id: string;
  profile_pic_link: string | null;
}

const FreezeManager = () => {
  const [nostrHexInput, setNostrHexInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState("frozen_l8w");

  // Auto-freeze threshold state
  const [thresholdValue, setThresholdValue] = useState("");
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [thresholdSaving, setThresholdSaving] = useState(false);

  useEffect(() => {
    const fetchThreshold = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "auto_freeze_threshold_lana")
        .maybeSingle();
      if (data) setThresholdValue(data.value);
      setThresholdLoading(false);
    };
    fetchThreshold();
  }, []);

  const handleSaveThreshold = async () => {
    const num = parseFloat(thresholdValue);
    if (isNaN(num) || num <= 0) {
      toast.error("Enter a valid positive number");
      return;
    }
    setThresholdSaving(true);
    try {
      // Check if setting already exists
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("key", "auto_freeze_threshold_lana")
        .maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase
          .from("app_settings")
          .update({ value: num.toString() })
          .eq("key", "auto_freeze_threshold_lana"));
      } else {
        ({ error } = await supabase
          .from("app_settings")
          .insert({
            key: "auto_freeze_threshold_lana",
            value: num.toString(),
            description: "Auto-freeze threshold: wallets receiving more than this amount of unregistered LANA get frozen",
          }));
      }
      if (error) throw error;
      toast.success("Auto-freeze threshold saved");
    } catch (err: any) {
      toast.error(err.message || "Error saving threshold");
    } finally {
      setThresholdSaving(false);
    }
  };

  const FREEZE_CODES = [
    { value: "frozen_l8w", label: "Late Wallet Registration", description: "Frozen due to late wallet registration" },
    { value: "frozen_max_cap", label: "Maximum Cap Exceeded", description: "Frozen due to maximum balance cap exceeded" },
    { value: "frozen_too_wild", label: "Suspicious Activity", description: "Frozen due to irregular or suspicious activity" },
    { value: "frozen_unreg_Lanas", label: "Unregistered Lanas Exceeded", description: "Frozen due to receiving unregistered LANA exceeding threshold" },
    { value: "frozen_lanapays_outdated", label: "Out-dated Wallet for LanaPays.Us", description: "Frozen because LanaPays.Us wallet was created more than 2 splits ago" },
    { value: "frozen_retail_unallowed", label: "Retail Wallet — un-allowed transactions", description: "Frozen due to un-allowed transactions on a Retail wallet" },
    { value: "frozen_retail_over_limit", label: "Retail Wallet — over the Limit", description: "Frozen because Retail wallet exceeded the allowed limit" },
  ];

  const handleSearch = async () => {
    const hex = nostrHexInput.trim();
    if (!hex || hex.length !== 64) {
      toast.error("Nostr Hex ID must be 64 characters");
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setProfile(null);
    setWallets([]);
    setSelectedIds(new Set());

    try {
      // Find main_wallet by nostr_hex_id
      const { data: mainWallet, error: mwError } = await supabase
        .from("main_wallets")
        .select("id, name, display_name, nostr_hex_id, profile_pic_link")
        .eq("nostr_hex_id", hex)
        .maybeSingle();

      if (mwError) throw mwError;
      if (!mainWallet) {
        setSearchError("No profile found with this Nostr Hex ID");
        return;
      }

      setProfile(mainWallet);

      // Fetch wallets
      const { data: walletsData, error: wError } = await supabase
        .from("wallets")
        .select("id, wallet_id, wallet_type, notes, frozen")
        .eq("main_wallet_id", mainWallet.id);

      if (wError) throw wError;

      const walletRows: WalletRow[] = (walletsData || []).map((w: any) => ({
        id: w.id,
        wallet_id: w.wallet_id,
        wallet_type: w.wallet_type,
        notes: w.notes,
        frozen: w.frozen ?? false,
      }));

      // Fetch balances
      const addresses = walletRows.filter(w => w.wallet_id).map(w => w.wallet_id as string);
      if (addresses.length > 0) {
        const { data: sysParams } = await supabase
          .from("system_parameters")
          .select("electrum")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (sysParams) {
          const { data: balancesData } = await supabase.functions.invoke("fetch-wallet-balance", {
            body: { wallet_addresses: addresses, electrum_servers: sysParams.electrum },
          });

          if (balancesData?.wallets) {
            const balanceMap = new Map<string, number>();
            balancesData.wallets.forEach((wb: any) => balanceMap.set(wb.wallet_id, wb.balance || 0));
            walletRows.forEach(w => {
              if (w.wallet_id) w.balance = balanceMap.get(w.wallet_id) ?? 0;
            });
          }
        }
      }

      setWallets(walletRows);
    } catch (err: any) {
      console.error("Search error:", err);
      setSearchError(err.message || "Error during search");
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === wallets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(wallets.map(w => w.id)));
    }
  };

  const handleFreezeClick = () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one wallet");
      return;
    }
    setFreezeDialogOpen(true);
  };

  const handleFreezeConfirm = async () => {
    if (!profile) return;
    setFreezeDialogOpen(false);
    setIsUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      
      const { data, error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: ids,
          freeze: true,
          freeze_reason: freezeReason,
          nostr_hex_id: profile.nostr_hex_id,
        },
      });

      if (error) throw error;

      setWallets(prev =>
        prev.map(w => selectedIds.has(w.id) ? { ...w, frozen: true } : w)
      );
      setSelectedIds(new Set());
      toast.success(`${ids.length} wallet${ids.length === 1 ? "" : "s"} frozen (${freezeReason})`);
    } catch (err: any) {
      toast.error(err.message || "Error freezing wallets");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnfreeze = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one wallet");
      return;
    }
    if (!profile) return;

    setIsUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      
      const { data, error } = await supabase.functions.invoke("freeze-wallets", {
        body: {
          wallet_ids: ids,
          freeze: false,
          freeze_reason: "",
          nostr_hex_id: profile.nostr_hex_id,
        },
      });

      if (error) throw error;

      setWallets(prev =>
        prev.map(w => selectedIds.has(w.id) ? { ...w, frozen: false } : w)
      );
      setSelectedIds(new Set());
      toast.success(`${ids.length} wallet${ids.length === 1 ? "" : "s"} unfrozen`);
    } catch (err: any) {
      toast.error(err.message || "Error unfreezing wallets");
    } finally {
      setIsUpdating(false);
    }
  };

  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance ?? 0), 0);
  const frozenCount = wallets.filter(w => w.frozen).length;

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-primary" />
            Freeze / Unfreeze Wallets
          </CardTitle>
          <CardDescription>
            Enter a Nostr Hex ID to display the profile and wallets. Then select wallets to freeze or unfreeze.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Nostr Hex ID (64 characters)"
              value={nostrHexInput}
              onChange={(e) => setNostrHexInput(e.target.value)}
              className="font-mono text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isSearching} className="gap-2 shrink-0">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>

          {searchError && (
            <div className="mt-4 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm">{searchError}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Info */}
      {profile && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              {profile.profile_pic_link ? (
                <img src={profile.profile_pic_link} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-foreground">
                  {profile.display_name || profile.name}
                </h3>
                <p className="font-mono text-xs text-muted-foreground truncate">{profile.nostr_hex_id}</p>
              </div>
              <div className="ml-auto flex gap-3 text-sm text-muted-foreground">
                <span>{wallets.length} wallets</span>
                <span>•</span>
                <span>{totalBalance.toFixed(2)} LANA</span>
                {frozenCount > 0 && (
                  <>
                    <span>•</span>
                    <Badge variant="destructive" className="gap-1">
                      <Snowflake className="h-3 w-3" />
                      {frozenCount} frozen
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wallets Table */}
      {isSearching ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : wallets.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Wallets ({wallets.length})</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  disabled={selectedIds.size === 0 || isUpdating}
                  onClick={handleFreezeClick}
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className="h-4 w-4" />}
                  Freeze ({selectedIds.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={selectedIds.size === 0 || isUpdating}
                  onClick={handleUnfreeze}
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sun className="h-4 w-4" />}
                  Unfreeze ({selectedIds.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === wallets.length && wallets.length > 0}
                        onCheckedChange={selectAll}
                      />
                    </TableHead>
                     <TableHead>Type</TableHead>
                     <TableHead>Address</TableHead>
                     <TableHead>Notes</TableHead>
                     <TableHead className="text-right">Balance (LANA)</TableHead>
                     <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.map((w) => (
                    <TableRow key={w.id} className={w.frozen ? "bg-destructive/5" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(w.id)}
                          onCheckedChange={() => toggleSelect(w.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{w.wallet_type}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {w.wallet_id || "N/A"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {w.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {(w.balance ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {w.frozen ? (
                          <Badge variant="destructive" className="gap-1">
                            <Snowflake className="h-3 w-3" />
                            Frozen
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Freeze Reason Dialog */}
      <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-destructive" />
              Freeze {selectedIds.size} Wallet{selectedIds.size !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Select the reason for freezing. This will be broadcast via KIND 30889 to all relays.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={freezeReason} onValueChange={setFreezeReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select freeze reason" />
              </SelectTrigger>
              <SelectContent>
                {FREEZE_CODES.map(code => (
                  <SelectItem key={code.value} value={code.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{code.label}</span>
                      <span className="text-xs text-muted-foreground">{code.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleFreezeConfirm} className="gap-2">
              <Snowflake className="h-4 w-4" />
              Confirm Freeze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FreezeManager;
