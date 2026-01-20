import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Box,
  IconButton,
  Tooltip,
  Popover,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SettingsIcon from '@mui/icons-material/Settings';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { diffWords } from 'diff';
import {
  correctWriting,
  hasApiKey,
  getApiKey,
  setApiKey,
  removeApiKey,
  type AiCorrectionResult,
} from '../services/aiService';
import styles from './AiCorrectionDialog.module.css';

// Static sx objects
const DIALOG_PAPER_SX = {
  borderRadius: 'var(--radius-lg)',
  maxWidth: 800,
  width: '100%',
} as const;

const ACCEPT_BUTTON_SX = {
  bgcolor: 'var(--color-primary)',
  fontWeight: 600,
  '&:hover': { bgcolor: 'var(--color-primary-hover)' },
} as const;

const REJECT_BUTTON_SX = {
  color: 'var(--color-text-secondary)',
  fontWeight: 500,
} as const;

interface AiCorrectionDialogProps {
  open: boolean;
  onClose: () => void;
  onAccept: (correctedText: string) => void;
  originalText: string;
}

type DialogState = 'loading' | 'result' | 'error' | 'api-key-required' | 'no-changes';

export const AiCorrectionDialog = memo(function AiCorrectionDialog({
  open,
  onClose,
  onAccept,
  originalText,
}: AiCorrectionDialogProps) {
  const [state, setState] = useState<DialogState>(hasApiKey() ? 'loading' : 'api-key-required');
  const [correctedText, setCorrectedText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);

  // Loading messages rotation
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const loadingMessages = useMemo(() => [
    'Yazınız pırıl pırıl yapılıyor...',
    'Hatalar ayıklanıyor...',
    'Kelimeler düzenleniyor...',
    'Noktalama işaretleri kontrol ediliyor...',
    'Son rötuşlar yapılıyor...',
  ], []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state === 'loading' && open) {
      interval = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
      // Reset index when state changes away from loading
      if (state !== 'loading') {
        setLoadingMessageIndex(0);
      }
    };
  }, [state, open, loadingMessages]);

  // Popover state for word differences
  const [popoverAnchorEl, setPopoverAnchorEl] = useState<HTMLElement | null>(null);
  const [popoverContent, setPopoverContent] = useState<{ old: string; new: string } | null>(null);

  // Run correction when dialog opens
  useEffect(() => {
    if (!open) return;

    // Only start correction if we have a key and are in loading state
    if (state !== 'loading' || !hasApiKey()) return;

    correctWriting(originalText).then((result: AiCorrectionResult) => {
      if (result.success && result.correctedText) {
        if (result.correctedText.trim() === originalText.trim()) {
          setState('no-changes');
        } else {
          setCorrectedText(result.correctedText);
          setState('result');
        }
      } else {
        setErrorMessage(result.error || 'Bilinmeyen hata');
        if (result.error?.includes('API anahtarı')) {
          setState('api-key-required');
          setApiKeyInput(getApiKey() || '');
        } else {
          setState('error');
        }
      }
    });
  }, [open, originalText]);

  const handleClose = useCallback(() => {
    onClose();
    // Reset state after dialog closes to avoid visual jumps
    setTimeout(() => {
      setCorrectedText('');
      setErrorMessage('');
      setShowApiKeySettings(false);
      setState(hasApiKey() ? 'loading' : 'api-key-required');
    }, 300);
  }, [onClose]);

  const handleAccept = useCallback(() => {
    if (correctedText) {
      onAccept(correctedText);
    }
    handleClose();
  }, [correctedText, onAccept, handleClose]);

  const handleSaveApiKey = useCallback(() => {
    if (!apiKeyInput.trim()) return;
    setApiKey(apiKeyInput.trim());
    
    setState('loading');
    correctWriting(originalText).then((result: AiCorrectionResult) => {
      if (result.success && result.correctedText) {
        if (result.correctedText.trim() === originalText.trim()) {
          setState('no-changes');
        } else {
          setCorrectedText(result.correctedText);
          setState('result');
        }
      } else {
        setErrorMessage(result.error || 'Bilinmeyen hata');
        if (result.error?.includes('API anahtarı')) {
          setState('api-key-required');
        } else {
          setState('error');
        }
      }
    });
  }, [apiKeyInput, originalText]);

  const handleRemoveApiKey = useCallback(() => {
    removeApiKey();
    setState('api-key-required');
    setApiKeyInput('');
  }, []);

  const handleRetry = useCallback(() => {
    setState('loading');
    correctWriting(originalText).then((result: AiCorrectionResult) => {
      if (result.success && result.correctedText) {
        if (result.correctedText.trim() === originalText.trim()) {
          setState('no-changes');
        } else {
          setCorrectedText(result.correctedText);
          setState('result');
        }
      } else {
        setErrorMessage(result.error || 'Bilinmeyen hata');
        setState('error');
      }
    });
  }, [originalText]);

  const handleShowApiKeySettings = useCallback(() => {
    setShowApiKeySettings(true);
    setApiKeyInput(getApiKey() || '');
  }, []);

  const handleHideApiKeySettings = useCallback(() => {
    setShowApiKeySettings(false);
  }, []);

  const handleWordClick = (event: React.MouseEvent<HTMLElement>, oldVal: string, newVal: string) => {
    setPopoverAnchorEl(event.currentTarget);
    setPopoverContent({ old: oldVal, new: newVal });
  };

  const handleClosePopover = () => {
    setPopoverAnchorEl(null);
    setPopoverContent(null);
  };

  // Calculate diff and generate highlighted content
  const diffContent = useMemo(() => {
    if (!originalText || !correctedText || state !== 'result') return null;

    const diff = diffWords(originalText, correctedText);
    const result: React.ReactNode[] = [];
    
    for (let i = 0; i < diff.length; i++) {
      const part = diff[i];
      
      if (part.added) {
        // If this word was added, check if the previous part was removed
        // This indicates a replacement
        const prevPart = i > 0 ? diff[i - 1] : null;
        if (prevPart && prevPart.removed) {
          result.push(
            <span
              key={i}
              className={`${styles.word} ${styles.highlightedWord}`}
              onClick={(e) => handleWordClick(e, prevPart.value, part.value)}
            >
              {part.value}
            </span>
          );
        } else {
          // Pure addition
          result.push(
            <span
              key={i}
              className={`${styles.word} ${styles.highlightedWord}`}
              onClick={(e) => handleWordClick(e, '(Yeni eklendi)', part.value)}
            >
              {part.value}
            </span>
          );
        }
      } else if (!part.removed) {
        // Unchanged text
        result.push(<span key={i} className={styles.word}>{part.value}</span>);
      }
      // Note: we don't push removed parts directly because we only show the corrected text
    }
    
    return result;
  }, [originalText, correctedText, state]);

  const renderContent = () => {
    if (showApiKeySettings) {
      return (
        <Box className={styles.apiKeySection}>
          <Typography className={styles.apiKeyDescription}>
            Gemini API anahtarınızı buradan güncelleyebilirsiniz.
          </Typography>
          <TextField
            fullWidth
            label="Gemini API Anahtarı"
            placeholder="AIza..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            type="password"
            autoComplete="off"
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button
              onClick={handleHideApiKeySettings}
              className={styles.button}
            >
              Geri
            </Button>
            <Button
              onClick={handleRemoveApiKey}
              color="error"
              className={styles.button}
            >
              Anahtarı Sil
            </Button>
            <Button
              onClick={handleSaveApiKey}
              variant="contained"
              disabled={!apiKeyInput.trim()}
              className={styles.button}
              sx={ACCEPT_BUTTON_SX}
            >
              Kaydet ve Temizle
            </Button>
          </Box>
        </Box>
      );
    }

    switch (state) {
      case 'loading':
        return (
          <Box className={styles.loadingContainer}>
            <CircularProgress sx={{ color: 'var(--color-primary)' }} />
            <Typography className={styles.loadingText}>
              {loadingMessages[loadingMessageIndex]}
            </Typography>
          </Box>
        );

      case 'api-key-required':
        return (
          <Box className={styles.apiKeySection}>
            <Typography className={styles.apiKeyDescription}>
              Yazım düzeltme özelliği için Google Gemini API anahtarı gerekiyor.
              Ücretsiz API anahtarı almak için{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.apiKeyLink}
              >
                Google AI Studio
              </a>
              {' '}sayfasını ziyaret edin.
            </Typography>
            {errorMessage && (
              <Typography className={styles.errorText}>
                {errorMessage}
              </Typography>
            )}
            <TextField
              fullWidth
              label="Gemini API Anahtarı"
              placeholder="AIza..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              type="password"
              autoComplete="off"
              sx={{ mt: 1 }}
            />
          </Box>
        );

      case 'error':
        return (
          <Box className={styles.contentContainer}>
            <Typography className={styles.errorText}>
              {errorMessage}
            </Typography>
          </Box>
        );

      case 'no-changes':
        return (
          <Box className={styles.noChanges}>
            <CheckCircleIcon sx={{ fontSize: 64 }} className={styles.noChangesIcon} />
            <Typography className={styles.noChangesText}>
              Yazınız zaten pırıl pırıl!
            </Typography>
            <Typography className={styles.noChangesSubtext}>
              Herhangi bir yazım hatası bulamadım.
            </Typography>
          </Box>
        );

      case 'result':
        return (
          <Box className={styles.contentContainer}>
            <Box className={styles.helperText}>
              <AutoFixHighIcon className={styles.helperIcon} />
              <Typography className={styles.helperDescription}>
                Hataları düzelttim. Sarı yerlere tıklayarak neyin değiştiğini görebilirsiniz.
              </Typography>
            </Box>
            <Box className={styles.highlightedContainer}>
              {diffContent}
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  const renderActions = () => {
    if (showApiKeySettings) {
      return null;
    }

    switch (state) {
      case 'loading':
        return (
          <Button onClick={handleClose} className={styles.button}>
            Vazgeç
          </Button>
        );

      case 'api-key-required':
        return (
          <>
            <Button onClick={handleClose} className={styles.button}>
              Vazgeç
            </Button>
            <Button
              onClick={handleSaveApiKey}
              variant="contained"
              disabled={!apiKeyInput.trim()}
              className={styles.button}
              sx={ACCEPT_BUTTON_SX}
            >
              Kaydet ve Temizle
            </Button>
          </>
        );

      case 'error':
        return (
          <>
            <Button onClick={handleClose} className={styles.button}>
              Kapat
            </Button>
            <Button
              onClick={handleRetry}
              variant="contained"
              className={styles.button}
              sx={ACCEPT_BUTTON_SX}
            >
              Tekrar Dene
            </Button>
          </>
        );

      case 'no-changes':
        return (
          <Button onClick={handleClose} variant="contained" className={styles.button} sx={ACCEPT_BUTTON_SX}>
            Tamam
          </Button>
        );

      case 'result':
        return (
          <>
            <Button onClick={handleClose} className={styles.button} sx={REJECT_BUTTON_SX}>
              Eskiye Dön
            </Button>
            <Button
              onClick={handleAccept}
              variant="contained"
              className={styles.button}
              sx={ACCEPT_BUTTON_SX}
            >
              Düzeltmeleri Kaydet
            </Button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: DIALOG_PAPER_SX }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography className={styles.title}>
            Yazı Temizliği
          </Typography>
        </Box>
        {hasApiKey() && state !== 'api-key-required' && !showApiKeySettings && (
          <Tooltip title="Ayarlar">
            <IconButton onClick={handleShowApiKeySettings} size="small">
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        )}
      </DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        {renderContent()}
      </DialogContent>
      <DialogActions className={styles.actions}>
        {renderActions()}
      </DialogActions>

      <Popover
        open={Boolean(popoverAnchorEl)}
        anchorEl={popoverAnchorEl}
        onClose={handleClosePopover}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        PaperProps={{
          sx: { borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }
        }}
      >
        {popoverContent && (
          <Box className={styles.popoverContent}>
            <Typography className={styles.popoverLabel}>Eski Hali:</Typography>
            <Typography className={styles.oldValue}>{popoverContent.old}</Typography>
            <Typography className={styles.popoverLabel}>Yeni Hali:</Typography>
            <Typography className={styles.newValue}>{popoverContent.new}</Typography>
          </Box>
        )}
      </Popover>
    </Dialog>
  );
});
