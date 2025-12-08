import { useState, useEffect } from 'react';
// FIX: All these icons are now used in the UI below
import { LogOut, Camera, Loader2, RefreshCw, Cloud, CloudOff, Shield, CheckCircle, Clock, History, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { saveOfflineAttendance, db } from '../lib/db';
import { syncPendingRecords } from '../lib/sync';
import { useLiveQuery } from 'dexie-react-hooks';
import { LivenessCamera } from '../components/LivenessCamera';
import { supabase } from '../lib/supabase';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';

interface Site {
  id: string;
  name: string;
}

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  // State
  const [successMsg, setSuccessMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showFaceCamera, setShowFaceCamera] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Site State
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');

  // FIX: Removed 'tempFaceBlob' state (not needed)

  // Queries
  const pendingCount = useLiveQuery(() => db.attendance.where('syncStatus').equals('PENDING').count());
  const lastRecord = useLiveQuery(() => db.attendance.orderBy('timestamp').last());
  const historyRecords = useLiveQuery(() => db.attendance.orderBy('timestamp').reverse().limit(5).toArray());

  const isClockedIn = lastRecord?.type === 'CLOCK_IN';

  useEffect(() => {
    const fetchSites = async () => {
      const { data } = await supabase.from('sites').select('id, name');
      if (data) setSites(data);
    };
    fetchSites();
  }, []);

  const handleLogout = () => signOut();

  // STEP 1: Validate Selection & Start
  const startClockProcess = () => {
    if (!selectedSiteId) {
      alert('Please select your CURRENT SITE location first.');
      return;
    }
    setSuccessMsg('');
    setShowFaceCamera(true);
  };

  // STEP 2: Face Captured -> Move to Background Cam
  const handleFaceCaptured = async (photoDataUrl: string) => {
    setShowFaceCamera(false);

    const res = await fetch(photoDataUrl);
    const faceBlob = await res.blob();

    // Pass blob directly to next function (No state needed)
    setTimeout(() => captureBackgroundPhoto(faceBlob), 500);
  };

  // STEP 3: Background Cam -> Save
  const captureBackgroundPhoto = async (faceBlob: Blob) => {
    try {
      const image = await CapacitorCamera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      if (!image.webPath) throw new Error('No photo taken');

      const response = await fetch(image.webPath);
      const siteBlob = await response.blob();

      saveCompleteRecord(faceBlob, siteBlob);

    } catch (e) {
      console.error(e);
      alert('Background photo cancelled. Clock In aborted.');
    }
  };

  // STEP 4: Save to Dexie
  const saveCompleteRecord = (faceBlob: Blob, siteBlob: Blob) => {
    setGpsLoading(true);
    const selectedSite = sites.find(s => s.id === selectedSiteId);

    if (!user || !selectedSite) return;

    const newType = isClockedIn ? 'CLOCK_OUT' : 'CLOCK_IN';

    navigator.geolocation.getCurrentPosition(async (position) => {
      await saveOfflineAttendance(
        user.id,
        user.email || 'Unknown',
        { id: selectedSite.id, name: selectedSite.name },
        newType,
        { lat: position.coords.latitude, lng: position.coords.longitude },
        faceBlob,
        siteBlob
      );

      setSuccessMsg(newType === 'CLOCK_IN' ? 'Success! Clocked In.' : 'Success! Clocked Out.');
      setGpsLoading(false);
    }, (err) => {
      console.error(err);
      alert('GPS Failed. Enable Location.');
      setGpsLoading(false);
    }, { enableHighAccuracy: true });
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingRecords();
      if (result.synced > 0) setSuccessMsg(`Synced ${result.synced} records!`);
    } catch (e) { alert('Sync failed.'); }
    finally { setIsSyncing(false); }
  };

  return (
    <div className="h-full flex flex-col relative bg-gray-50 overflow-y-auto">
      {showFaceCamera && (
        <LivenessCamera
          onCapture={handleFaceCaptured}
          onCancel={() => setShowFaceCamera(false)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div>
           <h1 className="text-lg font-bold text-gray-800">My Attendance</h1>
           <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => navigate('/admin')} className="p-2 text-gray-500 hover:text-blue-600 rounded-full">
            <Shield size={20} />
          </button>
          <button onClick={handleLogout} className="text-gray-500 hover:text-red-500">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 flex flex-col items-center space-y-6 max-w-md mx-auto w-full">

        {/* SITE SELECTION */}
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Your Current Site</label>
          <div className="relative">
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="block w-full rounded-lg border-gray-300 bg-white py-3 pl-3 pr-10 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              disabled={isClockedIn}
            >
              <option value="">-- Choose Site --</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
            <MapPin className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
          </div>
        </div>

        {/* SYNC STATUS CARD (Restored Green State) */}
        {pendingCount && pendingCount > 0 ? (
          <div className="w-full bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col items-center">
            <div className="flex items-center text-orange-700 mb-2">
              <CloudOff size={20} className="mr-2" />
              <span className="font-semibold">{pendingCount} Pending</span>
            </div>
            <button onClick={handleSync} disabled={isSyncing} className="text-xs bg-orange-100 text-orange-800 px-3 py-1 rounded-full flex items-center">
              {isSyncing ? <Loader2 className="animate-spin mr-1" size={12}/> : <RefreshCw className="mr-1" size={12}/>}
              Sync Now
            </button>
          </div>
        ) : (
          <div className="w-full bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-center text-green-700 shadow-sm">
            <Cloud size={16} className="mr-2" />
            <span className="text-xs font-semibold">System Online & Synced</span>
          </div>
        )}

        {/* STATUS CARD (Restored Icons & Timestamp) */}
        <div className={`w-full border rounded-xl p-6 text-center transition-colors duration-500 ${isClockedIn ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
          <p className="text-sm text-gray-500 mb-1">Current Status</p>
          <h2 className={`text-3xl font-bold ${isClockedIn ? 'text-green-700' : 'text-gray-800'}`}>{isClockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}</h2>

          {lastRecord && (
            <div className="mt-2 text-sm text-gray-500 flex flex-col items-center">
               <span className="font-medium text-gray-700">{lastRecord.siteName}</span>
               <div className="flex items-center mt-1 text-xs text-gray-400">
                  <Clock size={12} className="mr-1" />
                  {new Date(lastRecord.timestamp).toLocaleTimeString()}
               </div>
            </div>
          )}

          {/* Check Circle Icon */}
          {isClockedIn && <div className="mt-2 flex justify-center text-green-600"><CheckCircle size={16} /></div>}
        </div>

        {/* Success Msg */}
        {successMsg && <div className="text-green-600 text-sm font-medium animate-bounce">{successMsg}</div>}

        {/* Action Button */}
        <button
          onClick={startClockProcess}
          disabled={gpsLoading}
          className={`group relative flex flex-col items-center justify-center w-48 h-48 border-4 rounded-full shadow-lg transition-all active:scale-95
            ${isClockedIn ? 'bg-red-50 border-red-100' : 'bg-white border-blue-100'}
          `}
        >
          <div className={`p-4 rounded-full text-white mb-2 shadow-md
            ${isClockedIn ? 'bg-red-500' : 'bg-blue-600'}`}>
            {gpsLoading ? <Loader2 className="animate-spin" size={40} /> : <Camera size={40} />}
          </div>
          <span className={`font-bold ${isClockedIn ? 'text-red-700' : 'text-gray-700'}`}>
            {gpsLoading ? 'Saving...' : (isClockedIn ? 'Tap to Clock OUT' : 'Tap to Clock IN')}
          </span>
        </button>

        <p className="text-xs text-center text-gray-400">
          Step 1: Face Check  |  Step 2: Site Photo
        </p>

        {/* HISTORY PANE (Restored History Icon) */}
        <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center">
            <History size={16} className="text-gray-500 mr-2" />
            <span className="text-sm font-bold text-gray-700">Recent Activity</span>
          </div>
          <div className="divide-y divide-gray-100">
            {historyRecords?.map((rec) => (
              <div key={rec.id} className="px-4 py-3 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-600">{rec.siteName}</span>
                  <span className={`text-xs ${rec.type === 'CLOCK_IN' ? 'text-green-600' : 'text-red-600'}`}>{rec.type}</span>
                </div>
                <div className="text-xs text-gray-500">
                   {new Date(rec.timestamp).toLocaleString('en-NG', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};