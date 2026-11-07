/**
 * Documents HTTP adapters — implementation in services/documents/httpHandlers.
 */
export {
  uploadDocument,
  listDocuments,
  getDocumentStatuses,
  getDocument,
  deleteDocument,
  getDocumentChunks,
  reindexDocument,
  retryDocument,
} from '../services/documents/httpHandlers';
