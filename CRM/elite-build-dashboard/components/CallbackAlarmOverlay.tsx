"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Lead, CallbackRequest } from '@/lib/types/lead';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Phone, X, AlarmClock, Clock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/utils/formatPrice';

interface DueCallback {
  lead: Lead;
  callback: CallbackRequest;
}

interface CallbackAlarmOverlayProps {
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
  currentUserUid: string;
}

export function CallbackAlarmOverlay({ leads, onOpenLead, currentUserUid }: CallbackAlarmOverlayProps) {
  const [dueCallbacks, setDueCallbacks] = useState<DueCallback[]>([]);
  const checkedIdsRef = useRef<Set<string>>(new Set());

  // Check for due callbacks every 15 seconds
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const due: DueCallback[] = [];

      for (const lead of leads) {
        for (const cb of lead.callback_requests || []) {
          if (cb.status !== 'pending') continue;
          // Only show alarms assigned to the current user
          if (cb.assigned_to && cb.assigned_to !== currentUserUid) continue;
          const scheduledTime = new Date(cb.scheduled_at).getTime();
          // Trigger if the callback time has arrived (within a 5-minute window)
          if (scheduledTime <= now && scheduledTime > now - 5 * 60 * 1000) {
            if (!checkedIdsRef.current.has(cb.id)) {
              due.push({ lead, callback: cb });
            }
          }
        }
      }

      if (due.length > 0) {
        setDueCallbacks(prev => {
          const existingIds = new Set(prev.map(d => d.callback.id));
          const newOnes = due.filter(d => !existingIds.has(d.callback.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      }
    };

    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [leads, currentUserUid]);

  // Play loud, repeating alarm sound when there are due callbacks
  const alarmCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (dueCallbacks.length > 0) {
      const playAlarmBurst = () => {
        try {
          if (!alarmCtxRef.current || alarmCtxRef.current.state === 'closed') {
            alarmCtxRef.current = new AudioContext();
          }
          const ctx = alarmCtxRef.current;
          if (ctx.state === 'suspended') ctx.resume();

          const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'square';
            gain.gain.setValueAtTime(0.6, startTime);
            gain.gain.setValueAtTime(0.6, startTime + duration * 0.7);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            osc.start(startTime);
            osc.stop(startTime + duration);
          };

          const now = ctx.currentTime;
          // Urgent repeating pattern: high-low-high-low-high
          playTone(880, now, 0.25);
          playTone(1100, now + 0.3, 0.25);
          playTone(880, now + 0.6, 0.25);
          playTone(1100, now + 0.9, 0.25);
          playTone(880, now + 1.2, 0.4);
        } catch {
          // Audio not available — visual alert is still shown
        }
      };

      // Play immediately, then repeat every 3 seconds until dismissed
      playAlarmBurst();
      alarmIntervalRef.current = setInterval(playAlarmBurst, 3000);

      return () => {
        if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      };
    } else {
      // Stop alarm when all callbacks are dismissed
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
      if (alarmCtxRef.current && alarmCtxRef.current.state !== 'closed') {
        alarmCtxRef.current.close();
        alarmCtxRef.current = null;
      }
    }
  }, [dueCallbacks.length]);

  const handleDismiss = useCallback(async (dueItem: DueCallback, markAs: 'completed' | 'missed') => {
    checkedIdsRef.current.add(dueItem.callback.id);

    // Update the callback status in Firestore
    try {
      const updatedCallbacks = (dueItem.lead.callback_requests || []).map(cb =>
        cb.id === dueItem.callback.id ? { ...cb, status: markAs } : cb
      );
      await updateDoc(doc(db, 'leads', dueItem.lead.id), {
        callback_requests: updatedCallbacks,
      });
    } catch (err) {
      console.error('Failed to update callback status:', err);
    }

    setDueCallbacks(prev => prev.filter(d => d.callback.id !== dueItem.callback.id));
  }, []);

  const handleOpenLead = useCallback((dueItem: DueCallback) => {
    checkedIdsRef.current.add(dueItem.callback.id);
    setDueCallbacks(prev => prev.filter(d => d.callback.id !== dueItem.callback.id));
    onOpenLead(dueItem.lead);
  }, [onOpenLead]);

  if (dueCallbacks.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 p-2">
        {dueCallbacks.map(item => (
          <div
            key={item.callback.id}
            className="bg-mn-card border-2 border-mn-warning rounded-2xl shadow-2xl shadow-mn-warning/30 overflow-hidden animate-pulse-slow"
          >
            {/* Header */}
            <div className="bg-mn-warning/20 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlarmClock className="w-5 h-5 text-mn-warning" />
                <span className="font-black text-sm text-mn-warning uppercase tracking-wider">Callback Due</span>
              </div>
              <button
                onClick={() => handleDismiss(item, 'missed')}
                className="text-mn-text-muted hover:text-mn-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lead details */}
            <div className="px-5 py-4 space-y-3">
              <div>
                <h3 className="font-black text-lg text-mn-h1">{item.lead.raw_data.lead_name}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-mn-text-muted">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {item.lead.raw_data.phone}
                  </span>
                  {item.lead.raw_data.budget > 0 && (
                    <span className="font-bold text-mn-h2">{formatPrice(item.lead.raw_data.budget)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-mn-text-muted">
                <Clock className="w-3 h-3" />
                <span>Scheduled for: <strong className="text-mn-text">{new Date(item.callback.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong></span>
              </div>

              {item.callback.notes && (
                <div className="flex items-start gap-1.5 text-xs text-mn-text-muted">
                  <MessageSquare className="w-3 h-3 mt-0.5" />
                  <span>{item.callback.notes}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mn-warning/20 text-mn-warning">
                  {item.lead.status}
                </span>
                <span className="text-[10px] text-mn-text-muted">{item.lead.source}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-4 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => handleDismiss(item, 'missed')}
              >
                Dismiss
              </Button>
              <Button
                className="flex-1"
                icon={<Phone className="w-4 h-4" />}
                onClick={() => handleOpenLead(item)}
              >
                Open Lead & Call
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
