/**
 * Who may receive mail about a course.
 *
 * The subscription tables are protected by RLS, but the sender runs with the
 * service role, which bypasses every policy. A row created by hand (or by an
 * old build) would therefore still deliver mail from a course the student
 * never joined. This is the last gate before `sendGmail`, so it does not rely
 * on the tables being clean.
 *
 * Rules, in the same order as the database policy:
 *  - the teacher is never filtered;
 *  - an address that never registered here (the old Google flow) is kept;
 *  - a registered student only receives mail for their active course;
 *  - a closed registration receives nothing.
 */
export type RegistrationFacts = {
  /** Lowercased address. */
  email: string;
  /** course_id of the active registration, or null. */
  activeCourseId: string | null;
  /** Does any registration row exist for this address, whatever its status? */
  hasRegistration: boolean;
};

export function mayReceiveCourseMail(
  facts: RegistrationFacts,
  courseId: string,
  isTeacher: boolean,
): boolean {
  if (isTeacher) return true;
  if (!facts.hasRegistration) return true;
  return facts.activeCourseId === courseId;
}

/** Keep only the addresses allowed to receive mail about `courseId`. */
export function filterRecipients(
  emails: string[],
  factsByEmail: Map<string, RegistrationFacts>,
  courseId: string,
  isTeacher: boolean,
): string[] {
  return emails.filter((email) => {
    const facts = factsByEmail.get(email.toLowerCase());
    // No facts means the lookup failed; refusing is safer than mailing blind.
    if (!facts) return isTeacher;
    return mayReceiveCourseMail(facts, courseId, isTeacher);
  });
}
