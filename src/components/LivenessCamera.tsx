import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { Loader2, Smile } from 'lucide-react'; // Removed unused 'Camera'

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
        // FIX: Correct property name is 'faceLandmark68Net'
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      setLoading(false);
      setMessage('Please position your face...');
      startDetection();
    } catch (e) {
      console.error(e);
      setMessage('Error loading AI. Check internet or model path.');
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
          setMessage('Smile Detected! Capturing...');
          clearInterval(interval);
          capture();
        } else {
          setMessage('Face found! Now SMILE to clock in :)');
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
      <div className="relative w-full max-w-md aspect-[3/4] bg-gray-900 overflow-hidden rounded-xl">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'user' }}
          className="w-full h-full object-cover"
        />
        <div className={`absolute inset-0 border-4 transition-colors duration-300 ${faceDetected ? 'border-green-400' : 'border-red-400/30'} m-8 rounded-full opacity-50 pointer-events-none`} />
      </div>

      <div className="absolute bottom-10 left-0 right-0 px-6 text-center text-white space-y-4">
        <div className="bg-black/60 px-6 py-3 rounded-full backdrop-blur-sm">
          {loading ? (
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="animate-spin" />
              <span>{message}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-2 font-bold text-lg">
              <Smile className={faceDetected ? 'text-green-400' : 'text-gray-400'} />
              <span>{message}</span>
            </div>
          )}
        </div>

        <button onClick={onCancel} className="text-gray-400 text-sm hover:text-white underline">
          Cancel
        </button>
      </div>
    </div>
  );
};