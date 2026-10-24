<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Store both course-community and knowledge-base URLs as optional course-content fields edited through CourseDialog; the existing shared content persistence keeps them consistent across devices and Google Doc refreshes.
- Store external-course recommendations as optional course-content entries and render them through the shared ExternalCourses section, so existing teacher-only persistence and Google Doc merges preserve them for every course.
- Send formatted forum broadcasts as multipart/alternative with escaped HTML and a plain-text fallback so email clients retain readable content.
- Render forum access in the shared course layout and style its CTA with a semantic Button variant, so new courses inherit it without stored content changes.
- Use the shared idempotent practical-task formatter for display, content imports and course-wide teacher formatting; render emphasis as safe React text, never raw HTML, to keep old and new tasks consistent without changing task IDs.
- Mount the shared Sonner Toaster once in the root layout so action feedback is visible across all pages.
- Practical results use latest-attempt status for public grade summaries and RLS-scoped personal/teacher pending counts; refresh on submission, grading, focus and polling so badges reflect ungraded tasks rather than attempt history.
- Derive practical button topics with a shared pure label helper and compute ordinals from course module/task order; store only optional button topics through shared content, never change task titles or submission IDs for presentation.
- Test-result notifications compare persisted viewed row keys rather than timestamp maxima; poll visible pages and refresh on focus so localized dates and background reads cannot hide new submissions.
- Share the Sheets result reader between test results and course summaries with a short data-only server cache to avoid duplicate upstream reads; never share pending I/O promises across Worker requests.
- Google Doc sync supports scopes (all / notes-only / practicals-only) in mergeDoc so teachers can refresh slide notes and practical-task texts independently without overwriting the other.
- Keep the course assistant in a shared per-course dialog with browser-only requests to the existing external service, explicit course-key mapping and abortable requests; this preserves course context and session history without introducing backend infrastructure or stale cross-course answers.
