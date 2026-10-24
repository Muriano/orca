import { translate } from '@/i18n/i18n'
import { useCalmStatusReveal } from '@/hooks/use-calm-status-reveal'
import type { VisiblePtyRecoveryState } from './terminal-remote-runtime-recovery-ui-state'
import type { WslHostUnavailableReason } from './use-wsl-host-unavailable-reason'
import { WslHostUnavailableBanner } from './WslHostUnavailableBanner'
import { RemoteRuntimeRecoveryCard } from './RemoteRuntimeRecoveryCard'
import {
  fallbackRemoteServerName,
  paneRecoveryCause,
  remoteRuntimeRecoveryCopy
} from './remote-runtime-recovery-copy'
import { selectRuntimeServerName, selectRuntimeServerTailscaleHost } from './remote-server-outage'
import { useAppStore } from '@/store'

type BannerProps = {
  recovery: Pick<VisiblePtyRecoveryState, 'phase' | 'cause' | 'waiting'>
  serverName: string
  onReconnect: () => void
  downSince?: number | null
  tailscaleHost?: string | null
  /** The pane's WSL host cannot run: nothing is retrying, so say why instead. */
  wslHostUnavailable?: WslHostUnavailableReason | null
  /** The pane's managed server refuses this desktop and pairing again over SSH failed. */
  pairingRefused?: boolean
}

function reconnectAction(onReconnect: () => void): { label: string; onClick: () => void } {
  return {
    label: translate(
      'auto.components.terminal.pane.TerminalRemoteRuntimeReconnectBanner.reconnectButton',
      'Reconnect'
    ),
    onClick: onReconnect
  }
}

export function TerminalRemoteRuntimeReconnectBanner({
  recovery,
  serverName,
  onReconnect,
  downSince = null,
  tailscaleHost = null,
  wslHostUnavailable = null,
  pairingRefused = false
}: BannerProps): React.JSX.Element {
  if (wslHostUnavailable) {
    return <WslHostUnavailableBanner reason={wslHostUnavailable} />
  }
  if (pairingRefused) {
    return (
      <RemoteRuntimeRecoveryCard
        icon="stopped"
        data={{ 'data-terminal-remote-runtime-reconnect-banner': 'pairing-refused' }}
        title={translate(
          'auto.components.terminal.pane.TerminalRemoteRuntimeReconnectBanner.pairingRefusedTitle',
          'This host no longer accepts this computer'
        )}
        body={translate(
          'auto.components.terminal.pane.TerminalRemoteRuntimeReconnectBanner.pairingRefusedBody',
          "Orca couldn't pair with it again over SSH. Nothing on the host was stopped. Reconnect to try again."
        )}
        action={reconnectAction(onReconnect)}
      />
    )
  }
  if (recovery.phase === 'disconnected') {
    return (
      <RemoteRuntimeRecoveryCard
        icon="stopped"
        data={{ 'data-terminal-remote-runtime-reconnect-banner': 'disconnected' }}
        title={translate(
          'auto.components.terminal.pane.TerminalRemoteRuntimeReconnectBanner.disconnectedTitle',
          'Remote runtime disconnected'
        )}
        body={translate(
          'auto.components.terminal.pane.TerminalRemoteRuntimeReconnectBanner.disconnectedBody',
          'Automatic retries stopped. Reconnect to resume this terminal session.'
        )}
        tailscaleHost={tailscaleHost}
        action={reconnectAction(onReconnect)}
      />
    )
  }
  const cause = paneRecoveryCause(recovery)
  const copy = remoteRuntimeRecoveryCopy(cause, serverName)
  return (
    <RemoteRuntimeRecoveryCard
      icon={copy.retrying ? 'retrying' : 'waiting'}
      data={{
        'data-terminal-remote-runtime-reconnect-banner': recovery.phase,
        'data-terminal-remote-runtime-recovery-cause': cause
      }}
      title={copy.title}
      body={copy.body}
      downSince={downSince}
      tailscaleHost={cause === 'network' || cause === 'waiting-for-server' ? tailscaleHost : null}
      action={copy.retrying ? null : reconnectAction(onReconnect)}
    />
  )
}

/**
 * A pane's recovery, said only once it outlasts a clean reconnect; anything needing action shows
 * at once. `heldByServer`: the server's own notice covers this drop, and control-ready revives
 * the pane, so it stays quiet.
 */
export function CalmRemoteRuntimeReconnectBanner({
  heldByServer,
  environmentId,
  ...props
}: Omit<BannerProps, 'serverName' | 'tailscaleHost' | 'downSince'> & {
  heldByServer: boolean
  environmentId: string | null
}): React.JSX.Element | null {
  const serverName = useAppStore((state) =>
    environmentId ? selectRuntimeServerName(state, environmentId) : fallbackRemoteServerName()
  )
  const tailscaleHost = useAppStore((state) =>
    environmentId ? selectRuntimeServerTailscaleHost(state, environmentId) : null
  )
  const needsAction =
    props.recovery.phase === 'disconnected' ||
    Boolean(props.wslHostUnavailable) ||
    Boolean(props.pairingRefused)
  // Why not down while held: once the server answers, the pane earns its own full delay to resubscribe.
  const reveal = useCalmStatusReveal(!heldByServer, needsAction)
  if (heldByServer || !reveal.visible) {
    return null
  }
  return (
    <TerminalRemoteRuntimeReconnectBanner
      {...props}
      serverName={serverName}
      tailscaleHost={tailscaleHost}
      downSince={reveal.downSince}
    />
  )
}
