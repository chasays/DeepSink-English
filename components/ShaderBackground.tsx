import React, { useEffect, useRef } from 'react';
import { Scene } from '../types';

interface ShaderBackgroundProps {
  scene: Scene;
}

const ShaderBackground: React.FC<ShaderBackgroundProps> = ({ scene }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  // Image handling
  if (scene.type === 'image') {
    return (
      <div 
        className="fixed inset-0 w-full h-full bg-cover bg-center transition-all duration-1000 ease-in-out"
        style={{ backgroundImage: `url(${scene.imageUrl})` }}
      >
        <div className="absolute inset-0 bg-black/30" />
      </div>
    );
  }

  // WebGL Shader handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene.shaderCode) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    // Compile Vertex Shader (Simple full screen quad)
    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    if(!vs) return;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    // Compile Fragment Shader
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if(!fs) return;
    gl.shaderSource(fs, scene.shaderCode);
    gl.compileShader(fs);
    
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(fs));
      return;
    }

    const program = gl.createProgram();
    if(!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Geometry
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

    const render = (time: number) => {
      // Resize
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
         canvas.width = canvas.clientWidth;
         canvas.height = canvas.clientHeight;
         gl.viewport(0, 0, canvas.width, canvas.height);
      }

      gl.uniform1f(timeLocation, time * 0.001);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [scene.shaderCode]);

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full z-0" />
      <div className="absolute inset-0 bg-black/20 z-0 pointer-events-none" />
    </>
  );
};

export default ShaderBackground;