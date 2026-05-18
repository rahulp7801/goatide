---
phase: 22-distribution
plan: 03
subsystem: infra
tags: [electron-builder, codesign, windows, azure-trusted-signing, signing, nsis]

# Dependency graph
requires:
  - phase: 22-01
    provides: electron-builder base config, update service stub, Wave-0 fences
  - phase: 22-02
    provides: electron-builder.yml mac: block + top-level hooks (Plan 22-02); win: block preserved
  - phase: 18
    provides: win: target nsis + artifactName baseline

provides:
  - electron-builder.yml win: block extended with azureSignOptions: (7 fields; 4 <TBD-...> sentinels + 3 defaulted)
  - .planning/phases/22-distribution/22-03-AZURE-SETUP.md (operator runbook: 8 steps + troubleshooting + status checklist)
  - scripts/package-goatide.sh sentinel-detector pre-build assertion (fires only when AZURE_* env vars set + placeholders remain)

affects: [22-04, 22-05, CI-Windows-runner-setup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "electron-builder azureSignOptions block with <TBD-...> sentinel placeholders -- grep-able for closure-time verification"
    - "Sentinel-detector pre-build assertion in package-goatide.sh -- fires only on intentional signed builds (AZURE_* env vars present)"
    - "Cert-absent dogfood builds skip Azure assertion and produce unsigned NSIS installer normally"

key-files:
  created:
    - .planning/phases/22-distribution/22-03-AZURE-SETUP.md
  modified:
    - electron-builder.yml
    - scripts/package-goatide.sh

key-decisions:
  - "<TBD-...> sentinel convention chosen over empty strings: impossible to mistake for a real value and grep-able for closure-time verification (Plan 22-03 must_haves truth #2)"
  - "Sentinel-detector assertion guarded by AZURE_* env var presence: cert-absent dogfood builds must not be disrupted by placeholder checks"
  - "No .github/workflows/*.yml CI modification in this plan: CI is dogfood-via-local-build; NuGet pre-step captured in runbook for operator's future Windows-runner workflow"
  - "C2 infrastructure landed cert-absent; Phase 22 C2 blocked on cert procurement; Plan 22-05 will revisit"

patterns-established:
  - "Pattern: YAML sentinel placeholders with env-var-gated detector script -- enables cert-absent local builds while preventing accidental unsigned CI artifacts"

requirements-completed: []
requirements-cert-gated: [C2]

# Metrics
duration: 20min
completed: 2026-05-18
---

# Phase 22 Plan 03: Windows Azure Trusted Signing SUMMARY

**Windows C2 signing infrastructure landed cert-gated: electron-builder azureSignOptions block + operator runbook + sentinel-detector script; all sentinel-guarded; live signed-build UAT deferred to CI when Azure Trusted Signing account + secrets land**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-18T11:05:00Z
- **Completed:** 2026-05-18T11:25:00Z
- **Tasks:** 3 of 4 auto-complete + Task 4 cert-gated closure (see Cert-Gated Status section)
- **Files modified:** 3 (electron-builder.yml + scripts/package-goatide.sh modified; 22-03-AZURE-SETUP.md created)

## Accomplishments

- Extended `electron-builder.yml` `win:` block with `azureSignOptions:` block (4 `<TBD-...>` sentinel fields + 3 defaulted fields: fileDigest/timestampDigest/timestampRfc3161); `mac:` block (Plan 22-02) and `win:` target/artifactName (Phase 18) preserved unchanged
- Created `22-03-AZURE-SETUP.md` operator runbook: 8 steps covering Azure Trusted Signing Account provisioning, Certificate Profile creation + identity validation, Service Principal creation, IAM role assignment, YAML placeholder replacement, CI secret configuration, NuGet provider pre-step (Pitfall 4), and first signed build verification; SmartScreen reputation caveat; troubleshooting table; status checklist for Plan 22-05 gate
- Added sentinel-detector pre-build assertion in `scripts/package-goatide.sh` that exits 1 with a clear error message if Azure env vars are set and `<TBD-AZURE-...>` placeholders remain; cert-absent dogfood builds unaffected

## Task Commits

1. **Task 1: Extend electron-builder.yml** - `8f095bd2991` (feat)
2. **Task 2: Author 22-03-AZURE-SETUP.md** - `67d9ef7ffc2` (feat)
3. **Task 3: Sentinel-detector in package-goatide.sh** - `f915f395c69` (feat)

**Task 4 (cert-gate):** CERT-GATED -- operator validates in CI. No Azure subscription provisioned at plan-execute time. Azure Trusted Signing Account + Certificate Profile not yet created; Service Principal not yet provisioned; CI secrets not yet configured. Live signed-build UAT deferred to CI when Azure secrets land. See "Cert-Gated Status" section for required CI env vars and operator steps.

## Files Created/Modified

- `electron-builder.yml` - `win:` block extended with `azureSignOptions:` 7-field block; `mac:` block unchanged
- `.planning/phases/22-distribution/22-03-AZURE-SETUP.md` - operator runbook (138 lines; 8 steps + troubleshooting + status checklist)
- `scripts/package-goatide.sh` - sentinel-detector pre-build assertion added (11 lines before Step 1)

## Decisions Made

- `<TBD-...>` sentinel convention: grep-able strings that cannot be mistaken for real values; detected at build time by the sentinel-detector script
- Sentinel-detector guarded by `AZURE_CLIENT_ID` or `AZURE_TENANT_ID` presence: unsigned dogfood builds must not be disrupted
- No `.github/workflows/*.yml` modifications in this plan: no CI workflow file exists in the repo (dogfood-via-local-build); NuGet pre-step (Pitfall 4) captured in runbook for future operator workflow authoring
- `Invoke-TrustedSigning` PowerShell module requires service principal credentials (NOT OIDC federated identity); documented in YAML comment

## Deviations from Plan

None - plan executed exactly as written.

## Cert-Gated Status

**Plan 22-03 closed cert-gated.** No Azure subscription provisioned at plan-execute time. Infrastructure is complete and repo-absorbed. Live signed-build UAT deferred to CI when Azure Trusted Signing account + secrets land.

**No live signed build was executed in this session.** The `azureSignOptions` block is present with sentinel placeholders, the operator runbook captures every provisioning step, and the sentinel-detector prevents accidental unsigned CI artifacts.

### What remains for CI (Azure Trusted Signing account required)

The following environment variables must be set on the GitHub Actions Windows runner before Plan 22-05 can close C2:

| Env Var | Purpose |
|---------|---------|
| `AZURE_TENANT_ID` | Azure AD / Entra ID tenant ID of the service principal (triggers signing in `Invoke-TrustedSigning`) |
| `AZURE_CLIENT_ID` | Application (client) ID of the `goatide-signing-sp` App Registration |
| `AZURE_CLIENT_SECRET` | Client secret from the `goatide-signing-sp` App Registration (OAuth client-credentials flow) |

Additionally, the following YAML placeholder values must be replaced per `22-03-AZURE-SETUP.md` Step 5:

| Placeholder | Description |
|------------|-------------|
| `<TBD-AZURE-CN>` | Validated CN from the Certificate Profile (identity validation result) |
| `<TBD-AZURE-REGION-ENDPOINT>` | Region-specific Trusted Signing endpoint URL |
| `<TBD-PROFILE-NAME>` | Certificate Profile name (created in Step 2 of runbook) |
| `<TBD-ACCOUNT-NAME>` | Trusted Signing Account name (created in Step 1 of runbook) |

### What was verified in-session

- `electron-builder.yml` YAML parses cleanly (`node -e "require('js-yaml').load(...)"` exits 0)
- `azureSignOptions.publisherName === '<TBD-AZURE-CN>'` confirmed by inline Node.js validation
- `mac:` block preserved: `hardenedRuntime: true`, `notarize: false`, entitlements paths intact
- `win:` Phase 18 keys preserved: `target: nsis`, `artifactName: "${productName}-Setup-${arch}.${ext}"`
- `22-03-AZURE-SETUP.md` verified to contain `Trusted Signing Certificate Profile Signer`, `AZURE_TENANT_ID`, `NuGet` sentinel strings (grep assertions pass)
- `scripts/package-goatide.sh` sentinel-detector block verified to contain `TBD-AZURE` grep target

### NOT verified in-session

- Windows cert-absent build (`npx electron-builder --win --config electron-builder.yml --x64 --publish never`) -- requires Windows host with Node.js + `better-sqlite3` ABI-140
- Live signed build (`signtool verify /pa /v GoatIDE-Setup-x64.exe`) -- requires Azure Trusted Signing account + provisioned secrets
- Inner exe signing scope (22-RESEARCH.md Open Question #1 MEDIUM confidence) -- requires first signed build
- SmartScreen fresh-machine dialog -- requires notarized + reputation-accumulated binary

### Resumption

Plan 22-05 (Phase 22 closure ceremony) gates C2 sign-off on cert-availability. When Azure Trusted Signing account + Service Principal + CI secrets are available, follow `22-03-AZURE-SETUP.md` Steps 5-8 to replace placeholders and verify the signed installer, then flip C2 from cert-gated to Closed in REQUIREMENTS.md and ROADMAP.md.

## Self-Check

**Self-Check: PASSED (with cert-gated scope)**

Files verified present:
- `electron-builder.yml` -- FOUND (contains `azureSignOptions`)
- `.planning/phases/22-distribution/22-03-AZURE-SETUP.md` -- FOUND

Commits verified:
- `8f095bd2991` Task 1 -- FOUND
- `67d9ef7ffc2` Task 2 -- FOUND
- `f915f395c69` Task 3 -- FOUND

**Claims NOT made:** Signed build was NOT verified. Windows cert-absent dry-run was NOT executed. These are deferred to CI (see Cert-Gated Status section).

## Issues Encountered

None - all 3 auto-executable tasks completed without deviation.

## Next Phase Readiness

- Infrastructure is ready for signed Windows builds the moment Azure Trusted Signing account + service principal + 3 secrets are available in CI
- Plan 22-04 (auto-updater) can proceed in parallel; it adds `electron-updater` to package.json (non-overlapping with this plan)
- Plan 22-05 (Phase 22 closure) gates on cert-availability outcome from Task 4 of this plan

---
*Phase: 22-distribution*
*Completed: 2026-05-18*
