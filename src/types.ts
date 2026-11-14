import type { Timestamp } from 'firebase/firestore';

export const LOCATIONS = [
  '춘천 시외버스터미널',
  '춘천역',
  '남춘천역',
  '한림대 CLC',
  '한림대 본관',
  '한림대 사회경영관',
] as const;

export type LocationOption = (typeof LOCATIONS)[number];

export const CAMPUS_LOCATIONS: LocationOption[] = [
  '한림대 CLC',
  '한림대 본관',
  '한림대 사회경영관',
];

export const STATION_LOCATIONS: LocationOption[] = [
  '춘천 시외버스터미널',
  '춘천역',
  '남춘천역',
];

export const BANKS = [
  '카카오뱅크',
  '토스뱅크',
  '국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  '농협은행',
  '기업은행',
  '케이뱅크',
  'SC제일은행',
  '새마을금고',
  '우체국',
] as const;

export type Gender = 'male' | 'female';
export type GenderCondition = 'male' | 'female' | 'any';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type AuthProviderType = 'password' | 'google' | 'phone';
export type RoomStatus = 'open' | 'closed' | 'settled' | 'expired';
export type DepartureMinutes = 10 | 20 | 30;

export const ADMIN_EMAIL = 'un54208@gmail.com';
export const ADMIN_UID = 'MAAA6M66iMRXh42cyYrcdk9yYLB2';
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
export const USERNAME_EMAIL_DOMAIN = 'hallymtaxi.app';

export const LIMITS = {
  NAME_MAX: 40,
  USERNAME_MIN: 3,
  USERNAME_MAX: 40,
  PHONE_MIN: 9,
  PHONE_MAX: 20,
  BANK_MAX: 30,
  ACCOUNT_MIN: 4,
  ACCOUNT_MAX: 40,
  HOLDER_MAX: 40,
  IMAGE_DATA_URL_MAX: 700000,
  STORAGE_PATH_MAX: 200,
  REJECTION_REASON_MAX: 200,
} as const;

export interface UserProfile {
  uid: string;
  username: string;
  authProvider: AuthProviderType;
  email: string;
  name: string;
  phone: string;
  gender: Gender;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  status: UserStatus;
  rejectionReason?: string;
  agreedToPrivacy: boolean;
  hasStudentIdPhoto: boolean;
  studentIdPhotoPath?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StudentIdDocument {
  userId: string;
  imageDataUrl: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TaxiRoom {
  id: string;
  hostId: string;
  hostName: string;
  departure: LocationOption;
  destination: LocationOption;
  locationPhotoUrl: string;
  genderCondition: GenderCondition;
  maxParticipants: number;
  currentParticipants: number;
  participantIds: string[];
  participantNames: string[];
  departureMinutes: DepartureMinutes;
  departureAt: Timestamp;
  status: RoomStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RoomSettlement {
  roomId: string;
  hostId: string;
  totalFare: number;
  participantCount: number;
  perPersonAmount: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export function formatGenderLabel(gender: Gender): string {
  return gender === 'male' ? '남자' : '여자';
}

export function formatGenderConditionLabel(cond: GenderCondition): string {
  if (cond === 'male') return '남자만';
  if (cond === 'female') return '여자만';
  return '성별 상관없음';
}

export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

export function formatDepartureTime(ts: Timestamp | undefined | null, nowMs: number): {
  clockText: string;
  remainingText: string;
  isExpired: boolean;
} {
  if (!ts) {
    return { clockText: '--:--', remainingText: '확인 중', isExpired: false };
  }
  const date = ts.toDate();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const period = hours < 12 ? '오전' : '오후';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const clockText = `${period} ${displayHour}:${minutes} 출발`;

  const diffMs = date.getTime() - nowMs;
  if (diffMs <= 0) {
    return { clockText, remainingText: '출발 시간 지남', isExpired: true };
  }
  const diffMin = Math.ceil(diffMs / 60000);
  return { clockText, remainingText: `${diffMin}분 남음`, isExpired: false };
}
