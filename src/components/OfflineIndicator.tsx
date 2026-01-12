import { useState, useEffect } from 'react';
import { Snackbar, Alert, Slide, type SlideProps } from '@mui/material';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  /** Show the additional "changes are saved locally" message */
  showSaveInfo?: boolean;
}

function SlideTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

export function OfflineIndicator({ showSaveInfo = false }: OfflineIndicatorProps) {
  const isOnline = useOnlineStatus();
  const [showOnlineMessage, setShowOnlineMessage] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      // Just came back online
      setShowOnlineMessage(true);
      setWasOffline(false);
    }
  }, [isOnline, wasOffline]);

  const handleCloseOnlineMessage = () => {
    setShowOnlineMessage(false);
  };

  const offlineMessage = showSaveInfo
    ? 'İnternete bağlı değilsiniz - Değişiklikler cihazınıza kaydediliyor'
    : 'İnternete bağlı değilsiniz';

  return (
    <>
      {/* Offline indicator - persistent while offline */}
      <Snackbar
        open={!isOnline}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        TransitionComponent={SlideTransition}
      >
        <Alert
          severity="warning"
          icon={<CloudOffIcon />}
          sx={{
            bgcolor: '#FFF3E0',
            color: '#E65100',
            fontWeight: 500,
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            '& .MuiAlert-icon': {
              color: '#E65100',
            },
          }}
        >
          {offlineMessage}
        </Alert>
      </Snackbar>

      {/* Back online notification - auto-dismiss */}
      <Snackbar
        open={showOnlineMessage}
        autoHideDuration={4000}
        onClose={handleCloseOnlineMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        TransitionComponent={SlideTransition}
      >
        <Alert
          severity="success"
          icon={<CloudDoneIcon />}
          onClose={handleCloseOnlineMessage}
          sx={{
            bgcolor: '#E8F5E9',
            color: '#2E7D32',
            fontWeight: 500,
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            '& .MuiAlert-icon': {
              color: '#2E7D32',
            },
          }}
        >
          İnternete bağlandınız - Verileriniz güncelleniyor...
        </Alert>
      </Snackbar>
    </>
  );
}
