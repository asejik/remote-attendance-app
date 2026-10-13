import { supabase } from './supabase';
import type { Database } from './database.types';
import type { ReportEvent, ReportStaff } from './reports';

type EventRow = Database['public']['Tables']['attendance_events']['Row'];
export type ReviewStatus = Database['public']['Enums']['review_status'];

export interface ReviewEvent extends EventRow {
  staff: { full_name: string; staff_code: string; reference_photo_path: string | null } | null;
}

export interface EventFilter {
  start: string; // UTC ISO, inclusive
  end: string; // UTC ISO, exclusive
  staffId?: string;
  siteId?: string;
  flaggedOnly?: boolean;
  status?: ReviewStatus;
}

export const PAGE_SIZE = 50;

const STAFF_EMBED = 'staff!attendance_events_organization_id_staff_id_fkey(full_name, staff_code, reference_photo_path)';

// Review queue: unreviewed first, then most flags, then newest. RLS limits
// rows to the admin's organisation.
export const fetchReviewPage = async (filter: EventFilter, page: number) => {
  let query = supabase
    .from('attendance_events')
    .select(`*, ${STAFF_EMBED}`, { count: 'exact' })
    .gte('captured_at', filter.start)
    .lt('captured_at', filter.end);
  if (filter.staffId) query = query.eq('staff_id', filter.staffId);
  if (filter.siteId) query = query.eq('site_id', filter.siteId);
  if (filter.flaggedOnly) query = query.gt('flag_count', 0);
  if (filter.status) query = query.eq('review_status', filter.status);
  const { data, error, count } = await query
    .order('review_status', { ascending: true })
    .order('flag_count', { ascending: false })
    .order('captured_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) throw error;
  return { events: (data ?? []) as unknown as ReviewEvent[], total: count ?? 0 };
};

// All events in a range for reports (paged under the hood).
export const fetchEventsForReport = async (start: string, end: string): Promise<ReportEvent[]> => {
  const all: ReportEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('attendance_events')
      .select('id, staff_id, type, captured_at, site_name_snapshot, distance_m, within_radius, accuracy_m, flags, liveness_passed, review_status, review_note, reviewed_at')
      .gte('captured_at', start).lt('captured_at', end)
      .order('captured_at').range(from, from + 999);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < 1000) return all;
  }
};

export const fetchStaffForReport = async (): Promise<ReportStaff[]> => {
  const { data, error } = await supabase.from('staff').select('id, full_name, staff_code, role, status').order('full_name');
  if (error) throw error;
  return data ?? [];
};

export const reviewEvent = async (eventId: string, decision: 'approved' | 'rejected', note: string | null) => {
  const { data, error } = await supabase.rpc('review_event', { event_id: eventId, decision, note: note ?? undefined });
  if (error) throw error;
  return data;
};

// Short-lived (10 min) links for private photos; one request per bucket.
export const signPhotoUrls = async (bucket: 'event-photos' | 'reference-photos', paths: string[]) => {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, 600);
  return Object.fromEntries((data ?? []).flatMap((s) => (s.signedUrl && s.path ? [[s.path, s.signedUrl]] : [])));
};

export const mapLink = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=17/${lat.toFixed(6)}/${lng.toFixed(6)}`;
