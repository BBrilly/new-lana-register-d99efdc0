import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Globe, Wallet, Shield, Snowflake, Users, CreditCard, Tag, Database, BarChart3 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const LINKS = [
  { path: "/all-wallets", label: "All Wallets", icon: Wallet },
  { path: "/users-aggregated", label: "Users Aggregated", icon: Users },
  { path: "/knights", label: "Knights", icon: Shield },
  { path: "/lanapays", label: "LanaPays.Us", icon: CreditCard },
  { path: "/lana-discount", label: "Lana.Discount", icon: Tag },
  { path: "/frozen-wallets", label: "Frozen Wallets", icon: Snowflake },
  { path: "/public-api", label: "Public Data", icon: Globe },
  { path: "/api-docs", label: "API Docs", icon: Database },
];

const PublicLinksSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="hidden md:block fixed right-4 top-24 z-30 w-52">
      <Card className="p-3 shadow-lg bg-card/95 backdrop-blur">
        <div className="flex items-center gap-2 px-2 pb-2 border-b mb-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Public Pages</span>
        </div>
        <nav className="flex flex-col gap-1">
          {LINKS.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Button
                key={path}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={cn("justify-start gap-2 h-8 text-xs", active && "font-semibold")}
                onClick={() => navigate(path)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </Button>
            );
          })}
        </nav>
      </Card>
    </aside>
  );
};

export default PublicLinksSidebar;
