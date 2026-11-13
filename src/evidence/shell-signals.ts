/**
 * Modified for dsh-second-look, 2026-10-31 (T02).
 *
 * Deterministic shell-command risk signals, ported from the local fork
 * `dsh-heavy-approval/src/review-policy.ts` (workspace-local source, reused
 * with attribution; see THIRD-PARTY-SOURCES.md).
 *
 * A hit raises a {@link RiskSignal} that routes the command to review; a miss
 * grants nothing (a novel dangerous command still reaches the reviewer via
 * the `execute` effect).
 */
import type { RiskSignal } from '../action/types.ts'

export const DESTRUCTIVE_SHELL = /(?:^|[;&|]\s*|\s)(?:(?:[A-Za-z]:)?(?:[/\\][^\s;&|/\\]+)+[/\\])?(?:rm(?:\s|$)|rmdir(?:\s|$)|shred(?:\s|$)|mkfs(?:\.|\s)|Remove-Item(?:\s|$)|Clear-Content(?:\s|$)|Format-Volume(?:\s|$)|git(?:\s+(?:-C|--git-dir|--work-tree)(?:=|\s+)\S+)*\s+(?:reset(?:\s|$)|clean(?:\s|$)|restore(?:\s|$)|checkout\s+--|branch\s+-[dD](?:\s|$)|stash\s+(?:drop|clear)(?:\s|$))|truncate(?:\s|$))/i
export const FIND_DELETE_SHELL = /(?:^|[;&|]\s*|\s)(?:(?:[A-Za-z]:)?(?:[/\\][^\s;&|/\\]+)+[/\\])?find(?:\s|$)[^\n;&|]*\s-delete(?:\s|$)/i
export const SYSTEM_SHELL = /(?:^|[;&|]\s*|\s)(?:(?:[A-Za-z]:)?(?:[/\\][^\s;&|/\\]+)+[/\\])?(?:sudo(?:\s|$)|doas(?:\s|$)|launchctl(?:\s|$)|systemctl(?:\s|$)|crontab(?:\s|$)|dscl(?:\s|$)|chmod(?:\s|$)|chown(?:\s|$)|chgrp(?:\s|$)|kill(?:\s|$)|pkill(?:\s|$)|killall(?:\s|$)|mount(?:\s|$)|umount(?:\s|$)|shutdown(?:\s|$)|reboot(?:\s|$)|halt(?:\s|$)|diskutil(?:\s|$)|defaults\s+write(?:\s|$)|reg\s+(?:add|delete)(?:\s|$))/i
export const HOST_CONTAINER_SHELL = /(?:^|[;&|]\s*|\s)(?:(?:[A-Za-z]:)?(?:[/\\][^\s;&|/\\]+)+[/\\])?(?:docker|podman)\s+run\b[^\n]*(?:--privileged(?:=true)?\b|--pid(?:=|\s+)host\b|--network(?:=|\s+)host\b|--device(?:=|\s+)|(?:-v|--volume)(?:=|\s+)\/:|docker\.sock)/i
export const INSTALL_SHELL = /(?:\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|ci|i)\b|\b(?:npx|bunx)\b|\b(?:pnpm|yarn)\s+dlx\b|\bpipx\s+(?:install|run)\b|\bpip3?\s+install\b|\buv\s+(?:add|sync|tool\s+install|pip\s+install)\b|\b(?:brew|apt-get|apt|dnf|yum)\s+install\b|\bcargo\s+install\b|\bgo\s+install\b)/i
export const NETWORK_TRANSFER_SHELL = /(?:\bcurl\b[^\n]*(?:--data(?:-binary)?|-d\b|--form|-F\b|--upload-file|-T\b|--request\s+(?:POST|PUT|PATCH|DELETE)|-X\s*(?:POST|PUT|PATCH|DELETE)|\|\s*(?:sh|bash|zsh|ksh)\b)|\bwget\b[^\n]*(?:--post-data|--post-file|\|\s*(?:sh|bash|zsh|ksh)\b)|(?:^|[;&|]\s*|\s)(?:(?:[A-Za-z]:)?(?:[/\\][^\s;&|/\\]+)+[/\\])?(?:ssh|scp|sftp)(?:\s|$)|\brsync\b[^\n]*\w+@)/i
export const REMOTE_WRITE_SHELL = /(?:\bgit\s+push\b|\b(?:npm|pnpm)\s+publish\b|\bgh\s+(?:pr\s+(?:create|merge|close|reopen|review)|issue\s+(?:create|close|reopen|edit|delete)|release\s+(?:create|delete|edit|upload)|workflow\s+run|repo\s+(?:create|delete|archive|edit|fork|rename)|api\b[^\n]*(?:--method|-X)\s*(?:POST|PUT|PATCH|DELETE))\b)/i
export const OPAQUE_SHELL = /(?:\bpython(?:3(?:\.\d+)?)?\b[^\n;&|]*\s-c(?:\s|$)|\bnode\b[^\n;&|]*\s-e(?:\s|$)|\b(?:ruby|perl)\b[^\n;&|]*\s-e(?:\s|$)|(?:^|[;&|]\s*|\s)(?:sh|bash|zsh|ksh)\s+-c(?:\s|$)|(?:^|[;&|]\s*|\s)eval(?:\s|$))/i
export const WINDOWS_DESTRUCTIVE_SHELL = /(?:^|[;&|]\s*|\s)(?:del|erase|rd)(?:\s|\/|$)|(?:^|[;&|]\s*|\s)ri(?:\s|$)/i
export const WINDOWS_SYSTEM_SHELL = /\b(?:Stop-Computer|Restart-Computer|Set-ExecutionPolicy|Stop-Service|taskkill|schtasks|bcdedit)\b|\bnet(?:\.exe)?\s+user\b/i
export const WINDOWS_INSTALL_SHELL = /\b(?:winget|choco|scoop|msiexec)(?:\.exe)?\b|\bInstall-Module\b|\bInstall-Package\b/i
export const WINDOWS_NETWORK_SHELL = /\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b|\b(?:curl|wget)(?:\.exe)?\b[^\n]*(?:-o\b|--output\b|-O\b|\|\s*(?:iex|Invoke-Expression|sh|bash|zsh|ksh)\b)/i
export const WINDOWS_OPAQUE_SHELL = /\b(?:iex|Invoke-Expression)\b|\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]*-EncodedCommand\b|\bcmd(?:\.exe)?\s+\/c\b/i

/**
 * Map a shell command onto deterministic risk signals.
 * @param command - the command text as submitted.
 * @returns the signals the patterns raise (possibly empty — never a grant).
 */
export function shellRiskSignals(command: string): RiskSignal[] {
  const signals: RiskSignal[] = []
  const push = (signal: RiskSignal): void => {
    if (!signals.includes(signal)) signals.push(signal)
  }
  if (DESTRUCTIVE_SHELL.test(command) || FIND_DELETE_SHELL.test(command) || WINDOWS_DESTRUCTIVE_SHELL.test(command)) {
    push('destructive-command')
  }
  if (SYSTEM_SHELL.test(command) || HOST_CONTAINER_SHELL.test(command) || WINDOWS_SYSTEM_SHELL.test(command)) {
    push('system-change')
  }
  if (INSTALL_SHELL.test(command) || WINDOWS_INSTALL_SHELL.test(command)) {
    push('network-or-install')
  }
  if (NETWORK_TRANSFER_SHELL.test(command) || REMOTE_WRITE_SHELL.test(command) || WINDOWS_NETWORK_SHELL.test(command)) {
    push('network-or-install')
  }
  if (OPAQUE_SHELL.test(command) || WINDOWS_OPAQUE_SHELL.test(command)) {
    push('opaque-execution')
  }
  return signals
}
