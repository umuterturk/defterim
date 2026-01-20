import { memo, useCallback } from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';

interface StarRatingProps {
  value: number; // 0-5
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const STAR_COLORS = {
  filled: '#FFB800', // Golden yellow
  empty: '#D0D0D0',
  hover: '#FFC933',
};

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

function StarRatingComponent({
  value,
  onChange,
  readonly = false,
  size = 'medium',
  showLabel = false,
}: StarRatingProps) {
  // Size configurations - larger for elderly users
  const sizeConfig = {
    small: { iconSize: 20, gap: 0.25, buttonPadding: 0.25 },
    medium: { iconSize: 32, gap: 0.5, buttonPadding: 0.5 },
    large: { iconSize: 44, gap: 0.75, buttonPadding: 0.75 },
  };

  const config = sizeConfig[size];

  const handleClick = useCallback(
    (star: number) => {
      if (readonly || !onChange) return;
      // If clicking the same star, toggle it off (set to 0)
      // Otherwise set to the clicked star value
      onChange(value === star ? 0 : star);
    },
    [value, onChange, readonly]
  );

  const stars = [1, 2, 3, 4, 5];

  if (readonly) {
    // Read-only compact display for list view
    return (
      <Tooltip title={value > 0 ? STAR_LABELS[value] : ''} arrow placement="top" slotProps={tooltipSlotProps}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: config.gap,
          }}
        >
          {stars.map((star) => (
            <Box
              key={star}
              sx={{
                color: star <= value ? STAR_COLORS.filled : STAR_COLORS.empty,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {star <= value ? (
                <StarIcon sx={{ fontSize: config.iconSize }} />
              ) : (
                <StarBorderIcon sx={{ fontSize: config.iconSize }} />
              )}
            </Box>
          ))}
          {showLabel && value > 0 && (
            <Typography
              variant="body2"
              sx={{
                ml: 0.5,
                color: '#666',
                fontWeight: 500,
                fontSize: size === 'small' ? '0.75rem' : '0.875rem',
              }}
            >
              ({STAR_LABELS[value]})
            </Typography>
          )}
        </Box>
      </Tooltip>
    );
  }

  // Interactive version for editing
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: config.gap,
      }}
    >
      {showLabel && (
        <Typography
          variant="body2"
          sx={{
            mr: 1,
            color: '#666',
            fontWeight: 500,
            fontSize: '1rem',
            whiteSpace: 'nowrap',
          }}
        >
          Puan:
        </Typography>
      )}
      {stars.map((star) => (
        <Tooltip key={star} title={STAR_LABELS[star]} arrow placement="top" slotProps={tooltipSlotProps}>
          <IconButton
            onClick={() => handleClick(star)}
            sx={{
              padding: config.buttonPadding,
              color: star <= value ? STAR_COLORS.filled : STAR_COLORS.empty,
              transition: 'all 0.15s ease',
              '&:hover': {
                color: star <= value ? STAR_COLORS.filled : STAR_COLORS.hover,
                transform: 'scale(1.1)',
                backgroundColor: 'rgba(255, 184, 0, 0.1)',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
              // Ensure good touch targets for elderly users
              minWidth: Math.max(44, config.iconSize + 8),
              minHeight: Math.max(44, config.iconSize + 8),
            }}
            aria-label={`${star} yıldız - ${STAR_LABELS[star]}`}
          >
            {star <= value ? (
              <StarIcon sx={{ fontSize: config.iconSize }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: config.iconSize }} />
            )}
          </IconButton>
        </Tooltip>
      ))}
      {value > 0 && (
        <Typography
          variant="body2"
          sx={{
            ml: 0.5,
            color: STAR_COLORS.filled,
            fontWeight: 600,
            fontSize: '1rem',
          }}
        >
          {STAR_LABELS[value]}
        </Typography>
      )}
    </Box>
  );
}

// Memoize to prevent unnecessary re-renders
export const StarRating = memo(StarRatingComponent);
