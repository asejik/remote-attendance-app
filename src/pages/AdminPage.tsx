import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin, Calendar, User, Loader2 } from 'lucide-react';

interface Log {
  id: string;
  user_id: string;
  timestamp: string;
  photo_path: string;
  latitude: number;
  longitude: number;
}

export const AdminPage = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    // Fetch logs and join with user email if possible (simplified here)
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .order('timestamp', { ascending: false });

    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Attendance Monitoring</h1>

      <div className="grid gap-6">
        {logs.map((log) => (
          <div key={log.id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4">

            {/* The Photo Evidence */}
            <div className="w-full sm:w-32 h-32 bg-gray-100 rounded-lg overflow-hidden shrink-0">
              <img
                src={log.photo_path}
                alt="Proof"
                className="w-full h-full object-cover"
              />
            </div>

            {/* The Details */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center text-sm text-gray-500">
                <Calendar size={16} className="mr-2" />
                {new Date(log.timestamp).toLocaleString()}
              </div>

              <div className="flex items-center text-sm text-gray-500">
                <User size={16} className="mr-2" />
                <span className="font-mono text-xs">{log.user_id}</span>
              </div>

              {/* Map Link */}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${log.latitude},${log.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-blue-600 hover:underline text-sm font-medium mt-2"
              >
                <MapPin size={16} className="mr-1" />
                View Location on Google Maps
              </a>

              <div className="text-xs text-green-600 bg-green-50 inline-block px-2 py-1 rounded border border-green-100 mt-2">
                 Verified & Synced
              </div>
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <div className="text-center text-gray-500 py-10">
            No attendance records found yet.
          </div>
        )}
      </div>
    </div>
  );
};