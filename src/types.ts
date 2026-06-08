export interface SubtitleBlock {
  id: number;          // Subtitle block index (1, 2, 3...)
  startTime: string;   // e.g., "00:01:20,000"
  endTime: string;     // e.g., "00:01:23,500"
  text: string;        // Original text (multiline friendly)
  translatedText?: string; // Translated text
  status: 'pending' | 'translating' | 'done' | 'failed';
  error?: string;
}

export interface ModelChoice {
  id: string;
  name: string;
  description: string;
  isPaid: boolean;
}

export interface LanguageChoice {
  code: string;
  name: string;
  flag?: string;
}
