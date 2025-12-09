import React from 'react';

export interface ScoreData {
  total: number;
  fluency: number;
  vocabulary: number;
  nativeLike: number;
  comment: string;
}

interface SessionResultProps {
  data: ScoreData;
  onClose: () => void;
  onDownloadTranscript: () => void;
}

const SessionResult: React.FC<SessionResultProps> = ({ data, onClose, onDownloadTranscript }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-gray-900/90 border border-indigo-500/30 rounded-3xl overflow-hidden shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto scrollbar-hide">
        
        {/* Decorative Top Gradient */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-600/20 to-transparent pointer-events-none" />

        <div className="p-8 flex flex-col items-center text-center relative z-10">
          
          <div className="mb-2 text-indigo-400 font-mono text-sm tracking-widest uppercase font-semibold">Session Report</div>
          <h2 className="text-3xl font-extrabold text-white mb-8 tracking-tight">Speaking Performance</h2>

          {/* Main Score Circle - Optimized proportions and added viewBox */}
          <div className="relative w-48 h-48 flex items-center justify-center mb-8 group">
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full transform -rotate-90 drop-shadow-[0_0_20px_rgba(129,138,248,0.3)]">
              {/* Background track circle */}
              <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="transparent" />
              {/* Progress circle */}
              <circle 
                cx="50" cy="50" r="44" 
                stroke="#818CF8" 
                strokeWidth="8" 
                fill="transparent" 
                strokeDasharray="276.46"
                strokeDashoffset={276.46 - (276.46 * data.total) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="flex flex-col items-center animate-fade-in">
              <span className="text-6xl font-black text-white leading-none mb-1 drop-shadow-sm">{data.total}</span>
              <span className="text-xs font-bold text-indigo-300/50 uppercase tracking-widest">Score / 100</span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="w-full grid grid-cols-3 gap-3 mb-8">
            <div className="bg-white/5 rounded-2xl p-3 flex flex-col items-center border border-white/5">
              <span className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wide">Fluency</span>
              <span className="text-xl font-bold text-emerald-400">{data.fluency}%</span>
            </div>
            <div className="bg-white/5 rounded-2xl p-3 flex flex-col items-center border border-white/5">
              <span className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wide">Vocab</span>
              <span className="text-xl font-bold text-blue-400">{data.vocabulary}%</span>
            </div>
            <div className="bg-white/5 rounded-2xl p-3 flex flex-col items-center border border-white/5">
              <span className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wide">Vibe</span>
              <span className="text-xl font-bold text-purple-400">{data.nativeLike}%</span>
            </div>
          </div>

          {/* AI Comment */}
          <div className="w-full bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 mb-8 text-left backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-tighter">AI Feedback</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed italic">
              "{data.comment}"
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex gap-3">
             <button 
               onClick={onDownloadTranscript}
               className="flex-1 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 active:scale-95 border border-white/5"
               title="Download conversation transcript"
             >
                <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Transcript
             </button>
             <button 
               onClick={onClose}
               className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-900/50 active:scale-95"
             >
                Done
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SessionResult;