import React, { useState } from 'react';

type FAQItem = {
  question: string;
  answer: string;
};

// Modular data source - easy to update
const FAQ_DATA: FAQItem[] = [
  {
    question: "How does DeepSink work?",
    answer: "DeepSink uses Google's Gemini 3 Pro model to simulate a real-time native English partner. It listens to you, provides instant shadowing corrections, and adapts its personality to your needs."
  },
  {
    question: "Can I change the scenario?",
    answer: "Yes! The app is fully context-aware. Just say 'I want to practice ordering coffee' or 'Let's go to a job interview', and the background + soundscape will change instantly."
  },
  {
    question: "What personas are available?",
    answer: "You can switch between different personalities like Ross (sarcastic friend), Olivia (NYC banker), or Jake (surfer). Just ask the AI: 'Can I talk to Ross?'"
  },
  {
    question: "Is my microphone data safe?",
    answer: "DeepSink processes audio in real-time for the conversation. We use secure Google Cloud infrastructure and do not store your raw audio data."
  }
];

const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="w-full max-w-lg mx-auto mt-8 bg-black/30 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden animate-slide-up">
      <div className="p-3 border-b border-white/10 bg-white/5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300">Frequently Asked Questions</h3>
      </div>
      {FAQ_DATA.map((item, index) => (
        <div key={index} className="border-b border-white/5 last:border-0">
          <details 
            className="group" 
            open={openIndex === index}
          >
            <summary 
              className="flex justify-between items-center p-3 cursor-pointer hover:bg-white/5 transition-colors select-none list-none"
              onClick={(e) => {
                e.preventDefault();
                setOpenIndex(openIndex === index ? null : index);
              }}
            >
              <span className="font-medium text-sm text-gray-200">{item.question}</span>
              <span className={`transition-transform duration-200 ${openIndex === index ? 'rotate-180' : ''}`}>
                <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="px-3 pb-3 text-xs text-gray-400 leading-relaxed">
              {item.answer}
            </div>
          </details>
        </div>
      ))}
    </div>
  );
};

export default FAQSection;