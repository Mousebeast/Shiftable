# Manager Guide

Managers build and publish schedules, handle approvals, and manage staff and groups. Manager tools are accessible from the dashboard tile grid.

---

## Groups and shift templates

Groups are the foundation of everything — the auto-scheduler, coverage rules, and staff assignments all flow from them.

### Creating a group

Go to **Groups** from the dashboard. Tap **New Group** and give it a name (e.g. Servers, Bartenders, Hosts) and a colour. The colour shows in the schedule grid and helps quickly identify shifts visually.

### Shift templates

Each group has its own shift templates — the shifts that group works. For example, a Servers group might have:
- Lunch: 11:00 AM, 5 hours
- Dinner: 5:00 PM, 6 hours
- Brunch: 10:00 AM, 4 hours

Add templates from the group detail page. Set the name, start time, and duration. Hours are used by the auto-scheduler to track weekly totals per staff member.

### Coverage rules

Coverage rules tell the scheduler the minimum number of staff needed for each shift template on each day of the week. Set these in the group detail page.

Example: Servers → Dinner → Monday: 3 staff required.

The scheduler will flag coverage gaps as warnings if it can't fill a shift to the minimum. You can override manually in the draft.

### Assigning staff to groups

From the **Staff** page, open any staff member and assign them to one or more groups. Staff can belong to multiple groups — the scheduler will consider them eligible for any group's shifts.

---

## Building a schedule

Go to **Schedule Builder** from the dashboard.

### Generating a draft

Select the week and click **Generate Draft**. The auto-scheduler runs through four passes:

1. **Lock** — copies any fixed schedules (staff who always work specific days) into the draft
2. **Block** — marks staff with approved time-off as unavailable for those days
3. **Fill** — assigns staff to shifts based on availability, group membership, hour limits, and consecutive day limits
4. **Warnings** — flags any shifts where minimum coverage wasn't met

The draft is never published automatically. You review it first.

### Editing the draft

Click any cell in the grid to change the assignment — swap who's working, adjust times, or remove a shift. Use the **+** button to add a shift that the auto-scheduler missed.

The **hrs** column on the right shows each staff member's total scheduled hours for the week.

Shifts copied from fixed schedules show a lock icon — they can still be edited, but the lock is a reminder they came from a permanent assignment.

### Coverage warnings

If the auto-scheduler couldn't meet minimum coverage for any shift, a warning banner appears at the top. Review and fill those gaps manually before publishing.

### Publishing

When the draft looks right, click **Publish**. All staff receive a push notification that the schedule is live.

If you need to make changes after publishing, click **Start Editing** to create a new draft for that week. Edit as needed, then publish again — staff will receive another notification and see the updated schedule immediately.

### Who has seen the schedule

After publishing, a small **eye icon** appears next to each staff member's name in the schedule grid once they open the schedule in the app. No action is required from staff — it records automatically the first time they view the published week.

If the eye icon is absent, that staff member hasn't opened the schedule yet. The reserved space next to every name ensures the layout stays consistent whether or not someone has viewed it.

The viewed status resets whenever you re-publish — so if you make corrections and push an updated schedule, you can see at a glance who has seen the new version.

### Events

Special events (private parties, live music, holidays, etc.) can be tagged to any day in the schedule builder.

Click the event icon in a day's column header to open the event panel for that date. From there you can:

- **Add an event title** — type a name and press Enter or click Add. Titles appear as purple pills in the day header and in the Day View that staff see.
- **Remove a title** — click the × on any pill.
- **Set event coverage** — optionally specify a group, shift template, and minimum staff count required for the event. The scheduler flags a warning if that coverage isn't met.

Events are week-specific — they don't repeat automatically. Add them fresh each week as needed.

---

## Fixed schedules

Staff who always work the same days every week can have a **fixed schedule**. Open a staff member from the Staff page and click **Fixed Schedule**.

Set which days and which shift template applies for each day. The next time you generate a schedule, those shifts will be locked in first before the auto-fill runs.

Fixed schedules persist across all weeks — they're not week-specific. Remove a day from the fixed schedule when it changes permanently. For one-off changes, just edit the draft after generating.

---

## Approvals queue

Go to **Approvals** from the dashboard. This is your single queue for all pending items:

- **Time-off requests** — approve or deny, with an optional note to the staff member
- **Availability changes** — approve to apply the new pattern from the effective date, or deny
- **Swap requests** — swaps that couldn't be auto-approved. Review and approve or deny

Approved and denied items are removed from the queue. Staff receive a notification for every decision.

### Approving time-off

Tap **Approve** to grant the request. Tap **Deny** to decline — you can add a note that the staff member will see. Approved time-off is automatically considered by the scheduler when generating future drafts.

### Approving availability changes

When you approve an availability change, the new pattern takes effect from the date the staff member requested. The old pattern remains in place until then. Denying returns the staff member to their current pattern.

### Swap decisions

Swaps reach the queue when they couldn't be auto-approved — usually because the claimer isn't in the same group, is already working that day, or would exceed their hour limit. Review the reason and approve or deny.

---

## Staff management

Go to **Staff** from the dashboard.

### Adding a staff member

Tap **Add Staff Member**. Enter their name and email. The system generates a claim link — either email it automatically (requires SMTP configured) or copy it to send manually via text or any other way.

Staff can't log in until they claim their account. Unclaimed accounts show a "pending" indicator.

### Regenerating a claim link

If a staff member's link expired (links are valid for 72 hours) or they didn't receive it, open their profile and click **Resend / Copy Link**. This generates a new link and invalidates the old one.

### Editing a staff member

Open their profile to update their name, email, or hour limits (minimum and maximum hours per week used by the auto-scheduler).

### Deactivating a staff member

When someone leaves, open their profile and click **Deactivate**. Deactivated accounts can't log in and won't appear in the scheduler. Any open swap requests they had are automatically cancelled.

Deactivating is the right choice when someone has shifts in published schedules. Hard delete is available to admins only and is blocked if published shifts exist.

---

## Broadcast messages

Go to **Broadcast** from the dashboard to send an announcement to all staff or a specific group. Staff receive a push notification and the message appears in their notifications list.

Use this for: schedule changes, special event reminders, weather closures, or anything else the whole team needs to know.
