import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { WEEK_START_NAME } from '../lib/week';

const HELP = {
  '/': {
    title: 'Getting Started',
    sections: [
      {
        body: 'Welcome to Shiftable — your restaurant\'s scheduling hub. Here\'s what you can do from here:',
      },
      {
        heading: 'Your Dashboard',
        items: [
          'Your next upcoming shift is shown at the top of the screen.',
          'If a manager has posted an open shift for your group, it appears alongside your next shift card. Swipe to browse multiple open shifts and tap Claim (then Confirm) to take one.',
          'Use the tiles below to jump to the Schedule, Swaps, Time Off, and Availability pages.',
          'The notification bell in the header shows unread activity.',
        ],
      },
      {
        heading: 'First time here?',
        items: [
          'Your PIN was set when you claimed your account via the link you were sent.',
          'If you need to reset your PIN, use "Forgot PIN" on the login screen.',
          'On mobile, add Shiftable to your home screen for the best experience — look for the install prompt or use your browser\'s Share menu.',
        ],
      },
      {
        heading: 'Managers & Admins',
        items: [
          'Additional tiles on your dashboard link to the Schedule Builder, Approvals, Staff Management, Groups, Broadcast, and Reports. Admins also get the Admin Panel.',
          'Staff-facing pages work the same for all roles.',
        ],
      },
    ],
  },

  '/schedule': {
    title: 'Your Schedule',
    sections: [
      {
        body: 'Three views of the published schedule — switch between them with the tabs at the top.',
      },
      {
        heading: 'My Week',
        items: [
          'Shows only your own shifts for the selected week.',
          'Each card shows your group, start time, and shift length.',
          'A sticky-note icon on a shift means your manager left a note — it appears below the shift details.',
        ],
      },
      {
        heading: 'Full Grid',
        items: [
          'Shows all staff for the week in a scrollable table.',
          'Rows are ordered by group, then alphabetically within each group.',
          'Colored pills indicate which group each shift belongs to.',
          'Days with approved time off show as OFF in the grid.',
        ],
      },
      {
        heading: 'Day View',
        items: [
          'Tap a day in the strip at the top to see all shifts for that day.',
          'Shifts are grouped by role. Any special events for the day appear at the top.',
        ],
      },
      {
        heading: 'Navigation',
        items: [
          'Use the arrow buttons to move between weeks.',
          'Only published schedules are shown — if a week is blank, it hasn\'t been published yet.',
        ],
      },
      {
        heading: 'Calendar Subscription',
        items: [
          'At the bottom of the My Week tab, tap the subscribe link to add your shifts directly to Apple Calendar or Google Calendar.',
          'Copy the URL for Outlook or any calendar app that supports manual subscription.',
          'The feed updates automatically as new schedules are published — no re-subscribing needed.',
          'Use Regenerate URL if you want to revoke access and start a fresh link.',
        ],
      },
    ],
  },

  '/swaps': {
    title: 'Shift Swaps',
    sections: [
      {
        body: 'Swap an upcoming shift with a colleague without going through a manager — in most cases.',
      },
      {
        heading: 'Offering a swap',
        items: [
          'Find the shift you want to give away and tap "Offer for Swap".',
          'It becomes visible to eligible colleagues who can cover it.',
          'You can cancel your offer any time before someone claims it.',
        ],
      },
      {
        heading: 'Claiming a swap',
        items: [
          'Open swap offers from your colleagues appear in the Available Swaps list.',
          'Tap "Claim" to take a shift. You\'ll get a confirmation once it\'s resolved.',
        ],
      },
      {
        heading: 'Auto-approval vs. manager review',
        items: [
          'If you\'re in the same group, not already working that day, and within your weekly hour limit, the swap is auto-approved instantly.',
          'Your availability doesn\'t block a swap — if you offer to cover a shift outside your usual hours, that\'s your call to make.',
          'If any check fails, it goes to a manager for review.',
          'You\'ll receive a notification either way.',
        ],
      },
    ],
  },

  '/timeoff': {
    title: 'Time Off',
    sections: [
      {
        body: 'Request time off for a date range. Your manager reviews and approves or denies it.',
      },
      {
        heading: 'Submitting a request',
        items: [
          'Choose a start date, end date, and an optional reason.',
          'You can have multiple requests open at the same time.',
        ],
      },
      {
        heading: 'What happens next',
        items: [
          'Your manager will approve or deny the request, sometimes with a note.',
          'You\'ll get a notification when it\'s resolved.',
          'Approved time off is automatically blocked in the auto-scheduler — you won\'t be assigned shifts on those days.',
        ],
      },
      {
        heading: 'History tab',
        items: [
          'Shows all your past and pending requests along with their status and any manager notes.',
        ],
      },
    ],
  },

  '/availability': {
    title: 'Availability',
    sections: [
      {
        body: 'Tell the scheduler which days and times you\'re available to work on a recurring weekly basis.',
      },
      {
        heading: 'Setting your availability',
        items: [
          'Select the days you\'re available and the time range for each.',
          'Submit the change — your manager will review and approve it.',
        ],
      },
      {
        heading: 'Important timing rule',
        items: [
          `Availability changes take effect from the next ${WEEK_START_NAME} after approval.`,
          'They don\'t affect schedules that have already been published.',
          'This prevents your change from breaking a schedule that\'s already live.',
        ],
      },
      {
        heading: 'How it\'s used',
        items: [
          'The auto-scheduler only assigns you to shifts that fall within your approved availability windows.',
          'If no approved availability is on file, you\'re treated as available any day and time — restrictions only apply once you have an approved pattern on record.',
        ],
      },
    ],
  },

  '/notifications': {
    title: 'Notifications',
    sections: [
      {
        body: 'All scheduling activity that involves you shows up here.',
      },
      {
        heading: 'What you\'ll see',
        items: [
          'Schedule published — a new week\'s schedule is live.',
          'Open shift available — a manager posted an open shift for your group.',
          'Swap offered — someone put a shift up for swap.',
          'Swap resolved — a swap you were involved in was approved or denied.',
          'Time-off resolved — your request was approved or denied.',
          'Availability resolved — your availability change was approved or denied.',
          'Broadcast — a message from your manager.',
        ],
      },
      {
        heading: 'Push notifications',
        items: [
          'If you\'ve allowed notifications in your browser or on your home screen install, these also arrive as push notifications.',
          'Tap "Mark all read" to clear the unread badge in the header.',
        ],
      },
    ],
  },

  '/builder': {
    title: 'Schedule Builder',
    sections: [
      {
        body: 'Build, edit, and publish the weekly schedule. Staff see it immediately when you publish.',
      },
      {
        heading: 'Starting a draft',
        items: [
          'Generate — the auto-scheduler fills shifts based on coverage rules, availability, fixed schedules, and hour limits. A warnings panel shows any gaps it couldn\'t fill.',
          'Fixed shifts — starts the week with fixed shifts only, so you can fill the rest in by hand. Time off and closed days still apply. The warnings panel lists every coverage gap, which doubles as your checklist of what\'s left.',
          'Copy week — duplicate any previously published week as a starting point. Useful for recurring patterns.',
          'Copy week and Template reproduce the source week as-is rather than working around what has changed since. Approved time off, availability changes, hour and shift caps and closed days are reported in the warnings panel instead of avoided — time-off clashes also turn the cell red. New fixed shifts are the exception: they are not added, and nothing flags them missing, so use Generate if you have set some up recently.',
          'Template — start from a named template you\'ve saved. Templates store the shift pattern without specific dates.',
          'All four options create a draft. Staff can\'t see it until you publish.',
        ],
      },
      {
        heading: 'The Coverage tab',
        items: [
          'Set minimum staffing requirements per group, day, and shift template.',
          'Drag rows to set group fill priority — the scheduler fills top groups first when staff belong to multiple groups.',
          'Day priority badges — tap a day column header to rank it. Lower number = filled first within each group\'s pass.',
          'Fill order toggle — Group Priority fills each group across all days before moving to the next group (best for cross-trained staff). Day Priority fills each day completely before moving to the next day.',
          'Close Day permanently marks a day as closed — the scheduler skips it and the builder greys it out. Individual weeks can override a closed day from the builder.',
          'Hourly rate per group (optional) — when set, a projected labor cost row appears at the bottom of the grid.',
        ],
      },
      {
        heading: 'Editing the draft',
        items: [
          'Click any cell to add, change, or remove a shift for that person and day.',
          'Cells with a lock icon are fixed schedules — locked by default but can be overridden.',
          'The Hours column on the right shows each person\'s total scheduled hours for the week.',
          'Discard Draft removes the draft. On a week with a published schedule it reverts to the published version. On a brand-new week with no prior schedule it deletes the draft entirely.',
        ],
      },
      {
        heading: 'Publishing',
        items: [
          'Tap Publish to make the schedule visible to all staff.',
          'Staff receive a push notification when a schedule is published.',
          'Once published, you can still make edits — tap Start Editing to create a working draft, make changes, and Re-Publish when ready. Staff keep seeing the live version while you edit.',
          'An eye icon in the grid header shows which staff have already viewed the published schedule.',
        ],
      },
      {
        heading: 'Open shifts',
        items: [
          'On a published week, click any day column header to post an open shift for a specific group.',
          'Choose the group, shift template, and an optional note — eligible staff in that group are notified immediately.',
          'Staff can claim an open shift from their dashboard. Claims are auto-approved and the shift is added to the schedule instantly.',
          'A claim is refused only if the person already works that day, or if the shift would put them over their weekly hour limit. Availability doesn\'t block it — picking up an open shift is volunteering.',
          'A green badge on the day header shows how many open shifts are still unclaimed.',
          'Click the day header again to cancel an open shift before it\'s claimed.',
        ],
      },
      {
        heading: 'Re-generating',
        items: [
          'Re-Generate refills auto-assigned shifts but preserves any manual edits you\'ve made.',
          'Use this if availability or coverage rules change after the first generate.',
        ],
      },
      {
        heading: 'Events',
        items: [
          'Click the event icon in any day\'s column header to tag a special event (private party, holiday, etc.).',
          'Add one or more titles — they appear as purple pills in the day header and in staff\'s Day View.',
          'Set extra coverage requirements per group and shift template for the event day. Multiple group/shift combinations can be added for the same event.',
        ],
      },
      {
        heading: 'Templates',
        items: [
          'Save the current week\'s shift pattern as a named template using the bookmark icon.',
          'Templates store who works which day and shift — without specific dates — so they can be applied to any future week.',
          'Manage and delete templates from the Template picker.',
        ],
      },
    ],
  },

  '/approvals': {
    title: 'Approvals',
    sections: [
      {
        body: 'Everything waiting for your decision is here — time-off requests, availability changes, and swap requests that couldn\'t be auto-approved.',
      },
      {
        heading: 'Time-off requests',
        items: [
          'Shows the staff member, date range, and their reason.',
          'You can add an optional note before approving or denying.',
          'Approved requests block those dates in the auto-scheduler.',
        ],
      },
      {
        heading: 'Availability changes',
        items: [
          'Shows the new availability pattern the staff member is requesting.',
          'Approve or deny all days at once, or handle them individually.',
          `Approved changes take effect from the following ${WEEK_START_NAME}.`,
        ],
      },
      {
        heading: 'Swap requests',
        items: [
          'These are swaps that failed auto-approval — usually a coverage or hours issue.',
          'Review the details and approve or deny.',
        ],
      },
    ],
  },

  '/staff': {
    title: 'Staff Management',
    sections: [
      {
        body: 'Add and manage your team. Changes here affect scheduling and account access.',
      },
      {
        heading: 'Adding staff',
        items: [
          'Fill in name and optionally email and/or phone number.',
          'A claim link is sent automatically via email and/or SMS (if configured).',
          'The link lets them set their PIN and activate their account. It expires in 72 hours.',
          'If it expires, use Resend Link to generate a new one — or copy the link manually.',
        ],
      },
      {
        heading: 'Filtering and sorting',
        items: [
          'Tap any group tag on a staff card to filter the list to that group. Tap multiple tags to AND-filter across groups.',
          'Drag-to-reorder is suspended while a filter is active — clear filters first to adjust priority order.',
        ],
      },
      {
        heading: 'Editing staff',
        items: [
          'Update name, email, phone, role, weekly hour limits, min/max shifts per week, and group assignments.',
          'Group assignment affects which shifts the auto-scheduler considers them for.',
          'Priority order (drag the cards when no filter is active) controls fill order when the scheduler has a choice.',
        ],
      },
      {
        heading: 'Fixed Schedules',
        items: [
          'Assign a staff member to the same shift every week.',
          'Fixed shifts are locked in the schedule builder and always filled first by the auto-scheduler.',
          'A fixed shift belongs to the group its shift template comes from. Removing someone from that group deletes their fixed shifts for it — permanently. Re-adding the group does not bring them back.',
          'The staff edit form warns you which fixed shifts a group change will remove, before you save.',
        ],
      },
      {
        heading: 'Deactivating staff',
        items: [
          'Deactivated staff can\'t log in and won\'t be scheduled.',
          'Their history (past shifts, swaps, requests) is preserved.',
          'It\'s reversible — tap "Show inactive" at the top of this page and then Reactivate. Groups, limits, priority and their existing PIN all come back, so they don\'t need a new claim link.',
          'Any swap they had offered but nobody had claimed stays cancelled, and reactivating an admin account requires admin access.',
          'Admins can hard-delete from the Admin panel if needed.',
        ],
      },
    ],
  },

  '/groups': {
    title: 'Groups & Shifts',
    sections: [
      {
        body: 'Groups represent your roles — Servers, Bartenders, Hosts, etc. Each group has its own shift templates and coverage requirements.',
      },
      {
        heading: 'Groups',
        items: [
          'Create a group for each role at your restaurant.',
          'Assign a color — it shows up in the schedule grid.',
          'Staff can belong to multiple groups (e.g. someone who works both bar and floor).',
          'Hourly rate (optional) — used to calculate projected weekly labor cost in the Schedule Builder.',
        ],
      },
      {
        heading: 'Members',
        items: [
          'Expand a group and open Members to tick who belongs to it. The header shows how many of your active staff are in the group.',
          'You can also set group membership from a staff member\'s edit form — either place does the same thing.',
        ],
      },
      {
        heading: 'Shift Templates',
        items: [
          'Define the shifts for each group: name (Lunch, Dinner), start time, and duration in hours.',
          'Templates are what the auto-scheduler and coverage rules are built around.',
        ],
      },
      {
        heading: 'Coverage Rules\n(Edit in Schedule Builder)',
        items: [
          'Set the minimum number of staff required per group, per day, per shift template.',
          'The auto-scheduler fills shifts until these minimums are met.',
          'Drag rows to reorder fill priority — top group fills first when someone belongs to multiple groups.',
        ],
      },
    ],
  },

  '/broadcast': {
    title: 'Broadcast Message',
    sections: [
      {
        body: 'Send a push notification to your whole team or a specific group.',
      },
      {
        heading: 'Sending a broadcast',
        items: [
          'Choose a recipient — All Staff or a specific group.',
          'Write a short title and message body.',
          'Tap Send — all staff with push notifications enabled will receive it immediately.',
        ],
      },
      {
        heading: 'Tips',
        items: [
          'Keep it short — this is a notification, not an email.',
          'Staff who haven\'t enabled push notifications will see it in their Notifications page when they next open the app.',
          'Broadcasts are one-way — staff can\'t reply.',
        ],
      },
    ],
  },

  '/reports': {
    title: 'Reports',
    sections: [
      {
        body: 'Scheduled hours per staff member over any date range.',
      },
      {
        heading: 'Running a report',
        items: [
          'Pick a From and To date — it opens on the current week — then tap Run.',
          'You get each person\'s total hours and shift count, highest first, plus totals across the team.',
          'Export CSV downloads the same table for payroll or a spreadsheet.',
        ],
      },
      {
        heading: 'What\'s counted',
        items: [
          'Published shifts only. Draft schedules are never included, so numbers don\'t move while you\'re still building a week.',
          'Active staff only. Deactivated people are left out even if they worked during the range.',
          'Staff with no shifts in the range still appear, at zero hours.',
        ],
      },
    ],
  },

  '/admin': {
    title: 'Admin Panel',
    sections: [
      {
        body: 'System-level settings. Changes here affect the entire app.',
      },
      {
        heading: 'Settings tab',
        items: [
          'Restaurant Name — shown in the app header and PWA install.',
          'App URL — used to build claim links in emails and SMS. Should match your domain.',
          'Max Consecutive Days — the scheduler won\'t assign more than this many days in a row.',
        ],
      },
      {
        heading: 'Users tab',
        items: [
          'Promote staff to manager, or grant admin. Granting admin gives full access — settings, every staff record, and a database download — so it asks you to confirm.',
          'Revoke admin to drop someone back to manager. You can\'t change your own role, and you can\'t remove the last remaining admin.',
          'View login history for any user.',
          'Hard delete a user — only available if they have no shifts in a published schedule.',
        ],
      },
      {
        heading: 'Email/SMS tab',
        items: [
          'SMTP settings for outgoing email (claim links, PIN resets).',
          'Twilio settings for SMS delivery of claim links.',
          'Both are optional — if unconfigured, managers can copy claim links manually.',
        ],
      },
      {
        heading: 'System tab',
        items: [
          'Shows Node version, server uptime, and memory usage.',
          'Download a full backup of the SQLite database.',
          'Staff Migration — export your setup as a JSON package: groups, shift templates, coverage rules, and staff accounts.',
          'Import that package on a fresh installation to pre-populate a new instance. Import only runs on an instance with no staff yet.',
          'Imported staff arrive unclaimed, each with a new claim link. Admin accounts are never exported or imported — the new instance keeps its own.',
          'Resend Claim Emails — sends a fresh link to everyone who hasn\'t claimed their account yet.',
        ],
      },
    ],
  },
};

const DEFAULT_HELP = {
  title: 'Help',
  sections: [
    {
      body: 'No help content available for this page yet.',
    },
  ],
};

export default function HelpDrawer({ open, onClose }) {
  const { pathname } = useLocation();
  const help = HELP[pathname] || DEFAULT_HELP;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-gray-900 border-l border-gray-700 z-50 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          <h2 className="text-base font-semibold text-gray-100">{help.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {help.sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">
                  {section.heading.split('\n').map((line, i) => (
                    <span key={i} className={`block ${i > 0 ? 'text-gray-500 normal-case tracking-normal font-normal mt-0.5' : ''}`}>
                      {line}
                    </span>
                  ))}
                </h3>
              )}
              {section.body && (
                <p className="text-sm text-gray-300 leading-relaxed">{section.body}</p>
              )}
              {section.items && (
                <ul className="space-y-2">
                  {section.items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-sm text-gray-300 leading-relaxed">
                      <span className="text-blue-500 mt-0.5 flex-shrink-0">·</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
