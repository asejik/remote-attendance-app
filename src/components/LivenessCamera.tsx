import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { Loader2, Smile, X } from 'lucide-react';

// BETTER APPROACH: Simple Beep using Web Audio API (No file needed)
const playShutterSound = () => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 800; // High pitch beep
  gain.gain.value = 0.1;
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1); // Quick fade
  osc.stop(ctx.currentTime + 0.1);
};

interface LivenessCameraProps {
  onCapture: (imageSrc: string) => void;
  onCancel: () => void;
}

export const LivenessCamera: React.FC<LivenessCameraProps> = ({ onCapture, onCancel }) => {
  const webcamRef = useRef<Webcam>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Loading AI Models...');
  const [faceDetected, setFaceDetected] = useState(false);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      setLoading(false);
      setMessage('Position your face in the oval...');
      startDetection();
    } catch (e) {
      console.error(e);
      setMessage('Error loading AI. Check connection.');
    }
  };

  const startDetection = () => {
    const interval = setInterval(async () => {
      if (!webcamRef.current?.video) return;

      const video = webcamRef.current.video;
      if (video.readyState !== 4) return;

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      if (detections.length > 0) {
        setFaceDetected(true);
        const bestFace = detections[0];

        if (bestFace.expressions.happy > 0.7) {
          setMessage('Smile Detected!');
          clearInterval(interval);
          playShutterSound(); // PLAY SOUND
          setTimeout(() => capture(), 200); // Slight delay for visual feedback
        } else {
          setMessage('Face found! Now SMILE :)');
        }
      } else {
        setFaceDetected(false);
        setMessage('Looking for face...');
      }
    }, 500);

    return () => clearInterval(interval);
  };

  const capture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      onCapture(imageSrc);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
      {/* Cancel Button (Top Right) */}
      <button
        onClick={onCancel}
        className="absolute top-4 right-4 text-white bg-black/40 p-2 rounded-full z-50"
      >
        <X size={24} />
      </button>

      <div className="relative w-full max-w-md aspect-[3/4] bg-gray-900 overflow-hidden rounded-xl">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'user' }}
          className="w-full h-full object-cover"
        />

        {/* FACE OUTLINE OVERLAY (SVG) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg viewBox="0 0 100 100" className="w-[70%] h-[70%] opacity-60">
            <ellipse
              cx="50"
              cy="50"
              rx="30"
              ry="40"
              fill="none"
              stroke={faceDetected ? "#4ade80" : "#fff"} // Green if detected, White if not
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          </svg>
        </div>
      </div>

      <div className="absolute bottom-10 left-0 right-0 px-6 text-center text-white space-y-4">
        <div className="bg-black/60 px-6 py-3 rounded-full backdrop-blur-sm inline-flex items-center space-x-2">
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Smile className={faceDetected ? 'text-green-400' : 'text-gray-400'} />
          )}
          <span className="font-medium">{message}</span>
        </div>
      </div>
    </div>
  );
};