import { execFile } from 'node:child_process'
import { resolveGitExecutable } from './git-executable.ts'

// Git for Windows understands its POSIX null device, but rejects Node's
// Windows device path (\\.\nul) as a configuration filename.
const gitNull = '/dev/null'

interface GitResult { code: number; stdout: string; stderr: string }

/** Every internal Git process uses these overrides, including configuration discovery. */
const SAFE_CONFIG = [
  'core.fsmonitor=false',
  `core.hooksPath=${gitNull}`,
  `core.attributesFile=${gitNull}`,
  'core.pager=',
  'pager.status=false',
  'pager.diff=false',
  'diff.external=',
  'diff.trustExitCode=false',
  'diff.ignoreSubmodules=all',
  'status.submoduleSummary=false',
  'submodule.recurse=false',
  'maintenance.auto=false',
  'gc.auto=0',
]

function isolatedEnvironment(): NodeJS.ProcessEnv {
  // Inherited Git variables can redirect repositories, inject configuration,
  // install an external diff command, or activate tracing. None are needed by
  // this local evidence reader; preserve the host's ordinary executable PATH.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)))
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: gitNull,
    GIT_CONFIG_GLOBAL: gitNull,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: '',
  }
}

function invoke(executable: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<GitResult> {
  return new Promise(resolve => {
    execFile(executable, ['--no-pager', ...args], { cwd, env, windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1
      resolve({ code, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/**
 * Read configuration without executing a repository command, then override
 * every configured filter driver. The config output remains local and is
 * never returned as evidence. A preflight failure makes evidence unavailable.
 * Concurrent changes after this snapshot retain the declared execution-time
 * race boundary; a new filter name must not be assumed covered by an old run.
 */
export async function runIsolatedGit(args: readonly string[], cwd: string): Promise<GitResult> {
  const env = isolatedEnvironment()
  const executable = await resolveGitExecutable(cwd, env)
  if (!executable) return { code: 1, stdout: '', stderr: 'Git evidence unavailable: no trusted absolute Git executable outside the workspace' }
  const fixed = SAFE_CONFIG.flatMap(value => ['-c', value])
  const config = await invoke(executable, [...fixed, 'config', '--null', '--name-only', '--list', '--includes'], cwd, env)
  if (config.code !== 0) return { code: config.code, stdout: '', stderr: 'Git configuration safety preflight failed' }
  const drivers = new Set<string>()
  for (const key of config.stdout.split('\0')) {
    // --name-only -z keeps embedded newlines inside a key, rather than making
    // them look like the old key/value separator. Git rejects newline keys in
    // its environment configuration API, so such repositories fail closed.
    const match = /^filter\.(.*)\.(?:clean|smudge|process|required)$/is.exec(key)
    if (match && /[\r\n]/.test(key)) return { code: 1, stdout: '', stderr: 'Git evidence unavailable: filter configuration key contains an unsupported newline' }
    // execFile decodes output as UTF-8. A replacement character may represent
    // undecodable repository bytes, which must not be overridden under a
    // different decoded name. Literal U+FFFD names conservatively stop too.
    if (match && key.includes('\uFFFD')) return { code: 1, stdout: '', stderr: 'Git evidence unavailable: filter configuration key cannot be represented safely as UTF-8' }
    if (match?.[1] !== undefined) drivers.add(match[1])
  }
  // Keep keys and values separate. In particular, '-c filter.evil=foo.clean='
  // would split at the first '=' and leave that legal driver's clean active.
  const overrides = [...drivers].flatMap(name => [
    [`filter.${name}.clean`, ''], [`filter.${name}.smudge`, ''],
    [`filter.${name}.process`, ''], [`filter.${name}.required`, 'false'],
  ])
  env.GIT_CONFIG_COUNT = String(overrides.length)
  for (const [index, [key, value]] of overrides.entries()) {
    env[`GIT_CONFIG_KEY_${index}`] = key
    env[`GIT_CONFIG_VALUE_${index}`] = value
  }
  return invoke(executable, [...fixed, ...args], cwd, env)
}
