import { useState, useEffect } from 'react';
import { LogOut, Camera, Loader2, RefreshCw, Cloud, CloudOff, Shield, CheckCircle, Clock, History } from 'lucide-react';
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Cooldown State
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // 1. QUERY: Pending Count
  const pendingCount = useLiveQuery(
    () => db.attendance.where('syncStatus').equals('PENDING').count()
  );

  // 2. QUERY: Last Record (For Status & Cooldown)
  const lastRecord = useLiveQuery(
    () => db.attendance.orderBy('timestamp').last()
  );

  // 3. QUERY: History (Last 5 records, newest first)
  const historyRecords = useLiveQuery(
    () => db.attendance.orderBy('timestamp').reverse().limit(5).toArray()
  );

  // 4. LOGIC: Calculate Status & Cooldown
  const isClockedIn = lastRecord?.type === 'CLOCK_IN';

  // Effect to update cooldown timer
  useEffect(() => {
    if (!lastRecord) return;

    const COOLDOWN_MINUTES = 5;
    const interval = setInterval(() => {
      const lastTime = new Date(lastRecord.timestamp).getTime();
      const now = Date.now();
      const diffMinutes = (now - lastTime) / 1000 / 60;

      if (diffMinutes < COOLDOWN_MINUTES) {
        const remainingSeconds = Math.ceil((COOLDOWN_MINUTES - diffMinutes) * 60);
        setCooldownRemaining(remainingSeconds);
      } else {
        setCooldownRemaining(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastRecord]);

  // Format Helpers
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-NG', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const handleLogout = () => signOut();

  const startClockProcess = () => {
    setSuccessMsg('');
    setShowCamera(true);
  };

  const handlePhotoCaptured = async (photoDataUrl: string) => {
    setShowCamera(false);
    setGpsLoading(true);

    try {
      if (!user) return;
      const res = await fetch(photoDataUrl);
      const blob = await res.blob();
      const newType = isClockedIn ? 'CLOCK_OUT' : 'CLOCK_IN';

      navigator.geolocation.getCurrentPosition(async (position) => {
        await saveOfflineAttendance(
          user.id,
          newType,
          { lat: position.coords.latitude, lng: position.coords.longitude },
          blob
        );
        setSuccessMsg(newType === 'CLOCK_IN' ? 'Welcome! Clocked In.' : 'Goodbye! Clocked Out.');
        setGpsLoading(false);
      }, (err) => {
        console.error(err);
        alert('Could not get GPS. Please enable location.');
        setGpsLoading(false);
      }, { enableHighAccuracy: true });

    } catch (e) {
      console.error(e);
      setGpsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingRecords();
      if (result.synced > 0) {
        setSuccessMsg(`Synced ${result.synced} records to HQ!`);
      }
    } catch (e) {
      console.error(e);
      alert('Sync failed. Check internet.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative bg-gray-50 overflow-y-auto">
      {showCamera && (
        <LivenessCamera
          onCapture={handlePhotoCaptured}
          onCancel={() => setShowCamera(false)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div>
           <h1 className="text-lg font-bold text-gray-800">My Attendance</h1>
           <p className="text-xs text-gray-500">{user?.email}</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
          >
            <Shield size={20} />
          </button>
          <button onClick={handleLogout} className="text-gray-500 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 flex flex-col items-center space-y-6 max-w-md mx-auto w-full">

        {/* Sync Status Card */}
        {pendingCount && pendingCount > 0 ? (
          <div className="w-full bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col items-center animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center text-orange-700 mb-2">
              <CloudOff size={20} className="mr-2" />
              <span className="font-semibold">{pendingCount} Records Pending</span>
            </div>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="text-xs bg-orange-100 text-orange-800 px-3 py-1 rounded-full flex items-center hover:bg-orange-200 transition-colors"
            >
              {isSyncing ? <Loader2 className="animate-spin mr-1" size={12}/> : <RefreshCw className="mr-1" size={12}/>}
              {isSyncing ? 'Syncing...' : 'Push Data to HQ'}
            </button>
          </div>
        ) : (
          <div className="w-full bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-center text-green-700 shadow-sm">
            <Cloud size={16} className="mr-2" />
            <span className="text-xs font-semibold">System Online & Synced</span>
          </div>
        )}

        {/* DYNAMIC STATUS CARD with TIMESTAMP */}
        <div className={`w-full border rounded-xl p-6 text-center transition-colors duration-500 ${isClockedIn ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
          <p className="text-sm text-gray-500 mb-1">Current Status</p>
          <h2 className={`text-3xl font-bold ${isClockedIn ? 'text-green-700' : 'text-gray-800'}`}>
            {isClockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}
          </h2>

          {/* Timestamp Display */}
          {lastRecord && (
            <div className="mt-2 text-sm text-gray-500 flex justify-center items-center">
              <Clock size={14} className="mr-1" />
              <span>Since: {formatDate(lastRecord.timestamp)}</span>
            </div>
          )}

          {isClockedIn && <div className="mt-2 flex justify-center text-green-600"><CheckCircle size={16} /></div>}
        </div>

        {/* Success Message */}
        {successMsg && <div className="text-green-600 text-sm font-medium animate-bounce">{successMsg}</div>}

        {/* ACTION BUTTON with COOLDOWN */}
        <div className="relative">
          <button
            onClick={startClockProcess}
            disabled={gpsLoading || cooldownRemaining > 0}
            className={`group relative flex flex-col items-center justify-center w-48 h-48 border-4 rounded-full shadow-lg transition-all
              ${cooldownRemaining > 0 ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-300' : 'active:scale-95'}
              ${isClockedIn && cooldownRemaining === 0 ? 'bg-red-50 border-red-100 hover:bg-red-100' : ''}
              ${!isClockedIn && cooldownRemaining === 0 ? 'bg-white border-blue-100 hover:bg-blue-50' : ''}
            `}
          >
            <div className={`p-4 rounded-full text-white mb-2 shadow-md transition-colors
              ${cooldownRemaining > 0 ? 'bg-gray-400' : (isClockedIn ? 'bg-red-500 group-hover:bg-red-600' : 'bg-blue-600 group-hover:bg-blue-700')}`}>
              {gpsLoading ? <Loader2 className="animate-spin" size={40} /> : <Camera size={40} />}
            </div>

            <span className={`font-bold ${cooldownRemaining > 0 ? 'text-gray-500' : (isClockedIn ? 'text-red-700' : 'text-gray-700')}`}>
              {gpsLoading ? 'Processing...' : (
                cooldownRemaining > 0
                  ? `Wait ${formatTime(cooldownRemaining)}`
                  : (isClockedIn ? 'Tap to Clock OUT' : 'Tap to Clock IN')
              )}
            </span>
          </button>
        </div>

        {/* HISTORY PANE */}
        <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center">
            <History size={16} className="text-gray-500 mr-2" />
            <span className="text-sm font-bold text-gray-700">Recent Activity</span>
          </div>
          <div className="divide-y divide-gray-100">
            {historyRecords && historyRecords.length > 0 ? (
              historyRecords.map((rec) => (
                <div key={rec.id} className="px-4 py-3 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">
                      {new Date(rec.timestamp).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className={`text-sm font-bold ${rec.type === 'CLOCK_IN' ? 'text-green-700' : 'text-red-700'}`}>
                      {rec.type === 'CLOCK_IN' ? 'Clock In' : 'Clock Out'}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded">
                    {new Date(rec.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-gray-400">No history yet.</div>
            )}
          </div>
        </div>

        <p className="text-xs text-center text-gray-400 max-w-xs">
          Smile Verification Required for both IN and OUT.
        </p>
      </div>
    </div>
  );
};