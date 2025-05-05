export interface Document {
  id?: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface QueryRequest {
  query: string;
  limit?: number;
}

export interface QueryResponse {
  documents: Document[];
}

export interface AddDocumentRequest {
  documents: Document[];
}

export interface AddDocumentResponse {
  ids: string[];
}

export interface DeleteDocumentRequest {
  ids: string[];
}

export interface DeleteDocumentResponse {
  deleted: number;
}

export interface ResetRequest {
  confirm: boolean;
}

export interface ResetResponse {
  message: string;
}

export interface PdfUploadResponse {
  filename: string;
  paragraphs: number;
  documentIds: string[];
} 