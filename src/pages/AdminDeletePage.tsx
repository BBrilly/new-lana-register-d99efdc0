import Layout from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, ArrowLeft, Wallet as WalletIcon, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import AdminDeleteMainWalletTab from "@/components/AdminDeleteMainWalletTab";
import AdminDeleteFrozenTab from "@/components/AdminDeleteFrozenTab";

const AdminDeletePage = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trash2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Delete Management</h1>
              <p className="text-sm text-muted-foreground">
                Delete main wallets, frozen wallets and related data
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="delete-main" className="w-full">
          <TabsList>
            <TabsTrigger value="delete-main" className="flex items-center gap-1">
              <WalletIcon className="h-4 w-4" />
              Delete Main
            </TabsTrigger>
            <TabsTrigger value="delete-frozen" className="flex items-center gap-1">
              <Snowflake className="h-4 w-4" />
              Delete Frozen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delete-main" className="space-y-4">
            <AdminDeleteMainWalletTab />
          </TabsContent>

          <TabsContent value="delete-frozen" className="space-y-4">
            <AdminDeleteFrozenTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AdminDeletePage;
