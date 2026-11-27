import type { Database } from "@/integrations/supabase/types";

// Contract of the existing 0012_student_registration migration. This only
// describes queries; it does not apply the migration or create database objects.
type RegistrationRow = {
  id: string;
  email: string;
  course_id: string;
  full_name: string;
  status: string;
  created_at: string;
  ended_at: string | null;
  note: string;
};

type DeviceRow = {
  id: string;
  email: string;
  course_id: string | null;
  role: string;
  token_hash: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

type CodeRow = {
  id: string;
  email: string;
  course_id: string | null;
  role: string;
  full_name: string;
  code_hash: string;
  attempts: number;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

type TableContract<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type RegistrationDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      student_registrations: TableContract<RegistrationRow, "email" | "course_id">;
      student_devices: TableContract<DeviceRow, "email" | "token_hash">;
      student_codes: TableContract<CodeRow, "email" | "code_hash" | "expires_at">;
    };
    Functions: Database["public"]["Functions"] & {
      student_is_teacher_email: { Args: { _email: string }; Returns: boolean };
    };
  };
};