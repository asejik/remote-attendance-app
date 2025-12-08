# Remote Staff Attendance & Verification System

An offline-first Progressive Web App (PWA) designed to track remote staff attendance with biometric security and GPS verification.

## 🚀 Key Features

* **Offline-First:** Works entirely without internet. Data is stored locally on the device and syncs automatically when connectivity returns.
* **Biometric Liveness Detection:** Uses AI to detect a "live smile" before allowing a Clock In/Out to prevent photo spoofing.
* **Geolocation Tracking:** Captures precise GPS coordinates for every attendance record.
* **Smart Toggling:** Automatically handles Clock In vs. Clock Out states with a 5-minute safety cooldown.
* **Admin Dashboard:** A central view for managers to see staff photos, timestamps, and map locations.

## 🛠 Tech Stack

* **Frontend:** React 19 + TypeScript + Vite
* **Styling:** Tailwind CSS v4
* **Mobile Capabilities:** Capacitor 7 (Camera, Geolocation)
* **AI/ML:** face-api.js (On-device face detection)
* **Local Database:** Dexie.js (IndexedDB wrapper)
* **Cloud Backend:** Supabase (PostgreSQL + Storage)
* **Deployment:** Vercel

## ⚙️ Setup & Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd remote-attendance-app
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Variables**
    Create a `.env` file in the root directory and add your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_project_url
    VITE_SUPABASE_ANON_KEY=your_anon_key
    ```

4.  **Run Locally**
    ```bash
    npm run dev
    ```

## 📱 Mobile Testing

Since this is a PWA, it can be installed on mobile devices directly from the browser:
* **iOS:** Share -> Add to Home Screen.
* **Android:** Menu -> Add to Home Screen.

## 🔐 Security Notes

* **Liveness:** The app requires a high-confidence "Happy" expression to trigger the shutter.
* **Storage:** Photos are stored in a public Supabase bucket for Admin visibility, but file paths are obfuscated using UUIDs.