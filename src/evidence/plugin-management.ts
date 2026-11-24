/** Describe the bundled management contract without trusting a dispatch by name. */
interface InstalledBundle {
  readonly name?: string
  readonly installed?: boolean
  readonly version?: string
  readonly source?: string
}

interface PluginManagerReader {
  listBundles(): Promise<readonly InstalledBundle[]>
}

function sourceKind(spec: string): string {
  if (/^(?:file:|link:|\.{1,2}[/\\]|[/\\]|[a-z]:)/iu.test(spec)) return 'local path'
  if (/^(?:git(?:\+|:|@)|github:|gitlab:|bitbucket:)/iu.test(spec)) return 'Git'
  if (/^https?:/iu.test(spec)) return 'URL'
  return 'registry spec'
}

export async function pluginManagementEvidence(
  tool: string, args: unknown, manager: PluginManagerReader | undefined,
): Promise<readonly string[]> {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return []
  const input = args as Readonly<Record<string, unknown>>
  if (tool === 'cordis_inspect_query' && input['platform'] === 'host'
    && input['provider'] === 'Config' && input['method'] === 'listConfigs') {
    return [
      'The bundled Host Config.listConfigs handler reads Loader entries and projected configuration schemas, not saved configuration values. Schema metadata and package locations may be included.',
      'This describes the bundled contract for use when the selected handler is the bundled Config provider.',
    ]
  }
  if (tool !== 'plugin_manager' || typeof input['action'] !== 'string') return []
  const action = input['action']
  const target = typeof input['target'] === 'string' ? input['target'] : ''
  const facts = [
    'The following describes the contract of the bundled DSH plugin manager when it is the selected handler.',
  ]
  switch (action) {
    case 'list_bundles':
      return [...facts, 'Listing bundles is read-only. Its source fields can include absolute paths and URL query strings.']
    case 'list_plugins':
    case 'list_version_exemptions':
      return [...facts, 'This action lists metadata in the current profile.']
    case 'install_bundle':
      facts.push('Installation changes the current profile and can load Host code. A request to update a named plugin can cover an install step within the same scope.')
      if (Array.isArray(input['approvedBuilds']) && input['approvedBuilds'].length > 0) {
        facts.push('approvedBuilds requests persistent permission for dependency install scripts. Check for explicit authorization for those scripts.')
      }
      if (input['registry'] !== undefined) facts.push('The caller specified a registry. Compare the source before assuming an in-channel update.')
      if (target && sourceKind(target) !== 'registry spec') facts.push(`The proposed installation spec uses a ${sourceKind(target)} source.`)
      break
    case 'set_version_exemption':
      return [...facts, 'This action changes an exact plugin/runtime compatibility exemption. An installation or update request alone does not grant an exemption.']
    case 'set_plugin':
    case 'set_bundle':
      return [...facts, 'This action changes which code is active in the current profile.']
    case 'remove_bundle':
      facts.push('Removal changes the current profile. Check whether it is the removal step of a user-authorized replacement of this package.')
      break
    default:
      return []
  }

  // Bare package names and registry specs can be matched without guessing
  // the contents of a Git checkout, local path, or tarball.
  const packageName = /^((?:@[\w.-]+\/)?[\w.-]+)(?:@[\w.+~-]+)?$/u.exec(target)?.[1]
  if (packageName === undefined) return facts
  if (packageName === 'dsh-second-look') facts.push('The target is the active review plugin itself.')
  try {
    const installed = (await manager?.listBundles())?.find(bundle => bundle.name === packageName && bundle.installed === true)
    if (installed?.version) {
      const source = installed.source === undefined ? 'not established'
        : sourceKind(installed.source.startsWith(`${packageName}@`) ? installed.source.slice(packageName.length + 1) : installed.source)
      facts.push(`Host profile inventory: ${packageName} ${installed.version} is installed. Recorded source type: ${source}.`)
    } else {
      facts.push('The currently installed version and source were not established from the Host inventory.')
    }
  } catch {
    facts.push('Host profile inventory was unavailable for this review.')
  }
  return facts
}
