import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Trash2, AlertTriangle, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAddressBalances } from "@/hooks/useAddressBalances";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface MainWalletInfo {
  id: string;
  name: string;
  display_name: string | null;
  nostr_hex_id: string;
  wallet_id: string | null;
}

interface RelatedWallet {
  id: string;
  wallet_id: string | null;
  wallet_type: string;
  frozen: boolean;
}

const AdminDeleteMainWalletTab = () => {
  const queryClient = useQueryClient();
  const [hexInput, setHexInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mainWallet, setMainWallet] = useState<MainWalletInfo | null>(null);
  const [related, setRelated] = useState<RelatedWallet[]>([]);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState(false);
  const [lastSteps, setLastSteps] = useState<string[] | null>(null);

  const MAIN_TYPES = ["main", "main wallet"];
  const isMainEntry = (w: RelatedWallet) =>
    MAIN_TYPES.includes((w.wallet_type || "").toLowerCase()) ||
    (mainWallet?.wallet_id && w.wallet_id === mainWallet.wallet_id);
  const otherWallets = related.filter((w) => !isMainEntry(w));

  const allAddresses = [
    mainWallet?.wallet_id,
    ...related.map((w) => w.wallet_id),
  ];
  const { data: balanceMap, isLoading: balLoading } = useAddressBalances(allAddresses, `admin-del-main-${mainWallet?.id ?? ""}`);

  const totalBalance = mainWallet
    ? (balanceMap
      ? Array.from(balanceMap.values()).reduce((s, v) => s + v, 0)
      : 0)
    : 0;

  const canDelete = !!mainWallet && otherWallets.length === 0;

  const reset = () => {
    setMainWallet(null);
    setRelated([]);
    setSearchError(null);
  };

  const handleSearch = async () => {
    const hex = hexInput.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      setSearchError("Enter a valid 64-char hex Nostr ID");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setMainWallet(null);
    setRelated([]);
    try {
      const { data: mw, error: mwErr } = await supabase
        .from("main_wallets")
        .select("id, name, display_name, nostr_hex_id, wallet_id")
        .eq("nostr_hex_id", hex)
        .maybeSingle();
      if (mwErr) throw mwErr;
      if (!mw) {
        setSearchError("No main wallet found for this Nostr hex ID");
        return;
      }
      setMainWallet(mw);
      const { data: ws, error: wErr } = await supabase
        .from("wallets")
        .select("id, wallet_id, wallet_type, frozen")
        .eq("main_wallet_id", mw.id);
      if (wErr) throw wErr;
      setRelated(ws || []);
    } catch (err) {
      console.error(err);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const performDelete = async () => {
    if (!mainWallet) return;
    setDeleting(true);
    setLastSteps(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-main-wallet", {
        body: { nostr_hex_id: mainWallet.nostr_hex_id },
      });
      if (error) throw error;
      if (data?.steps) setLastSteps(data.steps);
      if (!data?.success) throw new Error(data?.error || "Unknown error");
      toast.success("Main wallet deleted and KIND 30889 retracted from all relays");
      queryClient.invalidateQueries({ queryKey: ["frozen-wallets-admin-delete"] });
      reset();
      setHexInput("");
      setConfirmStep(0);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setConfirmStep(0);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <CardTitle>Delete Main Wallet</CardTitle>
          </div>
          <CardDescription>
            Enter a Nostr hex ID to locate a user's main wallet. Deletion is only allowed
            when the user has no other wallets. The KIND 30889 listing is retracted on all
            relays via NIP-09 (KIND 5) plus a tombstone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nostr hex ID (64 hex chars)"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="font-mono text-sm"
            />
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Search</span>
            </Button>
          </div>

          {searchError && <p className="text-sm text-destructive">{searchError}</p>}

          {mainWallet && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">
                    {mainWallet.display_name || mainWallet.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    hex: {mainWallet.nostr_hex_id}
                  </p>
                  {mainWallet.wallet_id && (
                    <p className="text-xs text-muted-foreground font-mono break-all mt-1">
                      main address: {mainWallet.wallet_id}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total balance</p>
                  <p className="text-lg font-bold tabular-nums">
                    {balLoading && !balanceMap ? "…" : `${totalBalance.toFixed(2)} LANA`}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">
                  Wallets in DB: {related.length}{" "}
                  <span className="text-muted-foreground font-normal">
                    (other than main: {otherWallets.length})
                  </span>
                </p>
                {related.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No wallet rows found.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {related.map((w) => {
                        const isMain = isMainEntry(w);
                        return (
                          <TableRow key={w.id} className={isMain ? "bg-muted/40" : ""}>
                            <TableCell>
                              <Badge variant={isMain ? "default" : "outline"}>
                                {w.wallet_type}
                                {isMain && " (main)"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs break-all">
                              {w.wallet_id || "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {w.wallet_id && balanceMap?.has(w.wallet_id)
                                ? balanceMap.get(w.wallet_id)!.toFixed(2)
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {w.frozen ? (
                                <Badge variant="secondary">Frozen</Badge>
                              ) : (
                                <Badge variant="outline">Active</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="destructive"
                  disabled={!canDelete}
                  onClick={() => setConfirmStep(1)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Main Wallet
                </Button>
              </div>
              {!canDelete && (
                <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                  <p className="text-foreground">
                    Cannot delete: user still owns {otherWallets.length} other wallet(s).
                    Delete those from the Delete Frozen tab first.
                  </p>
                </div>
              )}
            </div>
          )}

          {lastSteps && lastSteps.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs font-mono space-y-1">
              <p className="font-sans font-medium text-foreground mb-2">Execution log:</p>
              {lastSteps.map((s, i) => (
                <div key={i} className="text-muted-foreground">{s}</div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmStep !== 0}
        onOpenChange={(o) => { if (!o && !deleting) setConfirmStep(0); }}
      >
        <AlertDialogContent>
          {confirmStep === 1 && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete main wallet?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      You are about to delete the main wallet for{" "}
                      <strong>{mainWallet?.display_name || mainWallet?.name}</strong>.
                    </p>
                    <p className="text-xs font-mono break-all text-muted-foreground">
                      {mainWallet?.nostr_hex_id}
                    </p>
                    <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                      <p>
                        A NIP-09 deletion event and tombstone KIND 30889 will be broadcast
                        to all relays. The record is archived in <strong>deleted_wallets</strong>.
                      </p>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button variant="outline" onClick={() => setConfirmStep(0)}>Cancel</Button>
                <Button onClick={() => setConfirmStep(2)}>Yes, continue</Button>
              </AlertDialogFooter>
            </>
          )}
          {confirmStep === 2 && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">Final confirmation</AlertDialogTitle>
                <AlertDialogDescription>
                  This is <strong>irreversible</strong>. Confirm deletion of main wallet for{" "}
                  <span className="font-mono text-xs">{mainWallet?.nostr_hex_id.substring(0, 16)}…</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button variant="outline" disabled={deleting} onClick={() => setConfirmStep(0)}>Cancel</Button>
                <Button
                  disabled={deleting}
                  onClick={performDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</>
                  ) : (
                    "Yes, delete main wallet"
                  )}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminDeleteMainWalletTab;
