import Layout from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Snowflake, Lock, ArrowLeft, Flame, Store, Wallet as WalletIcon, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import FreezeManager from "@/components/FreezeManager";
import FrozenAccountsTab from "@/components/FrozenAccountsTab";
import OverLimitHoldersTab from "@/components/OverLimitHoldersTab";
import RetailHoldersTab from "@/components/RetailHoldersTab";
import LanaPaysHoldersTab from "@/components/LanaPaysHoldersTab";
import Lana8WonderHoldersTab from "@/components/Lana8WonderHoldersTab";
import AdminDeleteFrozenTab from "@/components/AdminDeleteFrozenTab";
import AdminDeleteMainWalletTab from "@/components/AdminDeleteMainWalletTab";

const AdminFreezePage = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Snowflake className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Freeze Management</h1>
              <p className="text-sm text-muted-foreground">Freeze, unfreeze and review frozen accounts</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="freeze" className="w-full">
          <TabsList>
            <TabsTrigger value="freeze" className="flex items-center gap-1">
              <Snowflake className="h-4 w-4" />
              Freeze
            </TabsTrigger>
            <TabsTrigger value="frozen-accounts" className="flex items-center gap-1">
              <Lock className="h-4 w-4" />
              Frozen Accounts
            </TabsTrigger>
            <TabsTrigger value="over-limit" className="flex items-center gap-1">
              <Flame className="h-4 w-4" />
              Over Limit
            </TabsTrigger>
            <TabsTrigger value="retail" className="flex items-center gap-1">
              <Store className="h-4 w-4" />
              Retail
            </TabsTrigger>
            <TabsTrigger value="lanapays" className="flex items-center gap-1">
              <WalletIcon className="h-4 w-4" />
              LanaPays.Us
            </TabsTrigger>
            <TabsTrigger value="lana8wonder" className="flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              Lana8Wonder
            </TabsTrigger>
            <TabsTrigger value="delete-frozen" className="flex items-center gap-1">
              <Trash2 className="h-4 w-4" />
              Delete Frozen
            </TabsTrigger>
            <TabsTrigger value="delete-main" className="flex items-center gap-1">
              <Trash2 className="h-4 w-4" />
              Delete Main
            </TabsTrigger>

          </TabsList>

          <TabsContent value="freeze" className="space-y-4">
            <FreezeManager />
          </TabsContent>

          <TabsContent value="frozen-accounts" className="space-y-4">
            <FrozenAccountsTab />
          </TabsContent>

          <TabsContent value="over-limit" className="space-y-4">
            <OverLimitHoldersTab />
          </TabsContent>

          <TabsContent value="retail" className="space-y-4">
            <RetailHoldersTab />
          </TabsContent>

          <TabsContent value="lanapays" className="space-y-4">
            <LanaPaysHoldersTab />
          </TabsContent>

          <TabsContent value="lana8wonder" className="space-y-4">
            <Lana8WonderHoldersTab />
          </TabsContent>

          <TabsContent value="delete-frozen" className="space-y-4">
            <AdminDeleteFrozenTab />
          </TabsContent>

          <TabsContent value="delete-main" className="space-y-4">
            <AdminDeleteMainWalletTab />
          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
};

export default AdminFreezePage;
