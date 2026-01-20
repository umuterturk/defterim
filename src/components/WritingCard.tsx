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
import StarIcon from '@mui/icons-material/Star';
import type { WritingMetadata } from '../types/writing';

// Turkish labels for star ratings
const STAR_LABELS: Record<number, string> = {
  1: 'Geçer',
  2: 'Orta',
  3: 'İyi',
  4: 'Teşekkür',
  5: 'Takdir',
};

// Large tooltip styling for elderly users
const tooltipSlotProps = {
  tooltip: {
    sx: {
      fontSize: '1rem',
      fontWeight: 500,
      padding: '8px 14px',
      borderRadius: '8px',
      backgroundColor: 'rgba(50, 50, 50, 0.95)',
    },
  },
  arrow: {
    sx: {
      color: 'rgba(50, 50, 50, 0.95)',
    },
  },
};
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
      {/* Book toggle button positioned absolutely - outside CardActionArea to avoid nested buttons */}
      <BookToggleButton writingId={metadata.id} />
      
      <CardActionArea 
        onClick={onTap}
        className={styles.cardActionArea}
      >
        <CardContent className={styles.cardContent}>
          {/* Row 1: Type + Title + Stars */}
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
            {/* Show stars next to title if rating exists */}
            {(metadata.stars ?? 0) > 0 && (
              <Tooltip title={STAR_LABELS[metadata.stars ?? 0]} arrow placement="top" slotProps={tooltipSlotProps}>
                <Box className={styles.starsDisplayInline}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <StarIcon
                      key={star}
                      className={star <= (metadata.stars ?? 0) ? styles.starFilled : styles.starEmpty}
                    />
                  ))}
                </Box>
              </Tooltip>
            )}
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
          <Box className={styles.dateRow}>
            <Typography
              variant="caption"
              className={dateClassName}
            >
              {formatDate(metadata.updatedAt)}
            </Typography>
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
    prev.stars === next.stars &&
    prevProps.onTap === nextProps.onTap &&
    prevProps.isAvailableOffline === nextProps.isAvailableOffline &&
    prevProps.isOnline === nextProps.isOnline
  );
}

export const WritingCard = memo(WritingCardComponent, areEqual);
