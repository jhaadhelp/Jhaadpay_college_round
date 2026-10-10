# Verification record

**Second Opinion by Jhaad Labs**

Verified on 10 October 2026 on Windows with Node.js 24.16.0 and Chromium through Playwright.

| Check | Local result |
|---|---|
| Unit and API tests | 30 passed. Covers persistence, access controls, input validation, retrieval, numerical checks, actual PDF extraction, cancellation, review notes, collections, and revision matching. |
| Production build | Passed. |
| Real-model development evaluation | 19 of 20 expected labels matched; full case results are committed. |
| Browser workflows | 2 passed. Includes real-model audit, notes, source search, collections, re-audit, comparison, JSON download, PDF generation, shortcuts, pasted sources, upload, and mobile width checks. |
| Dependency audit | Zero known npm vulnerabilities reported at verification time. This is not a comprehensive security audit. |
| Visual inspection | Desktop workspace, evidence review, mobile layout, and generated print report inspected. |
| Codespaces image | Node 24 image tag exists in Microsoft's registry; configuration included. An actual user Codespace has not been provisioned during local verification. |
| Docker | Packaging supplied; the container build and execution have not been verified. |

GitHub Actions repeats the build and checks on Linux. Its current run status is available through the README badge and Actions tab. Do not interpret this local record as proof that a remote CI run has completed.

The NLI model scores are not calibrated. The small authored evaluation set is not an independent benchmark. The disclosed causal-leap miss must not be omitted from performance claims.
