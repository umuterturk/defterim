// AI Service for writing corrections using Google Gemini API

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const AI_PROMPT = `Bu yazıdaki yazım hatalarını ve şeklini düzelt, cümleleri değiştirme.

Kurallar:
- Sadece yazım hatalarını düzelt (imla, noktalama, büyük/küçük harf)
- Cümlelerin anlamını ve yapısını değiştirme
- Şiir ve manzum metinlerde satır yapısını koru
- Sadece düzeltilmiş metni döndür, açıklama ekleme
- Metin düz metin olarak döndür, markdown kullanma
- SADECE düzeltilmiş metni döndür, başka hiçbir şey ekleme (özet, açıklama vb.)
- METNİN TAMAMINI DÖNDÜR, kısaltma veya kesme yapma

Düzeltilecek metin:
`;

// Guardrail thresholds
const MIN_LENGTH_RATIO = 0.7; // Corrected text must be at least 70% of original length
const MIN_LINE_RATIO = 0.8; // Corrected text must have at least 80% of original line count

/**
 * Validate that the AI response is complete and not truncated
 */
function validateResponse(
  originalText: string,
  correctedText: string,
  finishReason: string | undefined
): { valid: boolean; error?: string } {
  // Check 1: Verify finish reason - if not "STOP", response may be incomplete
  if (finishReason && finishReason !== 'STOP') {
    if (finishReason === 'MAX_TOKENS') {
      return {
        valid: false,
        error: 'AI yanıtı tamamlanamadı (metin çok uzun). Lütfen daha kısa bir metin deneyin.',
      };
    }
    if (finishReason === 'SAFETY') {
      return {
        valid: false,
        error: 'AI içerik güvenlik filtresine takıldı. Lütfen metni kontrol edin.',
      };
    }
    // Other unexpected finish reasons
    console.warn('Unexpected finish reason:', finishReason);
  }

  const originalLength = originalText.trim().length;
  const correctedLength = correctedText.trim().length;

  // Check 2: Length ratio - corrected text shouldn't be much shorter
  // (spelling corrections don't significantly reduce text length)
  if (originalLength > 100) { // Only check for non-trivial texts
    const lengthRatio = correctedLength / originalLength;
    if (lengthRatio < MIN_LENGTH_RATIO) {
      console.error(
        `Content loss detected: original=${originalLength}, corrected=${correctedLength}, ratio=${lengthRatio.toFixed(2)}`
      );
      return {
        valid: false,
        error: `AI yanıtı eksik görünüyor (orijinalin %${Math.round(lengthRatio * 100)}'i). İçerik kaybını önlemek için işlem iptal edildi.`,
      };
    }
  }

  // Check 3: Line count comparison - should be similar
  const originalLines = originalText.trim().split('\n').length;
  const correctedLines = correctedText.trim().split('\n').length;

  if (originalLines > 3) { // Only check for multi-line texts
    const lineRatio = correctedLines / originalLines;
    if (lineRatio < MIN_LINE_RATIO) {
      console.error(
        `Line count mismatch: original=${originalLines}, corrected=${correctedLines}, ratio=${lineRatio.toFixed(2)}`
      );
      return {
        valid: false,
        error: `AI yanıtında satır eksikliği tespit edildi (${originalLines} satırdan ${correctedLines} satıra düştü). İçerik kaybını önlemek için işlem iptal edildi.`,
      };
    }
  }

  return { valid: true };
}

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
          maxOutputTokens: 16384,
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
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts;
    const finishReason = candidate?.finishReason;
    
    if (!parts || parts.length === 0) {
      return {
        success: false,
        error: 'AI yanıt vermedi. Lütfen tekrar deneyin.',
      };
    }

    // Concatenate all parts - Gemini can return long responses split across multiple parts
    const correctedText = parts
      .map((part: { text?: string }) => part.text || '')
      .join('');

    if (!correctedText.trim()) {
      return {
        success: false,
        error: 'AI yanıt vermedi. Lütfen tekrar deneyin.',
      };
    }

    // GUARDRAIL: Validate response completeness before returning
    const validation = validateResponse(text, correctedText, finishReason);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
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
