import {
  deleteObject,
  getBlob,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { doc, getDoc } from 'firebase/firestore';
import { StudentIdDocument } from '../types';
import { db, storage } from './firebase';

export function getStudentIdStoragePath(uid: string): string {
  return `student-ids/${uid}/student-id.jpg`;
}

export function getRoomPhotoStoragePath(roomId: string): string {
  return `rooms/${roomId}/location.jpg`;
}

function translateStorageError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  switch (code) {
    case 'storage/unauthorized':
      return 'Firebase Storage 접근 권한이 없어요. Firebase Console > Storage > Rules에 프로젝트의 storage.rules 규칙을 게시해 주세요.';
    case 'storage/canceled':
      return '파일 업로드가 취소되었어요.';
    case 'storage/quota-exceeded':
      return '저장소 용량이 초과되었어요.';
    case 'storage/retry-limit-exceeded':
      return '네트워크 연결이 불안정해 업로드에 실패했어요. 다시 시도해 주세요.';
    default:
      return error instanceof Error ? error.message : '파일 저장 중 오류가 발생했어요.';
  }
}

export async function uploadStudentIdPhoto(uid: string, blob: Blob): Promise<string> {
  const path = getStudentIdStoragePath(uid);
  try {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
    return path;
  } catch (error) {
    throw new Error(translateStorageError(error));
  }
}

export async function fetchPrivateStudentIdPhotoUrl(uid: string): Promise<string | null> {
  const storagePath = getStudentIdStoragePath(uid);
  try {
    const blob = await getBlob(ref(storage, storagePath));
    return URL.createObjectURL(blob);
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'storage/unauthorized') {
      throw new Error(translateStorageError(error));
    }
    // Fallback check for legacy Firestore-stored image if any
    try {
      const legacySnap = await getDoc(doc(db, 'users', uid, 'private', 'studentId'));
      if (legacySnap.exists()) {
        return (legacySnap.data() as StudentIdDocument).imageDataUrl || null;
      }
    } catch {
      // Ignore legacy read error
    }
    return null;
  }
}

export async function deleteStudentIdPhotoFromStorage(uid: string): Promise<void> {
  const storagePath = getStudentIdStoragePath(uid);
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code !== 'storage/object-not-found') {
      throw new Error(translateStorageError(error));
    }
  }
}

export async function uploadRoomLocationPhoto(roomId: string, blob: Blob): Promise<string> {
  const path = getRoomPhotoStoragePath(roomId);
  try {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
    return await getDownloadURL(fileRef);
  } catch (error) {
    throw new Error(translateStorageError(error));
  }
}

export async function deleteRoomLocationPhoto(roomId: string): Promise<void> {
  const path = getRoomPhotoStoragePath(roomId);
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Cleanup best effort
  }
}
