import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { PRIVACY_NOTICE_UPDATED, SUPPORT_EMAIL } from '../lib/support';

// Public privacy notice (no login needed), linked from the login screen, the
// first-login notice and the worker home screen. Wording to be confirmed by
// counsel before launch (Nigeria Data Protection Act 2023).
export const PrivacyPage = () => (
  <div className="min-h-screen bg-gray-50 px-5 py-8">
    <article className="max-w-2xl mx-auto bg-white rounded-2xl shadow p-6 space-y-4 text-gray-700">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={16} aria-hidden /> Back
      </Link>
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-blue-600" size={28} aria-hidden />
        <h1 className="text-xl font-bold text-gray-900">Privacy notice</h1>
      </div>
      <p className="text-sm text-gray-500">Last updated {PRIVACY_NOTICE_UPDATED}</p>

      <Section title="Who is responsible">
        <p>
          Your employer (the organisation that gave you your login) decides how attendance records are used and is responsible for them
          (the <em>data controller</em>). We run this app for them and process the records only on their instructions (the <em>data
          processor</em>).
        </p>
      </Section>

      <Section title="What the app collects, and why">
        <p>Only when you clock in or out:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>a photo of your face, so your employer can confirm it was you;</li>
          <li>a photo of the site, if your employer requires it;</li>
          <li>your location (GPS), its accuracy, and the time;</li>
          <li>basic app details (app version, phone type) to fix problems.</li>
        </ul>
        <p>
          The app does <strong>not</strong> track your location between clock-ins, and it does not build a face template or use face
          recognition. The smile check only helps show a real person was in front of the camera.
        </p>
        <p>The purpose is attendance: payroll, project records and reports to your employer&apos;s clients or funders.</p>
      </Section>

      <Section title="Who can see it">
        <p>
          Your organisation&apos;s admins and supervisors. We can access records only to run and support the service. We never sell
          your data or use it for advertising.
        </p>
      </Section>

      <Section title="How long it is kept">
        <ul className="list-disc pl-5 space-y-1">
          <li>Clock-in photos: deleted automatically after the period your employer sets (7 to 365 days; 60 by default).</li>
          <li>Your registered reference photo: deleted 30 days after your account is deactivated.</li>
          <li>Attendance times and places (without photos): kept while your employer uses the service, then deleted after they receive a copy.</li>
          <li>Records waiting on your phone: removed once uploaded.</li>
        </ul>
      </Section>

      <Section title="How it is protected">
        <p>
          Records travel encrypted and are stored on secure cloud servers. Photos are private and shown only through links that expire
          within minutes. Each organisation can see only its own records, and admin actions are logged.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask for a copy of your records, for corrections, or for deletion where the law allows. Ask your employer&apos;s admin
          first; you can also write to us at <a className="text-blue-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and
          we will pass your request to your employer and help them answer it within 30 days. If you are unhappy with the answer, you can
          complain to the Nigeria Data Protection Commission.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this app or this notice: <a className="text-blue-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </Section>
    </article>
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-2">
    <h2 className="font-semibold text-gray-900">{title}</h2>
    {children}
  </section>
);
