import { useAppStore } from '@/store'
import { useCalmStatusReveal } from '@/hooks/use-calm-status-reveal'
import { RemoteRuntimeRecoveryCard } from './RemoteRuntimeRecoveryCard'
import { remoteRuntimeRecoveryCopy } from './remote-runtime-recovery-copy'
import {
  selectRemoteServerOutageCause,
  selectRuntimeServerName,
  selectRuntimeServerTailscaleHost
} from './remote-server-outage'

/**
 * The one notice for a server whose shared connection dropped and is retrying, in place of a
 * banner in every pane. Stays mounted after `speaking` ends so its hold can run out.
 */
export function RemoteServerOutageNotice({
  environmentId,
  speaking,
  since
}: {
  environmentId: string
  speaking: boolean
  since: number | null
}): React.JSX.Element | null {
  const reveal = useCalmStatusReveal(speaking, false, since)
  const serverName = useAppStore((state) => selectRuntimeServerName(state, environmentId))
  const cause = useAppStore((state) => selectRemoteServerOutageCause(state, environmentId))
  const tailscaleHost = useAppStore((state) =>
    selectRuntimeServerTailscaleHost(state, environmentId)
  )
  if (!reveal.visible) {
    return null
  }
  const copy = remoteRuntimeRecoveryCopy(cause, serverName)
  return (
    <RemoteRuntimeRecoveryCard
      icon="retrying"
      data={{
        'data-remote-server-outage-notice': environmentId,
        'data-terminal-remote-runtime-recovery-cause': cause
      }}
      title={copy.title}
      body={copy.body}
      downSince={reveal.downSince}
      tailscaleHost={cause === 'network' ? tailscaleHost : null}
    />
  )
}
