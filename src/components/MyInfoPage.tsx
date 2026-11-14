import React, { useState } from 'react';
import {
  AlertCircle,
  Bell,
  Check,
  KeyRound,
  LogOut,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import {
  changeMyPassword,
  deleteMyAccount,
  logoutUser,
  updateMyProfile,
} from '../lib/authService';
import {
  BrowserNotificationPermission,
  isPushEnabledPreference,
  requestBrowserNotificationPermission,
  setPushEnabledPreference,
  showBrowserPushNotification,
} from '../lib/notificationService';
import { BANKS, formatGenderLabel, LIMITS, UserProfile } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface MyInfoPageProps {
  profile: UserProfile;
  notificationPermission: BrowserNotificationPermission;
  onNotificationPermissionChange: (next: BrowserNotificationPermission) => void;
}

export const MyInfoPage: React.FC<MyInfoPageProps> = ({
  profile,
  notificationPermission,
  onNotificationPermissionChange,
}) => {
  const [pushEnabled, setPushEnabled] = useState(() => isPushEnabledPreference());
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

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const resolvedBank = bankName === '직접입력' ? customBankName : bankName;

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

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setDeleting(true);
    try {
      await deleteMyAccount(profile, deletePassword);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : '계정 탈퇴를 처리하지 못했어요.',
      });
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleRequestNotifications = async () => {
    setFeedback(null);
    const next = await requestBrowserNotificationPermission();
    onNotificationPermissionChange(next);
    if (next === 'granted') {
      setPushEnabled(true);
      setFeedback({ type: 'ok', text: '실시간 브라우저 푸시 알림이 켜졌어요.' });
    } else if (next === 'denied') {
      setFeedback({
        type: 'err',
        text: '브라우저에서 알림이 차단되어 있어요. 브라우저 사이트 설정에서 알림을 허용해 주세요.',
      });
    }
  };

  const handleTogglePush = () => {
    const next = !pushEnabled;
    setPushEnabled(next);
    setPushEnabledPreference(next);
    setFeedback({
      type: 'ok',
      text: next ? '실시간 알림을 켰어요.' : '실시간 알림을 껐어요.',
    });
  };

  const handleTestNotification = async () => {
    setFeedback(null);
    const sent = await showBrowserPushNotification({
      title: '한림 TAXI · 알림 테스트',
      body: '동승자 참여, 모집 마감, 출발 10분 전 위치 사진 알림이 정상적으로 도착해요.',
      tag: `test-${Date.now()}`,
    });
    if (sent) {
      setFeedback({ type: 'ok', text: '테스트 알림을 보냈어요.' });
    } else {
      setFeedback({
        type: 'err',
        text: '알림이 꺼져 있거나 브라우저 알림 권한이 없어요.',
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header Summary */}
      <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF4FF] text-[#1D5CE5] flex items-center justify-center shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#0D1B3E] truncate">{profile.name}</h2>
            <p className="text-xs text-[#435E8D] truncate">
              아이디 {profile.username} · {formatGenderLabel(profile.gender)} ·{' '}
              {profile.authProvider === 'google' ? '구글 로그인' : '아이디 로그인'}
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
          구글 계정으로 로그인한 회원이에요. 비밀번호는 구글 계정 설정에서 관리할 수 있어요.
        </div>
      )}

      {/* Browser Push Notification & PWA Install Settings */}
      <div className="bg-white border border-[#D4E4F7] rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0D1B3E] flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#1D5CE5]" />
              실시간 브라우저 푸시 알림
            </h3>
            <p className="text-xs text-[#435E8D] mt-1 leading-relaxed">
              동승자 참여, 모집 마감, 출발 10분 전 위치 사진 미등록 시 브라우저 알림을 받아요.
            </p>
          </div>
          <span className="text-xs font-bold text-[#1D5CE5] whitespace-nowrap shrink-0">
            {notificationPermission === 'unsupported'
              ? '지원 안 함'
              : notificationPermission === 'denied'
              ? '차단됨'
              : notificationPermission === 'default'
              ? '허용 필요'
              : pushEnabled
              ? '켜짐'
              : '꺼짐'}
          </span>
        </div>

        {notificationPermission === 'default' && (
          <button
            type="button"
            onClick={() => void handleRequestNotifications()}
            className="w-full min-h-[46px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-sm font-semibold transition-colors"
          >
            브라우저 알림 허용하기
          </button>
        )}

        {notificationPermission === 'granted' && (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleTogglePush}
              className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                pushEnabled
                  ? 'border-[#1D5CE5] bg-[#EBF4FF] text-[#1D5CE5]'
                  : 'border-[#D4E4F7] bg-[#F8FBFF] text-[#435E8D]'
              }`}
            >
              {pushEnabled ? '알림 끄기' : '알림 켜기'}
            </button>
            <button
              type="button"
              disabled={!pushEnabled}
              onClick={() => void handleTestNotification()}
              className="min-h-[44px] rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] disabled:opacity-45 text-xs font-semibold text-[#0D1B3E] transition-colors"
            >
              테스트 알림 보내기
            </button>
          </div>
        )}

        {notificationPermission === 'denied' && (
          <p className="text-xs text-[#435E8D] bg-[#F4F9FF] rounded-2xl p-3.5 leading-relaxed">
            현재 브라우저에서 알림 권한이 차단되어 있어요. 주소창 옆 사이트 설정 아이콘에서 알림을 &lsquo;허용&rsquo;으로 바꾼 뒤 새로고침해 주세요.
          </p>
        )}
      </div>

      <PWAInstallButton variant="card" />

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
          onClick={() => setShowDeleteModal(true)}
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
                disabled={deleting}
                className="min-h-[46px] rounded-xl bg-[#0D1B3E] text-white text-sm font-semibold"
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
