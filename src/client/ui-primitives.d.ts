/**
 * Structural declarations for the browser platform module
 * `@deepseek-ai/dsh-client-ui-primitives` (seeded by the Web shell from
 * `packages/client/web/src/platform.ts`). The published package ships no
 * consumer typings for plugin halves, so this file mirrors the rc.5 source
 * contracts of exactly the primitives this client half uses (Menu, Tag,
 * IconChevronDownOutlineRegular) — see THIRD-PARTY-SOURCES.md.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, ReactNode } from 'react'

  /** Shared decorative icon props. */
  export interface IconProps {
    /** Rendered pixel size (default 16). */
    size?: number
    className?: string
  }

  /** Chevron-down outline glyph (composer/selector affordance). */
  export function IconChevronDownOutlineRegular(props: IconProps): ReactElement
  export function PermissionIconReadOnlyRegular(props?: IconProps): ReactElement
  export function PermissionIconWorkspaceWriteRegular(props?: IconProps): ReactElement
  export function PermissionIconFullAccessRegular(props?: IconProps): ReactElement
  export function PermissionIconAutoReviewRegular(props?: IconProps): ReactElement
  export function RiskConfirmation(props: {
    open: boolean
    title: string
    description: string
    acknowledgeLabel: string
    cancelLabel: string
    closeLabel: string
    confirmLabel: string
    acknowledged: boolean
    disabled?: boolean
    onAcknowledgedChange: (value: boolean) => void
    onCancel: () => void
    onConfirm: () => void
  }): ReactElement

  /** Neutral/quiet status pill. */
  export function Tag(props: { tone?: 'neutral' | 'quiet' | 'brand' | 'error'; children?: ReactNode }): ReactElement

  /** Selectable menu row. */
  export interface MenuItem {
    id: string
    label: ReactNode
    disabled?: boolean
    icon?: ReactNode
    danger?: boolean
  }

  /** Anchored dropdown menu (ui-primitives `Menu`). */
  export function Menu(props: {
    open: boolean
    anchor: ReactNode
    items?: readonly MenuItem[]
    selectedId?: string | undefined
    onSelect?: (id: string) => void
    onClose: () => void
    align?: 'start' | 'end'
    side?: 'bottom' | 'top' | 'right'
    portal?: boolean
    dense?: boolean
    compact?: boolean
  }): ReactElement
}
