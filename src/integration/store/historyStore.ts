import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { LLMTokenUsage } from '../../core/llm/types';

export interface ProjectHistoryEntry {
  id: string
  teamId: string
  teamName: string
  userBrief: string
  finalOutput: string | null
  finalAssetType: 'text' | 'image' | 'audio' | 'video'
  // Only kept for 'video' (a lightweight URL) and left null for 'image'/
  // 'audio' (base64 blobs, potentially several MB each - persisting many
  // of those in localStorage risks hitting its quota and breaking history
  // entirely). finalOutput (the prompt/lyrics/script text) is always kept
  // regardless, so what was asked for is never lost, even if the generated
  // binary itself isn't retained.
  finalAssetContent: string | null
  completed: boolean
  taskCount: number
  totalTokenUsage: LLMTokenUsage
  totalEstimatedCost: number
  archivedAt: number
}

interface HistoryState {
  entries: ProjectHistoryEntry[]
  addEntry: (entry: Omit<ProjectHistoryEntry, 'id' | 'archivedAt'>) => void
  removeEntry: (id: string) => void
  clearHistory: () => void
}

const uid = () => `history_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

// Capped so localStorage can't grow unbounded over a long-lived install -
// oldest entries are dropped first.
const MAX_HISTORY_ENTRIES = 30

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) => set((s) => {
        const keepAssetContent = entry.finalAssetType === 'video';
        const newEntry: ProjectHistoryEntry = {
          ...entry,
          finalAssetContent: keepAssetContent ? entry.finalAssetContent : null,
          id: uid(),
          archivedAt: Date.now(),
        };
        return { entries: [newEntry, ...s.entries].slice(0, MAX_HISTORY_ENTRIES) };
      }),

      removeEntry: (id) => set((s) => ({
        entries: s.entries.filter((e) => e.id !== id),
      })),

      clearHistory: () => set({ entries: [] }),
    }),
    {
      name: 'project-history-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
