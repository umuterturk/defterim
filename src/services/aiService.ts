// AI Service for writing corrections using Google Gemini API

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const AI_PROMPT = `Bu yazıdaki yazım hatalarını ve şeklini düzelt, cümleleri değiştirme.

Kurallar:
- Sadece yazım hatalarını düzelt (imla, noktalama, büyük/küçük harf)
- Cümlelerin anlamını ve yapısını değiştirme
- Şiir ve manzum metinlerde satır yapısını koru
- Sadece düzeltilmiş metni döndür, açıklama ekleme
- Metin düz metin olarak döndür, markdown kullanma

Düzeltilecek metin:
`;

const API_KEY_STORAGE_KEY = 'defterim_gemini_api_key';

/**
 * Get the stored Gemini API key from localStorage
 */
export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

/**
 * Save the Gemini API key to localStorage
 */
export function setApiKey(apiKey: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
}

/**
 * Remove the stored API key
 */
export function removeApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/**
 * Check if API key is configured
 */
export function hasApiKey(): boolean {
  const key = getApiKey();
  return key !== null && key.trim().length > 0;
}

export interface AiCorrectionResult {
  success: boolean;
  correctedText?: string;
  error?: string;
}

/**
 * Correct writing mistakes using Gemini AI
 */
export async function correctWriting(text: string): Promise<AiCorrectionResult> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      success: false,
      error: 'API anahtarı ayarlanmamış. Lütfen ayarlardan Gemini API anahtarınızı girin.',
    };
  }

  if (!text.trim()) {
    return {
      success: false,
      error: 'Düzeltilecek metin boş.',
    };
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: AI_PROMPT + text,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0, // Zero temperature for maximum consistency in corrections
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
      
      if (response.status === 400 && errorMessage.includes('API key')) {
        return {
          success: false,
          error: 'Geçersiz API anahtarı. Lütfen API anahtarınızı kontrol edin.',
        };
      }
      
      if (response.status === 429) {
        return {
          success: false,
          error: 'API kullanım limiti aşıldı. Lütfen biraz bekleyin.',
        };
      }
      
      return {
        success: false,
        error: `API hatası: ${errorMessage}`,
      };
    }

    const data = await response.json();
    const correctedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!correctedText) {
      return {
        success: false,
        error: 'AI yanıt vermedi. Lütfen tekrar deneyin.',
      };
    }

    return {
      success: true,
      correctedText: correctedText.trim(),
    };
  } catch (error) {
    console.error('AI correction error:', error);
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        error: 'İnternet bağlantısı yok. Lütfen bağlantınızı kontrol edin.',
      };
    }
    
    return {
      success: false,
      error: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
    };
  }
}
