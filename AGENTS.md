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
- Send formatted forum broadcasts as multipart/alternative with escaped HTML and a plain-text fallback so email clients retain readable content.
- Render forum access in the shared course layout and style its CTA with a semantic Button variant, so new courses inherit it without stored content changes.
- Use the shared idempotent practical-task formatter for display, content imports and course-wide teacher formatting; render emphasis as safe React text, never raw HTML, to keep old and new tasks consistent without changing task IDs.
- Mount the shared Sonner Toaster once in the root layout so action feedback is visible across all pages.
