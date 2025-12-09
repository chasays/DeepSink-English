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

const changeSceneFunction: FunctionDeclaration = {
  name: 'changeScene',
  parameters: {
    type: Type.OBJECT,
    description: 'Change the current immersive background scene.',
    properties: { sceneId: { type: Type.STRING, enum: Object.keys(SCENES) } },
    required: ['sceneId'],
  },
};

const changePersonaFunction: FunctionDeclaration = {
  name: 'changePersona',
  parameters: {
    type: Type.OBJECT,
    description: 'Switch the AI personality.',
    properties: { personaId: { type: Type.STRING, enum: Object.keys(PERSONAS) } },
    required: ['personaId'],
  },
};

const App: React.FC = () => {
  const [currentSceneId, setCurrentSceneId] = useState<SceneId>(SceneId.COFFEE_SHOP);
  const [currentPersonaId, setCurrentPersonaId] = useState<PersonaId>(PersonaId.SINK);
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPersonaMenuOpen, setIsPersonaMenuOpen] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  
  const [imageContext, setImageContext] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  
  const [searchTopic, setSearchTopic] = useState("");
  const [activeSearchTopic, setActiveSearchTopic] = useState("");
  const [searchSummary, setSearchSummary] = useState<string | null>(null);
  const [searchLinks, setSearchLinks] = useState<{title: string, uri: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveInput, setLiveInput] = useState("");
  const [liveOutput, setLiveOutput] = useState("");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<number>(0);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptLogRef = useRef<string>("");
  const currentTurnInputRef = useRef<string>("");
  const currentTurnOutputRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('deepsink_history');
      if (saved) setSavedSessions(JSON.parse(saved));
    } catch (e) {}
  }, []);

  const stopAudio = useCallback(() => {
    if (volumeIntervalRef.current) cancelAnimationFrame(volumeIntervalRef.current);
    if (processorRef.current) processorRef.current.disconnect();
    if (sourceRef.current) sourceRef.current.disconnect();
    if (analyserRef.current) analyserRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    setIsAiSpeaking(false);
    setIsUserSpeaking(false);
  }, []);

  const handleSearchTopic = async () => {
    if (!searchTopic) return;
    setIsSearching(true);
    setError(null);
    try {
        const result = await geminiService.searchGrounding(searchTopic);
        setSearchSummary(result.summary);
        setSearchLinks(result.links);
        setActiveSearchTopic(searchTopic);
    } catch (err) {
        setError("Failed to reach Google Search. Try simpler keywords.");
    } finally {
        setIsSearching(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingImage(true);
    try {
        const readerResult = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        });
        setImagePreviewUrl(readerResult);
        const base64Data = readerResult.split(',')[1];
        const text = await geminiService.analyzeImage(base64Data, file.type);
        if (text) setImageContext(text);
    } catch (err) {
        setError("Failed to process image.");
    } finally {
        setIsProcessingImage(false);
    }
  };

  const clearImageContext = () => {
    setImageContext(null);
    setImagePreviewUrl(null);
  };

  const clearSearchContext = () => {
    setSearchSummary(null);
    setActiveSearchTopic("");
    setSearchLinks([]);
  };

  const connectToGemini = async () => {
    try {
      setError(null);
      stopAudio();
      transcriptLogRef.current = ""; 
      currentTurnInputRef.current = "";
      currentTurnOutputRef.current = "";
      setMessages([]);
      setLiveInput("");
      setLiveOutput("");

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      if (inputAudioContextRef.current.state === 'suspended') await inputAudioContextRef.current.resume();
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      nextStartTimeRef.current = 0;

      const persona = PERSONAS[currentPersonaId];

      await geminiService.connectLive({
        persona,
        imageContext,
        searchContext: searchSummary,
        tools: [changeSceneFunction, changePersonaFunction],
        onOpen: async () => {
            setIsConnected(true);
            try {
              streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              if(!inputAudioContextRef.current) return;
              const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
              sourceRef.current = source;
              const analyser = inputAudioContextRef.current.createAnalyser();
              analyser.fftSize = 256;
              source.connect(analyser);
              analyserRef.current = analyser;
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              const checkVolume = () => {
                 if (analyserRef.current && isMicOn) {
                     analyserRef.current.getByteFrequencyData(dataArray);
                     const sum = dataArray.reduce((a,b) => a + b, 0);
                     setIsUserSpeaking((sum / dataArray.length) > 15);
                 } else setIsUserSpeaking(false);
                 volumeIntervalRef.current = requestAnimationFrame(checkVolume);
              };
              checkVolume();
              const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;
              processor.onaudioprocess = (e) => {
                if (isMicOn) geminiService.sendAudio(createBlob(e.inputBuffer.getChannelData(0)));
              };
              source.connect(processor);
              processor.connect(inputAudioContextRef.current.destination);
            } catch (err) { setError("Microphone access failed."); }
        },
        onMessage: async (message: LiveServerMessage) => {
             const serverContent = message.serverContent;
             const flushUserTurn = () => {
                 if (currentTurnInputRef.current.trim()) setMessages(prev => [...prev, { role: 'user', text: currentTurnInputRef.current.trim(), timestamp: Date.now() }]);
                 currentTurnInputRef.current = ""; setLiveInput("");
             };
             const flushAiTurn = () => {
                 if (currentTurnOutputRef.current.trim()) setMessages(prev => [...prev, { role: 'model', text: currentTurnOutputRef.current.trim(), timestamp: Date.now() }]);
                 currentTurnOutputRef.current = ""; setLiveOutput("");
             };

             if (serverContent?.inputTranscription?.text) {
                 if (currentTurnOutputRef.current) flushAiTurn();
                 currentTurnInputRef.current += serverContent.inputTranscription.text;
                 setLiveInput(currentTurnInputRef.current);
                 transcriptLogRef.current += `User: ${serverContent.inputTranscription.text}\n`;
             }
             if (serverContent?.outputTranscription?.text) {
                 if (currentTurnInputRef.current) flushUserTurn();
                 currentTurnOutputRef.current += serverContent.outputTranscription.text;
                 setLiveOutput(currentTurnOutputRef.current);
                 transcriptLogRef.current += `Sink: ${serverContent.outputTranscription.text}\n`;
             }
             if (serverContent?.turnComplete) { flushUserTurn(); flushAiTurn(); }

             if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                    if (fc.name === 'changeScene' && SCENES[(fc.args as any).sceneId]) {
                        setCurrentSceneId((fc.args as any).sceneId);
                        geminiService.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } } });
                    }
                }
             }

             const base64Audio = serverContent?.modelTurn?.parts?.find?.(part => part.inlineData?.data)?.inlineData?.data;
             if (base64Audio && outputAudioContextRef.current) {
                 const ctx = outputAudioContextRef.current;
                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                 const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(ctx.destination);
                 source.addEventListener('ended', () => { sourcesRef.current.delete(source); if (sourcesRef.current.size === 0) setIsAiSpeaking(false); });
                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += audioBuffer.duration;
                 sourcesRef.current.add(source);
                 setIsAiSpeaking(true);
             }
             if (serverContent?.interrupted) {
                 sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
                 setIsAiSpeaking(false);
                 if (currentTurnOutputRef.current) flushAiTurn();
             }
        },
        onClose: () => setIsConnected(false),
        onError: () => setIsConnected(false)
      });
    } catch (e) { setError("Failed to initialize session."); }
  };

  const handleDisconnect = async () => {
      await geminiService.disconnect();
      stopAudio();
      setIsAnalyzing(true);
      const score = await geminiService.generateReport(transcriptLogRef.current);
      setScoreData(score || { total: 0, fluency: 0, vocabulary: 0, nativeLike: 0, comment: "Error" });
      setShowFireworks(true);
      setShowResult(true);
      setIsAnalyzing(false);
  };

  useEffect(() => {
    const scene = SCENES[currentSceneId];
    if (ambientAudioRef.current) { ambientAudioRef.current.pause(); ambientAudioRef.current = null; }
    if (scene.ambientSoundUrl && (isConnected || showResult)) {
       const audio = new Audio(scene.ambientSoundUrl); audio.loop = true; audio.volume = 0.2; audio.play().catch(()=>{});
       ambientAudioRef.current = audio;
    }
    return () => { if (ambientAudioRef.current) ambientAudioRef.current.pause(); };
  }, [currentSceneId, isConnected, showResult]);

  const currentScene = SCENES[currentSceneId];
  const currentPersona = PERSONAS[currentPersonaId];

  return (
    <div className="relative w-full h-screen overflow-hidden text-white bg-black">
      <ShaderBackground scene={currentScene} />
      {showFireworks && <Fireworks />}
      {showResult && scoreData && <SessionResult data={scoreData} onClose={() => setShowResult(false)} onDownloadTranscript={()=>{}} />}
      
      <HistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} sessions={savedSessions} onClear={()=>setSavedSessions([])} onSummarize={()=>{}} isSummarizing={false} />

      { (messages.length > 0 || liveInput || liveOutput) && <TranscriptView messages={messages} liveInput={liveInput} liveOutput={liveOutput} /> }

      <div className={`relative z-10 w-full h-full flex flex-col justify-between p-6 ${showResult ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex justify-between items-start">
            <div className="relative">
                <button onClick={() => setIsPersonaMenuOpen(!isPersonaMenuOpen)} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4 text-left">
                    <img src={currentPersona.avatarUrl} className="w-12 h-12 rounded-full border-2 border-indigo-400"/>
                    <div>
                        <div className="flex items-center gap-2"><h2 className="font-bold text-lg leading-tight">{currentPersona.name}</h2></div>
                        <p className="text-xs text-indigo-200">{currentPersona.role}</p>
                    </div>
                </button>
                {isPersonaMenuOpen && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                        {Object.values(PERSONAS).map(p => (
                            <button key={p.id} onClick={() => { setCurrentPersonaId(p.id); setIsPersonaMenuOpen(false); }} className="w-full p-3 flex items-center gap-3 hover:bg-white/10">
                                <img src={p.avatarUrl} className="w-8 h-8 rounded-full" /><div className="text-left font-bold text-sm">{p.name}</div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex gap-4">
                <button 
                  onClick={() => setIsHistoryOpen(true)} 
                  className="bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center gap-2"
                >
                  <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="hidden md:inline">History</span>
                </button>
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 text-xs font-mono">{isConnected ? 'LIVE' : 'OFFLINE'}</div>
            </div>
        </div>

        <div className={`flex-1 flex flex-col items-center gap-8 justify-center`}>
            {error && <div className="bg-red-500/80 px-6 py-3 rounded-lg">{error}</div>}
            {isAnalyzing && <h2 className="text-2xl font-bold animate-pulse">Analyzing...</h2>}
            {!isConnected && !isAnalyzing && (
                 <div className="w-full text-center space-y-6">
                    <h1 className="text-5xl font-bold text-white tracking-tight">DeepSink English</h1>
                    
                    <div className="max-w-md mx-auto space-y-4">
                        <div className="relative bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-1 flex items-center overflow-hidden transition-all focus-within:ring-2 ring-indigo-500/50 group">
                            <input 
                                value={searchTopic}
                                onChange={(e) => setSearchTopic(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearchTopic()}
                                placeholder="Trending topic or URL..."
                                className="flex-1 bg-transparent px-5 py-3 outline-none placeholder:text-gray-500 text-sm"
                            />
                            <button 
                                onClick={handleSearchTopic}
                                disabled={isSearching || !searchTopic}
                                className={`px-6 py-3 bg-indigo-500 rounded-xl font-bold text-xs transition-all ${isSearching ? 'opacity-50' : 'hover:bg-indigo-400 active:scale-95'}`}
                            >
                                {isSearching ? 'Searching...' : activeSearchTopic ? 'Update Topic' : 'Search News'}
                            </button>
                        </div>
                        
                        {searchLinks.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-2 animate-fade-in">
                                {searchLinks.slice(0, 3).map((link, idx) => (
                                    <a 
                                        key={idx} 
                                        href={link.uri} 
                                        target="_blank" 
                                        className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-[10px] text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        {link.title || "Reference Source"}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    <FAQSection />
                 </div>
            )}
            {isConnected && (
                <div className="w-full max-w-2xl space-y-4">
                    <div className="flex-1 h-20 bg-black/30 backdrop-blur-sm rounded-lg border border-indigo-500/30"><AudioVisualizer isPlaying={isAiSpeaking} color="#818CF8" /></div>
                    <div className="flex-1 h-20 bg-black/30 backdrop-blur-sm rounded-lg border border-emerald-500/30"><AudioVisualizer isPlaying={isUserSpeaking} color="#34D399" /></div>
                </div>
            )}
        </div>

        <div className="flex flex-col items-center pb-8 gap-4">
            {!isConnected && (activeSearchTopic || imagePreviewUrl) && (
              <div className="flex items-center gap-3 animate-slide-up mb-2">
                {activeSearchTopic && (
                  <div className="flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full pl-3 pr-1 py-1">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase truncate max-w-[120px]">Topic: {activeSearchTopic}</span>
                    <button onClick={clearSearchContext} className="p-1 hover:bg-white/10 rounded-full text-indigo-300">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
                {imagePreviewUrl && (
                  <div className="relative group">
                    <img src={imagePreviewUrl} className="w-8 h-8 rounded-lg object-cover border border-white/20" />
                    <button 
                      onClick={clearImageContext} 
                      className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 rounded-full text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-1">Context Applied</span>
              </div>
            )}

            {!isConnected ? (
              <div className="flex items-center gap-4">
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
                    className={`p-5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition-all ${isProcessingImage ? 'opacity-50' : ''} ${imagePreviewUrl ? 'ring-2 ring-indigo-500 border-indigo-500' : ''}`}
                    title="Add Image Context"
                >
                    <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </button>
                <button 
                  onClick={connectToGemini} 
                  className="px-10 py-5 bg-white text-black font-black rounded-full hover:scale-105 transition-all text-lg shadow-2xl"
                >
                  Start Speaking
                </button>
              </div>
            ) : (
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsMicOn(!isMicOn)} 
                        className={`p-5 rounded-full backdrop-blur-md border transition-all ${isMicOn ? 'bg-white/10' : 'bg-red-500/20 border-red-500'}`}
                    >
                      {isMicOn ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="#F87171" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" stroke="#F87171" />
                        </svg>
                      )}
                    </button>
                    <button onClick={handleDisconnect} className="px-10 py-5 bg-red-500 text-white font-bold rounded-full">End Session</button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default App;