import { memo, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import AddIcon from '@mui/icons-material/Add';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import type { Book, BookMetadata } from '../types/book';
import styles from './BookMenuDropdown.module.css';

// Static sx objects - hoisted to prevent recreation
const BOOK_COUNT_CHIP_SX = {
  ml: 1,
  height: 20,
  minWidth: 20,
  bgcolor: 'var(--color-secondary)',
  color: 'white',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
} as const;

const MENU_PAPER_SX = {
  borderRadius: 'var(--radius-md)',
  minWidth: 200,
  mt: 1,
} as const;

const ICON_SX = { color: 'var(--color-secondary)' };
const EMPTY_BOX_SX = { width: 20 };

interface BookMenuDropdownProps {
  books: BookMetadata[];
  activeBook: Book | null;
  isGeneratingPdf: boolean;
  bookWritingsCount: number;
  onNavigateToBook: () => void;
  onSelectBook: (bookId: string) => void;
  onCreateNew: () => void;
  onPrintBook: () => void;
}

export const BookMenuDropdown = memo(function BookMenuDropdown({
  books,
  activeBook,
  isGeneratingPdf,
  bookWritingsCount,
  onNavigateToBook,
  onSelectBook,
  onCreateNew,
  onPrintBook,
}: BookMenuDropdownProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isOpen = Boolean(anchorEl);

  const handleOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleNavigate = useCallback(() => {
    handleClose();
    onNavigateToBook();
  }, [handleClose, onNavigateToBook]);

  const handlePrint = useCallback(() => {
    handleClose();
    onPrintBook();
  }, [handleClose, onPrintBook]);

  const handleSelect = useCallback((bookId: string) => {
    handleClose();
    onSelectBook(bookId);
  }, [handleClose, onSelectBook]);

  const handleCreate = useCallback(() => {
    handleClose();
    onCreateNew();
  }, [handleClose, onCreateNew]);

  // Sort books by creation date (newest first)
  const sortedBooks = useMemo(() => 
    [...books].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [books]
  );

  // If no books exist, show simple create button
  if (books.length === 0 && !activeBook) {
    return (
      <Button
        variant="outlined"
        onClick={onCreateNew}
        startIcon={<MenuBookIcon />}
        className={styles.button}
      >
        <span className={styles.buttonText}>Oluştur</span>
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outlined"
        onClick={handleOpen}
        startIcon={<MenuBookIcon />}
        endIcon={<ArrowDropDownIcon />}
        className={`${styles.button} ${activeBook ? styles.buttonActive : ''}`}
      >
        {activeBook ? (
          <>
            {activeBook.title}
            <Chip
              label={activeBook.writingIds.length}
              size="small"
              sx={BOOK_COUNT_CHIP_SX}
            />
          </>
        ) : (
          'Kitap Seç'
        )}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={isOpen}
        onClose={handleClose}
        PaperProps={{ sx: MENU_PAPER_SX }}
      >
        {/* Edit current book option */}
        {activeBook && (
          <MenuItem onClick={handleNavigate}>
            <ListItemIcon>
              <MenuBookIcon fontSize="small" sx={ICON_SX} />
            </ListItemIcon>
            <ListItemText primary="Kitabı Düzenle" />
          </MenuItem>
        )}
        {/* Print current book option */}
        {activeBook && (
          <MenuItem 
            onClick={handlePrint}
            disabled={isGeneratingPdf || bookWritingsCount === 0}
          >
            <ListItemIcon>
              <PictureAsPdfIcon fontSize="small" sx={ICON_SX} />
            </ListItemIcon>
            <ListItemText primary={isGeneratingPdf ? "PDF Oluşturuluyor..." : "Kitabı Yazdır"} />
          </MenuItem>
        )}
        {activeBook && books.length > 0 && <Divider />}
        
        {/* List of books */}
        {sortedBooks.map((book) => (
          <MenuItem
            key={book.id}
            onClick={() => handleSelect(book.id)}
            selected={activeBook?.id === book.id}
          >
            <ListItemIcon>
              {activeBook?.id === book.id ? (
                <CheckIcon fontSize="small" sx={ICON_SX} />
              ) : (
                <Box sx={EMPTY_BOX_SX} />
              )}
            </ListItemIcon>
            <ListItemText 
              primary={book.title} 
              secondary={`${book.writingCount} yazı`}
            />
          </MenuItem>
        ))}
        
        <Divider />
        
        {/* Create new book option */}
        <MenuItem onClick={handleCreate}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Yeni Kitap Oluştur" />
        </MenuItem>
      </Menu>
    </>
  );
});
