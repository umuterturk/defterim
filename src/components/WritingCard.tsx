import { memo } from 'react';
import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Chip,
  Box,
  Tooltip,
} from '@mui/material';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import type { WritingMetadata } from '../types/writing';
import { writingTypeDisplayName } from '../types/writing';
import { WRITING_TYPE_ICONS, WRITING_TYPE_COLORS } from '../config/writingTypes';
import { BookToggleButton } from './BookToggleButton';
import styles from './WritingCard.module.css';

interface WritingCardProps {
  metadata: WritingMetadata;
  onTap: () => void;
  isAvailableOffline?: boolean;
  isOnline?: boolean;
}

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

  const cardClassName = `${styles.card} ${isUnavailable ? styles.cardUnavailable : ''}`;
  const typeChipClassName = `${styles.typeChip} ${isUnavailable ? styles.typeChipUnavailable : ''}`;
  const titleClassName = `${styles.title} ${isUnavailable ? styles.titleUnavailable : ''}`;
  const previewClassName = `${styles.preview} ${isUnavailable ? styles.previewUnavailable : ''}`;
  const dateClassName = `${styles.date} ${isUnavailable ? styles.dateUnavailable : ''}`;
  
  const chipColor = isUnavailable ? '#999' : WRITING_TYPE_COLORS[metadata.type];

  return (
    <Card className={cardClassName}>
      <CardActionArea 
        onClick={onTap}
        className={styles.cardActionArea}
      >
        <CardContent className={styles.cardContent}>
          {/* Row 1: Type + Title */}
          <Box className={styles.titleRow}>
            <Chip
              icon={WRITING_TYPE_ICONS[metadata.type]}
              label={writingTypeDisplayName[metadata.type]}
              size="small"
              className={typeChipClassName}
              sx={{
                bgcolor: `${chipColor}15`,
                color: chipColor,
                borderColor: chipColor,
                border: `1.5px solid ${chipColor}`,
                '& .MuiChip-label': {
                  color: chipColor,
                },
                '& .MuiChip-icon': {
                  color: `${chipColor} !important`,
                },
              }}
            />
            <Typography
              variant="h6"
              component="h3"
              className={titleClassName}
            >
              {displayTitle}
            </Typography>
            {/* Book toggle button - only shows when there's an active book */}
            <BookToggleButton writingId={metadata.id} />
            {isUnavailable && (
              <Tooltip title="İnternete bağlı değilken kullanılamıyor" arrow>
                <CloudOffOutlinedIcon className={styles.cloudIcon} />
              </Tooltip>
            )}
          </Box>
          
          {/* Row 2: Preview */}
          {metadata.preview ? (
            <Typography
              variant="body2"
              className={previewClassName}
            >
              {metadata.preview}
            </Typography>
          ) : (
            <Box className={styles.previewPlaceholder} />
          )}
          
          {/* Row 3: Date */}
          <Typography
            variant="caption"
            className={dateClassName}
          >
            {formatDate(metadata.updatedAt)}
          </Typography>
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
