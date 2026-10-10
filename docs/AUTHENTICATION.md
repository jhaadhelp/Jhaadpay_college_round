# Accounts and Google sign-in

Second Opinion by Jhaad Labs now requires an individual account. Email/password signup and login work without an external service. Google sign-in becomes available when the operator configures Google Cloud credentials.

## Local email accounts

Start the app and choose **Create account**. Enter a name, email address, and a password of 15–128 characters. Emails are trimmed and lowercased for uniqueness. Each account receives a random, permanent UUID. Names are display labels and do not have to be unique.

Every account gets its own audits, source snapshots, history, collections, reviewer notes, and revision chains. Ownership comes from the server session, never a submitted user ID. Direct links and API requests to someone else's resources return 404. Extracted uploads are returned to the signed-in browser and become persistent when saved in that user's audit or collection.

Sign out is available in the header on desktop and mobile. Sign-out revokes the current session and reloads the page to clear the previous account's in-memory work. Sessions last 12 hours and survive a server restart; reopening the app during that period retains the account.

## Configure Google OAuth

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select the project you control.
2. Configure Google Auth Platform branding and audience for **Second Opinion by Jhaad Labs**. Supply the requested support/contact details. While the Google app is in testing, add the Google accounts that should test it.
3. Create an OAuth client with application type **Web application**.
4. Add an exact authorized redirect URI:
   - Local: `http://127.0.0.1:3001/api/auth/google/callback`
   - Production: `https://YOUR-DOMAIN/api/auth/google/callback`
5. Set these server environment variables (real secrets belong in the host's secret manager or local ignored `.env`, never GitHub source):

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
PUBLIC_ORIGIN=http://127.0.0.1:3001
```

6. Restart the app. **Continue with Google** becomes enabled. Test a full sign-in with an allowed test account, sign out, and return with the same account; the user ID and saved work should remain the same.
7. For a public release, configure the production HTTPS callback and Google audience/publishing settings. Complete any verification Google requests. This implementation requests only `openid`, `email`, and `profile`—no Gmail, Drive, or offline access.

The redirect is constructed from `PUBLIC_ORIGIN`; there is no browser-controlled redirect destination. Use that exact origin to open the app, with no trailing slash in the variable. The Vite development preview can still use email accounts; test Google's redirect flow on the built application at port 3001.

Official reference: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect). The bundled Google G icon comes from [Google's branding assets](https://developers.google.com/identity/branding-guidelines), not a custom replacement.

## Production environment

```dotenv
HOST=0.0.0.0
PUBLIC_ORIGIN=https://YOUR-DOMAIN
SECURE_COOKIE=1
DATA_DIR=/var/data/audits
MODEL_CACHE_DIR=/var/data/models
```

Use one app instance and persistent storage for the database and model cache. Public binding refuses to start without an exact HTTPS origin and secure cookies. Configure `TRUST_PROXY` only with the known reverse proxy IPs/CIDRs supplied by your host; otherwise sign-in limits see the proxy as one client. Keep direct access to the backend restricted to the host's proxy. Never blindly trust arbitrary forwarded headers. TLS is terminated by the hosting platform/reverse proxy.

The public health route exposes only `{ok:true}` to signed-out visitors. Model state and input limits require a session. The old `APP_PASSWORD` setting has no effect and is not an alternative account login.

## Identity and session handling

- Passwords use Node's asynchronous scrypt with an independent random salt, N=131072, r=8, p=1, and a 64-byte derived key. Passwords are never stored or returned as plaintext. At most two password derivations run at once per process.
- Session cookies contain a random 256-bit token, with HttpOnly and SameSite=Lax; HTTPS deployments also set Secure. Only token hashes are stored in SQLite. Login rotates the presented session; logout removes it. Expired sessions are refused.
- Sign-in limits apply per IP and normalized email within a 15-minute window. They are process-local and reset on server restart; use host-level abuse controls for a larger public launch.
- Google uses authorization code flow with PKCE, a short-lived single-use state bound to an HttpOnly browser cookie, and a nonce. Google's official library verifies the ID token signature, issuer, audience and expiry. The app additionally checks the nonce and verified email. Google subject (`sub`), not email, identifies returning Google accounts. Access and refresh tokens are not saved.
- A Google login never silently takes over a password account with the same email. It asks the person to use the original method. Account linking is not implemented.
- Email ownership verification and self-service password reset are not implemented. Local passwords prove knowledge of the password, not ownership of the mailbox. No verification or recovery emails are sent. Do not advertise those capabilities.
- Workspace privacy is between application users. The server operator and anyone with database/backups access can read stored source text. This is not end-to-end encryption.

## Preserve the former shared workspace

The database migration adds nullable ownership fields without deleting audits, collections, or reviews. Old shared records are not automatically assigned to the first signup and are hidden from all accounts until explicitly assigned.

To move them to the intended owner's account:

1. Create that account and confirm its email and identity.
2. Stop the app and back up the complete data directory, including any SQLite WAL files.
3. Run locally as the server operator:

```sh
npm run accounts:assign-legacy -- owner@example.com --confirm
```

4. Restart the app and sign in as that owner. The command only assigns previously unowned audits and collections. Existing owned data is unchanged, reviews stay linked, and repeated runs assign nothing further.

This operation is deliberately unavailable over HTTP. The existing workspace in the development environment has been preserved without choosing an owner on the user's behalf.

## Verification boundaries

Automated tests cover account creation/login/logout, hashed storage, restart persistence, expiry, cookie flags, cross-site requests, guessing limits, every cross-account resource route, revision parents, and old-database migration. OAuth callback tests use a simulated Google exchange to exercise state, browser binding, nonce, PKCE, verification failure, duplicate emails, and stable subject identity. Actual Google Cloud credentials are still required to verify a live Google sign-in. Browser tests exercise email signup, two-account isolation, returning login, mobile layout, and the existing real-model audit workflow.
