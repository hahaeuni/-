import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Image as ImageIcon,
  LogOut,
  Mail,
  RefreshCw,
  Shield,
  Users,
  X,
} from 'lucide-react';
import {
  approveUserAccount,
  getStudentIdPhoto,
  getStudentIdThumbnail,
  logoutUser,
  rejectUserAccount,
} from '../lib/authService';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatGenderLabel, UserProfile, UserStatus } from '../types';

interface AdminApprovalPageProps {
  onBack?: () => void;
  showLogout?: boolean;
  onSwitchToUserView?: () => void;
}

type StatusFilter = 'all' | UserStatus;

type PhotoState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; isThumbnail: boolean }
  | { status: 'empty' }
  | { status: 'error'; message: string };

type FullPhotoState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' };

function formatCreatedAt(user: UserProfile): string {
  if (!user.createdAt) return '가입일 확인 중';
  const d = user.createdAt.toDate();
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatStatusText(status: UserStatus): string {
  if (status === 'approved') return '승인 완료';
  if (status === 'rejected') return '거절됨';
  return '승인 대기';
}

function getPhotoVersionKey(user: UserProfile): string {
  return `${user.uid}:${user.hasStudentIdPhoto ? '1' : '0'}:${user.studentIdPhotoPath || ''}`;
}

export const AdminApprovalPage: React.FC<AdminApprovalPageProps> = ({
  onBack,
  showLogout,
  onSwitchToUserView,
}) => {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoState>>({});
  const [fullPhotoStates, setFullPhotoStates] = useState<Record<string, FullPhotoState>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [rejectingUid, setRejectingUid] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');

  const fetchedKeyRef = useRef<Record<string, string>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const fullInFlightRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadThumbnailForUser = useCallback(async (user: UserProfile, force = false) => {
    const versionKey = getPhotoVersionKey(user);

    if (user.status === 'approved' && !user.hasStudentIdPhoto) {
      fetchedKeyRef.current[user.uid] = versionKey;
      if (mountedRef.current) {
        setPhotoStates((prev) => {
          if (prev[user.uid]?.status === 'empty') return prev;
          return { ...prev, [user.uid]: { status: 'empty' } };
        });
      }
      return;
    }

    if (!force && fetchedKeyRef.current[user.uid] === versionKey) {
      return;
    }
    if (inFlightRef.current.has(user.uid)) {
      return;
    }

    inFlightRef.current.add(user.uid);
    fetchedKeyRef.current[user.uid] = versionKey;

    if (mountedRef.current) {
      setPhotoStates((prev) => ({ ...prev, [user.uid]: { status: 'loading' } }));
    }

    try {
      const result = await getStudentIdThumbnail(user.uid, user.studentIdPhotoPath);
      if (!mountedRef.current) return;
      if (result) {
        setPhotoStates((prev) => ({
          ...prev,
          [user.uid]: { status: 'ready', url: result.url, isThumbnail: result.isThumbnail },
        }));
      } else {
        setPhotoStates((prev) => ({ ...prev, [user.uid]: { status: 'empty' } }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof Error ? err.message : '학생증 사진을 불러오지 못했어요.';
      setError((prev) => prev || msg);
      setPhotoStates((prev) => ({
        ...prev,
        [user.uid]: { status: 'error', message: msg },
      }));
    } finally {
      inFlightRef.current.delete(user.uid);
    }
  }, []);

  const loadFullPhotoForUser = useCallback(async (user: UserProfile, force = false) => {
    if (user.status === 'approved' && !user.hasStudentIdPhoto) return;
    if (!force && fullPhotoStates[user.uid]?.status === 'ready') return;
    if (fullInFlightRef.current.has(user.uid)) return;

    fullInFlightRef.current.add(user.uid);
    setFullPhotoStates((prev) => ({ ...prev, [user.uid]: { status: 'loading' } }));

    try {
      const fullUrl = await getStudentIdPhoto(user.uid, user.studentIdPhotoPath);
      if (!mountedRef.current) return;
      if (fullUrl) {
        setFullPhotoStates((prev) => ({
          ...prev,
          [user.uid]: { status: 'ready', url: fullUrl },
        }));
      } else {
        setFullPhotoStates((prev) => ({ ...prev, [user.uid]: { status: 'error' } }));
      }
    } catch {
      if (!mountedRef.current) return;
      setFullPhotoStates((prev) => ({ ...prev, [user.uid]: { status: 'error' } }));
    } finally {
      fullInFlightRef.current.delete(user.uid);
    }
  }, [fullPhotoStates]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserProfile);
        list.sort((a, b) => {
          const at = a.createdAt?.toMillis() ?? 0;
          const bt = b.createdAt?.toMillis() ?? 0;
          return bt - at;
        });
        setAllUsers(list);
        setLoadingList(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
    );
    return () => unsub();
  }, []);

  // Load lightweight thumbnails for dashboard cards (pending users first, max 4 concurrent)
  useEffect(() => {
    if (allUsers.length === 0) return;

    const pendingQueue = allUsers.filter((u) => u.status === 'pending');
    const otherQueue = allUsers.filter((u) => u.status !== 'pending');
    const ordered = [...pendingQueue, ...otherQueue];

    const toFetch = ordered.filter((u) => {
      const key = getPhotoVersionKey(u);
      return fetchedKeyRef.current[u.uid] !== key && !inFlightRef.current.has(u.uid);
    });

    if (toFetch.length === 0) return;

    let cancelled = false;
    let cursor = 0;
    const CONCURRENCY = 4;

    const worker = async () => {
      while (!cancelled) {
        const idx = cursor++;
        if (idx >= toFetch.length) break;
        await loadThumbnailForUser(toFetch[idx]);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, () =>
      worker()
    );
    void Promise.all(workers);

    return () => {
      cancelled = true;
    };
  }, [allUsers, loadThumbnailForUser]);

  const counts = useMemo(() => {
    return {
      all: allUsers.length,
      pending: allUsers.filter((u) => u.status === 'pending').length,
      approved: allUsers.filter((u) => u.status === 'approved').length,
      rejected: allUsers.filter((u) => u.status === 'rejected').length,
    };
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    if (statusFilter === 'all') return allUsers;
    return allUsers.filter((u) => u.status === statusFilter);
  }, [allUsers, statusFilter]);

  const handleOpenUserDetail = (user: UserProfile) => {
    setSelectedUser(user);
    const current = photoStates[user.uid];
    if (!current || current.status === 'error') {
      void loadThumbnailForUser(user, true);
    }
    if (!current || current.status !== 'ready' || current.isThumbnail) {
      void loadFullPhotoForUser(user);
    }
  };

  const handleRetryPhoto = (e: React.MouseEvent, user: UserProfile, includeFull = false) => {
    e.stopPropagation();
    setError('');
    void loadThumbnailForUser(user, true);
    if (includeFull) {
      void loadFullPhotoForUser(user, true);
    }
  };

  const handleImageElementError = (uid: string) => {
    setPhotoStates((prev) => ({
      ...prev,
      [uid]: {
        status: 'error',
        message: '이미지를 표시하지 못했어요. 다시 불러오기를 눌러 주세요.',
      },
    }));
  };

  const handleApprove = async (user: UserProfile) => {
    setError('');
    setBusyUid(user.uid);
    try {
      await approveUserAccount(user.uid, user.studentIdPhotoPath);
      fetchedKeyRef.current[user.uid] = `${user.uid}:0:`;
      setPhotoStates((prev) => ({ ...prev, [user.uid]: { status: 'empty' } }));
      setFullPhotoStates((prev) => {
        const next = { ...prev };
        delete next[user.uid];
        return next;
      });
      if (selectedUser?.uid === user.uid) {
        setSelectedUser((prev) =>
          prev
            ? { ...prev, status: 'approved', hasStudentIdPhoto: false, studentIdPhotoPath: '' }
            : null
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '승인 처리에 실패했어요.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleRejectSubmit = async (uid: string) => {
    setError('');
    setBusyUid(uid);
    try {
      await rejectUserAccount(uid, rejectReason);
      setRejectingUid(null);
      setRejectReason('');
      if (selectedUser?.uid === uid) {
        setSelectedUser((prev) => (prev ? { ...prev, status: 'rejected' } : null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '거절 처리에 실패했어요.');
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Clear Admin Banner */}
      <div className="bg-[#0D1B3E] text-white rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="뒤로 가기"
              className="min-w-[44px] min-h-[44px] rounded-xl bg-[#162D66] text-white flex items-center justify-center hover:bg-[#1D5CE5] transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7DD3FC]">
              <Shield className="w-4 h-4" />
              <span>관리자(Admin) 전용 대시보드</span>
            </div>
            <h1 className="text-xl font-bold mt-1">전체 회원 및 학생증 관리</h1>
            <p className="text-xs text-[#BFDBFE] mt-1 tabular-nums">
              전체 {counts.all}명 · 승인 대기 {counts.pending}명 · 승인 완료 {counts.approved}명
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onSwitchToUserView && (
            <button
              type="button"
              onClick={onSwitchToUserView}
              className="min-h-[42px] px-3.5 rounded-xl bg-[#162D66] hover:bg-[#1D5CE5] text-xs font-semibold text-white transition-colors"
            >
              서비스 화면
            </button>
          )}
          {showLogout && (
            <button
              type="button"
              onClick={() => void logoutUser()}
              className="min-h-[42px] px-3.5 rounded-xl bg-white text-[#0D1B3E] hover:bg-[#EBF4FF] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              로그아웃
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-[#EBF4FF] rounded-2xl overflow-x-auto">
        {(
          [
            { key: 'all', label: `전체 회원 (${counts.all})` },
            { key: 'pending', label: `승인 대기 (${counts.pending})` },
            { key: 'approved', label: `승인 완료 (${counts.approved})` },
            { key: 'rejected', label: `거절됨 (${counts.rejected})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 tabular-nums transition-colors ${
              statusFilter === tab.key
                ? 'bg-white text-[#0D1B3E] shadow-sm'
                : 'text-[#435E8D] hover:text-[#0D1B3E]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-[#0D1B3E] text-white text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#7DD3FC]" />
          <span>{error}</span>
        </div>
      )}

      {loadingList ? (
        <div className="bg-white border border-[#D4E4F7] rounded-2xl p-8 text-center text-sm text-[#435E8D]">
          회원 목록을 불러오는 중이에요...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white border border-[#D4E4F7] rounded-2xl p-10 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF4FF] text-[#1D5CE5] flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <p className="text-base font-semibold text-[#0D1B3E]">해당하는 회원이 없어요</p>
          <p className="text-xs text-[#435E8D]">새 회원이 가입하면 이곳에서 확인할 수 있어요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((applicant) => {
            const photoState = photoStates[applicant.uid];
            const isBusy = busyUid === applicant.uid;

            return (
              <div
                key={applicant.uid}
                className="bg-white border border-[#D4E4F7] hover:border-[#60A5FA] rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors"
              >
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleOpenUserDetail(applicant)}
                    className="text-left space-y-3 w-full"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-[#0D1B3E] truncate">
                          {applicant.name}
                        </h3>
                        <p className="text-xs text-[#435E8D] mt-0.5 truncate">
                          아이디 {applicant.username} · {formatGenderLabel(applicant.gender)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold shrink-0 ${
                          applicant.status === 'approved'
                            ? 'text-[#1D5CE5]'
                            : applicant.status === 'pending'
                            ? 'text-[#0284C7]'
                            : 'text-[#0D1B3E]'
                        }`}
                      >
                        {formatStatusText(applicant.status)}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-[#435E8D] bg-[#F4F9FF] rounded-xl p-3">
                      <p className="flex items-center gap-1.5 truncate text-[#0D1B3E] font-medium">
                        <Mail className="w-3.5 h-3.5 text-[#1D5CE5] shrink-0" />
                        <span className="truncate">{applicant.email}</span>
                      </p>
                      <p className="flex items-center gap-1.5 tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-[#1D5CE5] shrink-0" />
                        <span>{formatCreatedAt(applicant)}</span>
                      </p>
                    </div>
                  </button>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenUserDetail(applicant)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenUserDetail(applicant);
                      }
                    }}
                    className="rounded-2xl overflow-hidden border border-[#DCE9F8] bg-[#F4F9FF] h-40 flex items-center justify-center cursor-pointer"
                  >
                    {!photoState || photoState.status === 'loading' ? (
                      <span className="text-xs text-[#435E8D]">썸네일 불러오는 중...</span>
                    ) : photoState.status === 'ready' ? (
                      <img
                        src={photoState.url}
                        alt={`${applicant.name} 학생증 썸네일`}
                        loading="lazy"
                        decoding="async"
                        onError={() => handleImageElementError(applicant.uid)}
                        className="w-full h-full object-contain bg-white"
                      />
                    ) : photoState.status === 'error' ? (
                      <div className="text-center px-3 space-y-2">
                        <p className="text-[11px] font-medium text-[#0D1B3E] line-clamp-2">
                          사진을 불러오지 못했어요
                        </p>
                        <button
                          type="button"
                          onClick={(e) => handleRetryPhoto(e, applicant)}
                          className="min-h-[32px] px-3 rounded-lg bg-[#1D5CE5] text-white text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          다시 불러오기
                        </button>
                      </div>
                    ) : (
                      <div className="text-center px-3 space-y-1.5">
                        <ImageIcon className="w-5 h-5 text-[#7B95BE] mx-auto" />
                        <p className="text-[11px] text-[#435E8D]">
                          {applicant.status === 'approved'
                            ? '승인 완료 후 삭제됨'
                            : '저장된 학생증 사진 없음'}
                        </p>
                        {applicant.status !== 'approved' && (
                          <button
                            type="button"
                            onClick={(e) => handleRetryPhoto(e, applicant)}
                            className="text-[11px] font-semibold text-[#1D5CE5] hover:underline inline-flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            다시 확인
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenUserDetail(applicant)}
                    className="text-[11px] font-semibold text-[#1D5CE5] text-left"
                  >
                    눌러서 회원 상세 정보 및 고해상도 학생증 보기
                  </button>
                </div>

                {applicant.status === 'pending' && (
                  rejectingUid === applicant.uid ? (
                    <div className="space-y-2.5 pt-2 border-t border-[#E6F0FC]">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="거절 사유 입력 (선택)"
                        className="w-full min-h-[42px] px-3 rounded-xl border border-[#D4E4F7] bg-[#F8FBFF] text-xs text-[#0D1B3E]"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setRejectingUid(null);
                            setRejectReason('');
                          }}
                          className="min-h-[44px] rounded-xl border border-[#D4E4F7] text-xs font-semibold text-[#435E8D]"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRejectSubmit(applicant.uid)}
                          className="min-h-[44px] rounded-xl bg-[#0D1B3E] text-white text-xs font-semibold"
                        >
                          거절 확정
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-[#EFF6FF]">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setRejectingUid(applicant.uid)}
                        className="min-h-[44px] rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] text-[#0D1B3E] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        거절
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleApprove(applicant)}
                        className="min-h-[44px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        {isBusy ? '처리 중...' : '승인'}
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Selected User Detail & High-Res Image Modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 bg-[#0D1B3E]/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-3xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#1D5CE5]">
                  관리자(Admin) 회원 상세 · {formatStatusText(selectedUser.status)}
                </p>
                <h3 className="text-lg font-bold text-[#0D1B3E] mt-0.5">{selectedUser.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                aria-label="닫기"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[#0D1B3E] hover:bg-[#EBF4FF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-[#F4F9FF] border border-[#DCE9F8] rounded-2xl p-4">
              <div>
                <span className="text-[#435E8D]">이메일</span>
                <p className="font-semibold text-[#0D1B3E] mt-0.5 break-all">{selectedUser.email}</p>
              </div>
              <div>
                <span className="text-[#435E8D]">계정 생성일</span>
                <p className="font-semibold text-[#0D1B3E] mt-0.5 tabular-nums">
                  {formatCreatedAt(selectedUser)}
                </p>
              </div>
              <div>
                <span className="text-[#435E8D]">아이디 · 성별</span>
                <p className="font-semibold text-[#0D1B3E] mt-0.5">
                  {selectedUser.username} · {formatGenderLabel(selectedUser.gender)}
                </p>
              </div>
              <div>
                <span className="text-[#435E8D]">전화번호</span>
                <p className="font-semibold text-[#0D1B3E] mt-0.5 tabular-nums">{selectedUser.phone}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[#435E8D]">정산 계좌</span>
                <p className="font-semibold text-[#0D1B3E] mt-0.5 tabular-nums">
                  {selectedUser.bankName} {selectedUser.accountNumber} ({selectedUser.accountHolder})
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-[#0D1B3E]">학생증 이미지</p>
                  {fullPhotoStates[selectedUser.uid]?.status === 'loading' &&
                    photoStates[selectedUser.uid]?.status === 'ready' && (
                      <span className="text-[11px] font-medium text-[#0284C7]">
                        원본 화질 불러오는 중...
                      </span>
                    )}
                </div>
                {selectedUser.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={(e) => handleRetryPhoto(e, selectedUser, true)}
                    className="text-xs font-semibold text-[#1D5CE5] hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    새로고침
                  </button>
                )}
              </div>
              <div className="rounded-2xl overflow-hidden border border-[#DCE9F8] bg-[#F4F9FF] min-h-[200px] flex items-center justify-center">
                {(() => {
                  const thumbPhoto = photoStates[selectedUser.uid];
                  const fullPhoto = fullPhotoStates[selectedUser.uid];
                  const displayUrl =
                    fullPhoto?.status === 'ready'
                      ? fullPhoto.url
                      : thumbPhoto?.status === 'ready'
                      ? thumbPhoto.url
                      : null;

                  if (displayUrl) {
                    return (
                      <img
                        src={displayUrl}
                        alt={`${selectedUser.name} 학생증 이미지`}
                        decoding="async"
                        onError={() => {
                          if (fullPhoto?.status === 'ready' && displayUrl === fullPhoto.url) {
                            setFullPhotoStates((prev) => ({
                              ...prev,
                              [selectedUser.uid]: { status: 'error' },
                            }));
                          } else {
                            handleImageElementError(selectedUser.uid);
                          }
                        }}
                        className="w-full max-h-[55vh] object-contain bg-white"
                      />
                    );
                  }

                  if (
                    (!thumbPhoto || thumbPhoto.status === 'loading') ||
                    fullPhoto?.status === 'loading'
                  ) {
                    return (
                      <span className="text-xs text-[#435E8D]">학생증 이미지 불러오는 중...</span>
                    );
                  }

                  if (thumbPhoto?.status === 'error') {
                    return (
                      <div className="p-6 text-center space-y-2.5">
                        <AlertCircle className="w-7 h-7 text-[#1D5CE5] mx-auto" />
                        <p className="text-xs font-medium text-[#0D1B3E]">{thumbPhoto.message}</p>
                        <button
                          type="button"
                          onClick={(e) => handleRetryPhoto(e, selectedUser, true)}
                          className="min-h-[38px] px-4 rounded-xl bg-[#1D5CE5] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          다시 불러오기
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="p-6 text-center space-y-2">
                      <ImageIcon className="w-7 h-7 text-[#7B95BE] mx-auto" />
                      <p className="text-xs font-medium text-[#435E8D]">
                        {selectedUser.status === 'approved'
                          ? '승인이 완료되어 학생증 사진이 삭제되었어요.'
                          : 'Storage에 저장된 학생증 사진이 없어요.'}
                      </p>
                      {selectedUser.status !== 'approved' && (
                        <>
                          <p className="text-[11px] text-[#5B759E] leading-relaxed">
                            Storage 규칙 설정 전에 가입했거나 파일이 삭제된 경우일 수 있어요. &apos;거절&apos;을 누르면 회원이 새 학생증 사진을 다시 올릴 수 있어요.
                          </p>
                          <button
                            type="button"
                            onClick={(e) => handleRetryPhoto(e, selectedUser, true)}
                            className="min-h-[36px] px-3.5 rounded-xl border border-[#C6DCF7] bg-white text-[#1D5CE5] text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            다시 확인
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {selectedUser.status === 'pending' && (
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={busyUid === selectedUser.uid}
                  onClick={() => {
                    setRejectingUid(selectedUser.uid);
                    setSelectedUser(null);
                  }}
                  className="min-h-[46px] rounded-xl border border-[#C6DCF7] bg-white hover:bg-[#F4F9FF] text-[#0D1B3E] text-sm font-semibold"
                >
                  거절
                </button>
                <button
                  type="button"
                  disabled={busyUid === selectedUser.uid}
                  onClick={() => void handleApprove(selectedUser)}
                  className="min-h-[46px] rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-sm font-semibold"
                >
                  {busyUid === selectedUser.uid ? '처리 중...' : '승인'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
