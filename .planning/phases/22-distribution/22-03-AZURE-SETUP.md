# Phase 22 C2 -- Azure Trusted Signing Operator Setup

> Plan 22-03 lands the `azureSignOptions` YAML block with `<TBD-...>` sentinel placeholders.
> This runbook captures every operator step required before the first signed Windows build is possible.
> Reference: `.planning/phases/22-distribution/22-RESEARCH.md` Pattern 3.

## Prerequisites

- Azure subscription with billing enabled.
- Permission to create resources in the subscription (Owner or Contributor on the resource group).
- A GitHub Actions Windows runner (or a Windows machine with PowerShell 7+) for the signing step.

## Step 1: Provision the Trusted Signing Account

1. Sign in to the Azure portal (https://portal.azure.com).
2. Search for `Trusted Signing Accounts` and click `Create`.
3. Select your subscription + a resource group (create a new one if needed: `rg-goatide-signing`).
4. Account name: pick something memorable, e.g. `goatide-trusted-signing`. RECORD this -- it is the `codeSigningAccountName` YAML value.
5. Region: choose nearest your CI runners (e.g. `North Europe` for EU runners). The region determines the `endpoint` URL: `https://<region-slug>.codesigning.azure.net/`. For North Europe: `https://neu.codesigning.azure.net/`.
6. Pricing tier: pick per current Azure offering (Basic is sufficient for low-volume signing).
7. Click `Review + create` -> `Create`.

## Step 2: Create the Certificate Profile

1. In the Trusted Signing Account resource, navigate to `Certificate Profiles`.
2. Click `Create profile`.
3. Profile type: `Public Trust` (this is the cloud-hosted equivalent of an OV cert; the rebranded EV cert path is unavailable for GitHub Actions runners).
4. Profile name: e.g. `goatide-publisher`. RECORD this -- it is the `certificateProfileName` YAML value.
5. Identity Validation: complete the publisher identity validation form (legal entity name, address, etc.). Azure will validate; this can take 1-3 business days. The validated CN becomes the `publisherName` YAML value (e.g. `GoatIDE` or your legal entity name).
6. Once validated, click `Create`.

## Step 3: Create the Service Principal

1. Sign in to the Azure portal as a directory admin (or ask one to do this).
2. Search `App registrations` -> `New registration`.
3. Name: `goatide-signing-sp`. Supported account types: `Accounts in this organizational directory only`.
4. After creation, RECORD:
   - `Application (client) ID` -> set as CI secret `AZURE_CLIENT_ID`
   - `Directory (tenant) ID` -> set as CI secret `AZURE_TENANT_ID`
5. In the App Registration, navigate to `Certificates & secrets` -> `Client secrets` -> `New client secret`. Description `goatide-signing`. Expiry: 6 months (or per your security policy).
6. RECORD the secret VALUE (visible only once) -> set as CI secret `AZURE_CLIENT_SECRET`.

## Step 4: Assign the IAM Role

1. Navigate back to the `Certificate Profile` resource (from Step 2).
2. Click `Access control (IAM)` -> `Add` -> `Add role assignment`.
3. Role: select `Trusted Signing Certificate Profile Signer` (in 2025+ Azure environments this role may have been renamed to `Artifact Signing Certificate Profile Signer` -- either name refers to the same role).
4. Assign access to: `User, group, or service principal`.
5. Members: search for the App Registration name from Step 3 (`goatide-signing-sp`) and select it.
6. Click `Review + assign`.

## Step 5: Replace YAML Placeholders

Edit `electron-builder.yml` and replace ALL `<TBD-...>` sentinels with the values from Steps 1-2:

| Sentinel | Source |
|----------|--------|
| `<TBD-AZURE-CN>` | Validated CN from Step 2.5 (e.g. `GoatIDE`) |
| `<TBD-AZURE-REGION-ENDPOINT>` | Region-specific endpoint URL from Step 1.5 |
| `<TBD-PROFILE-NAME>` | Certificate Profile name from Step 2.4 |
| `<TBD-ACCOUNT-NAME>` | Trusted Signing Account name from Step 1.4 |

Commit the YAML changes as a SEPARATE commit from Plan 22-03's infrastructure commit:

```
chore(22-03): inject Azure Trusted Signing config values (post-procurement)
```

## Step 6: Configure CI Secrets

In the GitHub repo (or your CI provider), add 3 secrets:
- `AZURE_TENANT_ID` (from Step 3.4)
- `AZURE_CLIENT_ID` (from Step 3.4)
- `AZURE_CLIENT_SECRET` (from Step 3.6)

## Step 7: Add the NuGet Provider Pre-Step (Pitfall 4)

GitHub Actions Windows runners do NOT pre-install the NuGet provider required by the `Invoke-TrustedSigning` PowerShell module. Add a pre-step to the Windows signing workflow:

```yaml
- name: Install TrustedSigning NuGet provider
  shell: pwsh
  run: Install-PackageProvider -Name NuGet -Force -Scope CurrentUser
```

Place this step BEFORE the `npx electron-builder --win` step.

## Step 8: First Signed Build + Verification

1. Trigger the Windows signing workflow (or run locally with the env vars set):
   ```powershell
   $env:AZURE_TENANT_ID = "<tenant-id>"
   $env:AZURE_CLIENT_ID = "<client-id>"
   $env:AZURE_CLIENT_SECRET = "<client-secret>"
   npx electron-builder --win --config electron-builder.yml --x64
   ```

2. Verify the OUTER NSIS installer is signed:
   ```powershell
   signtool verify /pa /v dist\GoatIDE-Setup-x64.exe
   ```
   Expected last line: `Number of files successfully Verified: 1`. Exit 0.

3. Verify the INNER app .exe is signed (22-RESEARCH.md Open Question #1 -- MEDIUM confidence; some electron-builder versions sign only the outer wrapper):
   ```powershell
   signtool verify /pa /v dist\win-unpacked\GoatIDE.exe
   ```
   If unsigned, route to electron-builder issue #8276 for guidance and add a note here.

4. Manual UAT (Plan 22-05 closure-gate item): on a fresh Windows machine that has never seen GoatIDE, run the installer. SmartScreen dialog (if shown) should report the publisher name (e.g. `GoatIDE`) rather than `Unknown Publisher`.

## SmartScreen Reputation Caveat

Azure Trusted Signing does NOT provide instant SmartScreen bypass -- Microsoft removed the EV-cert bypass in March 2024. New publisher certificates will still show SmartScreen `Unknown Publisher` until the binary accumulates download reputation over time + user installs. This is documented behavior, not a misconfiguration.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Unable to find package provider 'NuGet'` | Add the Step 7 pre-step |
| `PublisherName must be a valid certificate CN` | Replace `<TBD-AZURE-CN>` with the validated CN from Step 2.5 |
| `Invoke-TrustedSigning : Forbidden` | IAM role missing on the Service Principal -- repeat Step 4 |
| `Invoke-TrustedSigning : Unauthorized` | Client secret expired -- repeat Step 3.5 |
| First-signed-build SmartScreen still says `Unknown Publisher` | Expected post-March 2024; reputation accumulates over time |

## Status

- [ ] Step 1 Trusted Signing Account provisioned (record account name)
- [ ] Step 2 Certificate Profile created + identity validated (record CN + profile name)
- [ ] Step 3 Service Principal created (record tenant/client IDs + secret)
- [ ] Step 4 IAM role assigned
- [ ] Step 5 YAML placeholders replaced + committed
- [ ] Step 6 CI secrets configured
- [ ] Step 7 NuGet provider pre-step added to Windows workflow
- [ ] Step 8 First signed build verified (`signtool verify /pa` exit 0 on outer + inner exe)
- [ ] Final UAT: fresh Windows machine SmartScreen dialog shows publisher name

When all checkboxes are checked, the C2 requirement is GREEN and Plan 22-05 can flip the REQUIREMENTS.md C2 marker.
