/**
 * Adversarial Security Rules Test Suite ("Dirty Dozen")
 * Verifies that all 12 attack payloads are rejected with PERMISSION_DENIED.
 * Intended to run against the Firebase Firestore Emulator via @firebase/rules-unit-testing.
 */

export const DIRTY_DOZEN_CASES = [
  {
    id: 1,
    name: 'Self-Approval Attack',
    targetPath: '/users/attacker_uid',
    operation: 'create',
    payload: {
      uid: 'attacker_uid',
      username: 'attacker1',
      authProvider: 'password',
      email: 'attacker1@hallymtaxi.app',
      name: '공격자',
      phone: '01012345678',
      gender: 'male',
      bankName: '카카오뱅크',
      accountNumber: '3333001122334',
      accountHolder: '공격자',
      status: 'approved', // Forbidden on create
      agreedToPrivacy: true,
      hasStudentIdPhoto: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Status Escalation Update',
    targetPath: '/users/pending_uid',
    operation: 'update',
    payload: {
      status: 'approved',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Ghost Field Injection (Shadow Update)',
    targetPath: '/users/user_uid',
    operation: 'update',
    payload: {
      name: '홍길동',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'PII Blanket Read',
    targetPath: '/users/victim_uid',
    operation: 'get',
    actorUid: 'other_student_uid',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Student ID Snooping',
    targetPath: '/users/victim_uid/private/studentId',
    operation: 'get',
    actorUid: 'other_student_uid',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Admin Spoof (Unverified Email)',
    targetPath: '/users',
    operation: 'list',
    tokenClaims: { email: 'un54208@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unapproved User Room Creation',
    targetPath: '/rooms/room_1',
    operation: 'create',
    actorStatus: 'pending',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Capacity Overflow Join',
    targetPath: '/rooms/room_full',
    operation: 'update',
    payload: {
      currentParticipants: 5,
      participantIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Gender Condition Bypass',
    targetPath: '/rooms/female_only_room',
    operation: 'update',
    actorGender: 'male',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Non-Participant Settlement Snooping',
    targetPath: '/rooms/room_settled/settlement/info',
    operation: 'get',
    actorUid: 'outsider_uid',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Non-Host Settlement Forgery',
    targetPath: '/rooms/room_closed/settlement/info',
    operation: 'create',
    actorUid: 'passenger_not_host',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'ID Poisoning / Resource Exhaustion',
    targetPath: `/rooms/${'x'.repeat(512)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
];
