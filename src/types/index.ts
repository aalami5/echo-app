// Echo App Type Definitions

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert';

export type MessageStatus = 'sending' | 'sent' | 'failed';

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'offline';

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  audioUri?: string;
  imageUrl?: string;
  card?: RichCard;
  streaming?: boolean;
  status?: MessageStatus;
}

export interface RichCard {
  type: 'calendar' | 'email' | 'task' | 'link' | 'custom';
  title: string;
  subtitle?: string;
  body?: string;
  actions?: CardAction[];
  data?: Record<string, unknown>;
}

export interface CardAction {
  label: string;
  action: string;
  style?: 'default' | 'primary' | 'destructive';
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface ChatState {
  messages: Message[];
  isConnected: boolean;
  avatarState: AvatarState;
}

export interface WebSocketMessage {
  type: 'message' | 'typing' | 'status' | 'pong' | 'avatar_state' | 'done';
  id?: string;
  content?: string;
  state?: AvatarState;
}
