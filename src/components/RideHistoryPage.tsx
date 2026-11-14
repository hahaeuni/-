import React from 'react';
import { ArrowRight, ChevronRight, Clock, History, Users } from 'lucide-react';
import { formatDepartureTime, formatGenderConditionLabel, TaxiRoom } from '../types';

interface RideHistoryPageProps {
  rooms: TaxiRoom[];
  currentUserId: string;
  nowMs: number;
  onSelectRoom: (roomId: string) => void;
}

export const RideHistoryPage: React.FC<RideHistoryPageProps> = ({
  rooms,
  currentUserId,
  nowMs,
  onSelectRoom,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#0D1B3E]">과거 이용 이력</h2>
        <p className="text-xs text-[#435E8D] tabular-nums mt-0.5">
          정산 계좌가 도착했거나 정산이 완료된 내 동승방 {rooms.length}건
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="bg-white border border-[#D4E4F7] rounded-3xl px-6 py-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#EBF4FF] text-[#1D5CE5] flex items-center justify-center mx-auto mb-4">
            <History className="w-7 h-7" />
          </div>
          <p className="text-base font-bold text-[#0D1B3E]">아직 지난 이용 이력이 없어요</p>
          <p className="mt-1.5 text-xs text-[#435E8D]">
            정산 계좌가 도착한 동승방은 이곳 과거 이력에 보관됩니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {rooms.map((room) => {
            const { clockText } = formatDepartureTime(room.departureAt, nowMs);
            const isHost = room.hostId === currentUserId;
            const dateLabel = room.createdAt
              ? room.createdAt.toDate().toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                })
              : '';
            const statusText = room.status === 'completed' ? '정산 완료' : '정산 계좌 도착';

            return (
              <button
                key={room.id}
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className="w-full text-left bg-white border border-[#D4E4F7] hover:border-[#60A5FA] rounded-2xl p-5 flex items-center justify-between gap-4 transition-colors"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    <span
                      className={`font-bold ${
                        room.status === 'completed' ? 'text-[#1D5CE5]' : 'text-[#0284C7]'
                      }`}
                    >
                      {statusText}
                    </span>
                    {dateLabel && (
                      <>
                        <span aria-hidden="true" className="text-[#94ABD0]">
                          ·
                        </span>
                        <span className="text-[#435E8D]">{dateLabel}</span>
                      </>
                    )}
                    {isHost && (
                      <>
                        <span aria-hidden="true" className="text-[#94ABD0]">
                          ·
                        </span>
                        <span className="text-[#0284C7] font-semibold">모집자</span>
                      </>
                    )}
                  </div>

                  <p className="text-base font-bold text-[#0D1B3E] flex items-center gap-1.5 flex-wrap">
                    <span>{room.departure}</span>
                    <ArrowRight className="w-4 h-4 text-[#1D5CE5] shrink-0" />
                    <span>{room.destination}</span>
                  </p>

                  <div className="flex items-center gap-2 text-xs text-[#435E8D] tabular-nums flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#1D5CE5]" />
                      {clockText}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-[#1D5CE5]" />
                      {room.currentParticipants}명 탑승
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatGenderConditionLabel(room.genderCondition)}</span>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-[#1D5CE5] shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
