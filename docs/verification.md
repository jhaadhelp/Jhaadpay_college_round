# Verification record

**Second Opinion by Jhaad Labs**

Verified on 10 October 2026 on Windows with Node.js 24.16.0 and Chromium through Playwright.

| Check | Local result |
|---|---|
| Unit and API tests | 35 passed. Covers persistence, access controls, input validation, retrieval, numerical checks, actual PDF extraction, cancellation, review notes, collections, and revision matching. |
| Production build | Passed. |
| Offline cold start | Passed after the model-loading fix: a fresh process loads the pinned downloaded snapshot and performs real inference with fetch blocked; zero network attempts. This also runs in GitHub Actions after model evaluation. |
| Real-model development evaluation | 19 of 20 expected labels matched; full case results are committed. |
| Browser workflows | 3 passed. Includes real-model audit, notes, source search, collections, re-audit, comparison, JSON download, PDF generation, shortcuts, pasted sources, upload, and mobile width checks. |
| Dependency audit | Zero known npm vulnerabilities reported at verification time. This is not a comprehensive security audit. |
| Visual inspection | Desktop workspace, evidence review, mobile layout, and generated print report inspected. |
| Codespaces image | Node 24 image tag exists in Microsoft's registry; configuration included. An actual user Codespace has not been provisioned during local verification. |
| Docker | Packaging supplied; the container build and execution have not been verified. |

GitHub Actions repeats the build and checks on Linux. Its current run status is available through the README badge and Actions tab. Do not interpret this local record as proof that a remote CI run has completed.

The NLI model scores are not calibrated. The small authored evaluation set is not an independent benchmark. The disclosed causal-leap miss must not be omitted from performance claims.

The October 10 model-loading regression was traced to Transformers 4's tokenizer metadata check using remote `main` even when a pinned revision was supplied. Cached starts now pass the pinned snapshot directory to both loaders with remote loading disabled. The existing unit/API and browser workflows were rerun successfully after this fix. First-time model setup still requires internet access.

The refreshed work interface includes a staged audit form, coverage links, wording review, and evidence prompts. Browser verification covers stage prerequisites, preserving edits between stages, reduced motion, and mobile overflow. No game, XP, or challenge features are included.

## Individual accounts — 11 October 2026

40 unit/API tests and 5 browser workflows passed locally. The added checks cover permanent user IDs, per-user data isolation, salted password hashes, restart-persistent sessions, rotation, expiry, logout, cookie flags, cross-site writes, rate limits, Google state/nonce/PKCE checks with a simulated exchange, safe email collisions, and explicit legacy-data migration. Browser flows include signup, two-account isolation, returning email login, OAuth failure messages, mobile sign-out, and the full real-model audit workflow. The production build passed.

Live Google OAuth has not been tested because this environment does not have the owner’s Google Cloud client credentials. The button stays disabled until configured. Password recovery, email verification and account linking are not implemented. Google G artwork uses Google’s official branding asset.
