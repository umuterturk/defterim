import { memo } from 'react';
import {
  Dialog,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import styles from './PdfGeneratingDialog.module.css';

// Static sx objects - hoisted to prevent recreation
const DIALOG_PAPER_SX = {
  borderRadius: 'var(--radius-xl)',
  p: 4,
  textAlign: 'center',
  minWidth: 320,
  bgcolor: 'white',
} as const;

interface PdfGeneratingDialogProps {
  open: boolean;
}

export const PdfGeneratingDialog = memo(function PdfGeneratingDialog({
  open,
}: PdfGeneratingDialogProps) {
  return (
    <Dialog
      open={open}
      PaperProps={{ sx: DIALOG_PAPER_SX }}
    >
      <Box className={styles.content}>
        <CircularProgress 
          size={64} 
          thickness={4}
          className={styles.spinner}
        />
        <Typography variant="h5" className={styles.title}>
          Kitabınız Basılıyor
        </Typography>
        <Typography className={styles.subtitle}>
          Lütfen bekleyin...
        </Typography>
      </Box>
    </Dialog>
  );
});
