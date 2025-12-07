import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { PERSONAS, SCENES } from './constants';
import { PersonaId, SceneId } from './types';
import ShaderBackground from './components/ShaderBackground';
import AudioVisualizer from './components/AudioVisualizer';
import FAQSection from './components/FAQSection';
import { createBlob, decodeAudioData, decode } from './utils/audioUtils';

// --- Tool Definitions ---
const changeSceneFunction: FunctionDeclaration = {
  name: 'changeScene',
  parameters: {
    type: Type.OBJECT,
    description: 'Change the current immersive background scene and ambient sound based on the conversation context.',
    properties: {
      sceneId: {
        type: Type.STRING,
        description: 'The ID of the scene to switch to.',
        enum: Object.keys(SCENES)
      },
    },
    required: ['sceneId'],
  },
};

const changePersonaFunction: FunctionDeclaration = {
  name: 'changePersona',
  parameters: {
    type: Type.OBJECT,
    description: 'Switch the AI personality/character.',
    properties: {
      personaId: {
        type: Type.STRING,
        description: 'The ID of the persona to switch to.',
        enum: Object.keys(PERSONAS)
      },
    },
    required: ['personaId'],
  },
};

const App: React.FC = () => {
  // State
  const [currentSceneId, setCurrentSceneId] = useState<SceneId>(SceneId.COFFEE_SHOP);
  const [currentPersonaId, setCurrentPersonaId] = useState<PersonaId>(PersonaId.SINK);
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for Audio
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Refs for Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  // --- Audio Setup & Teardown ---
  const stopAudio = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    // Stop all playing sources
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
  }, []);

  // --- Gemini Live Connection ---
  const connectToGemini = async () => {
    try {
      setError(null);
      stopAudio(); // Cleanup previous if any

      // 1. Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      nextStartTimeRef.current = 0;

      // 2. Initialize Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentPersona = PERSONAS[currentPersonaId];

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: async () => {
            console.log("Session opened");
            setIsConnected(true);
            
            // Start Mic Stream
            try {
              streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              if(!inputAudioContextRef.current) return;

              const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
              sourceRef.current = source;
              
              const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                if (!isMicOn) return; 
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                
                if (sessionPromiseRef.current) {
                  sessionPromiseRef.current.then(session => {
                    session.sendRealtimeInput({ media: pcmBlob });
                  });
                }
              };

              source.connect(processor);
              processor.connect(inputAudioContextRef.current.destination);
            } catch (err) {
              console.error("Mic error:", err);
              setError("Microphone access failed.");
            }
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle Tools
             if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                    if (fc.name === 'changeScene') {
                        const newSceneId = (fc.args as any).sceneId;
                        if (SCENES[newSceneId]) {
                            setCurrentSceneId(newSceneId);
                            // Send Response
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then(session => {
                                    session.sendToolResponse({
                                        functionResponses: {
                                            id: fc.id,
                                            name: fc.name,
                                            response: { result: `Scene changed to ${newSceneId}` }
                                        }
                                    });
                                });
                            }
                        }
                    } else if (fc.name === 'changePersona') {
                        const newPersonaId = (fc.args as any).personaId;
                        if (PERSONAS[newPersonaId]) {
                            setCurrentPersonaId(newPersonaId);
                            // Note: Voice config changes usually require session restart or are fixed. 
                            // For this MVP, we acknowledge the persona change logic in state, 
                            // but Gemini decides to Act like them.
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then(session => {
                                    session.sendToolResponse({
                                        functionResponses: {
                                            id: fc.id,
                                            name: fc.name,
                                            response: { result: `Persona changed to ${newPersonaId}` }
                                        }
                                    });
                                });
                            }
                        }
                    }
                }
             }

             // Handle Audio Output
             const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
             if (base64Audio && outputAudioContextRef.current) {
                 const ctx = outputAudioContextRef.current;
                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                 
                 const audioBuffer = await decodeAudioData(
                     decode(base64Audio),
                     ctx,
                     24000,
                     1
                 );
                 
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 const gain = ctx.createGain();
                 // Slight boost as raw PCM can be quiet
                 gain.gain.value = 1.2; 
                 
                 source.connect(gain);
                 gain.connect(ctx.destination);
                 
                 source.addEventListener('ended', () => {
                     sourcesRef.current.delete(source);
                 });
                 
                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += audioBuffer.duration;
                 sourcesRef.current.add(source);
             }

             // Handle Interruption
             if (message.serverContent?.interrupted) {
                 sourcesRef.current.forEach(s => s.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
             }
          },
          onclose: () => {
            console.log("Session closed");
            setIsConnected(false);
          },
          onerror: (e) => {
            console.error("Session error", e);
            setError("Connection error. Please refresh.");
            setIsConnected(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: currentPersona.voiceName } },
          },
          systemInstruction: `You are DeepSink, an immersive English native partner. 
          Current Persona: ${currentPersona.name} (${currentPersona.role}). 
          Description: ${currentPersona.description}.
          
          CORE RULES:
          1. IMMERSION: Behave exactly like your persona. Use their slang, tone, and attitude.
          2. CORRECTION: If the user makes a mistake, gently repeat the correct version using the "shadowing" technique (say the correct phrase clearly for them to repeat), then continue the conversation naturally.
          3. SCENE CONTROL: Listen to the user. If they say "I want to order coffee" or "Let's go to the beach", use the 'changeScene' tool immediately to switch the environment.
          4. PERSONA CONTROL: If user asks to talk to someone else (e.g., "Can I talk to Ross?"), use 'changePersona'.
          
          Keep responses concise (1-3 sentences) to encourage conversation.`,
          tools: [{ functionDeclarations: [changeSceneFunction, changePersonaFunction] }]
        }
      };

      // Store promise
      sessionPromiseRef.current = ai.live.connect(config);

    } catch (e) {
      console.error(e);
      setError("Failed to initialize AI.");
    }
  };

  const handleDisconnect = () => {
      // There is no explicit .close() on the session object exposed in the guide?
      // Actually guide says session.close() in rules. But connect returns a Promise<Session>.
      if (sessionPromiseRef.current) {
          // We can't cancel the promise easily, but we can stop audio
          // Ideally we would await sessionPromiseRef.current then call .close(), 
          // but for instant UI reaction we tear down audio first.
          sessionPromiseRef.current.then(s => s.close());
      }
      stopAudio();
      setIsConnected(false);
  };

  // --- Ambient Audio Management ---
  useEffect(() => {
    const scene = SCENES[currentSceneId];
    if (ambientAudioRef.current) {
       ambientAudioRef.current.pause();
       ambientAudioRef.current = null;
    }

    if (scene.ambientSoundUrl && isConnected) {
       const audio = new Audio(scene.ambientSoundUrl);
       audio.loop = true;
       audio.volume = 0.2; // Background level
       audio.play().catch(e => console.warn("Autoplay blocked", e));
       ambientAudioRef.current = audio;
    }

    return () => {
        if (ambientAudioRef.current) ambientAudioRef.current.pause();
    };
  }, [currentSceneId, isConnected]);


  // --- Render ---
  const currentScene = SCENES[currentSceneId];
  const currentPersona = PERSONAS[currentPersonaId];

  return (
    <div className="relative w-full h-screen overflow-hidden text-white selection:bg-indigo-500/30">
      
      {/* 1. Background Layer */}
      <ShaderBackground scene={currentScene} />

      {/* 2. UI Overlay */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-6 overflow-y-auto scrollbar-hide">
        
        {/* Header / Stats */}
        <div className="flex justify-between items-start shrink-0">
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4 animate-fade-in">
                <img 
                   src={currentPersona.avatarUrl} 
                   alt={currentPersona.name} 
                   className="w-12 h-12 rounded-full border-2 border-indigo-400"
                />
                <div>
                    <h2 className="font-bold text-lg leading-tight">{currentPersona.name}</h2>
                    <p className="text-xs text-indigo-200">{currentPersona.role}</p>
                </div>
            </div>
            
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2 text-xs font-mono">
                {isConnected ? (
                    <span className="text-green-400 flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/> LIVE
                    </span>
                ) : (
                    <span className="text-gray-400">OFFLINE</span>
                )}
            </div>
        </div>

        {/* Center Visualizer & Feedback */}
        <div className={`flex-1 flex flex-col items-center gap-8 ${isConnected ? 'justify-center' : 'justify-start pt-10'}`}>
            {error && (
                <div className="bg-red-500/80 text-white px-6 py-3 rounded-lg backdrop-blur-md">
                    {error}
                </div>
            )}
            
            {!isConnected && !error && (
                 <div className="w-full text-center space-y-4 animate-slide-up">
                    <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-white to-indigo-200 drop-shadow-lg">
                        DeepSink English
                    </h1>
                    <p className="text-lg text-gray-300 max-w-md mx-auto">
                        Your immersive native partner. Choose a scenario or just start talking.
                    </p>
                    
                    <FAQSection />
                 </div>
            )}

            {isConnected && (
                <div className="w-full max-w-2xl space-y-2">
                    {/* AI Voice Vis */}
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-mono text-indigo-300 w-12 text-right">SINK</span>
                        <div className="flex-1 h-12 bg-black/30 backdrop-blur-sm rounded-lg border border-indigo-500/30 overflow-hidden relative">
                             <AudioVisualizer isPlaying={isConnected} color="#818CF8" />
                        </div>
                    </div>
                    
                    {/* User Voice Vis */}
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-mono text-emerald-300 w-12 text-right">YOU</span>
                        <div className="flex-1 h-12 bg-black/30 backdrop-blur-sm rounded-lg border border-emerald-500/30 overflow-hidden relative">
                             <AudioVisualizer isPlaying={isConnected && isMicOn} color="#34D399" />
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Footer Controls */}
        <div className="flex justify-center items-center gap-6 pb-8 shrink-0">
            {/* Start / Stop Button */}
            {!isConnected ? (
                <div className="animate-float">
                  <button 
                      onClick={connectToGemini}
                      className="group relative px-8 py-4 bg-white text-black font-bold rounded-full hover:scale-105 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.6)]"
                  >
                      <span className="flex items-center gap-2">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                          Start Conversation
                      </span>
                      <div className="absolute inset-0 rounded-full bg-white blur-lg opacity-40 group-hover:opacity-60 transition-opacity -z-10"></div>
                  </button>
                </div>
            ) : (
                <>
                    <button 
                        onClick={() => setIsMicOn(!isMicOn)}
                        className={`p-4 rounded-full backdrop-blur-md border transition-all ${isMicOn ? 'bg-white/10 border-white/20 text-white' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}
                    >
                         {isMicOn ? (
                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                         ) : (
                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="#F87171" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" stroke="#F87171" /></svg>
                         )}
                    </button>
                    <button 
                        onClick={handleDisconnect}
                        className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-full transition-all shadow-lg shadow-red-900/50"
                    >
                        End Session
                    </button>
                </>
            )}
        </div>
      </div>
    </div>
  );
};

export default App;