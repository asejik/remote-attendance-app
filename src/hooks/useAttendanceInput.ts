import { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

export const useAttendanceInput = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get Location (High accuracy)
      // We do this first because it runs in background while camera opens
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000, // Wait max 10 seconds
      });

      // 2. Take Photo
      const image = await Camera.getPhoto({
        quality: 70, // Compress it a bit to save space
        allowEditing: false,
        resultType: CameraResultType.Base64, // We need the data to save locally
        source: CameraSource.Camera,
      });

      if (!image.base64String) {
        throw new Error('No photo data received');
      }

      // 3. Convert Base64 to Blob (for database storage)
      const blob = await (await fetch(`data:image/jpeg;base64,${image.base64String}`)).blob();

      return {
        lat: coordinates.coords.latitude,
        lng: coordinates.coords.longitude,
        photoBlob: blob,
        photoPreview: `data:image/jpeg;base64,${image.base64String}` // To show user
      };

    } catch (err: any) {
      console.error('Capture Error:', err);
      // Nice error handling
      if (err.message === 'User cancelled photos app') {
        setError(null); // Not really an error
      } else {
        setError(err.message || 'Failed to capture data');
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { captureData, loading, error };
};