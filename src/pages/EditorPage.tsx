import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { useWritings } from '../contexts/WritingsContext';
import { WritingTypeSelector } from '../components/WritingTypeSelector';
import { BookToggleButton } from '../components/BookToggleButton';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { Writing, WritingType } from '../types/writing';
import { isValidForSave } from '../types/writing';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getFullWriting, saveWriting, deleteWriting, isPendingWriting, discardPendingWriting } = useWritings();
  
  // Get return path from navigation state (if coming from book edit page)
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo || '/';
  const isOnline = useOnlineStatus();

  // State
  const [writing, setWriting] = useState<Writing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<'offline' | 'not_found' | null>(null);

  // Refs for original values (change detection)
  const originalRef = useRef<{
    title: string;
    body: string;
    footer: string;
    type: WritingType;
  } | null>(null);

  // Auto-save timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load writing
  useEffect(() => {
    let cancelled = false;
    
    const load = async () => {
      if (!id) return;
      
      setIsLoading(true);
      setLoadError(null);
      const w = await getFullWriting(id);
      
      if (cancelled) return;
      
      if (w) {
        setWriting(w);
        originalRef.current = {
          title: w.title,
          body: w.body,
          footer: w.footer,
          type: w.type,
        };
      } else if (!isOnline) {
        // Writing not found and we're offline - body not cached
        setLoadError('offline');
      } else {
        // Writing not found even when online
        setLoadError('not_found');
      }
      setIsLoading(false);
    };
    
    load();
    
    return () => {
      cancelled = true;
    };
  }, [id, getFullWriting, isOnline]);

  // Retry loading when coming back online
  useEffect(() => {
    if (isOnline && loadError === 'offline' && id) {
      setLoadError(null);
      setIsLoading(true);
      getFullWriting(id).then((w) => {
        if (w) {
          setWriting(w);
          originalRef.current = {
            title: w.title,
            body: w.body,
            footer: w.footer,
            type: w.type,
          };
        } else {
          setLoadError('not_found');
        }
        setIsLoading(false);
      });
    }
  }, [isOnline, loadError, id, getFullWriting]);

  // Check for changes - memoized
  const hasChanges = useMemo(() => {
    if (!writing || !originalRef.current) return false;
    return (
      writing.title !== originalRef.current.title ||
      writing.body !== originalRef.current.body ||
      writing.footer !== originalRef.current.footer ||
      writing.type !== originalRef.current.type
    );
  }, [writing]);

  // Update hasUnsavedChanges when writing changes
  useEffect(() => {
    setHasUnsavedChanges(hasChanges);
  }, [hasChanges]);

  // Save function - only saves if writing has title OR body
  const save = useCallback(async () => {
    if (!writing || isSaving) return;

    // Check if writing is valid (has title OR body)
    const isValid = isValidForSave(writing);
    const isPending = isPendingWriting(writing.id);

    // If not valid:
    // - For pending writings: don't save (will be discarded when leaving)
    // - For existing writings that are now empty: delete them
    if (!isValid) {
      if (!isPending) {
        // Existing writing became invalid - check if completely empty
        const hasAnyContent = writing.title.trim() || writing.body.trim() || writing.footer.trim();
        if (!hasAnyContent) {
          await deleteWriting(writing.id);
        }
      }
      // For pending writings, just don't save - it will be discarded on navigation
      return;
    }

    setIsSaving(true);
    
    try {
      // Save
      await saveWriting(writing);
      
      // Update original values
      originalRef.current = {
        title: writing.title,
        body: writing.body,
        footer: writing.footer,
        type: writing.type,
      };
      
      if (isMountedRef.current) {
        setHasUnsavedChanges(false);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [writing, saveWriting, deleteWriting, isSaving, isPendingWriting]);

  // Auto-save with debounce
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer (5 seconds)
    autoSaveTimerRef.current = setTimeout(() => {
      save();
    }, 5000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasUnsavedChanges, save]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Handle field changes - optimized
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setWriting(prev => prev ? { ...prev, title: e.target.value } : null);
  }, []);

  const handleBodyChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setWriting(prev => prev ? { ...prev, body: e.target.value } : null);
  }, []);

  const handleFooterChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setWriting(prev => prev ? { ...prev, footer: e.target.value } : null);
  }, []);

  // Handle type change (save immediately if valid)
  const handleTypeChange = useCallback(async (type: WritingType) => {
    if (!writing) return;
    const updated = { ...writing, type };
    setWriting(updated);
    
    // Only save immediately if the writing is valid
    if (isValidForSave(updated)) {
      await saveWriting(updated);
      originalRef.current = {
        ...originalRef.current!,
        type,
      };
      setHasUnsavedChanges(false);
    } else {
      // Just update the original type reference for change detection
      originalRef.current = {
        ...originalRef.current!,
        type,
      };
    }
  }, [writing, saveWriting]);

  // Go back - optimized for speed
  const handleGoBack = useCallback(async () => {
    // Clear auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (!writing) {
      navigate(returnTo);
      return;
    }

    const isValid = isValidForSave(writing);
    const isPending = isPendingWriting(writing.id);

    // Navigate immediately for better UX
    navigate(returnTo);

    // Handle in background based on validity and pending status
    if (isPending) {
      // Pending writing (never saved)
      if (isValid && hasUnsavedChanges) {
        // Valid and has changes - save it
        saveWriting(writing);
      } else {
        // Not valid - discard it (no delete needed since never saved)
        discardPendingWriting(writing.id);
      }
    } else {
      // Existing writing (already saved)
      const hasAnyContent = writing.title.trim() || writing.body.trim() || writing.footer.trim();
      if (!hasAnyContent) {
        // Completely empty - delete it
        deleteWriting(writing.id);
      } else if (hasUnsavedChanges) {
        // Has content and changes - save it
        saveWriting(writing);
      }
    }
  }, [writing, hasUnsavedChanges, navigate, deleteWriting, saveWriting, isPendingWriting, discardPendingWriting, returnTo]);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!writing) return;
    
    // Clear auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Navigate immediately
    navigate(returnTo);
    
    // Delete in background (deleteWriting handles pending writings automatically)
    deleteWriting(writing.id);
  }, [writing, navigate, deleteWriting, returnTo]);

  const handleShowDeleteDialog = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleHideDeleteDialog = useCallback(() => {
    setShowDeleteDialog(false);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#E8E8E0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress sx={{ color: '#4A7C59' }} />
        <Typography sx={{ mt: 2, color: '#666' }}>İçerik yükleniyor...</Typography>
      </Box>
    );
  }

  // Offline error - body not cached locally
  if (loadError === 'offline') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#E8E8E0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
        }}
      >
        <CloudOffIcon sx={{ fontSize: 80, color: '#E65100', mb: 2 }} />
        <Typography variant="h5" sx={{ color: '#2C2C2C', mb: 1, textAlign: 'center' }}>
          İçerik şu an kullanılamıyor
        </Typography>
        <Typography variant="body1" sx={{ color: '#666', mb: 3, textAlign: 'center', maxWidth: 400 }}>
          Bu yazıyı görüntülemek için internet bağlantısı gerekiyor. İnternete bağlandığınızda otomatik olarak açılacak.
        </Typography>
        <Alert severity="info" sx={{ mb: 3, borderRadius: '12px' }}>
          Daha önce açtığınız yazılar internetsiz de görüntülenebilir.
        </Alert>
        <Button
          onClick={() => navigate(returnTo)}
          startIcon={<ArrowBackIcon />}
          variant="contained"
          sx={{
            bgcolor: '#4A7C59',
            color: 'white',
            fontWeight: 600,
            textTransform: 'none',
            borderRadius: '20px',
            px: 3,
            '&:hover': { bgcolor: '#3d6b4a' },
          }}
        >
          Geri Dön
        </Button>
      </Box>
    );
  }

  if (!writing) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#E8E8E0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h6" sx={{ color: '#666', mb: 2 }}>
          Yazı bulunamadı
        </Typography>
        <Button
          onClick={() => navigate(returnTo)}
          startIcon={<ArrowBackIcon />}
          sx={{ color: '#4A7C59' }}
        >
          Geri Dön
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFF8', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar - sticky at top */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          bgcolor: 'white',
          borderBottom: '1px solid #ddd',
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {/* Back button */}
        <Button
          onClick={handleGoBack}
          startIcon={<ArrowBackIcon />}
          sx={{
            color: '#4A7C59',
            fontWeight: 600,
            textTransform: 'none',
            fontSize: '16px',
          }}
        >
          Geri
        </Button>

        {/* Type selector */}
        <WritingTypeSelector
          currentType={writing.type}
          onTypeChange={handleTypeChange}
        />

        <Box sx={{ flex: 1 }} />

        {/* Book toggle button - only shows when there's an active book */}
        <BookToggleButton writingId={writing.id} size="medium" />

        {/* Delete button */}
        <IconButton onClick={handleShowDeleteDialog} sx={{ color: '#666' }}>
          <DeleteOutlineIcon />
        </IconButton>

        {/* Status indicator */}
        {isSaving ? (
          <CircularProgress size={24} sx={{ color: '#ff9800' }} />
        ) : hasUnsavedChanges ? (
          <EditIcon sx={{ color: '#ff9800', fontSize: 24 }} />
        ) : (
          <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 24 }} />
        )}
      </Box>

      {/* Editor content */}
      <Box
        sx={{
          flex: 1,
          bgcolor: '#E8E8E0',
          display: 'flex',
          justifyContent: 'center',
          py: 4,
          overflow: 'auto',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 800,
            bgcolor: '#FFFFF8',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            border: '1px solid #ddd',
            mx: 2,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ p: { xs: 4, md: 7.5 }, flex: 1 }}>
            {/* Title */}
            <TextField
              fullWidth
              multiline
              placeholder="Başlık"
              value={writing.title}
              onChange={handleTitleChange}
              variant="standard"
              InputProps={{
                disableUnderline: true,
                sx: {
                  fontSize: '32px',
                  fontWeight: 700,
                  color: '#2C2C2C',
                  lineHeight: 1.3,
                  '& textarea::placeholder': {
                    color: '#bbb',
                    opacity: 1,
                  },
                },
              }}
              sx={{ mb: 4 }}
            />

            {/* Body */}
            <TextField
              fullWidth
              multiline
              placeholder="Yazmaya başlayın..."
              value={writing.body}
              onChange={handleBodyChange}
              variant="standard"
              InputProps={{
                disableUnderline: true,
                sx: {
                  fontSize: '20px',
                  fontWeight: writing.isBold ? 600 : 400,
                  color: '#2C2C2C',
                  lineHeight: 1.6,
                  textAlign: writing.textAlign,
                  '& textarea::placeholder': {
                    color: '#bbb',
                    opacity: 1,
                  },
                },
              }}
              sx={{ mb: 7.5 }}
            />

            {/* Footer */}
            <TextField
              fullWidth
              multiline
              placeholder="Notlar (tarih, yer, vb.)"
              value={writing.footer}
              onChange={handleFooterChange}
              variant="standard"
              InputProps={{
                disableUnderline: true,
                sx: {
                  fontSize: '16px',
                  fontStyle: 'italic',
                  color: '#666',
                  lineHeight: 1.5,
                  '& textarea::placeholder': {
                    color: '#aaa',
                    opacity: 1,
                  },
                },
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={handleHideDeleteDialog}
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '24px' }}>
          Yazıyı Sil
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '18px' }}>
            "{writing.title || 'Başlıksız Yazı'}" yazısını silmek istediğinizden emin misiniz?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleHideDeleteDialog} sx={{ fontSize: '16px' }}>
            İptal
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            sx={{ fontWeight: 600, fontSize: '16px' }}
          >
            Sil
          </Button>
        </DialogActions>
      </Dialog>

      {/* Offline indicator - full message with save info for editor */}
      <OfflineIndicator showSaveInfo />
    </Box>
  );
}
