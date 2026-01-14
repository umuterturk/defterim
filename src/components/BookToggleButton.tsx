import { memo, useCallback, useState } from 'react';
import { IconButton, Tooltip, Snackbar } from '@mui/material';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import { useBook } from '../contexts/BookContext';

interface BookToggleButtonProps {
  writingId: string;
}

function BookToggleButtonComponent({ writingId }: BookToggleButtonProps) {
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
        slotProps={{
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
        }}
      >
        <IconButton
          onClick={handleToggle}
          size="medium"
          sx={{
            // Position absolutely in top-right of card
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 1,
            color: isInBook ? '#e57373' : '#4A7C59',
            padding: '8px',
            borderRadius: '8px',
            bgcolor: isInBook ? 'rgba(229, 115, 115, 0.1)' : 'rgba(74, 124, 89, 0.1)',
            border: isInBook ? '2px solid #e57373' : '2px solid #4A7C59',
            transition: 'all 0.25s ease-in-out',
            '&:hover': {
              color: isInBook ? '#e53935' : '#3d6b4a',
              bgcolor: isInBook ? 'rgba(229, 57, 53, 0.15)' : 'rgba(74, 124, 89, 0.2)',
              transform: 'scale(1.1)',
            },
            '& .MuiSvgIcon-root': {
              fontSize: '1.25rem',
            },
          }}
        >
          {isInBook ? (
            <RemoveCircleOutlineIcon />
          ) : (
            <LibraryAddIcon />
          )}
        </IconButton>
      </Tooltip>
      <Snackbar
        open={toastOpen}
        autoHideDuration={5000}
        onClose={handleCloseToast}
        message={toastMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiSnackbarContent-root': {
            bgcolor: '#333',
            color: 'white',
            borderRadius: 'var(--radius-md)',
            fontWeight: 500,
            fontSize: 'var(--font-size-md)',
            padding: '10px 20px',
          },
        }}
      />
    </>
  );
}

export const BookToggleButton = memo(BookToggleButtonComponent);
