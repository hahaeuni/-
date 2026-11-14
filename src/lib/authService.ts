import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Gender,
  LIMITS,
  USERNAME_EMAIL_DOMAIN,
  USERNAME_PATTERN,
  UserProfile,
} from '../types';
import {
  auth,
  db,
  firebaseProjectId,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { leaveRoom } from './roomService';
import {
  deleteStudentIdPhotoFromStorage,
  fetchPrivateStudentIdPhotoUrl,
  uploadStudentIdPhoto,
} from './storageService';

export interface SignUpInput {
  name: string;
  username: string;
  password: string;
  phone: string;
  gender: Gender;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  studentIdPhotoBlob: Blob;
  agreedToPrivacy: boolean;
}

export interface GoogleCompleteProfileInput {
  name: string;
  username: string;
  phone: string;
  gender: Gender;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  studentIdPhotoBlob: Blob;
  agreedToPrivacy: boolean;
}

function validateProfileFields(input: {
  name: string;
  username: string;
  phone: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  studentIdPhotoBlob?: Blob;
  agreedToPrivacy?: boolean;
}) {
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  const phone = input.phone.trim();
  const bankName = input.bankName.trim();
  const accountNumber = input.accountNumber.trim();
  const accountHolder = input.accountHolder.trim();

  if (!name || name.length > LIMITS.NAME_MAX) {
    throw new Error('이름을 1~40자 이내로 입력해 주세요.');
  }
  if (
    username.length < LIMITS.USERNAME_MIN ||
    username.length > LIMITS.USERNAME_MAX ||
    !USERNAME_PATTERN.test(username)
  ) {
    throw new Error('아이디는 영문, 숫자, 밑줄(_)만 사용해 3~40자로 입력해 주세요.');
  }
  if (phone.length < LIMITS.PHONE_MIN || phone.length > LIMITS.PHONE_MAX) {
    throw new Error('올바른 전화번호를 입력해 주세요.');
  }
  if (!bankName || bankName.length > LIMITS.BANK_MAX) {
    throw new Error('은행을 선택하거나 입력해 주세요.');
  }
  if (accountNumber.length < LIMITS.ACCOUNT_MIN || accountNumber.length > LIMITS.ACCOUNT_MAX) {
    throw new Error('올바른 계좌번호를 입력해 주세요.');
  }
  if (!accountHolder || accountHolder.length > LIMITS.HOLDER_MAX) {
    throw new Error('예금주명을 입력해 주세요.');
  }
  if (input.agreedToPrivacy === false) {
    throw new Error('개인정보 수집·이용에 동의해 주세요.');
  }
  if (input.studentIdPhotoBlob !== undefined && input.studentIdPhotoBlob.size === 0) {
    throw new Error('학생증 사진을 올려 주세요.');
  }

  return { name, username, phone, bankName, accountNumber, accountHolder };
}

export function translateAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return '이 로그인 방식이 Firebase 콘솔에서 활성화되지 않았어요. Authentication > Sign-in method 설정을 확인해 주세요.';
    case 'auth/email-already-in-use':
      return '이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return '아이디(이메일) 또는 비밀번호가 맞지 않아요.';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상으로 입력해 주세요.';
    case 'auth/unauthorized-domain': {
      const currentHost =
        typeof window !== 'undefined' ? window.location.hostname : '알 수 없음';
      return `현재 접속 도메인(${currentHost})이 Firebase 프로젝트(${firebaseProjectId})의 승인된 도메인에 등록되어 있지 않아요. Authentication > Settings > Authorized domains에 위 도메인을 정확히 추가했는지 확인해 주세요.`;
    }
    case 'auth/too-many-requests':
      return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
    case 'auth/popup-closed-by-user':
      return '구글 로그인이 취소되었어요.';
    case 'auth/requires-recent-login':
      return '보안을 위해 다시 로그인한 뒤 진행해 주세요.';
    default:
      return error instanceof Error ? error.message : '인증 처리 중 오류가 발생했어요.';
  }
}

export async function signUpWithUsername(input: SignUpInput): Promise<void> {
  if (input.password.length < 6) {
    throw new Error('비밀번호는 6자 이상으로 입력해 주세요.');
  }
  const clean = validateProfileFields(input);
  const authEmail = `${clean.username}@${USERNAME_EMAIL_DOMAIN}`;

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, authEmail, input.password);
  } catch (error) {
    throw new Error(translateAuthError(error));
  }

  const uid = cred.user.uid;
  try {
    const usernameRef = doc(db, 'usernames', clean.username);
    const existingUsername = await getDoc(usernameRef);
    if (existingUsername.exists()) {
      await deleteUser(cred.user);
      throw new Error('이미 사용 중인 아이디예요.');
    }

    const storagePath = await uploadStudentIdPhoto(uid, input.studentIdPhotoBlob);

    const batch = writeBatch(db);
    batch.set(usernameRef, {
      uid,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid), {
      uid,
      username: clean.username,
      authProvider: 'password',
      email: authEmail,
      name: clean.name,
      phone: clean.phone,
      gender: input.gender,
      bankName: clean.bankName,
      accountNumber: clean.accountNumber,
      accountHolder: clean.accountHolder,
      status: 'pending',
      agreedToPrivacy: true,
      hasStudentIdPhoto: true,
      studentIdPhotoPath: storagePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    await deleteStudentIdPhotoFromStorage(uid).catch(() => undefined);
    try {
      if (auth.currentUser?.uid === uid) {
        await deleteUser(auth.currentUser);
      }
    } catch {
      // Cleanup best effort
    }
    if (
      error instanceof Error &&
      !error.message.includes('이미 사용 중인') &&
      !error.message.includes('Firebase Storage')
    ) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
    throw error;
  }
}

export async function loginWithUsername(identifier: string, password: string): Promise<void> {
  const trimmed = identifier.trim();
  if (!trimmed || !password) {
    throw new Error('아이디(이메일)와 비밀번호를 모두 입력해 주세요.');
  }
  const authEmail = trimmed.includes('@')
    ? trimmed
    : `${trimmed.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
  try {
    await signInWithEmailAndPassword(auth, authEmail, password);
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

export async function loginWithGoogle(): Promise<void> {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

export async function completeGoogleProfile(input: GoogleCompleteProfileInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요해요.');
  const clean = validateProfileFields(input);

  const usernameRef = doc(db, 'usernames', clean.username);
  let existingUsername;
  try {
    existingUsername = await getDoc(usernameRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `usernames/${clean.username}`);
  }
  if (existingUsername.exists()) {
    throw new Error('이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.');
  }

  const storagePath = await uploadStudentIdPhoto(user.uid, input.studentIdPhotoBlob);

  try {
    const batch = writeBatch(db);
    batch.set(usernameRef, {
      uid: user.uid,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', user.uid), {
      uid: user.uid,
      username: clean.username,
      authProvider: 'google',
      email: (user.email || `${clean.username}@${USERNAME_EMAIL_DOMAIN}`).slice(0, 120),
      name: clean.name,
      phone: clean.phone,
      gender: input.gender,
      bankName: clean.bankName,
      accountNumber: clean.accountNumber,
      accountHolder: clean.accountHolder,
      status: 'pending',
      agreedToPrivacy: true,
      hasStudentIdPhoto: true,
      studentIdPhotoPath: storagePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    await deleteStudentIdPhotoFromStorage(user.uid).catch(() => undefined);
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function resubmitRejectedProfile(
  profile: UserProfile,
  input: {
    name: string;
    phone: string;
    gender: Gender;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    studentIdPhotoBlob: Blob;
  }
): Promise<void> {
  const clean = validateProfileFields({
    ...input,
    username: profile.username,
    agreedToPrivacy: true,
  });

  const storagePath = await uploadStudentIdPhoto(profile.uid, input.studentIdPhotoBlob);

  try {
    await updateDoc(doc(db, 'users', profile.uid), {
      name: clean.name,
      phone: clean.phone,
      gender: input.gender,
      bankName: clean.bankName,
      accountNumber: clean.accountNumber,
      accountHolder: clean.accountHolder,
      status: 'pending',
      rejectionReason: '',
      hasStudentIdPhoto: true,
      studentIdPhotoPath: storagePath,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
  }
}

export async function updateMyProfile(
  profile: UserProfile,
  updates: {
    name: string;
    phone: string;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  }
): Promise<void> {
  const clean = validateProfileFields({
    ...updates,
    username: profile.username,
    agreedToPrivacy: true,
  });

  try {
    await updateDoc(doc(db, 'users', profile.uid), {
      name: clean.name,
      phone: clean.phone,
      bankName: clean.bankName,
      accountNumber: clean.accountNumber,
      accountHolder: clean.accountHolder,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
  }
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('로그인 상태를 확인할 수 없어요.');
  }
  if (!currentPassword) {
    throw new Error('현재 비밀번호를 입력해 주세요.');
  }
  if (newPassword.length < 6) {
    throw new Error('새 비밀번호는 6자 이상으로 입력해 주세요.');
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

export async function deleteMyAccount(
  profile: UserProfile | null,
  currentPassword?: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요해요.');

  try {
    if (profile?.authProvider === 'password' && user.email) {
      if (!currentPassword) {
        throw new Error('계정 탈퇴를 위해 현재 비밀번호를 입력해 주세요.');
      }
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
    } else if (user.providerData.some((p) => p.providerId === 'google.com')) {
      await reauthenticateWithPopup(user, googleProvider);
    }
  } catch (error) {
    throw new Error(translateAuthError(error));
  }

  try {
    const openRoomsSnap = await getDocs(
      query(
        collection(db, 'rooms'),
        where('participantIds', 'array-contains', user.uid),
        where('status', '==', 'open')
      )
    );
    for (const roomDoc of openRoomsSnap.docs) {
      await leaveRoom(roomDoc.id, user.uid);
    }
  } catch {
    // Proceed even if no open rooms
  }

  try {
    await deleteStudentIdPhotoFromStorage(user.uid).catch(() => undefined);
    await deleteDoc(doc(db, 'users', user.uid, 'private', 'studentId')).catch(() => undefined);
    if (profile?.username) {
      await deleteDoc(doc(db, 'usernames', profile.username)).catch(() => undefined);
    }
    if (profile) {
      await deleteDoc(doc(db, 'users', user.uid));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}`);
  }

  try {
    await deleteUser(user);
  } catch (error) {
    throw new Error(translateAuthError(error));
  }
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function getStudentIdPhoto(userId: string): Promise<string | null> {
  return fetchPrivateStudentIdPhotoUrl(userId);
}

export async function approveUserAccount(userId: string): Promise<void> {
  const path = `users/${userId}`;
  await deleteStudentIdPhotoFromStorage(userId);
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', userId), {
      status: 'approved',
      hasStudentIdPhoto: false,
      studentIdPhotoPath: '',
      rejectionReason: '',
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'users', userId, 'private', 'studentId'));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function rejectUserAccount(userId: string, reason?: string): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      status: 'rejected',
      rejectionReason: (reason || '학생증 확인이 어려워요. 선명한 사진으로 다시 올려주세요.').slice(
        0,
        LIMITS.REJECTION_REASON_MAX
      ),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
