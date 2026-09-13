import { Paper, SchemaField, Extraction, Settings } from './types';

const API_BASE = '/api';

export const api = {
  async getPapers(): Promise<Paper[]> {
    const res = await fetch(`${API_BASE}/papers`);
    if (!res.ok) throw new Error('Failed to fetch papers');
    return res.json();
  },

  async getPaper(id: number): Promise<Paper> {
    const res = await fetch(`${API_BASE}/papers/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch paper #${id}`);
    return res.json();
  },

  async togglePaperChecked(paperId: number, isChecked?: boolean): Promise<{ status: string; paper_id: number; is_checked: boolean }> {
    const res = await fetch(`${API_BASE}/papers/${paperId}/checked`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: isChecked !== undefined ? JSON.stringify({ is_checked: isChecked }) : JSON.stringify({}),
    });
    if (!res.ok) throw new Error('Failed to update paper checked status');
    return res.json();
  },

  async scanPapers(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/papers/scan`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to scan papers folder');
    return res.json();
  },

  async uploadPaper(file: File): Promise<{ status: string; paper_id: number; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/papers/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to upload paper');
    }
    return res.json();
  },

  async getSchema(): Promise<SchemaField[]> {
    const res = await fetch(`${API_BASE}/schema`);
    if (!res.ok) throw new Error('Failed to fetch schema');
    return res.json();
  },

  async createSchemaField(field: Partial<SchemaField>): Promise<SchemaField> {
    const res = await fetch(`${API_BASE}/schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(field),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create field');
    }
    return res.json();
  },

  async updateSchemaField(id: number, field: Partial<SchemaField>): Promise<SchemaField> {
    const res = await fetch(`${API_BASE}/schema/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(field),
    });
    if (!res.ok) throw new Error('Failed to update field');
    return res.json();
  },

  async deleteSchemaField(id: number): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/schema/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete field');
    return res.json();
  },

  async extractPaper(paperId: number, model?: string): Promise<{ status: string; paper_id: number; extractions: Extraction[] }> {
    const res = await fetch(`${API_BASE}/papers/${paperId}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper_id: paperId, model }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Extraction failed');
    }
    return res.json();
  },

  async extractBatch(
    paperIds?: number[],
    includeAlreadyExtracted: boolean = false,
    model?: string
  ): Promise<{ status: string; processed_count: number; paper_ids: number[] }> {
    const res = await fetch(`${API_BASE}/extract-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paper_ids: paperIds,
        include_already_extracted: includeAlreadyExtracted,
        model,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Batch extraction failed');
    }
    return res.json();
  },

  async updateExtraction(extractionId: number, update: { edited_value?: string; quote?: string; citations?: any[] }): Promise<Extraction> {
    const res = await fetch(`${API_BASE}/extractions/${extractionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error('Failed to update extraction');
    return res.json();
  },

  async addExtractionCitation(extractionId: number, citation: { quote: string; page?: number }): Promise<Extraction> {
    const res = await fetch(`${API_BASE}/extractions/${extractionId}/citations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(citation),
    });
    if (!res.ok) throw new Error('Failed to add citation');
    return res.json();
  },

  async deleteExtractionCitation(extractionId: number, citationIndex: number): Promise<Extraction> {
    const res = await fetch(`${API_BASE}/extractions/${extractionId}/citations/${citationIndex}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete citation');
    return res.json();
  },

  async getSettings(): Promise<Settings> {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async saveSettings(settings: { openrouter_api_key?: string; model?: string; system_prompt?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to save settings');
    return res.json();
  },

  getPaperPdfUrl(paperId: number): string {
    return `${API_BASE}/papers/${paperId}/pdf`;
  },

  async searchPaperPdf(
    paperId: number, 
    query: string, 
    caseSensitive: boolean = false
  ): Promise<{ query: string; total_matches: number; matches: any[]; paper_id: number }> {
    const params = new URLSearchParams({
      q: query,
      case_sensitive: String(caseSensitive)
    });
    const res = await fetch(`${API_BASE}/papers/${paperId}/search?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to search PDF keywords');
    return res.json();
  },

  getExportUrl(
    format: 'csv' | 'json', 
    options?: { paperId?: number; checkedOnly?: boolean } | number
  ): string {
    const params = new URLSearchParams({ format });
    if (typeof options === 'number') {
      params.append('paper_id', String(options));
    } else if (options) {
      if (options.paperId) {
        params.append('paper_id', String(options.paperId));
      } else if (options.checkedOnly) {
        params.append('checked_only', 'true');
      }
    }
    return `${API_BASE}/export?${params.toString()}`;
  }
};
