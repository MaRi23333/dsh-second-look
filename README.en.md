# Second Look · 过目

<p align="center">
  <img src="./assets/readme/hero.png" width="100%" alt="Second Look · 过目 Brand Banner" />
</p>

<p align="center">
  <a href="README.en.md">English</a> · <a href="README.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/MaRi23333/dsh-second-look/actions/workflows/ci.yml"><img src="https://github.com/MaRi23333/dsh-second-look/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square" alt="License: Apache-2.0" /></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-%3E%3D0.2.1--rc.5%20%3C0.3.0--0-4d6bfe?style=flat-square" alt="DeepSeek Harness >=0.2.1-rc.5 <0.3.0-0" />
</p>

**An independent reviewer alongside your AI's tool use.**

Second Look is a tool-action review plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). In sessions with review enabled, routine low-risk actions pass by rule. Actions such as high-risk deletion, whole-file overwrites, and suspicious commands go to a reviewer model you choose. Tool actions that need your decision return to DSH's human approval interface.

Choose the review depth for each task, then look back at why an action was allowed, blocked, or referred to you.

> **Beta 0.1.3** · Requires DSH `>=0.2.1-rc.5 <0.3.0-0` and a reviewer model you trust.

## When is it useful?

- **When your AI edits files or runs commands:** add an independent check to automated work, with attention to high-risk deletion, overwrites, scripts, and outbound actions.
- **When a task needs closer inspection:** use Enhanced review to examine diffs and scripts, gathering additional read-only evidence when needed.
- **When you want to understand a block:** find the relevant history by tool, reason, or session and read why the decision was made.

## See the reason behind a decision

<p align="center">
  <img src="assets/readme/approval-history.png" width="900" alt="Second Look approval history in use: denied and blocked events with reason summaries, search and outcome filters, plus refresh, export logs, and clear controls" />
</p>
<p align="center"><em>The Denials and blocks view in use, showing outbound-request blocks and reason summaries. The header shows the plugin's base reviewer configuration at the time of capture.</em></p>

Search events, filter by outcome, refresh, export redacted JSON, or clear the current category. Recent activity keeps the latest 500 events for the current process. Denials and blocks separately retains the latest 100 event summaries across restarts; routine approvals do not use those slots.

## Choose the review depth for the task

Select a tier from the session's composer permission menu. Other sessions can use a different choice.

| Tier | Best suited to | How it reviews |
| --- | --- | --- |
| **Routine review** | Everyday development and tool use | Routine reads and ordinary new-file writes pass by rule. Whole-file overwrites of existing non-empty files are reviewed; risky actions go to the independent model, with up to 1 read-only evidence round. |
| **Enhanced review** | Tasks needing closer inspection of code changes, scripts, or outbound actions | Adds inspection of diffs and scripts, up to 3 read-only evidence rounds, and support for a pre-delivery file check. |

You choose the reviewer model, and Enhanced review can use a separate one. Subagents inherit review status along the session hierarchy. The interface and prompts follow the host's English or Simplified Chinese language setting.

## Try it

1. **Install the plugin:** in DSH Desktop, open **Plugins → Add plugin** and enter `dsh-second-look@0.1.3`. Select **Enable now** after installation. If prompted, quit and reopen DSH. Alternatively, download the `.tgz` from the [GitHub release](https://github.com/MaRi23333/dsh-second-look/releases/tag/v0.1.3) and enter its full path without extracting it.
2. **Choose a reviewer:** open **Settings → Second Look → Review settings** and select a provider and model. Tool arguments, relevant context, and parts of code diffs may be sent to that model for review. The plugin cannot redact all sensitive content.
3. **Select a tier:** choose **Routine review** or **Enhanced review** from the composer permission menu. Start with a non-destructive action and check its result in approval history.

## Know the boundaries

- **An extra check is not a safety guarantee.** Reviewer models can block benign actions or miss risks. Accuracy in real use still needs ongoing validation, and additional review adds latency and token costs.
- **This is not an OS sandbox.** It covers enabled sessions and governed tool paths, not every plugin, direct network request, or other session. Sensitive-content detection also has limits.
- **A block does not always open a confirmation prompt.** Tool actions can be referred to you, while model requests matching sensitive-content rules may continue with a redacted copy or be blocked outright. There is no dedicated outbound human-approval interface yet.
- **The pre-delivery check requires agent cooperation.** The Enhanced review summary tool must be called by the agent and cannot prevent a final text reply. A “done” message does not establish that every change was reviewed.

See the [usage and technical guide](https://github.com/MaRi23333/dsh-second-look/blob/main/docs/TECHNICAL.en.md) for configuration, retention, and the full security boundaries.

## Origins and license

Second Look is adapted from [dsh-auto-review](https://github.com/PerryLink/dsh-auto-review), with code from dsh-heavy-approval and DSH's permission selector. The project uses **Apache-2.0**; included third-party MIT notices and source details are in [LICENSE](LICENSE) and [THIRD-PARTY-SOURCES.md](THIRD-PARTY-SOURCES.md).
