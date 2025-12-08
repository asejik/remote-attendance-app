import { useState } from 'react';
import { LogOut, Camera, Loader2, RefreshCw, Cloud, CloudOff, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { saveOfflineAttendance, db } from '../lib/db';
import { syncPendingRecords } from '../lib/sync';
import { useLiveQuery } from 'dexie-react-hooks';
import { LivenessCamera } from '../components/LivenessCamera';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  // State
  const [successMsg, setSuccessMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false); // Used in handleSync
  const [showCamera, setShowCamera] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Database Query
  const pendingCount = useLiveQuery(
    () => db.attendance.where('syncStatus').equals('PENDING').count()
  );

  const handleLogout = () => signOut();

  // 1. User clicks "Clock In" -> We show the Camera
  const startClockInProcess = () => {
    setSuccessMsg('');
    setShowCamera(true);
  };

  // 2. Camera detects smile -> Calls this function with the photo
  const handlePhotoCaptured = async (photoDataUrl: string) => {
    setShowCamera(false);
    setGpsLoading(true);

    try {
      if (!user) return;

      // Convert Base64 string to Blob
      const res = await fetch(photoDataUrl);
      const blob = await res.blob();

      // Get GPS Location
      navigator.geolocation.getCurrentPosition(async (position) => {
        // Save everything to Local DB
        await saveOfflineAttendance(
          user.id,
          'CLOCK_IN',
          { lat: position.coords.latitude, lng: position.coords.longitude },
          blob
        );
        setSuccessMsg('Clock In Successful! (Verified Smile)');
        setGpsLoading(false);
      }, (err) => {
        console.error(err); // FIX: Log the error so 'err' is used
        alert('Could not get GPS location. Please ensure location services are on.');
        setGpsLoading(false);
      }, { enableHighAccuracy: true });

    } catch (e) {
      console.error(e);
      setGpsLoading(false);
    }
  };

  // 3. Sync Logic (Restored)
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingRecords();
      if (result.synced > 0) {
        setSuccessMsg(`Successfully synced ${result.synced} records!`);
      }
    } catch (e) {
      console.error(e);
      alert('Sync failed. Check internet connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* SHOW LIVENESS CAMERA IF ACTIVE */}
      {showCamera && (
        <LivenessCamera
          onCapture={handlePhotoCaptured}
          onCancel={() => setShowCamera(false)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
           <h1 className="text-lg font-bold text-gray-800">My Attendance</h1>
           <p className="text-xs text-gray-500">{user?.email}</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full"
            title="Admin Panel"
          >
            <Shield size={20} />
          </button>
          <button onClick={handleLogout} className="text-gray-500 hover:text-red-500">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center space-y-6">

        {/* Sync Status Card */}
        {pendingCount && pendingCount > 0 ? (
          <div className="w-full bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col items-center animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center text-orange-700 mb-2">
              <CloudOff size={20} className="mr-2" />
              <span className="font-semibold">{pendingCount} Records Pending</span>
            </div>

            {/* FIX: This button now uses isSyncing, setIsSyncing, RefreshCw */}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="text-xs bg-orange-100 text-orange-800 px-3 py-1 rounded-full flex items-center hover:bg-orange-200 transition-colors"
            >
              {isSyncing ? <Loader2 className="animate-spin mr-1" size={12}/> : <RefreshCw className="mr-1" size={12}/>}
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        ) : (
          <div className="w-full bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-center text-green-700">
            <Cloud size={20} className="mr-2" />
            <span className="text-sm font-semibold">All data synced</span>
          </div>
        )}

        {/* Status Card */}
        <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Current Status</p>
          <h2 className="text-3xl font-bold text-gray-800">Clocked OUT</h2>
        </div>

        {/* Success Message */}
        {successMsg && <div className="text-green-600 text-sm font-medium animate-pulse">{successMsg}</div>}

        {/* Big Action Button */}
        <button
          onClick={startClockInProcess}
          disabled={gpsLoading}
          className="group relative flex flex-col items-center justify-center w-48 h-48 bg-white border-4 border-blue-100 rounded-full shadow-lg active:scale-95 transition-all disabled:opacity-70 disabled:cursor-wait"
        >
          <div className="bg-blue-600 p-4 rounded-full text-white mb-2 shadow-md group-hover:bg-blue-700">
            {gpsLoading ? <Loader2 className="animate-spin" size={40} /> : <Camera size={40} />}
          </div>
          <span className="font-bold text-gray-700">
            {gpsLoading ? 'Saving...' : 'Tap to Clock In'}
          </span>
        </button>

        <p className="text-xs text-center text-gray-400 max-w-xs">
          Smile Verification Active
        </p>
      </div>
    </div>
  );
};