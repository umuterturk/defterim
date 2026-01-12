import { memo, useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
} from '@mui/material';
import styles from './CreateBookDialog.module.css';

// Static sx objects - hoisted to prevent recreation
const DIALOG_PAPER_SX = {
  borderRadius: 'var(--radius-lg)',
} as const;

const CREATE_BUTTON_SX = {
  bgcolor: 'var(--color-secondary)',
  fontWeight: 600,
  '&:hover': { bgcolor: 'var(--color-secondary-hover)' },
} as const;

interface CreateBookDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}

export const CreateBookDialog = memo(function CreateBookDialog({
  open,
  onClose,
  onCreate,
}: CreateBookDialogProps) {
  const [title, setTitle] = useState('');

  const handleClose = useCallback(() => {
    setTitle('');
    onClose();
  }, [onClose]);

  const handleCreate = useCallback(() => {
    if (!title.trim()) return;
    onCreate(title.trim());
    setTitle('');
  }, [title, onCreate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && title.trim()) {
      handleCreate();
    }
  }, [title, handleCreate]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: DIALOG_PAPER_SX }}
    >
      <DialogTitle className={styles.title}>
        Yeni Kitap Oluştur
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Kitap Adı"
          placeholder="Kitabınıza bir isim verin..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ mt: 1 }}
        />
        <Typography className={styles.description}>
          Kitap oluşturduktan sonra yazılarınızı kitaba ekleyebilir, sıralayabilir ve PDF olarak indirebilirsiniz.
        </Typography>
      </DialogContent>
      <DialogActions className={styles.actions}>
        <Button onClick={handleClose} className={styles.button}>
          İptal
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={!title.trim()}
          className={styles.button}
          sx={CREATE_BUTTON_SX}
        >
          Oluştur
        </Button>
      </DialogActions>
    </Dialog>
  );
});
