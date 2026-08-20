# 📱 Mobile-First Call Center CRM: Firebase Architecture, Specs & Design Prompts

This document contains the complete technical architecture, data schemas, business rules, Edit Modal options, Attender View modes, and code implementations derived directly from the **TGF Excel Version 2 Production Codebase**.

---

# 📑 PART 1: Firebase Architecture & Technical Prerequisites

## 1. 🏗️ High-Level System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       MOBILE WEB APP (REACT / NEXT.JS)                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Layer 1: React State / Context (0ms UI Updates via useMemo/useEffect) │
│  Layer 2: Local Memory Partition Cache (globalActivePartitionsCache)   │
│  Layer 3: IndexedDB Offline Cache (Stale-While-Revalidate Sync)          │
│  Layer 4: Firebase Disk Cache (persistentLocalCache)                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                   WebSocket / Singleton Stream (subscribeToCallLogs)
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                        FIREBASE FIRESTORE BACKEND                       │
├─────────────────────────────────────────────────────────────────────────┤
│  Collection: contacts             (Master Lead Repository)             │
│  Collection: callCenterCache      (Monthly Partitions: 2026-08_part1)  │
│  Collection: programs             (Tag / Campaign Metadata)            │
│  Collection: attenders            (Attender User Profiles)             │
│  Collection: activeTags           (Active System Tag Index)            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 🗄️ Firestore Master Lead Schema (`contacts` Collection)

The schema enforces strict data hygiene by separating immutable acquisition channel (`original_source`) from dynamic call campaign (`calledFor`) and maintaining attender-isolated sub-states alongside global history.

```json
{
  "id": "contact_abc123",
  "Name": "Raju Vitthalrao Ghulepatil",
  "Phone": "9545524111",
  "Mobile": "9545524111",
  "normalizedPhone": "9545524111",
  "normalizedMobile": "9545524111",
  "normalizedPhones": ["9545524111"],
  "City": "Nagpur",
  "State": "Maharashtra",
  "Khoji": "Yes",
  "GHL_ID": "ghl_9545524111",
  "tags": ["Hair Avd", "July 2026 Batch"],
  
  "original_source": "Instagram Ad",
  "Source": "Instagram Ad",
  "calledFor": "CBT Advance",
  "subProgram": "CBT Advance",
  "pipelineStage": "In Discussion",
  "isRegistered": false,
  
  "isAssigned": true,
  "assignedTo": ["attender_rakhi_id"],
  "assignedName": "Rakhi",
  "attenderId": "attender_rakhi_id",
  "attenderName": "Rakhi",
  "convertedBy": "Rakhi",
  
  "totalCallAttempts": 3,
  "lastCallOutcome": "Callback Requested",
  "lastCalledAt": "2026-08-19T10:30:00.000Z",
  "nextFollowUpDate": "2026-08-21",
  "createdAt": "2026-08-01T05:00:00.000Z",
  "updatedAt": "2026-08-19T10:30:00.000Z",
  
  "attenderStates": {
    "attender_rakhi_id": {
      "attenderName": "Rakhi",
      "status": "In Discussion",
      "remark": "Discussed CBT Advance syllabus, asked to call back Friday",
      "history": [
        {
          "status": "Info given",
          "remark": "Details shared on WhatsApp",
          "attenderName": "Rakhi",
          "callType": "outgoing",
          "timestamp": "2026-08-18T14:20:00.000Z"
        }
      ],
      "updatedAt": "2026-08-19T10:30:00.000Z"
    },
    "attender_geeta_id": {
      "attenderName": "Geeta",
      "status": "Reg.Done",
      "remark": "Assisted registration on behalf of Rakhi",
      "history": [ ... ],
      "updatedAt": "2026-08-19T10:30:00.000Z"
    }
  },
  
  "history": [
    {
      "callId": "call_101",
      "timestamp": "2026-08-10T14:20:00.000Z",
      "attenderId": "attender_rakhi_id",
      "attenderName": "Rakhi",
      "callType": "outgoing",
      "sourceList": "Instagram Ad",
      "calledFor": "CBT Basic",
      "outcomeStatus": "Reg.Done",
      "remark": "Completed CBT Basic shivir registration"
    },
    {
      "callId": "call_102",
      "timestamp": "2026-08-19T10:30:00.000Z",
      "attenderId": "attender_rakhi_id",
      "attenderName": "Rakhi",
      "callType": "outgoing",
      "sourceList": "CBT Basic List",
      "calledFor": "CBT Advance",
      "outcomeStatus": "Callback Requested",
      "remark": "Discussed CBT Advance syllabus, asked to call back Friday"
    }
  ]
}
```

---

# 🎛️ PART 2: Real Codebase Attender View & Mobile Edit Modal Specs

## 1. 📲 Mobile Edit Modal Navigation Tabs (`MobileEditModal.jsx`)

In the actual codebase implementation (`src/page/call-center/attender/mobile/MobileEditModal.jsx`), the edit drawer is structured into **3 core tabs**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          MOBILE EDIT MODAL                             │
├───────────────────────────────────┬────────────────────────────────────┤
│  [📞 Call Entry]                  │ Logging call types & outcomes      │
│  [👤 Profile]                     │ Edit lead name, city, phone, tags  │
│  [✏️ Past Logs]                   │ Audit log timeline & edit history  │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 2. 📋 Lead Call Outcome Options (Codebase Mappings)

### Canonical Status Options (`STATUS_OPTIONS` in `src/page/call-center/attender/utils.js`):
1. `Interested`
2. `Reg.Done`
3. `Not interested`
4. `Not Attended`
5. `NA`
6. `Busy`
7. `Call Cut`
8. `switched off`
9. `Invalid No`
10. `Already Reg.d`
11. `Info given`
12. `Next time`
13. `reminder`
14. `Query`
15. `Called by mistake`
16. `Not possible`
17. `Shivir done`
18. `no answer`

### 8 Consolidated Pipeline Outcomes (Target Simplified Mapping):
| # | Consolidated Outcome | Codebase Statuses Included | Stage |
|---|:---|:---|:---|
| 1 | **`Reg.Done`** | `Reg.Done`, `Already Reg.d`, `Registered` | `Reg.Done` |
| 2 | **`In Discussion`** | `In Discussion`, `Interested`, `Info given`, `Query` | `In Discussion` |
| 3 | **`Callback Requested`** | `Callback Requested`, `reminder` | `In Discussion` |
| 4 | **`Unreachable`** | `NA`, `Busy`, `Call Cut`, `switched off`, `no answer`, `Not Attended` | `Closed / Unresponsive` (if dials >= 5) |
| 5 | **`Not Interested`** | `Not interested` | `Closed / Refused` |
| 6 | **`Invalid / Wrong No`** | `Invalid No`, `Called by mistake`, `wrong no.` | `Closed / Refused` |
| 7 | **`Already Registered`** | `Already Reg.d`, `Shivir done` | `Reg.Done` |
| 8 | **`Next Time`** | `Next time`, `Not possible` | `Deferred` |

---

## 3. 🔔 Team Assists Attribution Notification Banner (`MobileAttenderView.jsx`)

When an attender registers a lead owned by another attender, the system populates the `Team Assists` popover inside `MobileAttenderView.jsx`:

```jsx
{/* Team Assists Notification Item */}
<div className="p-3 bg-amber-50/50 hover:bg-slate-50 cursor-pointer border-b border-slate-100">
  <div className="flex items-center justify-between">
    <span className="text-xs font-bold text-slate-900">{notif.leadName}</span>
    <span className="text-[8px] font-extrabold text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded">
      +1 Credit
    </span>
  </div>
  <p className="text-[11px] text-slate-600 mt-0.5">
    Registered by <span className="font-bold text-blue-600">{notif.convertedBy}</span>
  </p>
</div>
```

---

# 🔘 PART 3: Complete Mobile CRM Button Specification, Types & Placements

Below is the complete UI layout inventory of every button in **MobileAttenderView** and **MobileEditModal**, detailing their visual icon, button type, trigger action, and exact placement in the mobile layout:

### 1. 🟢 Top Header Navigation Bar (`MobileAttenderView.jsx`)

| Button Name | Icon / Visual | Type | Action / Trigger | Layout Placement |
|:---|:---|:---|:---|:---|
| **Exit Button** | `<ArrowLeft size={18} />` | Circular Icon Button (`w-8 h-8`, translucent white) | Navigates back to main admin dashboard (`onExit`) | Top Left Header |
| **Team Assists Bell** | `<Bell size={18} />` + Badge | Popover Toggle Button (`w-9 h-9`, rounded full) | Opens Team Assists notification popover (`+1 Credit`) | Top Right Header (1st) |
| **Global Search** | `<Search size={18} />` | Circular Icon Button (`w-9 h-9`, translucent white) | Opens full-screen CRM search modal (`setGlobalSearchOpen`) | Top Right Header (2nd) |
| **+ Add Call** | `<Plus size={16} />` | Green Highlight Pill Button (`bg-[#10b981]`) | Opens empty lead entry drawer modal (`openCallEntryDialog`) | Top Right Header (3rd) |

---

### 2. 🎛️ Filter & Toolbar Controls (`AttenderFilters.jsx`)

| Button Name | Icon / Visual | Type | Action / Trigger | Layout Placement |
|:---|:---|:---|:---|:---|
| **Status Tab Pills** | Text (`All`, `Reg.Done`, etc.) | Horizontal Scrollable Pill Bar | Sets active lead status filter (`setFilterStatus`) | Below Header Bar |
| **Tag Selector Dropdown** | `<Tag size={13} />` | Dropdown Toggle Button | Opens tag multi-select menu | Toolbar Strip |
| **Advanced Filters** | `<SlidersHorizontal size={13} />` | Filter Drawer Trigger | Opens deep filtering drawer (dates, counts, sources) | Toolbar Strip |
| **Clear All Filters** | `<X size={12} />` | Red Pill Badge Button | Resets all active filters to default state | Toolbar Strip (Conditional) |

---

### 3. 📱 Contact Card Action Elements (`MobileAttenderView.jsx`)

| Button Name | Icon / Visual | Type | Action / Trigger | Layout Placement |
|:---|:---|:---|:---|:---|
| **Full Card Click** | Entire Card Surface | Interactive Card Block | Opens lead details & edit drawer (`setEditingRow(row)`) | Contact List Card Container |
| **Direct Dialer Button** | `<PhoneOutgoing size={17} />` | Green Floating Circle Button (`w-10 h-10 bg-[#00684a]`) | Directly initiates native mobile phone dialer (`tel:phone`) | Bottom Right of Lead Card |
| **Overdue Callback Badge** | `<Clock size={10} />` | Red Pulsing Pill | Visual alert for overdue follow-up date | Top Right of Lead Card |
| **Hot Lead Badge** | `<Flame size={10} />` | Orange Highlight Pill | Visual tag for high-probability conversion lead | Top Right of Lead Card |
| **Load More Contacts** | Text (`Load More...`) | Centered Pill Button | Appends +30 contact cards to visible list | Bottom of Contact List |

---

### 4. 🗂️ Mobile Edit Modal Buttons (`MobileEditModal.jsx`)

| Button Name | Icon / Visual | Type | Action / Trigger | Layout Placement |
|:---|:---|:---|:---|:---|
| **Close Drawer** | `<ArrowLeft size={18} />` or `<X />` | Icon Button | Dismisses modal drawer (`onClose()`) | Modal Top Bar Left |
| **WhatsApp Direct** | `<MessageSquare size={16} />` | Green Icon Button | Opens `https://wa.me/91...` in WhatsApp | Modal Top Bar Right |
| **Direct Phone Call** | `<Phone size={16} />` | Emerald Circle Icon Button | Triggers native call dialer (`tel:...`) | Modal Top Bar Right |
| **Call Entry Tab** | `<Phone size={13} />` | Sub-header Tab Button | Switches to call outcome entry form | Tab Bar Below Header |
| **Profile Tab** | `<User size={13} />` | Sub-header Tab Button | Switches to lead details edit form (`Name`, `City`, `Tags`) | Tab Bar Below Header |
| **Past Logs Tab** | `<Edit3 size={13} />` | Sub-header Tab Button | Opens timeline of past attender updates & call logs | Tab Bar Below Header |
| **Call Type Selectors** | `<Phone size={13} />` Label | 2x2 Grid Pill Buttons | Selects `callType` (`outgoing`, `incoming`, `outgoing f`, `incoming f`) | `Call Entry` Tab Body |
| **Called For Selector** | `<Phone size={13} />` Label | `SearchableDropdown` (Multi-select) | Selects/searches target Shivir/program (`CALLED_FOR_OPTIONS`) | `Call Entry` Tab Body |
| **Source Selector** | `<Tag size={13} />` Label | `SearchableDropdown` (Single-select) | Selects/searches acquisition source (`SOURCE_OPTIONS`) | `Call Entry` Tab Body |
| **General Result Status** | `<CheckCircle2 size={13} />` Label | `SearchableDropdown` (Single-select) | Selects call outcome status (`STATUS_OPTIONS`) | `Call Entry` Tab Body |
| **Objection Reasons** | `<AlertCircle size={13} />` Label | Red Outline Pill Buttons | Selects reason when status = `Not interested` (`OBJECTION_REASONS`) | `Call Entry` Tab Body |
| **Call Notes / Remark** | `<MessageSquare size={13} />` Label | `<textarea rows={2} />` | Freeform text entry for call notes | `Call Entry` Tab Body |
| **Follow-up Date** | `<CalendarDays size={13} />` Label | `<input type="date" />` | Date picker for scheduling callback + `Remove` button | `Call Entry` Tab Body |
| **Name Field** | `<User size={11} />` Label | `<input type="text" />` | Editable contact title-case name | `Profile` Tab Body |
| **Phone Field** | `<Phone size={11} />` Label | `<input type="text" />` | Primary contact phone number | `Profile` Tab Body |
| **Mobile Field** | `<Phone size={11} />` Label | `<input type="text" />` | Secondary mobile number | `Profile` Tab Body |
| **Email Field** | `<Hash size={11} />` Label | `<input type="email" />` | Contact email address | `Profile` Tab Body |
| **City Field** | `<MapPin size={11} />` Label | `<CityAutofillInput />` | City autofill search & select component | `Profile` Tab Body |
| **State Field** | `<MapPin size={11} />` Label | `<input type="text" />` | Contact state location | `Profile` Tab Body |
| **Save & Close** | `<Loader size={14} />` Indicator | Full-width Indigo Rounded Button | Saves changes & appends history record to Firestore | Sticky Bottom Footer |
| **Remove Lead** | `<Trash2 size={16} />` | Red Link Button | Deletes contact record | Sticky Bottom Footer Left |

---

# 💻 PART 4: Real Codebase File Locations & Component Architecture

Below are the actual primary source files in the project repository implementing the mobile CRM architecture:

* **Mobile View Container:** `src/page/call-center/attender/mobile/MobileAttenderView.jsx`
* **Mobile Edit Modal Drawer:** `src/page/call-center/attender/mobile/MobileEditModal.jsx`
* **Filter Bar Component:** `src/page/call-center/attender/components/AttenderFilters.jsx`
* **CRM Statuses & Helpers:** `src/page/call-center/attender/utils.js`
* **Firebase DB & Partitioning Layer:** `src/lib/db.js`

---

# 🎨 PART 5: Mobile CRM Screen Design Specifications

Detailed design specifications for rendering the mobile CRM user interfaces matching the codebase implementation:

---

### 📱 Screen 1: Mobile Call Sheet Header & Navigation
* **Header Bar (`#00684a` Dark Emerald):**
  * Top left `<ArrowLeft />` button to return to dashboard.
  * Title: **"My Call Sheet"** with lead count badge (`Showing X of Y leads`).
  * Top right action group:
    1. Team Assists Notification Bell icon (`<Bell />`) with red unread count badge. Toggles dropdown popover showing shared conversion credits (`+1 Credit`).
    2. Global Search icon button (`<Search />`).
    3. Green pill button (`+ Add Call`) to launch empty contact creation drawer.

---

### 📱 Screen 2: Contact Card List View
* **Lead Item Cards:** Elevated mobile card container (`rounded-2xl border p-4`).
* **Header Line:** Lead Name (formatted title case), status pill badge (`Reg.Done`, `Interested`, `Overdue Callback`, etc.), tag badge.
* **Sub-Line:** Location text with pin icon (`MapPin`) combining `City` and `State`.
* **Footer Line:** Phone number string with a prominent green circular dial button (`<PhoneOutgoing />`) on the bottom right that executes `window.open("tel:" + phone, "_self")`.
* **Card Tap Event:** Tapping anywhere on the card surface opens `MobileEditModal.jsx`.

---

### 📱 Screen 3: Mobile Edit Modal Drawer (`MobileEditModal.jsx`)
* **Slide-Up Bottom Sheet Drawer:** iOS/Android bottom sheet overlay.
* **Top Header:** Lead name, locked `Source` badge, WhatsApp link button (`<MessageSquare />`), direct call button (`<Phone />`), and close drawer button (`<X />`).
* **Sub-Header Navigation Tabs:**
  1. **📞 Call Entry:** Select Call Type (`outgoing`, `incoming`), General Result Status dropdown, Objection reason selector, Follow-up date picker, Remarks textarea, and Save button (`<Save />`).
  2. **👤 Profile:** Full contact editing fields (`Name`, `City`, `State`, `Khoji`, `Tags`).
  3. **✏️ Past Logs:** Historical timeline of all past call attempts and updates.

---

# 🎨 PART 6: Granular AI UI Prompts for Every Screen & Button Component

You can copy and paste these exact prompts directly into AI UI design tools (v0, Claude Artifacts, Midjourney, Figma AI) to generate mobile interfaces matching the codebase layout:

---

## 📱 1. Mobile Attender Main View Screen (`MobileAttenderView.jsx`)

### 🎯 Full Screen Layout Prompt:
> **Prompt:** "Design a mobile portrait view (375x812px) of a Call Center CRM app named 'My Call Sheet'. The top header features a back arrow on the left, title 'My Call Sheet' with subtitle 'Showing 30 of 850 leads', a bell icon with counter badge '3', a search magnifying glass icon, and an action pill button '+ Add Call' on the right. Below the header is a horizontal filter bar with rounded status chips ('All', 'Reg.Done', 'In Discussion', 'Callback'). The body contains vertical contact cards with lead names, location tags, phone numbers, and circular call buttons on the bottom right."

### 🔘 Header Action Buttons Prompts:
* **Exit Button:** 
  > **Prompt:** "A circular icon button (32x32px) containing a left arrow icon (`ArrowLeft`). Clean design on the header bar."
* **Team Assists Notification Bell:** 
  > **Prompt:** "A 36x36px rounded button with a bell icon (`Bell`) and an overlapping circular notification counter badge '3' on the top-right corner. When clicked, it opens a popover listing team assist entries with badge text '+1 Credit'."
* **Global Search Button:** 
  > **Prompt:** "A 36x36px circular button with a search magnifying glass icon (`Search`)."
* **+ Add Call Pill Button:** 
  > **Prompt:** "A rounded pill button featuring a plus icon (`Plus`) and bold text '+ Add Call'. Elevated with drop shadow."

---

## 📱 2. Contact Cards & Lead List Controls

### 🎯 Card Layout Prompt:
> **Prompt:** "Design a mobile contact card component for a CRM list. Elevated card background (`rounded-2xl border p-4 shadow-sm`). Top line shows caller name 'Raju Ghulepatil' in bold text, next to a small status pill badge 'Reg.Done'. Below it shows a location pin icon (`MapPin`) with location text 'Nagpur, Maharashtra'. The bottom row shows the phone number '9545524111' in bold monospace, and on the far right a 40x40px circular action button with an outgoing phone icon."

### 🔘 Card Action Component Prompts:
* **Direct Outgoing Phone Dialer Button:** 
  > **Prompt:** "A 40x40px circular action button with a white phone outgoing icon (`PhoneOutgoing`, 17px, bold 2.5 stroke width)."
* **Overdue Callback Alert Badge:** 
  > **Prompt:** "A pill badge containing a clock icon (`Clock`) and text 'Overdue Callback'."
* **Hot Lead Priority Badge:** 
  > **Prompt:** "A pill badge containing a flame icon (`Flame`) and text 'HOT LEAD'."

---

## 📱 3. Mobile Edit Modal Drawer (`MobileEditModal.jsx`)

### 🎯 Modal Drawer Layout Prompt:
> **Prompt:** "Design a mobile bottom sheet drawer sliding up over a dim backdrop with rounded top corners (`rounded-t-2xl p-5`). The top drawer bar displays caller name 'Raju Vitthalrao Ghulepatil', source badge 'Instagram Ad', a WhatsApp message icon button (`MessageSquare`), a phone icon button (`Phone`), and a close icon button (`X`). Below the top bar is a 3-tab segmented navigation bar: '📞 Call Entry', '👤 Profile', and '✏️ Past Logs'."

### 🔘 Modal Input Controls & Form Component Prompts:
* **Sub-Header Navigation Tabs:** 
  > **Prompt:** "A horizontal sub-header tab strip with 3 text tabs: 'Call Entry' (with phone icon), 'Profile' (with user icon), and 'Past Logs' (with edit icon). Active tab has a bottom indicator line."
* **Call Type 2x2 Grid Pills:** 
  > **Prompt:** "A 2x2 grid of rounded pill buttons for selecting call type: 'Outgoing' (selected state), 'Incoming', 'Outgoing (F)', 'Incoming (F)'."
* **`Called For` Multi-select Searchable Dropdown:** 
  > **Prompt:** "A searchable dropdown field with a phone icon label 'CALLED FOR *'. Input box has a placeholder 'Search & select...'. Dropdown list shows Shivir programs ('Off MA', 'CBT Basic', 'CBT Advance') with multi-select checkmarks."
* **`Source` Searchable Dropdown:** 
  > **Prompt:** "A searchable dropdown field with a tag icon label 'SOURCE *'. Dropdown shows acquisition channels ('Facebook', 'Instagram', 'YouTube', 'Call Centre')."
* **`General Result Status` Searchable Dropdown:** 
  > **Prompt:** "A searchable dropdown field with a checkmark icon label 'GENERAL RESULT STATUS *'. Displays status options ('Interested', 'Reg.Done', 'Not interested', 'Busy', 'Invalid No', 'Next time')."
* **Objection Reason Pill Selector:** 
  > **Prompt:** "A container with label 'Reason for not interested?'. Displays outline pill buttons ('Too Expensive', 'Wrong Dates', 'Location Too Far', 'No Time', 'Other'). Selected pill displays active filled state."
* **Follow-up Date Picker:** 
  > **Prompt:** "A date input field with a calendar icon label 'Schedule Follow-up'. Native date input alongside a button 'Remove'."
* **Call Notes Textarea:** 
  > **Prompt:** "A rounded textarea with placeholder 'Write notes for this call...'."
* **Profile Information Text Inputs:** 
  > **Prompt:** "A stack of mobile input fields for caller profile editing: Name (with user icon), Phone (with phone icon), Mobile, Email (with hash icon), City (autofill component with location pin), and State."
* **Sticky Footer Save & Close Button:** 
  > **Prompt:** "A sticky bottom modal footer bar containing a 'Remove' link button on the left, and a large rounded pill button on the right with text 'Save & Close'."
