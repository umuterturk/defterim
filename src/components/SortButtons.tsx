import React, { memo, useCallback } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import UpdateIcon from '@mui/icons-material/Update';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import styles from './SortButtons.module.css';

export type SortType = 'alphabetic' | 'lastUpdated' | 'created';

interface SortButtonsProps {
  sortType: SortType;
  sortAscending: boolean;
  onSortChange: (type: SortType) => void;
}

interface SortOption {
  type: SortType;
  label: string;
  icon: React.ReactNode;
}

const sortOptions: SortOption[] = [
  { type: 'alphabetic', label: 'Başlık', icon: <SortByAlphaIcon fontSize="small" /> },
  { type: 'lastUpdated', label: 'Güncelleme', icon: <UpdateIcon fontSize="small" /> },
  { type: 'created', label: 'Oluşturma', icon: <CalendarTodayIcon fontSize="small" /> },
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
