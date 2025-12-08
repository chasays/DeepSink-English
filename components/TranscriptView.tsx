import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';

interface TranscriptViewProps {
  messages: ChatMessage[];
  liveInput: string;
  liveOutput: string;
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ messages, liveInput, liveOutput }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, liveInput, liveOutput]);

  return (
    <div className="absolute z-20 pointer-events-auto 
      left-4 right-4 bottom-32 h-[40vh]
      md:left-4 md:right-auto md:top-20 md:bottom-32 md:w-80 md:h-auto">
      <div className="w-full h-full flex flex-col justify-end">
        <div 
          ref={scrollRef}
          className="max-h-full overflow-y-auto scrollbar-hide space-y-3 p-4 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl mask-image-gradient shadow-xl"
        >
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div 
                className={`max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-indigo-500/30 text-indigo-100 rounded-tr-none border border-indigo-500/30' 
                    : 'bg-white/10 text-gray-100 rounded-tl-none border border-white/10'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Live Output (AI) */}
          {liveOutput && (
            <div className="flex flex-col items-start animate-fade-in">
              <div className="max-w-[90%] p-3 rounded-2xl rounded-tl-none bg-white/10 text-gray-100 border border-white/10 text-sm leading-relaxed opacity-80">
                {liveOutput}
                <span className="inline-block w-1.5 h-3 ml-1 bg-white/50 animate-pulse"/>
              </div>
            </div>
          )}

          {/* Live Input (User) */}
          {liveInput && (
            <div className="flex flex-col items-end animate-fade-in">
               <div className="max-w-[90%] p-3 rounded-2xl rounded-tr-none bg-indigo-500/30 text-indigo-100 border border-indigo-500/30 text-sm leading-relaxed opacity-80">
                {liveInput}
                <span className="inline-block w-1.5 h-3 ml-1 bg-indigo-400/50 animate-pulse"/>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TranscriptView;