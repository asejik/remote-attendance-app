import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin, Loader2, Download, LogOut, Calendar, Map, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Log {
  id: string;
  user_id: string;
  timestamp: string;
  type?: string;
  photo_path: string;
  site_photo_path?: string;
  site_name_snapshot?: string;
  latitude: number;
  longitude: number;
}

interface Profile {
  id: string;
  full_name: string;
}

export const AdminPage = () => {
  const { signOut } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterUser, setFilterUser] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Lightbox State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const { data: logsData } = await supabase.from('attendance_logs').select('*').order('timestamp', { ascending: false });
      const { data: profilesData } = await supabase.from('profiles').select('id, full_name');

      if (logsData) setLogs(logsData);

      if (profilesData) {
        const profileMap: Record<string, string> = {};
        profilesData.forEach((p: Profile) => { profileMap[p.id] = p.full_name; });
        setProfiles(profileMap);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const userName = profiles[log.user_id] || 'Unknown';
      const logDate = new Date(log.timestamp).toISOString().split('T')[0];
      const matchesUser = filterUser ? userName === filterUser : true;
      const matchesSite = filterSite ? (log.site_name_snapshot || '') === filterSite : true;
      const matchesDate = filterDate ? logDate === filterDate : true;
      return matchesUser && matchesSite && matchesDate;
    });
  }, [logs, profiles, filterUser, filterSite, filterDate]);

  const uniqueUsers = Array.from(new Set(Object.values(profiles))).sort();
  const uniqueSites = Array.from(new Set(logs.map(l => l.site_name_snapshot || 'Unknown'))).sort();

  const downloadReport = () => {
    const headers = ['Full Name', 'User ID', 'Date', 'Time', 'Type', 'Site Name', 'Latitude', 'Longitude', 'Face Photo', 'Site Photo'];
    const rows = filteredLogs.map(log => [
      profiles[log.user_id] || 'Unknown',
      log.user_id,
      new Date(log.timestamp).toLocaleDateString(),
      new Date(log.timestamp).toLocaleTimeString(),
      log.type || 'CLOCK_IN',
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

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* PHOTO LIGHTBOX MODAL */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white bg-white/10 p-2 rounded-full hover:bg-white/20"
          >
            <X size={24} />
          </button>
          <img
            src={selectedImage}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            alt="Evidence Fullscreen"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* HEADER */}
      <div className="bg-white border-b px-4 py-3 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Attendance Monitoring</h1>
          <p className="text-xs text-gray-500">{filteredLogs.length} Records</p>
        </div>
        <div className="flex items-center space-x-2">
           <button onClick={downloadReport} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-full" title="Export CSV">
              <Download size={20} />
           </button>
           <button onClick={() => signOut()} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full" title="Logout">
              <LogOut size={20} />
           </button>
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-4">

        {/* COMPACT HORIZONTAL FILTERS */}
        <div className="flex items-center gap-2 w-full">

          {/* 1. Staff Filter (Flex-1 to share space) */}
          <div className="flex-1 min-w-0 relative bg-white border border-gray-300 rounded-lg h-9 hover:bg-gray-50 transition-colors">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-400 uppercase">Staff</span>
            <select
              className="w-full h-full bg-transparent pl-10 pr-4 text-xs font-semibold text-gray-700 focus:outline-none appearance-none cursor-pointer"
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
            >
              <option value="">All</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* 2. Site Filter (Flex-1 to share space) */}
          <div className="flex-1 min-w-0 relative bg-white border border-gray-300 rounded-lg h-9 hover:bg-gray-50 transition-colors">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-400 uppercase">Site</span>
            <select
              className="w-full h-full bg-transparent pl-8 pr-4 text-xs font-semibold text-gray-700 focus:outline-none appearance-none cursor-pointer"
              value={filterSite}
              onChange={e => setFilterSite(e.target.value)}
            >
              <option value="">All</option>
              {uniqueSites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* 3. Date Filter (Auto width) */}
          <div className="relative bg-white border border-gray-300 rounded-lg h-9 hover:bg-gray-50 transition-colors flex items-center px-2">
             <Calendar size={12} className="text-gray-400 mr-1.5 shrink-0" />
             <input
              type="date"
              className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none cursor-pointer w-24 sm:w-auto"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
            />
          </div>

          {/* Clear Button */}
          {(filterUser || filterSite || filterDate) && (
             <button
               onClick={() => { setFilterUser(''); setFilterSite(''); setFilterDate(''); }}
               className="text-gray-400 hover:text-red-500"
               title="Clear Filters"
             >
               <X size={16} />
             </button>
          )}
        </div>

        {/* LOG CARDS */}
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">

              <div className="flex items-start gap-4">

                {/* LEFT: Photos (Clickable) */}
                <div className="flex -space-x-3 shrink-0 pt-1 cursor-pointer" onClick={() => setSelectedImage(log.photo_path)}>
                  <img
                    src={log.photo_path}
                    className="w-12 h-12 rounded-full border-2 border-white object-cover shadow-sm z-10 bg-gray-100 hover:scale-110 transition-transform"
                    alt="Face"
                  />
                  {log.site_photo_path && (
                    <img
                      src={log.site_photo_path}
                      className="w-12 h-12 rounded-full border-2 border-white object-cover shadow-sm bg-gray-100 hover:scale-110 transition-transform"
                      alt="Site"
                      onClick={(e) => { e.stopPropagation(); setSelectedImage(log.site_photo_path!); }}
                    />
                  )}
                </div>

                {/* RIGHT: Data Content (Two Rows) */}
                <div className="flex-1 min-w-0 grid gap-1.5">

                  {/* ROW 1: Name, Site, Type Badge */}
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 truncate pr-2">
                        {profiles[log.user_id] || 'Unknown User'}
                      </h3>
                      <p className="text-xs text-gray-500 truncate flex items-center">
                        <MapPin size={10} className="mr-1" />
                        {log.site_name_snapshot || 'Unknown Site'}
                      </p>
                    </div>

                    {/* Badge */}
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                        log.type === 'CLOCK_IN'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {log.type === 'CLOCK_IN' ? <ArrowDown size={10} className="mr-1"/> : <ArrowUp size={10} className="mr-1"/>}
                        {log.type === 'CLOCK_IN' ? 'IN' : 'OUT'}
                    </span>
                  </div>

                  {/* ROW 2: Date, Map Link (Removed User ID) */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-0.5 border-t border-gray-50 pt-2">
                    <div className="flex items-center">
                       <Calendar size={12} className="mr-1 text-gray-400" />
                       <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                       <span className="mx-1">•</span>
                       <span>{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>

                    <a
                       href={`http://maps.google.com/?q=${log.latitude},${log.longitude}`}
                       target="_blank"
                       className="flex items-center text-blue-600 hover:text-blue-800 font-medium ml-auto"
                    >
                       <Map size={12} className="mr-1" />
                       View Map
                    </a>
                  </div>

                </div>
              </div>
            </div>
          ))}

          {filteredLogs.length === 0 && (
             <div className="text-center py-10 text-gray-400">
               No records found.
             </div>
          )}
        </div>
      </div>
    </div>
  );
};