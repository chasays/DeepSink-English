export enum PersonaId {
  ROSS = 'ROSS',
  OLIVIA = 'OLIVIA',
  JAKE = 'JAKE',
  SINK = 'SINK'
}

export enum SceneId {
  COFFEE_SHOP = 'COFFEE_SHOP',
  NY_STREET = 'NY_STREET',
  BEACH = 'BEACH',
  PUB = 'PUB',
  OFFICE = 'OFFICE',
  GYM = 'GYM',
  MARKET = 'MARKET',
  LIBRARY = 'LIBRARY',
  FUTURISTIC = 'FUTURISTIC'
}

export interface Persona {
  id: PersonaId;
  name: string;
  role: string;
  description: string;
  voiceName: string;
  avatarUrl: string;
}

export interface Scene {
  id: SceneId;
  name: string;
  type: 'shader' | 'image';
  shaderCode?: string; // Fragment shader code
  imageUrl?: string;
  ambientSoundUrl?: string; // Optional ambient sound
}

export interface AudioVisualizerState {
  isTalking: boolean;
  volume: number;
}