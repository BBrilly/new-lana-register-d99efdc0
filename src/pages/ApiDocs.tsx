import { ArrowLeft, ExternalLink, Key, FileCode, AlertCircle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import CodeBlock from "@/components/api-docs/CodeBlock";
import KeyDerivationDocs from "@/components/api-docs/KeyDerivationDocs";

const ApiDocs = () => {
  const navigate = useNavigate();
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // ====== check_wallet examples ======
  const checkWalletRequest = `{
  "method": "check_wallet",
  "api_key": "YOUR_API_KEY",
  "data": {
    "wallet_id": "LWalletAddress123456789012345678",
    "nostr_id_hex": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  }
}`;

  const checkWalletSuccess = `{
  "success": true,
  "wallet_id": "LWalletAddress123456789012345678",
  "status": "ok",
  "message": "Wallet is registered and valid",
  "correlation_id": "uuid-string"
}`;

  const checkWalletNewReg = `{
  "success": true,
  "wallet_id": "LWalletAddress123456789012345678",
  "status": "ok",
  "message": "Wallet registered successfully",
  "data": {
    "profileId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "correlation_id": "uuid-string"
}`;

  const checkWalletRejected = `{
  "success": false,
  "wallet_id": "LWalletAddress123456789012345678",
  "status": "rejected",
  "message": "Wallet is not virgin (balance: 15000). Only zero-balance wallets can be registered via this method.",
  "correlation_id": "uuid-string"
}`;

  const checkWalletCurl = `curl -X POST \\
  'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "method": "check_wallet",
    "api_key": "YOUR_API_KEY",
    "data": {
      "wallet_id": "LWalletAddress123456789012345678",
      "nostr_id_hex": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
    }
  }'`;

  const checkWalletCurlNoNostr = `curl -X POST \\
  'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "method": "check_wallet",
    "api_key": "YOUR_API_KEY",
    "data": {
      "wallet_id": "LWalletAddress123456789012345678"
    }
  }'`;

  // ====== register_virgin_wallets examples ======
  const requestExample = `{
  "method": "register_virgin_wallets_for_existing_user",
  "api_key": "your_api_key",
  "data": {
    "nostr_id_hex": "64-character-hex-string",
    "wallets": [
      {
        "wallet_id": "LxxxxxxxxxxxxxxxxxxxxxxxxL",
        "wallet_type": "Main Wallet",
        "notes": "Optional note"
      },
      {
        "wallet_id": "LyyyyyyyyyyyyyyyyyyyyyyyL",
        "wallet_type": "Wallet",
        "notes": ""
      }
    ]
  }
}`;

  const responseSuccess = `{
  "success": true,
  "status": "ok",
  "message": "Successfully registered 2 virgin wallets",
  "data": {
    "nostr_id_hex": "64-character-hex-string",
    "wallets_registered": 2,
    "wallets": [
      {
        "wallet_id": "LxxxxxxxxxxxxxxxxxxxxxxxxL",
        "wallet_type": "Main Wallet",
        "nostr_broadcast": "success",
        "nostr_event_ids": {
          "kind_87006": "event_id_1",
          "kind_87002": "event_id_2"
        }
      }
    ],
    "nostr_broadcasts": {
      "successful": 2,
      "failed": 0
    }
  },
  "processing_time_ms": 1234,
  "correlation_id": "uuid-string"
}`;

  const responseError = `{
  "success": false,
  "status": "error",
  "error": "Error message description",
  "correlation_id": "uuid-string"
}`;

  const curlExample = `curl -X POST \\
  'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "method": "register_virgin_wallets_for_existing_user",
    "api_key": "your_api_key",
    "data": {
      "nostr_id_hex": "your_nostr_hex_id",
      "wallets": [
        {
          "wallet_id": "LxxxxxxxxxxxxxxxxxxxxxxxxL",
          "wallet_type": "Main Wallet"
        }
      ]
    }
  }'`;

  // ====== register_lanapays_wallet examples ======
  const lanaPaysRequest = `{
  "method": "register_lanapays_wallet",
  "api_key": "YOUR_API_KEY",
  "data": {
    "wallet_id": "LWalletAddress123456789012345678",
    "nostr_id_hex": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    "split": "current",
    "notes": "Store #42 downtown"
  }
}`;

  const lanaPaysSuccess = `{
  "success": true,
  "wallet_id": "LWalletAddress123456789012345678",
  "status": "ok",
  "message": "LanaPays.us wallet registered successfully",
  "data": {
    "profileId": "550e8400-e29b-41d4-a716-446655440000",
    "split_created": 4
  },
  "correlation_id": "uuid-string"
}`;

  const lanaPaysRejected = `{
  "success": false,
  "wallet_id": "LWalletAddress123456789012345678",
  "status": "rejected",
  "message": "Wallet is not virgin (balance: 15000). Only zero-balance wallets can be registered via this method.",
  "correlation_id": "uuid-string"
}`;

  const lanaPaysCurl = `curl -X POST \\
  'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "method": "register_lanapays_wallet",
    "api_key": "YOUR_API_KEY",
    "data": {
      "wallet_id": "LWalletAddress123456789012345678",
      "nostr_id_hex": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
      "split": "next",
      "notes": "POS terminal #7"
    }
  }'`;

  // ====== simple_check_wallet_registration examples ======
  const simpleCheckRequest = `{
  "method": "simple_check_wallet_registration",
  "api_key": "YOUR_API_KEY",
  "data": {
    "wallet_id": "LWalletAddress123456789012345678"
  }
}`;

  const simpleCheckFound = `{
  "success": true,
  "registered": true,
  "wallet": {
    "wallet_id": "LWalletAddress123456789012345678",
    "wallet_type": "Main Wallet",
    "main_wallet_id": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-06-15T10:30:00.000Z",
    "frozen": false,
    "split_created": 4,
    "nostr_hex_id": "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
  },
  "correlation_id": "uuid-string"
}`;

  const simpleCheckNotFound = `{
  "success": true,
  "registered": false,
  "wallet_id": "LWalletAddress123456789012345678",
  "correlation_id": "uuid-string"
}`;

  const simpleCheckCurl = `curl -X POST \\
  'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/check' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "method": "simple_check_wallet_registration",
    "api_key": "YOUR_API_KEY",
    "data": {
      "wallet_id": "LWalletAddress123456789012345678"
    }
  }'`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                  <span className="text-lg font-bold text-primary-foreground">L</span>
                </div>
                <span className="text-xl font-semibold text-foreground hidden sm:inline">API Documentation</span>
                <span className="text-xl font-semibold text-foreground sm:hidden">API Docs</span>
              </div>
            </div>
            <a 
              href="https://lanawatch.us" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">lanawatch.us</span>
            </a>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        {/* Introduction */}
        <div className="mb-8">
          <h1 className="mb-4 text-3xl sm:text-4xl font-bold text-foreground">Lana Register API</h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            External API for integrating with the Lana Register system. Check and register wallets,
            and broadcast registration events to the Nostr network.
          </p>
          <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Base URL</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm sm:text-lg font-mono text-foreground break-all">https://laluxmwarlejdwyboudz.supabase.co</code>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <BookOpen className="h-3 w-3" />
              REST API
            </Badge>
            <Badge variant="outline">JSON</Badge>
            <a 
              href="https://lanawatch.us" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline text-sm ml-4"
            >
              Official Website
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Top-level tabs: API Docs vs Technical Docs */}
        <Tabs defaultValue="api" className="mb-8">
          <TabsList className="mb-6">
            <TabsTrigger value="api">API Documentation</TabsTrigger>
            <TabsTrigger value="technical">Technical Documentation</TabsTrigger>
          </TabsList>

          <TabsContent value="api">
            <div className="space-y-8">

        {/* Authentication Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Authentication
            </CardTitle>
            <CardDescription>
              All API requests require authentication via API key
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              API keys are provided to authorized services only. The API key must be included in the request body 
              as the <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">api_key</code> field.
            </p>
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> To obtain an API key, please contact the Lana Register administrators 
                through the official website at{" "}
                <a href="https://lanawatch.us" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  lanawatch.us
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Endpoint Overview */}
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-foreground mb-2">Single Endpoint — Multiple Methods</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  All operations below use the <strong>same endpoint</strong>. The <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">method</code> field in the request body determines which operation is executed.
                </p>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <Badge className="bg-success text-success-foreground">POST</Badge>
                  <code className="px-3 py-1.5 rounded bg-muted text-foreground text-sm font-mono break-all">
                    /functions/v1/register-virgin-wallets
                  </code>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><code className="px-1.5 py-0.5 rounded bg-muted text-foreground">"method": "check_wallet"</code> — Check & auto-register a single wallet</p>
                  <p><code className="px-1.5 py-0.5 rounded bg-muted text-foreground">"method": "register_virgin_wallets_for_existing_user"</code> — Bulk register wallets for existing profile</p>
                  <p><code className="px-1.5 py-0.5 rounded bg-muted text-foreground">"method": "register_lanapays_wallet"</code> — Register a LanaPays.us wallet with split control</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Methods Tabs */}
        <Tabs defaultValue="check_wallet" className="mb-8">
          <TabsList className="mb-4 w-full sm:w-auto flex">
            <TabsTrigger value="check_wallet" className="flex-1 sm:flex-none text-xs sm:text-sm">check_wallet</TabsTrigger>
            <TabsTrigger value="register_virgin" className="flex-1 sm:flex-none text-xs sm:text-sm">register_virgin_wallets</TabsTrigger>
            <TabsTrigger value="register_lanapays" className="flex-1 sm:flex-none text-xs sm:text-sm">register_lanapays_wallet</TabsTrigger>
          </TabsList>

          {/* ====== CHECK WALLET TAB ====== */}
          <TabsContent value="check_wallet">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-primary" />
                  Check Wallet
                </CardTitle>
                <CardDescription>
                  Check if a wallet exists in the registry. If not registered and virgin (balance = 0), automatically register it as a new profile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Endpoint removed — shown in overview above */}

                {/* Description */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                  <p className="text-foreground">
                    This endpoint checks if a wallet address is already registered in the system. If not, it validates
                    that the wallet is virgin (zero balance) and automatically creates a new profile with the wallet.
                  </p>
                  <ul className="mt-3 space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Returns immediately if wallet is already registered
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Creates new profile (main_wallet) + wallet entry for unregistered virgin wallets
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Broadcasts KIND 87006, KIND 87002, and KIND 30889 events on new registration
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Rejects non-virgin wallets (balance {'>'} 0)
                    </li>
                  </ul>
                </div>

                {/* Process Flow */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">API Process Flow</h4>
                  <div className="space-y-3">
                    <div className="flex gap-3 items-start">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                      <div>
                        <p className="font-medium text-foreground">Check Existence</p>
                        <p className="text-sm text-muted-foreground">Checks if wallet_id exists in main_wallets or wallets tables</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                      <div>
                        <p className="font-medium text-foreground">Virgin Validation</p>
                        <p className="text-sm text-muted-foreground">If not registered, validates wallet has zero balance via Electrum</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                      <div>
                        <p className="font-medium text-foreground">Registration</p>
                        <p className="text-sm text-muted-foreground">Creates main_wallet profile + wallet entry, broadcasts Nostr events</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Request Body */}
                <CodeBlock code={checkWalletRequest} sectionId="cw-request" label="Request Body" />

                {/* Parameters */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Parameters</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Required</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-mono text-sm">method</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Must be "check_wallet"</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">api_key</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Your API authentication key</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.wallet_id</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">LANA wallet address (starts with 'L', 26-35 chars)</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.nostr_id_hex</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge variant="secondary">Optional</Badge></TableCell>
                          <TableCell className="text-muted-foreground">64-character hex Nostr public key. Used for profile identification.</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.wallet_type</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge variant="secondary">Optional</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Wallet type. Falls back to API key's service_name, then "Main Wallet".</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.notes</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge variant="secondary">Optional</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Optional notes for the wallet</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Wallet Type Resolution */}
                <div className="bg-muted/50 border border-border rounded-lg p-4">
                  <h4 className="text-sm font-medium text-foreground mb-2">Wallet Type Resolution</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    The API uses a fallback mechanism for wallet type assignment:
                  </p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li><strong>Primary:</strong> Uses the wallet_type specified in the request (if valid)</li>
                    <li><strong>Fallback:</strong> Uses the API key's service_name as wallet type (if it matches a valid type)</li>
                    <li><strong>Default:</strong> Falls back to "Main Wallet"</li>
                  </ol>
                </div>

                {/* Responses */}
                <CodeBlock code={checkWalletSuccess} sectionId="cw-success" label="Success Response – Existing Wallet (200)" />
                <CodeBlock code={checkWalletNewReg} sectionId="cw-newreg" label="Success Response – New Registration (200)" />
                <CodeBlock code={checkWalletRejected} sectionId="cw-rejected" label="Rejection Response – Non-Virgin Wallet (200)" />

                {/* cURL Examples */}
                <CodeBlock code={checkWalletCurl} sectionId="cw-curl" label="cURL Example" />
                <CodeBlock code={checkWalletCurlNoNostr} sectionId="cw-curl-no-nostr" label="cURL Example (without Nostr ID)" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ====== REGISTER VIRGIN WALLETS TAB ====== */}
          <TabsContent value="register_virgin">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-primary" />
                  Register Virgin Wallets
                </CardTitle>
                <CardDescription>
                  Bulk register zero-balance (virgin) wallets for an existing user profile
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Endpoint removed — shown in overview above */}

                {/* Description */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                  <p className="text-foreground">
                    This endpoint allows you to register up to <strong>8 virgin wallets</strong> (zero-balance wallets) 
                    for an existing user profile. The user must already have a profile in the system, identified by 
                    their Nostr hex ID.
                  </p>
                  <ul className="mt-3 space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Validates that all wallets have zero balance before registration
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Broadcasts KIND 87006 (Virgin Wallet Confirmation) and KIND 87002 (Registration Confirmation) events
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Updates KIND 30889 (Wallet List) with the new wallets
                    </li>
                  </ul>
                </div>

                <CodeBlock code={requestExample} sectionId="rv-request" label="Request Body" />

                {/* Parameters */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Parameters</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Required</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-mono text-sm">method</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Must be "register_virgin_wallets_for_existing_user"</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">api_key</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Your API authentication key</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.nostr_id_hex</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">64-character hex string of the user's Nostr public key</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.wallets</TableCell>
                          <TableCell><Badge variant="outline">array</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Array of 1-8 wallet objects to register</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.wallets[].wallet_id</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">LANA wallet address (starts with 'L', 26-35 chars)</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.wallets[].wallet_type</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge variant="secondary">Optional</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Wallet type (defaults to "Main Wallet")</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.wallets[].notes</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge variant="secondary">Optional</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Optional notes for the wallet</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <CodeBlock code={responseSuccess} sectionId="rv-success" label="Success Response (200)" />
                <CodeBlock code={responseError} sectionId="rv-error" label="Error Response" />
                <CodeBlock code={curlExample} sectionId="rv-curl" label="cURL Example" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ====== REGISTER LANAPAYS WALLET TAB ====== */}
          <TabsContent value="register_lanapays">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-primary" />
                  Register LanaPays.us Wallet
                </CardTitle>
                <CardDescription>
                  Register a virgin wallet specifically as type "LanaPays.us" with split control (current or next).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Description */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                  <p className="text-foreground">
                    Registers a single virgin (zero-balance) wallet as type <strong>LanaPays.us</strong>. If the profile
                    (identified by <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">nostr_id_hex</code>) doesn't exist, it will be created automatically.
                  </p>
                  <ul className="mt-3 space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Validates wallet is virgin (balance = 0) via Electrum
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">split: "current"</code> — uses the current split number from KIND 38888
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">split: "next"</code> — uses current split + 1 (e.g. if current is 4, writes 5)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Broadcasts KIND 87006 (Virgin Confirmation), KIND 87002 (Registration), and KIND 30889 (Wallet List)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      Wallet type is always set to "LanaPays.us" — cannot be overridden
                    </li>
                  </ul>
                </div>

                {/* Process Flow */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">API Process Flow</h4>
                  <div className="space-y-3">
                    <div className="flex gap-3 items-start">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                      <div>
                        <p className="font-medium text-foreground">Validate Inputs</p>
                        <p className="text-sm text-muted-foreground">Validates wallet_id, nostr_id_hex (required), and split parameter</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                      <div>
                        <p className="font-medium text-foreground">Duplicate Check</p>
                        <p className="text-sm text-muted-foreground">Checks wallet doesn't already exist in wallets or main_wallets tables</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                      <div>
                        <p className="font-medium text-foreground">Virgin Validation</p>
                        <p className="text-sm text-muted-foreground">Verifies wallet balance is exactly 0 via Electrum servers</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
                      <div>
                        <p className="font-medium text-foreground">Registration</p>
                        <p className="text-sm text-muted-foreground">Creates/finds profile, inserts wallet with computed split_created, broadcasts Nostr events</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Request Body */}
                <CodeBlock code={lanaPaysRequest} sectionId="lp-request" label="Request Body" />

                {/* Parameters */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Parameters</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Required</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-mono text-sm">method</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Must be "register_lanapays_wallet"</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">api_key</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Your API authentication key</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.wallet_id</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">LANA wallet address (starts with 'L', 26-35 chars)</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.nostr_id_hex</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">64-character hex Nostr public key of the wallet owner</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.split</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                          <TableCell className="text-muted-foreground">"current" (use active split) or "next" (current split + 1)</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono text-sm">data.notes</TableCell>
                          <TableCell><Badge variant="outline">string</Badge></TableCell>
                          <TableCell><Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Optional</Badge></TableCell>
                          <TableCell className="text-muted-foreground">Description or note for the wallet (max 500 chars)</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Split Logic */}
                <div className="bg-muted/50 border border-border rounded-lg p-4">
                  <h4 className="text-sm font-medium text-foreground mb-2">Split Logic</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    The <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">split</code> parameter controls which split number is written to the <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">split_created</code> field:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li><strong>"current"</strong> — Writes the current split number from KIND 38888 (e.g. if current split is 4, writes 4)</li>
                    <li><strong>"next"</strong> — Writes current split + 1 (e.g. if current split is 4, writes 5)</li>
                  </ul>
                </div>

                {/* Responses */}
                <CodeBlock code={lanaPaysSuccess} sectionId="lp-success" label="Success Response (200)" />
                <CodeBlock code={lanaPaysRejected} sectionId="lp-rejected" label="Rejection Response — Non-Virgin Wallet (200)" />

                {/* cURL */}
                <CodeBlock code={lanaPaysCurl} sectionId="lp-curl" label="cURL Example" />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ========== ENDPOINT 2: CHECK ========== */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
            <FileCode className="h-6 w-6 text-primary" />
            Endpoint 2: Check
          </h2>

          {/* Endpoint Overview */}
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Read-Only Endpoint</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    This endpoint only <strong>reads</strong> from the database — no writes, no Nostr broadcasts, no registrations.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-success text-success-foreground">POST</Badge>
                    <code className="px-3 py-1.5 rounded bg-muted text-foreground text-sm font-mono break-all">
                      /functions/v1/check
                    </code>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Method: simple_check_wallet_registration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-primary" />
                Method: simple_check_wallet_registration
              </CardTitle>
              <CardDescription>
                Check if a wallet address is currently registered in the wallets table. Returns registration status and basic metadata if found.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Description */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                <p className="text-foreground">
                  A lightweight, read-only check that queries the <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">wallets</code> table
                  for a matching <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">wallet_id</code>. No side effects — purely informational.
                </p>
                <ul className="mt-3 space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    Returns wallet metadata (type, main_wallet_id, created_at, frozen, nostr_hex_id) if registered
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    Returns <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">frozen: true/false</code> to indicate if the wallet is frozen
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    Returns the owner's <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">nostr_hex_id</code> (public key) for registered wallets
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    Returns <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">registered: false</code> if not found
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    No writes, no Nostr broadcasts, no balance checks
                  </li>
                </ul>
              </div>

              {/* Request Body */}
              <CodeBlock code={simpleCheckRequest} sectionId="sc-request" label="Request Body" />

              {/* Parameters */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Parameters</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-mono text-sm">method</TableCell>
                        <TableCell><Badge variant="outline">string</Badge></TableCell>
                        <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                        <TableCell className="text-muted-foreground">Must be "simple_check_wallet_registration"</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">api_key</TableCell>
                        <TableCell><Badge variant="outline">string</Badge></TableCell>
                        <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                        <TableCell className="text-muted-foreground">Your API authentication key</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">data.wallet_id</TableCell>
                        <TableCell><Badge variant="outline">string</Badge></TableCell>
                        <TableCell><Badge className="bg-destructive/10 text-destructive border-destructive/20">Required</Badge></TableCell>
                        <TableCell className="text-muted-foreground">LANA wallet address (starts with 'L', 26-35 chars)</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Responses */}
              <CodeBlock code={simpleCheckFound} sectionId="sc-found" label="Response — Wallet Found (200)" />
              <CodeBlock code={simpleCheckNotFound} sectionId="sc-notfound" label="Response — Wallet Not Found (200)" />

              {/* cURL */}
              <CodeBlock code={simpleCheckCurl} sectionId="sc-curl" label="cURL Example" />
            </CardContent>
          </Card>
        </div>

        {/* ========== KIND 30889 v1.1 Developer Notice ========== */}
        <Card className="mb-8 border-primary/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge className="bg-primary text-primary-foreground">v1.1</Badge>
              <CardTitle>KIND 30889 — Per-Wallet Freeze Support</CardTitle>
            </div>
            <CardDescription>
              Backward-compatible update to the Registrar Wallet List event format
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Summary</h4>
              <p className="text-muted-foreground">
                KIND 30889 has been extended with optional per-wallet freeze functionality. 
                The change is <strong>fully backward compatible</strong> — existing implementations continue to work without modification.
              </p>
            </div>

            {/* What Changed */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">What Changed</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  The <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">status</code> tag now accepts a new value: <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">frozen</code> (freezes all wallets for that customer)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  The <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">w</code> tag has an <strong>optional 7th field</strong>: <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">freeze_status</code>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  Old <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">w</code> tags with 6 fields remain valid and fully supported
                </li>
              </ul>
            </div>

            {/* Freeze Status Codes */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Freeze Status Codes</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Value</TableHead>
                      <TableHead>Meaning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono text-sm"><code>""</code> (empty string)</TableCell>
                      <TableCell className="text-muted-foreground">Normal, unfrozen</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono text-sm"><code>frozen_l8w</code></TableCell>
                      <TableCell className="text-muted-foreground">Frozen due to late wallet registration</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono text-sm"><code>frozen_max_cap</code></TableCell>
                      <TableCell className="text-muted-foreground">Frozen due to maximum balance cap exceeded</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono text-sm"><code>frozen_too_wild</code></TableCell>
                      <TableCell className="text-muted-foreground">Frozen due to irregular or suspicious activity</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-mono text-sm"><code>frozen_unreg_Lanas</code></TableCell>
                      <TableCell className="text-muted-foreground">Frozen due to receiving unregistered LANA exceeding threshold</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* W Tag Format */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Updated W Tag Format</h4>
              <CodeBlock 
                code={`// v1.0 (still valid):
["w", "wallet_id", "wallet_type", "LANA", "notes", "amount"]

// v1.1 (with freeze_status):
["w", "wallet_id", "wallet_type", "LANA", "notes", "amount", "freeze_status"]

// Examples:
["w", "Labc123...", "Main Wallet", "LANA", "My wallet", "0", ""]           // unfrozen
["w", "Lxyz789...", "Wallet",      "LANA", "",          "0", "frozen_l8w"]  // frozen
["w", "Ldef456...", "Wallet",      "LANA", "",          "0", "frozen_unreg_Lanas"]  // frozen - unreg lanas`}
                sectionId="kind30889-wtag-format"
              />
            </div>

            {/* Who Needs to Update */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Who Needs to Update</h4>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="font-medium text-foreground">Registrar Software</p>
                  <p className="text-sm text-muted-foreground">Must write the 7th field using only the defined freeze codes (<code className="px-1 py-0.5 rounded bg-muted">frozen_l8w</code>, <code className="px-1 py-0.5 rounded bg-muted">frozen_max_cap</code>, <code className="px-1 py-0.5 rounded bg-muted">frozen_too_wild</code>, <code className="px-1 py-0.5 rounded bg-muted">frozen_unreg_Lanas</code>), and/or set <code className="px-1 py-0.5 rounded bg-muted">status: frozen</code> when freezing at customer level.</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="font-medium text-foreground">User Wallets / Dashboards</p>
                  <p className="text-sm text-muted-foreground">Should read the 7th field and display the freeze reason. If not updated, wallets appear normal (no crash).</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="font-medium text-foreground">Monitoring Services</p>
                  <p className="text-sm text-muted-foreground">Should detect frozen wallets by freeze code and suppress or flag alerts accordingly.</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="font-medium text-foreground">Providers / Relays</p>
                  <p className="text-sm text-muted-foreground">No update required — pass-through behavior unchanged.</p>
                </div>
              </div>
            </div>

            {/* Migration Guide */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Migration Guide</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><span className="text-primary mt-1">•</span>No breaking changes, no re-indexing required</li>
                <li className="flex items-start gap-2"><span className="text-primary mt-1">•</span>Check if <code className="px-1 py-0.5 rounded bg-muted">w</code> tag array length ≥ 7, read index 6 as <code className="px-1 py-0.5 rounded bg-muted">freeze_status</code></li>
                <li className="flex items-start gap-2"><span className="text-primary mt-1">•</span>Treat missing or empty 7th field as normal (unfrozen) state</li>
                <li className="flex items-start gap-2"><span className="text-primary mt-1">•</span><strong>Any unrecognized <code className="px-1 py-0.5 rounded bg-muted">freeze_status</code> value must be treated as frozen (fail-safe default)</strong></li>
              </ul>
            </div>

            {/* Code Examples */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Code Examples</h4>
              <CodeBlock
                code={`// Reading freeze_status safely (backward compatible)
function getFreezeStatus(wTag) {
  // wTag = ["w", wallet_id, type, currency, notes, amount, freeze_status?]
  if (wTag.length < 7 || wTag[6] === "") {
    return { frozen: false, reason: null };
  }
  
  const KNOWN_CODES = ["frozen_l8w", "frozen_max_cap", "frozen_too_wild", "frozen_unreg_Lanas", "frozen_lanapays_outdated", "frozen_retail_unallowed", "frozen_retail_over_limit"];
  const code = wTag[6];
  
  // Fail-safe: unknown codes are still treated as frozen
  return {
    frozen: true,
    reason: KNOWN_CODES.includes(code) ? code : "unknown_freeze_code"
  };
}

// Writing a w tag with freeze_status
const frozenWallet = ["w", "Labc123...", "Main Wallet", "LANA", "notes", "0", "frozen_l8w"];
const normalWallet = ["w", "Lxyz789...", "Wallet", "LANA", "", "0", ""];

// Checking customer-level status tag
const statusTag = event.tags.find(t => t[0] === "status");
if (statusTag && statusTag[1] === "frozen") {
  // All wallets for this customer are frozen
}`}
                sectionId="kind30889-code-examples"
                label="JavaScript — Read & Write Examples"
              />
            </div>

            {/* Version Note */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm text-muted-foreground">
                <strong>Version:</strong> KIND 30889 v1.1 &nbsp;|&nbsp; 
                <strong>Effective:</strong> March 2026 &nbsp;|&nbsp; 
                <strong>Compatibility:</strong> Full backward compatibility with v1.0
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Error Codes */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Error Codes
            </CardTitle>
            <CardDescription>
              HTTP status codes returned by the API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell><Badge variant="outline">400</Badge></TableCell>
                    <TableCell className="font-medium">Bad Request</TableCell>
                    <TableCell className="text-muted-foreground">
                      <ul className="list-disc list-inside space-y-1">
                        <li>Invalid method</li>
                        <li>Invalid nostr_id_hex format (not 64-char hex)</li>
                        <li>Invalid wallet address format</li>
                        <li>Invalid wallet count (must be 1-8, for register_virgin_wallets)</li>
                        <li>Non-virgin wallet detected (balance {'>'} 0)</li>
                      </ul>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline">401</Badge></TableCell>
                    <TableCell className="font-medium">Unauthorized</TableCell>
                    <TableCell className="text-muted-foreground">Invalid, missing, or deactivated API key</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline">404</Badge></TableCell>
                    <TableCell className="font-medium">Not Found</TableCell>
                    <TableCell className="text-muted-foreground">Profile not found for the given nostr_id_hex (register_virgin_wallets only)</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline">409</Badge></TableCell>
                    <TableCell className="font-medium">Conflict</TableCell>
                    <TableCell className="text-muted-foreground">One or more wallets are already registered in the system</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline">429</Badge></TableCell>
                    <TableCell className="font-medium">Too Many Requests</TableCell>
                    <TableCell className="text-muted-foreground">Rate limit exceeded for the API key</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline">500</Badge></TableCell>
                    <TableCell className="font-medium">Server Error</TableCell>
                    <TableCell className="text-muted-foreground">
                      <ul className="list-disc list-inside space-y-1">
                        <li>System parameters not available</li>
                        <li>Failed to validate wallet balances (Electrum server issue)</li>
                        <li>Database error during registration</li>
                        <li>Unexpected internal error</li>
                      </ul>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="font-medium text-foreground mb-2">Wallet Address Format</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Must start with the letter 'L'</li>
                  <li>• 26-35 characters long</li>
                  <li>• Alphanumeric characters only</li>
                  <li>• Case sensitive</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Nostr ID Hex Format</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 64-character hexadecimal string</li>
                  <li>• Optional for check_wallet</li>
                  <li>• Required for register_virgin_wallets</li>
                  <li>• NOSTR broadcasting uses app keys</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">API Response Times</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• simple_check_wallet_registration: ~200-500ms</li>
                  <li>• check_wallet (existing): ~500ms-1s</li>
                  <li>• check_wallet (new registration): ~2-3s</li>
                  <li>• register_virgin_wallets: ~3-5s</li>
                  <li>• Timeout: 30 seconds maximum</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Rate Limiting</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Default: 100 requests per hour</li>
                  <li>• Per API key limit</li>
                  <li>• Returns 429 when exceeded</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-8 border-t border-border">
          <p className="text-muted-foreground">
            For more information, visit the official website at{" "}
            <a 
              href="https://lanawatch.us" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-primary hover:underline font-medium"
            >
              lanawatch.us
            </a>
          </p>
        </div>
            </div>
          </TabsContent>

          <TabsContent value="technical">
            <KeyDerivationDocs />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ApiDocs;
