import { LogOut, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const DashboardPage = () => {
  const { signOut, user } = useAuth(); // Get user info

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
           <h1 className="text-lg font-bold text-gray-800">My Attendance</h1>
           <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <button onClick={signOut} className="text-gray-500 hover:text-red-500">
          <LogOut size={20} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center space-y-6">

        {/* Status Card */}
        <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Current Status</p>
          <h2 className="text-3xl font-bold text-gray-800">Clocked OUT</h2>
          <p className="text-xs text-gray-400 mt-2">Last activity: Yesterday, 5:00 PM</p>
        </div>

        {/* Big Action Button */}
        <button className="group relative flex flex-col items-center justify-center w-48 h-48 bg-white border-4 border-blue-100 rounded-full shadow-lg active:scale-95 transition-all">
          <div className="bg-blue-600 p-4 rounded-full text-white mb-2 shadow-md group-hover:bg-blue-700">
            <Camera size={40} />
          </div>
          <span className="font-bold text-gray-700">Tap to Clock In</span>
        </button>

        <p className="text-xs text-center text-gray-400 max-w-xs">
          Ensure you are at the site location. A photo verification will be required.
        </p>
      </div>
    </div>
  );
};