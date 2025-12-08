import { useState } from 'react'; // Import useState
import { LogOut, Camera, Database, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveOfflineAttendance, db } from '../lib/db';
import { useAttendanceInput } from '../hooks/useAttendanceInput'; // Import our new hook

export const DashboardPage = () => {
  const { signOut, user } = useAuth();
  const { captureData, loading: captureLoading, error: captureError } = useAttendanceInput();
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogout = () => {
    signOut();
  };

  const handleClockIn = async () => {
    if (!user) return;
    setSuccessMsg('');

    // 1. Trigger the input capture (Camera + GPS)
    const data = await captureData();

    if (data) {
      try {
        // 2. Save to Local DB
        await saveOfflineAttendance(
          user.id,
          'CLOCK_IN',
          { lat: data.lat, lng: data.lng },
          data.photoBlob
        );

        const count = await db.attendance.count();
        setSuccessMsg(`Clock In Successful! (Records Pending: ${count})`);
      } catch (err) {
        alert('Failed to save record locally.');
      }
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

        {/* Status Card */}
        <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Current Status</p>
          <h2 className="text-3xl font-bold text-gray-800">Clocked OUT</h2>
          <p className="text-xs text-gray-400 mt-2">Last activity: --</p>
        </div>

        {/* Error / Success Messages */}
        {captureError && (
          <div className="p-3 bg-red-100 text-red-700 text-sm rounded-lg">
            {captureError}
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-green-100 text-green-700 text-sm rounded-lg font-medium">
            {successMsg}
          </div>
        )}

        {/* Big Action Button */}
        <button
          onClick={handleClockIn}
          disabled={captureLoading}
          className="group relative flex flex-col items-center justify-center w-48 h-48 bg-white border-4 border-blue-100 rounded-full shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="bg-blue-600 p-4 rounded-full text-white mb-2 shadow-md group-hover:bg-blue-700">
            {captureLoading ? <Loader2 className="animate-spin" size={40} /> : <Camera size={40} />}
          </div>
          <span className="font-bold text-gray-700">
            {captureLoading ? 'Locating...' : 'Tap to Clock In'}
          </span>
        </button>

        <p className="text-xs text-center text-gray-400 max-w-xs">
          Ensure you are at the site location. A photo verification will be required.
        </p>
      </div>
    </div>
  );
};