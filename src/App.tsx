import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";

import Wallets from "./pages/Wallets";
import AddWallet from "./pages/AddWallet";
import WalletConsolidate from "./pages/WalletConsolidate";
import SendToRegister from "./pages/SendToRegister";
import Login from "./pages/Login";
import AdminPanel from "./pages/AdminPanel";
import ApiDocs from "./pages/ApiDocs";
import NotFound from "./pages/NotFound";
import AllWalletsPage from "./pages/AllWalletsPage";
import KnightsPage from "./pages/KnightsPage";
import LanaPaysPage from "./pages/LanaPaysPage";
import LanaDiscountPage from "./pages/LanaDiscountPage";
import FrozenWalletsPage from "./pages/FrozenWalletsPage";
import ResolveMaxCap from "./pages/ResolveMaxCap";
import PublicApiPage from "./pages/PublicApiPage";
import UsersAggregatedPage from "./pages/UsersAggregatedPage";
import LanaholdersPage from "./pages/LanaholdersPage";
import RetailWalletsPage from "./pages/RetailWalletsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          
          <Route path="/wallets" element={<Wallets />} />
          <Route path="/wallets/add" element={<AddWallet />} />
          <Route path="/wallets/:walletId/consolidate" element={<WalletConsolidate />} />
          <Route path="/send-to-register" element={<SendToRegister />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route path="/all-wallets" element={<AllWalletsPage />} />
          <Route path="/knights" element={<KnightsPage />} />
          <Route path="/lanapays" element={<LanaPaysPage />} />
          <Route path="/lana-discount" element={<LanaDiscountPage />} />
          <Route path="/frozen-wallets" element={<FrozenWalletsPage />} />
          <Route path="/wallets/resolve-max-cap" element={<ResolveMaxCap />} />
          <Route path="/public-api" element={<PublicApiPage />} />
          <Route path="/users-aggregated" element={<UsersAggregatedPage />} />
          <Route path="/lanaholders" element={<LanaholdersPage />} />
          <Route path="/retail-wallets" element={<RetailWalletsPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
