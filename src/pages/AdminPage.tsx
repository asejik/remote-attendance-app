import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin, Loader2, Download, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Log {
  id: string;
  user_id: string;
  timestamp: string;
  photo_path: string;
  site_photo_path?: string;
  site_name_snapshot?: string;
  latitude: number;
  longitude: number;
}

export const AdminPage = () => {
  const { signOut } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    const { data } = await supabase.from('attendance_logs').select('*').order('timestamp', { ascending: false });
    if (data) setLogs(data);
    setLoading(false);
  };

  const downloadReport = () => {
    const headers = ['User ID', 'Date/Time', 'Site Name', 'Latitude', 'Longitude', 'Face Photo', 'Site Photo'];
    const rows = logs.map(log => [
      log.user_id,
      new Date(log.timestamp).toLocaleString(),
      log.site_name_snapshot || 'Unknown',
      log.latitude,
      log.longitude,
      log.photo_path,
      log.site_photo_path || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(item => `"${item}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Report_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const handleLogout = async () => {
    await signOut();
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 1. TOP HEADER BAR */}
      <div className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Attendance Monitoring</h1>
          <p className="text-xs text-gray-500">ABC Company • HQ View</p>
        </div>
        <button onClick={handleLogout} className="flex items-center space-x-2 text-gray-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
          <span className="text-sm font-medium">Logout</span>
          <LogOut size={18} />
        </button>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        {/* 2. TOOLBAR ROW */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-700">Submission Logs</h2>

          <button
            onClick={downloadReport}
            className="flex items-center space-x-2 bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 transition text-sm shadow-sm"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>

        {/* 3. LOGS GRID */}
        <div className="grid gap-4">
          {logs.map((log) => (
            <div key={log.id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 hover:shadow-md transition-shadow">

              {/* FIX: Restored Labels (Face / Site) */}
              <div className="flex space-x-2 shrink-0">
                 {/* FACE PHOTO */}
                 <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden relative border">
                   <img src={log.photo_path} className="w-full h-full object-cover" />
                   <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5">FACE</div>
                 </div>

                 {/* SITE PHOTO */}
                 {log.site_photo_path && (
                   <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden relative border">
                     <img src={log.site_photo_path} className="w-full h-full object-cover" />
                     <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5">SITE</div>
                   </div>
                 )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-800 truncate">{log.site_name_snapshot || 'Unknown Site'}</h3>
                  <span className="text-xs text-gray-400 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>

                <p className="text-xs text-gray-500 mt-1">User ID: <span className="font-mono bg-gray-100 px-1 rounded">{log.user_id.slice(0,8)}...</span></p>
                <p className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleDateString()}</p>

                <a href={`http://maps.google.com/?q=${log.latitude},${log.longitude}`} target="_blank" className="text-blue-600 text-xs hover:underline flex items-center mt-2">
                  <MapPin size={12} className="mr-1" /> View on Map
                </a>
              </div>
            </div>
          ))}

          {logs.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed">
              No attendance records found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};