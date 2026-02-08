# OAuth Authorization Code Flow Implementation

## Why This Is Needed

**Current state:** Client credentials (client ID + secret) work for auth but search endpoints timeout/don't work.

**Root cause:** TIDAL's `/v2/searchresults/` endpoints require **user context**. Client credentials only access non-user resources (catalog metadata for known IDs).

**Solution:** Implement OAuth **Authorization Code Flow** so users can log in with their TIDAL account and grant the app permission to search + access their library.

---

## What Needs to Change

### 1. Update `tidalSdk.ts` - Add OAuth Flow

Replace the current `initTidalClient()` which only uses client credentials with one that supports user login.

**Key changes:**
- Add device code flow or redirect-based authorization
- Handle PKCE (Proof Key for Code Exchange) - required by TIDAL
- Store and manage refresh tokens
- Auto-refresh expired access tokens

**TIDAL requires:**
- Code verifier (random string)
- Code challenge (SHA256 hash of verifier)
- Redirect URI (must match what's configured in TIDAL dashboard)

### 2. Add CLI Command for Login

```bash
# New command needed:
curator auth login
```

This should:
1. Generate PKCE code verifier + challenge
2. Open browser to TIDAL login page (or show device code)
3. Wait for user to authorize
4. Exchange authorization code for access + refresh tokens
5. Save tokens to `~/.config/curator/auth-storage.json`

### 3. Update Credentials Storage

Current: `auth-storage.json` stores SDK's encrypted client credentials tokens
Needed: Also store user's refresh token + access token + expiry

**Storage format:**
```json
{
  "refreshToken": "...",
  "accessToken": "...",
  "expiresAt": 1738951234,
  "userId": "..."
}
```

### 4. Handle Token Refresh

When making API calls, check if access token is expired → auto-refresh using refresh token.

The SDK's `auth.credentialsProvider` should handle this automatically if configured correctly.

---

## Implementation Steps

### Step 1: Choose OAuth Flow

**Option A: Device Code Flow** (recommended for CLI)
- User runs `curator auth login`
- App displays: "Visit https://link.tidal.com/XXXXX and enter code: ABC-DEF"
- User logs in on their device
- App polls for authorization completion
- ✅ No web server needed, works on headless systems

**Option B: Redirect-based Flow**
- App starts local HTTP server on `localhost:8080`
- Opens browser to TIDAL login
- TIDAL redirects back to `localhost:8080?code=...`
- App exchanges code for tokens
- ❌ Requires browser on same machine

**Recommendation:** Start with redirect flow (simpler), add device code later.

### Step 2: Add `curator auth login` Command

Create `src/commands/auth.ts`:

```typescript
import { Command } from "commander";
import * as auth from "@tidal-music/auth";
import crypto from "crypto";
import http from "http";

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

async function loginWithBrowser() {
  const { verifier, challenge } = generatePKCE();
  const redirectUri = "http://localhost:8080/callback";
  const clientId = loadCredentials().clientId;
  
  const authUrl = `https://login.tidal.com/authorize?` +
    `response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=` + // leave empty or add specific scopes
    `&code_challenge_method=S256` +
    `&code_challenge=${challenge}`;
  
  console.log("Opening browser for TIDAL login...");
  console.log(`If it doesn't open, visit: ${authUrl}`);
  
  // Open browser
  const { default: open } = await import("open");
  await open(authUrl);
  
  // Start local server to receive callback
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:8080`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      
      if (error) {
        res.end("Error: " + error);
        server.close();
        reject(new Error(error));
        return;
      }
      
      if (code) {
        res.end("Authorization successful! You can close this window.");
        server.close();
        
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code, verifier, redirectUri);
        resolve(tokens);
      }
    });
    
    server.listen(8080, () => {
      console.log("Waiting for authorization...");
    });
  });
}

async function exchangeCodeForTokens(code: string, verifier: string, redirectUri: string) {
  const { clientId } = loadCredentials();
  
  const response = await fetch("https://auth.tidal.com/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${await response.text()}`);
  }
  
  return await response.json();
}

export function registerAuthCommand(program: Command): void {
  const authCmd = program
    .command("auth")
    .description("Manage TIDAL authentication");
  
  authCmd
    .command("login")
    .description("Log in with your TIDAL account")
    .action(async () => {
      try {
        const tokens = await loginWithBrowser();
        
        // Save tokens
        const tokenPath = expandHome("~/.config/curator/user-tokens.json");
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        
        console.log("✅ Successfully logged in!");
        console.log(`Access token expires in ${tokens.expires_in} seconds`);
      } catch (error) {
        console.error("Login failed:", error);
        process.exit(1);
      }
    });
  
  authCmd
    .command("status")
    .description("Check authentication status")
    .action(() => {
      // Check if user-tokens.json exists and is valid
      const tokenPath = expandHome("~/.config/curator/user-tokens.json");
      if (fs.existsSync(tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
        console.log("✅ Logged in");
        console.log(`Access token: ${tokens.access_token.substring(0, 20)}...`);
      } else {
        console.log("❌ Not logged in. Run: curator auth login");
      }
    });
}
```

### Step 3: Update `tidalSdk.ts` to Use User Tokens

```typescript
function loadUserTokens(): { accessToken: string; refreshToken: string } | null {
  const tokenPath = expandHome("~/.config/curator/user-tokens.json");
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  
  const tokens = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  };
}

export async function initTidalClient(): Promise<void> {
  if (apiClient) {
    return;
  }

  const { clientId, clientSecret } = loadCredentials();
  const userTokens = loadUserTokens();
  
  if (!userTokens) {
    throw new Error(
      "Not logged in. Run: curator auth login"
    );
  }

  // Initialize with user tokens instead of client credentials
  await auth.init({
    clientId,
    clientSecret,
    credentialsStorageKey: "curator-tidal-auth",
    scopes: [], // Add scopes if needed: ["r_usr", "w_usr"]
  });
  
  // Set the user's access token
  // Note: The SDK should handle token refresh automatically
  // Check SDK docs for exact method to provide existing tokens
  
  apiClient = createAPIClient(auth.credentialsProvider);
}
```

### Step 4: Register Command in CLI

Update `src/cli.ts`:

```typescript
import { registerAuthCommand } from "./commands/auth";

// After other registerXCommand calls:
registerAuthCommand(program);
```

### Step 5: Add Dependencies

```bash
npm install --save open  # For opening browser
```

### Step 6: Update TIDAL Dashboard

1. Go to https://developer.tidal.com/dashboard
2. Edit your app
3. Add redirect URI: `http://localhost:8080/callback`
4. Save changes

---

## Testing

```bash
# 1. Build
npm run build

# 2. Login
node dist/cli.js auth login
# Browser opens → log in with TIDAL account → authorize app

# 3. Check status
node dist/cli.js auth status

# 4. Test search (should work now!)
node dist/cli.js discover --artists "Justice" --limit-per-artist 3 --format json
```

---

## References

- TIDAL Authorization Docs: https://developer.tidal.com/documentation/api-sdk/api-sdk-authorization
- SDK Web Examples: https://github.com/tidal-music/tidal-sdk-web/blob/main/packages/auth/examples/authorization-code.html
- PKCE Spec: https://datatracker.ietf.org/doc/html/rfc7636

---

## Next Steps After OAuth Works

1. **Remove debug logging** from `tidalSdk.ts` and `discover.ts`
2. **Migrate playlist search** to SDK (phase 2)
3. **Add token refresh** logic if SDK doesn't auto-refresh
4. **Handle expired refresh tokens** (re-login required)
5. Consider **device code flow** for headless/SSH use cases

---

## Expected Outcome

After implementing this:
- ✅ `curator auth login` → opens browser, user logs in
- ✅ Tokens saved to `~/.config/curator/user-tokens.json`
- ✅ `curator discover --artists "Justice"` → search works!
- ✅ User's favorites/playlists accessible (if scopes added)
- ✅ Refresh tokens keep user logged in (no re-login for months)
