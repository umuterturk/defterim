import { memo, useCallback, useState } from 'react';
import { IconButton, Tooltip, Snackbar } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { useBook } from '../contexts/BookContext';

interface BookToggleButtonProps {
  writingId: string;
  size?: 'small' | 'medium';
}

function BookToggleButtonComponent({ writingId, size = 'small' }: BookToggleButtonProps) {
  const { state, addWritingToBook, removeWritingFromBook, isWritingInActiveBook } = useBook();
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const isInBook = isWritingInActiveBook(writingId);

  const handleToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    const bookTitle = state.activeBook?.title || 'Kitap';
    
    if (isInBook) {
      await removeWritingFromBook(writingId);
      setToastMessage(`"${bookTitle}" kitabından çıkarıldı`);
    } else {
      await addWritingToBook(writingId);
      setToastMessage(`"${bookTitle}" kitabına eklendi`);
    }
    setToastOpen(true);
  }, [isInBook, writingId, addWritingToBook, removeWritingFromBook, state.activeBook?.title]);

  const handleCloseToast = useCallback(() => {
    setToastOpen(false);
  }, []);

  // Don't show if no active book
  if (!state.activeBook) {
    return null;
  }

  return (
    <>
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
      <Snackbar
        open={toastOpen}
        autoHideDuration={2000}
        onClose={handleCloseToast}
        message={toastMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiSnackbarContent-root': {
            bgcolor: '#333',
            color: 'white',
            borderRadius: 'var(--radius-md)',
            fontWeight: 500,
            fontSize: 'var(--font-size-sm)',
          },
        }}
      />
    </>
  );
}

export const BookToggleButton = memo(BookToggleButtonComponent);
