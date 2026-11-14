import { useEffect, useRef } from 'react';
import {
  hasNotifiedEvent,
  markEventNotified,
  showBrowserPushNotification,
} from '../lib/notificationService';
import { TaxiRoom } from '../types';

export interface InAppNotificationToast {
  id: string;
  title: string;
  body: string;
  roomId?: string;
}

interface UseRoomNotificationsArgs {
  myRooms: TaxiRoom[];
  myRoomsLoaded: boolean;
  currentUserId?: string;
  nowMs: number;
  onInAppToast: (toast: InAppNotificationToast) => void;
  onOpenRoomFromNotification: (roomId: string) => void;
}

export function useRoomNotifications({
  myRooms,
  myRoomsLoaded,
  currentUserId,
  nowMs,
  onInAppToast,
  onOpenRoomFromNotification,
}: UseRoomNotificationsArgs): void {
  const prevRoomsRef = useRef<Map<string, TaxiRoom> | null>(null);

  const emitNotification = (params: {
    eventKey: string;
    title: string;
    body: string;
    roomId: string;
  }) => {
    if (hasNotifiedEvent(params.eventKey)) return;
    markEventNotified(params.eventKey);

    onInAppToast({
      id: params.eventKey,
      title: params.title,
      body: params.body,
      roomId: params.roomId,
    });

    void showBrowserPushNotification({
      title: params.title,
      body: params.body,
      tag: params.eventKey,
      roomId: params.roomId,
    });
  };

  // Listen for notification clicks routed back from the Service Worker
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; roomId?: string } | null;
      if (data?.type === 'OPEN_ROOM' && data.roomId) {
        onOpenRoomFromNotification(data.roomId);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [onOpenRoomFromNotification]);

  // Reset snapshot baseline on sign-out / account switch
  useEffect(() => {
    if (!currentUserId || !myRoomsLoaded) {
      prevRoomsRef.current = null;
    }
  }, [currentUserId, myRoomsLoaded]);

  // 1 & 2. Real-time participant join & host close notifications
  useEffect(() => {
    if (!currentUserId || !myRoomsLoaded) return;

    const currentMap = new Map<string, TaxiRoom>();
    myRooms.forEach((r) => currentMap.set(r.id, r));

    // Seed baseline on first loaded snapshot without firing historical notifications
    if (prevRoomsRef.current === null) {
      prevRoomsRef.current = currentMap;
      return;
    }

    const prevMap = prevRoomsRef.current;

    myRooms.forEach((room) => {
      const prev = prevMap.get(room.id);
      if (!prev) return;

      // Trigger 1: A new companion joined this room
      const addedJoiners: { uid: string; name: string }[] = [];
      room.participantIds.forEach((pid, idx) => {
        if (!prev.participantIds.includes(pid) && pid !== currentUserId) {
          addedJoiners.push({
            uid: pid,
            name: room.participantNames[idx] || '새 동승자',
          });
        }
      });

      addedJoiners.forEach((joiner) => {
        emitNotification({
          eventKey: `join:${room.id}:${joiner.uid}`,
          title: '한림 TAXI · 새 동승자 참여',
          body: `${joiner.name}님이 ${room.departure} → ${room.destination} 방에 참여했어요. (${room.currentParticipants}/${room.maxParticipants}명)`,
          roomId: room.id,
        });
      });

      // Trigger 2: Room closed (host manually closed or capacity became full)
      if (prev.status === 'open' && room.status === 'closed') {
        const selfJoinedAndClosed = addedJoiners.length === 0 && !prev.participantIds.includes(currentUserId);
        const hostManualSelfClose =
          room.hostId === currentUserId &&
          Boolean(room.isFlexibleCapacity) &&
          room.participantIds.length === prev.participantIds.length;

        if (!selfJoinedAndClosed && !hostManualSelfClose) {
          const isManualClose =
            Boolean(room.isFlexibleCapacity) &&
            room.currentParticipants < room.maxParticipants;
          emitNotification({
            eventKey: `closed:${room.id}`,
            title: '한림 TAXI · 모집 마감',
            body: isManualClose
              ? `모집자가 ${room.departure} → ${room.destination} 방 모집을 마감했어요. (${room.currentParticipants}명 확정)`
              : `${room.departure} → ${room.destination} 방 정원이 모두 모여 모집이 마감되었어요.`,
            roomId: room.id,
          });
        }
      }
    });

    prevRoomsRef.current = currentMap;
  }, [myRooms, myRoomsLoaded, currentUserId]);

  // 3. Urgent notification when location photo is still missing at 10 minutes before departure
  useEffect(() => {
    if (!currentUserId || !myRoomsLoaded) return;

    myRooms.forEach((room) => {
      if (room.status !== 'open' && room.status !== 'closed') return;
      if (room.locationPhotoUrl) return;
      if (!room.departureAt) return;

      const departureMs = room.departureAt.toMillis();
      const remainingMs = departureMs - nowMs;
      if (remainingMs > 0 && remainingMs <= 10 * 60 * 1000) {
        const isHost = room.hostId === currentUserId;
        emitNotification({
          eventKey: `missing_photo_10m:${room.id}:${departureMs}:${isHost ? 'host' : 'guest'}`,
          title: isHost
            ? '한림 TAXI · 위치 사진 등록 마감 임박'
            : '한림 TAXI · 모집자 위치 사진 미등록',
          body: isHost
            ? `출발 10분 전이에요! 출발 5분 전까지 ${room.departure} 현재 위치 사진을 등록해 주세요.`
            : `출발 10분 전인데 ${room.departure} → ${room.destination} 방에 아직 위치 사진이 올라오지 않았어요.`,
          roomId: room.id,
        });
      }
    });
  }, [myRooms, myRoomsLoaded, nowMs, currentUserId]);
}
