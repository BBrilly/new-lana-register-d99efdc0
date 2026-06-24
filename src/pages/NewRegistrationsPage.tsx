import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface RegistrationRow {
  id: string;
  amount: number;
  detected_at: string | null;
  wallet_address: string | null;
  owner_name: string | null;
}

const NewRegistrationsPage = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["new-registrations"],
    queryFn: async (): Promise<RegistrationRow[]> => {
      const { data: events, error } = await supabase
        .from("registered_lana_events")
        .select("id, amount, detected_at, wallet_id")
        .order("detected_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      if (!events || events.length === 0) return [];

      const walletIds = Array.from(new Set(events.map((e) => e.wallet_id).filter(Boolean))) as string[];
      const { data: wallets } = await supabase
        .from("wallets")
        .select("id, wallet_id, main_wallet_id")
        .in("id", walletIds);

      const mainIds = Array.from(
        new Set((wallets ?? []).map((w) => w.main_wallet_id).filter(Boolean)),
      ) as string[];
      const { data: mains } = mainIds.length
        ? await supabase.from("main_wallets").select("id, display_name, wallet_id").in("id", mainIds)
        : { data: [] as any[] };

      const walletMap = new Map((wallets ?? []).map((w) => [w.id, w]));
      const mainMap = new Map((mains ?? []).map((m: any) => [m.id, m]));

      return events.map((e) => {
        const w = walletMap.get(e.wallet_id);
        const m = w?.main_wallet_id ? mainMap.get(w.main_wallet_id) : null;
        return {
          id: e.id,
          amount: Number(e.amount),
          detected_at: e.detected_at,
          wallet_address: w?.wallet_id ?? null,
          owner_name: (m as any)?.display_name ?? null,
        };
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              New Registrations
            </CardTitle>
            <CardDescription>
              Latest newly registered Lana wallets (registered_lana_events).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !data || data.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No registrations found.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead className="text-right">Amount (LANA)</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.owner_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs break-all">
                          {r.wallet_address || "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {r.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                        </TableCell>
                        <TableCell>
                          {r.detected_at ? format(new Date(r.detected_at), "PPp") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NewRegistrationsPage;
