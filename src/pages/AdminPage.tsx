import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin, Loader2, Download, LogOut, Search, Filter, ArrowDown, ArrowUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Log {
  id: string;
  user_id: string;
  timestamp: string;
  type?: string; // New field
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
  const [profiles, setProfiles] = useState<Record<string, string>>({}); // Map ID -> Name
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterUser, setFilterUser] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      // 1. Fetch Logs
      const { data: logsData } = await supabase
        .from('attendance_logs')
        .select('*')
        .order('timestamp', { ascending: false });

      // 2. Fetch Profiles (to map names)
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name');

      if (logsData) setLogs(logsData);

      // Create a lookup map: { 'uuid-123': 'John Doe' }
      if (profilesData) {
        const profileMap: Record<string, string> = {};
        profilesData.forEach((p: Profile) => {
          profileMap[p.id] = p.full_name;
        });
        setProfiles(profileMap);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Filter Logic
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

  // Unique Lists for Dropdowns
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
      {/* HEADER */}
      <div className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Attendance Monitoring</h1>
          <p className="text-xs text-gray-500">HQ View • {filteredLogs.length} Records Found</p>
        </div>
        <button onClick={() => signOut()} className="flex items-center space-x-2 text-gray-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
          <span className="text-sm font-medium">Logout</span>
          <LogOut size={18} />
        </button>
      </div>

      <div className="p-4 max-w-6xl mx-auto">

        {/* FILTERS BAR */}
        <div className="bg-white p-4 rounded-xl border shadow-sm mb-4 flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">

            {/* User Filter */}
            <div className="relative">
              <label className="text-[10px] uppercase text-gray-400 font-bold ml-1">Staff Member</label>
              <div className="relative">
                <select
                  className="w-full md:w-48 pl-8 pr-4 py-2 bg-gray-50 border rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 appearance-none"
                  value={filterUser}
                  onChange={e => setFilterUser(e.target.value)}
                >
                  <option value="">All Staff</option>
                  {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <Search size={14} className="absolute left-2.5 top-3 text-gray-400" />
              </div>
            </div>

            {/* Site Filter */}
            <div className="relative">
              <label className="text-[10px] uppercase text-gray-400 font-bold ml-1">Site Location</label>
              <div className="relative">
                <select
                  className="w-full md:w-48 pl-8 pr-4 py-2 bg-gray-50 border rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 appearance-none"
                  value={filterSite}
                  onChange={e => setFilterSite(e.target.value)}
                >
                  <option value="">All Sites</option>
                  {uniqueSites.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <Filter size={14} className="absolute left-2.5 top-3 text-gray-400" />
              </div>
            </div>

            {/* Date Filter */}
            <div className="relative">
              <label className="text-[10px] uppercase text-gray-400 font-bold ml-1">Date</label>
              <input
                type="date"
                className="w-full md:w-auto py-2 px-3 bg-gray-50 border rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
              />
            </div>

            {/* Clear Filters */}
            {(filterUser || filterSite || filterDate) && (
               <button
                 onClick={() => { setFilterUser(''); setFilterSite(''); setFilterDate(''); }}
                 className="mb-1 text-xs text-red-500 hover:text-red-700 underline self-end pb-2"
               >
                 Clear
               </button>
            )}
          </div>

          <button
            onClick={downloadReport}
            className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm shadow-sm whitespace-nowrap"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>

        {/* COMPACT LIST VIEW */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b">
                  <th className="px-4 py-3 font-medium">Evidence</th>
                  <th className="px-4 py-3 font-medium">Staff Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Site & Time</th>
                  <th className="px-4 py-3 font-medium text-right">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">

                    {/* 1. Evidence Photos (Compact) */}
                    <td className="px-4 py-2">
                      <div className="flex -space-x-2 hover:space-x-1 transition-all">
                        <img
                          src={log.photo_path}
                          className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm z-10"
                          alt="Face"
                          title="Face Verification"
                        />
                        {log.site_photo_path && (
                          <img
                            src={log.site_photo_path}
                            className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm"
                            alt="Site"
                            title="Site Background"
                          />
                        )}
                      </div>
                    </td>

                    {/* 2. Staff Name */}
                    <td className="px-4 py-2">
                      <div className="font-semibold text-gray-900">
                        {profiles[log.user_id] || 'Unknown User'}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        {log.user_id.slice(0, 6)}...
                      </div>
                    </td>

                    {/* 3. Type Indicator */}
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        log.type === 'CLOCK_IN'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {log.type === 'CLOCK_IN' ? <ArrowDown size={12} className="mr-1"/> : <ArrowUp size={12} className="mr-1"/>}
                        {log.type === 'CLOCK_IN' ? 'IN' : 'OUT'}
                      </span>
                    </td>

                    {/* 4. Site & Time */}
                    <td className="px-4 py-2">
                      <div className="text-gray-900 font-medium">{log.site_name_snapshot || 'Unknown Site'}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleDateString()} • {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </td>

                    {/* 5. Map Link */}
                    <td className="px-4 py-2 text-right">
                      <a
                        href={`http://maps.google.com/?q=${log.latitude},${log.longitude}`}
                        target="_blank"
                        className="inline-flex items-center justify-end text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        <MapPin size={14} className="mr-1" />
                        Map
                      </a>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLogs.length === 0 && (
            <div className="p-12 text-center text-gray-400 bg-white">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Search size={20} className="text-gray-400"/>
              </div>
              <p>No records found matching your filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};