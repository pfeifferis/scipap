export interface SchemaField {
  id: number;
  key: string;
  label: string;
  category?: string;
  description?: string;
  field_type?: string;
  order_index?: number;
  is_active?: boolean;
}

export interface CitationItem {
  quote: string;
  page?: number | null;
  rects?: number[][] | null;
  page_width?: number | null;
  page_height?: number | null;
}

export interface Extraction {
  id: number;
  paper_id: number;
  field_key: string;
  value?: string | null;
  edited_value?: string | null;
  display_value?: string | null;
  quote?: string | null;
  page?: number | null;
  rects?: number[][] | null; // [[x0, y0, x1, y1], ...]
  page_width?: number | null;
  page_height?: number | null;
  citations?: CitationItem[];
  confidence?: number | null;
  updated_at?: string;
}

export interface Paper {
  id: number;
  filename: string;
  title?: string | null;
  filepath: string;
  file_size: number;
  num_pages: number;
  status: 'pending' | 'extracting' | 'extracted' | 'error';
  is_checked?: boolean;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  extractions: Extraction[];
}

export interface Settings {
  openrouter_api_key_set: boolean;
  model: string;
  system_prompt?: string;
}

export interface HighlightTarget {
  page: number;
  rects: number[][];
  label?: string;
  quote?: string;
  page_width?: number;
  page_height?: number;
  timestamp: number; // for re-triggering highlight animation
}

export interface PDFSearchMatch {
  id: number;
  page: number;
  rects: number[][];
  page_width: number;
  page_height: number;
  snippet: string;
}

export interface PDFSearchResult {
  paper_id: number;
  paper_title?: string;
  query: string;
  total_matches: number;
  matches: PDFSearchMatch[];
}

