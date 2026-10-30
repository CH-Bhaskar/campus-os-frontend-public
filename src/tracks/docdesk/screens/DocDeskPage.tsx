/**
 * DocDesk — document requests. Role-routed:
 *  - admin → read-only overview (writes return 403 for admins)
 *  - Student Affairs staff → full console (queue, bulk TAT, answers, doc types)
 *  - student / faculty / other office staff → requester (catalog + my requests)
 *
 * The starter's session user has no department field, so office_staff users get
 * their profile from GET /api/v1/users/me to check for "Student Affairs".
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/core/auth';
import { api } from '../api/client';
import type { OfficeStaffProfile } from '../api/types';
import { ModuleIcon, SectionHeading } from '../components/ui';
import { AdminView } from './AdminView';
import { RequesterView } from './RequesterView';
import { StaffConsole } from './StaffConsole';
import '../theme.css';

function isStudentAffairsDept(dept: string | undefined): boolean {
  if (!dept) return false;
  return dept.trim().toLowerCase().replace(/\s*dept\.?\s*$/, '') === 'student affairs';
}

export function DocDeskPage() {
  const { user } = useAuth();
  const [checkingDept, setCheckingDept] = useState(false);
  const [isStudentAffairs, setIsStudentAffairs] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (user?.role !== 'office_staff') {
        setIsStudentAffairs(false);
        return;
      }
      setCheckingDept(true);
      try {
        const profile = await api<OfficeStaffProfile>('/api/v1/users/me');
        if (!cancelled) setIsStudentAffairs(isStudentAffairsDept(profile.dept));
      } catch {
        if (!cancelled) setIsStudentAffairs(false);
      } finally {
        if (!cancelled) setCheckingDept(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  const heading = isAdmin
    ? {
        eyebrow: 'DocDesk · admin overview',
        title: 'Document requests',
        desc: 'Every request across campus, in one place. Admins have read-only access here — answering and turnaround belong to Student Affairs.',
      }
    : isStudentAffairs
      ? {
          eyebrow: 'DocDesk · Student Affairs console',
          title: 'Answer document requests',
          desc: `Working the queue as ${user?.name ?? 'Student Affairs'}. Set turnaround times, answer with documents, and keep the catalog sharp.`,
        }
      : {
          eyebrow: 'DocDesk · document requests',
          title: 'Request official documents',
          desc: 'Bonafide certificates, transcripts, forms — request in a minute, track every step, and upload filled forms right back.',
        };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <ModuleIcon module="docdesk" />
        <div className="min-w-0 flex-1">
          <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            desc={heading.desc}
          />
        </div>
      </div>
      {checkingDept ? (
        <p className="text-sm text-desk-ink/50 dark:text-white/50">Loading your workspace…</p>
      ) : isAdmin ? (
        <AdminView />
      ) : isStudentAffairs ? (
        <StaffConsole />
      ) : (
        <RequesterView />
      )}
    </div>
  );
}
