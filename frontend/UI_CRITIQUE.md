# JobPilot UI Critique

This is a critic pass focused on the current frontend experience after the recent redesign work.

## High-priority problems

1. The Jobs page still carries too many responsibilities in one view: search history, job selection, fit analysis, job description, notes, pipeline controls, and Job Coach. The current layout is improved, but the user still has to scan too many zones before knowing the next action.
2. AI Guidance is more readable than before, but it still mixes confidence, requirements, gaps, tailoring advice, and draft copy in one dense block. It needs progressive disclosure or a clearer "summary first, details second" pattern.
3. Pipeline cards expose too many controls at once. Status, priority, next step, and due date are all editable in every card, which makes the board feel administrative instead of focused.
4. Coach remains partly chat-centered. The strategy summaries are useful, but the chat composer still visually competes with the actual guidance.
5. The product has no strong empty-state journey. Empty states explain what is missing, but they do not consistently guide the user to the next best action.
6. Saved Searches are visually secondary but operationally important. They need clearer grouping, naming, and recency cues.
7. The Resume library lacks target-role editing and resume health signals, so users cannot quickly tell which resume is best for which job type.
8. The Settings page is too utilitarian. Profile data matters for AI grounding, but the UI does not explain why each field improves recommendations.

## Medium-priority problems

1. Some pages still rely on card grids where a grouped list would be calmer, especially Pipeline and Coach.
2. Page headers are visually cleaner, but the action hierarchy is not always obvious. Each page should have one primary action.
3. Mobile layouts are functional, but Jobs and Pipeline still become long stacked pages with repeated controls.
4. The sidebar product loop is useful conceptually, but it may add noise for returning users once they understand the app.
5. Loading skeletons exist, but route-level loading states are generic and do not mirror the final layout closely enough.
6. The app needs a clearer "data grounding" pattern that appears consistently near every AI-generated output.
7. The distinction between Career Coach and Job Coach is clearer in naming, but the UI can still blur them because both use chat panels.

## Theme direction applied

The green theme has been removed from the shared design tokens. The app now uses a blue, white, and black palette:

- Dark mode: black/navy surfaces with blue accents.
- Light mode: white/soft-blue surfaces with black text and blue actions.
- Accent states now use blue instead of green for navigation, focus, buttons, AI emphasis, avatars, and success messaging.

## Recommended next UI moves

1. Split the Jobs workspace into tabs or anchored sections: Overview, Fit, Description, Notes, Coach.
2. Convert Pipeline card editing into inline "quick edit" drawers instead of always-visible form fields.
3. Make Coach page primarily a weekly plan and pipeline review, with chat collapsed by default.
4. Add resume target-role metadata and show "best used for" on every resume card.
5. Add one consistent AI output header with: source data, last generated, refresh state, and confidence label.

## Resolution pass

Implemented in the follow-up UI pass:

- Jobs workspace now uses section tabs: Overview, Fit, Description, Notes, and Coach.
- Jobs Overview now presents the next action first, reducing scan cost.
- Job Coach is no longer shown beside every job section; it opens as its own workspace tab.
- Pipeline edit controls are collapsed behind an "Edit next step" disclosure.
- Career Coach chat is collapsed by default so strategy content leads the page.
- Resume cards now include local target-role metadata and readiness signals.
- Settings now explains why profile data matters for AI grounding.
- Sidebar workflow chips were removed to reduce persistent navigation noise.
