"use client";
import { Briefcase, Calculator, Clock } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { ROLE_LABELS } from '@/lib/utils/permissions';

export default function ComingSoonPage() {
  const { crmUser } = useAuth();
  const role = crmUser?.role;

  const RoleIcon =
    role === 'hr' ? Briefcase
    : role === 'payroll_finance' ? Calculator
    : Clock;

  const moduleName =
    role === 'hr' ? 'HR Module'
    : role === 'payroll_finance' ? 'Payroll & Finance Module'
    : 'This Module';

  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-10">
      <div className="w-20 h-20 rounded-2xl bg-mn-h2/10 flex items-center justify-center mb-5">
        <RoleIcon className="w-10 h-10 text-mn-h2" />
      </div>
      <h1 className="text-2xl font-black text-mn-h1 mb-2">{moduleName} — Coming Soon</h1>
      <p className="text-sm text-mn-text-muted max-w-md">
        Hi {crmUser?.name || 'there'}. Your account is set up with the{' '}
        <strong className="text-mn-text">{role ? ROLE_LABELS[role] : 'your'}</strong> role.
        This module is not yet available in the CRM — we will enable access as soon as it ships.
      </p>
    </div>
  );
}
