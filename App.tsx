import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveServerMessage, FunctionDeclaration, Type } from "@google/genai";
import { PERSONAS, SCENES } from './constants';
import { PersonaId, SceneId, ChatMessage, SavedSession } from './types';
import ShaderBackground from './components/ShaderBackground';
import AudioVisualizer from './components/AudioVisualizer';
import FAQSection from './components/FAQSection';
import Fireworks from './components/Fireworks';
import SessionResult, { ScoreData } from './components/SessionResult';
import TranscriptView from './components/TranscriptView';
import HistoryDrawer from './components/HistoryDrawer';
import { createBlob, decodeAudioData, decode } from './utils/audioUtils';
import { geminiService } from './services/gemini';

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
  
  // UI State
  const [isPersonaMenuOpen, setIsPersonaMenuOpen] = useState(false);

  // Voice Activity State
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  
  // Image Analysis State
  const [imageContext, setImageContext] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transcription & History State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveInput, setLiveInput] = useState("");
  const [liveOutput, setLiveOutput] = useState("");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Session Report State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  
  // Refs for Audio
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null); // For VAD
  const volumeIntervalRef = useRef<number>(0);
  
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Refs for Session & Transcript
  const transcriptLogRef = useRef<string>("");
  const currentTurnInputRef = useRef<string>("");
  const currentTurnOutputRef = useRef<string>("");

  // --- Load History on Mount ---
  useEffect(() => {
    try {
      const saved = localStorage.getItem('deepsink_history');
      if (saved) {
        setSavedSessions(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Failed to load history", e);
    }
  }, []);

  // --- Save History Helper ---
  const saveSessionToHistory = (msgs: ChatMessage[], score?: ScoreData) => {
    if (msgs.length === 0) return;
    
    const newSession: SavedSession = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      messages: msgs,
      score: score
    };

    const updated = [newSession, ...savedSessions].slice(0, 20); // Keep last 20
    setSavedSessions(updated);
    localStorage.setItem('deepsink_history', JSON.stringify(updated));
  };

  const clearHistory = () => {
    setSavedSessions([]);
    localStorage.removeItem('deepsink_history');
  };

  // --- Audio Setup & Teardown ---
  const stopAudio = useCallback(() => {
    // Clear Intervals
    if (volumeIntervalRef.current) {
        cancelAnimationFrame(volumeIntervalRef.current);
        volumeIntervalRef.current = 0;
    }
    
    // Stop Nodes
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
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
    setIsAiSpeaking(false);
    setIsUserSpeaking(false);
  }, []);

  // --- Persona Switching ---
  const handlePersonaSelect = (pid: PersonaId) => {
      setIsPersonaMenuOpen(false);
      if (currentPersonaId === pid) return;
      
      setCurrentPersonaId(pid);
      
      // If live, we should probably restart to apply the new voice config
      if (isConnected) {
          handleDisconnect().then(() => {
             // Optional: Auto-reconnect or just let user start again
             // For now, let's let the user start again to avoid state complexity
          });
      }
  };

  // --- Image Analysis ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    setError(null);
    setImageContext(null);

    try {
        // Convert to Base64
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // remove data:image/xxx;base64, prefix
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const text = await geminiService.analyzeImage(base64Data, file.type);
        if (text) {
          setImageContext(text);
        }
    } catch (err) {
        console.error("Image analysis failed", err);
        setError("Failed to analyze image. Please try again.");
    } finally {
        setIsProcessingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
    }
  };

  // --- Gemini Live Connection ---
  const connectToGemini = async () => {
    try {
      setError(null);
      stopAudio(); // Cleanup previous if any
      transcriptLogRef.current = ""; 
      currentTurnInputRef.current = "";
      currentTurnOutputRef.current = "";
      setMessages([]);
      setLiveInput("");
      setLiveOutput("");

      // 1. Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      // Initialize Input Context
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      // CRITICAL: Resume context if suspended (browser autoplay policy)
      if (inputAudioContextRef.current.state === 'suspended') {
        await inputAudioContextRef.current.resume();
      }

      // Initialize Output Context
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      nextStartTimeRef.current = 0;

      // 2. Connect via Service
      const currentPersona = PERSONAS[currentPersonaId];

      await geminiService.connectLive({
        persona: currentPersona,
        imageContext: imageContext,
        tools: [changeSceneFunction, changePersonaFunction],
        onOpen: async () => {
            console.log("Session opened");
            setIsConnected(true);
            
            // Start Mic Stream
            try {
              streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              if(!inputAudioContextRef.current) return;

              const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
              sourceRef.current = source;
              
              // VAD Setup (User Volume)
              const analyser = inputAudioContextRef.current.createAnalyser();
              analyser.fftSize = 256;
              source.connect(analyser);
              analyserRef.current = analyser;
              
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              const checkVolume = () => {
                 if (!analyserRef.current || !isMicOn) {
                     setIsUserSpeaking(false);
                 } else {
                     analyserRef.current.getByteFrequencyData(dataArray);
                     const sum = dataArray.reduce((a,b) => a + b, 0);
                     const avg = sum / dataArray.length;
                     // Threshold for "speaking"
                     setIsUserSpeaking(avg > 15);
                 }
                 volumeIntervalRef.current = requestAnimationFrame(checkVolume);
              };
              checkVolume();
              
              const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                if (!isMicOn) return; 
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                geminiService.sendAudio(pcmBlob);
              };

              source.connect(processor);
              processor.connect(inputAudioContextRef.current.destination);
            } catch (err) {
              console.error("Mic error:", err);
              setError("Microphone access failed.");
            }
        },
        onMessage: async (message: LiveServerMessage) => {
             const serverContent = message.serverContent;
             
             // --- HELPER: Flush User Turn ---
             // Commits current accumulation to history and clears live view
             const flushUserTurn = () => {
                 const text = currentTurnInputRef.current.trim();
                 if (text) {
                     setMessages(prev => [...prev, { role: 'user', text, timestamp: Date.now() }]);
                 }
                 currentTurnInputRef.current = "";
                 setLiveInput("");
             };

             // --- HELPER: Flush AI Turn ---
             const flushAiTurn = () => {
                 const text = currentTurnOutputRef.current.trim();
                 if (text) {
                     setMessages(prev => [...prev, { role: 'model', text, timestamp: Date.now() }]);
                 }
                 currentTurnOutputRef.current = "";
                 setLiveOutput("");
             };

             // 1. Handle Transcription
             
             // User Turn Input
             if (serverContent?.inputTranscription?.text) {
                 // Implicit switch: If AI was talking, finish AI turn
                 if (currentTurnOutputRef.current) flushAiTurn();

                 const text = serverContent.inputTranscription.text;
                 currentTurnInputRef.current += text;
                 setLiveInput(currentTurnInputRef.current);
                 transcriptLogRef.current += `User: ${text}\n`;
             }

             // Model Turn Output
             if (serverContent?.outputTranscription?.text) {
                 // Implicit switch: If User was talking, finish User turn
                 if (currentTurnInputRef.current) flushUserTurn();

                 const text = serverContent.outputTranscription.text;
                 currentTurnOutputRef.current += text;
                 setLiveOutput(currentTurnOutputRef.current);
                 transcriptLogRef.current += `DeepSink: ${text}\n`;
             }

             // Turn Complete (Explicit)
             if (serverContent?.turnComplete) {
                 flushUserTurn();
                 flushAiTurn();
             }

             // 2. Handle Tools
             if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                    if (fc.name === 'changeScene') {
                        const newSceneId = (fc.args as any).sceneId;
                        if (SCENES[newSceneId]) {
                            setCurrentSceneId(newSceneId);
                            geminiService.sendToolResponse({
                                functionResponses: {
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result: `Scene changed to ${newSceneId}` }
                                }
                            });
                        }
                    } else if (fc.name === 'changePersona') {
                        const newPersonaId = (fc.args as any).personaId;
                        if (PERSONAS[newPersonaId]) {
                            setCurrentPersonaId(newPersonaId);
                            geminiService.sendToolResponse({
                                functionResponses: {
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result: `Persona changed to ${newPersonaId}` }
                                }
                            });
                        }
                    }
                }
             }

             // 3. Handle Audio Output
             let base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             
             if (!base64Audio) {
                 base64Audio = serverContent?.modelTurn?.parts?.find?.(part => part.inlineData?.data)?.inlineData?.data;
             }
             
             if (base64Audio && outputAudioContextRef.current) {
                 try {
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
                     gain.gain.value = 1.2; 
                     
                     source.connect(gain);
                     gain.connect(ctx.destination);
                     
                     source.addEventListener('ended', () => {
                         sourcesRef.current.delete(source);
                         // Check if still speaking
                         if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
                     });
                     
                     source.start(nextStartTimeRef.current);
                     nextStartTimeRef.current += audioBuffer.duration;
                     sourcesRef.current.add(source);
                     setIsAiSpeaking(true);
                     
                 } catch (audioError) {
                     console.error("Error playing audio:", audioError);
                 }
             }

             // 4. Handle Interruption
             if (serverContent?.interrupted) {
                 sourcesRef.current.forEach(s => {
                    try { s.stop(); } catch(e) {}
                 });
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
                 setIsAiSpeaking(false);
                 
                 // If interrupted, we might want to flush partial output or just clear it?
                 // Usually interrupted means AI stopped. User might be talking.
                 if (currentTurnOutputRef.current) flushAiTurn();
             }
        },
        onClose: () => {
            console.log("Session closed");
            setIsConnected(false);
            setIsAiSpeaking(false);
            setIsUserSpeaking(false);
        },
        onError: (e) => {
            console.error("Session error", e);
            setError("Connection error. Please refresh.");
            setIsConnected(false);
            setIsAiSpeaking(false);
            setIsUserSpeaking(false);
        }
      });

    } catch (e) {
      console.error(e);
      setError("Failed to initialize AI.");
    }
  };

  const handleDisconnect = async () => {
      // 1. Close Session
      await geminiService.disconnect();
      stopAudio();
      setIsConnected(false);

      // 2. Trigger Analysis Flow
      setIsAnalyzing(true);
      
      // 3. Generate Report via Service
      let finalScore: ScoreData | null = null;
      if (!transcriptLogRef.current || transcriptLogRef.current.length < 50) {
           finalScore = {
            total: 80,
            fluency: 75,
            vocabulary: 80,
            nativeLike: 70,
            comment: "Keep practicing! The session was a bit too short for a full analysis, but you're doing great!"
          };
      } else {
          const data = await geminiService.generateReport(transcriptLogRef.current);
          if (data) {
             finalScore = data;
          } else {
             finalScore = {
                 total: 0, fluency: 0, vocabulary: 0, nativeLike: 0,
                 comment: "Could not generate analysis due to a network error."
             };
          }
      }
      
      setScoreData(finalScore);
      
      // 4. Save to History
      // Ensure we capture any pending partial transcripts
      const finalMessages = [...messages];
      
      // IMPORTANT: Use Ref for disconnect logic as state might be slighty behind in async flow or we want to capture what's in buffer
      if (currentTurnInputRef.current) finalMessages.push({ role: 'user', text: currentTurnInputRef.current.trim(), timestamp: Date.now() });
      else if (liveInput) finalMessages.push({ role: 'user', text: liveInput, timestamp: Date.now() });

      if (currentTurnOutputRef.current) finalMessages.push({ role: 'model', text: currentTurnOutputRef.current.trim(), timestamp: Date.now() });
      else if (liveOutput) finalMessages.push({ role: 'model', text: liveOutput, timestamp: Date.now() });
      
      if (finalMessages.length > 0) {
          saveSessionToHistory(finalMessages, finalScore || undefined);
      }
      setLiveInput("");
      setLiveOutput("");

      setIsAnalyzing(false);
      setShowFireworks(true);
      setShowResult(true);
  };

  const handleCloseResult = () => {
      setShowResult(false);
      setShowFireworks(false);
      setScoreData(null);
  };

  const handleDownloadTranscript = () => {
      const text = transcriptLogRef.current;
      if (!text) return;
      
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deepsink-transcript-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // --- Ambient Audio Management ---
  useEffect(() => {
    const scene = SCENES[currentSceneId];
    if (ambientAudioRef.current) {
       ambientAudioRef.current.pause();
       ambientAudioRef.current = null;
    }

    if (scene.ambientSoundUrl && (isConnected || isAnalyzing || showResult)) {
       const audio = new Audio(scene.ambientSoundUrl);
       audio.loop = true;
       audio.volume = showResult ? 0.1 : 0.2; 
       audio.play().catch(e => console.warn("Autoplay blocked", e));
       ambientAudioRef.current = audio;
    }

    return () => {
        if (ambientAudioRef.current) ambientAudioRef.current.pause();
    };
  }, [currentSceneId, isConnected, isAnalyzing, showResult]);


  // --- Render ---
  const currentScene = SCENES[currentSceneId];
  const currentPersona = PERSONAS[currentPersonaId];

  // Logic to show transcript: if we have history OR we are connected OR analyzing OR showing result
  const showTranscript = (messages.length > 0 || liveInput || liveOutput) || isConnected || isAnalyzing || showResult;

  return (
    <div className="relative w-full h-screen overflow-hidden text-white selection:bg-indigo-500/30">
      
      {/* 1. Background Layer */}
      <ShaderBackground scene={currentScene} />

      {/* 2. Fireworks Layer */}
      {showFireworks && <Fireworks />}

      {/* 3. Result Modal Layer */}
      {showResult && scoreData && <SessionResult data={scoreData} onClose={handleCloseResult} onDownloadTranscript={handleDownloadTranscript} />}

      {/* 4. History Drawer Layer */}
      <HistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} sessions={savedSessions} onClear={clearHistory} />

      {/* 5. Transcript Overlay Layer */}
      {showTranscript && (
        <TranscriptView messages={messages} liveInput={liveInput} liveOutput={liveOutput} />
      )}

      {/* 6. UI Overlay */}
      <div className={`relative z-10 w-full h-full flex flex-col justify-between p-6 overflow-y-auto scrollbar-hide transition-opacity duration-500 ${showResult ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
        
        {/* Header / Stats */}
        <div className="flex justify-between items-start shrink-0">
            {/* Persona Switcher */}
            <div className="relative">
                <button 
                  onClick={() => setIsPersonaMenuOpen(!isPersonaMenuOpen)}
                  className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4 animate-fade-in hover:bg-black/60 transition-colors text-left"
                >
                    <img 
                    src={currentPersona.avatarUrl} 
                    alt={currentPersona.name} 
                    className="w-12 h-12 rounded-full border-2 border-indigo-400"
                    />
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg leading-tight">{currentPersona.name}</h2>
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                        <p className="text-xs text-indigo-200">{currentPersona.role}</p>
                    </div>
                </button>
                
                {/* Persona Dropdown */}
                {isPersonaMenuOpen && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                        {Object.values(PERSONAS).map((p) => (
                            <button
                                key={p.id}
                                onClick={() => handlePersonaSelect(p.id)}
                                className={`w-full p-3 flex items-center gap-3 hover:bg-white/10 transition-colors ${currentPersonaId === p.id ? 'bg-white/10 border-l-4 border-indigo-500' : ''}`}
                            >
                                <img src={p.avatarUrl} className="w-8 h-8 rounded-full" />
                                <div className="text-left">
                                    <div className="font-bold text-sm">{p.name}</div>
                                    <div className="text-xs text-gray-400">{p.role}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="flex gap-4">
                {/* History Toggle */}
                <button 
                  onClick={() => setIsHistoryOpen(true)}
                  className="bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-3 transition-all"
                  title="View History"
                >
                    <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>

                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 text-xs font-mono h-fit">
                    {isConnected ? (
                        <span className="text-green-400 flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/> LIVE
                        </span>
                    ) : (
                        <span className="text-gray-400">OFFLINE</span>
                    )}
                </div>
            </div>
        </div>

        {/* Center Content */}
        <div className={`flex-1 flex flex-col items-center gap-8 ${isConnected || isAnalyzing ? 'justify-start pt-20 md:justify-center md:pt-0 md:pl-80' : 'justify-start pt-10'}`}>
            
            {/* Error Message */}
            {error && (
                <div className="bg-red-500/80 text-white px-6 py-3 rounded-lg backdrop-blur-md">
                    {error}
                </div>
            )}

            {/* Analysis Loading State */}
            {isAnalyzing && (
                 <div className="flex flex-col items-center gap-4 animate-fade-in">
                    <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <h2 className="text-2xl font-bold text-white">Generating Score...</h2>
                    <p className="text-indigo-200 animate-pulse">Analyzing pronunciation & fluency</p>
                 </div>
            )}
            
            {/* Landing Page Content */}
            {!isConnected && !isAnalyzing && !error && (
                 <div className="w-full text-center space-y-4 animate-slide-up">
                    <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-white to-indigo-200 drop-shadow-lg">
                        DeepSink English
                    </h1>
                    <p className="text-lg text-gray-300 max-w-md mx-auto">
                        Your immersive native partner. Choose a scenario or just start talking.
                    </p>
                    
                    <FAQSection />

                    {/* Image Context Preview */}
                    {imageContext && (
                         <div className="mx-auto max-w-md bg-indigo-500/20 border border-indigo-500/50 rounded-xl p-4 flex items-start gap-4 text-left animate-fade-in backdrop-blur-sm">
                             <div className="p-2 bg-indigo-500/20 rounded-lg shrink-0">
                                <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                             </div>
                             <div className="flex-1 min-w-0">
                                 <h3 className="text-sm font-bold text-indigo-200 mb-1">Image Scenario Active</h3>
                                 <p className="text-xs text-indigo-100/70 line-clamp-2">{imageContext}</p>
                             </div>
                             <button onClick={() => setImageContext(null)} className="text-gray-400 hover:text-white p-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                             </button>
                         </div>
                    )}
                 </div>
            )}

            {/* Live Visualizer */}
            {isConnected && (
                <div className="w-full max-w-2xl space-y-2">
                    {/* AI Voice Vis */}
                    <div className={`flex items-center gap-4 transition-opacity duration-300 ${isAiSpeaking ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="text-xs font-mono text-indigo-300 w-12 text-right">SINK</span>
                        <div className="flex-1 h-12 bg-black/30 backdrop-blur-sm rounded-lg border border-indigo-500/30 overflow-hidden relative">
                             <AudioVisualizer isPlaying={isAiSpeaking} color="#818CF8" />
                        </div>
                    </div>
                    
                    {/* User Voice Vis */}
                    <div className={`flex items-center gap-4 transition-opacity duration-300 ${isUserSpeaking ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="text-xs font-mono text-emerald-300 w-12 text-right">YOU</span>
                        <div className="flex-1 h-12 bg-black/30 backdrop-blur-sm rounded-lg border border-emerald-500/30 overflow-hidden relative">
                             <AudioVisualizer isPlaying={isUserSpeaking} color="#34D399" />
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Footer Controls */}
        <div className="flex justify-center items-center gap-6 pb-8 shrink-0">
            {!isConnected && !isAnalyzing ? (
                <div className="flex items-center gap-4 animate-float">
                  <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleFileSelect} 
                  />
                  <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessingImage}
                      className={`p-4 bg-white/10 hover:bg-white/20 text-indigo-200 border border-white/10 rounded-full transition-all backdrop-blur-md ${isProcessingImage ? 'opacity-50 cursor-wait' : ''}`}
                      title="Analyze Image Context"
                  >
                      {isProcessingImage ? (
                          <div className="w-6 h-6 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                      ) : (
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M7 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4H7zm12 14H5V5h11v5h5v9zM17 7h-5v5h5V7zM7 17h10v-2H7v2z"/>
                          </svg>
                      )}
                  </button>

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
            ) : isConnected ? (
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
            ) : null}
        </div>
      </div>
    </div>
  );
};

export default App;