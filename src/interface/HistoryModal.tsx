import { CheckCircle2, Clock, FileText, Image, Music, Trash2, Video, X } from 'lucide-react';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ProjectHistoryEntry, useHistoryStore } from '../integration/store/historyStore';
import { formatTokens } from './ProjectView';

interface HistoryModalProps {
  onClose: () => void;
}

const ASSET_ICONS = {
  text: FileText,
  image: Image,
  audio: Music,
  video: Video,
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const HistoryModal: React.FC<HistoryModalProps> = ({ onClose }) => {
  const { entries, removeEntry } = useHistoryStore();
  const [selected, setSelected] = useState<ProjectHistoryEntry | null>(null);

  const renderDetailContent = (entry: ProjectHistoryEntry) => {
    if (entry.finalAssetType === 'video' && entry.finalAssetContent) {
      return (
        <video controls className="w-full rounded-2xl shadow-xl border border-black/5 mb-4">
          <source src={entry.finalAssetContent} type="video/mp4" />
        </video>
      );
    }
    if (entry.finalAssetType === 'image' || entry.finalAssetType === 'audio') {
      // The generated binary itself isn't kept in history (see
      // historyStore.ts) - only the prompt/lyrics text below is.
      return (
        <p className="text-xs text-zinc-400 italic mb-4">
          The generated {entry.finalAssetType} wasn't kept in history (only text
          output and video are retained across sessions). The prompt used is below.
        </p>
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/60 backdrop-blur-xl p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-50 border border-black/10 rounded-[32px] w-180 max-w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 py-6 border-b border-black/5 bg-white shrink-0">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-darkDelegation">
              {selected ? 'Project Details' : 'Project History'}
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {selected ? formatDate(selected.archivedAt) : `${entries.length} past project${entries.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            onClick={selected ? () => setSelected(null) : onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors text-lg leading-none"
          >
            {selected ? '←' : <X size={18} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {selected ? (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Brief</p>
                <div className="markdown-content text-xs text-zinc-600 leading-relaxed bg-white p-4 rounded-xl border border-zinc-100">
                  <ReactMarkdown>{selected.userBrief || '(no brief recorded)'}</ReactMarkdown>
                </div>
              </div>

              {selected.finalOutput && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
                    {selected.finalAssetType === 'text' ? 'Final Output' : 'Prompt Used'}
                  </p>
                  {renderDetailContent(selected)}
                  <div className="markdown-content text-xs text-zinc-600 leading-relaxed bg-white p-4 rounded-xl border border-zinc-100">
                    <ReactMarkdown>{selected.finalOutput}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-xl border border-zinc-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Tokens</p>
                  <p className="text-sm font-mono font-black text-darkDelegation">{formatTokens(selected.totalTokenUsage.totalTokens)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-zinc-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Est. Cost</p>
                  <p className="text-sm font-mono font-black text-darkDelegation">${selected.totalEstimatedCost.toFixed(3)}</p>
                </div>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Clock size={32} className="text-zinc-200" strokeWidth={1.5} />
              <p className="text-xs text-zinc-400 max-w-xs">
                No past projects yet. Finished or reset projects will show up here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => {
                const Icon = ASSET_ICONS[entry.finalAssetType];
                return (
                  <button
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    className="flex items-center gap-3 p-4 bg-white hover:bg-zinc-50 border border-zinc-100 rounded-xl text-left transition-colors group"
                  >
                    <div className="w-9 h-9 shrink-0 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-400">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-darkDelegation truncate">
                        {entry.userBrief || '(no brief recorded)'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
                        <span>{entry.teamName}</span>
                        <span>·</span>
                        <span>{formatDate(entry.archivedAt)}</span>
                        {entry.completed && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 size={10} /> Completed
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEntry(entry.id);
                      }}
                      className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      title="Delete from history"
                    >
                      <Trash2 size={14} />
                    </button>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
