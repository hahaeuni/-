import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Image as ImageIcon,
  LogOut,
  Mail,
  Shield,
  Users,
  X,
} from 'lucide-react';
import {
  approveUserAccount,
  getStudentIdPhoto,
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

export const AdminApprovalPage: React.FC<AdminApprovalPageProps> = ({
  onBack,
  showLogout,
  onSwitchToUserView,
}) => {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [rejectingUid, setRejectingUid] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');

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

        list.forEach((u) => {
          if (photos[u.uid] === undefined && u.hasStudentIdPhoto) {
            void getStudentIdPhoto(u.uid)
              .then((img) => {
                setPhotos((prev) => ({ ...prev, [u.uid]: img }));
              })
              .catch((err) => {
                setError((prev) =>
                  prev || (err instanceof Error ? err.message : '학생증 사진을 불러오지 못했어요.')
                );
                setPhotos((prev) => ({ ...prev, [u.uid]: null }));
              });
          } else if (photos[u.uid] === undefined && !u.hasStudentIdPhoto) {
            setPhotos((prev) => ({ ...prev, [u.uid]: null }));
          }
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (photos[user.uid] === undefined) {
      void getStudentIdPhoto(user.uid)
        .then((img) => {
          setPhotos((prev) => ({ ...prev, [user.uid]: img }));
        })
        .catch(() => {
          setPhotos((prev) => ({ ...prev, [user.uid]: null }));
        });
    }
  };

  const handleApprove = async (uid: string) => {
    setError('');
    setBusyUid(uid);
    try {
      await approveUserAccount(uid);
      setPhotos((prev) => ({ ...prev, [uid]: null }));
      if (selectedUser?.uid === uid) {
        setSelectedUser((prev) => (prev ? { ...prev, status: 'approved', hasStudentIdPhoto: false } : null));
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
            const photo = photos[applicant.uid];
            const isBusy = busyUid === applicant.uid;

            return (
              <div
                key={applicant.uid}
                className="bg-white border border-[#D4E4F7] hover:border-[#60A5FA] rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors"
              >
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

                  <div className="rounded-2xl overflow-hidden border border-[#DCE9F8] bg-[#F4F9FF] h-40 flex items-center justify-center">
                    {photo === undefined ? (
                      <span className="text-xs text-[#435E8D]">학생증 사진 불러오는 중...</span>
                    ) : photo ? (
                      <img
                        src={photo}
                        alt={`${applicant.name} 학생증`}
                        className="w-full h-full object-contain bg-white"
                      />
                    ) : (
                      <div className="text-center px-3 space-y-1">
                        <ImageIcon className="w-5 h-5 text-[#7B95BE] mx-auto" />
                        <p className="text-[11px] text-[#435E8D]">
                          {applicant.status === 'approved'
                            ? '승인 완료 후 삭제됨'
                            : '학생증 사진 없음'}
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] font-semibold text-[#1D5CE5]">
                    눌러서 회원 상세 정보 및 학생증 크게 보기
                  </p>
                </button>

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
                        onClick={() => void handleApprove(applicant.uid)}
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

      {/* Selected User Detail & Image Modal */}
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
              <p className="text-xs font-bold text-[#0D1B3E]">학생증 이미지</p>
              <div className="rounded-2xl overflow-hidden border border-[#DCE9F8] bg-[#F4F9FF] min-h-[200px] flex items-center justify-center">
                {photos[selectedUser.uid] === undefined ? (
                  <span className="text-xs text-[#435E8D]">학생증 이미지 불러오는 중...</span>
                ) : photos[selectedUser.uid] ? (
                  <img
                    src={photos[selectedUser.uid] || ''}
                    alt={`${selectedUser.name} 학생증 이미지`}
                    className="w-full max-h-[55vh] object-contain bg-white"
                  />
                ) : (
                  <div className="p-6 text-center space-y-1">
                    <ImageIcon className="w-7 h-7 text-[#7B95BE] mx-auto" />
                    <p className="text-xs font-medium text-[#435E8D]">
                      {selectedUser.status === 'approved'
                        ? '승인이 완료되어 학생증 사진이 삭제되었어요.'
                        : '업로드된 학생증 사진이 없어요.'}
                    </p>
                  </div>
                )}
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
                  onClick={() => void handleApprove(selectedUser.uid)}
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
