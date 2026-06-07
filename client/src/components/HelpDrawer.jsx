import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';

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
          'Additional tiles on your dashboard link to the Schedule Builder, Staff Management, Groups, Approvals, and Broadcast tools.',
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
          'If you\'re in the same group, available that day, and within your weekly hour limits, the swap is auto-approved instantly.',
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
          'Availability changes take effect from the next Monday after approval.',
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
        heading: 'Generating a schedule',
        items: [
          'Pick a week and tap Generate. The auto-scheduler fills shifts based on coverage rules, staff availability, fixed schedules, and hour limits.',
          'A warnings panel shows any coverage gaps the scheduler couldn\'t fill.',
          'The generated schedule is a draft — staff can\'t see it yet.',
        ],
      },
      {
        heading: 'Editing the draft',
        items: [
          'Click any cell to add, change, or remove a shift for that person and day.',
          'Cells with a lock icon are fixed schedules — they\'re locked by default but can be overridden.',
          'The Hours column on the right shows each person\'s total scheduled hours for the week.',
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
          'Optionally set extra coverage requirements for the event day.',
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
          'Approved changes take effect from the following Monday.',
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
          'Fill in name, email, and optionally a phone number.',
          'A claim link is sent automatically via email and/or SMS (if configured).',
          'The link lets them set their PIN and activate their account. It expires in 72 hours.',
          'If it expires, use Resend Link to generate a new one — or copy the link manually.',
        ],
      },
      {
        heading: 'Editing staff',
        items: [
          'Update name, email, phone, role, weekly hour limits, and group assignments.',
          'Group assignment affects which shifts the auto-scheduler considers them for.',
        ],
      },
      {
        heading: 'Fixed Schedules',
        items: [
          'Assign a staff member to the same shift every week.',
          'Fixed shifts are locked in the schedule builder and always filled first by the auto-scheduler.',
        ],
      },
      {
        heading: 'Deactivating staff',
        items: [
          'Deactivated staff can\'t log in and won\'t be scheduled.',
          'Their history (past shifts, swaps, requests) is preserved.',
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
          'Week Starts On — Monday or Sunday.',
        ],
      },
      {
        heading: 'Users tab',
        items: [
          'Promote staff to manager or admin, or demote back.',
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
          'Shows Node version, database file size, and server uptime.',
          'Download a backup of the SQLite database from here.',
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
