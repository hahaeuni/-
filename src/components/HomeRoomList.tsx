import React, { useMemo, useState } from 'react';
import { ArrowRight, Car, ChevronRight, Clock, Users } from 'lucide-react';
import {
  CAMPUS_LOCATIONS,
  formatDepartureTime,
  formatGenderConditionLabel,
  STATION_LOCATIONS,
  TaxiRoom,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface HomeRoomListProps {
  rooms: TaxiRoom[];
  myActiveRoom: TaxiRoom | null;
  currentUserId: string;
  nowMs: number;
  onSelectRoom: (roomId: string) => void;
  onOpenCreate: () => void;
}

type RouteFilter = 'all' | 'fromCampus' | 'fromStation';

export const HomeRoomList: React.FC<HomeRoomListProps> = ({
  rooms,
  myActiveRoom,
  currentUserId,
  nowMs,
  onSelectRoom,
  onOpenCreate,
}) => {
  const [filter, setFilter] = useState<RouteFilter>('all');

  const openRecruitingRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (room.status !== 'open') return false;
      if (room.departureAt && room.departureAt.toMillis() <= nowMs) return false;
      if (filter === 'fromCampus') {
        return CAMPUS_LOCATIONS.includes(room.departure);
      }
      if (filter === 'fromStation') {
        return STATION_LOCATIONS.includes(room.departure);
      }
      return true;
    });
  }, [rooms, filter, nowMs]);

  return (
    <div className="space-y-6">
      {/* Single Active Room (before settlement account arrives) */}
      {myActiveRoom && (
        <section aria-label="내 동승방" className="space-y-2.5">
          <h2 className="text-sm font-bold text-[#0D1B3E]">내가 참여 중인 방</h2>
          {(() => {
            const { clockText, remainingText } = formatDepartureTime(myActiveRoom.departureAt, nowMs);
            const isHost = myActiveRoom.hostId === currentUserId;
            const statusLabel =
              myActiveRoom.status === 'open'
                ? '모집 중'
                : isHost
                ? '모집 마감 · 도착 후 정산 대기'
                : '모집 마감 · 이동 중';

            return (
              <button
                type="button"
                onClick={() => onSelectRoom(myActiveRoom.id)}
                className="w-full text-left bg-[#0D1B3E] text-white rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-[#162D66] transition-colors"
              >
                <div className="min-w-0 space-y-1.5">
                  <p className="text-xs font-medium text-[#7DD3FC]">{statusLabel}</p>
                  <p className="text-base font-bold flex items-center gap-1.5 flex-wrap">
                    <span>{myActiveRoom.departure}</span>
                    <ArrowRight className="w-4 h-4 text-[#7DD3FC] shrink-0" />
                    <span>{myActiveRoom.destination}</span>
                  </p>
                  <p className="text-xs text-[#BFDBFE] tabular-nums">
                    {myActiveRoom.status === 'open' ? `${clockText} (${remainingText})` : clockText} ·{' '}
                    {myActiveRoom.currentParticipants}/{myActiveRoom.maxParticipants}명
                    {myActiveRoom.isFlexibleCapacity ? ' (상관없음)' : ''} ·{' '}
                    {formatGenderConditionLabel(myActiveRoom.genderCondition)}
                  </p>
                  {isHost &&
                    !myActiveRoom.locationPhotoUrl &&
                    myActiveRoom.departureAt &&
                    myActiveRoom.departureAt.toMillis() - nowMs > 5 * 60 * 1000 && (
                      <p className="text-xs font-semibold text-[#BAE6FD]">
                        출발 5분 전까지 현재 위치 사진을 등록해 주세요
                      </p>
                    )}
                </div>
                <ChevronRight className="w-5 h-5 text-[#7DD3FC] shrink-0" />
              </button>
            );
          })()}
        </section>
      )}

      {/* Filter Bar & Section Title */}
      <section aria-label="모집 중인 방 목록" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0D1B3E]">지금 모집 중인 동승방</h2>
            <p className="text-xs text-[#435E8D] tabular-nums mt-0.5">
              실시간 모집 {openRecruitingRooms.length}개
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#EBF4FF] rounded-xl self-start sm:self-auto">
            {(
              [
                { key: 'all', label: '전체' },
                { key: 'fromCampus', label: '학교 출발' },
                { key: 'fromStation', label: '역·터미널' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  filter === tab.key
                    ? 'bg-white text-[#0D1B3E] shadow-sm'
                    : 'text-[#435E8D] hover:text-[#0D1B3E]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {openRecruitingRooms.length === 0 ? (
          <div className="bg-white border border-[#D4E4F7] rounded-3xl px-6 py-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#EBF4FF] text-[#1D5CE5] flex items-center justify-center mx-auto mb-4">
              <Car className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-[#0D1B3E]">아직 모집방이 없어요</p>
            <p className="mt-1.5 text-xs text-[#435E8D]">
              아래 + 버튼을 눌러 첫 번째 동승 모집방을 만들어 보세요.
            </p>
            <button
              type="button"
              onClick={onOpenCreate}
              className="mt-5 min-h-[44px] px-5 rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-xs font-semibold inline-flex items-center justify-center transition-colors"
            >
              모집방 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {openRecruitingRooms.map((room) => {
              const { clockText, remainingText } = formatDepartureTime(room.departureAt, nowMs);
              const fillRatio = Math.min(
                100,
                Math.round((room.currentParticipants / room.maxParticipants) * 100)
              );

              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onSelectRoom(room.id)}
                  className="w-full text-left bg-white border border-[#D4E4F7] hover:border-[#60A5FA] rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#0284C7] font-semibold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {clockText}
                      </span>
                      <span>{remainingText}</span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[#435E8D] truncate">{room.departure}</p>
                      <div className="flex items-center gap-1.5 text-[#0D1B3E]">
                        <ArrowRight className="w-4 h-4 text-[#1D5CE5] shrink-0" />
                        <h3 className="text-base font-bold truncate">{room.destination}</h3>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-[#EFF6FF]">
                    <div className="w-full h-1.5 rounded-full bg-[#EBF4FF] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#1D5CE5] transition-all"
                        style={{ width: `${fillRatio}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#435E8D] tabular-nums">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#0D1B3E]">
                        <Users className="w-3.5 h-3.5 text-[#1D5CE5]" />
                        {room.currentParticipants}/{room.maxParticipants}명
                        {room.isFlexibleCapacity ? ' · 상관없음' : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-[#0D1B3E]">
                        {formatGenderConditionLabel(room.genderCondition)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <PWAInstallButton variant="card" />
    </div>
  );
};
