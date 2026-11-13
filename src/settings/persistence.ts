import { randomUUID } from 'node:crypto'
/**
 * Modified for dsh-second-look, 2026-10-31 (INSTALL-REVIEW R2 返修).
 *
 * Durable persistence for the settings-page overrides (names and budgets —
 * NEVER credentials), following the local fork `dsh-heavy-approval`'s
 * `reviewer-settings.ts` pattern (workspace-local source, reused with
 * attribution; see THIRD-PARTY-SOURCES.md): one JSON document per DSH home,
 * written to a temp file and atomically renamed into place. The document is
 * an OVERRIDE overlay over the loader config: it only stores fields the user
 * actually saved, so clearing a field falls back to the loader config value.
 *
 * Precedence (INSTALL-REVIEW R2 返修): loader config (base) < saved overrides.
 * A save reports success only AFTER the write is durable; a write failure
 * throws and changes nothing in memory.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The persisted override document (flat settings-page keys, names only). */
export type SavedOverrides = Record<string, unknown>

/**
 * The durable settings surface. `save` must be durable-or-throw: the store
 * reports success to the page only after it resolves without throwing.
 */
export interface SettingsPersistence {
  /** The saved override values (empty object when none); corrupt files degrade to no overrides. */
  load(): SavedOverrides
  /** Durably replace the saved override values. Throws when the write fails. */
  save(values: SavedOverrides): void
  /** Human-readable sink description for the status surface (no secrets). */
  describe(): string
}

/** Persisted document version (a shape change bumps this and ignores old files). */
const DOC_VERSION = 1

/** Default settings directory: `$DSH_HOME/second-look`, else `~/.dsh/second-look` (fork pattern). */
export function defaultSettingsDir(): string {
  const fromEnv = process.env.DSH_HOME?.trim()
  return join(fromEnv === undefined || fromEnv === '' ? join(homedir(), '.dsh') : fromEnv, 'second-look')
}

/**
 * File-backed persistence: `settings.json` in the given directory, written
 * via temp-file + atomic rename (the fork's pattern).
 */
export class FileSettingsPersistence implements SettingsPersistence {
  /** Result of the most recent {@link load} (status surface honesty). */
  private lastLoad: 'absent' | 'loaded' | 'invalid' = 'absent'

  constructor(readonly dir: string) {}

  load(): SavedOverrides {
    try {
      const raw = JSON.parse(readFileSync(join(this.dir, 'settings.json'), 'utf8')) as unknown
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        this.lastLoad = 'invalid'
        return {}
      }
      const { version, ...values } = raw as Record<string, unknown>
      if (version !== DOC_VERSION) {
        this.lastLoad = 'invalid'
        return {}
      }
      this.lastLoad = 'loaded'
      return values
    } catch (error: unknown) {
      this.lastLoad = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'invalid'
      return {}
    }
  }

  save(values: SavedOverrides): void {
    const document = { version: DOC_VERSION, ...values }
    mkdirSync(this.dir, { recursive: true })
    const target = join(this.dir, 'settings.json')
    const temp = join(this.dir, `settings.${randomUUID()}.tmp`)
    try {
      writeFileSync(temp, `${JSON.stringify(document, undefined, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      renameSync(temp, target)
    } finally {
      try { unlinkSync(temp) } catch { /* already renamed, or failed before creation */ }
    }
  }

  describe(): string {
    return `file: ${join(this.dir, 'settings.json')} (${this.lastLoad})`
  }
}

/**
 * In-memory persistence for tests and hosts without a writable state dir.
 * Durable only for the process lifetime — `describe()` says so.
 */
export class MemorySettingsPersistence implements SettingsPersistence {
  private saved: SavedOverrides | undefined
  private readonly label: string

  constructor(label = 'memory (NOT durable across restarts)') {
    this.label = label
  }

  load(): SavedOverrides {
    return this.saved === undefined ? {} : { ...this.saved }
  }

  save(values: SavedOverrides): void {
    this.saved = { ...values }
  }

  describe(): string {
    return this.label
  }
}
