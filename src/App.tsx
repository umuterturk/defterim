import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { WritingsProvider } from './contexts/WritingsContext';
import { BookProvider } from './contexts/BookContext';
import { WritingsListPage } from './pages/WritingsListPage';
import { EditorPage } from './pages/EditorPage';
import { BookEditPage } from './pages/BookEditPage';

// Create theme matching Flutter app colors
const theme = createTheme({
  palette: {
    primary: {
      main: '#4A7C59',
    },
    secondary: {
      main: '#7B5EA7',
    },
    background: {
      default: '#F5F5F0',
      paper: '#FFFFF8',
    },
    text: {
      primary: '#2C2C2C',
      secondary: '#666666',
    },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 500,
    },
    h6: {
      fontWeight: 600,
    },
    body1: {
      fontSize: '18px',
    },
    body2: {
      fontSize: '16px',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F5F5F0',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '8px',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '12px',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <WritingsProvider>
        <BookProvider>
          <HashRouter>
            <Routes>
              <Route path="/" element={<WritingsListPage />} />
              <Route path="/editor/:id" element={<EditorPage />} />
              <Route path="/book/:id" element={<BookEditPage />} />
            </Routes>
          </HashRouter>
        </BookProvider>
      </WritingsProvider>
    </ThemeProvider>
  );
}

export default App;
