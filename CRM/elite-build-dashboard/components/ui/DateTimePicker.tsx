"use client";
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-react';

interface DateTimePickerProps {
  label?: string;
  value: string; // ISO format e.g. "2026-04-10T14:30"
  onChange: (value: string) => void;
  min?: string;
  required?: boolean;
  className?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday-indexed
}

export function DateTimePicker({ label, value, onChange, min, required, className = '' }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const parsed = value ? new Date(value) : null;
  const minDate = min ? new Date(min) : null;

  const [viewYear, setViewYear] = useState(parsed?.getFullYear() || now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? now.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(parsed);
  const [hours, setHours] = useState(parsed ? String(parsed.getHours()).padStart(2, '0') : '10');
  const [minutes, setMinutes] = useState(parsed ? String(parsed.getMinutes()).padStart(2, '0') : '00');

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Sync state when value prop changes
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        setHours(String(d.getHours()).padStart(2, '0'));
        setMinutes(String(d.getMinutes()).padStart(2, '0'));
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  const days = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    return cells;
  }, [viewYear, viewMonth]);

  const isDisabled = useCallback((day: number) => {
    if (!minDate) return false;
    const d = new Date(viewYear, viewMonth, day, 23, 59);
    return d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  }, [minDate, viewYear, viewMonth]);

  const isToday = useCallback((day: number) => {
    return viewYear === now.getFullYear() && viewMonth === now.getMonth() && day === now.getDate();
  }, [viewYear, viewMonth, now]);

  const isSelected = useCallback((day: number) => {
    if (!selectedDate) return false;
    return viewYear === selectedDate.getFullYear() && viewMonth === selectedDate.getMonth() && day === selectedDate.getDate();
  }, [selectedDate, viewYear, viewMonth]);

  const handleSelectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day, parseInt(hours), parseInt(minutes));
    setSelectedDate(d);
    emitValue(d);
  };

  const handleTimeChange = (h: string, m: string) => {
    setHours(h);
    setMinutes(m);
    if (selectedDate) {
      const d = new Date(selectedDate);
      d.setHours(parseInt(h), parseInt(m));
      setSelectedDate(d);
      emitValue(d);
    }
  };

  const emitValue = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    onChange(`${year}-${month}-${day}T${h}:${min}`);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const displayValue = selectedDate
    ? selectedDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
          {label}
          {required && <span className="text-mn-danger ml-0.5">*</span>}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-left focus:outline-none focus:border-mn-input-focus focus:ring-1 focus:ring-mn-input-focus/30 transition-colors"
      >
        <Calendar className="w-4 h-4 text-mn-text-muted flex-shrink-0" />
        <span className={displayValue ? 'text-mn-text' : 'text-mn-text-muted/50'}>
          {displayValue || 'Select date and time'}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-mn-surface border border-mn-border rounded-2xl shadow-2xl p-4 w-[300px]">
          {/* Month/Year header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-mn-text-muted hover:text-mn-text hover:bg-mn-card transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-black text-mn-text">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-mn-text-muted hover:text-mn-text hover:bg-mn-card transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-black text-mn-text-muted uppercase py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />;
              const disabled = isDisabled(day);
              const today = isToday(day);
              const selected = isSelected(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectDay(day)}
                  className={`w-full aspect-square rounded-lg text-xs font-bold transition-all ${
                    selected
                      ? 'bg-mn-h2 text-white shadow-md shadow-mn-h2/30'
                      : today
                        ? 'bg-mn-h2/10 text-mn-h2 font-black'
                        : disabled
                          ? 'text-mn-text-muted/25 cursor-not-allowed'
                          : 'text-mn-text hover:bg-mn-card-hover'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time picker */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-mn-border/30">
            <Clock className="w-4 h-4 text-mn-text-muted flex-shrink-0" />
            <span className="text-[10px] font-black text-mn-h3 uppercase tracking-wider">Time</span>
            <div className="flex-1" />
            <select
              value={hours}
              onChange={e => handleTimeChange(e.target.value, minutes)}
              className="px-2 py-1.5 bg-mn-input-bg border border-mn-input-border rounded-lg text-sm text-mn-text font-bold focus:outline-none focus:border-mn-input-focus w-16 text-center"
            >
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="text-sm font-black text-mn-text-muted">:</span>
            <select
              value={minutes}
              onChange={e => handleTimeChange(hours, e.target.value)}
              className="px-2 py-1.5 bg-mn-input-bg border border-mn-input-border rounded-lg text-sm text-mn-text font-bold focus:outline-none focus:border-mn-input-focus w-16 text-center"
            >
              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Quick picks */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {[
              { label: 'Today', fn: () => { const d = new Date(); d.setHours(parseInt(hours), parseInt(minutes)); handleSelectDay(d.getDate()); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); } },
              { label: 'Tomorrow', fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); handleSelectDay(d.getDate()); } },
              { label: 'Next Week', fn: () => { const d = new Date(); d.setDate(d.getDate() + 7); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); handleSelectDay(d.getDate()); } },
            ].map(q => (
              <button
                key={q.label}
                type="button"
                onClick={q.fn}
                className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-mn-h2/8 text-mn-h2 hover:bg-mn-h2/15 transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
