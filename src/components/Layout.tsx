import { ReactNode, useEffect, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { Wallet, LogOut, Shield, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { logout, isAuthenticated, getAuthSession } from "@/utils/wifAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getStoredParameters } from "@/utils/nostrClient";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const authenticated = isAuthenticated();
  const [isAdmin, setIsAdmin] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [currentSplit, setCurrentSplit] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadSplit = async () => {
      const stored = getStoredParameters();
      if (stored?.split) {
        setCurrentSplit(stored.split);
        return;
      }
      const { data } = await supabase
        .from('system_parameters')
        .select('split')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data?.split) setCurrentSplit(String(data.split));
    };
    loadSplit();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!authenticated) {
        setIsAdmin(false);
        return;
      }

      const session = getAuthSession();
      if (!session?.nostrHexId) {
        setIsAdmin(false);
        return;
      }

      const { data, error } = await supabase
        .from('admin_users')
        .select('nostr_hex_id')
        .eq('nostr_hex_id', session.nostrHexId)
        .maybeSingle();

      setIsAdmin(!error && !!data);
    };

    checkAdminStatus();
  }, [authenticated]);

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out",
    });
    navigate("/login");
    setSheetOpen(false);
  };

  const navLinks = (
    <>
      <NavLink
        to="/wallets"
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        activeClassName="bg-secondary text-foreground"
        onClick={() => setSheetOpen(false)}
      >
        <Wallet className="h-4 w-4" />
        Wallets
      </NavLink>
      {isAdmin && (
        <NavLink
          to="/admin"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors bg-red-600 text-white hover:bg-red-700"
          activeClassName="bg-red-700 text-white"
          onClick={() => setSheetOpen(false)}
        >
          <Shield className="h-4 w-4" />
          Admin
        </NavLink>
      )}
      {authenticated && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium justify-start"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <span className="text-lg font-bold text-primary-foreground">L</span>
              </div>
              <span className="text-xl font-semibold text-foreground hidden sm:inline">
                Decentralised Lana Register
              </span>
              <span className="text-xl font-semibold text-foreground sm:hidden">
                DLR
              </span>
              {currentSplit && (
                <Badge variant="secondary" className="ml-2 font-mono">
                  Split {currentSplit}
                </Badge>
              )}
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex gap-1">
              {navLinks}
            </div>

            {/* Mobile hamburger */}
            <div className="md:hidden">
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 flex flex-col gap-2">
                    {navLinks}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-6 md:py-8">{children}</main>
    </div>
  );
};
export default Layout;
