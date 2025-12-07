import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  color?: string;
  height?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying, color = '#60A5FA', height = 'h-12' }) => {
  // Simulated visualizer for aesthetic purposes since extracting real-time analyzer node from 
  // the complex audio context setup in a single file is tricky.
  // In a full production app, we'd hook into the AudioContext AnalyzerNode.
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let offset = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Resize check
      if (canvas.width !== canvas.clientWidth) {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
      }

      if (!isPlaying) {
          // Flat line
          ctx.beginPath();
          ctx.moveTo(0, canvas.height / 2);
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.strokeStyle = '#4B5563'; // Gray
          ctx.stroke();
          return;
      }

      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.moveTo(0, centerY);

      for (let x = 0; x < width; x++) {
        // Create a waveform look using sine waves
        const y = centerY + 
                  Math.sin((x * 0.02) + offset) * (height * 0.3) * Math.sin(x * 0.01) +
                  Math.sin((x * 0.05) + offset * 2) * (height * 0.1);
        ctx.lineTo(x, y);
      }
      
      ctx.stroke();
      offset += 0.2;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, color]);

  return (
    <canvas ref={canvasRef} className={`w-full ${height}`} />
  );
};

export default AudioVisualizer;