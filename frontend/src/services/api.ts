/** Barrel re-export — preserves existing import paths from `../services/api`. */
export { API_URL, api } from './api/client';
export { authAPI } from './api/auth';
export { chatAPI } from './api/chat';
export { conversationAPI } from './api/conversations';
export { documentsAPI } from './api/documents';
export { modelsAPI } from './api/models';
export { settingsAPI } from './api/settings';
export { usersAPI } from './api/users';
export { adminAPI } from './api/admin';
export { promptsAPI } from './api/prompts';
export { systemAPI } from './api/system';
export { approveToolAction, rejectToolAction } from './api/chat';
