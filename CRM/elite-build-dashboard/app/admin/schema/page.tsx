"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SchemaRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin?tab=schema');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-mn-text-muted">
      Redirecting to Admin Console...
    </div>
  );
}
