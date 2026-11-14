import React, { useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

export const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export function getEarliestFiveMinSlot(nowMs: number): Date {
  const stepMs = 5 * 60 * 1000;
  let rounded = Math.ceil(nowMs / stepMs) * stepMs;
  if (rounded - nowMs < 90 * 1000) {
    rounded += stepMs;
  }
  return new Date(rounded);
}

export function resolveNextDateForHourMinute(nowMs: number, hour: number, minute: number): Date {
  const candidate = new Date(nowMs);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= nowMs + 60 * 1000) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

interface TimeWheelPickerProps {
  value: Date;
  onChange: (nextDate: Date) => void;
  active?: boolean;
}

export const TimeWheelPicker: React.FC<TimeWheelPickerProps> = ({
  value,
  onChange,
  active = true,
}) => {
  const selectedHour = value.getHours();
  const rawMinute = value.getMinutes();
  const snappedMinute =
    MINUTE_OPTIONS.reduce((best, cur) =>
      Math.abs(cur - rawMinute) < Math.abs(best - rawMinute) ? cur : best
    );

  const hourWheelRef = useRef<HTMLDivElement | null>(null);
  const minuteWheelRef = useRef<HTMLDivElement | null>(null);
  const ignoreScrollUntilRef = useRef<number>(0);
  const scrollTimerRef = useRef<{ hour: number | null; minute: number | null }>({
    hour: null,
    minute: null,
  });
  const dragStateRef = useRef<{
    el: HTMLDivElement | null;
    startY: number;
    startScrollTop: number;
    moved: boolean;
  }>({ el: null, startY: 0, startScrollTop: 0, moved: false });

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current.hour) window.clearTimeout(scrollTimerRef.current.hour);
      if (scrollTimerRef.current.minute) window.clearTimeout(scrollTimerRef.current.minute);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const itemHeight = 40;
    ignoreScrollUntilRef.current = Date.now() + 350;
    if (hourWheelRef.current) {
      hourWheelRef.current.scrollTo({
        top: selectedHour * itemHeight,
        behavior: 'smooth',
      });
    }
    if (minuteWheelRef.current) {
      const mIdx = MINUTE_OPTIONS.indexOf(snappedMinute);
      if (mIdx >= 0) {
        minuteWheelRef.current.scrollTo({
          top: mIdx * itemHeight,
          behavior: 'smooth',
        });
      }
    }
  }, [active, selectedHour, snappedMinute]);

  const selectHourAndMinute = (hour: number, minute: number) => {
    onChange(resolveNextDateForHourMinute(Date.now(), hour, minute));
  };

  const applyWheelPosition = (type: 'hour' | 'minute', el: HTMLDivElement) => {
    const itemHeight = 40;
    const idx = Math.round(el.scrollTop / itemHeight);
    if (type === 'hour') {
      const h = Math.max(0, Math.min(23, idx));
      if (h !== selectedHour) {
        selectHourAndMinute(h, snappedMinute);
      }
    } else {
      const mIdx = Math.max(0, Math.min(MINUTE_OPTIONS.length - 1, idx));
      const nextMin = MINUTE_OPTIONS[mIdx];
      if (nextMin !== snappedMinute) {
        selectHourAndMinute(selectedHour, nextMin);
      }
    }
  };

  const handleWheelScroll = (type: 'hour' | 'minute') => {
    if (Date.now() < ignoreScrollUntilRef.current) return;
    if (dragStateRef.current.el) return;
    const el = type === 'hour' ? hourWheelRef.current : minuteWheelRef.current;
    if (!el) return;

    const existingTimer = scrollTimerRef.current[type];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    scrollTimerRef.current[type] = window.setTimeout(() => {
      applyWheelPosition(type, el);
    }, 120);
  };

  const startWheelDrag = (el: HTMLDivElement | null, e: React.MouseEvent<HTMLDivElement>) => {
    if (!el) return;
    dragStateRef.current = {
      el,
      startY: e.clientY,
      startScrollTop: el.scrollTop,
      moved: false,
    };
  };

  const moveWheelDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.el) return;
    const delta = e.clientY - st.startY;
    if (Math.abs(delta) > 3) {
      st.moved = true;
    }
    st.el.scrollTop = st.startScrollTop - delta;
  };

  const endWheelDrag = (type: 'hour' | 'minute') => {
    const st = dragStateRef.current;
    if (!st.el) return;
    const el = st.el;
    const wasMoved = st.moved;
    dragStateRef.current = { el: null, startY: 0, startScrollTop: 0, moved: false };
    if (!wasMoved) return;
    applyWheelPosition(type, el);
  };

  const nowRef = new Date();
  const isTomorrow =
    value.getFullYear() !== nowRef.getFullYear() ||
    value.getMonth() !== nowRef.getMonth() ||
    value.getDate() !== nowRef.getDate();
  const estHourStr = selectedHour.toString().padStart(2, '0');
  const estMinStr = rawMinute.toString().padStart(2, '0');
  const minutesAhead = Math.max(1, Math.round((value.getTime() - Date.now()) / 60000));
  const aheadLabel =
    minutesAhead >= 60
      ? `${Math.floor(minutesAhead / 60)}시간 ${minutesAhead % 60 > 0 ? `${minutesAhead % 60}분 ` : ''}뒤`
      : `${minutesAhead}분 뒤`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#0D1B3E] inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[#1D5CE5]" />
          출발 시간
        </span>
        <span className="text-xs font-semibold text-[#0284C7] tabular-nums">
          {aheadLabel} 출발
        </span>
      </div>

      <div className="rounded-2xl bg-[#F4F9FF] border border-[#DCE9F8] p-4 space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-[#435E8D]">
            {isTomorrow ? '내일' : '오늘'}
          </span>
          <span className="text-2xl font-bold text-[#0D1B3E] tabular-nums">
            {estHourStr}시 {estMinStr}분
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <span className="block text-[11px] font-semibold text-[#435E8D] text-center mb-1">
              시
            </span>
            <div
              ref={hourWheelRef}
              onScroll={() => handleWheelScroll('hour')}
              onMouseDown={(e) => startWheelDrag(hourWheelRef.current, e)}
              onMouseMove={moveWheelDrag}
              onMouseUp={() => endWheelDrag('hour')}
              onMouseLeave={() => endWheelDrag('hour')}
              className="h-32 overflow-y-auto snap-y snap-mandatory rounded-xl bg-white border border-[#DCE9F8] py-10 select-none cursor-grab active:cursor-grabbing"
            >
              {HOUR_OPTIONS.map((h) => {
                const isSelected = h === selectedHour;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => selectHourAndMinute(h, snappedMinute)}
                    className={`w-full h-10 snap-center flex items-center justify-center text-sm font-bold tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-[#EBF4FF] text-[#1D5CE5]'
                        : 'text-[#435E8D] hover:text-[#0D1B3E]'
                    }`}
                  >
                    {h.toString().padStart(2, '0')}시
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-semibold text-[#435E8D] text-center mb-1">
              분
            </span>
            <div
              ref={minuteWheelRef}
              onScroll={() => handleWheelScroll('minute')}
              onMouseDown={(e) => startWheelDrag(minuteWheelRef.current, e)}
              onMouseMove={moveWheelDrag}
              onMouseUp={() => endWheelDrag('minute')}
              onMouseLeave={() => endWheelDrag('minute')}
              className="h-32 overflow-y-auto snap-y snap-mandatory rounded-xl bg-white border border-[#DCE9F8] py-10 select-none cursor-grab active:cursor-grabbing"
            >
              {MINUTE_OPTIONS.map((m) => {
                const isSelected = m === snappedMinute;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => selectHourAndMinute(selectedHour, m)}
                    className={`w-full h-10 snap-center flex items-center justify-center text-sm font-bold tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-[#EBF4FF] text-[#1D5CE5]'
                        : 'text-[#435E8D] hover:text-[#0D1B3E]'
                    }`}
                  >
                    {m.toString().padStart(2, '0')}분
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
