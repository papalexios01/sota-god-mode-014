// Robust Content Generation Engine with Checkpoints, Auto-Save, and Recovery

const CHECKPOINT_KEY = 'generation_checkpoint_v2';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000];

export interface GenerationPhase {
  id: string;
  name: string;
  completed: boolean;
  data?: any;
  error?: string;
  attempts: number;
}

export interface GenerationCheckpoint {
  itemId: string;
  itemTitle: string;
  startedAt: string;
  lastUpdated: string;
  currentPhase: number;
  phases: GenerationPhase[];
  partialContent: string;
  collectedData: {
    serpData?: any[];
    semanticKeywords?: string[];
    neuronTerms?: any;
    youtubeVideo?: any;
    references?: any[];
    internalLinks?: any[];
    contentResponse?: string;
  };
}

export const saveCheckpoint = (checkpoint: GenerationCheckpoint): void => {
  try {
    const checkpoints = getCheckpoints();
    checkpoints[checkpoint.itemId] = checkpoint;
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoints));
    console.log(`[Checkpoint] Saved phase ${checkpoint.currentPhase} for "${checkpoint.itemTitle}"`);
  } catch (e) {
    console.error('[Checkpoint] Failed to save:', e);
  }
};

export const getCheckpoints = (): Record<string, GenerationCheckpoint> => {
  try {
    const saved = localStorage.getItem(CHECKPOINT_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const getCheckpoint = (itemId: string): GenerationCheckpoint | null => {
  const checkpoints = getCheckpoints();
  return checkpoints[itemId] || null;
};

export const clearCheckpoint = (itemId: string): void => {
  try {
    const checkpoints = getCheckpoints();
    delete checkpoints[itemId];
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoints));
    console.log(`[Checkpoint] Cleared for item ${itemId}`);
  } catch (e) {
    console.error('[Checkpoint] Failed to clear:', e);
  }
};

export const clearAllCheckpoints = (): void => {
  try {
    localStorage.removeItem(CHECKPOINT_KEY);
    console.log('[Checkpoint] Cleared all checkpoints');
  } catch (e) {
    console.error('[Checkpoint] Failed to clear all:', e);
  }
};

export const createInitialCheckpoint = (itemId: string, itemTitle: string): GenerationCheckpoint => {
  return {
    itemId,
    itemTitle,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: 0,
    phases: [
      { id: 'research', name: 'Research & Keywords', completed: false, attempts: 0 },
      { id: 'content', name: 'Content Generation', completed: false, attempts: 0 },
      { id: 'neuron', name: 'NeuronWriter Optimization', completed: false, attempts: 0 },
      { id: 'references', name: 'Reference Collection', completed: false, attempts: 0 },
      { id: 'links', name: 'Internal Linking', completed: false, attempts: 0 },
      { id: 'media', name: 'Media Integration', completed: false, attempts: 0 },
      { id: 'polish', name: 'Final Polish & Schema', completed: false, attempts: 0 }
    ],
    partialContent: '',
    collectedData: {}
  };
};

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  phaseName: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const delayMs = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      console.warn(`[${phaseName}] Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}. Retrying in ${delayMs}ms...`);

      if (attempt < maxRetries - 1) {
        await delay(delayMs);
      }
    }
  }

  throw lastError || new Error(`${phaseName} failed after ${maxRetries} attempts`);
};

export const safeExecutePhase = async <T>(
  checkpoint: GenerationCheckpoint,
  phaseIndex: number,
  executor: () => Promise<T>,
  onProgress?: (status: string) => void
): Promise<T | null> => {
  const phase = checkpoint.phases[phaseIndex];
  if (!phase) return null;

  if (phase.completed && phase.data) {
    console.log(`[${phase.name}] Using cached result from checkpoint`);
    return phase.data as T;
  }

  phase.attempts++;
  onProgress?.(`${phase.name} (attempt ${phase.attempts})...`);

  try {
    const result = await retryWithBackoff(executor, phase.name);

    phase.completed = true;
    phase.data = result;
    phase.error = undefined;
    checkpoint.currentPhase = phaseIndex + 1;
    checkpoint.lastUpdated = new Date().toISOString();
    saveCheckpoint(checkpoint);

    return result;
  } catch (error: any) {
    phase.error = error.message;
    checkpoint.lastUpdated = new Date().toISOString();
    saveCheckpoint(checkpoint);

    console.error(`[${phase.name}] Failed after all retries: ${error.message}`);
    return null;
  }
};

export const parseJSONSafely = <T>(text: string, fallback: T): T => {
  if (!text || typeof text !== 'string') return fallback;

  const strategies = [
    () => JSON.parse(text),
    () => JSON.parse(text.trim()),
    () => {
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      }
      return JSON.parse(cleaned);
    },
    () => {
      const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
      throw new Error('No JSON found');
    },
    () => {
      const fixed = text
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
      return JSON.parse(fixed);
    }
  ];

  for (const strategy of strategies) {
    try {
      return strategy();
    } catch {}
  }

  return fallback;
};

export const safeFetchJSON = async <T>(
  url: string,
  options: RequestInit,
  fallback: T,
  timeoutMs: number = 30000
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[safeFetchJSON] HTTP ${response.status} for ${url}`);
      return fallback;
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      console.warn(`[safeFetchJSON] Empty response from ${url}`);
      return fallback;
    }

    return parseJSONSafely(text, fallback);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn(`[safeFetchJSON] Timeout for ${url}`);
    } else {
      console.warn(`[safeFetchJSON] Error: ${error.message}`);
    }
    return fallback;
  }
};

export const getRecoverableCheckpoints = (): GenerationCheckpoint[] => {
  const checkpoints = getCheckpoints();
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;

  return Object.values(checkpoints).filter(cp => {
    const age = now - new Date(cp.lastUpdated).getTime();
    return age < maxAge && cp.currentPhase > 0 && cp.currentPhase < cp.phases.length;
  });
};

export const getCheckpointProgress = (checkpoint: GenerationCheckpoint): number => {
  const completed = checkpoint.phases.filter(p => p.completed).length;
  return Math.round((completed / checkpoint.phases.length) * 100);
};

export const formatCheckpointStatus = (checkpoint: GenerationCheckpoint): string => {
  const progress = getCheckpointProgress(checkpoint);
  const lastPhase = checkpoint.phases[checkpoint.currentPhase - 1];
  const currentPhase = checkpoint.phases[checkpoint.currentPhase];

  if (progress === 100) {
    return 'Complete';
  }

  if (currentPhase?.error) {
    return `Paused at ${currentPhase.name}: ${currentPhase.error}`;
  }

  return `${progress}% - Last: ${lastPhase?.name || 'Starting'}`;
};

export default {
  saveCheckpoint,
  getCheckpoint,
  getCheckpoints,
  clearCheckpoint,
  clearAllCheckpoints,
  createInitialCheckpoint,
  retryWithBackoff,
  safeExecutePhase,
  parseJSONSafely,
  safeFetchJSON,
  getRecoverableCheckpoints,
  getCheckpointProgress,
  formatCheckpointStatus
};
