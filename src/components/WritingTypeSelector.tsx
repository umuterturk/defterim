import { useState, memo, useCallback, type ReactElement } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Box,
} from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import ArticleIcon from '@mui/icons-material/Article';
import NotesIcon from '@mui/icons-material/Notes';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import type { WritingType } from '../types/writing';
import { writingTypeDisplayName } from '../types/writing';

interface WritingTypeSelectorProps {
  currentType: WritingType;
  onTypeChange: (type: WritingType) => void;
}

const typeConfig: Record<WritingType, { icon: ReactElement; color: string }> = {
  siir: { icon: <AutoStoriesIcon fontSize="small" />, color: '#7B5EA7' },
  yazi: { icon: <ArticleIcon fontSize="small" />, color: '#4A7C59' },
  diger: { icon: <NotesIcon fontSize="small" />, color: '#5A8AB5' },
};

// Pre-compute the type keys to avoid creating new arrays on each render
const typeKeys = Object.keys(typeConfig) as WritingType[];

export const WritingTypeSelector = memo(function WritingTypeSelector({
  currentType,
  onTypeChange,
}: WritingTypeSelectorProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleSelect = useCallback((type: WritingType) => {
    onTypeChange(type);
    setAnchorEl(null);
  }, [onTypeChange]);

  const currentConfig = typeConfig[currentType];

  return (
    <>
      <Button
        onClick={handleClick}
        sx={{
          bgcolor: `${currentConfig.color}15`,
          color: currentConfig.color,
          borderRadius: '8px',
          px: 1.5,
          py: 0.75,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '14px',
          border: `1px solid ${currentConfig.color}30`,
          '&:hover': {
            bgcolor: `${currentConfig.color}25`,
          },
        }}
        startIcon={currentConfig.icon}
        endIcon={<ArrowDropDownIcon />}
      >
        {writingTypeDisplayName[currentType]}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { borderRadius: '12px', minWidth: 150 },
        }}
      >
        {typeKeys.map((type) => {
          const config = typeConfig[type];
          const isSelected = type === currentType;

          return (
            <MenuItem
              key={type}
              onClick={() => handleSelect(type)}
              sx={{
                color: isSelected ? config.color : '#666',
              }}
            >
              <ListItemIcon sx={{ color: isSelected ? config.color : '#666' }}>
                {config.icon}
              </ListItemIcon>
              <ListItemText
                primary={writingTypeDisplayName[type]}
                primaryTypographyProps={{
                  fontWeight: isSelected ? 600 : 400,
                }}
              />
              {isSelected && (
                <Box sx={{ ml: 1, color: config.color }}>
                  <CheckIcon fontSize="small" />
                </Box>
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
});
