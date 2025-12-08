import { useState } from 'react';
import { LogOut, Camera, Loader2, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveOfflineAttendance, db } from '../lib/db';
import { syncPendingRecords } from '../lib/sync';
import { useAttendanceInput } from '../hooks/useAttendanceInput';
import { useLiveQuery } from 'dexie-react-hooks';

export const DashboardPage = () => {
  const { signOut, user } = useAuth();
  const { captureData, loading: captureLoading, error: captureError } = useAttendanceInput();
  const [successMsg, setSuccessMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Auto-update pending count using Dexie hook
  const pendingCount = useLiveQuery(
    () => db.attendance.where('syncStatus').equals('PENDING').count()
  );

  const handleLogout = () => signOut();

  const handleClockIn = async () => {
    if (!user) return;
    setSuccessMsg('');
    const data = await captureData();

    if (data) {
      try {
        await saveOfflineAttendance(
          user.id,
          'CLOCK_IN',
          { lat: data.lat, lng: data.lng },
          data.photoBlob
        );
        setSuccessMsg('Saved locally!');
        // Optional: Try to sync immediately if online
        if (navigator.onLine) handleSync();
      } catch (err) {
        alert('Failed to save record locally.');
      }
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingRecords();
      if (result.synced > 0) {
        setSuccessMsg(`Successfully synced ${result.synced} records!`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
           <h1 className="text-lg font-bold text-gray-800">My Attendance</h1>
           <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <button onClick={handleLogout} className="text-gray-500 hover:text-red-500">
          <LogOut size={20} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center space-y-6">

        {/* Sync Status Card - Only shows if there are pending items */}
        {pendingCount && pendingCount > 0 ? (
          <div className="w-full bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col items-center animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center text-orange-700 mb-2">
              <CloudOff size={20} className="mr-2" />
              <span className="font-semibold">{pendingCount} Records Pending</span>
            </div>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="text-xs bg-orange-100 text-orange-800 px-3 py-1 rounded-full flex items-center hover:bg-orange-200"
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

        {/* Error / Success Messages */}
        {captureError && <div className="text-red-600 text-sm">{captureError}</div>}
        {successMsg && <div className="text-green-600 text-sm font-medium">{successMsg}</div>}

        {/* Big Action Button */}
        <button
          onClick={handleClockIn}
          disabled={captureLoading}
          className="group relative flex flex-col items-center justify-center w-48 h-48 bg-white border-4 border-blue-100 rounded-full shadow-lg active:scale-95 transition-all"
        >
          <div className="bg-blue-600 p-4 rounded-full text-white mb-2 shadow-md group-hover:bg-blue-700">
            {captureLoading ? <Loader2 className="animate-spin" size={40} /> : <Camera size={40} />}
          </div>
          <span className="font-bold text-gray-700">
            {captureLoading ? 'Locating...' : 'Tap to Clock In'}
          </span>
        </button>

      </div>
    </div>
  );
};