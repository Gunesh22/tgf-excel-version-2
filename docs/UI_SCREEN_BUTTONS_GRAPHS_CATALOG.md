# Comprehensive Screen-by-Screen UI Components & AI Design Prompts Catalog

> **Target Application:** TGF Call Center & CRM Web Application (`tgf excel version 2`)  
> **Purpose:** Exhaustive reference catalog of all Buttons (including conditional triggers, placement, and visibility rules), Dropdowns, Modals, Graphs, and Form Controls across every screen. Includes copy-pasteable **AI UI Generation Prompts** for stitching and rebuilding a modern, premium UI/UX.

---

## 📌 Quick Screen Index

1. [Global Header Bar & Application Navigation](#1-global-header-bar--application-navigation)
2. [Desktop Attender Workspace (`AttenderView.jsx`)](#2-desktop-attender-workspace-attenderviewjsx)
3. [Lead Edit Modal & Drawer (`EditModal.jsx`)](#3-lead-edit-modal--drawer-editmodaljsx)
4. [Mobile Attender View & Drawer (`MobileAttenderView.jsx`)](#4-mobile-attender-view--drawer-mobileattenderviewjsx)
5. [My Performance Dashboard - Attender Level (`MyPerformanceDashboard.jsx`)](#5-my-performance-dashboard---attender-level-myperformancedashboardjsx)
6. [Admin Panel - Global Navigation & Header (`AdminPanel.jsx`)](#6-admin-panel---global-navigation--header-adminpaneljsx)
7. [Admin Panel - Analytics & Overview Dashboard (`DashboardTab.jsx`)](#7-admin-panel---analytics--overview-dashboard-dashboardtabjsx)
8. [Admin Panel - All Attenders Master Sheet (`AllAttendersSheetTab.jsx`)](#8-admin-panel---all-attenders-master-sheet-allattenderssheettabjsx)
9. [Admin Panel - Attenders Management (`AttendersTab.jsx`)](#9-admin-panel---attenders-management-attenderstabjsx)
10. [Admin Panel - Programs / Shivirs Management (`ProgramsTab.jsx`)](#10-admin-panel---programs--shivirs-management-programstabjsx)
11. [Admin Panel - Monthly Reports & Performance (`MonthlyReportTab.jsx`)](#11-admin-panel---monthly-reports--performance-monthlyreporttabjsx)
12. [Admin Panel - Abhivyakti Event Registrations (`AbhivyaktiTab.jsx`)](#12-admin-panel---abhivyakti-event-registrations-abhivyaktitabjsx)
13. [Admin Panel - Settings & System Configurations (`SettingsTab.jsx`)](#13-admin-panel---settings--system-configurations-settingstabjsx)
14. [Contact / Excel Import Wizard (`ImportContacts.jsx`)](#14-contact--excel-import-wizard-importcontactsjsx)
15. [Global Dashboard Visual Analytics Views (`src/page/dashboard/components`)](#15-global-dashboard-visual-analytics-views-srcpagedashboardcomponents)
16. [Shared Overlays & Micro-Components](#16-shared-overlays--micro-components)

---

## 1. Global Header Bar & Application Navigation

**File Path:** `src/page/call-center/CallCenterApp.jsx`

### 🔘 Buttons Catalog

| Button Name & Icon                           | Visual Variant / Style                       | WHEN It Appears (Trigger Condition)                            | WHERE It Appears (Exact Location)         | Purpose & Action                                                                              |
| :------------------------------------------- | :------------------------------------------- | :------------------------------------------------------------- | :---------------------------------------- | :-------------------------------------------------------------------------------------------- |
| **"Switch View (Admin / Attender)"**         | Indigo/Slate Toggle Badge                    | Always visible for Admin users; Hidden for standard Attenders. | Top-right of top navigation header.       | Toggles active screen mode between Call Center Attender workspace and Admin Governance Panel. |
| **"Refresh / Sync Data"** (`RefreshCw`)      | Glassmorphic Icon Button with spin animation | Always visible on desktop & mobile navigation header.          | Top-right header, next to view switcher.  | Triggers immediate re-fetch and re-sync of Firestore cache and contacts list.                 |
| **"Celebration Feed Badge"** (`PartyPopper`) | Floating Pill with animated badge counter    | Appears when team conversions occur in real-time.              | Top header bar, adjacent to refresh icon. | Opens the real-time celebration modal showing team conversion achievements.                   |
| **"New Lead Entry (+)"** (`Plus`)            | Emerald Green Solid Pill Button              | Always visible on header for quick lead creation.              | Top-right header action bar.              | Opens `EditModal` initialized with blank contact fields for manual lead creation.             |
| **"Active Attender Selector"** (`UserCheck`) | White Dropdown Pill with Chevron             | Always visible in Header Bar.                                  | Top-left of header bar next to app logo.  | Opens dropdown to switch the logged-in attender session identity.                             |
| **"Logout / Session Exit"** (`LogOut`)       | Soft Red Outlined Icon Button                | Appears when user clicks Attender profile avatar or dropdown.  | Inside Attender Profile dropdown menu.    | Logs out active session and returns to login gate.                                            |

### 🔽 Dropdowns & Selectors

- **Active Attender Session Switcher**: List of all registered attenders in system.

### 🤖 AI UI Stitcher Prompt (For v0 / Stitch / Figma AI / Bolt)

```text
Design a high-end, responsive Web App Header Bar for a CRM Call Center application.
- Theme: Modern dark/light glassmorphic navbar with rounded corners (rounded-2xl) and subtle border glow.
- Left Section: App Logo ("TGF Call Center CRM") + Active Attender Profile Selector dropdown button with live status indicator (green dot).
- Center Section: Quick search bar with magnifying glass icon and instant clear button (X).
- Right Section:
  1. "+ Add Lead" primary emerald green button with Plus icon.
  2. "Celebration Feed" notification pill with animated party icon and counter badge (shows when conversions happen).
  3. "Refresh Sync" circular icon button (animates on click).
  4. "Admin / Attender View" dual-state pill toggle switch (appears only for admin role).
  5. User Avatar button that opens a drop-down menu with "Profile Settings" and "Logout" (red text).
```

---

## 2. Desktop Attender Workspace (`AttenderView.jsx`)

**Components:** `AttenderFilters.jsx`, `ContactTable.jsx`, `ColumnsSelector.jsx`, `Pagination.jsx`, `EditModal.jsx`

### 🔘 Buttons Catalog

| Button Name & Icon                                         | Visual Variant / Style       | WHEN It Appears (Trigger Condition)                                    | WHERE It Appears (Exact Location)              | Purpose & Action                                                                 |
| :--------------------------------------------------------- | :--------------------------- | :--------------------------------------------------------------------- | :--------------------------------------------- | :------------------------------------------------------------------------------- |
| **"Clear All Filters"** (`X`)                              | Red/Slate Outlined Pill      | Appears when at least 1 filter, search query, or date range is active. | Top-right of `AttenderFilters` toolbar.        | Clears all active filters, tags, statuses, and search text back to default.      |
| **"Today's Follow-ups"** (`Calendar`)                      | Emerald Green Pill Badge     | Always visible in filter toolbar.                                      | Quick Filter Bar above contact table.          | Applies one-click filter for contacts with callback date = today.                |
| **"Hot Leads / Interested"** (`Flame`)                     | Amber/Orange Pill Badge      | Always visible in filter toolbar.                                      | Quick Filter Bar above contact table.          | One-click filter for high-priority interested leads (`status === 'Interested'`). |
| **"Pending Leads"** (`Clock`)                              | Blue Pill Badge              | Always visible in filter toolbar.                                      | Quick Filter Bar above contact table.          | One-click filter for leads needing initial contact (`status === 'Pending'`).     |
| **"Expand / Collapse Filters"** (`Filter` / `ChevronDown`) | Slate Soft Button            | Always visible on desktop & tablet screens.                            | Right side of quick filter presets.            | Toggles secondary filter row (State/City, Source, Called For, Date Range).       |
| **"Select All Checkbox"**                                  | Table Header Checkbox        | Always visible in table header row.                                    | First column header of `ContactTable`.         | Toggles selection of all visible lead rows for bulk operations.                  |
| **"Bulk Reassign Leads"** (`Users`)                        | Solid Indigo Action Button   | Appears ONLY when 1 or more row checkboxes are selected.               | Floating Bulk Actions Bar above table header.  | Opens Bulk Reassignment Modal to reassign selected leads to another attender.    |
| **"Bulk Delete Leads"** (`Trash2`)                         | Solid Red Action Button      | Appears ONLY when rows are selected AND user has Admin role.           | Floating Bulk Actions Bar next to Reassign.    | Deletes selected leads with confirmation prompt.                                 |
| **"Export Filtered to Excel"** (`Download`)                | Emerald Green Button         | Always visible; disabled if table has 0 rows.                          | Table toolbar right action cluster.            | Exports visible/filtered table rows to an `.xlsx` file.                          |
| **"Manage Columns"** (`Columns`)                           | White Border Dropdown Button | Always visible in table header bar.                                    | Table toolbar next to Export button.           | Opens `ColumnsSelector` popover to toggle table column visibility.               |
| **"Refresh Table Data"** (`RotateCw`)                      | Icon Button                  | Always visible in table header bar.                                    | Table toolbar right cluster.                   | Re-queries active contacts list from Firestore cache.                            |
| **"Row Edit Lead"** (`Pencil`)                             | Blue Circle Icon Button      | Always visible on every table row.                                     | Action column (right-most column) of each row. | Opens main Lead Edit Modal (`EditModal.jsx`) for selected contact.               |
| **"Row Direct Call"** (`Phone`)                            | Green Circle Icon Button     | Always visible on every table row.                                     | Action column and next to Phone Number cell.   | Triggers browser tel: dialer or softphone connection.                            |
| **"Row Direct WhatsApp"** (`MessageSquare`)                | Emerald Circle Icon Button   | Always visible on every table row.                                     | Action column and next to Mobile Number cell.  | Opens WhatsApp message drawer with template selection.                           |
| **"Quick Status Change Badge"**                            | Color-coded Dropdown Pill    | Always visible on every table row.                                     | Status column cell of each row.                | Opens quick-status dropdown without opening full edit modal.                     |
| **"Pagination First Page (`<<`)"**                         | Icon Button                  | Visible when current page > 1.                                         | Bottom-right pagination bar.                   | Navigates to first page of results.                                              |
| **"Pagination Prev (`<`)"**                                | Icon Button                  | Visible when current page > 1.                                         | Bottom-right pagination bar.                   | Navigates to previous page.                                                      |
| **"Pagination Page Numbers (1,2,3)"**                      | Numbered Pill Buttons        | Always visible if total pages > 1.                                     | Bottom-right pagination bar.                   | Jumps directly to selected page.                                                 |
| **"Pagination Next (`>`)"**                                | Icon Button                  | Visible when current page < total pages.                               | Bottom-right pagination bar.                   | Navigates to next page.                                                          |
| **"Pagination Last Page (`>>`)"**                          | Icon Button                  | Visible when current page < total pages.                               | Bottom-right pagination bar.                   | Navigates to last page of results.                                               |

### 🔽 Dropdowns & Selectors

- **Shivir / Program Searchable Filter**: Filter contacts by Shivir tag.
- **Attender Filter Dropdown**: Filter by assigned attender or unassigned.
- **General Status Filter Multi-Select**: Filter by canonical status.
- **Specific Outcome Filter Multi-Select**: Detailed outcome sub-statuses.
- **Called For Filter Multi-Select**: Requested event/shivir filter.
- **State & City Autofill Selectors**: Geographic filtering.
- **Rows Per Page Dropdown**: Choose 10, 25, 50, 100, 250 rows per view.

---

### 🤖 Ultra-Detailed Master AI Prompt for Desktop Attender Workspace (`AttenderView.jsx`)

```text
Design a state-of-the-art, high-density Call Center Attender Workspace & Lead Management UI.

1. Overall Aesthetics & Theme:
   - Palette: Deep Slate/Zinc dark background (#0f172a or #1e293b) with vibrant neon accents (Emerald #10b981 for conversions/calls, Indigo #6366f1 for active filters, Amber #f59e0b for hot leads, Rose #ef4444 for alerts/deletions).
   - Layout: Full-height viewport container with glassmorphic cards (backdrop-blur-md bg-white/10 or bg-slate-900/80 border border-slate-800 rounded-3xl shadow-2xl).

2. Top KPI Metrics Ribbon (4 Cards Grid):
   - Card 1: "Total Assigned Leads" (Count badge, Blue gradient icon background).
   - Card 2: "Today's Callbacks Due" (Count badge, Amber/Yellow glow, Warning indicator).
   - Card 3: "Hot Leads / Interested" (Count badge, Flame icon, Orange accent).
   - Card 4: "Pending Initial Calls" (Count badge, Cyan clock icon).

3. Search & Filter Bar (`AttenderFilters.jsx`):
   - Main Row:
     - Search Input: Glassmorphic text input with magnifying glass search icon and instant 'X' clear button.
     - Quick Preset Pill Buttons:
       - "📅 Today's Followups" (Emerald green active state button).
       - "🔥 Hot Leads" (Flame icon, Amber active button).
       - "🕒 Pending Leads" (Blue active button).
       - "❌ Clear All Filters [N]" (Red pill button with active filter counter badge; appears ONLY when filters/dates are active).
     - Right: "Filter Drawer Toggle" button with ChevronDown icon.
   - Secondary Collapsible Filter Drawer:
     - Multi-Select Searchable Dropdowns: [🌟 Shivir / Program Tag], [👥 Attender], [📊 General Status], [🎯 Specific Outcome Status], [📞 Called For], [📍 State & City Autofill].
     - Date Range Picker: "Date From" to "Date To" with quick preset buttons for [Today] and [This Month].

4. Data Table Toolbar & Floating Bulk Actions:
   - Top-Left: Row Counter ("Showing 1-25 of 450 Leads") + Row Checkbox Count ("3 Selected").
   - Floating Bulk Action Bar (slides down dynamically when 1 or more row checkboxes are checked):
     - Indigo "Bulk Reassign" button with Users icon.
     - Red "Bulk Delete" button with Trash icon (visible to admins).
     - Gray "Deselect All" button.
   - Top-Right Action Buttons:
     - "Manage Columns" white bordered dropdown button with Columns icon (opens interactive column checkbox popover `ColumnsSelector.jsx`).
     - "Export to Excel" Emerald Green solid button with Download icon.
     - "Refresh Data" circular icon button (animates on click).

5. High-Density Lead Data Table (`ContactTable.jsx`):
   - Zebra-striped glass table with sticky header.
   - Column Headers: [ ] Select Checkbox | Lead Name & Khoji Tag | Primary Phone & Mobile | Shivir Program | Status Badge | Called For | Scheduled Callback Date/Time | Actions.
   - Row Cells & Inline Buttons:
     - Name Cell: Bold Lead Name + "Khoji: Yes/No" pill badge.
     - Phone Cell: Primary Phone + Copy icon button + GHL CRM Search indicator.
     - Status Cell: Clickable Color-Coded Dropdown Pill (Pending = Blue, Interested = Purple, Reg.Done = Green, Call Back = Amber, Not Connected = Gray, Query = Pink).
     - Callback Cell: Date & Time text (shows Red "OVERDUE" pulsing badge if callback date <= today).
     - Right Action Column (3 Circular Micro-Buttons):
       - Green Circle Button with Phone icon (`CallButton.jsx`): Direct call dialer trigger.
       - Emerald Circle Button with WhatsApp icon (`WhatsAppButton.jsx`): Opens template picker drawer.
       - Blue Circle Button with Pencil icon: Opens main `EditModal.jsx`.

6. Bottom Pagination Toolbar (`Pagination.jsx`):
   - Left: "Rows per page:" Dropdown selector (10, 25, 50, 100, 250).
   - Right: Numbered Page Navigation Pills: `<<` First | `<` Prev | `1` [2] `3` `4` | `>` Next | `>>` Last.

7. Integrated Lead Edit Slide-Over Modal (`EditModal.jsx`):
   - Appears centered or as a slide-over panel when Edit Pencil button is clicked.
   - Modal Header Bar:
     - Left: `< Prev Lead` navigation button + Lead Name & ID.
     - Center: Quick Action Strip -> Green "Call Now", Emerald "WhatsApp Direct" (with template dropdown arrow), Cyan "Send SMS", Copy Phone button.
     - Right: Duplicate Warning Pill Badge (if duplicate exists) + `> Next Lead` navigation button + Close `X` button.
   - Duplicate Alert Banner (shows conditionally if duplicate phone is typed): Amber background bar with text "Duplicate contact found in database" + Purple "Autofill from Duplicate" button.
   - 3 Segmented Tabs:
     - Tab 1 `[Call Form Entry]`: General Status Dropdown, Specific Outcome Dropdown, Called For Dropdown, Source Dropdown, Shivir Program Tag selector (with `+ Create New Tag` button), Scheduled Callback Date/Time Pickers, Remarks multiline textarea.
     - Tab 2 `[Profile Info]`: Address, Email, Occupation, Gender, State/City autofill input, Custom Fields list with `+ Add Custom Field` text button.
     - Tab 3 `[History & Audit]`: Scrollable vertical timeline of all past call attempts, remarks, and attender updates + "View Audit Logs" button.
   - Modal Footer Action Cluster:
     - Left: Red "Delete Lead" button + Yellow "Undo Changes" button.
     - Right: Gray "Cancel" button + Primary Blue "Save & Close" button + Primary Indigo "Save & Next" button (with right arrow icon).
```

---

## 3. Lead Edit Modal & Drawer (`EditModal.jsx`)

**Components:** `SearchableDropdown.jsx`, `CityAutofillInput.jsx`, `CallEntryTab.jsx`, `ProfileDetailsTab.jsx`, `EditHistoryModal.jsx`, `DuplicateBanner.jsx`

### 🔘 Buttons Catalog

| Button Name & Icon                               | Visual Variant / Style          | WHEN It Appears (Trigger Condition)                                        | WHERE It Appears (Exact Location)                           | Purpose & Action                                                               |
| :----------------------------------------------- | :------------------------------ | :------------------------------------------------------------------------- | :---------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **"Modal Close (X)"**                            | Top-Right Icon Button           | Always visible in Edit Modal header.                                       | Top-right corner of modal header.                           | Closes modal without saving uncommitted changes.                               |
| **"Previous Lead"** (`ChevronLeft`)              | Soft Gray Navigation Button     | Appears when editing from table list and previous row exists.              | Top-left of modal header bar.                               | Saves current lead and automatically opens previous lead record.               |
| **"Next Lead"** (`ChevronRight`)                 | Soft Gray Navigation Button     | Appears when editing from table list and next row exists.                  | Top-right of modal header bar (left of X).                  | Saves current lead and automatically opens next lead record.                   |
| **"Direct Phone Call"** (`PhoneCall`)            | Bright Green Solid Button       | Always visible in quick action bar.                                        | Header quick-action bar below contact name.                 | Initiates phone dialer and logs call start timestamp.                          |
| **"Direct WhatsApp"** (`MessageSquare`)          | Emerald Green Solid Button      | Always visible in quick action bar.                                        | Header quick-action bar next to Phone Call.                 | Opens WhatsApp template selector popover.                                      |
| **"Send SMS Intent"** (`MessageCircle`)          | Cyan Solid Action Button        | Always visible in quick action bar.                                        | Header quick-action bar next to WhatsApp button.            | Opens default SMS application on mobile/desktop.                               |
| **"Copy Phone Number"** (`Copy`)                 | Gray Icon Button                | Always visible next to phone display.                                      | Next to Primary Phone input field.                          | Copies phone number to system clipboard.                                       |
| **"Search CRM / Fetch GHL"** (`Search`)          | Amber/Orange Button             | Appears when entering a new phone number that has no local match.          | Inside Phone input box as inline action.                    | Queries GoHighLevel CRM API to autofill lead details.                          |
| **"Tab Switcher: Call Form"** (`PhoneIncoming`)  | Segmented Tab Button            | Always visible in modal tab bar.                                           | Top navigation tab row of Edit Modal.                       | Displays Call Log entry, Status selector, Remarks, and Follow-up pickers.      |
| **"Tab Switcher: Profile Info"** (`User`)        | Segmented Tab Button            | Always visible in modal tab bar.                                           | Top navigation tab row of Edit Modal.                       | Displays contact address, email, custom fields, and demographic details.       |
| **"Tab Switcher: History Log"** (`Clock`)        | Segmented Tab Button            | Always visible in modal tab bar.                                           | Top navigation tab row of Edit Modal.                       | Displays scrollable timeline of all past calls, remarks, and attender updates. |
| **"View Audit History"** (`FileText`)            | Indigo Outlined Button          | Visible in History tab or footer.                                          | Top-right of History Log tab.                               | Opens `EditHistoryModal` showing exact field modification audit logs.          |
| **"+ Create New Program Tag"** (`Plus`)          | Small Blue Pill Button          | Appears inside Shivir/Program dropdown search menu when no match is found. | Inside `SearchableDropdown` for Shivir Tag.                 | Dynamically creates a new Shivir program tag in database.                      |
| **"+ Add Custom Field"** (`Plus`)                | Blue Text Button with Plus icon | Visible inside Profile Info tab.                                           | Bottom of custom profile fields list.                       | Appends a new key-value pair field input to contact profile.                   |
| **"Autofill from Duplicate"** (`Sparkles`)       | Purple Solid Action Button      | Appears inside `DuplicateBanner` when duplicate phone/mobile is detected.  | Inside yellow/red Duplicate Warning Banner at top of modal. | Auto-populates empty fields using data from existing duplicate record.         |
| **"Dismiss Duplicate Warning"** (`X`)            | Soft Gray Button                | Appears inside Duplicate Banner.                                           | Top-right of Duplicate Warning Banner.                      | Dismisses duplicate banner for current editing session.                        |
| **"Clear Follow-up Date"** (`X`)                 | Small Red Icon Button           | Appears when a Follow-up callback date is selected.                        | Inside Follow-up Date picker input.                         | Clears scheduled callback date and time.                                       |
| **"Undo Unsaved Changes"** (`RotateCcw`)         | Amber Outlined Button           | Appears when status/form fields are modified but unsaved.                  | Modal footer left corner.                                   | Resets modal form state back to last saved row values.                         |
| **"Save & Close"** (`Save`)                      | Primary Blue Solid Button       | Always visible in modal footer.                                            | Bottom-right footer action cluster.                         | Persists updates to Firebase and closes edit modal.                            |
| **"Save & Next"** (`ArrowRight`)                 | Primary Indigo Solid Button     | Always visible in modal footer when navigating a batch list.               | Bottom-right footer action cluster (next to Save & Close).  | Persists updates and automatically loads next lead in queue.                   |
| **"Mark Complete / Close Lead"** (`CheckCircle`) | Emerald Green Button            | Visible when lead is fully converted (`Reg.Done`) or resolved.             | Modal footer action cluster.                                | Sets lead status to completed and archives from active calling list.           |
| **"Delete Lead Record"** (`Trash2`)              | Red Border Outlined Button      | Visible if user has delete permissions.                                    | Modal footer bottom-left corner.                            | Opens deletion confirmation prompt to permanently remove lead.                 |

---

## 4. Mobile Attender View & Drawer (`MobileAttenderView.jsx`)

**Components:** `MobileEditModal.jsx`

### 🔘 Buttons Catalog

| Button Name & Icon                                 | Visual Variant / Style          | WHEN It Appears (Trigger Condition)          | WHERE It Appears (Exact Location)          | Purpose & Action                                               |
| :------------------------------------------------- | :------------------------------ | :------------------------------------------- | :----------------------------------------- | :------------------------------------------------------------- |
| **Mobile Menu / Filter Drawer** (`Sliders`)        | Icon Button                     | Always visible on mobile top header.         | Top-right of mobile header.                | Opens slide-over mobile filter drawer.                         |
| **Mobile Refresh Sync** (`RefreshCw`)              | Icon Button                     | Always visible on mobile header.             | Top-right next to filter drawer.           | Re-syncs leads on touch devices.                               |
| **Mobile Bottom Tab: Home/Leads** (`Home`)         | Navigation Touch Pill           | Always visible in sticky bottom navigation.  | Bottom navigation bar (1st tab).           | Switches mobile screen to active leads list.                   |
| **Mobile Bottom Tab: Followups** (`Calendar`)      | Navigation Touch Pill           | Always visible in sticky bottom navigation.  | Bottom navigation bar (2nd tab).           | Displays today's scheduled callback list.                      |
| **Mobile Bottom Tab: Stats** (`BarChart2`)         | Navigation Touch Pill           | Always visible in sticky bottom navigation.  | Bottom navigation bar (3rd tab).           | Displays quick daily performance summary.                      |
| **Mobile Bottom Tab: Settings** (`Settings`)       | Navigation Touch Pill           | Always visible in sticky bottom navigation.  | Bottom navigation bar (4th tab).           | Opens mobile quick settings.                                   |
| **Mobile Card Action: Call** (`Phone`)             | Large Green Circle Button       | Always visible on every mobile lead card.    | Right side of mobile contact card.         | Triggers one-tap native mobile phone dialer.                   |
| **Mobile Card Action: WhatsApp** (`MessageCircle`) | Large Emerald Circle Button     | Always visible on every mobile lead card.    | Right side of mobile card next to Call.    | Opens native WhatsApp chat with pre-filled lead template.      |
| **Mobile Card Tap**                                | Full Card Touch Area            | Always visible on every mobile lead card.    | Entire surface of lead card.               | Opens `MobileEditModal` bottom sheet drawer.                   |
| **Mobile Drawer Drag Bar / Close**                 | Swipe Bar / Icon Button         | Always visible at top of Mobile Edit Drawer. | Top center of bottom sheet drawer.         | Pull down or tap to dismiss mobile edit drawer.                |
| **Mobile Quick Save & Next**                       | Full-width Indigo Sticky Button | Visible at bottom of `MobileEditModal`.      | Bottom sticky action bar of mobile drawer. | Saves mobile call entry and automatically swipes to next card. |

### 🤖 AI UI Stitcher Prompt (For v0 / Stitch / Figma AI / Bolt)

```text
Design a Mobile-First Call Center Attender UI for smartphones (iOS/Android).
- Top Bar: App Title + Search Bar + Refresh Icon + Filter Drawer Icon.
- Content: Scrollable stack of touchable Lead Cards.
  - Card Details: Name, Shivir Tag, Last Status (color pill), Scheduled Callback time.
  - Card Action Area: Large touch targets -> Green circular Phone Dial button + Emerald circular WhatsApp button.
- Bottom Sheet Drawer (opens on card tap):
  - Touch-friendly Call Form: Status selector pills, Called For picker, Large multi-line Remarks textarea, Date/Time pickers.
  - Sticky Bottom Bar: Full-width Indigo "Save & Next" button + Green "Call Lead Now" button.
- App Navigation: Fixed Bottom Tab Bar with icons for Home/Leads, Today's Followups, Quick Stats, Settings.
```

---

## 5. My Performance Dashboard - Attender Level (`MyPerformanceDashboard.jsx`)

### 🔘 Buttons Catalog

| Button Name & Icon                              | Visual Variant / Style      | WHEN It Appears (Trigger Condition) | WHERE It Appears (Exact Location)     | Purpose & Action                                           |
| :---------------------------------------------- | :-------------------------- | :---------------------------------- | :------------------------------------ | :--------------------------------------------------------- |
| **"Date Filter: Today"**                        | Active/Inactive Pill Button | Always visible in date filter row.  | Header filter bar of performance tab. | Filters personal metrics to today's call logs.             |
| **"Date Filter: Yesterday"**                    | Active/Inactive Pill Button | Always visible in date filter row.  | Header filter bar of performance tab. | Filters metrics to yesterday's performance.                |
| **"Date Filter: This Week"**                    | Active/Inactive Pill Button | Always visible in date filter row.  | Header filter bar of performance tab. | Aggregates calls made during the current week.             |
| **"Date Filter: This Month"**                   | Active/Inactive Pill Button | Always visible in date filter row.  | Header filter bar of performance tab. | Aggregates calls made during current month.                |
| **"Date Filter: Custom Range"**                 | Active/Inactive Pill Button | Always visible in date filter row.  | Header filter bar of performance tab. | Opens Date-From and Date-To calendar inputs.               |
| **"Refresh Metrics"** (`RefreshCw`)             | Soft Icon Button            | Always visible in header.           | Top-right of dashboard view.          | Re-calculates personal metrics from server.                |
| **"Export My Performance Report"** (`Download`) | Emerald Green Button        | Visible when metric logs exist.     | Top-right next to Refresh button.     | Exports personal call statistics and conversions to Excel. |

### 📊 Graphs & Charts (Recharts)

| Chart Name                      | Chart Type            | Data Visualized                                                             |
| :------------------------------ | :-------------------- | :-------------------------------------------------------------------------- |
| **Daily Call Volume Breakdown** | `BarChart`            | Number of calls completed per day over selected period.                     |
| **Call Outcome Breakdown**      | `PieChart` / `Donut`  | Share of Interested, Reg.Done, Call Back, Not Connected.                    |
| **Conversion Rate by Shivir**   | Horizontal `BarChart` | Registrations achieved per Shivir / Called For category.                    |
| **Personal Metric Cards**       | 4-Card Summary Grid   | Total Calls, Conversions (Reg.Done), Pending Follow-ups, Average Talk Time. |

---

## 6. Admin Panel - Global Navigation & Header (`AdminPanel.jsx`)

### 🔘 Buttons Catalog

| Button Name & Icon                            | Visual Variant / Style        | WHEN It Appears (Trigger Condition) | WHERE It Appears (Exact Location)           | Purpose & Action                                         |
| :-------------------------------------------- | :---------------------------- | :---------------------------------- | :------------------------------------------ | :------------------------------------------------------- |
| **"Tab: Dashboard"** (`LayoutDashboard`)      | Top Navigation Pill Tab       | Always visible for Admin role.      | Main Admin Header Navigation bar (1st tab). | Displays central analytics overview and leaderboards.    |
| **"Tab: All Attenders Sheet"** (`Table`)      | Top Navigation Pill Tab       | Always visible for Admin role.      | Main Admin Header Navigation bar (2nd tab). | Displays master contact database across all staff.       |
| **"Tab: Attenders"** (`Users`)                | Top Navigation Pill Tab       | Always visible for Admin role.      | Main Admin Header Navigation bar (3rd tab). | Displays Attender user account management.               |
| **"Tab: Programs"** (`Calendar`)              | Top Navigation Pill Tab       | Always visible for Admin role.      | Main Admin Header Navigation bar (4th tab). | Displays Shivir & Event program catalog manager.         |
| **"Tab: Monthly Report"** (`FileSpreadsheet`) | Top Navigation Pill Tab       | Always visible for Admin role.      | Main Admin Header Navigation bar (5th tab). | Displays comprehensive monthly performance reports.      |
| **"Tab: Abhivyakti"** (`Sparkles`)            | Top Navigation Pill Tab       | Always visible for Admin role.      | Main Admin Header Navigation bar (6th tab). | Displays special Abhivyakti event registration module.   |
| **"Tab: Settings"** (`Settings`)              | Top Navigation Pill Tab       | Always visible for Admin role.      | Main Admin Header Navigation bar (7th tab). | Displays system bypass rules, password update & options. |
| **"Switch to Attender View"** (`Headphones`)  | Indigo Border Outlined Button | Always visible in Admin header.     | Top-right header action bar.                | Switches interface mode back to Attender Calling View.   |

---

## 7. Admin Panel - Analytics & Overview Dashboard (`DashboardTab.jsx`)

### 🔘 Buttons Catalog

| Button Name & Icon                         | Visual Variant / Style                  | WHEN It Appears (Trigger Condition)                                     | WHERE It Appears (Exact Location)          | Purpose & Action                                                                                   |
| :----------------------------------------- | :-------------------------------------- | :---------------------------------------------------------------------- | :----------------------------------------- | :------------------------------------------------------------------------------------------------- |
| **"Export Report"** (`Download`)           | Emerald Green Solid Button              | Always visible; disabled if filtered log entries = 0.                   | Top-right header of Dashboard tab.         | Exports all filtered call logs and dashboard data to an Excel `.xlsx` file.                        |
| **"MultiSelect Dropdown Triggers"**        | White Bordered Pill with Chevron        | Always visible in filter bar.                                           | Filter row grid in Dashboard tab.          | Toggles dropdown menu for Tags, Attenders, Sources, Called For, Statuses, Call Types, Khoji.       |
| **"Select All / Deselect All"**            | Indigo Text Button inside Dropdown      | Visible inside open MultiSelect dropdowns.                              | Top of open `MultiSelect` popover menu.    | Selects or clears all options in that filter category.                                             |
| **"Search Filter Options"** (`Search`)     | Inline Input Search Box                 | Visible inside open MultiSelect dropdowns.                              | Header of open `MultiSelect` popover menu. | Filters available options in the dropdown list.                                                    |
| **"Clear MultiSelect Search"** (`X`)       | Small Gray Icon Button                  | Appears when typing in dropdown search.                                 | Inside `MultiSelect` search box.           | Clears dropdown search query.                                                                      |
| **"Date Filter: 📅 Today"**                | Green Outlined/Solid Pill Button        | Always visible in Date Range toolbar.                                   | Filter Bar next to Date Pickers.           | Sets Date-From and Date-To to today's date.                                                        |
| **"Date Filter: 📅 This Month"**           | Indigo Outlined/Solid Pill Button       | Always visible in Date Range toolbar.                                   | Filter Bar next to Date Pickers.           | Sets Date-From to 1st of month and Date-To to today.                                               |
| **"Clear All Filters Badge"** (`X`)        | Red Pill Button with Filter Count badge | Appears when 1 or more multi-select filters or custom dates are active. | Right side of Filter Bar.                  | Clears all 7 multi-select filters and resets dates back to today.                                  |
| **"Attender Performance Detail"** (`User`) | Table Row Click Button                  | Always visible on Attender Leaderboard table rows.                      | Each row of Attender Leaderboard table.    | Opens modal showing individual lead details assigned to that attender (`selectedAttenderDetails`). |
| **"Attender Detail Modal Close"** (`X`)    | Icon Button                             | Visible when Attender Detail Modal is open.                             | Top-right of Attender Detail Modal.        | Closes detail modal.                                                                               |
| **"Attender Detail Search Clear"** (`X`)   | Icon Button                             | Visible when searching inside Attender Detail Modal.                    | Inside Attender Detail Modal search box.   | Clears search text in detail modal.                                                                |
| **"Conversions Table Prev Page"**          | Arrow Icon Button                       | Visible when conversions page > 1.                                      | Bottom-right of Conversions Detail Table.  | Navigates to previous page of converted leads.                                                     |
| **"Conversions Table Next Page"**          | Arrow Icon Button                       | Visible when conversions page < total pages.                            | Bottom-right of Conversions Detail Table.  | Navigates to next page of converted leads.                                                         |

### 📊 Graphs & Charts (Recharts)

| Chart Name                           | Chart Type                     | Data Visualized                                                    |
| :----------------------------------- | :----------------------------- | :----------------------------------------------------------------- |
| **Outcome Distribution**             | `PieChart` (Donut with Legend) | Percentage and count breakdown of all call outcomes.               |
| **Attender Performance Leaderboard** | `BarChart` & Data Table        | Total calls vs Reg.Done conversions per attender staff.            |
| **Daily Call Volume Trend**          | `LineChart` / `BarChart`       | Timeline of call volume over selected date range.                  |
| **Summary Stat Cards**               | 3 KPI Cards Grid               | Total Entries, Interested Leads Count, Reg.Done Conversions Count. |
| **Conversions Detail Table**         | Searchable Paginated Table     | Searchable list of all converted `Reg.Done` contacts.              |

---

## 8. Admin Panel - All Attenders Master Sheet (`AllAttendersSheetTab.jsx`)

### 🔘 Buttons Catalog

| Button Name & Icon                      | Visual Variant / Style  | WHEN It Appears (Trigger Condition)                | WHERE It Appears (Exact Location)       | Purpose & Action                                                |
| :-------------------------------------- | :---------------------- | :------------------------------------------------- | :-------------------------------------- | :-------------------------------------------------------------- |
| **"Export Master Sheet"** (`Download`)  | Emerald Green Button    | Always visible in tab toolbar.                     | Top-right of Master Sheet tab.          | Exports all contacts across all attenders to Excel.             |
| **"Bulk Reassign Selected"** (`Users`)  | Indigo Action Button    | Visible when 1 or more row checkboxes are checked. | Bulk Actions Bar above master table.    | Opens modal to transfer selected contacts to a target attender. |
| **"Refresh Master Data"** (`RefreshCw`) | Soft Icon Button        | Always visible in toolbar.                         | Top-right next to Export.               | Forces complete database re-sync for all attender states.       |
| **"Toggle Filter Panel"** (`Filter`)    | Slate Button            | Always visible in toolbar.                         | Top-left of toolbar.                    | Toggles visibility of advanced filter bar.                      |
| **"Row Edit Lead"** (`Pencil`)          | Blue Circle Button      | Visible on every master row.                       | Action column of each master table row. | Opens full lead edit modal.                                     |
| **"Row Assign Attender"** (`UserPlus`)  | Dropdown Trigger Button | Visible on every master row.                       | Assigned Attender column cell.          | Opens inline dropdown to quickly reassign single contact.       |

---

## 9. Admin Panel - Attenders Management (`AttendersTab.jsx`)

### 🔘 Buttons Catalog

| Button Name & Icon                          | Visual Variant / Style     | WHEN It Appears (Trigger Condition)        | WHERE It Appears (Exact Location)       | Purpose & Action                                     |
| :------------------------------------------ | :------------------------- | :----------------------------------------- | :-------------------------------------- | :--------------------------------------------------- |
| **"+ Add New Attender"** (`Plus`)           | Primary Blue Solid Button  | Always visible in Attenders tab header.    | Top-right of Attenders Management tab.  | Opens Add Attender Account Modal.                    |
| **"Edit Attender Profile"** (`Pencil`)      | Soft Blue Circle Button    | Visible on each attender account card/row. | Right action bar of each attender card. | Opens Edit Attender Modal to update name/phone/role. |
| **"Toggle Active Status"**                  | Green/Gray Switch Toggle   | Visible on each attender account card/row. | Right action bar of each attender card. | Enables or disables attender login access instantly. |
| **"Reset Password"** (`Key`)                | Amber Outlined Icon Button | Visible on each attender account card.     | Right action bar of each attender card. | Opens Reset Password Modal.                          |
| **"Delete Attender"** (`Trash2`)            | Red Outlined Icon Button   | Visible on each attender account card.     | Right action bar of each attender card. | Prompts deletion confirmation.                       |
| **"Generate Random Password"** (`Sparkles`) | Small Purple Button        | Visible inside Add/Edit Attender Modal.    | Next to Password input field in modal.  | Generates a strong random password.                  |
| **"Save Attender Account"** (`Save`)        | Primary Blue Button        | Visible inside Add/Edit Attender Modal.    | Bottom-right footer of Add/Edit Modal.  | Persists new/updated attender account.               |
| **"Cancel Attender Modal"**                 | Soft Gray Button           | Visible inside Add/Edit Attender Modal.    | Bottom-right footer of Add/Edit Modal.  | Closes modal without saving.                         |

---

## 10. Admin Panel - Programs / Shivirs Management (`ProgramsTab.jsx`)

### 🔘 Buttons Catalog

| Button Name & Icon               | Visual Variant / Style    | WHEN It Appears (Trigger Condition)    | WHERE It Appears (Exact Location)     | Purpose & Action                                    |
| :------------------------------- | :------------------------ | :------------------------------------- | :------------------------------------ | :-------------------------------------------------- |
| **"+ Add New Program"** (`Plus`) | Primary Blue Solid Button | Always visible in Programs tab header. | Top-right of Programs tab header.     | Opens Add Program / Shivir Modal.                   |
| **"Edit Program"** (`Pencil`)    | Soft Blue Circle Button   | Visible on each program card/row.      | Right action area of program card.    | Opens modal to edit Shivir title/code.              |
| **"Archive / Activate Toggle"**  | Green/Gray Switch Toggle  | Visible on each program card.          | Right action area of program card.    | Toggles program status between Active and Archived. |
| **"Delete Program"** (`Trash2`)  | Red Outlined Button       | Visible on each program card.          | Right action area of program card.    | Permanently removes program tag.                    |
| **"Save Program Form"** (`Save`) | Primary Blue Button       | Visible inside Add/Edit Program Modal. | Bottom-right footer of Program Modal. | Persists program updates to database.               |

---

## 11. Admin Panel - Monthly Reports & Performance (`MonthlyReportTab.jsx`)

### 🔘 Buttons Catalog

| Button Name & Icon                              | Visual Variant / Style | WHEN It Appears (Trigger Condition)       | WHERE It Appears (Exact Location)       | Purpose & Action                                             |
| :---------------------------------------------- | :--------------------- | :---------------------------------------- | :-------------------------------------- | :----------------------------------------------------------- |
| **"Generate Monthly Report"** (`Play`)          | Primary Indigo Button  | Always visible in toolbar.                | Top-right of Monthly Report tab.        | Processes call logs and compiles monthly performance tables. |
| **"Export Monthly Excel"** (`Download`)         | Emerald Green Button   | Visible when monthly report is generated. | Header action bar next to Generate.     | Downloads multi-sheet monthly performance workbook.          |
| **"Print / Download PDF"** (`Printer`)          | Slate Action Button    | Visible when report is generated.         | Header action bar next to Export.       | Prepares print preview / PDF download layout.                |
| **"Expand Attender Breakdown"** (`ChevronDown`) | Accordion Button       | Visible on each attender summary row.     | Left side of attender report table row. | Expands day-by-day calling breakdown for that attender.      |

---

## 12. Admin Panel - Abhivyakti Event Registrations (`AbhivyaktiTab.jsx`)

### 🔘 Buttons Catalog

| Button Name & Icon                            | Visual Variant / Style     | WHEN It Appears (Trigger Condition) | WHERE It Appears (Exact Location) | Purpose & Action                            |
| :-------------------------------------------- | :------------------------- | :---------------------------------- | :-------------------------------- | :------------------------------------------ |
| **"Export Abhivyakti Excel"** (`Download`)    | Emerald Green Button       | Always visible in header.           | Top-right of Abhivyakti tab.      | Exports event registration data to Excel.   |
| **"Import Registration Batch"** (`Upload`)    | Primary Blue Button        | Always visible in header.           | Top-right next to Export.         | Opens batch import modal for event signups. |
| **"Sync Web Form Submissions"** (`RefreshCw`) | Cyan Button with Spin Icon | Always visible in header.           | Top-right next to Import.         | Fetches latest online web form submissions. |

---

## 13. Admin Panel - Settings & System Configurations (`SettingsTab.jsx`)

**Sub-Components:** `AdminPasswordCard.jsx`, `CompulsoryFieldBypassCard.jsx`, `OptionsManagerCard.jsx`, `WhatsAppTemplatesCard.jsx`

### 🔘 Buttons Catalog

| Component                   | Button Name & Icon                   | WHEN It Appears                      | WHERE It Appears                      | Purpose & Action                                         |
| :-------------------------- | :----------------------------------- | :----------------------------------- | :------------------------------------ | :------------------------------------------------------- |
| `AdminPasswordCard`         | **"Update Admin Password"** (`Key`)  | Always visible inside Password Card. | Bottom of Admin Password Card.        | Updates admin account password.                          |
| `CompulsoryFieldBypassCard` | **"Bypass Rule Toggles"** (Switches) | Always visible.                      | Inside Compulsory Field Bypass Card.  | Toggles enforcement for Remarks, Called For, Shivir Tag. |
| `CompulsoryFieldBypassCard` | **"Save Bypass Settings"** (`Save`)  | Always visible.                      | Bottom of Bypass Settings Card.       | Persists validation rules.                               |
| `OptionsManagerCard`        | **"+ Add General Status"** (`Plus`)  | Always visible.                      | Options Manager Card (Section 1).     | Adds new canonical status option.                        |
| `OptionsManagerCard`        | **"+ Add Specific Status"** (`Plus`) | Always visible.                      | Options Manager Card (Section 2).     | Adds new specific outcome sub-status.                    |
| `OptionsManagerCard`        | **"+ Add Lead Source"** (`Plus`)     | Always visible.                      | Options Manager Card (Section 3).     | Adds new lead source option.                             |
| `OptionsManagerCard`        | **"Delete Option (`Trash2`)"**       | Visible on each option pill.         | Right side of option item pill.       | Removes option from dropdown list.                       |
| `WhatsAppTemplatesCard`     | **"+ Create New Template"** (`Plus`) | Always visible.                      | Top-right of WhatsApp Templates Card. | Opens Add WhatsApp Template Modal.                       |
| `WhatsAppTemplatesCard`     | **"Edit Template"** (`Pencil`)       | Visible on each template card.       | Card action bar.                      | Opens Edit Template Modal.                               |
| `WhatsAppTemplatesCard`     | **"Delete Template"** (`Trash2`)     | Visible on each template card.       | Card action bar.                      | Deletes message template.                                |
| `WhatsAppTemplatesCard`     | **"Insert Tag `{Name}`"**            | Visible inside Template Modal.       | Above Template Message Textarea.      | Inserts `{Name}` placeholder into template text.         |
| `WhatsAppTemplatesCard`     | **"Insert Tag `{Shivir}`"**          | Visible inside Template Modal.       | Above Template Message Textarea.      | Inserts `{Shivir}` placeholder into template text.       |
| `WhatsAppTemplatesCard`     | **"Insert Tag `{Attender}`"**        | Visible inside Template Modal.       | Above Template Message Textarea.      | Inserts `{Attender}` placeholder into template text.     |
| `WhatsAppTemplatesCard`     | **"Save Template"** (`Save`)         | Visible inside Template Modal.       | Modal footer.                         | Saves WhatsApp template.                                 |

---

## 14. Contact / Excel Import Wizard (`ImportContacts.jsx`)

### 🔘 Buttons Catalog

| Step                | Button Name & Icon                               | WHEN It Appears                  | WHERE It Appears                 | Purpose & Action                                   |
| :------------------ | :----------------------------------------------- | :------------------------------- | :------------------------------- | :------------------------------------------------- |
| **Step 1: Upload**  | **"Select / Drag & Drop Excel File"** (`Upload`) | Visible in Step 1.               | Center file dropzone card.       | Opens local file chooser for `.xlsx`, `.csv`.      |
| **Step 1: Upload**  | **"Download Sample CSV"** (`Download`)           | Visible in Step 1.               | Bottom of upload dropzone.       | Downloads pre-formatted CSV header template.       |
| **Step 2: Mapping** | **"Auto-Map Columns"** (`Sparkles`)              | Visible in Step 2.               | Header of Mapping screen.        | Auto-matches CSV header titles to database fields. |
| **Step 2: Mapping** | **"Proceed to Confirmation"** (`ArrowRight`)     | Visible in Step 2.               | Bottom-right footer.             | Advances wizard to import confirmation.            |
| **Step 2: Mapping** | **"Back to Upload"** (`ArrowLeft`)               | Visible in Step 2.               | Bottom-left footer.              | Returns to file upload screen.                     |
| **Step 3: Confirm** | **"Start Bulk Import"** (`Check`)                | Visible in Step 3.               | Center action bar.               | Launches bulk creation & duplication pipeline.     |
| **Progress Modal**  | **"Stop / Cancel Import"** (`XCircle`)           | Visible while import is running. | Bottom of Import Progress Modal. | Aborts running import process safely.              |
| **Progress Modal**  | **"Close & View Leads"**                         | Visible when import finishes.    | Bottom of Import Progress Modal. | Closes modal and opens Attender Workspace.         |

---

## 15. Global Dashboard Visual Analytics Views (`src/page/dashboard/components`)

**Files:** `LeadsTableView.jsx`, `ShivirAnalysisView.jsx`, `SourceAnalysisView.jsx`

### 🔘 Buttons & Dropdowns

- **`LeadsTableView.jsx`**: View mode toggle buttons (Grid View vs List View), Search button, Pagination controls.
- **`ShivirAnalysisView.jsx`**: Shivir selector dropdown, Chart refresh button.
- **`SourceAnalysisView.jsx`**: Source category filter dropdown, Export chart image button.

---

## 16. Shared Overlays & Micro-Components

### 🔘 Buttons & Floating Triggers

1. **Celebration Feed Overlay (`CelebrationFeed.jsx`)**:
   - **Floating Trigger Badge Button**: Appears in top app header with animated party icon.
   - **"Cheer / Like Conversion" Button** (`Heart` / `ThumbsUp`): Visible on celebration card items.
   - **"Close Celebration Feed" Button** (`X`): Top-right of feed drawer.
2. **WhatsApp Direct Send Modal (`WhatsAppButton.jsx`)**:
   - **Template Picker Trigger Button**: Opens list of WhatsApp templates.
   - **"Open WhatsApp Web" Button**: Launches web.whatsapp.com with message pre-filled.
   - **"Open Mobile WhatsApp App" Button**: Opens WhatsApp mobile application protocol.
   - **"Copy Message Text" Button** (`Copy`): Copies rendered template text to clipboard.

---

## 📋 Master Totals & Catalog Stats

| Category                      | Component Count | Highlights                                                                              |
| :---------------------------- | :-------------: | :-------------------------------------------------------------------------------------- |
| **Buttons & Action Triggers** |     **70+**     | Detailed with exact **WHEN** (trigger conditions) & **WHERE** (layout positions).       |
| **Dropdowns & Selectors**     |     **30+**     | Searchable multi-selects, native selects, city autofill, program tag creators.          |
| **Modals & Dialog Drawers**   |     **15**      | Edit Modal, Mobile Edit Drawer, Edit History Audit, Password Reset, Import Progress.    |
| **Graphs & Visual Analytics** |     **14**      | Recharts Donut Pie Charts, Leaderboard Bar Charts, Daily Line Trends, KPI Metric Cards. |
| **AI Design Prompts**         |     **14**      | Master prompts tailored for v0, Stitch, Figma AI, and Bolt UI generation.               |

---

_Catalog maintained for TGF Call Center & CRM Web Application UI Stitching & Redesign._
