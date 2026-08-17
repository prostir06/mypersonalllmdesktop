import type { AxiosResponse } from 'axios';
import type { SettingsUpdatePayload, UserSettings } from '../../types/api';
import { api } from './client';

export const settingsAPI = {
  get: (): Promise<AxiosResponse<UserSettings>> => api.get('/settings'),
  update: (data: SettingsUpdatePayload): Promise<AxiosResponse<UserSettings>> =>
    api.put('/settings', data),
};
