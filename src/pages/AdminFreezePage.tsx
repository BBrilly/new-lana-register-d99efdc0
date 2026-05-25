import Layout from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Snowflake, Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import FreezeManager from "@/components/FreezeManager";
import FrozenAccountsTab from "@/components/FrozenAccountsTab";

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
          </TabsList>

          <TabsContent value="freeze" className="space-y-4">
            <FreezeManager />
          </TabsContent>

          <TabsContent value="frozen-accounts" className="space-y-4">
            <FrozenAccountsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AdminFreezePage;
