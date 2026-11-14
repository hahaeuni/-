import {
  deleteObject,
  getDownloadURL,
  listAll,
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
      return '네트워크 연결이 불안정하거나 응답이 지연되어 사진을 불러오지 못했어요. 다시 시도해 주세요.';
    default:
      return error instanceof Error ? error.message : '파일 저장 중 오류가 발생했어요.';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function uploadStudentIdPhoto(uid: string, blob: Blob): Promise<string> {
  const path = getStudentIdStoragePath(uid);
  try {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'private, max-age=3600',
    });
    // Verify the uploaded file is immediately accessible before completing signup
    await withTimeout(
      getDownloadURL(fileRef),
      10000,
      '학생증 사진 업로드 확인 시간이 초과되었어요. 다시 시도해 주세요.'
    );
    return path;
  } catch (error) {
    throw new Error(translateStorageError(error));
  }
}

export async function fetchPrivateStudentIdPhotoUrl(
  uid: string,
  preferredPath?: string
): Promise<string | null> {
  const defaultPath = getStudentIdStoragePath(uid);
  const candidatePaths =
    preferredPath && preferredPath.trim() && preferredPath !== defaultPath
      ? [preferredPath.trim(), defaultPath]
      : [defaultPath];

  for (const path of candidatePaths) {
    try {
      const url = await withTimeout(
        getDownloadURL(ref(storage, path)),
        10000,
        '학생증 사진 응답 시간이 초과되었어요. 다시 시도해 주세요.'
      );
      return url;
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'storage/object-not-found') {
        continue;
      }
      throw new Error(translateStorageError(error));
    }
  }

  // Fallback: list files inside student-ids/{uid}/ in case filename differs
  try {
    const folderRef = ref(storage, `student-ids/${uid}`);
    const listResult = await withTimeout(
      listAll(folderRef),
      8000,
      '학생증 폴더 조회 시간이 초과되었어요.'
    );
    if (listResult.items.length > 0) {
      return await getDownloadURL(listResult.items[0]);
    }
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'storage/unauthorized') {
      throw new Error(translateStorageError(error));
    }
    // Otherwise fall through to legacy Firestore check
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

export async function deleteStudentIdPhotoFromStorage(
  uid: string,
  preferredPath?: string
): Promise<void> {
  const defaultPath = getStudentIdStoragePath(uid);
  const paths =
    preferredPath && preferredPath.trim() && preferredPath !== defaultPath
      ? [preferredPath.trim(), defaultPath]
      : [defaultPath];

  for (const storagePath of paths) {
    try {
      await deleteObject(ref(storage, storagePath));
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (code !== 'storage/object-not-found') {
        throw new Error(translateStorageError(error));
      }
    }
  }
}

export async function uploadRoomLocationPhoto(roomId: string, blob: Blob): Promise<string> {
  const path = getRoomPhotoStoragePath(roomId);
  try {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=3600',
    });
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
