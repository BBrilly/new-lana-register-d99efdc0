import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, RefreshCw, Wallet, TrendingUp, Key, Snowflake, BarChart3, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import StatCard from "@/components/StatCard";
import ApiKeysManager from "@/components/ApiKeysManager";
import MaxCapFreezeManager from "@/components/MaxCapFreezeManager";
import AdminRegisterWallet from "@/components/AdminRegisterWallet";

interface UnregisteredEvent {
  id: string;
  detected_at: string | null;
  wallet_id: string;
  unregistered_amount: number;
  notes: string | null;
  return_transaction_id: string | null;
}

interface WalletWithType {
  id: string;
  wallet_id: string | null;
  wallet_type: string;
}

interface WalletBalance {
  wallet_id: string;
  balance: number;
  status: string;
}

interface AnalyticsData {
  totalBalance: number;
  byType: {
    type: string;
    count: number;
    balance: number;
    percentage: number;
  }[];
}

const AdminPanel = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: unregisteredEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["unregistered-events", refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unregistered_lana_events")
        .select("*")
        .order("detected_at", { ascending: false });

      if (error) throw error;
      return data as UnregisteredEvent[];
    },
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["analytics-dashboard", refreshKey],
    queryFn: async () => {
      // Fetch all wallets with their types using pagination
      const PAGE_SIZE = 1000;
      let allWallets: WalletWithType[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: walletsBatch, error: walletsError } = await supabase
          .from("wallets")
          .select("id, wallet_id, wallet_type")
          .range(offset, offset + PAGE_SIZE - 1);

        if (walletsError) throw walletsError;

        if (walletsBatch && walletsBatch.length > 0) {
          allWallets = [...allWallets, ...walletsBatch];
          offset += PAGE_SIZE;
          hasMore = walletsBatch.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      const wallets = allWallets;
      console.log(`Fetched ${wallets.length} wallets total`);

      // Fetch system parameters for electrum servers
      const { data: sysParams, error: paramsError } = await supabase
        .from("system_parameters")
        .select("electrum, fx")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (paramsError) throw paramsError;

      const electrumServers = sysParams.electrum as any[];

      // Get wallet addresses
      const walletAddresses = wallets
        .filter((w: WalletWithType) => w.wallet_id)
        .map((w: WalletWithType) => w.wallet_id as string);

      // Split addresses into batches of 50
      const BATCH_SIZE = 50;
      const batches: string[][] = [];
      for (let i = 0; i < walletAddresses.length; i += BATCH_SIZE) {
        batches.push(walletAddresses.slice(i, i + BATCH_SIZE));
      }

      console.log(`Fetching balances for ${walletAddresses.length} wallets in ${batches.length} batches`);

      // Fetch balances for each batch
      const allBalances: WalletBalance[] = [];
      for (const batch of batches) {
        const { data: balancesData, error: balanceError } = await supabase.functions.invoke(
          "fetch-wallet-balance",
          {
            body: {
              wallet_addresses: batch,
              electrum_servers: electrumServers,
            },
          }
        );

        if (balanceError) {
          console.error("Balance fetch error:", balanceError);
          throw balanceError;
        }

        if (balancesData?.wallets) {
          allBalances.push(...balancesData.wallets);
        }
      }

      console.log(`Fetched ${allBalances.length} wallet balances`);

      // Map balances to wallet addresses
      const balanceMap = new Map<string, number>();
      allBalances.forEach((wb: WalletBalance) => {
        // Balance is already in LANA from the edge function
        balanceMap.set(wb.wallet_id, wb.balance || 0);
      });

      // Calculate analytics
      let totalBalance = 0;
      const typeStats = new Map<string, { count: number; balance: number }>();

      wallets.forEach((wallet: WalletWithType) => {
        const balance = wallet.wallet_id ? balanceMap.get(wallet.wallet_id) || 0 : 0;
        totalBalance += balance;

        const existing = typeStats.get(wallet.wallet_type) || { count: 0, balance: 0 };
        typeStats.set(wallet.wallet_type, {
          count: existing.count + 1,
          balance: existing.balance + balance,
        });
      });

      const byType = Array.from(typeStats.entries())
        .map(([type, stats]) => ({
          type,
          count: stats.count,
          balance: stats.balance,
          percentage: totalBalance > 0 ? (stats.balance / totalBalance) * 100 : 0,
        }))
        .sort((a, b) => b.balance - a.balance);

      console.log("Analytics calculated:", { totalBalance, typeCount: byType.length });

      return {
        totalBalance,
        byType,
      } as AnalyticsData;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
              <p className="text-sm text-muted-foreground">System administration and management</p>
            </div>
          </div>
          <Button
            onClick={() => setRefreshKey((prev) => prev + 1)}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="events" className="w-full">
          <TabsList>
            <TabsTrigger value="events">Unregistered Events</TabsTrigger>
            <TabsTrigger value="analytics">Analytics Dashboard</TabsTrigger>
            <TabsTrigger value="api-keys" className="flex items-center gap-1">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="freeze" className="flex items-center gap-1">
              <Snowflake className="h-4 w-4" />
              Freeze
            </TabsTrigger>
            <TabsTrigger value="frozen-accounts" className="flex items-center gap-1">
              <Lock className="h-4 w-4" />
              Frozen Accounts
            </TabsTrigger>
            <TabsTrigger value="max-cap" className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              Max Cap
            </TabsTrigger>
            <TabsTrigger value="register-wallet" className="flex items-center gap-1">
              <UserPlus className="h-4 w-4" />
              Register Wallet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Unregistered Lana Events</CardTitle>
                <CardDescription>
                  All detected unregistered Lana transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : !unregisteredEvents || unregisteredEvents.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No unregistered events found
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Detected At</TableHead>
                          <TableHead>Wallet ID</TableHead>
                          <TableHead className="text-right">Amount (Lanoshi)</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unregisteredEvents.map((event) => (
                          <TableRow key={event.id}>
                            <TableCell>
                              {event.detected_at
                                ? format(new Date(event.detected_at), "PPp")
                                : "N/A"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {event.wallet_id.slice(0, 8)}...
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {event.unregistered_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="max-w-md truncate">
                              {event.notes || "—"}
                            </TableCell>
                            <TableCell>
                              {event.return_transaction_id ? (
                                <span className="text-success">Returned</span>
                              ) : (
                                <span className="text-muted-foreground">Pending</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {analyticsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : analyticsData ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <StatCard
                    title="Total Wallet Balance"
                    value={`${analyticsData.totalBalance.toFixed(2)} LANA`}
                    subtitle={`Across ${analyticsData.byType.reduce((sum, t) => sum + t.count, 0)} wallets`}
                    icon={<Wallet className="h-6 w-6" />}
                  />
                  <StatCard
                    title="Wallet Types"
                    value={`${analyticsData.byType.length}`}
                    subtitle="Different types registered"
                    icon={<TrendingUp className="h-6 w-6" />}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Balance by Wallet Type</CardTitle>
                    <CardDescription>
                      Breakdown of balances across different wallet types
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Wallet Type</TableHead>
                            <TableHead className="text-right">Number of Wallets</TableHead>
                            <TableHead className="text-right">Total Balance (LANA)</TableHead>
                            <TableHead className="text-right">Percentage</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analyticsData.byType.map((typeData) => (
                            <TableRow key={typeData.type}>
                              <TableCell className="font-medium">{typeData.type}</TableCell>
                              <TableCell className="text-right">{typeData.count}</TableCell>
                              <TableCell className="text-right font-semibold">
                                {typeData.balance.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                {typeData.percentage.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Failed to load analytics data
              </p>
            )}
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-4">
            <ApiKeysManager />
          </TabsContent>

          <TabsContent value="freeze" className="space-y-4">
            <FreezeManager />
          </TabsContent>

          <TabsContent value="frozen-accounts" className="space-y-4">
            <FrozenAccountsTab />
          </TabsContent>

          <TabsContent value="max-cap" className="space-y-4">
            <MaxCapFreezeManager />
          </TabsContent>

          <TabsContent value="register-wallet" className="space-y-4">
            <AdminRegisterWallet />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AdminPanel;
