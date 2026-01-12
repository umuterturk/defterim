import { memo, useMemo, useCallback, type ReactElement } from 'react';
import { Chip, Stack } from '@mui/material';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import type { WritingType, WritingMetadata } from '../types/writing';
import { WRITING_TYPE_ICONS, WRITING_TYPE_COLORS } from '../config/writingTypes';
import styles from './TypeFilterChips.module.css';

// Color for "All" filter (neutral gray, not in WRITING_TYPE_COLORS)
const ALL_FILTER_COLOR = '#5A6A7A';

interface TypeFilterChipsProps {
  selectedType: WritingType | null;
  onTypeChange: (type: WritingType | null) => void;
  writings: WritingMetadata[];
}

interface FilterOption {
  type: WritingType | null;
  label: string;
  icon: ReactElement;
  color: string;
}

const filterOptions: FilterOption[] = [
  {
    type: null,
    label: 'Hepsi',
    icon: <LibraryBooksIcon fontSize="small" />,
    color: ALL_FILTER_COLOR,
  },
  {
    type: 'siir',
    label: 'Şiirler',
    icon: WRITING_TYPE_ICONS.siir,
    color: WRITING_TYPE_COLORS.siir,
  },
  {
    type: 'yazi',
    label: 'Yazılar',
    icon: WRITING_TYPE_ICONS.yazi,
    color: WRITING_TYPE_COLORS.yazi,
  },
];

// Individual filter chip - memoized for performance
const FilterChip = memo(function FilterChip({
  option,
  isSelected,
  count,
  onTypeChange,
}: {
  option: FilterOption;
  isSelected: boolean;
  count: number;
  onTypeChange: (type: WritingType | null) => void;
}) {
  const handleClick = useCallback(() => {
    onTypeChange(option.type);
  }, [onTypeChange, option.type]);

  const chipClassName = `${styles.chip} ${isSelected ? styles.chipSelected : styles.chipUnselected}`;

  return (
    <Chip
      icon={option.icon}
      label={
        <>
          <span className={styles.label}>{option.label}</span>
          <span className={styles.count}> ({count})</span>
        </>
      }
      onClick={handleClick}
      variant={isSelected ? 'filled' : 'outlined'}
      className={chipClassName}
      sx={{
        bgcolor: isSelected ? `${option.color}20` : 'transparent',
        color: `${option.color} !important`,
        borderColor: isSelected ? option.color : `${option.color}80`,
        borderWidth: isSelected ? 2 : 1.5,
        '& .MuiChip-label': {
          color: option.color,
        },
        '& .MuiChip-icon': {
          color: `${option.color} !important`,
        },
        '&:hover': {
          bgcolor: `${option.color}15`,
          borderColor: option.color,
        },
      }}
    />
  );
});

export const TypeFilterChips = memo(function TypeFilterChips({
  selectedType,
  onTypeChange,
  writings,
}: TypeFilterChipsProps) {
  // Memoize counts calculation - only recalculate when writings change
  const counts = useMemo(() => {
    const result: Record<string, number> = {
      all: writings.length,
      siir: 0,
      yazi: 0,
      diger: 0,
    };
    
    for (const w of writings) {
      result[w.type] = (result[w.type] || 0) + 1;
    }
    
    return result;
  }, [writings]);

  return (
    <Stack direction="row" className={styles.container}>
      {filterOptions.map((option) => (
        <FilterChip
          key={option.type ?? 'all'}
          option={option}
          isSelected={selectedType === option.type}
          count={counts[option.type ?? 'all']}
          onTypeChange={onTypeChange}
        />
      ))}
    </Stack>
  );
});
