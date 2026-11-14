import React, { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Image as ImageIcon,
  Lock,
  LogOut,
  MapPin,
  Maximize2,
  RotateCcw,
  Send,
  Users,
  X,
} from 'lucide-react';
import { captureVideoFrameToBlob, compressFileToBlob } from '../lib/imageUtils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  closeFlexibleRoom,
  completeRoomSettlement,
  expireRoomIfNeeded,
  joinRoom,
  leaveRoom,
  sendRoomSettlement,
  updateRoomLocationPhoto,
} from '../lib/roomService';
import {
  formatCurrency,
  formatDepartureTime,
  formatGenderConditionLabel,
  RoomSettlement,
  TaxiRoom,
  UserProfile,
} from '../types';

interface RoomDetailViewProps {
  roomId: string;
  profile: UserProfile;
  blockingRoom: TaxiRoom | null;
  nowMs: number;
  onBack: () => void;
}

export const RoomDetailView: React.FC<RoomDetailViewProps> = ({
  roomId,
  profile,
  blockingRoom,
  nowMs,
  onBack,
}) => {
  const [room, setRoom] = useState<TaxiRoom | null>(null);
  const [settlement, setSettlement] = useState<RoomSettlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoomPhoto, setZoomPhoto] = useState(false);

  // Settlement input state (host only)
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [fareInput, setFareInput] = useState('');
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Deferred location photo capture state (host only, up to 5 min before departure)
  const [showPhotoUploader, setShowPhotoUploader] = useState(false);
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState<Blob | null>(null);
  const [pendingPhotoPreviewUrl, setPendingPhotoPreviewUrl] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl);
      }
    };
  }, [pendingPhotoPreviewUrl]);

  useEffect(() => {
    const path = `rooms/${roomId}`;
    const unsub = onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) => {
        if (!snap.exists()) {
          setRoom(null);
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() } as TaxiRoom;
        setRoom(data);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [roomId]);

  const isParticipant = Boolean(room?.participantIds.includes(profile.uid));

  useEffect(() => {
    if (!room || !isParticipant || (room.status !== 'settled' && room.status !== 'completed')) {
      setSettlement(null);
      return;
    }
    const path = `rooms/${roomId}/settlement/info`;
    const unsub = onSnapshot(
      doc(db, 'rooms', roomId, 'settlement', 'info'),
      (snap) => {
        if (snap.exists()) {
          setSettlement(snap.data() as RoomSettlement);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [room, roomId, isParticipant]);

  // Auto-expire if open room passes departureAt
  useEffect(() => {
    if (
      room &&
      room.status === 'open' &&
      room.departureAt &&
      room.departureAt.toMillis() <= nowMs
    ) {
      void expireRoomIfNeeded(room.id);
    }
  }, [room, nowMs]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-[#D4E4F7] rounded-3xl p-8 text-center text-sm text-[#435E8D]">
        방 정보를 불러오는 중이에요...
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-[#D4E4F7] rounded-3xl p-8 text-center space-y-4">
        <p className="text-base font-bold text-[#0D1B3E]">방을 찾을 수 없어요</p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-5 rounded-xl bg-[#1D5CE5] text-white text-sm font-semibold"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  const isHost = room.hostId === profile.uid;
  const { clockText, remainingText, isExpired } = formatDepartureTime(room.departureAt, nowMs);
  const effectiveExpired = room.status === 'expired' || (room.status === 'open' && isExpired);
  const genderMismatch =
    room.genderCondition !== 'any' && room.genderCondition !== profile.gender;
  const inAnotherRoom = Boolean(blockingRoom && blockingRoom.id !== room.id);

  const parsedFare = Number(fareInput.replace(/[^0-9]/g, ''));
  const livePerPerson =
    Number.isFinite(parsedFare) && parsedFare > 0 && room.currentParticipants > 0
      ? Math.ceil(parsedFare / room.currentParticipants)
      : 0;

  const statusText =
    effectiveExpired
      ? '출발 시간이 지나 종료됨'
      : room.status === 'open'
      ? '모집 중'
      : room.status === 'closed'
      ? '모집 마감'
      : room.status === 'settled'
      ? '계좌 전송됨 · 정산 진행 중'
      : '정산 완료';

  const handleJoin = async () => {
    setError('');
    setActionBusy(true);
    try {
      await joinRoom(room.id, profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : '방에 참가하지 못했어요.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCloseFlexibleRoom = async () => {
    setError('');
    setActionBusy(true);
    try {
      await closeFlexibleRoom(room.id, profile.uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : '모집을 마감하지 못했어요.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleLeave = async () => {
    setError('');
    setActionBusy(true);
    try {
      await leaveRoom(room.id, profile.uid);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : '방을 나가지 못했어요.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSendSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setActionBusy(true);
    try {
      await sendRoomSettlement(room.id, profile, parsedFare, room.currentParticipants);
      setShowSettlementForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '정산 정보를 전송하지 못했어요.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCompleteSettlement = async () => {
    setError('');
    setActionBusy(true);
    try {
      await completeRoomSettlement(room.id, profile.uid);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : '정산 완료 처리에 실패했어요.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCopyAccount = async () => {
    if (!settlement) return;
    try {
      await navigator.clipboard.writeText(settlement.accountNumber);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const startLiveCamera = async () => {
    setCameraError('');
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('이 브라우저에서는 바로 카메라를 켤 수 없어요. 아래 기본 카메라 앱 버튼을 이용해 주세요.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError('카메라 권한이 없거나 장치를 찾을 수 없어요. 아래 파일/카메라 버튼으로 사진을 올려 주세요.');
    }
  };

  const handleCaptureFrame = async () => {
    if (!videoRef.current) return;
    try {
      const { blob, previewUrl } = await captureVideoFrameToBlob(videoRef.current);
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl);
      }
      setPendingPhotoBlob(blob);
      setPendingPhotoPreviewUrl(previewUrl);
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : '사진을 찍지 못했어요.');
    }
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const { blob, previewUrl } = await compressFileToBlob(file);
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl);
      }
      setPendingPhotoBlob(blob);
      setPendingPhotoPreviewUrl(previewUrl);
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : '사진을 처리하지 못했어요.');
    }
  };

  const handleUploadLocationPhoto = async () => {
    if (!pendingPhotoBlob) return;
    setError('');
    setUploadingPhoto(true);
    try {
      await updateRoomLocationPhoto(room.id, profile.uid, pendingPhotoBlob);
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl);
      }
      setPendingPhotoPreviewUrl('');
      setPendingPhotoBlob(null);
      setShowPhotoUploader(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '위치 사진을 등록하지 못했어요.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const photoDeadlineMs = room.departureAt ? room.departureAt.toMillis() - 5 * 60 * 1000 : 0;
  const canUploadLocationPhoto =
    isHost &&
    (room.status === 'open' || room.status === 'closed') &&
    !effectiveExpired &&
    nowMs <= photoDeadlineMs;
  const deadlineDate = new Date(photoDeadlineMs);
  const deadlineClock = `${deadlineDate.getHours().toString().padStart(2, '0')}시 ${deadlineDate
    .getMinutes()
    .toString()
    .padStart(2, '0')}분`;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-white hover:bg-[#EBF4FF] text-xs font-semibold text-[#0D1B3E] inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로
        </button>

        <span className="text-xs font-bold text-[#1D5CE5]">{statusText}</span>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#0D1B3E] text-white text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#7DD3FC]" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left / Top: Photo + Route */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0284C7] tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                <span>{clockText}</span>
                {room.status === 'open' && !effectiveExpired && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{remainingText}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-lg font-bold text-[#0D1B3E]">{room.departure}</span>
                <ArrowRight className="w-5 h-5 text-[#1D5CE5] shrink-0" />
                <span className="text-lg font-bold text-[#0D1B3E]">{room.destination}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#EFF6FF] grid grid-cols-2 gap-3 text-sm">
              <div className="bg-[#F4F9FF] rounded-2xl p-3.5">
                <span className="block text-[11px] font-medium text-[#435E8D]">인원</span>
                <span className="mt-1 inline-flex items-center gap-1.5 font-bold text-[#0D1B3E] tabular-nums">
                  <Users className="w-4 h-4 text-[#1D5CE5]" />
                  {room.currentParticipants} / {room.maxParticipants}명
                  {room.isFlexibleCapacity ? ' (상관없음)' : ''}
                </span>
              </div>
              <div className="bg-[#F4F9FF] rounded-2xl p-3.5">
                <span className="block text-[11px] font-medium text-[#435E8D]">성별 조건</span>
                <span className="mt-1 block font-bold text-[#0D1B3E]">
                  {formatGenderConditionLabel(room.genderCondition)}
                </span>
              </div>
            </div>
          </div>

          {/* Location Photo */}
          <div className="bg-white border border-[#D4E4F7] rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#0D1B3E] flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#1D5CE5]" />
                모집자 현재 위치 사진
              </h3>
              <div className="flex items-center gap-1.5">
                {canUploadLocationPhoto && room.locationPhotoUrl && !showPhotoUploader && (
                  <button
                    type="button"
                    onClick={() => setShowPhotoUploader(true)}
                    className="min-h-[36px] px-2.5 rounded-lg text-xs font-medium text-[#1D5CE5] hover:bg-[#EBF4FF]"
                  >
                    사진 변경
                  </button>
                )}
                {room.locationPhotoUrl && !showPhotoUploader && (
                  <button
                    type="button"
                    onClick={() => setZoomPhoto(true)}
                    className="min-h-[36px] px-2.5 rounded-lg text-xs font-medium text-[#435E8D] hover:bg-[#EBF4FF] inline-flex items-center gap-1"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    크게 보기
                  </button>
                )}
              </div>
            </div>

            {room.locationPhotoUrl && !showPhotoUploader ? (
              <button
                type="button"
                onClick={() => setZoomPhoto(true)}
                className="w-full block rounded-2xl overflow-hidden bg-[#F4F9FF] border border-[#E2ECF9]"
              >
                <img
                  src={room.locationPhotoUrl}
                  alt={`${room.departure} 모집자 현재 위치`}
                  className="w-full max-h-72 object-cover"
                />
              </button>
            ) : canUploadLocationPhoto ? (
              <div className="space-y-3">
                <p className="text-xs text-[#0284C7] font-semibold tabular-nums">
                  출발 5분 전({deadlineClock})까지 현재 위치 사진을 등록해 주세요.
                </p>

                {cameraError && (
                  <div className="p-3 rounded-xl bg-[#EBF4FF] text-[#0D1B3E] text-xs leading-relaxed">
                    {cameraError}
                  </div>
                )}

                {cameraActive ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl overflow-hidden bg-[#0D1B3E] aspect-[4/3]">
                      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="min-h-[46px] rounded-xl border border-[#D4E4F7] text-sm font-semibold text-[#435E8D]"
                      >
                        카메라 끄기
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCaptureFrame()}
                        className="min-h-[46px] rounded-xl bg-[#1D5CE5] text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        사진 찍기
                      </button>
                    </div>
                  </div>
                ) : pendingPhotoPreviewUrl ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl overflow-hidden border border-[#DCE9F8] bg-[#F4F9FF]">
                      <img
                        src={pendingPhotoPreviewUrl}
                        alt="업로드할 현재 위치 사진"
                        className="w-full max-h-72 object-cover"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={uploadingPhoto}
                        onClick={() => {
                          URL.revokeObjectURL(pendingPhotoPreviewUrl);
                          setPendingPhotoPreviewUrl('');
                          setPendingPhotoBlob(null);
                        }}
                        className="min-h-[46px] rounded-xl border border-[#D4E4F7] text-xs font-semibold text-[#435E8D] inline-flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        다시 찍기
                      </button>
                      <button
                        type="button"
                        disabled={uploadingPhoto}
                        onClick={() => void handleUploadLocationPhoto()}
                        className="min-h-[46px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        {uploadingPhoto ? '올리는 중...' : '위치 사진 등록'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => void startLiveCamera()}
                      className="w-full min-h-[120px] rounded-2xl border border-dashed border-[#60A5FA] bg-[#F4F9FF] hover:bg-[#EBF4FF] flex flex-col items-center justify-center gap-2 p-4 transition-colors"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-[#1D5CE5] text-white flex items-center justify-center">
                        <Camera className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-bold text-[#0D1B3E]">카메라 켜서 위치 찍기</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="min-h-[44px] px-3 rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] text-xs font-semibold text-[#0D1B3E] flex items-center justify-center gap-1.5 cursor-pointer">
                        <Camera className="w-4 h-4 text-[#1D5CE5]" />
                        기본 카메라 앱
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoFileChange}
                          className="sr-only"
                        />
                      </label>

                      <label className="min-h-[44px] px-3 rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] text-xs font-semibold text-[#0D1B3E] flex items-center justify-center gap-1.5 cursor-pointer">
                        <ImageIcon className="w-4 h-4 text-[#1D5CE5]" />
                        앨범에서 선택
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoFileChange}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {showPhotoUploader && room.locationPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      if (pendingPhotoPreviewUrl) {
                        URL.revokeObjectURL(pendingPhotoPreviewUrl);
                        setPendingPhotoPreviewUrl('');
                      }
                      setPendingPhotoBlob(null);
                      setShowPhotoUploader(false);
                    }}
                    className="w-full min-h-[40px] rounded-xl text-xs font-semibold text-[#435E8D] hover:text-[#0D1B3E]"
                  >
                    취소
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#F4F9FF] border border-[#DCE9F8] p-5 text-center space-y-1.5">
                <p className="text-sm font-bold text-[#0D1B3E]">
                  {nowMs <= photoDeadlineMs && (room.status === 'open' || room.status === 'closed')
                    ? '모집자가 아직 위치 사진을 올리지 않았어요'
                    : '등록된 위치 사진이 없어요'}
                </p>
                <p className="text-xs text-[#435E8D] leading-relaxed">
                  {isHost
                    ? '출발 시간 5분 전이 지나 위치 사진을 등록할 수 없어요.'
                    : nowMs <= photoDeadlineMs && (room.status === 'open' || room.status === 'closed')
                    ? `출발 5분 전(${deadlineClock})까지 모집자가 현재 위치 사진을 올릴 예정이에요.`
                    : '모집자가 위치 사진을 올리지 않고 출발 시간이 다가왔어요.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right / Bottom: Participants & Actions & Settlement */}
        <div className="lg:col-span-5 space-y-4">
          {/* Participants List */}
          <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#0D1B3E] tabular-nums">
              참가자 ({room.currentParticipants}/{room.maxParticipants}명)
            </h3>
            <ul className="divide-y divide-[#EFF6FF]">
              {room.participantNames.map((memberName, idx) => {
                const memberId = room.participantIds[idx];
                const isRoomHost = memberId === room.hostId;
                const isMe = memberId === profile.uid;
                return (
                  <li
                    key={`${memberId}-${idx}`}
                    className="py-2.5 flex items-center justify-between text-sm"
                  >
                    <span className="font-semibold text-[#0D1B3E]">
                      {memberName}
                      {isMe && ' (나)'}
                    </span>
                    <span className="text-xs font-medium text-[#435E8D]">
                      {isRoomHost ? '모집자' : '동승자'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Join / Close / Leave Actions */}
          {!effectiveExpired && room.status === 'open' && (
            <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 space-y-3">
              {isParticipant ? (
                <>
                  {isHost && room.isFlexibleCapacity && (
                    <div className="space-y-2 pb-3 border-b border-[#EFF6FF]">
                      <p className="text-xs text-[#435E8D] leading-relaxed">
                        {room.currentParticipants >= 2
                          ? `현재 ${room.currentParticipants}명이 모였어요. 지금 모인 인원끼리 바로 마감할 수 있어요.`
                          : '최소 2명 이상 모이면 모집을 마감할 수 있어요.'}
                      </p>
                      <button
                        type="button"
                        disabled={actionBusy || room.currentParticipants < 2}
                        onClick={() => void handleCloseFlexibleRoom()}
                        className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-45 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                      >
                        <Lock className="w-4 h-4" />
                        {actionBusy ? '마감 중...' : '모집 마감하기'}
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-[#435E8D] leading-relaxed">
                    {room.isFlexibleCapacity
                      ? '최대 4명까지 모이거나 모집자가 마감하기 전에는 언제든 방을 나갈 수 있어요.'
                      : '정원이 모두 모이면 자동으로 마감되며, 마감 전에는 언제든 방을 나갈 수 있어요.'}
                  </p>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleLeave()}
                    className="w-full min-h-[48px] rounded-xl border border-[#C6DCF7] bg-[#F8FBFF] hover:bg-[#EBF4FF] text-[#0D1B3E] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {actionBusy ? '처리 중...' : '방 나가기'}
                  </button>
                </>
              ) : (
                <>
                  {genderMismatch && (
                    <p className="text-xs font-semibold text-[#0D1B3E] bg-[#EBF4FF] rounded-xl p-3">
                      성별 조건({formatGenderConditionLabel(room.genderCondition)})이 맞지 않아 참가할 수 없어요.
                    </p>
                  )}
                  {!genderMismatch && inAnotherRoom && (
                    <p className="text-xs font-semibold text-[#0D1B3E] bg-[#EBF4FF] rounded-xl p-3">
                      이미 다른 동승방에 참여 중이에요. 한 번에 하나의 방에만 속할 수 있어요.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={actionBusy || genderMismatch || inAnotherRoom}
                    onClick={() => void handleJoin()}
                    className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-45 text-white text-sm font-semibold transition-colors"
                  >
                    {actionBusy ? '참가 처리 중...' : '참가하기'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Host Settlement Trigger (only closed room & host) */}
          {room.status === 'closed' && isHost && !showSettlementForm && (
            <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 space-y-3">
              <p className="text-xs text-[#435E8D] leading-relaxed">
                모집이 마감되었어요. 목적지에 도착하면 아래 버튼을 눌러 택시비를 정산해 주세요.
              </p>
              <button
                type="button"
                onClick={() => setShowSettlementForm(true)}
                className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                도착 후 정산
              </button>
            </div>
          )}

          {/* Closed waiting message for non-host participants */}
          {room.status === 'closed' && !isHost && isParticipant && (
            <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 text-sm text-[#435E8D] leading-relaxed">
              모집이 마감되었어요. 도착 후 모집자가 택시비를 정산하면 계좌 정보가 이곳에 표시됩니다.
            </div>
          )}

          {/* Host Taxi Fare Input Form */}
          {room.status === 'closed' && isHost && showSettlementForm && (
            <form
              onSubmit={handleSendSettlement}
              className="bg-white border border-[#1D5CE5] rounded-3xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#0D1B3E]">도착 후 정산</h3>
                <button
                  type="button"
                  onClick={() => setShowSettlementForm(false)}
                  className="text-xs text-[#435E8D] hover:text-[#0D1B3E]"
                >
                  닫기
                </button>
              </div>

              <div>
                <label htmlFor="fare-input" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                  택시비 총액 (원)
                </label>
                <input
                  id="fare-input"
                  type="text"
                  inputMode="numeric"
                  required
                  value={fareInput}
                  onChange={(e) => setFareInput(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="예: 12000"
                  className="w-full min-h-[48px] px-4 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-base font-bold text-[#0D1B3E] tabular-nums"
                />
              </div>

              <div className="rounded-2xl bg-[#F4F9FF] border border-[#DCE9F8] p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#435E8D] tabular-nums">
                  <span>나눌 인원</span>
                  <span>{room.currentParticipants}명</span>
                </div>
                <div className="flex items-center justify-between text-base font-bold text-[#0D1B3E] tabular-nums">
                  <span>1인당 정산 금액</span>
                  <span className="text-[#1D5CE5]">
                    {livePerPerson > 0 ? formatCurrency(livePerPerson) : '0원'}
                  </span>
                </div>
              </div>

              <div className="text-xs text-[#435E8D] bg-[#F8FBFF] rounded-xl p-3 tabular-nums">
                전송될 계좌: {profile.bankName} {profile.accountNumber} ({profile.accountHolder})
              </div>

              <button
                type="submit"
                disabled={actionBusy || livePerPerson <= 0}
                className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-45 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4" />
                {actionBusy ? '전송 중...' : '계좌 전송'}
              </button>
            </form>
          )}

          {/* Real-Time Settlement Card (Only participants can read) */}
          {(room.status === 'settled' || room.status === 'completed') &&
            isParticipant &&
            settlement && (
              <div className="bg-[#0D1B3E] text-white rounded-3xl p-5 sm:p-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[#7DD3FC]">
                    {room.status === 'completed' ? '정산 완료 내역' : '도착 후 정산 안내'}
                  </p>
                  <h3 className="text-2xl font-bold tabular-nums mt-1">
                    1인당 {formatCurrency(settlement.perPersonAmount)}
                  </h3>
                  <p className="text-xs text-[#BFDBFE] tabular-nums mt-1">
                    총 택시비 {formatCurrency(settlement.totalFare)} ÷ {settlement.participantCount}명
                  </p>
                </div>

                <div className="rounded-2xl bg-[#162D66] p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#93C5FD]">은행</span>
                    <span className="font-semibold">{settlement.bankName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[#93C5FD]">계좌번호</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold tabular-nums">{settlement.accountNumber}</span>
                      <button
                        type="button"
                        onClick={() => void handleCopyAccount()}
                        className="px-2.5 py-1 rounded-lg bg-[#1D5CE5] text-xs font-semibold inline-flex items-center gap-1"
                      >
                        {copiedAccount ? (
                          <>
                            <Check className="w-3 h-3" />
                            복사됨
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            복사
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#93C5FD]">예금주명</span>
                    <span className="font-semibold">{settlement.accountHolder}</span>
                  </div>
                </div>

                {room.status === 'settled' && isHost && (
                  <div className="pt-2 border-t border-[#264691] space-y-2">
                    <p className="text-xs text-[#BFDBFE] leading-relaxed">
                      모든 동승자에게 입금을 확인했다면 아래 버튼을 눌러 정산 완료 처리해 주세요.
                    </p>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleCompleteSettlement()}
                      className="w-full min-h-[48px] rounded-xl bg-white hover:bg-[#EBF4FF] disabled:opacity-60 text-[#0D1B3E] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#1D5CE5]" />
                      {actionBusy ? '처리 중...' : '정산 완료'}
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {zoomPhoto && (
        <div
          className="fixed inset-0 z-50 bg-[#0D1B3E]/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomPhoto(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-3xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0D1B3E]">모집자 현재 위치 사진</h3>
              <button
                type="button"
                onClick={() => setZoomPhoto(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#0D1B3E] hover:bg-[#EBF4FF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={room.locationPhotoUrl}
              alt="모집자 현재 위치 크게 보기"
              className="w-full max-h-[75vh] object-contain rounded-2xl bg-[#F4F9FF]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
