import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePublicWalletBalances } from "@/hooks/usePublicWalletBalances";
import PublicWalletTable from "@/components/PublicWalletTable";

const WALLET_TYPES = ['Wallet', 'Main Wallet', 'Knights', 'LanaPays.Us', 'Lana.Discount', 'Retail'];

const AllWalletsPage = () => {
  const navigate = useNavigate();
  const { sorted, totalBalance, isLoading, copiedId, sortField, sortDirection, toggleSort, copyWalletId, fxRates, lanaLimits } = usePublicWalletBalances(WALLET_TYPES);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card className="p-4 sm:p-6">
          <PublicWalletTable
            wallets={sorted} isLoading={isLoading} totalBalance={totalBalance}
            title="All Wallets" subtitle="All registered wallet types"
            emptyMessage="No wallets found" showWalletType
            sortField={sortField} sortDirection={sortDirection} toggleSort={toggleSort}
            copiedId={copiedId} copyWalletId={copyWalletId}
            fxRates={fxRates} lanaLimits={lanaLimits}
          />
        </Card>
      </div>
    </div>
  );
};

export default AllWalletsPage;
