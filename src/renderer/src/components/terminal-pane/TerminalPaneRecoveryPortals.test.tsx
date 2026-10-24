// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CALM_STATUS_REVEAL_DELAY_MS } from '../../../../shared/calm-status-reveal'
import type { TerminalPaneController } from './use-terminal-pane-controller'

const outage = vi.hoisted((): { environmentId: string | null } => ({ environmentId: 'env-1' }))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, string>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => options?.[name] ?? ''),
  getIntlLocale: () => 'en-US'
}))
vi.mock('@/store', () => ({ useAppStore: (selector: (state: unknown) => unknown) => selector({}) }))
vi.mock('./use-wsl-host-unavailable-reason', () => ({ useWslHostUnavailableReason: () => null }))
vi.mock('./use-managed-pairing-refused', () => ({
  useManagedPairingRefusedEnvironmentId: () => null
}))
vi.mock('./remote-server-outage', () => ({
  useWorkspaceRuntimeEnvironmentId: () => 'env-1',
  useRetryingOutageEnvironmentId: () => outage.environmentId,
  selectRuntimeServerName: () => 'Desk',
  selectRuntimeServerTailscaleHost: () => null,
  selectRemoteServerOutageCause: () => 'connection-lost'
}))

afterEach(() => {
  outage.environmentId = 'env-1'
  cleanup()
  vi.useRealTimers()
})

function controllerFor(panes: HTMLElement[]): TerminalPaneController {
  const transport = { getRuntimeEnvironmentId: () => 'env-1' }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the recovery portals read only these fields of the pane controller.
  return {
    managedPanes: panes.map((container, index) => ({ id: index + 1, container })),
    ptyRecoveryStatesByPaneId: Object.fromEntries(
      panes.map((_, index) => [index + 1, { phase: 'backoff', epoch: 1, attempt: 1 }])
    ),
    paneTransportsRef: { current: new Map(panes.map((_, index) => [index + 1, transport])) },
    showSshReconnectOverlay: false,
    worktreeId: 'wt-1',
    isVisible: true,
    isolatedPaneKey: null
  } as unknown as TerminalPaneController
}

describe('TerminalPaneRecoveryPortals', () => {
  it('says a server-wide drop once for the tab and keeps every split pane quiet', async () => {
    vi.useFakeTimers()
    const { TerminalPaneRecoveryPortals } = await import('./TerminalPaneRecoveryPortals')
    const panes = [document.createElement('div'), document.createElement('div')]
    panes.forEach((pane) => document.body.appendChild(pane))
    const view = render(<TerminalPaneRecoveryPortals controller={controllerFor(panes)} />)

    act(() => vi.advanceTimersByTime(CALM_STATUS_REVEAL_DELAY_MS))

    expect(view.container.querySelectorAll('[data-remote-server-outage-notice]')).toHaveLength(1)
    expect(
      document.querySelectorAll('[data-terminal-remote-runtime-reconnect-banner]')
    ).toHaveLength(0)
  })

  it('keeps panes quiet while the server notice holds after the server answers', async () => {
    vi.useFakeTimers()
    const { TerminalPaneRecoveryPortals } = await import('./TerminalPaneRecoveryPortals')
    const panes = [document.createElement('div')]
    panes.forEach((pane) => document.body.appendChild(pane))
    const controller = controllerFor(panes)
    const view = render(<TerminalPaneRecoveryPortals controller={controller} />)
    act(() => vi.advanceTimersByTime(CALM_STATUS_REVEAL_DELAY_MS * 2))

    outage.environmentId = null
    view.rerender(<TerminalPaneRecoveryPortals controller={{ ...controller }} />)

    expect(view.container.querySelectorAll('[data-remote-server-outage-notice]')).toHaveLength(1)
    expect(
      document.querySelectorAll('[data-terminal-remote-runtime-reconnect-banner]')
    ).toHaveLength(0)
  })
})
