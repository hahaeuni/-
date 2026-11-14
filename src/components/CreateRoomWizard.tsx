import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Image as ImageIcon,
  MapPin,
  RotateCcw,
} from 'lucide-react';
import { captureVideoFrameToBlob, compressFileToBlob } from '../lib/imageUtils';
import { createRoom } from '../lib/roomService';
import {
  DepartureMinutes,
  GenderCondition,
  LocationOption,
  LOCATIONS,
  TaxiRoom,
  UserProfile,
} from '../types';

interface CreateRoomWizardProps {
  profile: UserProfile;
  blockingRoom: TaxiRoom | null;
  onCancel: () => void;
  onCreated: (roomId: string) => void;
  onGoToActiveRoom: (roomId: string) => void;
}

export const CreateRoomWizard: React.FC<CreateRoomWizardProps> = ({
  profile,
  blockingRoom,
  onCancel,
  onCreated,
  onGoToActiveRoom,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: departure & destination
  const [departure, setDeparture] = useState<LocationOption | null>(null);
  const [destination, setDestination] = useState<LocationOption | null>(null);

  // Step 2: camera photo (Firebase Storage Blob)
  const [locationPhotoBlob, setLocationPhotoBlob] = useState<Blob | null>(null);
  const [locationPhotoPreviewUrl, setLocationPhotoPreviewUrl] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Step 3: conditions
  const [genderCondition, setGenderCondition] = useState<GenderCondition>('any');
  const [maxParticipants, setMaxParticipants] = useState<number>(4);
  const [departureMinutes, setDepartureMinutes] = useState<DepartureMinutes>(10);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      if (locationPhotoPreviewUrl) {
        URL.revokeObjectURL(locationPhotoPreviewUrl);
      }
    };
  }, [locationPhotoPreviewUrl]);

  if (blockingRoom) {
    return (
      <div className="max-w-lg mx-auto bg-white border border-[#D4E4F7] rounded-3xl p-6 sm:p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#EBF4FF] text-[#1D5CE5] flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#0D1B3E]">이미 참여 중인 방이 있어요</h2>
        <p className="text-sm text-[#435E8D] leading-relaxed">
          한림택시는 한 번에 하나의 동승방에만 속할 수 있어요. 현재 참여 중인{' '}
          <strong className="text-[#0D1B3E]">
            {blockingRoom.departure} → {blockingRoom.destination}
          </strong>{' '}
          방을 확인해 주세요.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[46px] rounded-xl border border-[#D4E4F7] text-sm font-semibold text-[#435E8D]"
          >
            돌아가기
          </button>
          <button
            type="button"
            onClick={() => onGoToActiveRoom(blockingRoom.id)}
            className="min-h-[46px] rounded-xl bg-[#1D5CE5] text-white text-sm font-semibold"
          >
            내 동승방 보기
          </button>
        </div>
      </div>
    );
  }

  const handleLocationTap = (loc: LocationOption) => {
    setError('');
    if (departure === loc) {
      setDeparture(destination);
      setDestination(null);
      return;
    }
    if (destination === loc) {
      setDestination(null);
      return;
    }
    if (!departure) {
      setDeparture(loc);
      return;
    }
    setDestination(loc);
  };

  const startLiveCamera = async () => {
    setCameraError('');
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('이 브라우저에서는 바로 카메라를 켤 수 없어요. 아래 카메라 촬영 버튼을 이용해 주세요.');
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
      if (locationPhotoPreviewUrl) {
        URL.revokeObjectURL(locationPhotoPreviewUrl);
      }
      setLocationPhotoBlob(blob);
      setLocationPhotoPreviewUrl(previewUrl);
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : '사진을 찍지 못했어요.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const { blob, previewUrl } = await compressFileToBlob(file);
      if (locationPhotoPreviewUrl) {
        URL.revokeObjectURL(locationPhotoPreviewUrl);
      }
      setLocationPhotoBlob(blob);
      setLocationPhotoPreviewUrl(previewUrl);
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : '사진을 처리하지 못했어요.');
    }
  };

  const handleCreateSubmit = async () => {
    if (!departure || !destination || !locationPhotoBlob) return;
    setError('');
    setSubmitting(true);
    try {
      const roomId = await createRoom(profile, {
        departure,
        destination,
        locationPhotoBlob,
        genderCondition,
        maxParticipants,
        departureMinutes,
      });
      onCreated(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '방 만들기에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const estimatedDeparture = new Date(Date.now() + departureMinutes * 60 * 1000);
  const estHours = estimatedDeparture.getHours();
  const estMins = estimatedDeparture.getMinutes().toString().padStart(2, '0');
  const estPeriod = estHours < 12 ? '오전' : '오후';
  const estHourDisplay = estHours % 12 === 0 ? 12 : estHours % 12;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (step === 1) {
              stopCamera();
              onCancel();
            } else {
              stopCamera();
              setStep((s) => (s === 3 ? 2 : 1));
            }
          }}
          className="min-h-[44px] px-3 rounded-xl border border-[#D4E4F7] bg-white text-xs font-semibold text-[#0D1B3E] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          {step === 1 ? '취소' : '이전'}
        </button>

        <div className="text-xs font-bold text-[#1D5CE5] tabular-nums">
          방 만들기 · {step} / 3단계
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-1.5 rounded-full transition-colors ${
              n <= step ? 'bg-[#1D5CE5]' : 'bg-[#DCE9F8]'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-[#0D1B3E] text-white text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#7DD3FC]" />
          <span>{error}</span>
        </div>
      )}

      {step === 1 && (
        <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-[#0D1B3E]">어디에서 어디로 가시나요?</h2>
            <p className="text-xs text-[#435E8D] mt-1">
              처음 누른 곳이 출발지, 두 번째로 누른 곳이 목적지가 돼요.
            </p>
          </div>

          <div className="rounded-2xl bg-[#F4F9FF] border border-[#DCE9F8] p-4 flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-[#0284C7]">출발지</span>
              <span className="block font-bold text-[#0D1B3E] truncate mt-0.5">
                {departure || '선택해 주세요'}
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-[#1D5CE5] shrink-0" />
            <div className="min-w-0 flex-1 text-right">
              <span className="block text-[11px] font-semibold text-[#0284C7]">목적지</span>
              <span className="block font-bold text-[#0D1B3E] truncate mt-0.5">
                {destination || '선택해 주세요'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {LOCATIONS.map((loc) => {
              const isDep = departure === loc;
              const isDest = destination === loc;
              const isSelected = isDep || isDest;

              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => handleLocationTap(loc)}
                  className={`min-h-[54px] px-4 rounded-2xl border text-left flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-[#1D5CE5] border-[#1D5CE5] text-white'
                      : 'bg-[#F8FBFF] border-[#D4E4F7] text-[#0D1B3E] hover:bg-[#EBF4FF]'
                  }`}
                >
                  <span className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#BAE6FD]' : 'text-[#1D5CE5]'}`} />
                    {loc}
                  </span>
                  {isDep && <span className="text-xs font-bold text-[#BAE6FD] shrink-0">출발</span>}
                  {isDest && <span className="text-xs font-bold text-[#BAE6FD] shrink-0">도착</span>}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!departure || !destination}
            onClick={() => setStep(2)}
            className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            다음 단계로
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-[#0D1B3E]">현재 위치를 찍어 올려 주세요</h2>
            <p className="text-xs text-[#435E8D] mt-1">
              동승자가 내가 서 있는 위치를 바로 찾을 수 있도록 사진이 공유돼요.
            </p>
          </div>

          {cameraError && (
            <div className="p-3 rounded-xl bg-[#EBF4FF] text-[#0D1B3E] text-xs leading-relaxed">
              {cameraError}
            </div>
          )}

          {cameraActive ? (
            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden bg-[#0D1B3E] aspect-[4/3] relative">
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
          ) : locationPhotoPreviewUrl ? (
            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden border border-[#DCE9F8] bg-[#F4F9FF]">
                <img
                  src={locationPhotoPreviewUrl}
                  alt="현재 위치 사진 미리보기"
                  className="w-full max-h-72 object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(locationPhotoPreviewUrl);
                  setLocationPhotoPreviewUrl('');
                  setLocationPhotoBlob(null);
                }}
                className="w-full min-h-[44px] rounded-xl border border-[#D4E4F7] text-xs font-semibold text-[#435E8D] inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                다시 찍기
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void startLiveCamera()}
                className="w-full min-h-[140px] rounded-2xl border border-dashed border-[#60A5FA] bg-[#F4F9FF] hover:bg-[#EBF4FF] flex flex-col items-center justify-center gap-2.5 p-5 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#1D5CE5] text-white flex items-center justify-center">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-[#0D1B3E]">카메라 켜서 위치 찍기</span>
                <span className="text-xs text-[#435E8D]">실시간 카메라로 현재 주변 모습을 촬영해요</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="min-h-[46px] px-3 rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] text-xs font-semibold text-[#0D1B3E] flex items-center justify-center gap-1.5 cursor-pointer">
                  <Camera className="w-4 h-4 text-[#1D5CE5]" />
                  기본 카메라 앱
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>

                <label className="min-h-[46px] px-3 rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] text-xs font-semibold text-[#0D1B3E] flex items-center justify-center gap-1.5 cursor-pointer">
                  <ImageIcon className="w-4 h-4 text-[#1D5CE5]" />
                  앨범에서 선택
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!locationPhotoBlob}
            onClick={() => setStep(3)}
            className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            다음 단계로
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-[#0D1B3E]">동승 조건을 정해 주세요</h2>
            <p className="text-xs text-[#435E8D] mt-1">
              {departure} → {destination}
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-bold text-[#0D1B3E]">동승자 성별</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'male', label: '남자' },
                  { value: 'female', label: '여자' },
                  { value: 'any', label: '상관없음' },
                ] as const
              ).map((opt) => {
                const disabled = opt.value !== 'any' && opt.value !== profile.gender;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setGenderCondition(opt.value)}
                    className={`min-h-[46px] rounded-xl border text-sm font-semibold transition-colors ${
                      genderCondition === opt.value
                        ? 'bg-[#1D5CE5] border-[#1D5CE5] text-white'
                        : disabled
                        ? 'bg-[#F4F9FF] border-[#E2ECF9] text-[#94ABD0] cursor-not-allowed'
                        : 'bg-[#F8FBFF] border-[#D4E4F7] text-[#0D1B3E] hover:bg-[#EBF4FF]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-bold text-[#0D1B3E]">모집 인원 (나 포함)</span>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setMaxParticipants(count)}
                  className={`min-h-[46px] rounded-xl border text-sm font-semibold tabular-nums transition-colors ${
                    maxParticipants === count
                      ? 'bg-[#1D5CE5] border-[#1D5CE5] text-white'
                      : 'bg-[#F8FBFF] border-[#D4E4F7] text-[#0D1B3E] hover:bg-[#EBF4FF]'
                  }`}
                >
                  {count}명
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0D1B3E]">출발 시간</span>
              <span className="text-xs text-[#0284C7] font-medium tabular-nums">
                {estPeriod} {estHourDisplay}:{estMins} 출발 예정
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([10, 20, 30] as DepartureMinutes[]).map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDepartureMinutes(mins)}
                  className={`min-h-[46px] rounded-xl border text-sm font-semibold tabular-nums transition-colors ${
                    departureMinutes === mins
                      ? 'bg-[#1D5CE5] border-[#1D5CE5] text-white'
                      : 'bg-[#F8FBFF] border-[#D4E4F7] text-[#0D1B3E] hover:bg-[#EBF4FF]'
                  }`}
                >
                  {mins}분 후
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleCreateSubmit()}
            className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            {submitting ? '사진 올리고 방 만드는 중...' : '모집방 만들기'}
          </button>
        </div>
      )}
    </div>
  );
};
