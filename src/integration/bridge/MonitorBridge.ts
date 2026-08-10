/**
 * Optional bridge to a same-origin companion server (see
 * server/delegation-server.mjs), which exists so an external process can
 * monitor and lightly control a running simulation over plain HTTP - the app
 * itself has no server or REST API otherwise.
 *
 * This is entirely best-effort: if there's no bridge server (e.g. this app is
 * hosted on GitHub Pages, or opened via `vite preview`/`vite dev` directly),
 * the WebSocket simply fails to connect and retries with backoff forever,
 * with no effect on the app itself.
 */
import { useCoreStore } from '../store/coreStore';
import { useTeamStore } from '../store/teamStore';
import { useUiStore } from '../store/uiStore';

const RECONNECT_DELAY_MS = 3000;
const STATE_DEBOUNCE_MS = 500;

type ControlMessage =
  | { type: 'control'; action: 'approveTask'; payload: { taskId: string } }
  | {
      type: 'control';
      action: 'rejectTask';
      payload: { taskId: string; comments: string };
    }
  | { type: 'control'; action: 'injectBrief'; payload: { brief: string } };

function buildStateSnapshot() {
  const core = useCoreStore.getState();
  const ui = useUiStore.getState();
  const team = useTeamStore.getState();

  return {
    phase: core.phase,
    userBrief: core.userBrief,
    tasks: core.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assignedAgentId: t.assignedAgentId,
      requiresUserApproval: t.requiresUserApproval,
      updatedAt: t.updatedAt,
    })),
    agentStatuses: ui.agentStatuses,
    actionLogTail: core.actionLog.slice(-20),
    totalTokenUsage: core.totalTokenUsage,
    totalEstimatedCost: core.totalEstimatedCost,
    selectedTeamId: team.selectedAgentSetId,
  };
}

function applyControlMessage(msg: ControlMessage) {
  const core = useCoreStore.getState();
  switch (msg.action) {
    case 'approveTask':
      core.approveTask(msg.payload.taskId);
      break;
    case 'rejectTask':
      core.rejectTask(msg.payload.taskId, msg.payload.comments);
      break;
    case 'injectBrief':
      // Only meaningful when idle - starting a project mid-run would stomp
      // on in-flight tasks, so this mirrors what the UI itself allows.
      if (core.phase === 'idle') {
        core.startProject(msg.payload.brief);
      }
      break;
  }
}

let socket: WebSocket | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function sendSnapshot() {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'state', data: buildStateSnapshot() }));
  }
}

function scheduleSnapshot() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(sendSnapshot, STATE_DEBOUNCE_MS);
}

function connect() {
  const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/__bridge`;
  try {
    socket = new WebSocket(url);
  } catch {
    setTimeout(connect, RECONNECT_DELAY_MS);
    return;
  }

  socket.addEventListener('open', sendSnapshot);

  socket.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg?.type === 'control') {
        applyControlMessage(msg as ControlMessage);
      }
    } catch {
      // Ignore malformed messages - never let a bad payload from the bridge
      // server crash the running simulation.
    }
  });

  socket.addEventListener('close', () => {
    socket = null;
    setTimeout(connect, RECONNECT_DELAY_MS);
  });

  socket.addEventListener('error', () => {
    socket?.close();
  });
}

/** Call once at app startup. Safe to call in any hosting environment. */
export function initMonitorBridge() {
  connect();
  useCoreStore.subscribe(scheduleSnapshot);
  useUiStore.subscribe(scheduleSnapshot);
  useTeamStore.subscribe(scheduleSnapshot);
}
