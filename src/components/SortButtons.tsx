import React, { memo, useCallback } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import UpdateIcon from '@mui/icons-material/Update';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

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

  return (
    <Button
      variant={isSelected ? 'contained' : 'outlined'}
      size="small"
      onClick={handleClick}
      startIcon={option.icon}
      endIcon={isSelected ? <ArrowIcon sx={{ fontSize: '16px !important' }} /> : undefined}
      sx={{
        bgcolor: isSelected ? '#4A7C59' : 'white',
        color: isSelected ? 'white' : '#666',
        borderColor: isSelected ? '#4A7C59' : '#ddd',
        borderRadius: '20px',
        textTransform: 'none',
        fontWeight: isSelected ? 600 : 500,
        px: 2,
        '&:hover': {
          bgcolor: isSelected ? '#3d6b4a' : '#f5f5f5',
          borderColor: isSelected ? '#3d6b4a' : '#ccc',
        },
      }}
    >
      {option.label}
    </Button>
  );
});

export const SortButtons = memo(function SortButtons({ sortType, sortAscending, onSortChange }: SortButtonsProps) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
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
