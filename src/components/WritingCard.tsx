import { memo, type ReactElement } from 'react';
import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Chip,
  Box,
  Tooltip,
} from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import ArticleIcon from '@mui/icons-material/Article';
import NotesIcon from '@mui/icons-material/Notes';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import type { WritingMetadata, WritingType } from '../types/writing';
import { writingTypeDisplayName } from '../types/writing';

interface WritingCardProps {
  metadata: WritingMetadata;
  onTap: () => void;
  isAvailableOffline?: boolean;
  isOnline?: boolean;
}

const typeIcons: Record<WritingType, ReactElement> = {
  siir: <AutoStoriesIcon fontSize="small" />,
  yazi: <ArticleIcon fontSize="small" />,
  diger: <NotesIcon fontSize="small" />,
};

const typeColors: Record<WritingType, string> = {
  siir: '#7B5EA7',
  yazi: '#4A7C59',
  diger: '#5A8AB5',
};

// Memoized date formatter
const dateFormatCache = new Map<string, string>();

function formatDate(dateString: string): string {
  // Use date part only for caching (ignore time)
  const dateKey = dateString.substring(0, 10);
  
  const cached = dateFormatCache.get(dateKey);
  if (cached) return cached;
  
  const date = new Date(dateString);
  const formatted = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  
  // Limit cache size
  if (dateFormatCache.size > 1000) {
    const firstKey = dateFormatCache.keys().next().value;
    if (firstKey) dateFormatCache.delete(firstKey);
  }
  
  dateFormatCache.set(dateKey, formatted);
  return formatted;
}

function WritingCardComponent({ metadata, onTap, isAvailableOffline = true, isOnline = true }: WritingCardProps) {
  const displayTitle = metadata.title || 'Başlıksız';
  
  // Show grayed out only when offline AND content is not available locally
  const isUnavailable = !isOnline && !isAvailableOffline;

  return (
    <Card
      sx={{
        height: 124, // Fixed height for virtualization (140 - 16 margin)
        mb: 2,
        bgcolor: isUnavailable ? '#F5F5F5' : '#FFFFFF',
        boxShadow: isUnavailable ? '0 1px 4px rgba(0,0,0,0.05)' : '0 2px 8px rgba(0,0,0,0.08)',
        '&:hover': {
          boxShadow: isUnavailable ? '0 1px 4px rgba(0,0,0,0.05)' : '0 4px 16px rgba(0,0,0,0.12)',
        },
        transition: 'box-shadow 0.2s ease, opacity 0.2s ease, background-color 0.2s ease',
        overflow: 'hidden',
        opacity: isUnavailable ? 0.6 : 1,
      }}
    >
      <CardActionArea 
        onClick={onTap}
        sx={{ height: '100%' }}
      >
        <CardContent sx={{ p: 2.5, height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, height: '100%' }}>
            {/* Type chip */}
            <Chip
              icon={typeIcons[metadata.type]}
              label={writingTypeDisplayName[metadata.type]}
              size="small"
              sx={{
                bgcolor: isUnavailable ? '#e0e0e0' : `${typeColors[metadata.type]}15`,
                color: isUnavailable ? '#999' : typeColors[metadata.type],
                fontWeight: 600,
                flexShrink: 0,
                '& .MuiChip-icon': {
                  color: isUnavailable ? '#999' : typeColors[metadata.type],
                },
              }}
            />
            
            {/* Content */}
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography
                  variant="h6"
                  component="h3"
                  sx={{
                    fontWeight: 600,
                    color: isUnavailable ? '#999' : '#2C2C2C',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '1.25rem',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {displayTitle}
                </Typography>
                {isUnavailable && (
                  <Tooltip title="İnternete bağlı değilken kullanılamıyor" arrow>
                    <CloudOffOutlinedIcon 
                      sx={{ 
                        fontSize: 18, 
                        color: '#bbb',
                        flexShrink: 0,
                      }} 
                    />
                  </Tooltip>
                )}
              </Box>
              
              {metadata.preview ? (
                <Typography
                  variant="body2"
                  sx={{
                    color: isUnavailable ? '#aaa' : '#666',
                    mb: 'auto',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.4,
                    fontSize: '1rem',
                  }}
                >
                  {metadata.preview}
                </Typography>
              ) : (
                <Box sx={{ flex: 1 }} />
              )}
              
              <Typography
                variant="caption"
                sx={{ color: isUnavailable ? '#bbb' : '#999', mt: 0.5, display: 'block', fontSize: '0.9rem' }}
              >
                {formatDate(metadata.updatedAt)}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// Deep comparison for memo - only re-render if metadata actually changed
function areEqual(prevProps: WritingCardProps, nextProps: WritingCardProps) {
  const prev = prevProps.metadata;
  const next = nextProps.metadata;
  
  return (
    prev.id === next.id &&
    prev.title === next.title &&
    prev.preview === next.preview &&
    prev.updatedAt === next.updatedAt &&
    prev.type === next.type &&
    prevProps.onTap === nextProps.onTap &&
    prevProps.isAvailableOffline === nextProps.isAvailableOffline &&
    prevProps.isOnline === nextProps.isOnline
  );
}

export const WritingCard = memo(WritingCardComponent, areEqual);
