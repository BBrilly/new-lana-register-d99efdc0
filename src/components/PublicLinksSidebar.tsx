import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Globe, Wallet, Shield, Snowflake, Users, CreditCard,
  Tag, Database, BarChart3, Activity, Crown, Store,
  AlertTriangle, Sparkles, Menu, BadgePlus, UserPlus,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const PUBLIC_LINKS = [
  { path: "/all-wallets", label: "All Wallets", icon: Wallet },
  { path: "/new-registrations", label: "New Registrations", icon: BadgePlus },
  { path: "/new-users", label: "New Users", icon: UserPlus },
  { path: "/users-aggregated", label: "Users Aggregated", icon: Users },
  { path: "/lanaholders", label: "Lanaholders", icon: Crown },
  { path: "/knights", label: "Knights", icon: Shield },
  { path: "/lanapays", label: "LanaPays.Us", icon: CreditCard },
  { path: "/retail-wallets", label: "Retail Wallets", icon: Store },
  { path: "/lana-discount", label: "Lana.Discount", icon: Tag },
  { path: "/frozen-wallets", label: "Frozen Wallets", icon: Snowflake },
  { path: "/unregistered-over-limit", label: "Over-Limit Lanas", icon: AlertTriangle },
  { path: "/unregistered-dust", label: "Dust Lanas", icon: Sparkles },
  { path: "/public-api", label: "Public Data", icon: Globe },
  { path: "/api-docs", label: "API Docs", icon: Database },
  { path: "/api-docs#nostr-standards", label: "Nostr Standards", icon: Activity },
];

const PublicLinksSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Public pages menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-64">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Public Pages
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-1">
          {PUBLIC_LINKS.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Button
                key={path}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={cn("justify-start gap-2 h-8 text-xs", active && "font-semibold")}
                onClick={() => { navigate(path); setOpen(false); }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </Button>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
};

export default PublicLinksSidebar;
