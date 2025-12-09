import { Persona, PersonaId, Scene, SceneId } from './types';

// --- SHADER CODE (The "Rainy Cafe" vibe) ---
export const RAIN_SHADER = `
#ifdef GL_ES
precision mediump float;
#endif

uniform float u_time;
uniform vec2 u_resolution;

float N(float t) {
    return fract(sin(t*12345.564)*7658.76);
}

vec3 Rain(vec2 uv, float t) {
    t *= 40.0;
    vec2 a = vec2(3.0, 1.0);
    vec2 st = uv*a;
    vec2 id = floor(st);
    st.y += t*0.22;
    float n = N(id.x);
    st.y += n; 
    uv.y += n;
    id = floor(st);
    st = fract(st)-0.5;
    t += fract(n*123.2) * 6.283;
    float d = length(st - vec2(0., sin(t+sin(t+sin(t)*0.55))*0.4*a.y));
    float m = smoothstep(0.15, 0.05, d);
    return vec3(m);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv.x *= u_resolution.x/u_resolution.y;
    vec2 UV = gl_FragCoord.xy / u_resolution.xy;
    
    // Background color (Warm Cafe Interior Blur)
    vec3 col = vec3(0.1, 0.05, 0.02); 
    col += 0.2 * vec3(0.5, 0.3, 0.1) * sin(u_time * 0.5 + uv.x * 2.0); // Warm lights
    
    // Rain
    float t = u_time * 0.2;
    vec3 rain = Rain(uv*1.5, t);
    
    // Glass refraction simulation
    col += rain * 0.3; 
    
    gl_FragColor = vec4(col, 1.0);
}
`;

export const PERSONAS: Record<PersonaId, Persona> = {
  [PersonaId.SINK]: {
    id: PersonaId.SINK,
    name: 'Sink',
    role: 'Base System',
    description: 'Your adaptive language partner.',
    voiceName: 'Puck',
    avatarUrl: 'https://picsum.photos/id/64/200/200'
  },
  [PersonaId.ROSS]: {
    id: PersonaId.ROSS,
    name: 'Ross',
    role: 'Sarcastic Friend',
    description: 'Correction obsessed, sarcastic, "Friends" vibe.',
    voiceName: 'Fenrir', // Deeper, maybe slightly more rigorous sounding
    avatarUrl: 'https://picsum.photos/id/1005/200/200'
  },
  [PersonaId.OLIVIA]: {
    id: PersonaId.OLIVIA,
    name: 'Olivia',
    role: 'NYC Banker',
    description: 'Fast-paced, professional, direct, business slang.',
    voiceName: 'Kore', // Calm, professional female
    avatarUrl: 'https://picsum.photos/id/338/200/200'
  },
  [PersonaId.JAKE]: {
    id: PersonaId.JAKE,
    name: 'Jake',
    role: 'Surfer Dude',
    description: 'Chill, slow, uses "like" and "totally", encouraging.',
    voiceName: 'Zephyr', // Friendly
    avatarUrl: 'https://picsum.photos/id/334/200/200'
  }
};

export const SCENES: Record<SceneId, Scene> = {
  [SceneId.COFFEE_SHOP]: {
    id: SceneId.COFFEE_SHOP,
    name: 'Rainy Starbucks',
    type: 'shader',
    shaderCode: RAIN_SHADER,
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/ambiences/cafe_ambience.ogg' 
  },
  [SceneId.NY_STREET]: {
    id: SceneId.NY_STREET,
    name: 'Manhattan Sunset',
    type: 'image',
    imageUrl: 'https://picsum.photos/id/122/1920/1080', // City
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/ambiences/city_street_traffic.ogg'
  },
  [SceneId.BEACH]: {
    id: SceneId.BEACH,
    name: 'Cali Beach',
    type: 'image',
    imageUrl: 'https://picsum.photos/id/1043/1920/1080',
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/nature/sea_waves.ogg'
  },
  [SceneId.PUB]: {
    id: SceneId.PUB,
    name: 'British Pub',
    type: 'image',
    imageUrl: 'https://picsum.photos/id/431/1920/1080', // Dark interior
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/crowds/bar_crowd.ogg' 
  },
  [SceneId.OFFICE]: {
    id: SceneId.OFFICE,
    name: 'Tech Office',
    type: 'image',
    imageUrl: 'https://picsum.photos/id/1/1920/1080',
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/ambiences/office_ambience.ogg'
  },
  [SceneId.GYM]: {
    id: SceneId.GYM,
    name: 'High-end Gym',
    type: 'image',
    imageUrl: 'https://picsum.photos/id/352/1920/1080',
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/ambiences/warehouse_room_tone.ogg'
  },
  [SceneId.MARKET]: {
    id: SceneId.MARKET,
    name: 'Bustling Market',
    type: 'image',
    imageUrl: 'https://picsum.photos/seed/market123/1920/1080', // Seeded random for consistent "market" feel
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/crowds/outdoor_market.ogg'
  },
  [SceneId.LIBRARY]: {
    id: SceneId.LIBRARY,
    name: 'Quiet Library',
    type: 'image',
    imageUrl: 'https://picsum.photos/id/192/1920/1080', // Indoor/Architectural
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/ambiences/quiet_room_tone.ogg'
  },
  [SceneId.FUTURISTIC]: {
    id: SceneId.FUTURISTIC,
    name: 'Neo Tokyo',
    type: 'image',
    imageUrl: 'https://picsum.photos/seed/future99/1920/1080',
    ambientSoundUrl: 'https://actions.google.com/sounds/v1/sci_fi/space_drone.ogg'
  }
};