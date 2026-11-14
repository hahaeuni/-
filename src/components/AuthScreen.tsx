import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import {
  completeGoogleProfile,
  loginWithGoogle,
  loginWithUsername,
  logoutUser,
  signUpWithUsername,
} from '../lib/authService';
import { compressFileToBlob } from '../lib/imageUtils';
import { BANKS, Gender, LIMITS } from '../types';

interface AuthScreenProps {
  googlePendingUser: {
    uid: string;
    email: string | null;
    displayName: string | null;
  } | null;
  isAdminEmail?: boolean;
  onOpenAdminPage?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  googlePendingUser,
  isAdminEmail,
  onOpenAdminPage,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(googlePendingUser ? 'signup' : 'login');

  // Login state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Signup / Google completion state
  const [name, setName] = useState(googlePendingUser?.displayName || '');
  const [username, setUsername] = useState(
    googlePendingUser ? `hallym_${googlePendingUser.uid.slice(0, 6)}` : ''
  );
  const [password, setPassword] = useState('');
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [bankName, setBankName] = useState<string>(BANKS[0]);
  const [customBankName, setCustomBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [studentIdBlob, setStudentIdBlob] = useState<Blob | null>(null);
  const [studentIdPreviewUrl, setStudentIdPreviewUrl] = useState('');
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isGoogleCompletion = Boolean(googlePendingUser);
  const resolvedBankName = bankName === '직접입력' ? customBankName : bankName;

  useEffect(() => {
    if (googlePendingUser) {
      setMode('signup');
      if (googlePendingUser.displayName && !name) {
        setName(googlePendingUser.displayName);
      }
      setUsername(`hallym_${googlePendingUser.uid.slice(0, 6)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googlePendingUser?.uid]);

  useEffect(() => {
    return () => {
      if (studentIdPreviewUrl) {
        URL.revokeObjectURL(studentIdPreviewUrl);
      }
    };
  }, [studentIdPreviewUrl]);

  const handleStudentIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setError(err instanceof Error ? err.message : '학생증 사진을 처리하지 못했어요.');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithUsername(loginUsername, loginPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : '구글 로그인에 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!agreedToPrivacy) {
      setError('개인정보 수집·이용 동의가 필요해요.');
      return;
    }
    if (!studentIdBlob) {
      setError('학생증 사진을 올려 주세요.');
      return;
    }
    setLoading(true);
    try {
      if (isGoogleCompletion) {
        await completeGoogleProfile({
          name,
          username,
          phone,
          gender,
          bankName: resolvedBankName,
          accountNumber,
          accountHolder,
          studentIdPhotoBlob: studentIdBlob,
          agreedToPrivacy,
        });
      } else {
        await signUpWithUsername({
          name,
          username,
          password,
          phone,
          gender,
          bankName: resolvedBankName,
          accountNumber,
          accountHolder,
          studentIdPhotoBlob: studentIdBlob,
          agreedToPrivacy,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원 가입 중 오류가 발생했어요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F9FF] flex flex-col justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md mx-auto">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#1D5CE5] text-white font-bold text-xl mb-3 shadow-sm">
            한림
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0D1B3E]">한림택시</h1>
          <p className="mt-1.5 text-sm text-[#435E8D]">
            한림대학교 학생들을 위한 춘천 택시 동승 서비스
          </p>
        </div>

        {/* Admin Quick Entry for Bootstrapped Admin */}
        {isAdminEmail && onOpenAdminPage && (
          <div className="mb-4 bg-white border border-[#BFDBFE] rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#0D1B3E]">관리자 계정으로 로그인됨</p>
              <p className="text-xs text-[#435E8D] mt-0.5">
                승인 대기 중인 학생 목록을 바로 관리할 수 있어요.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAdminPage}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0D1B3E] text-white text-xs font-semibold whitespace-nowrap shrink-0 hover:bg-[#162D66] transition-colors"
            >
              관리자 승인
            </button>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-white border border-[#D4E4F7] rounded-3xl p-6 shadow-sm">
          {!isGoogleCompletion && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#EBF4FF] rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-[#0D1B3E] shadow-sm'
                    : 'text-[#435E8D] hover:text-[#0D1B3E]'
                }`}
              >
                로그인
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError('');
                }}
                className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                  mode === 'signup'
                    ? 'bg-white text-[#0D1B3E] shadow-sm'
                    : 'text-[#435E8D] hover:text-[#0D1B3E]'
                }`}
              >
                회원 가입
              </button>
            </div>
          )}

          {isGoogleCompletion && (
            <div className="mb-5 pb-4 border-b border-[#E2ECF9]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-[#0D1B3E]">추가 정보 입력</h2>
                  <p className="text-xs text-[#435E8D] mt-0.5">
                    {googlePendingUser?.email} · 학생 확인 후 승인되면 이용할 수 있어요
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void logoutUser()}
                  className="px-3 min-h-[40px] rounded-xl border border-[#D4E4F7] text-xs font-medium text-[#435E8D] hover:text-[#0D1B3E] whitespace-nowrap shrink-0"
                >
                  다른 계정
                </button>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#0D1B3E] text-white text-xs leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#7DD3FC]" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' && !isGoogleCompletion ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-username" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                  아이디
                </label>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="아이디 또는 이메일 입력"
                  className="w-full min-h-[46px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E] placeholder:text-[#7B95BE] focus:bg-white"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showLoginPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    className="w-full min-h-[46px] pl-3.5 pr-11 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E] placeholder:text-[#7B95BE] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPw((v) => !v)}
                    aria-label={showLoginPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[#435E8D]"
                  >
                    {showLoginPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
              >
                {loading ? '로그인 중...' : '로그인'}
              </button>

              <div className="relative my-5 flex items-center">
                <div className="flex-grow border-t border-[#E2ECF9]" />
                <span className="px-3 text-xs text-[#5B759E]">또는</span>
                <div className="flex-grow border-t border-[#E2ECF9]" />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleLogin}
                className="w-full min-h-[48px] px-4 rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] text-[#0D1B3E] text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors"
              >
                <span className="w-5 h-5 rounded-full bg-[#EBF4FF] text-[#1D5CE5] flex items-center justify-center text-xs font-bold">
                  G
                </span>
                구글 계정으로 로그인
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                    이름
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    required
                    maxLength={LIMITS.NAME_MAX}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="실명 입력"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
                  />
                </div>

                <div>
                  <label htmlFor="signup-username" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                    아이디
                  </label>
                  <input
                    id="signup-username"
                    type="text"
                    required
                    maxLength={LIMITS.USERNAME_MAX}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="영문/숫자 3자 이상"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
                  />
                </div>
              </div>

              {!isGoogleCompletion && (
                <div>
                  <label htmlFor="signup-password" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                    비밀번호
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showSignupPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="6자 이상 입력"
                      className="w-full min-h-[44px] pl-3.5 pr-11 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPw((v) => !v)}
                      aria-label={showSignupPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[#435E8D]"
                    >
                      {showSignupPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="signup-phone" className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">
                    전화번호
                  </label>
                  <input
                    id="signup-phone"
                    type="tel"
                    required
                    maxLength={LIMITS.PHONE_MAX}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E] tabular-nums"
                  />
                </div>

                <div>
                  <span className="block text-xs font-semibold text-[#0D1B3E] mb-1.5">성별</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGender('male')}
                      className={`min-h-[44px] rounded-xl text-sm font-semibold border transition-colors ${
                        gender === 'male'
                          ? 'bg-[#1D5CE5] border-[#1D5CE5] text-white'
                          : 'bg-[#F8FBFF] border-[#D4E4F7] text-[#435E8D]'
                      }`}
                    >
                      남자
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('female')}
                      className={`min-h-[44px] rounded-xl text-sm font-semibold border transition-colors ${
                        gender === 'female'
                          ? 'bg-[#1D5CE5] border-[#1D5CE5] text-white'
                          : 'bg-[#F8FBFF] border-[#D4E4F7] text-[#435E8D]'
                      }`}
                    >
                      여자
                    </button>
                  </div>
                </div>
              </div>

              {/* Settlement Bank Info */}
              <div className="pt-2 border-t border-[#E6F0FC]">
                <p className="text-xs font-semibold text-[#0D1B3E] mb-2">정산받을 계좌 정보</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="signup-bank" className="block text-xs text-[#435E8D] mb-1">
                      은행
                    </label>
                    <select
                      id="signup-bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
                    >
                      {BANKS.map((bank) => (
                        <option key={bank} value={bank}>
                          {bank}
                        </option>
                      ))}
                      <option value="직접입력">직접 입력</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="signup-holder" className="block text-xs text-[#435E8D] mb-1">
                      예금주명
                    </label>
                    <input
                      id="signup-holder"
                      type="text"
                      required
                      maxLength={LIMITS.HOLDER_MAX}
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      placeholder="예금주 실명"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
                    />
                  </div>
                </div>

                {bankName === '직접입력' && (
                  <div className="mt-2.5">
                    <input
                      type="text"
                      required
                      maxLength={LIMITS.BANK_MAX}
                      value={customBankName}
                      onChange={(e) => setCustomBankName(e.target.value)}
                      placeholder="은행 이름 직접 입력"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E]"
                    />
                  </div>
                )}

                <div className="mt-2.5">
                  <label htmlFor="signup-account" className="block text-xs text-[#435E8D] mb-1">
                    계좌번호
                  </label>
                  <input
                    id="signup-account"
                    type="text"
                    required
                    maxLength={LIMITS.ACCOUNT_MAX}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="숫자 또는 하이픈(-) 포함 입력"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-sm text-[#0D1B3E] tabular-nums"
                  />
                </div>
              </div>

              {/* Student ID Upload (Firebase Storage) */}
              <div className="pt-2 border-t border-[#E6F0FC]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-[#0D1B3E]">학생증 사진 올리기</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#0284C7] font-medium">
                    <Lock className="w-3 h-3" />
                    비공개 저장 · 승인 후 삭제
                  </span>
                </div>

                <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-dashed border-[#93C5FD] bg-[#F4F9FF] hover:bg-[#EBF4FF] cursor-pointer transition-colors">
                  {studentIdPreviewUrl ? (
                    <div className="w-full">
                      <img
                        src={studentIdPreviewUrl}
                        alt="업로드한 학생증 미리보기"
                        className="w-full max-h-44 object-contain rounded-xl bg-white"
                      />
                      <p className="mt-2 text-center text-xs font-medium text-[#1D5CE5]">
                        다른 사진으로 바꾸려면 누르세요
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-[#E0F2FE] text-[#0284C7] flex items-center justify-center">
                        <Camera className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-semibold text-[#0D1B3E]">
                        학생증 사진 선택 또는 촬영하기
                      </span>
                      <span className="text-[11px] text-[#435E8D] text-center">
                        한림대학교 모바일 학생증 캡처 또는 실물 학생증 사진
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleStudentIdUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Privacy Consent */}
              <div className="rounded-2xl bg-[#F4F9FF] border border-[#DCE9F8] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-start gap-2.5 cursor-pointer min-h-[44px] py-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={agreedToPrivacy}
                      onClick={() => setAgreedToPrivacy((v) => !v)}
                      className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        agreedToPrivacy
                          ? 'bg-[#1D5CE5] border-[#1D5CE5] text-white'
                          : 'bg-white border-[#93C5FD]'
                      }`}
                    >
                      {agreedToPrivacy && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-xs font-medium text-[#0D1B3E] leading-snug">
                      [필수] 개인정보 수집·이용에 동의해요
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPrivacyDetails((v) => !v)}
                    className="min-h-[36px] px-2 text-xs text-[#435E8D] hover:text-[#0D1B3E] inline-flex items-center gap-1 shrink-0"
                  >
                    내용
                    {showPrivacyDetails ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {showPrivacyDetails && (
                  <div className="mt-2 pt-2 border-t border-[#DCE9F8] text-[11px] text-[#435E8D] space-y-1 leading-relaxed">
                    <p>· 수집 항목: 이름, 아이디, 전화번호, 성별, 은행·계좌번호·예금주명, 학생증 사진</p>
                    <p>· 이용 목적: 한림대 재학생 확인, 동승자 성별 매칭, 도착 후 택시비 정산 안내</p>
                    <p>· 보관 및 파기: 학생증 사진은 비공개 스토리지에 저장되어 본인과 관리자만 열람하며 승인 완료 즉시 삭제됩니다. 계정 탈퇴 시 모든 개인정보를 지체 없이 파기합니다.</p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {loading
                  ? '가입 처리 중...'
                  : isGoogleCompletion
                  ? '가입 신청 완료하기'
                  : '회원 가입'}
              </button>

              {!isGoogleCompletion && (
                <>
                  <div className="relative my-3 flex items-center">
                    <div className="flex-grow border-t border-[#E2ECF9]" />
                    <span className="px-3 text-xs text-[#5B759E]">또는</span>
                    <div className="flex-grow border-t border-[#E2ECF9]" />
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGoogleLogin}
                    className="w-full min-h-[46px] px-4 rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] text-[#0D1B3E] text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#1D5CE5]" />
                    구글 계정으로 가입하기
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
