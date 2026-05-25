export interface AgentConfig {
  scheduleTime: string; // HH:mm format, simple daily schedule
  prompt?: string;
  promptTemplate: string;
  webhookUrl: string;
  wpUsername?: string;
  webhookToken: string;
  isActive: boolean;
}

export interface AgentHistory {
  id: string;
  timestamp: string;
  status: 'success' | 'error';
  details: string;
  imageUrl?: string;
}
