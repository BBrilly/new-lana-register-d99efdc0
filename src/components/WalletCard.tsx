import { Wallet } from "@/types/wallet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Info, Trash2, Wallet as WalletIcon, Copy, Check, ExternalLink, Package, Pencil, X, Loader2, Snowflake, Store } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import WalletNostrEvents from "./WalletNostrEvents";
import WalletDeleteDialog from "./WalletDeleteDialog";

interface WalletCardProps {
  wallet: Wallet;
  onDelete: (id: string) => Promise<void>;
  onUpdateNotes?: (id: string, notes: string) => Promise<void>;
  onConvertToRetail?: (id: string) => Promise<void>;
  userCurrency: string;
  fxRates: { EUR: number; GBP: number; USD: number } | null;
}

const WalletCard = ({ wallet, onDelete, onUpdateNotes, onConvertToRetail, userCurrency, fxRates }: WalletCardProps) => {
  const [copied, setCopied] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState(wallet.description);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const navigate = useNavigate();

  const handleConvert = async () => {
    if (!onConvertToRetail) return;
    setIsConverting(true);
    try {
      await onConvertToRetail(wallet.id);
      setShowConvertDialog(false);
    } catch {
      // toast handled in parent
    } finally {
      setIsConverting(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!onUpdateNotes) return;
    setIsSavingNotes(true);
    try {
      await onUpdateNotes(wallet.id, editedNotes);
      setIsEditingNotes(false);
    } catch {
      // toast handled in parent
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedNotes(wallet.description);
    setIsEditingNotes(false);
  };

  const isFrozen = wallet.frozen === true;

  const canDelete = !isFrozen && !["main", "lana8wonder", "knights", "lanaknights"].some(
    t => wallet.type.toLowerCase().includes(t)
  );

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case "EUR": return "€";
      case "USD": return "$";
      case "GBP": return "£";
      default: return currency;
    }
  };

  const currencySymbol = getCurrencySymbol(userCurrency);
  const exchangeRate = fxRates?.[userCurrency as keyof typeof fxRates] || 0;
  const fiatAmount = wallet.lanAmount * exchangeRate;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.walletNumber);
      setCopied(true);
      toast.success("Wallet ID copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const getTypeColor = (type: string) => {
    const lowerType = type.toLowerCase();
    
    if (lowerType.includes("main")) {
      return "bg-success/10 text-success";
    } else if (lowerType.includes("savings")) {
      return "bg-primary/10 text-primary";
    } else if (lowerType.includes("business")) {
      return "bg-purple-500/10 text-purple-500";
    } else if (lowerType.includes("lana8wonder")) {
      return "bg-orange-500/10 text-orange-500";
    } else if (lowerType.includes("lanapays")) {
      return "bg-red-500/10 text-red-500";
    } else if (lowerType.includes("hardware")) {
      return "bg-success/10 text-success";
    } else if (lowerType.includes("software")) {
      return "bg-primary/10 text-primary";
    } else if (lowerType.includes("exchange")) {
      return "bg-warning/10 text-warning";
    }
    
    return "bg-muted text-muted-foreground";
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "warning":
        return <AlertCircle className="h-4 w-4" />;
      case "success":
        return <CheckCircle className="h-4 w-4" />;
      case "info":
        return <Info className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const isMainWallet = wallet.type.toLowerCase().includes("main");
  const isLana8Wonder = wallet.type.toLowerCase().includes("lana8wonder");
  
  const cardBorderClass = isFrozen
    ? "border-blue-400/50 bg-blue-50/30 dark:bg-blue-950/20"
    : isMainWallet 
    ? "border-success/50 bg-success/5" 
    : isLana8Wonder 
    ? "border-orange-500/50 bg-orange-500/5" 
    : "";

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md ${cardBorderClass}`}>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${isMainWallet ? "bg-success/10" : isLana8Wonder ? "bg-orange-500/10" : "bg-primary/10"}`}>
              <WalletIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${isMainWallet ? "text-success" : isLana8Wonder ? "text-orange-500" : "text-primary"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-semibold text-foreground">{wallet.type}</h3>
                {isMainWallet && <Badge className="bg-success/10 text-success">Main</Badge>}
                {isLana8Wonder && <Badge className="bg-orange-500/10 text-orange-500">Lana8Wonder</Badge>}
                {isFrozen && (
                  <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
                    <Snowflake className="h-3 w-3" />
                    Frozen
                  </Badge>
                )}
                {wallet.splitCreated != null && (
                  <Badge variant="outline" className="text-xs font-mono">Split #{wallet.splitCreated}</Badge>
                )}
              </div>
              {isEditingNotes ? (
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    className="h-7 text-sm"
                    autoFocus
                    disabled={isSavingNotes}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveNotes();
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleSaveNotes} disabled={isSavingNotes}>
                    {isSavingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-success" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCancelEdit} disabled={isSavingNotes}>
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-1 group">
                  <p className="text-sm text-muted-foreground">{wallet.description || "No notes"}</p>
                  {onUpdateNotes && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      onClick={() => setIsEditingNotes(true)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
              <div className="mt-1 flex items-center gap-2">
                <p className="font-mono text-xs text-muted-foreground truncate">ID: {wallet.walletNumber}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/wallets/${wallet.id}/consolidate`)}
              className="gap-2 text-xs sm:text-sm"
            >
              <Package className="h-4 w-4" />
              Consolidate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`https://chainz.cryptoid.info/lana/address.dws?${wallet.walletNumber}.htm`, '_blank')}
              className="gap-2 text-xs sm:text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              Transactions
            </Button>
            {onConvertToRetail && wallet.type === "Wallet" && !isFrozen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConvertDialog(true)}
                className="gap-2 text-xs sm:text-sm"
              >
                <Store className="h-4 w-4" />
                Convert to Retail
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">LAN Balance</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {wallet.lanAmount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">LAN</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">{userCurrency} Value</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {currencySymbol}{" "}
              {fiatAmount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Rate: 1 LAN = {exchangeRate.toFixed(6)} {userCurrency}</p>
          </div>
        </div>

        {/* Max Cap Freeze Resolution Button */}
        {isFrozen && wallet.freezeReason === 'frozen_max_cap' && (
          <div className="mt-4 rounded-lg border border-blue-400/30 bg-blue-50/50 dark:bg-blue-950/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Maximum Cap Exceeded</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Donate your entire balance to unfreeze this wallet.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/wallets/resolve-max-cap?wallet=${wallet.walletNumber}&walletUuid=${wallet.id}`)}
                className="shrink-0 border-blue-400 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
              >
                <Snowflake className="mr-2 h-4 w-4" />
                Resolve Freeze
              </Button>
            </div>
          </div>
        )}

        {wallet.notification && (
          <Alert className="mt-4 border-l-4" variant={wallet.notification.type === "warning" ? "destructive" : "default"}>
            <div className="flex gap-2">
              {getNotificationIcon(wallet.notification.type)}
              <div className="flex-1">
                <AlertDescription className="text-sm">
                  <span className="font-medium">{wallet.notification.message}</span>
                  {wallet.notification.action && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {wallet.notification.action}
                    </span>
                  )}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {wallet.events.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-semibold text-foreground">Recent Events</h4>
            <div className="space-y-2">
              {wallet.events.slice(0, 3).map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={event.type === "unregistered_lan" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {event.type === "unregistered_lan" ? "Unregistered" : event.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString("en-US")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{event.description}</p>
                  </div>
                  {event.amount && (
                    <div className="ml-4 text-right">
                      <p
                        className={`text-sm font-semibold ${
                          event.amount > 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {event.amount > 0 ? "+" : ""}
                        {event.amount.toFixed(2)} LAN
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nostr Kind 87003 Events */}
        <WalletNostrEvents walletAddress={wallet.walletNumber} walletUuid={wallet.id} />
      </div>

      {canDelete && (
        <WalletDeleteDialog
          walletType={wallet.type}
          walletNumber={wallet.walletNumber}
          isOpen={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirmDelete={async () => {
            await onDelete(wallet.id);
            setShowDeleteDialog(false);
          }}
        />
      )}
    </Card>
  );
};

export default WalletCard;
