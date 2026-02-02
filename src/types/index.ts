// Echo App Type Definitions

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert';

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Message {
  id: string;
  text: string;
  isFromMe: boolean;
  timestamp: number;
  audioUrl?: string;
  imageUrl?: string;
  card?: RichCard;
  avatarState?: AvatarState;
  streaming?: boolean;
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
  type: 'message' | 'typing' | 'status' | 'pong';
  id: string;
  timestamp: number;
  payload: {
    text?: string;
    audio?: string;
    card?: RichCard;
    state?: AvatarState;
  };
  streaming?: boolean;
  final?: boolean;
}
