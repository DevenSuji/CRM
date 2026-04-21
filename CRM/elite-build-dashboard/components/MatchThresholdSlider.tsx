"use client";
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SlidersHorizontal } from 'lucide-react';

interface MatchThresholdSliderProps {
  value: number;
}

const THRESHOLD_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

export function MatchThresholdSlider({ value }: MatchThresholdSliderProps) {
  const handleChange = async (newValue: number) => {
    try {
      await setDoc(doc(db, 'crm_config', 'property_match'), {
        threshold_percent: newValue,
        updated_at: Timestamp.now(),
      });
    } catch (err) {
      console.error('Failed to update match threshold:', err);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <SlidersHorizontal className="w-3.5 h-3.5 text-mn-text-muted flex-shrink-0" />
      <span className="text-[10px] font-black text-mn-h3 uppercase tracking-wider whitespace-nowrap">Match</span>
      <select
        value={value}
        onChange={e => handleChange(Number(e.target.value))}
        className="px-2 py-1 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs font-bold text-mn-h2 focus:outline-none focus:border-mn-input-focus cursor-pointer"
      >
        {THRESHOLD_OPTIONS.map(t => (
          <option key={t} value={t}>+{t}%</option>
        ))}
      </select>
    </div>
  );
}
