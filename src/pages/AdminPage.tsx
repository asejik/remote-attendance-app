import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
// FIX: Removed Calendar, User, ImageIcon
import { MapPin, Loader2, Download } from 'lucide-react';

// ... interface Log ... (Add site_name and site_photo_path to your existing interface)
interface Log {
  id: string;
  user_id: string;
  timestamp: string;
  photo_path: string;
  site_photo_path?: string; // NEW
  site_name_snapshot?: string; // NEW
  latitude: number;
  longitude: number;
}

export const AdminPage = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    const { data } = await supabase.from('attendance_logs').select('*').order('timestamp', { ascending: false });
    if (data) setLogs(data);
    setLoading(false);
  };

  // CSV GENERATOR
  const downloadReport = () => {
    // 1. Create CSV Header
    const headers = ['User ID', 'Date/Time', 'Type', 'Site Name', 'Latitude', 'Longitude', 'Face Photo', 'Site Photo'];

    // 2. Map Data
    const rows = logs.map(log => [
      log.user_id,
      new Date(log.timestamp).toLocaleString(),
      'ATTENDANCE', // or deduce type if you store it in DB (we should add 'type' to DB later if needed)
      log.site_name_snapshot || 'Unknown',
      log.latitude,
      log.longitude,
      log.photo_path,
      log.site_photo_path || ''
    ]);

    // 3. Convert to CSV String
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(item => `"${item}"`).join(',')) // Quote items to handle commas in text
    ].join('\n');

    // 4. Trigger Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Attendance_Report_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Attendance Monitoring</h1>

        {/* REPORT BUTTON */}
        <button
          onClick={downloadReport}
          className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
        >
          <Download size={18} />
          <span>Export Monthly Report</span>
        </button>
      </div>

      <div className="grid gap-6">
        {logs.map((log) => (
          <div key={log.id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4">

            {/* DUAL PHOTOS */}
            <div className="flex space-x-2 shrink-0">
               {/* Face */}
               <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden relative">
                 <img src={log.photo_path} className="w-full h-full object-cover" />
                 <span className="absolute bottom-0 left-0 bg-black/50 text-white text-[10px] w-full text-center">Face</span>
               </div>
               {/* Site */}
               {log.site_photo_path && (
                 <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden relative">
                   <img src={log.site_photo_path} className="w-full h-full object-cover" />
                   <span className="absolute bottom-0 left-0 bg-black/50 text-white text-[10px] w-full text-center">Site</span>
                 </div>
               )}
            </div>

            <div className="flex-1 space-y-1">
              <div className="font-bold text-gray-800">{log.site_name_snapshot || 'Unknown Site'}</div>
              <div className="text-sm text-gray-500">{new Date(log.timestamp).toLocaleString()}</div>

              <a href={`http://maps.google.com/?q=${log.latitude},${log.longitude}`} target="_blank" className="text-blue-600 text-xs hover:underline flex items-center">
                <MapPin size={12} className="mr-1" /> View on Map
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};