import React from 'react';
import { SavedSession } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  onClear: () => void;
}

const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ isOpen, onClose, sessions, onClear }) => {
  return (
    <div 
      className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-gray-900 border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
          <h2 className="text-xl font-bold text-white">History</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {sessions.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">
              <p>No conversation history yet.</p>
              <p className="text-sm mt-2">Complete a session to see it here.</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="bg-white/5 rounded-xl border border-white/5 overflow-hidden">
                <div className="p-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
                  <span className="text-sm font-mono text-indigo-300">
                    {new Date(session.date).toLocaleDateString()} {new Date(session.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  {session.score && (
                    <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                      Score: {session.score.total}
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-3 max-h-60 overflow-y-auto scrollbar-hide">
                  {session.messages.map((msg, idx) => (
                    <div key={idx} className={`text-sm ${msg.role === 'user' ? 'text-gray-400' : 'text-gray-200'}`}>
                      <span className={`text-xs uppercase font-bold mr-2 ${msg.role === 'user' ? 'text-indigo-400' : 'text-emerald-400'}`}>
                        {msg.role === 'user' ? 'You' : 'AI'}
                      </span>
                      {msg.text}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {sessions.length > 0 && (
          <div className="p-6 border-t border-white/10 bg-black/20">
            <button 
              onClick={onClear}
              className="w-full py-3 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/10 transition-colors text-sm font-semibold"
            >
              Clear History
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryDrawer;