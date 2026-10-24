import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { PtyTransport } from './pty-transport-types'
import { useWslHostUnavailableReason } from './use-wsl-host-unavailable-reason'
import { useManagedPairingRefusedEnvironmentId } from './use-managed-pairing-refused'
import { CalmRemoteRuntimeReconnectBanner } from './TerminalRemoteRuntimeReconnectBanner'
import {
  useRetryingOutageEnvironmentId,
  useWorkspaceRuntimeEnvironmentId
} from './remote-server-outage'
import {
  usePublishRemoteServerNoticeShowing,
  useRemoteServerNoticeClaim
} from './remote-server-notice-claims'
import { RemoteServerOutageNotice } from './RemoteServerOutageNotice'
import { useCalmStatusReveal } from '@/hooks/use-calm-status-reveal'
import type { TerminalPaneController } from './use-terminal-pane-controller'

/** What a pane's Reconnect does: pair again first when the server refused us, then retry. */
export function createPaneRecoveryReconnect(
  getTransport: () => PtyTransport | undefined,
  pairingRefusedEnvironmentId: string | null
): () => void {
  return () => {
    const retry = (): void => {
      getTransport()?.retryRecovery?.()
    }
    // Why connect first: it asks Orca to pair again, which a pane retry alone does not.
    if (pairingRefusedEnvironmentId) {
      void window.api.runtimeEnvironments
        .connect({ selector: pairingRefusedEnvironmentId })
        .catch(() => undefined)
        .finally(retry)
      return
    }
    retry()
  }
}

export function TerminalPaneRecoveryPortals({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element | null {
  const { managedPanes, paneTransportsRef, ptyRecoveryStatesByPaneId, showSshReconnectOverlay } =
    controller
  const wslHostUnavailable = useWslHostUnavailableReason(controller.worktreeId)
  const pairingRefusedEnvironmentId = useManagedPairingRefusedEnvironmentId(controller.worktreeId)
  const ownerEnvironmentId = useWorkspaceRuntimeEnvironmentId(controller.worktreeId)
  const retryingOutageEnvironmentId = useRetryingOutageEnvironmentId(controller.worktreeId)
  const isolated = controller.isolatedPaneKey !== null
  // Why not isolated panes: an Activity thread shows one pane away from this tab's surface.
  const canSpeak =
    controller.isVisible &&
    !isolated &&
    !showSshReconnectOverlay &&
    !wslHostUnavailable &&
    pairingRefusedEnvironmentId === null
  const serverDown = retryingOutageEnvironmentId !== null
  const notice = useRemoteServerNoticeClaim(ownerEnvironmentId, serverDown, canSpeak)
  const [noticeEnvironmentId, setNoticeEnvironmentId] = useState<string | null>(null)
  if (notice.speaks && ownerEnvironmentId !== noticeEnvironmentId) {
    setNoticeEnvironmentId(ownerEnvironmentId)
  }
  const noticeReveal = useCalmStatusReveal(notice.speaks, false, notice.since)
  usePublishRemoteServerNoticeShowing(noticeEnvironmentId, noticeReveal.visible)
  if (showSshReconnectOverlay) {
    return null
  }
  return (
    <>
      {noticeEnvironmentId ? (
        <RemoteServerOutageNotice
          key={noticeEnvironmentId}
          environmentId={noticeEnvironmentId}
          reveal={noticeReveal}
        />
      ) : null}
      {managedPanes.map((pane) => {
        const recoveryState = ptyRecoveryStatesByPaneId[pane.id]
        const transport = paneTransportsRef.current.get(pane.id)
        // Why only when unknown: a bridged pane reports null on purpose and must not borrow the owner's server.
        const paneEnvironmentId = transport?.getRuntimeEnvironmentId
          ? transport.getRuntimeEnvironmentId()
          : ownerEnvironmentId
        // Why mounted with no recovery: the banner's minimum time and hold outlive the recovery itself.
        return createPortal(
          <CalmRemoteRuntimeReconnectBanner
            // Why per pane, not per epoch: a Reconnect click opens a new epoch and must not hide the banner again.
            key={`remote-runtime-reconnect-${pane.id}`}
            recovery={recoveryState && recoveryState.reason !== 'ownership' ? recoveryState : null}
            environmentId={paneEnvironmentId}
            // Why the action exception after the outage: a notice on its hold no longer covers a stopped pane.
            heldByServer={
              !isolated &&
              !wslHostUnavailable &&
              pairingRefusedEnvironmentId === null &&
              notice.quiet &&
              paneEnvironmentId === ownerEnvironmentId &&
              (serverDown || recoveryState?.phase !== 'disconnected')
            }
            onReconnect={createPaneRecoveryReconnect(
              () => paneTransportsRef.current.get(pane.id),
              pairingRefusedEnvironmentId
            )}
            wslHostUnavailable={wslHostUnavailable}
            pairingRefused={pairingRefusedEnvironmentId !== null}
          />,
          pane.container,
          `remote-runtime-reconnect-${pane.id}`
        )
      })}
    </>
  )
}
