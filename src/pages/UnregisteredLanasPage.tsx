import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, RefreshCw, Copy, Check, ExternalLink, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAllNostrEvents, latoshisToLana, clearAllNostrEventsCache } from "@/hooks/useAllNostrEvents";

const PER_PAGE = 50;
const MAX_RECORDS = 1000;

const UnregisteredLanasPage = () => {
  const navigate = useNavigate();
  const { events, isLoading, error } = useAllNostrEvents();
  const [deletedWalletIds, setDeletedWalletIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("deleted_wallets").select("wallet_id").limit(10000);
      setDeletedWalletIds(new Set((data || []).map((d) => d.wallet_id).filter(Boolean) as string[]));
    };
    load();
  }, []);

  const isWalletDeleted = (walletId?: string) => !!walletId && deletedWalletIds.has(walletId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? events.filter(
          (e) =>
            e.walletId?.toLowerCase().includes(q) ||
            e.userPubkey?.toLowerCase().includes(q) ||
            e.profile?.displayName?.toLowerCase().includes(q) ||
            e.profile?.name?.toLowerCase().includes(q),
        )
      : events;
    return base.slice(0, MAX_RECORDS);
  }, [events, search]);


  const totalLana = useMemo(
    () => filtered.reduce((s, e) => s + latoshisToLana(e.unregisteredAmountLatoshis), 0),
    [filtered],
  );
  const returnedCount = useMemo(() => filtered.filter((e) => e.isReturned).length, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search]);

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const refresh = () => {
    clearAllNostrEventsCache();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Unregistered Lanas
              </h1>
              <p className="text-sm text-muted-foreground">
                Registered unregistered Lana events from Nostr relays (Kind 87003).
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={refresh}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Events</div>
              <div className="text-lg font-semibold">{filtered.length}</div>
              {events.length > MAX_RECORDS && (
                <div className="text-[11px] text-muted-foreground">
                  showing newest {MAX_RECORDS} of {events.length}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Total unregistered</div>
              <div className="text-lg font-semibold">{totalLana.toFixed(4)} LANA</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Returned</div>
              <div className="text-lg font-semibold">{returnedCount}</div>
            </div>
          </div>

          <Input
            placeholder="Search by wallet, pubkey or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 max-w-md"
          />

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-destructive">Error loading events: {error}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Return TX</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No unregistered Lana events found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginated.map((event, index) => (
                        <TableRow
                          key={event.id}
                          className={cn(isWalletDeleted(event.walletId) && "bg-muted/40 opacity-70")}
                        >
                          <TableCell className="font-medium">
                            {(page - 1) * PER_PAGE + index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {(event.profile?.displayName || event.profile?.name) && (
                                <span className="text-sm font-medium">
                                  {event.profile?.displayName || event.profile?.name}
                                </span>
                              )}
                              <span className="font-mono text-xs text-muted-foreground">
                                {event.userPubkey
                                  ? `${event.userPubkey.substring(0, 8)}…${event.userPubkey.slice(-4)}`
                                  : "-"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="break-all font-mono text-xs">
                                {event.walletId
                                  ? `${event.walletId.substring(0, 8)}…${event.walletId.slice(-6)}`
                                  : "-"}
                              </span>
                              {event.walletId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copy(event.walletId, "Wallet ID")}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                              {isWalletDeleted(event.walletId) && (
                                <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                                  Deleted
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {latoshisToLana(event.unregisteredAmountLatoshis).toFixed(4)} LANA
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(event.createdAt * 1000), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            {isWalletDeleted(event.walletId) ? (
                              <Badge variant="secondary">Deleted</Badge>
                            ) : event.isReturned ? (
                              <Badge className="border-green-500/30 bg-green-500/20 text-green-600">
                                <Check className="mr-1 h-3 w-3" /> Returned
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-yellow-500/30 text-yellow-600">
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {event.isReturned && event.returnEvent?.txId ? (
                              <a
                                href={`https://chainz.cryptoid.info/lana/tx.dws?${event.returnEvent.txId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                              >
                                {event.returnEvent.txId.substring(0, 8)}…
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages} · {filtered.length} events
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(1)}>
                      First
                    </Button>
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                      Prev
                    </Button>
                    <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                    <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default UnregisteredLanasPage;
