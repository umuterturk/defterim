import React, { memo, useCallback } from 'react';
import { Button, Stack, Typography, Tooltip } from '@mui/material';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import UpdateIcon from '@mui/icons-material/Update';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import StarIcon from '@mui/icons-material/Star';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import styles from './SortButtons.module.css';

export type SortType = 'alphabetic' | 'lastUpdated' | 'created' | 'stars';

// Large tooltip styling for better readability
const tooltipSlotProps = {
  tooltip: {
    sx: {
      fontSize: '1rem',
      fontWeight: 500,
      padding: '8px 14px',
      bgcolor: '#333',
    },
  },
  arrow: {
    sx: {
      color: '#333',
    },
  },
};

interface SortButtonsProps {
  sortType: SortType;
  sortAscending: boolean;
  onSortChange: (type: SortType) => void;
}

interface SortOption {
  type: SortType;
  label: string;
  tooltip: string;
  icon: React.ReactNode;
}

const sortOptions: SortOption[] = [
  { type: 'alphabetic', label: 'Başlık', tooltip: 'Başlığa göre sırala', icon: <SortByAlphaIcon fontSize="small" /> },
  { type: 'lastUpdated', label: 'Güncelleme', tooltip: 'Son güncelleme tarihine göre sırala', icon: <UpdateIcon fontSize="small" /> },
  { type: 'created', label: 'Oluşturma', tooltip: 'Oluşturma tarihine göre sırala', icon: <CalendarTodayIcon fontSize="small" /> },
  { type: 'stars', label: 'Puan', tooltip: 'Puana göre sırala', icon: <StarIcon fontSize="small" sx={{ color: '#FFB800' }} /> },
];

// Individual sort button - memoized for performance
const SortButton = memo(function SortButton({ 
  option, 
  isSelected, 
  sortAscending, 
  onSortChange 
}: { 
  option: SortOption; 
  isSelected: boolean; 
  sortAscending: boolean;
  onSortChange: (type: SortType) => void;
}) {
  const handleClick = useCallback(() => {
    onSortChange(option.type);
  }, [onSortChange, option.type]);

  const ArrowIcon = sortAscending ? ArrowUpwardIcon : ArrowDownwardIcon;
  const buttonClassName = `${styles.button} ${isSelected ? styles.buttonSelected : styles.buttonUnselected}`;

  return (
    <Tooltip title={option.tooltip} arrow slotProps={tooltipSlotProps}>
      <Button
        variant={isSelected ? 'contained' : 'outlined'}
        size="small"
        onClick={handleClick}
        startIcon={option.icon}
        endIcon={isSelected ? <ArrowIcon sx={{ fontSize: '14px !important' }} /> : undefined}
        className={buttonClassName}
      >
        <span className={styles.buttonText}>{option.label}</span>
      </Button>
    </Tooltip>
  );
});

export const SortButtons = memo(function SortButtons({ sortType, sortAscending, onSortChange }: SortButtonsProps) {
  return (
    <Stack direction="row" className={styles.container}>
      <Typography className={styles.label}>
        Sırala:
      </Typography>
      {sortOptions.map((option) => (
        <SortButton
          key={option.type}
          option={option}
          isSelected={sortType === option.type}
          sortAscending={sortAscending}
          onSortChange={onSortChange}
        />
      ))}
    </Stack>
  );
});
