import React, { Component, ErrorInfo, ReactNode, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Home, Plus, Shield, User as UserIcon } from 'lucide-react';
import { AdminApprovalPage } from './components/AdminApprovalPage';
import { AuthScreen } from './components/AuthScreen';
import { CreateRoomWizard } from './components/CreateRoomWizard';
import { HomeRoomList } from './components/HomeRoomList';
import { MyInfoPage } from './components/MyInfoPage';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { RoomDetailView } from './components/RoomDetailView';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
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

type AppTab = 'home' | 'create' | 'myinfo' | 'admin';

function MainApp() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasAdminDoc, setHasAdminDoc] = useState(false);

  const [tab, setTab] = useState<AppTab>('home');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [adminBypassOpen, setAdminBypassOpen] = useState(false);
  const [adminPreferUserView, setAdminPreferUserView] = useState(false);

  const [openRooms, setOpenRooms] = useState<TaxiRoom[]>([]);
  const [myRooms, setMyRooms] = useState<TaxiRoom[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Live clock tick every 5 seconds for countdowns & auto-expiry
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => clearInterval(timer);
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
      return;
    }

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

  // Auto-expire open rooms past departureAt
  useEffect(() => {
    if (profile?.status !== 'approved') return;
    openRooms.forEach((room) => {
      if (room.status === 'open' && room.departureAt && room.departureAt.toMillis() <= nowMs) {
        void expireRoomIfNeeded(room.id);
      }
    });
  }, [openRooms, nowMs, profile?.status]);

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

  const myActiveRooms = useMemo(() => {
    const dayAgo = nowMs - 24 * 60 * 60 * 1000;
    return myRooms.filter((r) => {
      if (r.status === 'closed') return true;
      if (r.status === 'open' && r.departureAt && r.departureAt.toMillis() > nowMs) return true;
      if (r.status === 'settled' && (r.updatedAt?.toMillis() ?? 0) > dayAgo) return true;
      return false;
    });
  }, [myRooms, nowMs]);

  if (!authReady || (firebaseUser && !profileLoaded)) {
    return (
      <div className="min-h-screen bg-[#F4F9FF] flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-[#1D5CE5] text-white font-bold flex items-center justify-center mx-auto">
            한림
          </div>
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
              한림택시
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
              한림택시
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
            한림택시
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
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-5 pb-24">
        {tab === 'home' && !selectedRoomId && (
          <HomeRoomList
            rooms={openRooms}
            myActiveRooms={myActiveRooms}
            currentUserId={profile.uid}
            nowMs={nowMs}
            onSelectRoom={(id) => setSelectedRoomId(id)}
            onOpenCreate={() => setTab('create')}
          />
        )}

        {tab === 'home' && selectedRoomId && (
          <RoomDetailView
            roomId={selectedRoomId}
            profile={profile}
            blockingRoom={blockingRoom}
            nowMs={nowMs}
            onBack={() => setSelectedRoomId(null)}
          />
        )}

        {tab === 'create' && (
          <CreateRoomWizard
            profile={profile}
            blockingRoom={blockingRoom}
            onCancel={() => setTab('home')}
            onCreated={(newRoomId) => {
              setSelectedRoomId(newRoomId);
              setTab('home');
            }}
            onGoToActiveRoom={(activeId) => {
              setSelectedRoomId(activeId);
              setTab('home');
            }}
          />
        )}

        {tab === 'myinfo' && <MyInfoPage profile={profile} />}

        {tab === 'admin' && isAdmin && (
          <AdminApprovalPage showLogout onBack={() => setTab('home')} />
        )}
      </main>

      {/* Fixed Bottom Navigation (60px, center + button) */}
      <nav
        aria-label="하단 내비게이션"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#DCE9F8] pb-safe"
      >
        <div className="max-w-lg mx-auto grid grid-cols-3 items-center h-[60px] px-4">
          <button
            type="button"
            onClick={navigateHome}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              tab === 'home' ? 'text-[#1D5CE5]' : 'text-[#435E8D]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[11px] font-semibold">홈</span>
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
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
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
