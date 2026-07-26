# Programeta

Programeta is a responsive digital teaching planner designed to help teachers organise weekly and annual schedules, record classroom activities, and retrieve their teaching history by course and subject.

The application runs as a static web project and uses Firebase Authentication and Cloud Firestore for secure, user-specific data synchronisation across devices. It can be deployed to GitHub Pages and installed as a Progressive Web App.

## Table of contents

- [Project overview](#project-overview)
- [Core features](#core-features)
- [User experience](#user-experience)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Firebase configuration](#firebase-configuration)
- [Firestore security rules](#firestore-security-rules)
- [Local development](#local-development)
- [Deployment to GitHub Pages](#deployment-to-github-pages)
- [Data model](#data-model)
- [Activity behaviour](#activity-behaviour)
- [Library behaviour](#library-behaviour)
- [Settings and backups](#settings-and-backups)
- [Themes and assets](#themes-and-assets)
- [Progressive Web App support](#progressive-web-app-support)
- [Accessibility and responsive design](#accessibility-and-responsive-design)
- [Compatibility with earlier data](#compatibility-with-earlier-data)
- [Security and privacy notes](#security-and-privacy-notes)
- [Current project status](#current-project-status)
- [Recommended next steps](#recommended-next-steps)
- [Contributing](#contributing)
- [License](#license)

## Project overview

Programeta is built around two primary areas:

### Schedule

The Schedule module allows a teacher to:

- View the current teaching week.
- Move between previous and future weeks.
- Open the current week instantly.
- Create activities from an empty time slot or from the global new-activity action.
- Record occasional activities for one specific date.
- Create recurring weekly activities with optional start and end dates.
- Edit or remove existing activities.
- Replace or skip a recurring occurrence for one specific week.
- Review the academic year through a month-grouped annual view.

### Teaching library

The Teaching Library is generated directly from schedule data. It does not maintain a duplicate activity collection.

It allows a teacher to:

- Filter activities by course.
- Filter activities by subject.
- Search by activity title or notes.
- Restrict results to a date range.
- Filter by activity type.
- Print filtered results.
- Export filtered results as CSV.

Because the library derives its content from the schedule, schedule changes are reflected automatically.

## Core features

- Integrated sign-in page instead of a login popup.
- Email and password registration.
- Persistent authenticated sessions.
- Password reset by email.
- User-isolated Firestore data.
- Real-time schedule synchronisation.
- Weekly grid for desktop and larger screens.
- Agenda-oriented layout for mobile devices.
- Annual calendar grouped by month.
- Occasional and recurring activities.
- Recurrence exceptions and one-week replacements.
- Configurable academic-year dates.
- Configurable time slots.
- Configurable course and subject catalogues.
- Light, dark umbra, and system theme modes.
- Collapsible desktop sidebar.
- Mobile navigation drawer.
- CSV export and print-friendly output.
- JSON backup and restoration.
- Progressive Web App manifest and service worker.
- Backward-compatible activity field normalisation.

## User experience

Programeta separates the public authentication experience from the private application.

When no user is authenticated, only the access screen is visible. After authentication, the user enters the private application shell, which contains:

- A responsive header.
- A collapsible navigation sidebar.
- Schedule, Library, and Settings sections.
- Synchronisation feedback.
- Theme controls.
- User account controls.

The weekly schedule remains a grid on larger screens. On smaller screens, the interface switches to a more readable agenda-style presentation to avoid forcing users to navigate a compressed desktop table.

## Technology stack

- HTML5
- CSS3
- Native JavaScript modules
- Firebase Authentication
- Cloud Firestore
- Firebase JavaScript SDK loaded through browser ESM imports
- GitHub Pages
- Web App Manifest
- Service Worker

No framework, package manager, or build step is required.

## Project structure

```text
programeta/
├── assets/
│   ├── logo-icon.png
│   ├── logo-icon.svg
│   ├── logo-icon2.png
│   ├── logo-tipo.png
│   ├── logo-tipo-umbra.png
│   ├── logo-tipo-umbra.svg
│   └── logo-tipo-yellow.png
├── css/
│   └── style.css
├── data/
│   └── sample.json
├── js/
│   ├── app.firebase.js
│   ├── firebase.js
│   └── utils.js
├── .nojekyll
├── ABOUT.md
├── CHANGELOG.md
├── firestore.rules
├── index.html
├── LICENSE
├── manifest.webmanifest
├── README.md
└── service-worker.js
```

### Main files

`index.html`

Defines the authentication view, private application shell, navigation, weekly and annual views, library, settings, activity editor, confirmation dialogs, and accessibility structure.

`css/style.css`

Contains the complete visual system, responsive breakpoints, light and dark theme tokens, schedule layouts, drawer behaviour, mobile adaptations, print rules, and component styling.

`js/firebase.js`

Initialises Firebase and exposes authentication, profile, settings, activity, recurrence-exception, backup, and restore operations.

`js/app.firebase.js`

Controls application state, authentication flow, navigation, schedule rendering, activity editing, library filters, settings, themes, responsive behaviour, notifications, and synchronisation feedback.

`js/utils.js`

Provides shared utilities for ISO week calculations, academic-year ranges, date formatting, CSV output, text normalisation, and data conversion.

`firestore.rules`

Restricts every user document and nested document to the authenticated owner.

## Getting started

### Requirements

- A Firebase project.
- A GitHub account if deploying with GitHub Pages.
- A modern browser with JavaScript module support.
- A local HTTP server for local development.

### 1. Clone or download the repository

```bash
git clone https://github.com/your-username/programeta.git
cd programeta
```

Replace the URL with the actual repository URL.

### 2. Register a Firebase web application

In Firebase Console:

1. Create or open the Firebase project.
2. Open Project settings.
3. Register a Web application.
4. Copy the generated Firebase configuration.
5. Replace the `firebaseConfig` object in `js/firebase.js` if necessary.

### 3. Enable authentication

In Firebase Console:

1. Open Authentication.
2. Open Sign-in method.
3. Enable Email/Password.
4. Add the GitHub Pages hostname and any custom domain to the authorised domains list.

For example:

```text
polroviraguilar.github.io
```

### 4. Create Cloud Firestore

Create a Firestore database and choose the region that best matches the expected users.

Do not leave Firestore in unrestricted test mode for a public deployment.

### 5. Publish the security rules

Copy the contents of `firestore.rules` into:

```text
Firebase Console > Firestore Database > Rules
```

Then publish the rules.

## Firebase configuration

The web configuration is stored in `js/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};
```

A Firebase web API key is not a server secret. Application security depends on correctly configured Authentication, Firestore Security Rules, authorised domains, and optional protections such as Firebase App Check.

Never commit private service-account keys, administrative credentials, or server secrets to this repository.

## Firestore security rules

The included rules use the authenticated Firebase UID as the ownership boundary:

```text
users/{uid}
users/{uid}/{nested documents}
```

A signed-in user can only read and modify documents where the route UID matches the authenticated UID.

Always publish and test the included rules before exposing the application publicly.

## Local development

Do not open `index.html` directly with a `file://` URL. Browser modules, service workers, and Firebase behaviour require an HTTP origin.

Start a simple local server from the project root:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Alternative local servers are also valid, including the Visual Studio Code Live Server extension.

If authentication fails locally, add `localhost` to the Firebase authorised domains list.

## Deployment to GitHub Pages

### Repository settings

1. Push the project to the `main` branch.
2. Open the repository settings.
3. Open Pages.
4. Select `Deploy from a branch`.
5. Select `main` and `/ (root)`.
6. Save the configuration.

The project uses relative asset paths so it can run from a GitHub Pages project subdirectory.

A typical deployment URL is:

```text
https://your-username.github.io/programeta/
```

Add the final hostname to Firebase Authentication authorised domains.

### Example deployment commands

```bash
git add .
git commit -m "Release Programeta v2"
git push origin main
```

## Data model

### User profile

```text
users/{uid}
```

Example:

```json
{
  "displayName": "Alex Teacher",
  "email": "alex@example.com",
  "schemaVersion": 2
}
```

### User settings

```text
users/{uid}/settings/general
```

Settings may include:

- Academic-year start date.
- Academic-year end date.
- Time slots.
- Courses.
- Subjects.
- Theme preference.
- Schema version.

### Activities

```text
users/{uid}/horariSetmanal/{activityId}
```

Recurring activity example:

```json
{
  "dia": "dilluns",
  "hora": "09:00-10:00",
  "curs": "5è",
  "assignatura": "Música",
  "activitat": "Body percussion",
  "notes": "Coordination and pulse exercises.",
  "tipus": "permanent",
  "any": 0,
  "setmana": 0,
  "recurrenceStart": "2026-09-01",
  "recurrenceEnd": "2027-06-30",
  "schemaVersion": 2
}
```

Occasional activity example:

```json
{
  "dia": "dimarts",
  "hora": "11:30-12:30",
  "data": "2026-10-13",
  "curs": "4t",
  "assignatura": "Tutoria",
  "activitat": "Class assembly",
  "notes": "Review classroom agreements.",
  "tipus": "ocasional",
  "any": 2026,
  "setmana": 42,
  "schemaVersion": 2
}
```

## Activity behaviour

### Occasional activities

An occasional activity belongs to one exact date and one exact time slot.

### Recurring activities

A recurring activity repeats weekly on the selected weekday and time slot. Optional start and end dates limit the recurrence period.

### Replacements and exceptions

A recurring occurrence can be replaced for one specific week without changing the rest of the recurrence. It can also be skipped for one date while remaining active for all other weeks.

The application stores these changes in the same user-owned Firestore space and resolves them when generating weekly and library occurrences.

## Library behaviour

The Teaching Library does not duplicate schedule records. Instead, it expands the schedule into dated occurrences and applies the selected filters.

This provides a single source of truth:

- Editing a schedule activity changes the library result.
- Deleting an activity removes the corresponding library occurrences.
- Skipped recurrence dates are excluded.
- One-week replacements appear with their replacement content.

CSV exports and print output use the currently filtered result set.

## Settings and backups

### Academic year

Users can define the start and end dates used by the annual view and recurrence defaults.

### Time slots

Users can add, edit, remove, and reorder schedule time slots.

### Courses and subjects

Reusable course and subject lists reduce typing differences and improve filter consistency.

### Backup export

The application can export the authenticated user's profile, settings, and activities as JSON.

### Backup restoration

A valid Programeta JSON backup can be restored into the current authenticated account.

Backups should be stored securely because they may contain teaching notes and schedule information.

## Themes and assets

Programeta supports:

- Light theme.
- Dark umbra theme.
- System theme preference.

The original asset names are preserved:

```text
assets/logo-icon.png
assets/logo-icon.svg
assets/logo-icon2.png
assets/logo-tipo.png
assets/logo-tipo-umbra.png
assets/logo-tipo-umbra.svg
assets/logo-tipo-yellow.png
```

Recommended use:

- Light theme wordmark: `logo-tipo-umbra.png`
- Dark theme wordmark: `logo-tipo-yellow.png`
- Browser favicon: `logo-icon.png`
- Installable app icon: `logo-icon2.png`

Assets can be replaced without changing the application code as long as the filenames remain unchanged.

## Progressive Web App support

The repository includes:

- `manifest.webmanifest`
- `service-worker.js`
- Installable application icons
- Standalone display configuration
- Cached application-shell assets

The service worker improves shell availability, but Firestore data access and authentication still depend on Firebase and the user's connection state.

Service workers require HTTPS in production. GitHub Pages provides HTTPS automatically.

## Accessibility and responsive design

Programeta includes:

- Semantic page regions.
- Keyboard-accessible controls.
- Visible focus states.
- Labelled forms and dialogs.
- Responsive navigation.
- Collapsible desktop sidebar.
- Mobile navigation drawer.
- Mobile agenda presentation.
- Touch-friendly interactive targets.
- Reduced-motion support.
- Print-specific styles.

Accessibility should still be verified with keyboard testing, screen-reader testing, colour-contrast checks, and real-device testing before a commercial release.

## Compatibility with earlier data

Programeta v2 keeps the existing collection path:

```text
users/{uid}/horariSetmanal
```

The application normalises several earlier field names, including:

- `any` or `year`
- `setmana` or `week`
- `activitat`, `titol`, or `title`
- `notes`, `descripcio`, or `description`

Data previously created under anonymous authentication remains linked to the old anonymous UID. Creating a new email account does not transfer that data automatically.

A manual migration is required if anonymous-user data must be moved into a registered account.

## Security and privacy notes

Programeta stores user-specific teaching data in Cloud Firestore.

Before a public or commercial release, review the following:

- Firestore rules must be published and tested.
- Email verification should be enabled.
- Firebase App Check should be considered.
- A privacy policy should explain what data is stored and why.
- Users should be able to delete their account and associated data.
- Backup files should be treated as private data.
- Production monitoring and error reporting should avoid exposing personal information.
- Administrative access must never rely on client-side checks alone.

## Current project status

Programeta v2 is an advanced, production-oriented beta suitable for personal use and controlled pilot testing.

The current version provides a complete core workflow:

1. Register or sign in.
2. Configure the academic year, schedule slots, courses, and subjects.
3. Plan occasional or recurring activities.
4. Review the year by week and month.
5. Search the teaching history in the Library.
6. Print, export, back up, and restore data.

Additional legal, operational, billing, testing, and administrative work is recommended before offering it as a paid multi-user service.

## Recommended next steps

- Email verification.
- Self-service account deletion.
- Privacy policy and terms of service.
- Automated unit and integration tests.
- Firebase Emulator Suite tests for Firestore rules.
- Error monitoring.
- Firebase App Check.
- Subscription and billing management.
- Administrative support tools.
- Data-retention controls.
- Internationalisation.
- Offline conflict handling and clearer offline state feedback.

## Contributing

Contributions, bug reports, and improvement proposals are welcome.

Recommended workflow:

1. Fork the repository.
2. Create a focused feature branch.
3. Keep changes small and documented.
4. Test authentication, Firestore access, desktop layout, mobile layout, light theme, and dark theme.
5. Open a pull request with a clear description of the change.

Suggested branch naming:

```text
feature/activity-templates
fix/mobile-calendar-overflow
docs/firebase-setup
```

Do not include real user data, private Firebase administrative credentials, or service-account files in contributions.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for the complete terms.
