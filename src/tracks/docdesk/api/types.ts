/**
 * Shared TypeScript contracts for the CampusOS API.
 * Field names, shapes and constraints follow the API cookbook exactly.
 * All timestamps from the API are UTC ISO strings (end in Z) — convert to IST for display.
 */

export type Role = 'admin' | 'student' | 'faculty' | 'office_staff';

/* ---------------- Auth / profiles ---------------- */

export interface BaseUserProfile {
  role: Role;
  team_id: string;
  name: string;
  email_id: string;
  phone_number: string;
  created_at: string;
  updated_at: string;
}

export interface StudentProfile extends BaseUserProfile {
  role: 'student';
  /** 5–20 letters/digits, stored uppercase */
  usn: string;
  dept: string;
}

export interface FacultyProfile extends BaseUserProfile {
  role: 'faculty';
  designation: string;
}

export interface OfficeStaffProfile extends BaseUserProfile {
  role: 'office_staff';
  /**
   * THE TWO MAGIC DEPARTMENTS (spell exactly; API matches case-insensitively
   * ignoring a trailing "dept"):
   *  - "Student Affairs"    → DocDesk powers (doc types, TAT, answers)
   *  - "Campus Maintenance" → FixIt powers (issue types, ticket status)
   * Any other dept = normal office staff (403 on those privileged actions).
   */
  dept: string;
  designation: string;
}

export type UserProfile = StudentProfile | FacultyProfile | OfficeStaffProfile;

export interface AdminProfile {
  role: 'admin';
  team_id: string;
  institution_name: string;
  name: string;
  email_id: string;
  phone_number: string;
}

export type AnyProfile = UserProfile | AdminProfile;

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  /** seconds — 43200 = 12h */
  expires_in: number;
  profile: AnyProfile;
}

/* ---------------- Paging ---------------- */

/** Every list endpoint returns this shape, newest first. */
export interface Page<T> {
  items: T[];
  count: number;
  /** Pass as ?cursor= for the next page; null = last page */
  next_cursor: string | null;
}

/* ---------------- Files ---------------- */

/**
 * A file reference as returned by the API.
 * ⚠️ `url` is a direct link that EXPIRES AFTER ~15 MINUTES.
 * Use it for <img> previews only — downloads must go through the
 * feature's download endpoint with the token (see utils/files.ts).
 */
export interface FileRef {
  file_id?: string;
  image_id?: string;
  attachment_id?: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  url: string;
}

/* ---------------- FindIt (lost & found) ---------------- */

export type FoundPostStatus = 'active' | 'archived';

export interface FoundPost {
  post_id: string; // FND-…
  title: string;
  description: string;
  location_found: string;
  found_on: string; // YYYY-MM-DD
  images: FileRef[];
  status: FoundPostStatus;
  resolved: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Office staff only, once resolved — others only see resolved: true */
  resolution?: PostResolution;
}

export type ClaimDecision = 'pending' | 'approved' | 'rejected';

export interface Claim {
  claim_id: string; // CLM-…
  post_id: string;
  claimant_email: string;
  claimant_name: string;
  claimant_phone_number: string;
  claimant_role: string;
  /** 10–1000 chars, proof of ownership */
  message: string;
  status: ClaimDecision;
  decision: ClaimDecision;
  created_at: string;
  updated_at: string;
}

export interface PostResolution {
  claim_id: string;
  claimant_email: string;
  note?: string | null;
  resolved_by: string;
  resolved_at: string;
  updated_at: string;
}

export interface LostRequest {
  request_id: string; // LST-…
  title: string;
  description?: string | null;
  location_lost?: string | null;
  lost_on?: string | null; // YYYY-MM-DD
  status: FoundPostStatus;
  created_by: string;
  created_by_role: string;
  created_by_name: string;
  created_by_phone_number: string;
  created_at: string;
  updated_at: string;
}

/* ---------------- Notice Hub ---------------- */

export type NoticeStatus = 'scheduled' | 'active' | 'archived';

export interface Notice {
  notice_id: string; // NTC-…
  title: string;
  body: string;
  status: NoticeStatus;
  pinned: boolean;
  /** date-time; send without timezone = IST, responses come back UTC */
  publish_at: string;
  /** left out when there is none */
  attachment?: FileRef | null;
  created_by: string;
  created_by_name: string;
  created_by_role: string;
  created_at: string;
  updated_at: string;
}

export interface DoubtResponse {
  message: string;
  responded_by: string;
  responded_by_name: string;
  responded_by_role: string;
  responded_at: string;
  updated_at: string;
}

export interface Doubt {
  doubt_id: string; // DBT-…
  notice_id: string;
  question: string;
  asked_by: string;
  asked_by_name: string;
  asked_by_role: string;
  answered: boolean;
  /** included once answered */
  response?: DoubtResponse | null;
  created_at: string;
  updated_at: string;
}

/* ---------------- DocDesk ---------------- */

export interface DocType {
  doc_type_id: string; // DTY-…
  name: string;
  description?: string | null;
  status: FoundPostStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type DocRequestStatus = 'pending' | 'answered' | 'acknowledged';

export interface Turnaround {
  expected_by: string; // YYYY-MM-DD, never before today
  note?: string | null;
  updated_by: string;
  updated_at: string;
}

export interface DocAnswer {
  message: string;
  answered_by: string;
  answered_by_name: string;
  answered_at: string;
  updated_at: string;
}

export interface DocRequest {
  request_id: string; // DRQ-…
  doc_type_id: string;
  doc_type_name: string;
  reason: string;
  status: DocRequestStatus;
  tat?: Turnaround | null;
  answer?: DocAnswer | null;
  /** document attached with the answer (PDF/DOCX ≤10MB) */
  document?: FileRef | null;
  /** filled-in form uploaded back by the requester */
  filled_form?: FileRef | null;
  acknowledged_at?: string | null;
  requested_by: string;
  requested_by_name: string;
  requested_by_role: string;
  requested_by_dept?: string | null;
  requested_by_phone_number: string;
  created_at: string;
  updated_at: string;
}

/* ---------------- FixIt ---------------- */

export interface IssueType {
  issue_type_id: string; // ITY-…
  name: string;
  description?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type TicketStatus = 'open' | 'resolved' | 'acknowledged';

export interface Ticket {
  ticket_id: string; // TKT-…
  issue_type_id: string;
  issue_type_name?: string;
  title: string;
  description: string;
  photo?: FileRef | null;
  status: TicketStatus;
  /** note attached to the latest status update (reporter sees it) */
  status_note?: string | null;
  tat?: Turnaround | null;
  /** true when expected_by passed while still open */
  overdue?: boolean;
  reporter_email: string;
  reporter_name?: string;
  reporter_role?: string;
  reporter_phone_number?: string;
  acknowledged_at?: string | null;
  created_at: string;
  updated_at: string;
}

/* ---------------- Admin: user management ---------------- */

export interface CreateStudentInput {
  role: 'student';
  name: string;
  usn: string;
  dept: string;
  email_id: string;
  phone_number: string;
}

export interface CreateFacultyInput {
  role: 'faculty';
  name: string;
  designation: string;
  email_id: string;
  phone_number: string;
}

export interface CreateOfficeStaffInput {
  role: 'office_staff';
  name: string;
  /** use exactly "Student Affairs" / "Campus Maintenance" for the privileged depts */
  dept: string;
  designation: string;
  email_id: string;
  phone_number: string;
}

export type CreateUserInput = CreateStudentInput | CreateFacultyInput | CreateOfficeStaffInput;

/** Admin user-list entries and create responses include the login OTP. */
export type UserWithOtp = UserProfile & { otp: string; created_by: string };

/** PATCH body — only fields that belong to the user's role, role itself can't change. */
export interface UpdateUserInput {
  name?: string;
  usn?: string;
  dept?: string;
  designation?: string;
  email_id?: string;
  phone_number?: string;
}
