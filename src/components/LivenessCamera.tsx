import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { Loader2, Smile, X } from 'lucide-react';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

// BETTER APPROACH: Simple Beep using Web Audio API (No file needed)
const playShutterSound = () => {
  const AudioCtx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
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

// After this long without a detected smile, offer "take photo anyway". The
// event is then flagged liveness_failed for review; a real clock-in is never blocked.
const FALLBACK_AFTER_MS = 20_000;

interface LivenessCameraProps {
  onCapture: (imageSrc: string, livenessPassed: boolean) => void;
  onCancel: () => void;
  stepLabel?: string; // shown on the camera, e.g. 'Step 2 of 3 · Face photo'
}

export const LivenessCamera: React.FC<LivenessCameraProps> = ({ onCapture, onCancel, stepLabel }) => {
  const webcamRef = useRef<Webcam>(null);
  const onCaptureRef = useRef(onCapture);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Loading AI Models...');
  const [faceDetected, setFaceDetected] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  });

  // Load models, then poll for a smiling face. Everything is torn down when the
  // camera closes, so a cancelled camera can never capture afterwards.
  useEffect(() => {
    let cancelled = false;
    let detecting = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let captureTimeout: ReturnType<typeof setTimeout> | undefined;

    const capture = () => {
      if (cancelled) return;
      const imageSrc = webcamRef.current?.getScreenshot();
      if (imageSrc) onCaptureRef.current(imageSrc, true);
    };
    const fallbackTimer = setTimeout(() => {
      if (!cancelled) setShowFallback(true);
    }, FALLBACK_AFTER_MS);

    const detect = async () => {
      const video = webcamRef.current?.video;
      if (detecting || !video || video.readyState !== 4) return;
      // Test builds only (VITE_E2E=1): skip smile detection so browser tests can
      // clock in with a fake camera. Production builds must not contain this;
      // scripts/check-secrets.mjs fails the build if the marker string appears.
      if (import.meta.env.VITE_E2E === '1') {
        console.warn('E2E_LIVENESS_BYPASS active');
        clearInterval(interval);
        capture();
        return;
      }
      detecting = true;
      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceExpressions();
        if (cancelled) return;

        if (detections.length > 0) {
          setFaceDetected(true);
          if (detections[0].expressions.happy > 0.7) {
            setMessage('Smile Detected!');
            clearInterval(interval);
            playShutterSound();
            captureTimeout = setTimeout(capture, 200); // Slight delay for visual feedback
          } else {
            setMessage('Face found! Now SMILE :)');
          }
        } else {
          setFaceDetected(false);
          setMessage('Looking for face...');
        }
      } finally {
        detecting = false;
      }
    };

    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        if (cancelled) return;
        setLoading(false);
        setMessage('Position your face in the oval...');
        interval = setInterval(detect, 500);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setMessage('Face check unavailable on this device.');
          setShowFallback(true);
        }
      }
    };

    loadModels();
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(captureTimeout);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const captureWithoutSmile = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) onCaptureRef.current(imageSrc, false);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
      {/* Cancel Button (Top Right) */}
      <button
        onClick={onCancel}
        aria-label="Close camera"
        className="absolute top-4 right-4 text-white bg-black/50 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full z-50"
      >
        <X size={24} />
      </button>
      {stepLabel && (
        <p className="absolute top-5 left-4 z-50 rounded-full bg-amber-400 px-3 py-1.5 font-display text-sm font-extrabold uppercase tracking-wide text-gray-900">{stepLabel}</p>
      )}

      <div className="relative w-full max-w-md aspect-[3/4] bg-gray-900 overflow-hidden rounded-card">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'user' }}
          // Mirror only the preview (like a selfie camera); the saved photo keeps
          // its true orientation for comparison with the registered photo.
          className="w-full h-full object-cover -scale-x-100"
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
        {showFallback && (
          <button onClick={captureWithoutSmile} className="block mx-auto min-h-11 px-5 py-3 rounded-full bg-white text-gray-900 font-semibold">
            Take photo without smile check
          </button>
        )}
      </div>
    </div>
  );
};