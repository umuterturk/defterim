import type { ReactElement } from 'react';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import ArticleIcon from '@mui/icons-material/Article';
import NotesIcon from '@mui/icons-material/Notes';
import type { WritingType } from '../types/writing';

// Centralized writing type configuration
// Hex colors for runtime manipulation (e.g., adding alpha channel)
// These should match the CSS variables in index.css
export const WRITING_TYPE_COLORS: Record<WritingType, string> = {
  siir: '#7B5EA7',   // Purple - matches var(--color-secondary)
  yazi: '#4A7C59',   // Green - matches var(--color-primary)
  diger: '#5A8AB5',  // Blue - matches var(--color-accent)
};

// Icon components for each writing type
export const WRITING_TYPE_ICONS: Record<WritingType, ReactElement> = {
  siir: <AutoStoriesIcon fontSize="small" />,
  yazi: <ArticleIcon fontSize="small" />,
  diger: <NotesIcon fontSize="small" />,
};

// Display names for each writing type (Turkish)
export const WRITING_TYPE_LABELS: Record<WritingType, string> = {
  siir: 'Şiir',
  yazi: 'Yazı',
  diger: 'Diğer',
};
