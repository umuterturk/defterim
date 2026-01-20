import { memo, useCallback, useState } from 'react';
import {
  IconButton,
  Button,
  Tooltip,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import { useBook } from '../contexts/BookContext';

interface BookToggleButtonProps {
  writingId: string;
  /** Writing title for confirmation dialog */
  writingTitle?: string;
  /** When true, uses normal flow positioning instead of absolute (for toolbar usage) */
  inToolbar?: boolean;
  /** When true, shows text label alongside the icon */
  showLabel?: boolean;
}

function BookToggleButtonComponent({ writingId, writingTitle, inToolbar = false, showLabel = false }: BookToggleButtonProps) {
  const { state, addWritingToBook, removeWritingFromBook, isWritingInActiveBook } = useBook();
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const isInBook = isWritingInActiveBook(writingId);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    if (isInBook) {
      // Show confirmation dialog before removing
      setShowRemoveDialog(true);
    } else {
      // Show confirmation dialog before adding
      setShowAddDialog(true);
    }
  }, [isInBook]);

  const handleConfirmAdd = useCallback(async () => {
    const bookTitle = state.activeBook?.title || 'Kitap';
    await addWritingToBook(writingId);
    setShowAddDialog(false);
    setToastMessage(`"${bookTitle}" kitabına eklendi`);
    setToastOpen(true);
  }, [writingId, addWritingToBook, state.activeBook?.title]);

  const handleCancelAdd = useCallback(() => {
    setShowAddDialog(false);
  }, []);

  const handleConfirmRemove = useCallback(async () => {
    const bookTitle = state.activeBook?.title || 'Kitap';
    await removeWritingFromBook(writingId);
    setShowRemoveDialog(false);
    setToastMessage(`"${bookTitle}" kitabından çıkarıldı`);
    setToastOpen(true);
  }, [writingId, removeWritingFromBook, state.activeBook?.title]);

  const handleCancelRemove = useCallback(() => {
    setShowRemoveDialog(false);
  }, []);

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

  const bookTitle = state.activeBook?.title || 'Kitap';

  // Shared snackbar component
  const snackbar = (
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
  );

  // Add confirmation dialog
  const addDialog = (
    <Dialog
      open={showAddDialog}
      onClose={handleCancelAdd}
      PaperProps={{ sx: { borderRadius: '12px' } }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '20px' }}>
        Kitaba eklensin mi?
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: '16px' }}>
          <strong>"{writingTitle || 'Bu yazı'}"</strong> yazısını <strong>"{bookTitle}"</strong> kitabına eklemek istediğinizden emin misiniz?
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCancelAdd} sx={{ fontSize: '16px' }}>
          İptal
        </Button>
        <Button
          onClick={handleConfirmAdd}
          color="primary"
          sx={{ fontWeight: 600, fontSize: '16px', color: '#4A7C59' }}
        >
          Ekle
        </Button>
      </DialogActions>
    </Dialog>
  );

  // Remove confirmation dialog
  const removeDialog = (
    <Dialog
      open={showRemoveDialog}
      onClose={handleCancelRemove}
      PaperProps={{ sx: { borderRadius: '12px' } }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '20px' }}>
        Kitaptan çıkarılsın mı?
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: '16px' }}>
          <strong>"{writingTitle || 'Bu yazı'}"</strong> yazısını <strong>"{bookTitle}"</strong> kitabından çıkarmak istediğinizden emin misiniz?
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCancelRemove} sx={{ fontSize: '16px' }}>
          İptal
        </Button>
        <Button
          onClick={handleConfirmRemove}
          color="error"
          sx={{ fontWeight: 600, fontSize: '16px' }}
        >
          Çıkar
        </Button>
      </DialogActions>
    </Dialog>
  );

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
        {snackbar}
        {addDialog}
        {removeDialog}
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
      {snackbar}
      {addDialog}
      {removeDialog}
    </>
  );
}

export const BookToggleButton = memo(BookToggleButtonComponent);
