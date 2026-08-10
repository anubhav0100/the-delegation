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
  | { type: 'control'; action: 'injectBrief'; payload: { brief: string } }
  | {
      type: 'control';
      action: 'createTask';
      payload: {
        title: string;
        description: string;
        assignedAgentId: number;
        requiresUserApproval?: boolean;
      };
    };

// agentIndex used for log entries attributed to the external controller
// (the browser's AI Assistant) rather than one of Delegation's own agents -
// mirrors the -1 = "System" convention ProjectView.tsx already uses for
// token/cost usage not tied to a specific agent.
const EXTERNAL_CONTROLLER_AGENT_INDEX = -1;

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
    case 'createTask': {
      // Only meaningful once a project is actually running - mirrors the
      // core/agent/tools/proposeTask.ts tool Delegation's own agents use
      // internally, so an externally-created task behaves identically to
      // one an agent proposed itself (same status, same log entry shape).
      if (core.phase !== 'working') {
        break;
      }
      const { title, description, assignedAgentId, requiresUserApproval } =
        msg.payload;
      const newTask = core.addTask({
        title,
        description,
        assignedAgentId,
        status: 'scheduled',
        requiresUserApproval: requiresUserApproval ?? false,
      });
      core.addLogEntry({
        agentIndex: EXTERNAL_CONTROLLER_AGENT_INDEX,
        action: `AI Assistant created task: "${title}"`,
        taskId: newTask.id,
      });
      break;
    }
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
