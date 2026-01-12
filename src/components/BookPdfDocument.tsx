import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer';
import type { Book } from '../types/book';
import type { WritingMetadata, WritingType } from '../types/writing';
import { localStorageService } from '../services/localStorageService';
import { firebaseSyncService } from '../services/firebaseSyncService';

// Register a font that supports Turkish characters
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
      fontWeight: 'normal',
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
      fontWeight: 'bold',
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-italic-webfont.ttf',
      fontStyle: 'italic',
    },
  ],
});

// Styles
const styles = StyleSheet.create({
  // Title page styles
  titlePage: {
    paddingTop: 200,
    paddingBottom: 60,
    paddingHorizontal: 60,
    fontFamily: 'Roboto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
    color: '#2C2C2C',
  },
  bookAuthor: {
    fontSize: 18,
    textAlign: 'center',
    color: '#444',
    marginBottom: 10,
  },
  bookDate: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },

  // Regular writing (Yazı) page styles
  writingPage: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 60,
    fontFamily: 'Roboto',
    fontSize: 12,
    lineHeight: 1.6,
  },
  writingContainer: {
    flex: 1,
  },
  writingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#2C2C2C',
    textAlign: 'center',
  },
  writingBody: {
    fontSize: 12,
    lineHeight: 1.8,
    color: '#333',
    textAlign: 'left',
  },
  writingFooter: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#666',
    marginTop: 24,
    textAlign: 'right',
  },

  // Poem (Şiir) page styles - left aligned with more left padding
  poemPage: {
    paddingTop: 80,
    paddingBottom: 60,
    paddingLeft: 120, // More gap on the left
    paddingRight: 60,
    fontFamily: 'Roboto',
    fontSize: 12,
    lineHeight: 1.6,
  },
  poemContainer: {
    flex: 1,
  },
  poemTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#2C2C2C',
    textAlign: 'center',
    marginLeft: -60, // Compensate for extra left padding to center on page
  },
  poemBody: {
    fontSize: 13,
    lineHeight: 2.0,
    color: '#333',
    textAlign: 'left',
  },
  poemFooter: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#666',
    marginTop: 30,
    textAlign: 'right',
  },

  // Page number
  pageNumber: {
    position: 'absolute',
    fontSize: 10,
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#999',
  },
});

// Writing data with full content
interface WritingWithContent {
  id: string;
  title: string;
  body: string;
  footer: string;
  type: WritingType;
}

// Format date in Turkish
function formatDateTurkish(date: Date): string {
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Title page component
interface TitlePageProps {
  book: Book;
  author: string;
}

function TitlePage({ book, author }: TitlePageProps) {
  const currentDate = formatDateTurkish(new Date());
  
  return (
    <Page size="A4" style={styles.titlePage}>
      <View>
        <Text style={styles.bookTitle}>{book.title}</Text>
        <Text style={styles.bookAuthor}>{author}</Text>
        <Text style={styles.bookDate}>{currentDate}</Text>
      </View>
    </Page>
  );
}

// Regular writing page component
function WritingPage({ writing, pageNumber }: { writing: WritingWithContent; pageNumber: number }) {
  return (
    <Page size="A4" style={styles.writingPage}>
      <View style={styles.writingContainer}>
        {writing.title && (
          <Text style={styles.writingTitle}>{writing.title}</Text>
        )}
        <Text style={styles.writingBody}>{writing.body}</Text>
        {writing.footer && (
          <Text style={styles.writingFooter}>{writing.footer}</Text>
        )}
      </View>
      <Text style={styles.pageNumber}>{pageNumber}</Text>
    </Page>
  );
}

// Poem page component - centered, artistic layout
function PoemPage({ writing, pageNumber }: { writing: WritingWithContent; pageNumber: number }) {
  return (
    <Page size="A4" style={styles.poemPage}>
      <View style={styles.poemContainer}>
        {writing.title && (
          <Text style={styles.poemTitle}>{writing.title}</Text>
        )}
        <Text style={styles.poemBody}>{writing.body}</Text>
        {writing.footer && (
          <Text style={styles.poemFooter}>{writing.footer}</Text>
        )}
      </View>
      <Text style={styles.pageNumber}>{pageNumber}</Text>
    </Page>
  );
}

// Main document component
interface BookPdfDocumentProps {
  book: Book;
  writings: WritingWithContent[];
  author: string;
}

function BookPdfDocument({ book, writings, author }: BookPdfDocumentProps) {
  return (
    <Document>
      <TitlePage book={book} author={author} />
      {writings.map((writing, index) => {
        // Page numbers start from 1 (title page has no number)
        const pageNumber = index + 1;
        
        // Use poem layout for "siir" type, regular layout for others
        if (writing.type === 'siir') {
          return (
            <PoemPage
              key={writing.id}
              writing={writing}
              pageNumber={pageNumber}
            />
          );
        }
        return (
          <WritingPage
            key={writing.id}
            writing={writing}
            pageNumber={pageNumber}
          />
        );
      })}
    </Document>
  );
}

// Function to generate and download PDF
export async function generateBookPdf(
  book: Book,
  bookWritings: WritingMetadata[],
  _allWritings: WritingMetadata[],
  author: string = 'Mustafa Ertürk'
): Promise<void> {
  console.log('Generating PDF for book:', book.title);
  console.log('Book has', book.writingIds.length, 'writing IDs');
  console.log('BookWritings metadata count:', bookWritings.length);

  // Fetch full content for each writing in the book
  const writingsWithContent: WritingWithContent[] = [];

  for (const writingId of book.writingIds) {
    console.log('Fetching writing:', writingId);
    
    // Try to get from local storage first
    let fullWriting = await localStorageService.getFullWriting(writingId);
    
    // If not in local storage, try to fetch from Firebase
    if (!fullWriting) {
      console.log('Writing not in local storage, fetching from Firebase:', writingId);
      fullWriting = await firebaseSyncService.fetchWritingBody(writingId);
    }
    
    if (fullWriting) {
      console.log('Found writing:', fullWriting.title, 'type:', fullWriting.type, 'body length:', fullWriting.body?.length);
      writingsWithContent.push({
        id: fullWriting.id,
        title: (fullWriting.title || '').trim(),
        body: (fullWriting.body || '').trimEnd(), // Remove trailing whitespace/newlines
        footer: (fullWriting.footer || '').trim(),
        type: fullWriting.type,
      });
    } else {
      console.warn('Could not find writing:', writingId);
    }
  }

  console.log('Total writings with content:', writingsWithContent.length);

  if (writingsWithContent.length === 0) {
    throw new Error('Kitaptaki yazıların içeriği bulunamadı. Lütfen yazıları önce açıp kaydedin.');
  }

  // Generate PDF blob
  const blob = await pdf(
    <BookPdfDocument book={book} writings={writingsWithContent} author={author} />
  ).toBlob();

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${book.title.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]/g, '')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
