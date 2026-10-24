import type { RuntimeHostConnectionState } from './runtime-host-connection-state'

export type RuntimeHostOutageKind = 'reconnecting' | 'offline'

/** One reading of a host's outage for every surface that names it, so they never disagree. */
export function runtimeHostOutageKind(
  state: RuntimeHostConnectionState
): RuntimeHostOutageKind | null {
  // A closed workspace window still answers; only work that needs that window waits.
  switch (state) {
    case 'connected':
    case 'workspace-window-closed':
      return null
    // Refused, retired by Disconnect, or never reached: no transport is coming back on its own.
    case 'disconnected':
      return 'offline'
    // Still retrying; 'runtime-unavailable' is also published on every recovery, before the probe.
    case 'checking':
    case 'reconnecting':
    case 'runtime-unavailable':
      return 'reconnecting'
  }
}
