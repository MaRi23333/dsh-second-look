import type { UiLanguage } from '../messages.ts'

/** Translate only collector-owned gap descriptions. Paths and external Git
 * errors remain verbatim; audit history and model prose are never rewritten. */
export function localizeGap(gap: string, language: UiLanguage): string {
  if (language !== 'zh') return gap
  const exact: Record<string, string> = {
    'non-git project: the batch covers observed write/edit targets only — manual edits outside the gate are a named gap': '非 Git 项目：仅覆盖已观察到的写入／编辑；审核范围外的手工修改尚未检查',
    'some current changes have no still-valid batch review': '部分当前变更尚无有效的批次审核',
  }
  if (exact[gap]) return exact[gap]
  const suffixes: Record<string, string> = {
    'binary/undecodable content is not compared by this batch': '二进制或无法解码的内容，本批次未比较',
    'binary/undecodable — not comparable': '二进制或无法解码的内容，无法比较',
    'deleted — not comparable': '文件已删除，无法比较',
    'over budget — not compared': '超出检查范围，未比较',
    'over the per-file budget and not reviewed by this batch': '超出单文件检查范围，本批次未审核',
    'observed change beyond file budget': '已观察到变更，但超出文件数量上限',
    'sensitive-path content omitted; NOT reviewed': '敏感路径正文已省略，尚未审核',
    'content omitted from aggregate evidence budget; NOT reviewed': '内容超出总证据上限而省略，尚未审核',
  }
  for (const [en, zh] of Object.entries(suffixes)) if (gap.endsWith(`: ${en}`)) return gap.slice(0, -en.length) + zh
  return gap
    .replace(/Git configuration safety preflight failed/g, 'Git 安全配置预检失败')
    .replace(/(\d+) sensitive-path diffs omitted; NOT reviewed/g, '已省略 $1 个敏感路径的差异，尚未审核')
    .replace(/diff file budget exceeded; (\d+) further files NOT reviewed/g, '差异文件数量超限，另有 $1 个文件尚未审核')
    .replace(/^(\d+) further changed files beyond the (\d+)-file budget are NOT covered by this batch$/, '另有 $1 个变更文件超出 $2 个文件的上限，本批次未覆盖')
    .replace(/^(\d+) further observed changes beyond the budget are NOT covered$/, '另有 $1 个已观察到的变更超出检查范围，尚未覆盖')
    .replace(/^git status unavailable \((.*)\) — the batch covers NOTHING and must not claim completeness$/, 'Git 状态读取失败（$1），本批次未覆盖任何变更，不应宣称检查完整')
}
