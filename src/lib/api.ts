/* eslint-disable react-refresh/only-export-components */
import { AgentConfig, AgentHistory } from '../types';

export const api = {
  getConfig: async (): Promise<AgentConfig> => {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to fetch config');
    return res.json();
  },
  saveConfig: async (config: AgentConfig): Promise<void> => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Failed to save config');
  },
  getHistory: async (): Promise<AgentHistory[]> => {
    const res = await fetch('/api/history');
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
  },
  triggerNow: async (): Promise<void> => {
    const res = await fetch('/api/trigger', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger agent');
  },
  testPreview: async (config: AgentConfig): Promise<{ image: string, prompt: string }> => {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate preview');
    return data;
  }
};
