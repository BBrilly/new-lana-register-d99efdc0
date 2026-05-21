import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import WalletCard from "@/components/WalletCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useUserWallets } from "@/hooks/useUserWallets";
import { Skeleton } from "@/components/ui/skeleton";
import WalletOwnerSearch from "@/components/WalletOwnerSearch";
import { supabase } from "@/integrations/supabase/client";
import { getAuthSession } from "@/utils/wifAuth";
import { useState } from "react";

const Wallets = () => {
  const navigate = useNavigate();
  const { wallets, isLoading, error, fxRates, userCurrency, refetch } = useUserWallets();

  const handleDeleteWallet = async (id: string) => {
    const session = getAuthSession();
    if (!session) {
      toast.error("You must be logged in to delete a wallet");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("delete-wallet", {
        body: {
          api_key: "lk_w1fHNwvEKpCtgGjXqIEFz1yKEynnwuoe",
          wallet_uuid: id,
          nostr_id_hex: session.nostrHexId,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Deletion failed");

      toast.success("Wallet successfully deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete wallet");
      throw err;
    }
  };

  const handleUpdateNotes = async (id: string, notes: string) => {
    const session = getAuthSession();
    if (!session) {
      toast.error("You must be logged in to update notes");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("update-wallet-notes", {
        body: {
          api_key: "lk_w1fHNwvEKpCtgGjXqIEFz1yKEynnwuoe",
          wallet_uuid: id,
          nostr_id_hex: session.nostrHexId,
          notes,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Update failed");

      toast.success("Notes updated and synced to Nostr");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to update notes");
      throw err;
    }
  };

  const handleConvertToRetail = async (id: string) => {
    const session = getAuthSession();
    if (!session) {
      toast.error("You must be logged in to convert a wallet");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("update-wallet-type", {
        body: {
          api_key: "lk_w1fHNwvEKpCtgGjXqIEFz1yKEynnwuoe",
          wallet_uuid: id,
          nostr_id_hex: session.nostrHexId,
          new_wallet_type: "Retail",
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Conversion failed");

      toast.success("Wallet converted to Retail and synced to Nostr");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to convert wallet");
      throw err;
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Wallets</h1>
            <p className="mt-1 text-sm sm:text-base text-muted-foreground">
              Manage all your LAN wallets in one place
            </p>
          </div>
          <Button size="lg" className="gap-2 w-full sm:w-auto" onClick={() => navigate("/wallets/add")}>
            <Plus className="h-5 w-5" />
            Add Wallet
          </Button>
        </div>

        {/* Wallet Owner Search */}
        <WalletOwnerSearch />

        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : error ? (
          <div className="flex min-h-[400px] items-center justify-center rounded-xl border-2 border-dashed border-border">
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">Error loading wallets</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : wallets.length === 0 ? (
          <div className="flex min-h-[400px] items-center justify-center rounded-xl border-2 border-dashed border-border">
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">No wallets added yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first wallet to start tracking
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            {wallets.map((wallet) => (
              <WalletCard 
                key={wallet.id} 
                wallet={wallet} 
                onDelete={handleDeleteWallet}
                onUpdateNotes={handleUpdateNotes}
                onConvertToRetail={handleConvertToRetail}
                userCurrency={userCurrency}
                fxRates={fxRates}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Wallets;
