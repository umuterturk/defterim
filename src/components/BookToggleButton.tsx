import { memo, useCallback, useState } from 'react';
import { IconButton, Button, Tooltip, Snackbar } from '@mui/material';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import { useBook } from '../contexts/BookContext';

interface BookToggleButtonProps {
  writingId: string;
  /** When true, uses normal flow positioning instead of absolute (for toolbar usage) */
  inToolbar?: boolean;
  /** When true, shows text label alongside the icon */
  showLabel?: boolean;
}

function BookToggleButtonComponent({ writingId, inToolbar = false, showLabel = false }: BookToggleButtonProps) {
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

  const tooltipTitle = isInBook ? 'Kitaptan çıkar' : 'Kitaba ekle';
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

  // Button with label for explicit display (e.g., in editor toolbar)
  if (showLabel) {
    return (
      <>
        <Tooltip title={tooltipTitle} arrow slotProps={tooltipSlotProps}>
          <Button
            onClick={handleToggle}
            variant="outlined"
            size="small"
            startIcon={isInBook ? <RemoveCircleOutlineIcon /> : <LibraryAddIcon />}
            sx={{
              color: isInBook ? '#e57373' : '#4A7C59',
              borderColor: isInBook ? '#e57373' : '#4A7C59',
              bgcolor: isInBook ? 'rgba(229, 115, 115, 0.1)' : 'rgba(74, 124, 89, 0.1)',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              borderWidth: '2px',
              px: 1.5,
              '&:hover': {
                color: isInBook ? '#e53935' : '#3d6b4a',
                borderColor: isInBook ? '#e53935' : '#3d6b4a',
                bgcolor: isInBook ? 'rgba(229, 57, 53, 0.15)' : 'rgba(74, 124, 89, 0.2)',
                borderWidth: '2px',
              },
            }}
          >
            {isInBook ? 'Kitaptan çıkar' : 'Kitaba ekle'}
          </Button>
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

  // Icon-only button (for cards)
  return (
    <>
      <Tooltip title={tooltipTitle} arrow slotProps={tooltipSlotProps}>
        <IconButton
          onClick={handleToggle}
          size="medium"
          sx={{
            // Position absolutely in top-right of card (only when not in toolbar)
            ...(inToolbar ? {} : {
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 1,
            }),
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
