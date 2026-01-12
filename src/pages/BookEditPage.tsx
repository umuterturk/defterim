import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  IconButton,
  Paper,
  Stack,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBook } from '../contexts/BookContext';
import { useWritings } from '../contexts/WritingsContext';
import { generateBookPdf } from '../components/BookPdfDocument';
import type { WritingMetadata } from '../types/writing';

// Sortable item component
interface SortableItemProps {
  id: string;
  metadata: WritingMetadata;
  onRemove: (id: string) => void;
  onNavigate: (id: string) => void;
}

function SortableItem({ id, metadata, onRemove, onNavigate }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(id);
  }, [id, onRemove]);

  const handleNavigate = useCallback(() => {
    onNavigate(id);
  }, [id, onNavigate]);

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      sx={{
        p: 2,
        mb: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        bgcolor: isDragging ? '#f5f5f5' : 'white',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.08)',
        borderRadius: '12px',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        },
      }}
    >
      {/* Drag handle */}
      <Box
        {...attributes}
        {...listeners}
        sx={{
          display: 'flex',
          alignItems: 'center',
          color: '#999',
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicatorIcon />
      </Box>

      {/* Content - clickable to navigate */}
      <Box 
        onClick={handleNavigate}
        sx={{ 
          flex: 1, 
          minWidth: 0,
          cursor: 'pointer',
          '&:hover': {
            '& .writing-title': {
              color: '#7B5EA7',
            },
          },
        }}
      >
        <Typography
          className="writing-title"
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            color: '#2C2C2C',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'color 0.2s',
          }}
        >
          {metadata.title || 'Başlıksız'}
        </Typography>
        {metadata.preview && (
          <Typography
            variant="body2"
            sx={{
              color: '#666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {metadata.preview}
          </Typography>
        )}
      </Box>

      {/* Remove button */}
      <IconButton
        onClick={handleRemove}
        size="small"
        sx={{
          color: '#999',
          '&:hover': { color: '#e53935' },
        }}
      >
        <RemoveCircleOutlineIcon />
      </IconButton>
    </Paper>
  );
}

export function BookEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state: bookState, setActiveBook, reorderWritings, removeWritingFromBook, updateBookTitle, deleteBook, getBook } = useBook();
  const { state: writingsState } = useWritings();

  // Local state
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load book on mount
  useEffect(() => {
    const loadBook = async () => {
      if (!id) {
        navigate('/');
        return;
      }

      setIsLoading(true);
      const book = await getBook(id);
      
      if (!book) {
        navigate('/');
        return;
      }

      await setActiveBook(id);
      setTitle(book.title);
      setIsLoading(false);
    };

    loadBook();
  }, [id, getBook, setActiveBook, navigate]);

  // Get writing metadata for items in book
  const bookWritings = useMemo(() => {
    if (!bookState.activeBook) return [];
    
    return bookState.activeBook.writingIds
      .map((writingId) => writingsState.writings.find((w) => w.id === writingId))
      .filter((w): w is WritingMetadata => w !== undefined);
  }, [bookState.activeBook, writingsState.writings]);

  // Handlers
  const handleGoBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSaveTitle = useCallback(() => {
    if (title.trim() && title !== bookState.activeBook?.title) {
      updateBookTitle(title.trim());
    }
    setIsEditingTitle(false);
  }, [title, bookState.activeBook?.title, updateBookTitle]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      // Revert to original title on Escape
      setTitle(bookState.activeBook?.title ?? '');
      setIsEditingTitle(false);
    }
  }, [handleSaveTitle, bookState.activeBook?.title]);

  const handleStartEditingTitle = useCallback(() => {
    setIsEditingTitle(true);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && bookState.activeBook) {
      const oldIndex = bookState.activeBook.writingIds.indexOf(active.id as string);
      const newIndex = bookState.activeBook.writingIds.indexOf(over.id as string);
      
      const newOrder = arrayMove(bookState.activeBook.writingIds, oldIndex, newIndex);
      reorderWritings(newOrder);
    }
  }, [bookState.activeBook, reorderWritings]);

  const handleRemoveWriting = useCallback((writingId: string) => {
    removeWritingFromBook(writingId);
  }, [removeWritingFromBook]);

  const handleNavigateToWriting = useCallback((writingId: string) => {
    // Pass the return path so EditorPage knows where to go back
    navigate(`/editor/${writingId}`, { state: { returnTo: `/book/${id}` } });
  }, [navigate, id]);

  const handleShowDeleteDialog = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleHideDeleteDialog = useCallback(() => {
    setShowDeleteDialog(false);
  }, []);

  const handleDeleteBook = useCallback(async () => {
    if (!id) return;
    await deleteBook(id);
    navigate('/');
  }, [id, deleteBook, navigate]);

  const handleGeneratePdf = useCallback(async () => {
    if (!bookState.activeBook) return;

    setIsGeneratingPdf(true);
    try {
      await generateBookPdf(
        bookState.activeBook,
        bookWritings,
        writingsState.writings,
        'Mustafa Ertürk' // Author name - will be connected to user in the future
      );
    } catch (error) {
      console.error('Error generating PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'PDF oluşturulurken bir hata oluştu.';
      alert(errorMessage);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [bookState.activeBook, bookWritings, writingsState.writings]);

  // Loading state
  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#F5F5F0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress sx={{ color: '#7B5EA7' }} />
        <Typography sx={{ mt: 2, color: '#666' }}>Kitap yükleniyor...</Typography>
      </Box>
    );
  }

  if (!bookState.activeBook) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#F5F5F0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h6" sx={{ color: '#666', mb: 2 }}>
          Kitap bulunamadı
        </Typography>
        <Button
          onClick={handleGoBack}
          startIcon={<ArrowBackIcon />}
          sx={{ color: '#7B5EA7' }}
        >
          Listeye Dön
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F5F5F0', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box
        sx={{
          bgcolor: 'white',
          borderBottom: '1px solid #ddd',
          px: 2,
          py: 1.5,
        }}
      >
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" spacing={2}>
            {/* Back button */}
            <Button
              onClick={handleGoBack}
              startIcon={<ArrowBackIcon />}
              sx={{
                color: '#7B5EA7',
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '16px',
              }}
            >
              Geri
            </Button>

            <Box sx={{ flex: 1 }} />

            {/* Actions */}
            <Stack direction="row" spacing={1}>
              <IconButton onClick={handleShowDeleteDialog} sx={{ color: '#999' }}>
                <DeleteOutlineIcon />
              </IconButton>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, py: 3, overflow: 'auto' }}>
        <Container maxWidth="md">
          {/* Book Title */}
          <Paper
            sx={{
              p: 3,
              mb: 2,
              borderRadius: '16px',
              bgcolor: 'white',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography 
                variant="body1" 
                sx={{ 
                  color: '#666', 
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                Kitap Adı:
              </Typography>
              <TextField
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={handleStartEditingTitle}
                onBlur={handleSaveTitle}
                onKeyDown={handleTitleKeyDown}
                variant="standard"
                placeholder="Kitap adı..."
                autoComplete="off"
                InputProps={{
                  disableUnderline: !isEditingTitle,
                  sx: {
                    fontSize: '24px',
                    fontWeight: 600,
                    color: '#2C2C2C',
                    px: 1,
                    py: 0.5,
                    borderRadius: '8px',
                    bgcolor: isEditingTitle ? '#f5f5f5' : 'transparent',
                    transition: 'background-color 0.2s',
                    '&:hover': {
                      bgcolor: isEditingTitle ? '#f5f5f5' : '#f9f9f9',
                    },
                  },
                }}
                sx={{ flex: 1 }}
              />
              {isEditingTitle ? (
                <IconButton 
                  onClick={handleSaveTitle}
                  size="small"
                  sx={{ 
                    color: '#4A7C59',
                    '&:hover': { bgcolor: 'rgba(74, 124, 89, 0.1)' },
                  }}
                >
                  <CheckIcon />
                </IconButton>
              ) : (
                <IconButton 
                  onClick={handleStartEditingTitle}
                  size="small"
                  sx={{ 
                    color: '#999',
                    opacity: 0.6,
                    '&:hover': { opacity: 1, color: '#7B5EA7' },
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </Paper>

          {/* Stats */}
          <Paper
            sx={{
              p: 3,
              mb: 3,
              borderRadius: '16px',
              bgcolor: 'white',
              textAlign: 'center',
            }}
          >
            <Typography variant="h2" sx={{ color: '#7B5EA7', fontWeight: 700 }}>
              {bookWritings.length}
            </Typography>
            <Typography variant="body1" sx={{ color: '#666' }}>
              yazı bu kitapta
            </Typography>
          </Paper>

          {/* Empty state */}
          {bookWritings.length === 0 && (
            <Paper
              sx={{
                p: 4,
                borderRadius: '16px',
                bgcolor: 'white',
                textAlign: 'center',
              }}
            >
              <Typography variant="h6" sx={{ color: '#666', mb: 1 }}>
                Kitapta henüz yazı yok
              </Typography>
              <Typography variant="body2" sx={{ color: '#999', mb: 2 }}>
                Yazı listesinden kitaba yazı ekleyebilirsiniz.
              </Typography>
              <Button
                onClick={handleGoBack}
                variant="outlined"
                sx={{
                  borderColor: '#7B5EA7',
                  color: '#7B5EA7',
                  '&:hover': { borderColor: '#6b4e97' },
                }}
              >
                Yazılara Git
              </Button>
            </Paper>
          )}

          {/* Sortable list */}
          {bookWritings.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 2, color: '#666', fontWeight: 600 }}>
                Sıralamayı değiştirmek için yazıları sürükleyin
              </Typography>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={bookState.activeBook.writingIds}
                  strategy={verticalListSortingStrategy}
                >
                  {bookWritings.map((metadata) => (
                    <SortableItem
                      key={metadata.id}
                      id={metadata.id}
                      metadata={metadata}
                      onRemove={handleRemoveWriting}
                      onNavigate={handleNavigateToWriting}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Create PDF button */}
              <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf || bookWritings.length === 0}
                  startIcon={isGeneratingPdf ? <CircularProgress size={20} color="inherit" /> : <PictureAsPdfIcon />}
                  sx={{
                    bgcolor: '#7B5EA7',
                    color: 'white',
                    fontWeight: 600,
                    textTransform: 'none',
                    borderRadius: '24px',
                    px: 4,
                    py: 1.5,
                    fontSize: '18px',
                    '&:hover': { bgcolor: '#6b4e97' },
                    '&:disabled': { bgcolor: '#ccc' },
                  }}
                >
                  {isGeneratingPdf ? 'PDF Oluşturuluyor...' : 'Kitabı Yarat (PDF)'}
                </Button>
              </Box>
            </>
          )}
        </Container>
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={handleHideDeleteDialog}
        PaperProps={{ sx: { borderRadius: '12px' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '24px' }}>
          Kitabı Sil
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '18px' }}>
            "{bookState.activeBook.title}" kitabını silmek istediğinizden emin misiniz?
            <br />
            <Typography component="span" sx={{ color: '#666', fontSize: '14px' }}>
              Not: Yazılarınız silinmez, sadece kitap silinir.
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleHideDeleteDialog} sx={{ fontSize: '16px' }}>
            İptal
          </Button>
          <Button
            onClick={handleDeleteBook}
            color="error"
            sx={{ fontWeight: 600, fontSize: '16px' }}
          >
            Sil
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
