import { MobileLayout } from './components/MobileLayout';

function App() {
  return (
    <MobileLayout className="p-4 flex flex-col items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold text-gray-800">ABC Attendance</h1>
        <p className="text-gray-500">
          Remote Staff Verification System
        </p>

        <div className="p-4 bg-blue-50 text-blue-700 rounded-lg text-sm border border-blue-100">
          System Ready: Offline-First Mode
        </div>
      </div>
    </MobileLayout>
  );
}

export default App;