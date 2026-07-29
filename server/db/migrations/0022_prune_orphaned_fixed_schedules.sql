-- Remove fixed_schedules rows whose shift template belongs to a group the user
-- is no longer a member of.
--
-- A fixed_schedules row stores a shift_template_id, and templates belong to
-- groups, so the row encodes group membership only indirectly. Before this
-- release, setUserGroups replaced user_groups without touching fixed_schedules,
-- so removing someone from a group left the row behind. The scheduler locks
-- fixed schedules in Phase 1 without any group check, ahead of the fill phase —
-- so the orphan kept placing shifts in the former group and outranked every
-- other constraint.
--
-- The code paths that create orphans are now closed (setUserGroups prunes on
-- removal, the fixed-schedule write route validates membership, and the
-- scheduler query joins user_groups). This clears what is already stored.
--
-- Data-only: no schema change, so schema.sql needs no matching edit.

DELETE FROM fixed_schedules
 WHERE id IN (
   SELECT fs.id
     FROM fixed_schedules fs
     JOIN shift_templates st ON st.id = fs.shift_template_id
    WHERE NOT EXISTS (
      SELECT 1 FROM user_groups ug
       WHERE ug.user_id = fs.user_id
         AND ug.group_id = st.group_id
    )
 );
