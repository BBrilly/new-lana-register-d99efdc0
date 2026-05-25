import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Key, Shield, QrCode } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { convertWifToIds, storeAuthSession, storeUserProfile } from "@/utils/wifAuth";
import { fetchUserProfile } from "@/utils/profileVerification";
import { useToast } from "@/hooks/use-toast";

const Login = () => {
  const [wifKey, setWifKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Validate WIF key
      if (!wifKey.trim()) {
        throw new Error("Please enter your WIF key");
      }

      // Convert WIF to identifiers
      const authData = await convertWifToIds(wifKey.trim());

      // Fetch user profile from Nostr
      toast({
        title: "Verifying profile",
        description: "Checking your profile on Nostr network...",
      });

      const profile = await fetchUserProfile(authData.nostrHexId);

      if (!profile) {
        throw new Error("No profile found. Please create a KIND 0 profile first.");
      }

      if (!profile.name) {
        throw new Error("Profile is incomplete. Please ensure your profile has a name.");
      }

      // Store auth data and profile in session
      storeAuthSession(authData);
      storeUserProfile(profile);

      toast({
        title: "Login successful",
        description: `Welcome back, ${profile.display_name || profile.name}!`,
      });

      // Redirect to wallets
      navigate("/wallets");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Invalid WIF key";
      setError(errorMessage);
      toast({
        title: "Login failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startScanning = async () => {
    setIsScanning(true);
    setError("");
    
    // CRITICAL: 100ms delay to ensure DOM is ready
    setTimeout(async () => {
      try {
        // 1. Enumerate available cameras
        const cameras = await Html5Qrcode.getCameras();
        
        if (!cameras || cameras.length === 0) {
          toast({
            title: "No camera found",
            description: "No camera found on this device",
            variant: "destructive",
          });
          setIsScanning(false);
          return;
        }

        // 2. Select camera (priority: back camera)
        let selectedCamera = cameras[0];
        if (cameras.length > 1) {
          const backCamera = cameras.find(camera => 
            camera.label.toLowerCase().includes('back') || 
            camera.label.toLowerCase().includes('rear')
          );
          if (backCamera) {
            selectedCamera = backCamera;
          }
        }

        // 3. Initialize scanner with unique ID
        const scanner = new Html5Qrcode("qr-reader-login");
        scannerRef.current = scanner;

        // 4. Start scanner with camera.id
        await scanner.start(
          selectedCamera.id,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            // Success callback - QR code scanned
            setWifKey(decodedText);
            stopScanning();
            toast({
              title: "QR code scanned",
              description: "WIF key detected successfully",
            });
          },
          (errorMessage) => {
            // Error callback - ignore during operation
          }
        );
      } catch (error: any) {
        console.error("Error starting QR scanner:", error);
        setIsScanning(false);
        
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          toast({
            title: "Permission denied",
            description: "Camera permission denied. Please allow camera access in your browser settings.",
            variant: "destructive",
          });
        } else if (error.name === "NotFoundError") {
          toast({
            title: "No camera",
            description: "No camera found on this device",
            variant: "destructive",
          });
        } else if (error.name === "NotReadableError") {
          toast({
            title: "Camera in use",
            description: "Camera is already in use by another application",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: `Error starting camera: ${error.message || "Unknown error"}`,
            variant: "destructive",
          });
        }
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="mb-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary mx-auto mb-4">
            <span className="text-2xl font-bold text-primary-foreground">L</span>
          </div>
          <h1 className="text-3xl font-bold text-primary mb-2">Lana Register</h1>
          <p className="text-muted-foreground">Login with your LANA WIF Key</p>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              WIF Authentication
            </CardTitle>
            <CardDescription>
              Enter your LANA WIF private key — both formats are supported:
              <span className="block mt-1 text-xs">
                • <b>Staking</b> (preferred): starts with <code className="font-mono">T</code> · 52 chars · compressed
                <br />
                • <b>Dominate</b>: starts with <code className="font-mono">6</code> · 51 chars · uncompressed
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wif">WIF Private Key (T… or 6…)</Label>
                <Input
                  id="wif"
                  type="password"
                  placeholder="T… (Staking) or 6… (Dominate)"
                  value={wifKey}
                  onChange={(e) => setWifKey(e.target.value)}
                  disabled={isLoading || isScanning}
                  className="font-mono"
                />
              </div>

              {!isScanning ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={startScanning}
                  disabled={isLoading}
                  className="w-full"
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  Scan QR Code
                </Button>
              ) : (
                <div className="space-y-4">
                  <div
                    id="qr-reader-login"
                    ref={scannerDivRef}
                    className="rounded-lg overflow-hidden border-2 border-primary"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={stopScanning}
                    className="w-full"
                  >
                    Stop Scanning
                  </Button>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={isLoading || isScanning}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Login
                  </>
                )}
              </Button>
            </form>

            {/* Security Notice */}
            <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-start gap-2">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-foreground mb-1">Secure Authentication</p>
                  <p className="text-muted-foreground">
                    Your WIF key is processed locally and stored only in your browser session.
                    Never share your private key with anyone.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Back to Home */}
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
          >
            ← Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Login;
