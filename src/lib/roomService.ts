import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DepartureMinutes,
  GenderCondition,
  LocationOption,
  TaxiRoom,
  UserProfile,
} from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { deleteRoomLocationPhoto, uploadRoomLocationPhoto } from './storageService';

export async function findActiveUserRoom(uid: string): Promise<TaxiRoom | null> {
  const path = 'rooms';
  try {
    const q = query(
      collection(db, 'rooms'),
      where('participantIds', 'array-contains', uid)
    );
    const snap = await getDocs(q);
    const now = Date.now();

    for (const d of snap.docs) {
      const room = { id: d.id, ...d.data() } as TaxiRoom;
      if (room.status === 'open') {
        if (room.departureAt && room.departureAt.toMillis() <= now) {
          void expireRoomIfNeeded(room.id);
          continue;
        }
        return room;
      }
      if (room.status === 'closed') {
        return room;
      }
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function expireRoomIfNeeded(roomId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      status: 'expired',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Another client may have already expired or closed this room
  }
}

export async function createRoom(
  profile: UserProfile,
  input: {
    departure: LocationOption;
    destination: LocationOption;
    locationPhotoBlob: Blob;
    genderCondition: GenderCondition;
    maxParticipants: number;
    departureMinutes: DepartureMinutes;
  }
): Promise<string> {
  if (input.departure === input.destination) {
    throw new Error('출발지와 목적지는 서로 다른 곳을 선택해 주세요.');
  }
  if (!input.locationPhotoBlob || input.locationPhotoBlob.size === 0) {
    throw new Error('현재 위치 사진을 촬영하거나 올려 주세요.');
  }
  if (input.genderCondition !== 'any' && input.genderCondition !== profile.gender) {
    throw new Error('본인 성별과 맞지 않는 성별 조건의 방은 만들 수 없어요.');
  }

  const activeRoom = await findActiveUserRoom(profile.uid);
  if (activeRoom) {
    throw new Error('이미 참여 중인 동승방이 있어요. 한 번에 하나의 방에만 속할 수 있어요.');
  }

  const roomRef = doc(collection(db, 'rooms'));
  const locationPhotoUrl = await uploadRoomLocationPhoto(roomRef.id, input.locationPhotoBlob);
  const departureAt = Timestamp.fromMillis(Date.now() + input.departureMinutes * 60 * 1000);

  try {
    await setDoc(roomRef, {
      hostId: profile.uid,
      hostName: profile.name,
      departure: input.departure,
      destination: input.destination,
      locationPhotoUrl,
      genderCondition: input.genderCondition,
      maxParticipants: input.maxParticipants,
      currentParticipants: 1,
      participantIds: [profile.uid],
      participantNames: [profile.name],
      departureMinutes: input.departureMinutes,
      departureAt,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return roomRef.id;
  } catch (error) {
    await deleteRoomLocationPhoto(roomRef.id);
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomRef.id}`);
  }
}

export async function joinRoom(roomId: string, profile: UserProfile): Promise<void> {
  const activeRoom = await findActiveUserRoom(profile.uid);
  if (activeRoom) {
    if (activeRoom.id === roomId) {
      throw new Error('이미 이 방에 참여 중이에요.');
    }
    throw new Error('이미 다른 동승방에 참여 중이에요. 한 번에 하나의 방에만 속할 수 있어요.');
  }

  const roomRef = doc(db, 'rooms', roomId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) {
        throw new Error('방을 찾을 수 없어요.');
      }
      const room = snap.data() as Omit<TaxiRoom, 'id'>;
      if (room.status !== 'open') {
        throw new Error('이미 정원이 마감되었거나 종료된 방이에요.');
      }
      if (room.departureAt.toMillis() <= Date.now()) {
        throw new Error('출발 시간이 지나 자동으로 종료된 방이에요.');
      }
      if (room.participantIds.includes(profile.uid)) {
        throw new Error('이미 이 방에 참여 중이에요.');
      }
      if (room.currentParticipants >= room.maxParticipants) {
        throw new Error('이미 정원이 마감되었어요.');
      }
      if (room.genderCondition !== 'any' && room.genderCondition !== profile.gender) {
        throw new Error('성별 조건이 맞지 않아 참가할 수 없어요.');
      }

      const nextIds = [...room.participantIds, profile.uid];
      const nextNames = [...room.participantNames, profile.name];
      const nextCount = nextIds.length;
      const nextStatus = nextCount >= room.maxParticipants ? 'closed' : 'open';

      tx.update(roomRef, {
        currentParticipants: nextCount,
        participantIds: nextIds,
        participantNames: nextNames,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Missing or insufficient permissions')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
  }
}

export async function leaveRoom(roomId: string, uid: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return;
      const room = snap.data() as Omit<TaxiRoom, 'id'>;
      if (room.status !== 'open') {
        throw new Error('이미 마감된 방에서는 나갈 수 없어요.');
      }
      const idx = room.participantIds.indexOf(uid);
      if (idx === -1) return;

      if (room.currentParticipants <= 1) {
        tx.update(roomRef, {
          status: 'expired',
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const nextIds = room.participantIds.filter((_, i) => i !== idx);
      const nextNames = room.participantNames.filter((_, i) => i !== idx);

      tx.update(roomRef, {
        hostId: nextIds[0],
        hostName: nextNames[0],
        currentParticipants: nextIds.length,
        participantIds: nextIds,
        participantNames: nextNames,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Missing or insufficient permissions')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
  }
}

export async function sendRoomSettlement(
  roomId: string,
  hostProfile: UserProfile,
  totalFare: number,
  participantCount: number
): Promise<void> {
  const fareInt = Math.round(totalFare);
  if (!Number.isFinite(fareInt) || fareInt < 100 || fareInt > 500000) {
    throw new Error('택시비는 100원 이상 500,000원 이하로 입력해 주세요.');
  }
  if (participantCount < 2 || participantCount > 4) {
    throw new Error('정산 인원수가 올바르지 않아요.');
  }

  const perPersonAmount = Math.ceil(fareInt / participantCount);

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'rooms', roomId, 'settlement', 'info'), {
      roomId,
      hostId: hostProfile.uid,
      totalFare: fareInt,
      participantCount,
      perPersonAmount,
      bankName: hostProfile.bankName,
      accountNumber: hostProfile.accountNumber,
      accountHolder: hostProfile.accountHolder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'rooms', roomId), {
      status: 'settled',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/settlement/info`);
  }
}
