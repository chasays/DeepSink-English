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
      <div className="relative w-full max-w-md bg-gray-900/90 border border-indigo-500/30 rounded-3xl overflow-hidden shadow-2xl animate-slide-up">
        
        {/* Decorative Top Gradient */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-600/20 to-transparent pointer-events-none" />

        <div className="p-8 flex flex-col items-center text-center relative z-10">
          
          <div className="mb-2 text-indigo-400 font-mono text-sm tracking-widest uppercase">Session Report</div>
          <h2 className="text-3xl font-bold text-white mb-6">Speaking Score</h2>

          {/* Main Score Circle */}
          <div className="relative w-40 h-40 flex items-center justify-center mb-8">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle cx="80" cy="80" r="70" stroke="#334155" strokeWidth="12" fill="transparent" />
              <circle 
                cx="80" cy="80" r="70" 
                stroke="#818CF8" 
                strokeWidth="12" 
                fill="transparent" 
                strokeDasharray="440"
                strokeDashoffset={440 - (440 * data.total) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="flex flex-col items-center">
              <span className="text-5xl font-bold text-white">{data.total}</span>
              <span className="text-sm text-gray-400">/ 100</span>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="w-full grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center">
              <span className="text-xs text-gray-400 mb-1">Fluency</span>
              <span className="text-xl font-bold text-emerald-400">{data.fluency}%</span>
            </div>
            <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center">
              <span className="text-xs text-gray-400 mb-1">Vocab</span>
              <span className="text-xl font-bold text-blue-400">{data.vocabulary}%</span>
            </div>
            <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center">
              <span className="text-xs text-gray-400 mb-1">Vibe</span>
              <span className="text-xl font-bold text-purple-400">{data.nativeLike}%</span>
            </div>
          </div>

          {/* AI Comment */}
          <div className="w-full bg-indigo-900/20 border border-indigo-500/20 rounded-xl p-4 mb-8 text-left">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-xs font-bold text-indigo-300 uppercase">AI Feedback</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              "{data.comment}"
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex gap-3">
             <button 
               onClick={onDownloadTranscript}
               className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
               title="Download conversation transcript"
             >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Transcript
             </button>
             <button 
               onClick={onClose}
               className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-indigo-900/50"
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