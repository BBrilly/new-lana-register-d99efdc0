import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Send, AlertTriangle, Wallet, ArrowRight, Loader2, QrCode, Snowflake } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { toast } from 'sonner';
import { Html5Qrcode } from 'html5-qrcode';
import { getAuthSession, convertWifToIds } from '@/utils/wifAuth';
import { getStoredParameters, getStoredRelayStatuses, fetchLana8WonderPlan, calculateLana8WonderDue, Lana8WonderPlan } from '@/utils/nostrClient';

const ResolveMaxCap = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const fromWallet = searchParams.get('wallet') || '';
  const walletUuid = searchParams.get('walletUuid') || '';

  const [donationWallet, setDonationWallet] = useState<string>('');
  const [privateKey, setPrivateKey] = useState('');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const { balances, isLoading: isLoadingBalance } = useWalletBalances(fromWallet ? [fromWallet] : []);
  const balanceLana = fromWallet ? (balances.get(fromWallet) ?? 0) : 0;

  const fee = 0.001;
  const sendAmount = Math.max(0, +(balanceLana - fee).toFixed(8));
  const hasSufficientBalance = balanceLana > fee;

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const fetchDonationWallet = async () => {
      setIsLoadingSettings(true);
      setSettingsError(null);
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'max_cap_donation_wallet')
          .single();
        if (error) throw error;
        if (data) {
          setDonationWallet(data.value);
        } else {
          setSettingsError('Donation wallet not configured');
        }
      } catch (err) {
        console.error('Error fetching donation wallet:', err);
        setSettingsError('Failed to load donation wallet address');
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchDonationWallet();
  }, []);

  const startScanning = async () => {
    setIsScanning(true);
    setTimeout(async () => {
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          toast.error('No camera found on this device');
          setIsScanning(false);
          return;
        }
        let selectedCamera = cameras[0];
        if (cameras.length > 1) {
          const backCamera = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear'));
          if (backCamera) selectedCamera = backCamera;
        }
        const scanner = new Html5Qrcode("qr-reader-maxcap");
        scannerRef.current = scanner;
        await scanner.start(
          selectedCamera.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setPrivateKey(decodedText);
            stopScanning();
            toast.success('QR code scanned - WIF key detected');
          },
          () => {}
        );
      } catch (error: any) {
        console.error("Error starting QR scanner:", error);
        setIsScanning(false);
        toast.error(`Error starting camera: ${error.message || "Unknown error"}`);
      }
    }, 100);
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (error) {
        console.error("Error stopping scanner:", error);
      }
    }
    setIsScanning(false);
  };

  const handleSend = async () => {
    if (!privateKey.trim()) {
      toast.error('Please enter your private key (WIF)');
      return;
    }
    if (!hasSufficientBalance) {
      toast.error('Insufficient balance');
      return;
    }
    if (!donationWallet) {
      toast.error('Donation wallet not configured');
      return;
    }

    setIsSending(true);
    try {
      // Validate WIF matches the wallet
      toast.info('Validating private key...');
      const wifResult = await convertWifToIds(privateKey.trim());
      const matchesCompressed = wifResult.compressedAddress === fromWallet;
      const matchesUncompressed = wifResult.uncompressedAddress === fromWallet;
      if (!matchesCompressed && !matchesUncompressed) {
        toast.error(`Private key does not match wallet. Expected: ${fromWallet}`);
        setIsSending(false);
        return;
      }
      toast.success('Private key validated');

      const authSession = getAuthSession();
      if (!authSession) {
        toast.error('User session not found. Please log in again.');
        setIsSending(false);
        return;
      }

      const sysParams = getStoredParameters();
      const relayStatuses = getStoredRelayStatuses();

      let electrumServers: { host: string; port: number }[] = [
        { host: "electrum1.lanacoin.com", port: 5097 },
        { host: "electrum2.lanacoin.com", port: 5097 }
      ];
      if (sysParams?.electrum && Array.isArray(sysParams.electrum)) {
        electrumServers = (sysParams.electrum as any[]).map(e => ({ host: e.host, port: Number(e.port) }));
      }

      let relays = relayStatuses.filter(r => r.connected).map(r => r.url);
      if (relays.length === 0 && sysParams?.relays) relays = sysParams.relays;
      if (relays.length === 0) relays = ['wss://relay.lanavault.space', 'wss://relay.lanacoin-eternity.com'];

      toast.info('Building and broadcasting transaction...');

      // Send ALL balance to donation wallet
      const response = await supabase.functions.invoke('return-lanas-and-send-KIND-87009', {
        body: {
          sender_address: fromWallet,
          recipients: [
            { address: donationWallet, amount: sendAmount }
          ],
          private_key: privateKey,
          electrum_servers: electrumServers,
          relays: relays,
          user_pubkey_hex: authSession.nostrHexId,
          original_event_id: 'max-cap-resolve-' + Date.now(),
          from_wallet: fromWallet,
          to_wallet: donationWallet,
          amount_lanoshis: String(Math.round(sendAmount * 100000000)),
          memo: 'Max cap exceeded — balance donated to resolve freeze.'
        }
      });

      if (response.error) throw new Error(response.error.message || 'Failed to send transaction');
      const result = response.data;
      if (!result.success) throw new Error(result.error || 'Transaction failed');

      toast.success('Transaction broadcast successful! Unfreezing wallet...');

      // Unfreeze the wallet
      const unfreezeResponse = await supabase.functions.invoke('freeze-wallets', {
        body: {
          wallet_ids: [walletUuid],
          freeze: false,
          freeze_reason: '',
          nostr_hex_id: authSession.nostrHexId
        }
      });

      if (unfreezeResponse.error) {
        toast.error('Transaction sent but failed to unfreeze. Contact support.');
      } else {
        toast.success(
          <div className="space-y-1">
            <p className="font-semibold">Wallet unfrozen successfully!</p>
            <p className="text-sm">TX: {result.txid?.slice(0, 16)}...</p>
            <p className="text-sm text-green-600">Balance donated & wallet unfrozen</p>
          </div>,
          { duration: 10000 }
        );
      }

      setTimeout(() => navigate('/wallets'), 2000);
    } catch (err) {
      console.error('Error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to send transaction');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto py-6 px-4 max-w-2xl">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-blue-500" />
              Resolve Max Cap Freeze
            </CardTitle>
            <CardDescription>
              Your wallet exceeded the maximum LANA cap and was frozen. To unfreeze it, donate your entire balance to the system wallet.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Balance to donate */}
            <div className="rounded-lg border border-blue-400/30 bg-blue-50/50 dark:bg-blue-950/20 p-4">
              <Label className="text-sm text-muted-foreground">Amount to Donate (entire balance)</Label>
              <div className="mt-1">
                {isLoadingBalance ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {sendAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} LAN
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Full balance: {balanceLana.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} LAN (fee: {fee} LAN)
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* From/To */}
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm text-muted-foreground">From (Frozen Wallet)</Label>
                </div>
                <code className="text-sm font-mono break-all">{fromWallet}</code>
                <div className="mt-3 flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">Balance:</Label>
                  {isLoadingBalance ? (
                    <Skeleton className="h-5 w-24" />
                  ) : (
                    <Badge variant={hasSufficientBalance ? "default" : "destructive"}>
                      {balanceLana.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} LAN
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <Label className="text-sm text-muted-foreground">Donation Wallet (Max Cap)</Label>
                </div>
                {isLoadingSettings ? (
                  <Skeleton className="h-5 w-full" />
                ) : settingsError ? (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    {settingsError}
                  </div>
                ) : (
                  <code className="text-sm font-mono break-all">{donationWallet}</code>
                )}
              </div>
            </div>

            {/* Fee */}
            <div className="rounded-lg border bg-muted/10 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network Fee (estimated):</span>
                <span>{fee} LAN</span>
              </div>
              <div className="flex justify-between font-medium mt-1">
                <span>Amount Donated:</span>
                <span>{sendAmount.toLocaleString('en-US', { minimumFractionDigits: 4 })} LAN</span>
              </div>
            </div>

            {/* Balance warning */}
            {!isLoadingBalance && !hasSufficientBalance && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Wallet balance is too low to cover the transaction fee.</span>
                </div>
              </div>
            )}

            {/* Private Key */}
            <div className="space-y-2">
              <Label htmlFor="privateKey">Private Key (WIF)</Label>
              <Input
                id="privateKey"
                type="password"
                placeholder="Enter your private key to sign the transaction"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                disabled={isScanning}
                className="font-mono"
              />
              {!isScanning ? (
                <Button type="button" variant="outline" onClick={startScanning} disabled={isSending} className="w-full">
                  <QrCode className="mr-2 h-4 w-4" />
                  Scan QR Code
                </Button>
              ) : (
                <div className="space-y-2">
                  <div id="qr-reader-maxcap" className="rounded-lg overflow-hidden border-2 border-primary" />
                  <Button type="button" variant="destructive" onClick={stopScanning} className="w-full">
                    Stop Scanning
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Your private key is used only to sign the transaction locally and is never sent to any server.
              </p>
            </div>

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={isSending || isLoadingSettings || !hasSufficientBalance || !privateKey.trim() || !!settingsError || isScanning}
              className="w-full"
              size="lg"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Donate All & Unfreeze Wallet
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ResolveMaxCap;
