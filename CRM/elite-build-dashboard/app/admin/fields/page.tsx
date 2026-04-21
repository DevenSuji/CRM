"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FieldsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-mn-text-muted">
      Redirecting to Admin Console...
    </div>
  );
}
