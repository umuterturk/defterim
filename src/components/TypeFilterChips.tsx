import { memo, useMemo, useCallback, type ReactElement } from 'react';
import { Chip, Stack } from '@mui/material';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import ArticleIcon from '@mui/icons-material/Article';
import type { WritingType, WritingMetadata } from '../types/writing';
import styles from './TypeFilterChips.module.css';

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
    color: '#5A6A7A',
  },
  {
    type: 'siir',
    label: 'Şiirler',
    icon: <AutoStoriesIcon fontSize="small" />,
    color: '#7B5EA7',
  },
  {
    type: 'yazi',
    label: 'Yazılar',
    icon: <ArticleIcon fontSize="small" />,
    color: '#4A7C59',
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
