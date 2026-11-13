# Second Look: Usage & Technical Guide

[Back to the overview](../README.en.md) · [简体中文](TECHNICAL.zh-CN.md)

DSH `>=0.2.1-rc.5 <0.3.0-0` · Node.js `^22.19.0 || >=24.0.0` · `dsh-second-look@0.1.3`

## How It Works

- **Two Per-Session Review Tiers**: Selected per conversation from the composer permission menu. Subagents use their parent session’s review settings. Switching tiers cancels pending reviews and invalidates cached approvals for the session and its descendants.
  - **Routine review** (preset ID `second-look-daily`): Allows routine reads, ordinary new-file writes, and ordinary writes to verified empty files by rule. Whole-file overwrites of existing non-empty files are reviewed; high-risk deletions, critical overwrites, suspicious shell commands, and apparent credential exfiltration are sent to the reviewer model, with up to 1 read-only evidence round.
  - **Enhanced review** (preset ID `second-look-strict`): Adds inspection of file diffs, scripts, outbound network actions, and persistence mechanisms, with up to 3 read-only evidence rounds plus file-batch code review before execution and before delivery.
- **User-Configured Independent Reviewer**: You explicitly configure the reviewer route (`reviewerModelProvider`, `reviewerModel`, and optional `reasoningEffort`), and the plugin does not fall back to the active working model. Enhanced review can use a separate route or inherit the base route when left empty. API credentials remain managed by the DSH host; local plugin settings do not store secret keys. Reviewer responses resolve to four structured verdicts: `allow`, `ask_user`, `deny`, or `need_evidence`.
- **Each approval is valid for one call**: Each approval token is bound to six fields—execution token, call ID, session ID, tool name, argument digest, and configuration version—and is consumed once at dispatch, blocking cross-call replay or post-approval argument changes.
- **Host Locale Synchronization**: Client settings, session permission menus, review prompts, block notices, and finalize reports follow the active DSH host language (English / Simplified Chinese).
- **Evidence Redaction & Outbound Checks**: Arguments, context, and diffs sent to the reviewer replace matched secret patterns with `[REDACTED]`. Outbound model requests in gated sessions are also checked against known credential patterns so unapproved raw matches stay unsent.

---

## Local Build & Trial Setup

Desktop users can [install the prebuilt plugin](../README.en.md#download-and-install). Follow the build steps below if you are modifying the source.

### 1. Install Dependencies & Build

From the plugin source directory, run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

You can also run `pnpm lint` during local development. The directory ships `cordis.patch.yml` (declaring plugin ID `dsh-second-look`) alongside brand assets (`assets/readme/hero.png` and `assets/brand/logo.png`).

### 2. Local Mounting & Reviewer Setup

1. **Mount the Plugin**: Install or link the plugin from its local directory using the DSH plugin manager.
2. **Choose a reviewer model**: Open **Settings → Second Look** in the DSH client. Under **Review settings**, pick or manually enter `reviewerModelProvider` and `reviewerModel`, along with optional reasoning effort and evidence/timeout budgets. Configure provider API credentials in the host's own model settings. Saved plugin settings are written atomically to `$DSH_HOME/second-look/settings.json`.
3. **Check that the plugin is enabled**: Choose **Routine review** or **Enhanced review** from the session permission menu in the composer bar, ask the AI to read a file, and check **Settings → Second Look → Approval history** to confirm a record appears. This step only verifies plugin wiring and audit recording; it does not measure reviewer decision accuracy.

---

## Audit History & `second_look_finalize`

### Audit Retention

**Settings → Second Look → Approval history** provides two views with search, outcome filtering, redacted JSON export, and per-scope clearing:

- **Recent activity**: Keeps up to **500** recent review events in memory for the current host process; cleared on restart.
- **Denials and blocks**: Persists up to **100** recent denied or blocked event summaries on disk (`$DSH_HOME/second-look/blocked-audit.json`) across restarts; routine approvals do not consume these slots.

### Pre-Delivery Check (`second_look_finalize`)

In **Enhanced review**, agents can call `second_look_finalize` before final delivery to re-hash modified files and produce a four-bucket summary:

- **Reviewed (`reviewed`)**: Files whose current content hash matches a valid batch review.
- **Pending (`pending`)**: Modified files without a valid batch review or modified again after review.
- **User-Allowed (`userAllowed`)**: Individual tool actions explicitly approved by the user through host prompts.
- **Coverage Gaps (`gaps`)**: Binary files, files exceeding count or size budgets, deleted files, or untracked non-Git changes.

Because the host has no end-of-turn hook capable of blocking final assistant text, `second_look_finalize` relies on the agent calling it voluntarily and cannot prevent final text output. Receiving a final assistant reply does not mean all file modifications passed review.

---

## What can slip through?

1. **No OS Sandbox**: The plugin operates at the DSH application and tool-dispatch layer, not as an operating-system or kernel sandbox. When disabled or unmounted, sessions use native host permissions. Reviews also evaluate a call-time snapshot, leaving a race window if external processes modify files before execution completes.
2. **Model Misjudgment & Pending Full Acceptance**: Review quality depends on the configured language model, which can produce both false positives (blocking benign actions) and false negatives (missing obfuscated or indirect risks). Automated tests verify state transitions, rules, and dispatch guards; end-to-end host upgrade testing and comprehensive accuracy validation with live models have not yet been completed.
3. **Incomplete I/O Coverage**: Only actions routed through governed DSH tool-dispatch seams in gated sessions are inspected. Direct unmanaged Node I/O, direct adapter network traffic, third-party plugin I/O, and peer sessions running under native non-gated presets are outside its scope.
4. **Voluntary `second_look_finalize` & Per-File Batch Reuse**: `second_look_finalize` cannot block final text emission, and batch review reuse validates content hashes per individual file (within file-count and byte budgets) without re-evaluating newly formed cross-file interactions among previously reviewed files.
5. **Limited Secret Detection & Missing Outbound Approval UI**: Sensitive-content scanning relies on finite pattern rules (such as private-key blocks, known token prefixes, JWTs, Bearer headers, and `KEY=VALUE` assignments). It does not catch arbitrary secret formats, natural-language confidential text, or encoded payloads, and attachment bodies are projected after the outbound hook without being scanned. Matches are not uniformly routed to a human prompt: while tool-level `ask_user` verdicts delegate to the host approval dialog, outbound model traffic currently lacks a dedicated human-approval UI—unapproved outbound matches block the raw payload and either continue with a re-scanned `[REDACTED]` copy or fail with an explicit block error, and review requests that still match secret patterns after redaction are blocked outright without recursive privacy review.
6. **Unauthenticated Loopback Settings API**: The local settings and audit HTTP endpoints (`/second-look/*`) bind to loopback and check `Host` / `Origin` headers against browser cross-origin access, but they do not require an access token and do not defend against other local processes on the same machine.
7. **Latency & Token Cost**: Calling an independent reviewer model and running automated evidence rounds add latency and token usage to governed turns.

---

## Provenance & License

Distributed under the **Apache-2.0** license; see [LICENSE](../LICENSE). This project incorporates and adapts code from the following sources:

- **Upstream Foundation**: Core review state machine, prompt structure, and audit foundations derived from [dsh-auto-review](https://github.com/PerryLink/dsh-auto-review) `0.15.0` (Tag `v0.15.0`, Apache-2.0).
- **Inspection Rules & Settings Patterns**: Sensitive-marker detection, shell-risk regular expressions, path inspection, and client settings patterns ported and adapted from `dsh-heavy-approval` (derived from `dsh-smart-approval`, Copyright (c) 2026 JimDeng891, MIT).
- **Permission Selector UI**: Session permission menu components adapted from DeepSeek Harness `packages/client/ui-permission-presets` (Copyright (c) 2026 DeepSeek, MIT).

For module-level modification notes and source attributions, see [THIRD-PARTY-SOURCES.md](../THIRD-PARTY-SOURCES.md) and [LICENSE](../LICENSE).

## Identity change in 0.1.0

Install as `dsh-second-look`. Settings and retained audit history live under `$DSH_HOME/second-look`; choose `second-look-daily` or `second-look-strict` per conversation. Old package IDs, settings, history and permission presets are not imported or aliased. Reconfigure the reviewer after installation. Existing non-empty whole-file writes are reviewed; ordinary new-file writes and small edits remain eligible for exemptions. Sensitive batch files are omitted with explicit coverage gaps.
