import React, { useEffect, useRef, useState } from 'react';
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  KeyRound,
  LogOut,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import {
  changeMyPassword,
  createRecaptchaVerifier,
  deleteMyAccount,
  logoutUser,
  sendPhoneOtp,
  updateMyProfile,
} from '../lib/authService';
import { BANKS, formatGenderLabel, LIMITS, UserProfile } from '../types';

interface MyInfoPageProps {
  profile: UserProfile;
}

export const MyInfoPage: React.FC<MyInfoPageProps> = ({ profile }) => {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [bankName, setBankName] = useState(
    BANKS.includes(profile.bankName as (typeof BANKS)[number]) ? profile.bankName : '직접입력'
  );
  const [customBankName, setCustomBankName] = useState(
    BANKS.includes(profile.bankName as (typeof BANKS)[number]) ? '' : profile.bankName
  );
  const [accountNumber, setAccountNumber] = useState(profile.accountNumber);
  const [accountHolder, setAccountHolder] = useState(profile.accountHolder);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePhoneConfirmation, setDeletePhoneConfirmation] =
    useState<ConfirmationResult | null>(null);
  const [deletePhoneCode, setDeletePhoneCode] = useState('');
  const [sendingDeleteOtp, setSendingDeleteOtp] = useState(false);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const resolvedBank = bankName === '직접입력' ? customBankName : bankName;

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // ignore
        }
        recaptchaRef.current = null;
      }
    };
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSavingProfile(true);
    try {
      await updateMyProfile(profile, {
        name,
        phone,
        bankName: resolvedBank,
        accountNumber,
        accountHolder,
      });
      setFeedback({ type: 'ok', text: '내 정보가 저장되었어요.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : '정보를 저장하지 못했어요.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (newPassword !== confirmNewPassword) {
      setFeedback({ type: 'err', text: '새 비밀번호와 확인 입력이 서로 달라요.' });
      return;
    }
    setSavingPassword(true);
    try {
      await changeMyPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setFeedback({ type: 'ok', text: '비밀번호가 변경되었어요.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : '비밀번호를 변경하지 못했어요.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSendDeletePhoneOtp = async () => {
    setFeedback(null);
    setSendingDeleteOtp(true);
    try {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // ignore
        }
        recaptchaRef.current = null;
      }
      const verifier = createRecaptchaVerifier('delete-recaptcha-container');
      recaptchaRef.current = verifier;
      const result = await sendPhoneOtp(profile.phone, verifier);
      setDeletePhoneConfirmation(result);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : '인증번호를 보내지 못했어요.',
      });
    } finally {
      setSendingDeleteOtp(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setDeleting(true);
    try {
      await deleteMyAccount(profile, {
        currentPassword: deletePassword,
        phoneConfirmation: deletePhoneConfirmation ?? undefined,
        phoneCode: deletePhoneCode,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : '계정 탈퇴를 처리하지 못했어요.',
      });
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const providerLabel =
    profile.authProvider === 'google'
      ? '구글 로그인'
      : profile.authProvider === 'phone'
      ? '전화번호 인증'
      : '아이디 로그인';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div id="delete-recaptcha-container" />

      {/* Header Summary */}
      <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF4FF] text-[#1D5CE5] flex items-center justify-center shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#0D1B3E] truncate">{profile.name}</h2>
            <p className="text-xs text-[#435E8D] truncate">
              아이디 {profile.username} · {formatGenderLabel(profile.gender)} · {providerLabel}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logoutUser()}
          className="min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] hover:bg-[#EBF4FF] text-xs font-semibold text-[#0D1B3E] inline-flex items-center gap-1.5 shrink-0"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex items-start gap-2.5 p-3.5 rounded-2xl text-xs font-medium ${
            feedback.type === 'ok'
              ? 'bg-[#E0F2FE] text-[#0D1B3E] border border-[#93C5FD]'
              : 'bg-[#0D1B3E] text-white'
          }`}
        >
          {feedback.type === 'ok' ? (
            <Check className="w-4 h-4 shrink-0 mt-0.5 text-[#1D5CE5]" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#7DD3FC]" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Edit Profile & Account Info */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 space-y-4"
      >
        <h3 className="text-base font-bold text-[#0D1B3E]">개인정보 · 계좌 수정</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="my-name" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
              이름
            </label>
            <input
              id="my-name"
              type="text"
              required
              maxLength={LIMITS.NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
            />
          </div>

          <div>
            <label htmlFor="my-phone" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
              전화번호
            </label>
            <input
              id="my-phone"
              type="tel"
              required
              maxLength={LIMITS.PHONE_MAX}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="my-bank" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
              은행
            </label>
            <select
              id="my-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
            >
              {BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="직접입력">직접 입력</option>
            </select>
          </div>

          <div>
            <label htmlFor="my-holder" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
              예금주명
            </label>
            <input
              id="my-holder"
              type="text"
              required
              maxLength={LIMITS.HOLDER_MAX}
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
            />
          </div>
        </div>

        {bankName === '직접입력' && (
          <div>
            <label htmlFor="my-custom-bank" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
              은행 이름
            </label>
            <input
              id="my-custom-bank"
              type="text"
              required
              maxLength={LIMITS.BANK_MAX}
              value={customBankName}
              onChange={(e) => setCustomBankName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
            />
          </div>
        )}

        <div>
          <label htmlFor="my-account" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
            계좌번호
          </label>
          <input
            id="my-account"
            type="text"
            required
            maxLength={LIMITS.ACCOUNT_MAX}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E] tabular-nums"
          />
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="w-full min-h-[46px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <Save className="w-4 h-4" />
          {savingProfile ? '저장 중...' : '정보 저장'}
        </button>
      </form>

      {/* Password Change */}
      {profile.authProvider === 'password' ? (
        <form
          onSubmit={handleChangePassword}
          className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 space-y-4"
        >
          <h3 className="text-base font-bold text-[#0D1B3E] flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#1D5CE5]" />
            비밀번호 변경
          </h3>

          <div>
            <label htmlFor="cur-pw" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
              현재 비밀번호
            </label>
            <input
              id="cur-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="new-pw" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                새 비밀번호
              </label>
              <input
                id="new-pw"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6자 이상"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
              />
            </div>
            <div>
              <label htmlFor="confirm-pw" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                새 비밀번호 확인
              </label>
              <input
                id="confirm-pw"
                type="password"
                required
                minLength={6}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="다시 입력"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="w-full min-h-[46px] rounded-xl border border-[#C6DCF7] bg-[#F8FBFF] hover:bg-[#EBF4FF] text-[#0D1B3E] text-sm font-semibold transition-colors"
          >
            {savingPassword ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      ) : (
        <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 text-xs text-[#435E8D]">
          {profile.authProvider === 'google'
            ? '구글 계정으로 로그인한 회원이에요. 비밀번호는 구글 계정 설정에서 관리할 수 있어요.'
            : '전화번호 인증으로 가입한 회원이에요. 로그인 시 휴대폰 인증번호를 사용합니다.'}
        </div>
      )}

      {/* Account Deletion */}
      <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-[#0D1B3E]">계정 탈퇴</h3>
          <p className="text-xs text-[#435E8D] mt-0.5">
            탈퇴 시 이름, 전화번호, 계좌번호 등 모든 개인정보가 즉시 삭제돼요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDeletePhoneConfirmation(null);
            setDeletePhoneCode('');
            setShowDeleteModal(true);
          }}
          className="min-h-[44px] px-4 rounded-xl bg-[#0D1B3E] hover:bg-[#162D66] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          계정 탈퇴
        </button>
      </div>

      {/* Confirm Deletion Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0D1B3E]/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <form
            onSubmit={handleConfirmDelete}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-[#0D1B3E]">정말 탈퇴하시겠어요?</h3>
            <p className="text-xs text-[#435E8D] leading-relaxed">
              탈퇴하면 저장된 모든 개인정보와 계정이 영구적으로 삭제되며 복구할 수 없어요.
            </p>

            {profile.authProvider === 'password' && (
              <div>
                <label htmlFor="del-pw" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                  본인 확인을 위해 비밀번호를 입력해 주세요
                </label>
                <input
                  id="del-pw"
                  type="password"
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
                />
              </div>
            )}

            {profile.authProvider === 'phone' && (
              <div className="space-y-2.5">
                {!deletePhoneConfirmation ? (
                  <button
                    type="button"
                    disabled={sendingDeleteOtp}
                    onClick={() => void handleSendDeletePhoneOtp()}
                    className="w-full min-h-[44px] rounded-xl border border-[#1D5CE5] text-[#1D5CE5] text-xs font-semibold"
                  >
                    {sendingDeleteOtp ? '인증번호 전송 중...' : `${profile.phone}로 본인 확인 인증번호 받기`}
                  </button>
                ) : (
                  <div>
                    <label htmlFor="del-otp" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                      인증번호 6자리
                    </label>
                    <input
                      id="del-otp"
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      value={deletePhoneCode}
                      onChange={(e) => setDeletePhoneCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6자리 숫자 입력"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm font-bold tracking-widest text-[#0D1B3E] tabular-nums"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                className="min-h-[46px] rounded-xl border border-[#D4E4F7] text-sm font-semibold text-[#435E8D]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={
                  deleting ||
                  (profile.authProvider === 'phone' && deletePhoneCode.length < 6)
                }
                className="min-h-[46px] rounded-xl bg-[#0D1B3E] disabled:opacity-45 text-white text-sm font-semibold"
              >
                {deleting ? '삭제 중...' : '탈퇴 확인'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
