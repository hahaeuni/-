import React, { Component, ErrorInfo, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Bell, History, Home, Plus, Shield, User as UserIcon, X } from 'lucide-react';
import { AdminApprovalPage } from './components/AdminApprovalPage';
import { AuthScreen } from './components/AuthScreen';
import { CreateRoomWizard } from './components/CreateRoomWizard';
import { HomeRoomList } from './components/HomeRoomList';
import { MyInfoPage } from './components/MyInfoPage';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { RideHistoryPage } from './components/RideHistoryPage';
import { RoomDetailView } from './components/RoomDetailView';
import { InAppNotificationToast, useRoomNotifications } from './hooks/useRoomNotifications';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  BrowserNotificationPermission,
  dismissPushPrompt,
  getNotificationPermission,
  isPushPromptDismissed,
  requestBrowserNotificationPermission,
} from './lib/notificationService';
import { expireRoomIfNeeded } from './lib/roomService';
import { ADMIN_EMAIL, ADMIN_UID, TaxiRoom, UserProfile } from './types';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F9FF] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-[#D4E4F7] rounded-3xl p-6 text-center space-y-4">
            <h1 className="text-lg font-bold text-[#0D1B3E]">문제가 발생했어요</h1>
            <p className="text-xs text-[#435E8D] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 rounded-xl bg-[#1D5CE5] text-white text-sm font-semibold"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type AppTab = 'home' | 'create' | 'history' | 'myinfo' | 'admin';

function MainApp() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasAdminDoc, setHasAdminDoc] = useState(false);

  const [tab, setTab] = useState<AppTab>('home');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomReturnTab, setRoomReturnTab] = useState<'home' | 'history'>('home');
  const [adminBypassOpen, setAdminBypassOpen] = useState(false);
  const [adminPreferUserView, setAdminPreferUserView] = useState(false);

  const [openRooms, setOpenRooms] = useState<TaxiRoom[]>([]);
  const [myRooms, setMyRooms] = useState<TaxiRoom[]>([]);
  const [myRoomsLoaded, setMyRoomsLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>(() => getNotificationPermission());
  const [pushPromptHidden, setPushPromptHidden] = useState(() => isPushPromptDismissed());
  const [activeToast, setActiveToast] = useState<InAppNotificationToast | null>(null);

  // Live clock tick every 5 seconds for countdowns & auto-expiry
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Read initial ?room=... query param if launched from a browser push notification
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setSelectedRoomId(roomParam);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setProfileLoaded(false);
        setHasAdminDoc(false);
        setAdminBypassOpen(false);
        setAdminPreferUserView(false);
        setOpenRooms([]);
        setMyRooms([]);
        setMyRoomsLoaded(false);
        setSelectedRoomId(null);
        setTab('home');
      } else if (user.uid === ADMIN_UID) {
        setTab('admin');
      }
    });
    return () => unsub();
  }, []);

  // User profile & admin record listeners
  useEffect(() => {
    if (!firebaseUser) return;
    setProfileLoaded(false);

    const userPath = `users/${firebaseUser.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setProfileLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, userPath);
      }
    );

    const unsubAdmin = onSnapshot(
      doc(db, 'admins', firebaseUser.uid),
      (snap) => {
        setHasAdminDoc(snap.exists());
      },
      () => {
        setHasAdminDoc(false);
      }
    );

    return () => {
      unsubProfile();
      unsubAdmin();
    };
  }, [firebaseUser]);

  const isPrimaryAdminUid = Boolean(firebaseUser && firebaseUser.uid === ADMIN_UID);
  const isAdmin = Boolean(
    firebaseUser &&
      (isPrimaryAdminUid ||
        (firebaseUser.email === ADMIN_EMAIL && firebaseUser.emailVerified) ||
        hasAdminDoc)
  );

  // Room listeners (only attached when user is approved)
  useEffect(() => {
    if (!firebaseUser || profile?.status !== 'approved') {
      setOpenRooms([]);
      setMyRooms([]);
      setMyRoomsLoaded(false);
      return;
    }

    setMyRoomsLoaded(false);
    const openQuery = query(collection(db, 'rooms'), where('status', '==', 'open'));
    const unsubOpen = onSnapshot(
      openQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TaxiRoom);
        list.sort((a, b) => (a.departureAt?.toMillis() ?? 0) - (b.departureAt?.toMillis() ?? 0));
        setOpenRooms(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'rooms');
      }
    );

    const myQuery = query(
      collection(db, 'rooms'),
      where('participantIds', 'array-contains', firebaseUser.uid)
    );
    const unsubMy = onSnapshot(
      myQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TaxiRoom);
        list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setMyRooms(list);
        setMyRoomsLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'rooms');
      }
    );

    return () => {
      unsubOpen();
      unsubMy();
    };
  }, [firebaseUser, profile?.status]);

  const handleOpenRoomFromNotification = useCallback((roomId: string) => {
    setRoomReturnTab('home');
    setSelectedRoomId(roomId);
    setTab('home');
    setActiveToast(null);
  }, []);

  const handleInAppToast = useCallback((toast: InAppNotificationToast) => {
    setActiveToast(toast);
  }, []);

  useEffect(() => {
    if (!activeToast) return;
    const timer = window.setTimeout(() => {
      setActiveToast(null);
    }, activeToast.durationMs ?? 8000);
    return () => window.clearTimeout(timer);
  }, [activeToast]);

  useRoomNotifications({
    myRooms,
    myRoomsLoaded,
    currentUserId: profile?.status === 'approved' ? profile.uid : undefined,
    nowMs,
    onInAppToast: handleInAppToast,
    onOpenRoomFromNotification: handleOpenRoomFromNotification,
  });

  const handleEnablePushNotifications = async () => {
    const next = await requestBrowserNotificationPermission();
    setNotificationPermission(next);
    if (next !== 'default') {
      dismissPushPrompt();
      setPushPromptHidden(true);
    }
  };

  // Auto-delete open/expired rooms past departureAt
  useEffect(() => {
    if (profile?.status !== 'approved') return;
    const toDeleteIds = new Set<string>();
    openRooms.forEach((room) => {
      if (room.status === 'open' && room.departureAt && room.departureAt.toMillis() <= nowMs) {
        toDeleteIds.add(room.id);
      }
    });
    myRooms.forEach((room) => {
      if (
        room.status === 'expired' ||
        (room.status === 'open' && room.departureAt && room.departureAt.toMillis() <= nowMs)
      ) {
        toDeleteIds.add(room.id);
      }
    });
    toDeleteIds.forEach((id) => {
      void expireRoomIfNeeded(id);
    });
  }, [openRooms, myRooms, nowMs, profile?.status]);

  const blockingRoom = useMemo(() => {
    return (
      myRooms.find((r) => {
        if (r.status === 'closed') return true;
        if (r.status === 'open' && r.departureAt && r.departureAt.toMillis() > nowMs) {
          return true;
        }
        return false;
      }) || null
    );
  }, [myRooms, nowMs]);

  const historyRooms = useMemo(() => {
    return myRooms.filter((r) => r.status === 'settled' || r.status === 'completed');
  }, [myRooms]);

  if (!authReady || (firebaseUser && !profileLoaded)) {
    return (
      <div className="min-h-screen bg-[#F4F9FF] flex items-center justify-center p-4">
        <div className="text-center space-y-2.5">
          <img
            src="/pwa-192x192.png"
            alt="한림 TAXI 아이콘"
            className="w-14 h-14 rounded-2xl mx-auto border border-[#DCE9F8] shadow-sm object-cover"
          />
          <p className="text-xs font-medium text-[#435E8D]">불러오는 중이에요...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthScreen googlePendingUser={null} />;
  }

  // Dedicated Admin UID (MAAA6M66iMRXh42cyYrcdk9yYLB2) defaults directly to Admin Dashboard
  if (isPrimaryAdminUid && !adminPreferUserView) {
    return (
      <div className="min-h-screen bg-[#F4F9FF]">
        <header className="sticky top-0 z-30 h-[52px] bg-white/95 backdrop-blur-md border-b border-[#DCE9F8] px-4">
          <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-8">
            <span className="text-base font-bold text-[#0D1B3E] whitespace-nowrap shrink-0">
              한림 TAXI
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-lg bg-[#0D1B3E] text-white text-xs font-bold whitespace-nowrap shrink-0">
                관리자(Admin)
              </span>
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <AdminApprovalPage
            showLogout
            onSwitchToUserView={
              profile?.status === 'approved' ? () => setAdminPreferUserView(true) : undefined
            }
          />
        </main>
      </div>
    );
  }

  // Allow other admins to open Admin Dashboard even before completing student profile
  if (isAdmin && adminBypassOpen && profile?.status !== 'approved') {
    return (
      <div className="min-h-screen bg-[#F4F9FF]">
        <header className="sticky top-0 z-30 h-[52px] bg-white/95 backdrop-blur-md border-b border-[#DCE9F8] px-4">
          <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-8">
            <span className="text-base font-bold text-[#0D1B3E] whitespace-nowrap shrink-0">
              한림 TAXI
            </span>
            <button
              type="button"
              onClick={() => setAdminBypassOpen(false)}
              className="min-h-[40px] px-3.5 rounded-xl border border-[#D4E4F7] text-xs font-semibold text-[#0D1B3E] whitespace-nowrap shrink-0"
            >
              돌아가기
            </button>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <AdminApprovalPage showLogout onBack={() => setAdminBypassOpen(false)} />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <AuthScreen
        googlePendingUser={{
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        }}
        isAdminEmail={isAdmin}
        onOpenAdminPage={() => setAdminBypassOpen(true)}
      />
    );
  }

  if (profile.status !== 'approved') {
    return (
      <PendingApprovalScreen
        profile={profile}
        isAdmin={isAdmin}
        onOpenAdminPage={() => setAdminBypassOpen(true)}
      />
    );
  }

  const navigateHome = () => {
    setSelectedRoomId(null);
    setTab('home');
  };

  const openRoomDetail = (id: string, returnTo: 'home' | 'history') => {
    setRoomReturnTab(returnTo);
    setSelectedRoomId(id);
    setTab(returnTo);
  };

  return (
    <div className="min-h-screen bg-[#F4F9FF] flex flex-col">
      {/* Top App Bar (52px) */}
      <header className="sticky top-0 z-30 h-[52px] bg-white/95 backdrop-blur-md border-b border-[#DCE9F8] px-4">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={navigateHome}
            className="text-base font-bold tracking-tight text-[#0D1B3E] whitespace-nowrap shrink-0"
          >
            한림 TAXI
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-[#435E8D]">
            <button
              type="button"
              onClick={navigateHome}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                tab === 'home' ? 'text-[#1D5CE5]' : 'hover:text-[#0D1B3E]'
              }`}
            >
              모집방 목록
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedRoomId(null);
                setTab('create');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                tab === 'create' ? 'text-[#1D5CE5]' : 'hover:text-[#0D1B3E]'
              }`}
            >
              방 만들기
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedRoomId(null);
                setTab('history');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                tab === 'history' ? 'text-[#1D5CE5]' : 'hover:text-[#0D1B3E]'
              }`}
            >
              과거 이력
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedRoomId(null);
                setTab('myinfo');
              }}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                tab === 'myinfo' ? 'text-[#1D5CE5]' : 'hover:text-[#0D1B3E]'
              }`}
            >
              내 정보
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedRoomId(null);
                  setTab('admin');
                }}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  tab === 'admin'
                    ? 'bg-[#0D1B3E] text-white'
                    : 'bg-[#EBF4FF] text-[#1D5CE5] hover:bg-[#DCE9F8]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                관리자(Admin)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedRoomId(null);
                  setTab('myinfo');
                }}
                className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-[#0D1B3E] bg-[#F4F9FF] hover:bg-[#EBF4FF] whitespace-nowrap shrink-0 transition-colors"
              >
                {profile.name}님
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-5 pb-24 space-y-4">
        {activeToast && (
          <div
            role="status"
            className="bg-[#0D1B3E] text-white rounded-2xl p-4 flex items-start justify-between gap-3 shadow-md"
          >
            <button
              type="button"
              onClick={() => {
                if (activeToast.roomId) {
                  handleOpenRoomFromNotification(activeToast.roomId);
                } else {
                  setActiveToast(null);
                }
              }}
              className="flex items-start gap-3 text-left min-w-0 flex-1"
            >
              <Bell className="w-5 h-5 text-[#7DD3FC] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#7DD3FC]">{activeToast.title}</p>
                <p className="text-xs text-white mt-0.5 leading-relaxed">{activeToast.body}</p>
              </div>
            </button>
            <button
              type="button"
              aria-label="알림 닫기"
              onClick={() => setActiveToast(null)}
              className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-[#BFDBFE] hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {!selectedRoomId &&
          tab === 'home' &&
          notificationPermission === 'default' &&
          !pushPromptHidden && (
            <div className="bg-white border border-[#BFDBFE] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#EBF4FF] text-[#1D5CE5] flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#0D1B3E]">실시간 브라우저 푸시 알림 받기</p>
                  <p className="text-xs text-[#435E8D] mt-0.5 leading-relaxed">
                    새 동승자 참여, 모집 마감, 출발 10분 전 위치 사진 미등록, 정산 요청 알림을 바로 받아볼 수 있어요.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => {
                    dismissPushPrompt();
                    setPushPromptHidden(true);
                  }}
                  className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-[#435E8D] hover:bg-[#F4F9FF] whitespace-nowrap"
                >
                  나중에
                </button>
                <button
                  type="button"
                  onClick={() => void handleEnablePushNotifications()}
                  className="min-h-[40px] px-4 rounded-xl bg-[#1D5CE5] hover:bg-[#1649BE] text-white text-xs font-semibold whitespace-nowrap transition-colors"
                >
                  알림 허용
                </button>
              </div>
            </div>
          )}

        {selectedRoomId ? (
          <RoomDetailView
            roomId={selectedRoomId}
            profile={profile}
            blockingRoom={blockingRoom}
            nowMs={nowMs}
            onBack={() => {
              setSelectedRoomId(null);
              setTab(roomReturnTab);
            }}
          />
        ) : (
          <>
            {tab === 'home' && (
              <HomeRoomList
                rooms={openRooms}
                myActiveRoom={blockingRoom}
                currentUserId={profile.uid}
                nowMs={nowMs}
                onSelectRoom={(id) => openRoomDetail(id, 'home')}
                onOpenCreate={() => setTab('create')}
              />
            )}

            {tab === 'create' && (
              <CreateRoomWizard
                profile={profile}
                blockingRoom={blockingRoom}
                onCancel={() => setTab('home')}
                onCreated={(newRoomId) => openRoomDetail(newRoomId, 'home')}
                onGoToActiveRoom={(activeId) => openRoomDetail(activeId, 'home')}
              />
            )}

            {tab === 'history' && (
              <RideHistoryPage
                rooms={historyRooms}
                currentUserId={profile.uid}
                nowMs={nowMs}
                onSelectRoom={(id) => openRoomDetail(id, 'history')}
              />
            )}

            {tab === 'myinfo' && (
              <MyInfoPage
                profile={profile}
                notificationPermission={notificationPermission}
                onNotificationPermissionChange={setNotificationPermission}
              />
            )}

            {tab === 'admin' && isAdmin && (
              <AdminApprovalPage showLogout onBack={() => setTab('home')} />
            )}
          </>
        )}
      </main>

      {/* Fixed Bottom Navigation (60px) */}
      <nav
        aria-label="하단 내비게이션"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#DCE9F8] pb-safe"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 items-center h-[60px] px-2">
          <button
            type="button"
            onClick={navigateHome}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 whitespace-nowrap transition-colors ${
              tab === 'home' && !selectedRoomId ? 'text-[#1D5CE5]' : 'text-[#435E8D]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[11px] font-semibold">홈</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRoomId(null);
              setTab('history');
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 whitespace-nowrap transition-colors ${
              tab === 'history' ? 'text-[#1D5CE5]' : 'text-[#435E8D]'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[11px] font-semibold">과거 이력</span>
          </button>

          <div className="flex items-center justify-center">
            <button
              type="button"
              aria-label="방 만들기"
              onClick={() => {
                setSelectedRoomId(null);
                setTab('create');
              }}
              className="w-12 h-11 rounded-2xl bg-[#1D5CE5] hover:bg-[#1649BE] active:scale-[0.97] text-white flex items-center justify-center shadow-sm transition-all"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedRoomId(null);
              setTab('myinfo');
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 whitespace-nowrap transition-colors ${
              tab === 'myinfo' ? 'text-[#1D5CE5]' : 'text-[#435E8D]'
            }`}
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[11px] font-semibold">내 정보</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <MainApp />
    </AppErrorBoundary>
  );
}
