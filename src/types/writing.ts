// Writing types matching Flutter app

export type WritingType = 'siir' | 'yazi' | 'diger';

export interface Writing {
  id: string;
  title: string;
  body: string;
  footer: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  isSynced: boolean;
  isBold: boolean;
  textAlign: 'left' | 'center' | 'right';
  deletedAt?: string; // Soft-delete timestamp
  type: WritingType;
  stars?: number; // 0-5 star rating (0 = no rating)
}

export interface WritingMetadata {
  id: string;
  title: string;
  preview: string; // First 100 chars of body
  createdAt: string;
  updatedAt: string;
  isSynced: boolean;
  deletedAt?: string;
  type: WritingType;
  stars?: number; // 0-5 star rating (0 = no rating)
}

export interface MetadataIndex {
  version: number;
  lastSyncTime?: string;
  writings: WritingMetadata[];
}

// Current metadata schema version - increment when structure changes
export const METADATA_INDEX_VERSION = 3;

// Helper functions
export const writingTypeDisplayName: Record<WritingType, string> = {
  siir: 'Şiir',
  yazi: 'Yazı',
  diger: 'Diğer',
};

export function createWriting(params: {
  title?: string;
  body?: string;
  footer?: string;
  type?: WritingType;
  isBold?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  stars?: number;
}): Writing {
  const now = new Date().toISOString();
  return {
    id: Date.now().toString(),
    title: params.title ?? '',
    body: params.body ?? '',
    footer: params.footer ?? '',
    createdAt: now,
    updatedAt: now,
    isSynced: false,
    isBold: params.isBold ?? false,
    textAlign: params.textAlign ?? 'left',
    type: params.type ?? 'siir',
    stars: params.stars ?? 0,
  };
}

export function generatePreview(body: string): string {
  if (!body) return '';
  
  // Strip HTML tags and clean up
  const preview = body
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  
  return preview.length > 100 ? `${preview.substring(0, 100)}...` : preview;
}

export function metadataFromWriting(writing: Writing): WritingMetadata {
  return {
    id: writing.id,
    title: writing.title,
    preview: generatePreview(writing.body),
    createdAt: writing.createdAt,
    updatedAt: writing.updatedAt,
    isSynced: writing.isSynced,
    deletedAt: writing.deletedAt,
    type: writing.type,
    stars: writing.stars ?? 0,
  };
}

export function isDeleted(item: Writing | WritingMetadata): boolean {
  return item.deletedAt !== undefined && item.deletedAt !== null;
}

/**
 * Check if a writing is valid for saving.
 * A writing must have either a non-empty title OR non-empty body (content) to be saved.
 */
export function isValidForSave(writing: Writing): boolean {
  return writing.title.trim().length > 0 || writing.body.trim().length > 0;
}
