export type EventType = 'CLOCK_IN' | 'CLOCK_OUT';
export type PhotoKind = 'face' | 'site';

// A clock-in/out captured on this device. `id` is generated here and becomes
// the attendance_events primary key, so retried uploads are idempotent.
export interface QueuedEvent {
  id: string;
  userId: string;
  organizationId: string;
  staffId: string;
  siteId: string | null;
  siteName: string | null;
  type: EventType;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  livenessPassed: boolean;
  hasFacePhoto: boolean;
  hasSitePhoto: boolean;
  // failed = the server refused it twice (not a network problem); kept with its
  // photos so the worker can show it to a supervisor or try again.
  status: 'pending' | 'synced' | 'failed';
  attempts: number;
  lastError?: string;
  failReason?: string; // plain-language reason shown to the worker when failed
  syncedAt?: string;
  flags?: string[]; // server-computed, filled in after upload
}

export interface QueuePhotos {
  face: Blob | null;
  site: Blob | null;
}

// Storage for the offline queue. Writes must be durable before they resolve:
// the UI only says "saved" after add() succeeds.
export interface QueueStore {
  add(event: QueuedEvent, photos: QueuePhotos): Promise<void>;
  list(): Promise<QueuedEvent[]>;
  update(id: string, patch: Partial<QueuedEvent>): Promise<void>;
  getPhoto(id: string, kind: PhotoKind): Promise<Blob | null>;
  deletePhotos(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}
