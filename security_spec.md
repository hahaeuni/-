# 한림택시 Firestore Security Specification

## 1. Data Invariants
1. **PII & Student ID Isolation**: `/users/{userId}` and `/users/{userId}/private/{docId}` contain personally identifiable information (phone, bank account, student ID photo) and are strictly readable ONLY by the document owner (`request.auth.uid == userId`) or a verified admin (`isAdmin()`).
2. **No Self-Approval or Self-Promotion**: Users creating `/users/{userId}` MUST have `status == 'pending'` and `agreedToPrivacy == true`. Users CANNOT update their own `status` to `'approved'`, nor can they write to `/admins/{userId}`.
3. **Approved-Only Room Access**: Only users whose `/users/{uid}` document has `status == 'approved'` can create, join, leave, or read details of taxi rooms.
4. **Atomic Capacity & Gender Enforcement**: A room's `currentParticipants` MUST equal `participantIds.size()` and `participantNames.size()`, and MUST be `<= maxParticipants` (`2 <= maxParticipants <= 4`). When `genderCondition` is `'male'` or `'female'`, joining users MUST have a matching `gender` in their `/users/{uid}` profile.
5. **Terminal State Locking**: Once a room reaches `'settled'` or `'expired'`, no new participants can join or modify room composition.
6. **Settlement Access Control**: `/rooms/{roomId}/settlement/{docId}` (containing the host's bank account number) MUST ONLY be created/updated by the room's `hostId` when the room is `'closed'` or `'settled'`, and MUST ONLY be readable by participants whose UID is in the parent room's `participantIds` array (or an admin).
7. **Server Timestamps & Strict Keys**: Every create requires `createdAt == request.time && updatedAt == request.time`, every update requires `updatedAt == request.time`, and every write enforces exact allowed keys via `hasAll` / `hasOnly` and `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Approval Attack**: User creates `/users/{uid}` with `status: 'approved'` directly during signup. -> Must return `PERMISSION_DENIED`.
2. **Status Escalation Update**: Pending user updates `/users/{uid}` changing `status` from `'pending'` to `'approved'`. -> Must return `PERMISSION_DENIED`.
3. **Ghost Field Injection (Shadow Update)**: User updates `/users/{uid}` with `{ name: '홍길동', isAdmin: true, updatedAt: request.time }`. -> Must return `PERMISSION_DENIED`.
4. **PII Blanket Read**: User A attempts `getDoc(doc(db, 'users', userB_uid))` or `getDocs(collection(db, 'users'))`. -> Must return `PERMISSION_DENIED`.
5. **Student ID Snooping**: User A attempts to read `/users/{userB_uid}/private/studentId`. -> Must return `PERMISSION_DENIED`.
6. **Admin Spoof (Unverified Email)**: User signs in with unverified token claiming `email: 'un54208@gmail.com'` with `email_verified: false` and tries to list `/users`. -> Must return `PERMISSION_DENIED`.
7. **Unapproved User Room Creation**: Pending user creates a document in `/rooms/{roomId}`. -> Must return `PERMISSION_DENIED`.
8. **Capacity Overflow Join**: User attempts to join a room by updating `currentParticipants: 5`, `participantIds` with 5 UIDs, or bypassing `maxParticipants`. -> Must return `PERMISSION_DENIED`.
9. **Gender Condition Bypass**: Male user attempts to join a `'female'` only room. -> Must return `PERMISSION_DENIED`.
10. **Non-Participant Settlement Snooping**: User C (not in `room.participantIds`) attempts to read `/rooms/{roomId}/settlement/info`. -> Must return `PERMISSION_DENIED`.
11. **Non-Host Settlement Forgery**: Participant B (not `room.hostId`) attempts to write their own bank account into `/rooms/{roomId}/settlement/info`. -> Must return `PERMISSION_DENIED`.
12. **ID Poisoning / Resource Exhaustion**: User tries to create `/rooms/${'a'.repeat(500)}` or injects a 2MB string into `hostName`. -> Must return `PERMISSION_DENIED`.
