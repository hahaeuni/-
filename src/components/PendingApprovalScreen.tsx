import React, { useEffect, useState } from 'react';
import { AlertCircle, Camera, Clock, LogOut, RefreshCw, Shield } from 'lucide-react';
import { logoutUser, resubmitRejectedProfile } from '../lib/authService';
import { compressFileToBlob } from '../lib/imageUtils';
import { BANKS, Gender, LIMITS, UserProfile } from '../types';

interface PendingApprovalScreenProps {
  profile: UserProfile;
  isAdmin?: boolean;
  onOpenAdminPage?: () => void;
}

export const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({
  profile,
  isAdmin,
  onOpenAdminPage,
}) => {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [bankName, setBankName] = useState(profile.bankName);
  const [accountNumber, setAccountNumber] = useState(profile.accountNumber);
  const [accountHolder, setAccountHolder] = useState(profile.accountHolder);
  const [studentIdBlob, setStudentIdBlob] = useState<Blob | null>(null);
  const [studentIdPreviewUrl, setStudentIdPreviewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (studentIdPreviewUrl) {
        URL.revokeObjectURL(studentIdPreviewUrl);
      }
    };
  }, [studentIdPreviewUrl]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const { blob, previewUrl } = await compressFileToBlob(file);
      if (studentIdPreviewUrl) {
        URL.revokeObjectURL(studentIdPreviewUrl);
      }
      setStudentIdBlob(blob);
      setStudentIdPreviewUrl(previewUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '사진을 불러오지 못했어요.');
    }
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!studentIdBlob) {
      setError('새 학생증 사진을 올려 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await resubmitRejectedProfile(profile, {
        name,
        phone,
        gender,
        bankName,
        accountNumber,
        accountHolder,
        studentIdPhotoBlob: studentIdBlob,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '다시 신청하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (profile.status === 'pending') {
    return (
      <div className="min-h-screen bg-[#F4F9FF] flex flex-col justify-center px-4 py-8">
        <div className="w-full max-w-md mx-auto bg-white border border-[#D4E4F7] rounded-3xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-[#E0F2FE] text-[#1D5CE5] flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-[#0D1B3E]">승인을 기다리고 있어요</h1>
          <p className="mt-2.5 text-sm text-[#435E8D] leading-relaxed">
            관리자가 학생증을 확인한 뒤 승인하면 바로 한림택시를 이용할 수 있어요.
          </p>

          <div className="mt-6 pt-5 border-t border-[#E6F0FC] flex flex-col gap-2.5">
            {isAdmin && onOpenAdminPage && (
              <button
                type="button"
                onClick={onOpenAdminPage}
                className="w-full min-h-[46px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Shield className="w-4 h-4" />
                관리자 승인 페이지 열기
              </button>
            )}
            <button
              type="button"
              onClick={() => void logoutUser()}
              className="w-full min-h-[46px] rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] hover:bg-[#EBF4FF] text-[#0D1B3E] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F9FF] flex flex-col justify-center px-4 py-8">
      <div className="w-full max-w-md mx-auto bg-white border border-[#D4E4F7] rounded-3xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-bold text-[#0D1B3E]">승인이 거절되었어요</h1>
            <p className="text-xs text-[#435E8D] mt-1">
              {profile.rejectionReason || '학생증 사진을 확인해 다시 신청해 주세요.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logoutUser()}
            className="px-3 min-h-[40px] rounded-xl border border-[#D4E4F7] text-xs font-semibold text-[#435E8D] hover:text-[#0D1B3E] shrink-0"
          >
            로그아웃
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-[#0D1B3E] text-white text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#7DD3FC]" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleResubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#0D1B3E] mb-1">이름</label>
              <input
                type="text"
                required
                maxLength={LIMITS.NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0D1B3E] mb-1">전화번호</label>
              <input
                type="tel"
                required
                maxLength={LIMITS.PHONE_MAX}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-[#0D1B3E] mb-1">성별</span>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as Gender[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`min-h-[44px] rounded-xl text-sm font-semibold border ${
                    gender === g
                      ? 'bg-[#1D5CE5] border-[#1D5CE5] text-white'
                      : 'bg-[#F8FBFF] border-[#D4E4F7] text-[#435E8D]'
                  }`}
                >
                  {g === 'male' ? '남자' : '여자'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#0D1B3E] mb-1">은행</label>
              <select
                value={BANKS.includes(bankName as (typeof BANKS)[number]) ? bankName : BANKS[0]}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm"
              >
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0D1B3E] mb-1">예금주명</label>
              <input
                type="text"
                required
                maxLength={LIMITS.HOLDER_MAX}
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0D1B3E] mb-1">계좌번호</label>
            <input
              type="text"
              required
              maxLength={LIMITS.ACCOUNT_MAX}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm tabular-nums"
            />
          </div>

          <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-dashed border-[#93C5FD] bg-[#F4F9FF] cursor-pointer">
            {studentIdPreviewUrl ? (
              <img
                src={studentIdPreviewUrl}
                alt="새 학생증 사진"
                className="w-full max-h-40 object-contain rounded-xl bg-white"
              />
            ) : (
              <>
                <Camera className="w-5 h-5 text-[#1D5CE5]" />
                <span className="text-xs font-semibold text-[#0D1B3E]">새 학생증 사진 올리기</span>
              </>
            )}
            <input type="file" accept="image/*" onChange={handlePhotoUpload} className="sr-only" />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {submitting ? '다시 신청 중...' : '승인 다시 신청하기'}
          </button>
        </form>
      </div>
    </div>
  );
};
