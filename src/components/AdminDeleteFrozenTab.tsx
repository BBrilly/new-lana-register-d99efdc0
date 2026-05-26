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
  freeze_reason: string;
  owner_name: string | null;
  owner_display_name: string | null;
}

const AdminDeleteFrozenTab = () => {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<FrozenWallet | null>(null);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: frozenWallets, isLoading } = useQuery({
    queryKey: ["frozen-wallets-admin-delete"],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const all: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("wallets")
          .select(
            `id, wallet_id, wallet_type, freeze_reason, main_wallet:main_wallets(name, display_name)`
          )
          .eq("frozen", true)
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) hasMore = false;
        else {
          all.push(...data);
          hasMore = data.length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }
      }
      return all
        .filter((w) => (w.wallet_type || "").toLowerCase() !== "main" && (w.wallet_type || "").toLowerCase() !== "main wallet")
        .map((w): FrozenWallet => ({
          id: w.id,
          wallet_id: w.wallet_id,
          wallet_type: w.wallet_type,
          freeze_reason: w.freeze_reason || "",
          owner_name: (w.main_wallet as any)?.name || null,
          owner_display_name: (w.main_wallet as any)?.display_name || null,
        }));
    },
  });

  const openConfirm = (w: FrozenWallet) => {
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
      const { data, error } = await supabase.functions.invoke("admin-delete-wallet", {
        body: { wallet_uuid: target.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Unknown error");
      toast.success(`Wallet deleted and KIND 30889 republished`);
      queryClient.invalidateQueries({ queryKey: ["frozen-wallets-admin-delete"] });
      queryClient.invalidateQueries({ queryKey: ["frozen-wallets-admin"] });
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
            <CardTitle>Delete Frozen Wallets</CardTitle>
          </div>
          <CardDescription>
            Permanently remove frozen wallets from the registry. Main Wallets are excluded.
            Deleted wallets are archived and a new KIND 30889 is broadcast without the wallet.
            ({frozenWallets?.length ?? 0} eligible)
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
            <p className="text-muted-foreground text-center py-8">No frozen wallets eligible for deletion</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Wallet Type</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {frozenWallets.map((w, i) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {w.owner_display_name || w.owner_name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{w.wallet_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs break-all">
                        {w.wallet_id || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {FREEZE_LABELS[w.freeze_reason] || w.freeze_reason || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openConfirm(w)}
                        >
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

      {/* Step 1 */}
      <AlertDialog open={confirmStep === 1} onOpenChange={(o) => { if (!o) closeConfirm(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete frozen wallet?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to permanently delete wallet{" "}
                  <strong>{target?.wallet_type}</strong>{" "}
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
            <AlertDialogAction onClick={() => setConfirmStep(2)}>Yes, continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2 */}
      <AlertDialog open={confirmStep === 2} onOpenChange={(o) => { if (!o && !isDeleting) closeConfirm(); }}>
        <AlertDialogContent>
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
              onClick={performDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
              ) : (
                "Yes, delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminDeleteFrozenTab;
