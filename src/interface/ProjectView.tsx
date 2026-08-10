import { Clock, Info, MessageSquare, RefreshCcw, ScrollText, FileText, Image, Music, Video } from 'lucide-react';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { getAgentSet, getAllAgents } from '../data/agents';
import { useCoreStore } from '../integration/store/coreStore';
import { useHistoryStore } from '../integration/store/historyStore';
import { useTeamStore, useActiveTeam } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { useSceneManager } from '../simulation/SceneContext';
import { USER_COLOR } from '../theme/brand';
import HistoryModal from './HistoryModal';
import ResetModal from './ResetModal';
import PricingModal from './PricingModal';

export function formatTokens(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
}

const ProjectView: React.FC = () => {
  const {
    userBrief,
    referenceImages,
    phase,
    actionLog,
    resetProject,
  } = useCoreStore();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const activeTeam = useActiveTeam();
  const scene = useSceneManager();
  const historyCount = useHistoryStore((s) => s.entries.length);

  const hasLogs = actionLog.length > 0;

  const handleResetConfirm = () => {
    // Archive a snapshot before resetProject() wipes everything - this is
    // the only point a project's brief/output/stats would otherwise be
    // lost for good, per ResetModal's own warning text.
    const s = useCoreStore.getState();
    if (s.tasks.length > 0 || s.finalOutput) {
      useHistoryStore.getState().addEntry({
        teamId: activeTeam.id,
        teamName: activeTeam.teamName,
        userBrief: s.userBrief,
        finalOutput: s.finalOutput,
        finalAssetType: s.finalAssetType,
        finalAssetContent: s.finalAssetContent,
        completed: s.phase === 'done',
        taskCount: s.tasks.length,
        totalTokenUsage: s.totalTokenUsage,
        totalEstimatedCost: s.totalEstimatedCost,
      });
    }

    // 1. Reset the 3D scene (teleport agents, clear chat)
    scene?.resetScene();
    // 3. Clear project state
    resetProject();
    setIsResetModalOpen(false);
  };

  // Starting a project otherwise required finding and clicking the Lead
  // Agent's character in the 3D scene - not discoverable from this panel,
  // which is the only thing visible on first load. This does the same two
  // steps InspectorPanel's "Chat about the brief" button does
  // (select the Lead Agent, then start the chat), just without requiring
  // the user to find them in the scene first.
  const handleTalkToLeadAgent = () => {
    const leadIndex = activeTeam.leadAgent.index;
    useUiStore.getState().setSelectedNpc(leadIndex);
    scene?.startChat(leadIndex);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 bg-white/50">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-black text-darkDelegation leading-tight">Project Info</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsHistoryModalOpen(true)}
              className="relative flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-darkDelegation hover:bg-zinc-100 transition-colors"
              title="Project history"
            >
              <Clock size={14} strokeWidth={2.5} />
              {historyCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-zinc-300 text-white text-[8px] font-black flex items-center justify-center leading-none">
                  {historyCount}
                </span>
              )}
            </button>
            <div
              className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors border border-transparent"
              style={{
                backgroundColor: phase === 'working' ? USER_COLOR : (phase === 'done' ? '#22c55e' : '#f4f4f5'),
                color: phase === 'idle' ? '#a1a1aa' : 'white',
                borderColor: phase === 'idle' ? '#e4e4e7' : 'transparent'
              }}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${phase === 'working' ? 'bg-white animate-pulse' : 'bg-white opacity-40'}`} />
              {phase === 'idle' ? 'Ready to Start' : phase}
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-zinc-100 w-full mb-6" />

      {/* Reset Project Button */}
      {hasLogs && (
        <div className="mb-8 w-full">
          <button
            onClick={() => setIsResetModalOpen(true)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] group ${phase === 'done'
                ? 'bg-darkDelegation hover:bg-black text-white shadow-xl shadow-darkDelegation/10'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600'
              }`}
          >
            <RefreshCcw size={14} strokeWidth={3} className="transition-transform group-hover:rotate-180 duration-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">Start New Project</span>
          </button>
        </div>
      )}

      {/* Brief */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">User Brief</p>
          <div className="h-px flex-1 bg-zinc-100" />
        </div>
        {userBrief ? (
          <div className="space-y-4">
            <div className="markdown-content text-xs text-zinc-600 leading-relaxed font-medium bg-white/40 p-4 rounded-xl border border-zinc-100/50 max-h-[300px] overflow-y-auto custom-scrollbar">
              <ReactMarkdown>
                {userBrief}
              </ReactMarkdown>
            </div>

            {(activeTeam.outputType === 'image' || activeTeam.outputType === 'video') && referenceImages.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Brief Logic References</p>
                <div className="grid grid-cols-3 gap-2">
                  {referenceImages.map((img, idx) => (
                    <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-zinc-100 shadow-sm bg-zinc-50">
                      <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-zinc-400 italic">No active brief yet.</p>
            {phase === 'idle' && (
              <button
                onClick={handleTalkToLeadAgent}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] bg-darkDelegation hover:bg-black text-white shadow-xl shadow-darkDelegation/10"
              >
                <MessageSquare size={14} strokeWidth={3} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Talk to {activeTeam.leadAgent.name} to Start
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Token Usage */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Token Usage</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <button
            onClick={() => setIsPricingModalOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 hover:border-emerald-200 rounded-lg transition-all active:scale-95 group ml-4 cursor-pointer"
          >
            <span className="text-[10px] font-black uppercase tracking-tight text-emerald-600">
              Total Est. ${useCoreStore.getState().totalEstimatedCost.toFixed(3)}
            </span>
            <Info size={11} className="text-emerald-500 group-hover:text-emerald-600" />
          </button>
        </div>

        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100 mb-6">
          <div className="flex flex-col gap-1 mb-6">
            <span className="text-4xl font-mono font-black text-darkDelegation tracking-tighter">
              {formatTokens(useCoreStore.getState().totalTokenUsage.totalTokens)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono">
            <span className="text-zinc-700">{formatTokens(useCoreStore.getState().totalTokenUsage.promptTokens)} <span className="text-zinc-400 font-medium">input</span></span>
            <span className="text-zinc-300">+</span>
            <span className="text-zinc-700">{formatTokens(useCoreStore.getState().totalTokenUsage.completionTokens)} <span className="text-zinc-400 font-medium">output</span></span>
          </div>
        </div>

        <div className="space-y-1">
          {Object.entries(useCoreStore.getState().agentTokenUsage)
            .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
            .map(([idx, usage]) => {
              const agentIndex = parseInt(idx);
              const agents = getAllAgents(activeTeam);
              const agent = agentIndex === -1
                ? { name: 'System', color: '#71717a' }
                : agents.find(a => a.index === agentIndex);

              if (!agent || usage.totalTokens === 0) return null;

              return (
                <div key={idx} className="flex items-center justify-between py-2 px-2 hover:bg-zinc-100/50 rounded-lg transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]" style={{ backgroundColor: agent.color }} />
                    <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-tight group-hover:text-darkDelegation transition-colors">
                      {agent.name}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      {useCoreStore.getState().agentEstimatedCost[agentIndex] > 0 && (
                        <span className="text-[9px] font-mono font-bold text-emerald-600/70">
                          ${useCoreStore.getState().agentEstimatedCost[agentIndex].toFixed(4)}
                        </span>
                      )}
                      <span className="text-[11px] font-mono font-black text-darkDelegation">
                        {formatTokens(usage.totalTokens)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-bold font-mono text-zinc-400">
                      <span>{formatTokens(usage.promptTokens)} <span className="font-medium opacity-60">input</span></span>
                      <span className="text-zinc-200">+</span>
                      <span>{formatTokens(usage.completionTokens)} <span className="font-medium opacity-60">output</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <ResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetConfirm}
      />

      {isPricingModalOpen && (
        <PricingModal onClose={() => setIsPricingModalOpen(false)} />
      )}

      {isHistoryModalOpen && (
        <HistoryModal onClose={() => setIsHistoryModalOpen(false)} />
      )}
    </div>
  );
};

export default ProjectView;
