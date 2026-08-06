import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAddressBalances } from "@/hooks/useAddressBalances";

interface LanaPaysWallet {
  id: string;
  wallet_id: string | null;
  wallet_type: string;
  split_created: number | null;
  notes: string | null;
  owner_name: string | null;
  owner_display_name: string | null;
  owner_hex: string | null;
}

const AdminDeleteLanaPaysTab = () => {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<LanaPaysWallet | null>(null);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lanapays-outdated-admin-delete"],
    queryFn: async () => {
      const { data: sysParams } = await supabase
        .from("system_parameters")
        .select("split")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentSplit = parseInt(String(sysParams?.split ?? "0"), 10) || 0;
      const threshold = currentSplit - 2;

      const { data: rows, error } = await supabase
        .from("wallets")
        .select(
          `id, wallet_id, wallet_type, split_created, notes, main_wallet:main_wallets(name, display_name, nostr_hex_id)`
        )
        .eq("wallet_type", "LanaPays.Us")
        .limit(10000);

      if (error) throw error;

      const wallets = (rows || [])
        .filter((w: any) => w.split_created === null || w.split_created <= threshold)
        .map((w: any): LanaPaysWallet => ({
          id: w.id,
          wallet_id: w.wallet_id,
          wallet_type: w.wallet_type,
          split_created: w.split_created,
          notes: w.notes,
          owner_name: w.main_wallet?.name || null,
          owner_display_name: w.main_wallet?.display_name || null,
          owner_hex: w.main_wallet?.nostr_hex_id || null,
        }))
        .sort((a, b) => (a.split_created ?? -1) - (b.split_created ?? -1));

      return { wallets, currentSplit, threshold };
    },
  });

  const wallets = data?.wallets || [];
  const addressList = wallets.map((w) => w.wallet_id);
  const { data: balanceMap, isLoading: balancesLoading } = useAddressBalances(addressList, "admin-delete-lanapays");

  const totalBalance = wallets.reduce(
    (sum, w) => sum + (w.wallet_id ? balanceMap?.get(w.wallet_id) || 0 : 0),
    0
  );

  const openConfirm = (w: LanaPaysWallet) => {
    setTarget(w);
    setConfirmStep(1);
  };

  const closeConfirm = () => {
    if (isDeleting) return;
    setConfirmStep(0);
    setTarget(null);
  };

  const performDelete = async () => {
    if (!target) return;
    setIsDeleting(true);
    try {
      const authEvent = createAdminAuthEvent("admin-delete-wallet", target.id);
      const { data: res, error } = await supabase.functions.invoke("admin-delete-wallet", {
        body: { wallet_uuid: target.id, admin_auth_event: authEvent },
      });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || "Unknown error");
      toast.success("Wallet deleted and KIND 30889 republished");
      queryClient.invalidateQueries({ queryKey: ["lanapays-outdated-admin-delete"] });
      setConfirmStep(0);
      setTarget(null);
    } catch (err) {
      console.error("Admin delete error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete wallet");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <CardTitle>Delete out-dated LanaPays.Us wallets</CardTitle>
          </div>
          <CardDescription>
            LanaPays.Us wallets with no SPLIT recorded, or registered at SPLIT {data?.threshold ?? "—"} or
            earlier (current SPLIT {data?.currentSplit ?? "—"}). Deleted wallets are archived and a fresh
            KIND 30889 is published for the owner. ({wallets.length} eligible
            {balanceMap ? ` · ${totalBalance.toFixed(2)} LANA total` : ""})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : wallets.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No out-dated LanaPays.Us wallets found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>SPLIT</TableHead>
                    <TableHead className="text-right">Balance (LANA)</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.map((w, i) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div>{w.owner_display_name || w.owner_name || "—"}</div>
                        {w.owner_hex && (
                          <div className="font-mono text-[10px] text-muted-foreground break-all">
                            {w.owner_hex.slice(0, 16)}…
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs break-all">{w.wallet_id || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={w.split_created === null ? "destructive" : "outline"}>
                          {w.split_created === null ? "none" : w.split_created}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {balancesLoading && !balanceMap ? (
                          <span className="text-muted-foreground">…</span>
                        ) : w.wallet_id && balanceMap?.has(w.wallet_id) ? (
                          balanceMap.get(w.wallet_id)!.toFixed(2)
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {w.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="destructive" size="sm" onClick={() => openConfirm(w)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmStep !== 0} onOpenChange={(o) => { if (!o) closeConfirm(); }}>
        <AlertDialogContent>
          {confirmStep === 1 ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete LanaPays.Us wallet?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      You are about to permanently delete wallet{" "}
                      <span className="font-mono text-xs">({target?.wallet_id})</span> belonging to{" "}
                      <strong>{target?.owner_display_name || target?.owner_name || "—"}</strong>.
                    </p>
                    <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                      <p className="text-foreground">
                        The wallet will be archived in <strong>deleted_wallets</strong> and a fresh KIND 30889
                        will be published to relays without this wallet.
                      </p>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={closeConfirm}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); setConfirmStep(2); }}
                >
                  Yes, continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">Final confirmation</AlertDialogTitle>
                <AlertDialogDescription>
                  This action is <strong>irreversible</strong>. Confirm admin deletion of wallet{" "}
                  <span className="font-mono text-xs">{target?.wallet_id}</span>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting} onClick={closeConfirm}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isDeleting}
                  onClick={(e) => { e.preventDefault(); performDelete(); }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
                  ) : (
                    "Yes, delete"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
};

export default AdminDeleteLanaPaysTab;
