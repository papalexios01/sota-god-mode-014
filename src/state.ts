// =============================================================================
// SOTA WP CONTENT OPTIMIZER PRO - STATE MANAGEMENT v12.0
// Centralized State with Reducer Pattern
// =============================================================================

import { ContentItem, ItemsAction } from './types';
import { generateId } from './utils';

// ==================== ITEMS REDUCER ====================

export const itemsReducer = (
  state: ContentItem[],
  action: ItemsAction
): ContentItem[] => {
  switch (action.type) {
    case 'SET_ITEMS': {
      const newItems: ContentItem[] = action.payload.map(partialItem => ({
        id: partialItem.id || generateId(),
        title: partialItem.title || 'Untitled',
        type: partialItem.type || 'standard',
        originalUrl: partialItem.originalUrl,
        status: partialItem.status || 'idle',
        statusText: partialItem.statusText || 'Ready',
        generatedContent: partialItem.generatedContent || null,
        crawledContent: partialItem.crawledContent || null,
        analysis: partialItem.analysis || null,
      }));
      return newItems;
    }

    case 'UPDATE_STATUS': {
      return state.map(item =>
        item.id === action.payload.id
          ? {
              ...item,
              status: action.payload.status,
              statusText: action.payload.statusText,
            }
          : item
      );
    }

    case 'SET_CONTENT': {
      return state.map(item =>
        item.id === action.payload.id
          ? {
              ...item,
              generatedContent: action.payload.content,
              status: 'done' as const,
              statusText: 'Complete',
            }
          : item
      );
    }

    case 'SET_CRAWLED_CONTENT': {
      return state.map(item =>
        item.id === action.payload.id
          ? {
              ...item,
              crawledContent: action.payload.content,
              title: item.title === 'Refreshing...' 
                ? extractTitleFromContent(action.payload.content) || item.title
                : item.title,
            }
          : item
      );
    }

    case 'REMOVE_ITEM': {
      return state.filter(item => item.id !== action.payload);
    }

    case 'CLEAR_ALL': {
      return [];
    }

    default:
      return state;
  }
};

// ==================== HELPER FUNCTIONS ====================

const extractTitleFromContent = (content: string): string | null => {
  const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  
  return null;
};

// ==================== INITIAL STATE LOADERS ====================

export const loadItemsFromStorage = (): ContentItem[] => {
  try {
    const saved = localStorage.getItem('sota_items');
    if (saved) {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('[State] Failed to load items from storage:', e);
    localStorage.removeItem('sota_items');
  }
  return [];
};

export const saveItemsToStorage = (items: ContentItem[]): void => {
  try {
    // Only save essential data, not full content to avoid quota issues
    const minimal = items.map(item => ({
      id: item.id,
      title: item.title,
      type: item.type,
      originalUrl: item.originalUrl,
      status: item.status,
      statusText: item.statusText,
      // Skip generatedContent and crawledContent to save space
    }));
    localStorage.setItem('sota_items', JSON.stringify(minimal));
  } catch (e) {
    console.error('[State] Failed to save items to storage:', e);
  }
};

// ==================== SELECTORS ====================

export const selectItemById = (
  items: ContentItem[],
  id: string
): ContentItem | undefined => {
  return items.find(item => item.id === id);
};

export const selectItemsByStatus = (
  items: ContentItem[],
  status: ContentItem['status']
): ContentItem[] => {
  return items.filter(item => item.status === status);
};

export const selectItemsByType = (
  items: ContentItem[],
  type: ContentItem['type']
): ContentItem[] => {
  return items.filter(item => item.type === type);
};

export const selectCompletedItems = (items: ContentItem[]): ContentItem[] => {
  return items.filter(
    item => item.status === 'done' && item.generatedContent !== null
  );
};

export const selectPendingItems = (items: ContentItem[]): ContentItem[] => {
  return items.filter(
    item => item.status === 'idle' || item.status === 'generating'
  );
};

// ==================== COMPUTED VALUES ====================

export const computeProgress = (items: ContentItem[]): { current: number; total: number } => {
  const total = items.length;
  const completed = items.filter(
    item => item.status === 'done' || item.status === 'error'
  ).length;
  return { current: completed, total };
};

export const computeStats = (items: ContentItem[]) => {
  return {
    total: items.length,
    idle: items.filter(i => i.status === 'idle').length,
    generating: items.filter(i => i.status === 'generating').length,
    done: items.filter(i => i.status === 'done').length,
    error: items.filter(i => i.status === 'error').length,
    publishing: items.filter(i => i.status === 'publishing').length,
  };
};

