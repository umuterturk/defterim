import { memo, useCallback } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { useBook } from '../contexts/BookContext';

interface BookToggleButtonProps {
  writingId: string;
  size?: 'small' | 'medium';
}

function BookToggleButtonComponent({ writingId, size = 'small' }: BookToggleButtonProps) {
  const { state, addWritingToBook, removeWritingFromBook, isWritingInActiveBook } = useBook();

  const isInBook = isWritingInActiveBook(writingId);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (isInBook) {
      removeWritingFromBook(writingId);
    } else {
      addWritingToBook(writingId);
    }
  }, [isInBook, writingId, addWritingToBook, removeWritingFromBook]);

  // Don't show if no active book
  if (!state.activeBook) {
    return null;
  }

  return (
    <Tooltip 
      title={isInBook ? 'Kitaptan çıkar' : 'Kitaba ekle'} 
      arrow
    >
      <IconButton
        onClick={handleToggle}
        size={size}
        sx={{
          color: isInBook ? '#7B5EA7' : '#999',
          '&:hover': {
            color: isInBook ? '#6b4e97' : '#7B5EA7',
            bgcolor: 'rgba(123, 94, 167, 0.08)',
          },
        }}
      >
        {isInBook ? (
          <MenuBookIcon fontSize={size} />
        ) : (
          <MenuBookOutlinedIcon fontSize={size} />
        )}
      </IconButton>
    </Tooltip>
  );
}

export const BookToggleButton = memo(BookToggleButtonComponent);
