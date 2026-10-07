import { useEffect } from 'react'

export type Language = 'en' | 'kn'

// The English UI remains the source text. This layer changes only rendered copy;
// option values, IDs, names and the volunteer/assignment data stay untouched.
const kannada: Record<string, string> = {
  'Food Rescue Network':'ಆಹಾರ ರಕ್ಷಣಾ ಜಾಲ', 'AaharaConnect · Food Rescue Network':'AaharaConnect · ಆಹಾರ ರಕ್ಷಣಾ ಜಾಲ', 'WORKSPACE':'ಕಾರ್ಯಕ್ಷೇತ್ರ', 'Workspace':'ಕಾರ್ಯಕ್ಷೇತ್ರ',
  'Dashboard':'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', 'Volunteers':'ಸ್ವಯಂಸೇವಕರು', 'Teams':'ತಂಡಗಳು', 'Assignments':'ನಿಯೋಜನೆಗಳು', 'Settings':'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
  'Volunteer Management':'ಸ್ವಯಂಸೇವಕರ ನಿರ್ವಹಣೆ', 'Volunteer Teams':'ಸ್ವಯಂಸೇವಕ ತಂಡಗಳು', 'Bengaluru Chapter':'Bengaluru ಘಟಕ',
  'NGO Coordinator':'ಎನ್‌ಜಿಒ ಸಂಯೋಜಕರು', 'Coordinator':'ಸಂಯೋಜಕರು', 'Notifications':'ಅಧಿಸೂಚನೆಗಳು', 'Workspace settings':'ಕಾರ್ಯಕ್ಷೇತ್ರ ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
  'You’re all caught up. Assignment updates will appear here during your session.':'ಹೊಸ ಅಧಿಸೂಚನೆಗಳಿಲ್ಲ. ಈ ಅವಧಿಯ ನಿಯೋಜನೆ ಬದಲಾವಣೆಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.',
  'Open navigation':'ನ್ಯಾವಿಗೇಶನ್ ತೆರೆಯಿರಿ', 'Close navigation':'ನ್ಯಾವಿಗೇಶನ್ ಮುಚ್ಚಿರಿ', 'Main navigation':'ಮುಖ್ಯ ನ್ಯಾವಿಗೇಶನ್', 'Language':'ಭಾಷೆ', 'Expand sidebar':'ಪಕ್ಕದ ಪಟ್ಟಿಯನ್ನು ವಿಸ್ತರಿಸಿ', 'Collapse sidebar':'ಪಕ್ಕದ ಪಟ್ಟಿಯನ್ನು ಕುಗ್ಗಿಸಿ', 'Expand':'ವಿಸ್ತರಿಸಿ', 'Collapse':'ಕುಗ್ಗಿಸಿ', 'sidebar':'ಪಕ್ಕದ ಪಟ್ಟಿ',
  'Close dialog':'ಸಂವಾದ ಮುಚ್ಚಿರಿ', 'Close details':'ವಿವರಗಳನ್ನು ಮುಚ್ಚಿರಿ', 'Dismiss notification':'ಅಧಿಸೂಚನೆ ಮುಚ್ಚಿರಿ',
  'Every meal matters.':'ಪ್ರತಿ ಊಟವೂ ಮುಖ್ಯ.', 'People and purpose, working together for a better Bengaluru.':'ಉತ್ತಮ Bengaluru ಗಾಗಿ ಜನರು ಒಟ್ಟಾಗಿ ಕೆಲಸ ಮಾಡುತ್ತಿದ್ದಾರೆ.',
  'MONDAY, 28 SEPTEMBER 2026':'ಸೋಮವಾರ, 28 ಸೆಪ್ಟೆಂಬರ್ 2026', 'Coordinate volunteers, teams and food-rescue assignments.':'ಸ್ವಯಂಸೇವಕರು, ತಂಡಗಳು ಮತ್ತು ಆಹಾರ ರಕ್ಷಣಾ ನಿಯೋಜನೆಗಳನ್ನು ಸಂಯೋಜಿಸಿ.',
  'Create Assignment':'ನಿಯೋಜನೆ ರಚಿಸಿ', 'Total Volunteers':'ಒಟ್ಟು ಸ್ವಯಂಸೇವಕರು', 'Available Volunteers':'ಲಭ್ಯ ಸ್ವಯಂಸೇವಕರು', 'On Assignment':'ನಿಯೋಜನೆಯಲ್ಲಿ', 'Active Teams':'ಸಕ್ರಿಯ ತಂಡಗಳು',
  'Across Bengaluru chapter':'Bengaluru ಘಟಕದಾದ್ಯಂತ', 'Ready for a pickup':'ಆಹಾರ ಸಂಗ್ರಹಕ್ಕೆ ಸಿದ್ಧ', 'Supporting active pickups':'ಸಕ್ರಿಯ ಸಂಗ್ರಹಕ್ಕೆ ನೆರವು', 'Coordinated crews':'ಸಂಯೋಜಿತ ತಂಡಗಳು',
  'Today’s Volunteer Operations':'ಇಂದಿನ ಸ್ವಯಂಸೇವಕ ಕಾರ್ಯಗಳು', 'The next pickups your crews are coordinating.':'ನಿಮ್ಮ ತಂಡಗಳು ಸಂಯೋಜಿಸುತ್ತಿರುವ ಮುಂದಿನ ಆಹಾರ ಸಂಗ್ರಹಗಳು.',
  'All assignments':'ಎಲ್ಲ ನಿಯೋಜನೆಗಳು', 'View':'ವೀಕ್ಷಿಸಿ', 'View all':'ಎಲ್ಲವನ್ನೂ ವೀಕ್ಷಿಸಿ', 'Volunteer / Team':'ಸ್ವಯಂಸೇವಕ / ತಂಡ', 'Assignment':'ನಿಯೋಜನೆ', 'Role':'ಪಾತ್ರ', 'Pickup Time':'ಸಂಗ್ರಹ ಸಮಯ', 'Pickup':'ಸಂಗ್ರಹ', 'Status':'ಸ್ಥಿತಿ', 'Actions':'ಕ್ರಿಯೆಗಳು',
  'Individual volunteer':'ವೈಯಕ್ತಿಕ ಸ್ವಯಂಸೇವಕ', 'Volunteer Availability Overview':'ಸ್ವಯಂಸೇವಕರ ಲಭ್ಯತೆ', 'Current roster state.':'ಪ್ರಸ್ತುತ ಪಟ್ಟಿಯ ಸ್ಥಿತಿ.', 'Volunteer availability':'ಸ್ವಯಂಸೇವಕರ ಲಭ್ಯತೆ', 'View roster':'ಪಟ್ಟಿ ವೀಕ್ಷಿಸಿ', 'A quick view of today’s people capacity.':'ಇಂದು ಲಭ್ಯವಿರುವ ಜನರ ಸಂಕ್ಷಿಪ್ತ ನೋಟ.', 'available volunteers':'ಲಭ್ಯ ಸ್ವಯಂಸೇವಕರು', 'across the chapter':'ಘಟಕದಾದ್ಯಂತ',
  'Available':'ಲಭ್ಯ', 'Assigned':'ನಿಯೋಜಿತ', 'On duty':'ಕರ್ತವ್ಯದಲ್ಲಿ', 'On Duty':'ಕರ್ತವ್ಯದಲ್ಲಿ', 'Off Duty':'ಕರ್ತವ್ಯದಲ್ಲಿಲ್ಲ', 'Unavailable':'ಲಭ್ಯವಿಲ್ಲ', 'Not available':'ಲಭ್ಯವಿಲ್ಲ', 'Reserved':'ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ',
  'Pending':'ಬಾಕಿ', 'Accepted':'ಸ್ವೀಕರಿಸಲಾಗಿದೆ', 'In Progress':'ಪ್ರಗತಿಯಲ್ಲಿದೆ', 'Completed':'ಪೂರ್ಣಗೊಂಡಿದೆ', 'Rejected':'ತಿರಸ್ಕರಿಸಲಾಗಿದೆ', 'Cancelled':'ರದ್ದಾಗಿದೆ', 'On Trip':'ಪ್ರಯಾಣದಲ್ಲಿದೆ', 'Maintenance':'ನಿರ್ವಹಣೆಯಲ್ಲಿ',
  'Next pickup window':'ಮುಂದಿನ ಸಂಗ್ರಹ ಸಮಯ', 'NEXT PICKUP WINDOW':'ಮುಂದಿನ ಸಂಗ್ರಹ ಸಮಯ', 'Approximately':'ಸುಮಾರು', 'meals':'ಊಟಗಳು', 'Coordinated with care by the Bengaluru volunteer team.':'Bengaluru ಸ್ವಯಂಸೇವಕ ತಂಡದ ಕಾಳಜಿಯ ಸಂಯೋಜನೆ.',
  'PEOPLE & CAPACITY':'ಜನರು ಮತ್ತು ಸಾಮರ್ಥ್ಯ', 'Manage NGO volunteers and their availability.':'ಎನ್‌ಜಿಒ ಸ್ವಯಂಸೇವಕರು ಮತ್ತು ಅವರ ಲಭ್ಯತೆಯನ್ನು ನಿರ್ವಹಿಸಿ.', 'Add Volunteer':'ಸ್ವಯಂಸೇವಕರನ್ನು ಸೇರಿಸಿ',
  'People make every rescue possible':'ಪ್ರತಿ ಆಹಾರ ರಕ್ಷಣೆಗೆ ಜನರೇ ಶಕ್ತಿ', 'Keep profiles, availability and team membership up to date before assigning pickups.':'ಸಂಗ್ರಹ ಕಾರ್ಯ ನೀಡುವ ಮೊದಲು ಪ್ರೊಫೈಲ್, ಲಭ್ಯತೆ ಮತ್ತು ತಂಡದ ವಿವರಗಳನ್ನು ನವೀಕರಿಸಿ.',
  'Search volunteers by name, phone or email':'ಹೆಸರು, ಫೋನ್ ಅಥವಾ ಇಮೇಲ್ ಮೂಲಕ ಹುಡುಕಿ', 'Search volunteers':'ಸ್ವಯಂಸೇವಕರನ್ನು ಹುಡುಕಿ', 'Clear search':'ಹುಡುಕಾಟ ತೆರವುಗೊಳಿಸಿ',
  'Filter by status':'ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ಫಿಲ್ಟರ್ ಮಾಡಿ', 'Filter by availability':'ಲಭ್ಯತೆಯ ಪ್ರಕಾರ ಫಿಲ್ಟರ್ ಮಾಡಿ', 'Filter by team':'ತಂಡದ ಪ್ರಕಾರ ಫಿಲ್ಟರ್ ಮಾಡಿ', 'Filter by skill':'ಕೌಶಲ್ಯದ ಪ್ರಕಾರ ಫಿಲ್ಟರ್ ಮಾಡಿ',
  'Filters':'ಫಿಲ್ಟರ್‌ಗಳು', 'All statuses':'ಎಲ್ಲ ಸ್ಥಿತಿಗಳು', 'Any availability':'ಯಾವುದೇ ಲಭ್ಯತೆ', 'Available now':'ಈಗ ಲಭ್ಯ', 'All teams':'ಎಲ್ಲ ತಂಡಗಳು', 'All skills':'ಎಲ್ಲ ಕೌಶಲ್ಯಗಳು', 'Unassigned':'ತಂಡವಿಲ್ಲ', 'Clear filters':'ಫಿಲ್ಟರ್‌ಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ',
  'Volunteer':'ಸ್ವಯಂಸೇವಕ', 'Contact':'ಸಂಪರ್ಕ', 'Skills':'ಕೌಶಲ್ಯಗಳು', 'Team':'ತಂಡ', 'Availability':'ಲಭ್ಯತೆ', 'Completed Jobs':'ಪೂರ್ಣಗೊಂಡ ಕಾರ್ಯಗಳು',
  'Food Handling':'ಆಹಾರ ನಿರ್ವಹಣೆ', 'Coordination':'ಸಂಯೋಜನೆ', 'Driving':'ಚಾಲನೆ', 'Distribution':'ವಿತರಣೆ', 'First Aid':'ಪ್ರಥಮ ಚಿಕಿತ್ಸೆ', 'Event Support':'ಕಾರ್ಯಕ್ರಮ ನೆರವು',
  'Team Leader':'ತಂಡದ ನಾಯಕ', 'Driver':'ಚಾಲಕ', 'Pickup Volunteer':'ಸಂಗ್ರಹ ಸ್ವಯಂಸೇವಕ', 'Food Handling Volunteer':'ಆಹಾರ ನಿರ್ವಹಣೆ ಸ್ವಯಂಸೇವಕ', 'Distribution Volunteer':'ವಿತರಣಾ ಸ್ವಯಂಸೇವಕ',
  'View profile':'ಪ್ರೊಫೈಲ್ ವೀಕ್ಷಿಸಿ', 'Edit volunteer':'ಸ್ವಯಂಸೇವಕರನ್ನು ತಿದ್ದುಪಡಿ ಮಾಡಿ', 'Assign to team':'ತಂಡಕ್ಕೆ ಸೇರಿಸಿ', 'Create assignment':'ನಿಯೋಜನೆ ರಚಿಸಿ',
  'No volunteers found':'ಸ್ವಯಂಸೇವಕರು ಕಂಡುಬಂದಿಲ್ಲ', 'Try a different search or clear the filters to see more people.':'ಬೇರೆ ಪದದಿಂದ ಹುಡುಕಿ ಅಥವಾ ಫಿಲ್ಟರ್‌ಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ.', 'Clear search and filters':'ಹುಡುಕಾಟ ಮತ್ತು ಫಿಲ್ಟರ್‌ಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ',
  'Volunteer roster · Bengaluru chapter':'ಸ್ವಯಂಸೇವಕರ ಪಟ್ಟಿ · Bengaluru ಘಟಕ', 'Volunteer profile':'ಸ್ವಯಂಸೇವಕರ ಪ್ರೊಫೈಲ್', 'Edit Volunteer':'ಸ್ವಯಂಸೇವಕರನ್ನು ತಿದ್ದುಪಡಿ ಮಾಡಿ', 'Assign to Team':'ತಂಡಕ್ಕೆ ಸೇರಿಸಿ', 'Showing':'ತೋರಿಸಲಾಗುತ್ತಿದೆ', 'of':'/', 'volunteers':'ಸ್ವಯಂಸೇವಕರು', 'profiles':'ಪ್ರೊಫೈಲ್‌ಗಳು', 'result':'ಫಲಿತಾಂಶ', 'results':'ಫಲಿತಾಂಶಗಳು',
  'Volunteer details':'ಸ್ವಯಂಸೇವಕರ ವಿವರಗಳು', 'Phone':'ಫೋನ್', 'Email':'ಇಮೇಲ್', 'Joined':'ಸೇರಿದ ದಿನ', 'Completed assignments':'ಪೂರ್ಣಗೊಂಡ ನಿಯೋಜನೆಗಳು', 'Volunteer hours':'ಸ್ವಯಂಸೇವಕ ಗಂಟೆಗಳು', 'Rating':'ಮೌಲ್ಯಮಾಪನ',
  'Upcoming availability':'ಮುಂಬರುವ ಲಭ್ಯತೆ', 'Add slot':'ಸಮಯ ಸೇರಿಸಿ', 'Start':'ಆರಂಭ', 'End':'ಅಂತ್ಯ', 'Save availability':'ಲಭ್ಯತೆಯನ್ನು ಉಳಿಸಿ', 'Current assignment':'ಪ್ರಸ್ತುತ ನಿಯೋಜನೆ', 'No active assignment right now.':'ಈಗ ಸಕ್ರಿಯ ನಿಯೋಜನೆ ಇಲ್ಲ.',
  'Recent assignment history':'ಇತ್ತೀಚಿನ ನಿಯೋಜನೆಗಳು', 'No recent assignment history.':'ಇತ್ತೀಚಿನ ನಿಯೋಜನೆಗಳಿಲ್ಲ.',
  'Add a volunteer':'ಸ್ವಯಂಸೇವಕರನ್ನು ಸೇರಿಸಿ', 'Add a person to the Bengaluru volunteer roster.':'Bengaluru ಸ್ವಯಂಸೇವಕರ ಪಟ್ಟಿಗೆ ವ್ಯಕ್ತಿಯನ್ನು ಸೇರಿಸಿ.', 'Update this volunteer’s profile and team.':'ಈ ಸ್ವಯಂಸೇವಕರ ಪ್ರೊಫೈಲ್ ಮತ್ತು ತಂಡವನ್ನು ನವೀಕರಿಸಿ.',
  'Full name':'ಪೂರ್ಣ ಹೆಸರು', 'e.g. Kavya Iyer':'ಉದಾ. Kavya Iyer', 'e.g. Team Echo':'ಉದಾ. Team Echo', 'name@example.com':'name@example.com',
  'No team':'ತಂಡವಿಲ್ಲ', 'Cancel':'ರದ್ದುಮಾಡಿ', 'Save Changes':'ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ', 'Select at least one skill.':'ಕನಿಷ್ಠ ಒಂದು ಕೌಶಲ್ಯ ಆಯ್ಕೆಮಾಡಿ.',
  'Please complete name, phone and email.':'ಹೆಸರು, ಫೋನ್ ಮತ್ತು ಇಮೇಲ್ ಭರ್ತಿ ಮಾಡಿ.', 'Enter a valid email address.':'ಸರಿಯಾದ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ.', 'Volunteer profile updated successfully.':'ಸ್ವಯಂಸೇವಕರ ಪ್ರೊಫೈಲ್ ನವೀಕರಿಸಲಾಗಿದೆ.', 'Volunteer added successfully.':'ಸ್ವಯಂಸೇವಕರನ್ನು ಸೇರಿಸಲಾಗಿದೆ.',
  'Volunteer assigned to team.':'ಸ್ವಯಂಸೇವಕರನ್ನು ತಂಡಕ್ಕೆ ಸೇರಿಸಲಾಗಿದೆ.', 'Volunteer removed from team.':'ಸ್ವಯಂಸೇವಕರನ್ನು ತಂಡದಿಂದ ತೆಗೆದುಹಾಕಲಾಗಿದೆ.', 'Availability added successfully.':'ಲಭ್ಯತೆಯನ್ನು ಸೇರಿಸಲಾಗಿದೆ.', 'Choose an end time after the start time.':'ಆರಂಭದ ನಂತರದ ಅಂತ್ಯ ಸಮಯ ಆಯ್ಕೆಮಾಡಿ.',
  'Keep this volunteer unassigned':'ಈ ಸ್ವಯಂಸೇವಕರನ್ನು ತಂಡವಿಲ್ಲದೆ ಇರಿಸಿ',
  'PEOPLE WORKING TOGETHER':'ಒಟ್ಟಾಗಿ ಕೆಲಸ ಮಾಡುವ ಜನರು', 'Build reliable crews for every food rescue.':'ಪ್ರತಿ ಆಹಾರ ರಕ್ಷಣೆಗೆ ವಿಶ್ವಾಸಾರ್ಹ ತಂಡಗಳನ್ನು ರಚಿಸಿ.', 'Create Team':'ತಂಡ ರಚಿಸಿ',
  'Stronger together':'ಒಟ್ಟಾಗಿ ಇನ್ನಷ್ಟು ಬಲ', 'Teams bring the right mix of people and skills to each pickup. Open a team to manage its members and leader.':'ಪ್ರತಿ ಸಂಗ್ರಹಕ್ಕೆ ಸೂಕ್ತ ಜನರು ಮತ್ತು ಕೌಶಲ್ಯಗಳನ್ನು ತಂಡಗಳು ಒಟ್ಟುಗೂಡಿಸುತ್ತವೆ. ಸದಸ್ಯರು ಮತ್ತು ನಾಯಕರನ್ನು ನಿರ್ವಹಿಸಲು ತಂಡವನ್ನು ತೆರೆಯಿರಿ.',
  'TEAM LEADER':'ತಂಡದ ನಾಯಕ', 'Members':'ಸದಸ್ಯರು', 'members':'ಸದಸ್ಯರು', 'members ·':'ಸದಸ್ಯರು ·', 'currently available':'ಈಗ ಲಭ್ಯ', 'active teams':'ಸಕ್ರಿಯ ತಂಡಗಳು', 'View Team':'ತಂಡ ವೀಕ್ಷಿಸಿ', 'Team details':'ತಂಡದ ವಿವರಗಳು', 'Coordinate membership and leadership for upcoming pickups.':'ಮುಂಬರುವ ಸಂಗ್ರಹಗಳಿಗೆ ಸದಸ್ಯರು ಮತ್ತು ನಾಯಕರನ್ನು ಸಂಯೋಜಿಸಿ.',
  'Leader':'ನಾಯಕ', 'Team members':'ತಂಡದ ಸದಸ್ಯರು', 'Add member':'ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ', 'Select volunteer':'ಸ್ವಯಂಸೇವಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ',
  '· moves from current team':'· ಪ್ರಸ್ತುತ ತಂಡದಿಂದ ಸ್ಥಳಾಂತರಿಸಿ', 'Move from another team':'ಬೇರೆ ತಂಡದಿಂದ ಸ್ಥಳಾಂತರಿಸಿ', 'Available for assignment':'ನಿಯೋಜನೆಗೆ ಲಭ್ಯ',
  'Leadership':'ನಾಯಕತ್ವ', 'A team leader is responsible for coordinating the crew at pickup.':'ಸಂಗ್ರಹ ಸ್ಥಳದಲ್ಲಿ ತಂಡವನ್ನು ಸಂಯೋಜಿಸುವುದು ತಂಡದ ನಾಯಕನ ಜವಾಬ್ದಾರಿ.', 'Change Leader':'ನಾಯಕರನ್ನು ಬದಲಿಸಿ', 'Add another member before changing the leader.':'ನಾಯಕರನ್ನು ಬದಲಿಸುವ ಮೊದಲು ಮತ್ತೊಬ್ಬ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ.',
  'Create a team':'ತಂಡ ರಚಿಸಿ', 'Start a new volunteer crew for Bengaluru pickups.':'Bengaluru ಸಂಗ್ರಹಗಳಿಗಾಗಿ ಹೊಸ ಸ್ವಯಂಸೇವಕ ತಂಡ ರಚಿಸಿ.', 'Team name':'ತಂಡದ ಹೆಸರು', 'Team leader':'ತಂಡದ ನಾಯಕ', 'Select a volunteer':'ಸ್ವಯಂಸೇವಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ', 'You can add more members after creating the team.':'ತಂಡ ರಚಿಸಿದ ನಂತರ ಹೆಚ್ಚಿನ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಬಹುದು.',
  'Add a team name and select a leader.':'ತಂಡದ ಹೆಸರು ಮತ್ತು ನಾಯಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ.', 'A team with this name already exists.':'ಈ ಹೆಸರಿನ ತಂಡ ಈಗಾಗಲೇ ಇದೆ.', 'Team created successfully.':'ತಂಡವನ್ನು ರಚಿಸಲಾಗಿದೆ.', 'Team member removed.':'ತಂಡದ ಸದಸ್ಯರನ್ನು ತೆಗೆದುಹಾಕಲಾಗಿದೆ.', 'Team leader updated.':'ತಂಡದ ನಾಯಕ ನವೀಕರಿಸಲಾಗಿದೆ.', 'Member added to team.':'ಸದಸ್ಯರನ್ನು ತಂಡಕ್ಕೆ ಸೇರಿಸಲಾಗಿದೆ.',
  'FOOD RESCUE PICKUPS':'ಆಹಾರ ರಕ್ಷಣಾ ಸಂಗ್ರಹಗಳು', 'Match volunteers and teams with upcoming rescue pickups.':'ಮುಂಬರುವ ಆಹಾರ ಸಂಗ್ರಹಗಳಿಗೆ ಸ್ವಯಂಸೇವಕರು ಮತ್ತು ತಂಡಗಳನ್ನು ಹೊಂದಿಸಿ.',
  'Pending response':'ಪ್ರತಿಕ್ರಿಯೆ ಬಾಕಿ', 'Active assignments':'ಸಕ್ರಿಯ ನಿಯೋಜನೆಗಳು', 'Completed pickups':'ಪೂರ್ಣಗೊಂಡ ಸಂಗ್ರಹಗಳು', 'All':'ಎಲ್ಲ', 'Search assignments':'ನಿಯೋಜನೆಗಳನ್ನು ಹುಡುಕಿ', 'Assignment status':'ನಿಯೋಜನೆಯ ಸ್ಥಿತಿ', 'Assignment ID':'ನಿಯೋಜನೆ ID', 'Event':'ಕಾರ್ಯಕ್ರಮ', 'Vehicle':'ವಾಹನ', 'shown':'ತೋರಿಸಲಾಗಿದೆ',
  'View assignment':'ನಿಯೋಜನೆ ವೀಕ್ಷಿಸಿ', 'Mark accepted':'ಸ್ವೀಕರಿಸಿದಂತೆ ಗುರುತಿಸಿ', 'Mark in progress':'ಪ್ರಗತಿಯಲ್ಲಿದೆ ಎಂದು ಗುರುತಿಸಿ', 'Mark completed':'ಪೂರ್ಣಗೊಂಡಿದೆ ಎಂದು ಗುರುತಿಸಿ', 'Cancel assignment':'ನಿಯೋಜನೆ ರದ್ದುಮಾಡಿ',
  'No assignments scheduled':'ನಿಯೋಜನೆಗಳಿಲ್ಲ', 'There are no assignments matching this view. Create a new pickup assignment or choose another status.':'ಈ ವೀಕ್ಷಣೆಗೆ ಹೊಂದುವ ನಿಯೋಜನೆಗಳಿಲ್ಲ. ಹೊಸ ನಿಯೋಜನೆ ರಚಿಸಿ ಅಥವಾ ಬೇರೆ ಸ್ಥಿತಿ ಆಯ್ಕೆಮಾಡಿ.',
  'Assignment records · Bengaluru chapter':'ನಿಯೋಜನೆ ದಾಖಲೆಗಳು · Bengaluru ಘಟಕ', 'Assignment details':'ನಿಯೋಜನೆಯ ವಿವರಗಳು', 'Pickup overview':'ಸಂಗ್ರಹ ವಿವರ', 'Expected meals':'ನಿರೀಕ್ಷಿತ ಊಟಗಳು', 'Registration':'ನೋಂದಣಿ ಸಂಖ್ಯೆ', 'Update status':'ಸ್ಥಿತಿ ನವೀಕರಿಸಿ', 'Track this assignment as the pickup progresses.':'ಸಂಗ್ರಹ ಮುಂದುವರಿದಂತೆ ನಿಯೋಜನೆಯ ಸ್ಥಿತಿಯನ್ನು ನವೀಕರಿಸಿ.', 'Cancel Assignment':'ನಿಯೋಜನೆ ರದ್ದುಮಾಡಿ',
  'Unable to update assignment. Please try again.':'ನಿಯೋಜನೆಯನ್ನು ನವೀಕರಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', 'Assignment cancelled.':'ನಿಯೋಜನೆ ರದ್ದಾಗಿದೆ.',
  'Match a pickup with the right people and resources.':'ಸಂಗ್ರಹಕ್ಕೆ ಸೂಕ್ತ ಜನರು ಮತ್ತು ಸಂಪನ್ಮೂಲಗಳನ್ನು ಹೊಂದಿಸಿ.', 'Select Event':'ಕಾರ್ಯಕ್ರಮ ಆಯ್ಕೆ', 'Select Driver':'ಚಾಲಕ ಆಯ್ಕೆ', 'Select Vehicle':'ವಾಹನ ಆಯ್ಕೆ', 'Review':'ಪರಿಶೀಲನೆ',
  'Select a pickup event':'ಸಂಗ್ರಹ ಕಾರ್ಯಕ್ರಮ ಆಯ್ಕೆಮಾಡಿ', 'Choose the food rescue requirement this assignment will support.':'ಈ ನಿಯೋಜನೆಗೆ ಸಂಬಂಧಿಸಿದ ಆಹಾರ ರಕ್ಷಣಾ ಅಗತ್ಯವನ್ನು ಆಯ್ಕೆಮಾಡಿ.', 'Available teams':'ಲಭ್ಯ ತಂಡಗಳು', 'Available volunteers':'ಲಭ್ಯ ಸ್ವಯಂಸೇವಕರು', 'Choose your volunteers':'ಸ್ವಯಂಸೇವಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ', 'Select an available team or an individual volunteer for':'ಲಭ್ಯ ತಂಡ ಅಥವಾ ಸ್ವಯಂಸೇವಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ:', 'Leader:':'ನಾಯಕ:', 'Assignment role':'ನಿಯೋಜನೆಯ ಪಾತ್ರ',
  'Select a driver':'ಚಾಲಕ ಆಯ್ಕೆಮಾಡಿ', 'Only available drivers with valid licences can be selected.':'ಮಾನ್ಯ ಪರವಾನಗಿ ಇರುವ ಲಭ್ಯ ಚಾಲಕರನ್ನು ಮಾತ್ರ ಆಯ್ಕೆಮಾಡಬಹುದು.', 'Licence valid':'ಪರವಾನಗಿ ಮಾನ್ಯವಾಗಿದೆ', 'Driver unavailable':'ಚಾಲಕ ಲಭ್ಯವಿಲ್ಲ', 'Driver licence expired':'ಚಾಲನಾ ಪರವಾನಗಿ ಅವಧಿ ಮುಗಿದಿದೆ', 'Drivers on a trip or with an expired licence are unavailable for new assignments.':'ಪ್ರಯಾಣದಲ್ಲಿರುವ ಅಥವಾ ಅವಧಿ ಮುಗಿದ ಪರವಾನಗಿ ಇರುವ ಚಾಲಕರಿಗೆ ಹೊಸ ನಿಯೋಜನೆ ನೀಡಲಾಗುವುದಿಲ್ಲ.',
  'Select a vehicle':'ವಾಹನ ಆಯ್ಕೆಮಾಡಿ', 'Choose a vehicle with enough capacity for the pickup.':'ಸಂಗ್ರಹಕ್ಕೆ ಸಾಕಷ್ಟು ಸಾಮರ್ಥ್ಯ ಇರುವ ವಾಹನ ಆಯ್ಕೆಮಾಡಿ.', 'Vehicle under maintenance':'ವಾಹನ ನಿರ್ವಹಣೆಯಲ್ಲಿದೆ', 'Currently on a trip':'ಈಗ ಪ್ರಯಾಣದಲ್ಲಿದೆ', 'Ready for pickup':'ಸಂಗ್ರಹಕ್ಕೆ ಸಿದ್ಧ',
  'Review assignment':'ನಿಯೋಜನೆಯನ್ನು ಪರಿಶೀಲಿಸಿ', 'Confirm the pickup details before creating the assignment.':'ನಿಯೋಜನೆ ರಚಿಸುವ ಮೊದಲು ಸಂಗ್ರಹ ವಿವರಗಳನ್ನು ದೃಢಪಡಿಸಿ.', 'Ready to schedule':'ನಿಗದಿಪಡಿಸಲು ಸಿದ್ಧ', 'Food rescue pickup':'ಆಹಾರ ರಕ್ಷಣಾ ಸಂಗ್ರಹ', 'Pickup time':'ಸಂಗ್ರಹ ಸಮಯ', 'This assignment will be added with a':'ಈ ನಿಯೋಜನೆಯನ್ನು', 'status.':'ಸ್ಥಿತಿಯಲ್ಲಿ ಸೇರಿಸಲಾಗುತ್ತದೆ.', 'Back':'ಹಿಂದೆ', 'Continue':'ಮುಂದುವರಿಸಿ', 'Creating…':'ರಚಿಸಲಾಗುತ್ತಿದೆ…', 'Step':'ಹಂತ', 'of 5':'/ 5',
  'Choose an option before continuing.':'ಮುಂದುವರಿಯುವ ಮೊದಲು ಒಂದು ಆಯ್ಕೆಮಾಡಿ.', 'Cannot assign this volunteer. Volunteer already has another assignment during this time.':'ಈ ಸ್ವಯಂಸೇವಕರಿಗೆ ನಿಯೋಜನೆ ನೀಡಲಾಗುವುದಿಲ್ಲ. ಇದೇ ಸಮಯದಲ್ಲಿ ಮತ್ತೊಂದು ನಿಯೋಜನೆ ಇದೆ.', 'Complete each assignment step first.':'ಮೊದಲು ಎಲ್ಲಾ ನಿಯೋಜನೆ ಹಂತಗಳನ್ನು ಪೂರ್ಣಗೊಳಿಸಿ.', 'Assignment Created Successfully · Pending':'ನಿಯೋಜನೆ ರಚಿಸಲಾಗಿದೆ · ಬಾಕಿ',
  'Cannot assign this volunteer. They are not currently available.':'ಈ ಸ್ವಯಂಸೇವಕರಿಗೆ ನಿಯೋಜನೆ ನೀಡಲಾಗುವುದಿಲ್ಲ. ಅವರು ಈಗ ಲಭ್ಯವಿಲ್ಲ.',
  'Pickup & Logistics':'ಸಂಗ್ರಹ ಮತ್ತು ಸಾಗಣೆ', 'FOOD RESCUE LOGISTICS':'ಆಹಾರ ರಕ್ಷಣಾ ಸಾಗಣೆ ನಿರ್ವಹಣೆ',
  'Plan pickups, assign crews and vehicles, and follow every delivery.':'ಸಂಗ್ರಹಗಳನ್ನು ಯೋಜಿಸಿ, ತಂಡ ಮತ್ತು ವಾಹನಗಳನ್ನು ನಿಯೋಜಿಸಿ, ಪ್ರತಿ ವಿತರಣೆಯನ್ನು ಗಮನಿಸಿ.',
  'Pickups':'ಸಂಗ್ರಹಗಳು', 'No pickups yet':'ಇನ್ನೂ ಸಂಗ್ರಹಗಳಿಲ್ಲ',
  'Approved food requests will appear here once the live connection is ready.':'ಲೈವ್ ಸಂಪರ್ಕ ಸಿದ್ಧವಾದಾಗ ಅನುಮೋದಿತ ಆಹಾರ ವಿನಂತಿಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.',
  'Planned':'ಯೋಜಿತ', 'En Route':'ಮಾರ್ಗದಲ್ಲಿ', 'Arrived At Donor':'ದಾನಿಯ ಸ್ಥಳ ತಲುಪಿದೆ', 'Food Collected':'ಆಹಾರ ಸಂಗ್ರಹಿಸಲಾಗಿದೆ', 'Delivered':'ತಲುಪಿಸಲಾಗಿದೆ', 'Failed':'ವಿಫಲ',
  'Schedule Pickup':'ಸಂಗ್ರಹವನ್ನು ನಿಗದಿಪಡಿಸಿ', 'Pickup sections':'ಸಂಗ್ರಹ ವಿಭಾಗಗಳು', 'Loading pickups…':'ಸಂಗ್ರಹಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…', 'Retry':'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  'Search pickups':'ಸಂಗ್ರಹಗಳನ್ನು ಹುಡುಕಿ', 'Pickup ID':'ಸಂಗ್ರಹ ID', 'Delivery Address':'ವಿತರಣಾ ವಿಳಾಸ', 'Window Time':'ಸಮಯದ ಕಿಟಕಿ',
  'Pickups records · Bengaluru chapter':'ಸಂಗ್ರಹ ದಾಖಲೆಗಳು · Bengaluru ಘಟಕ', 'Load more':'ಇನ್ನಷ್ಟು ಲೋಡ್ ಮಾಡಿ', 'Loading…':'ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…',
  'Pickup details':'ಸಂಗ್ರಹ ವಿವರಗಳು', 'Pickup progress':'ಸಂಗ್ರಹ ಪ್ರಗತಿ', 'View details':'ವಿವರಗಳನ್ನು ವೀಕ್ಷಿಸಿ', 'Window Start':'ಆರಂಭದ ಸಮಯ', 'Window End':'ಅಂತ್ಯದ ಸಮಯ', 'Food Request':'ಆಹಾರ ವಿನಂತಿ', 'Created':'ರಚಿಸಲಾಗಿದೆ',
  'Assign Crew & Vehicle':'ತಂಡ ಮತ್ತು ವಾಹನವನ್ನು ನಿಯೋಜಿಸಿ', 'Admin Actions':'ನಿರ್ವಾಹಕ ಕ್ರಿಯೆಗಳು', 'Deliver':'ತಲುಪಿಸಿ', 'Reason for Cancellation / Failure':'ರದ್ದತಿ / ವೈಫಲ್ಯದ ಕಾರಣ',
  'Enter reason':'ಕಾರಣವನ್ನು ನಮೂದಿಸಿ', 'Fail':'ವಿಫಲಗೊಳಿಸಿ', 'Vehicle view':'ವಾಹನದ ನೋಟ', 'Module 3 vehicle assignment projection.':'ಮಾಡ್ಯೂಲ್ 3 ವಾಹನ ನಿಯೋಜನೆ ಪ್ರೊಜೆಕ್ಷನ್.',
  'Loading vehicle schedule…':'ವಾಹನ ವೇಳಾಪಟ್ಟಿಯನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…', 'No active projection items for this vehicle.':'ಈ ವಾಹನಕ್ಕೆ ಯಾವುದೇ ಸಕ್ರಿಯ ಪ್ರೊಜೆಕ್ಷನ್ ಐಟಂಗಳಿಲ್ಲ.',
  'Assign volunteers, driver, and vehicle for this pickup.':'ಈ ಸಂಗ್ರಹಕ್ಕಾಗಿ ಸ್ವಯಂಸೇವಕರು, ಚಾಲಕ ಮತ್ತು ವಾಹನವನ್ನು ನಿಯೋಜಿಸಿ.', 'Select Volunteers':'ಸ್ವಯಂಸೇವಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ',
  'Containers':'ಪಾತ್ರೆಗಳು', 'Review Assignment':'ನಿಯೋಜನೆಯನ್ನು ಪರಿಶೀಲಿಸಿ', 'Choose participating volunteers for this pickup.':'ಈ ಸಂಗ್ರಹಕ್ಕಾಗಿ ಭಾಗವಹಿಸುವ ಸ್ವಯಂಸೇವಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
  'Waiting for Team 1 API':'ಟೀಮ್ 1 API ಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ', 'Volunteer roster endpoint is not available yet.':'ಸ್ವಯಂಸೇವಕರ ಪಟ್ಟಿ ಅಂತಿಮ ಬಿಂದು ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ.',
  'No active volunteers found.':'ಯಾವುದೇ ಸಕ್ರಿಯ ಸ್ವಯಂಸೇವಕರು ಕಂಡುಬಂದಿಲ್ಲ.', 'Choose an authorized driver with a valid licence.':'ಮಾನ್ಯ ಪರವಾನಗಿ ಹೊಂದಿರುವ ಅಧಿಕೃತ ಚಾಲಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
  'Waiting for Team 5 API':'ಟೀಮ್ 5 API ಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ', 'Drivers registry endpoint is not available yet.':'ಚಾಲಕರ ನೋಂದಣಿ ಅಂತಿಮ ಬಿಂದು ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ.',
  'No available drivers found.':'ಯಾವುದೇ ಲಭ್ಯವಿರುವ ಚಾಲಕರು ಕಂಡುಬಂದಿಲ್ಲ.', 'Choose an active vehicle with sufficient capacity.':'ಸಾಕಷ್ಟು ಸಾಮರ್ಥ್ಯವಿರುವ ಸಕ್ರಿಯ ವಾಹನವನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
  'Vehicles fleet endpoint is not available yet.':'ವಾಹನಗಳ ಫ್ಲೀಟ್ ಅಂತಿಮ ಬಿಂದು ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ.', 'No available vehicles found.':'ಯಾವುದೇ ಲಭ್ಯವಿರುವ ವಾಹನಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',
  'Containers & Load':'ಪಾತ್ರೆಗಳು ಮತ್ತು ಲೋಡ್', 'Specify the containers required for food rescue.':'ಆಹಾರ ರಕ್ಷಣೆಗೆ ಅಗತ್ಯವಿರುವ ಪಾತ್ರೆಗಳನ್ನು ಸೂಚಿಸಿ.',
  'Container Count':'ಪಾತ್ರೆಗಳ ಸಂಖ್ಯೆ', 'Estimated Load (kg)':'ಅಂದಾಜು ಲೋಡ್ (ಕೆಜಿ)', 'Confirm the details before dispatching the crew.':'ತಂಡವನ್ನು ಕಳುಹಿಸುವ ಮೊದಲು ವಿವರಗಳನ್ನು ದೃಢೀಕರಿಸಿ.',
  'Confirm Assignment':'ನಿಯೋಜನೆಯನ್ನು ದೃಢೀಕರಿಸಿ', 'Schedule food rescue for an approved food request.':'ಅನುಮೋದಿತ ಆಹಾರ ವಿನಂತಿಗಾಗಿ ಆಹಾರ ರಕ್ಷಣೆಯನ್ನು ನಿಗದಿಪಡಿಸಿ.',
  'Demo food requests (Waiting for Team 2 API)':'ಡೆಮೊ ಆಹಾರ ವಿನಂತಿಗಳು (ಟೀಮ್ 2 API ಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ)', 'Enter destination address':'ಗಮ್ಯಸ್ಥಾನದ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ',
  'AI Logistics':'ಎಐ ಸಾಗಣೆ ನಿರ್ವಹಣೆ', 'AI Logistics Assessment':'ಎಐ ಸಾಗಣೆ ಮೌಲ್ಯಮಾಪನ', 'Recommended Vehicle':'ಶಿಫಾರಸು ಮಾಡಿದ ವಾಹನ',
  'Required Vessels':'ಅಗತ್ಯವಿರುವ ಪಾತ್ರೆಗಳು', 'Estimated Food Load':'ಅಂದಾಜು ಆಹಾರ ಲೋಡ್', 'Food Safety & Handling':'ಆಹಾರ ಸುರಕ್ಷತೆ ಮತ್ತು ನಿರ್ವಹಣೆ',
  'Apply AI Vessels':'ಎಐ ಪಾತ್ರೆಗಳನ್ನು ಅನ್ವಯಿಸಿ', 'AI Vehicle Match':'ಎಐ ವಾಹನ ಹೊಂದಾಣಿಕೆ', 'AI Recommended':'ಎಐ ಶಿಫಾರಸು', 'AI Logistics Recommendation':'ಎಐ ಸಾಗಣೆ ಶಿಫಾರಸು',
  'Mark En Route':'ಮಾರ್ಗದಲ್ಲಿದೆ ಎಂದು ಗುರುತಿಸಿ', 'Assign Crew':'ತಂಡ ನಿಯೋಜಿಸಿ', 'Sync Donor Requests':'ದಾನಿಗಳ ವಿನಂತಿಗಳನ್ನು ಸಿಂಕ್ ಮಾಡಿ',
  'Pickup & Delivery Route':'ಸಂಗ್ರಹ ಮತ್ತು ವಿತರಣಾ ಮಾರ್ಗ', 'Pickup from:':'ಇಲ್ಲಿಂದ ಸಂಗ್ರಹಿಸಿ:', '📍 Pickup from:':'📍 ಇಲ್ಲಿಂದ ಸಂಗ್ರಹಿಸಿ:', 'Deliver to NGO:':'ಎನ್‌ಜಿಒಗೆ ತಲುಪಿಸಿ:', '➔ Deliver to NGO:':'➔ ಎನ್‌ಜಿಒಗೆ ತಲುಪಿಸಿ:', 'Food to collect:':'ಸಂಗ್ರಹಿಸಬೇಕಾದ ಆಹಾರ:', '🥘 Food to collect:':'🥘 ಸಂಗ್ರಹಿಸಬೇಕಾದ ಆಹಾರ:',
  'Coordinator preferences':'ಸಂಯೋಜಕರ ಆದ್ಯತೆಗಳು', 'Coordinator preferences for this volunteer management demo.':'ಈ ಸ್ವಯಂಸೇವಕರ ನಿರ್ವಹಣಾ ಮಾದರಿಯ ಆದ್ಯತೆಗಳು.', 'Chapter information':'ಘಟಕದ ಮಾಹಿತಿ', 'The operational context shown throughout this prototype.':'ಈ ಮಾದರಿಯಲ್ಲಿ ತೋರಿಸುವ ಕಾರ್ಯಾಚರಣೆಯ ಮಾಹಿತಿ.', 'Organisation':'ಸಂಸ್ಥೆ', 'Chapter':'ಘಟಕ', 'Adjust how this local demo presents updates.':'ಈ ಸ್ಥಳೀಯ ಮಾದರಿಯಲ್ಲಿ ನವೀಕರಣಗಳನ್ನು ಹೇಗೆ ತೋರಿಸಬೇಕು ಎಂಬುದನ್ನು ಹೊಂದಿಸಿ.', 'Show success notifications':'ಯಶಸ್ಸಿನ ಅಧಿಸೂಚನೆಗಳನ್ನು ತೋರಿಸಿ', 'Confirm when local records are changed':'ಸ್ಥಳೀಯ ದಾಖಲೆಗಳು ಬದಲಾದಾಗ ತಿಳಿಸಿ', 'Volunteer, team and assignment changes are kept in this browser session.':'ಸ್ವಯಂಸೇವಕ, ತಂಡ ಮತ್ತು ನಿಯೋಜನೆ ಬದಲಾವಣೆಗಳು ಈ ಬ್ರೌಸರ್ ಅವಧಿಯಲ್ಲಿ ಮಾತ್ರ ಉಳಿಯುತ್ತವೆ.',
  'Administrator account':'ನಿರ್ವಾಹಕ ಖಾತೆ', 'Connect a verified account to the shared API.':'ಹಂಚಿಕೆಯ API ಗೆ ದೃಢೀಕರಿಸಿದ ಖಾತೆಯನ್ನು ಸಂಪರ್ಕಿಸಿ.', 'Live sign in is not configured on this device.':'ಈ ಸಾಧನದಲ್ಲಿ ನೇರ ಪ್ರವೇಶವನ್ನು ಹೊಂದಿಸಲಾಗಿಲ್ಲ.', 'API role':'API ಪಾತ್ರ', 'Password':'ಪಾಸ್‌ವರ್ಡ್', 'Sign in':'ಪ್ರವೇಶಿಸಿ', 'Signing in…':'ಪ್ರವೇಶಿಸಲಾಗುತ್ತಿದೆ…', 'Sign out':'ನಿರ್ಗಮಿಸಿ', 'Signed out.':'ನಿರ್ಗಮಿಸಲಾಗಿದೆ.', 'Could not sign out. Try again.':'ನಿರ್ಗಮಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', 'Could not restore the administrator session.':'ನಿರ್ವಾಹಕ ಅವಧಿಯನ್ನು ಮರುಸ್ಥಾಪಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', 'Sign in failed or administrator access is unavailable.':'ಪ್ರವೇಶ ವಿಫಲವಾಗಿದೆ ಅಥವಾ ನಿರ್ವಾಹಕ ಅನುಮತಿ ಲಭ್ಯವಿಲ್ಲ.', 'Volunteer, team and assignment records remain demo data.':'ಸ್ವಯಂಸೇವಕ, ತಂಡ ಮತ್ತು ನಿಯೋಜನೆ ದಾಖಲೆಗಳು ಡೆಮೊ ಮಾಹಿತಿಯಾಗಿಯೇ ಇರುತ್ತವೆ.',
  'Wedding':'ವಿವಾಹ', 'Corporate Event':'ಕಾರ್ಪೊರೇಟ್ ಕಾರ್ಯಕ್ರಮ', 'Community Event':'ಸಮುದಾಯ ಕಾರ್ಯಕ್ರಮ', 'Reception':'ಸ್ವಾಗತ ಸಮಾರಂಭ', 'Campus Event':'ಕ್ಯಾಂಪಸ್ ಕಾರ್ಯಕ್ರಮ', 'Festival':'ಹಬ್ಬ',
  'Akshaya Ahar':'ಅಕ್ಷಯ ಆಹಾರ', 'Share surplus food, feed more people':'ಉಳಿದ ಆಹಾರ ಹಂಚಿ, ಹೆಚ್ಚು ಜನರಿಗೆ ಊಟ ನೀಡಿ', 'Home':'ಮುಖಪುಟ', 'Main menu':'ಮುಖ್ಯ ಮೆನು', 'Join as food donor':'ಆಹಾರ ದಾನಿಯಾಗಿ ಸೇರಿ', 'Food donor':'ಆಹಾರ ದಾನಿ',
  'NGO admin':'ಎನ್‌ಜಿಒ ನಿರ್ವಾಹಕ', 'NGO administration':'ಎನ್‌ಜಿಒ ಆಡಳಿತ', 'Open admin dashboard':'ನಿರ್ವಾಹಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ತೆರೆಯಿರಿ',
  'Manage volunteers, teams and pickup assignments for the NGO.':'ಎನ್‌ಜಿಒಗಾಗಿ ಸ್ವಯಂಸೇವಕರು, ತಂಡಗಳು ಮತ್ತು ಸಂಗ್ರಹ ನಿಯೋಜನೆಗಳನ್ನು ನಿರ್ವಹಿಸಿ.',
  'Good food from your event can feed someone tonight.':'ನಿಮ್ಮ ಕಾರ್ಯಕ್ರಮದ ಉತ್ತಮ ಆಹಾರ ಇಂದು ರಾತ್ರಿ ಯಾರಿಗಾದರೂ ಊಟವಾಗಬಹುದು.', 'Akshaya Ahar connects function halls and event hosts with volunteers who collect surplus food and deliver it to people in need.':'ಅಕ್ಷಯ ಆಹಾರವು ಸಮಾರಂಭ ಭವನಗಳು ಮತ್ತು ಕಾರ್ಯಕ್ರಮ ಆಯೋಜಕರನ್ನು, ಉಳಿದ ಆಹಾರವನ್ನು ಸಂಗ್ರಹಿಸಿ ಅಗತ್ಯವಿರುವವರಿಗೆ ತಲುಪಿಸುವ ಸ್ವಯಂಸೇವಕರೊಂದಿಗೆ ಸಂಪರ್ಕಿಸುತ್ತದೆ.',
  'Tell us what food is left and where. The pickup team collects it from the hall.':'ಯಾವ ಆಹಾರ ಉಳಿದಿದೆ ಮತ್ತು ಎಲ್ಲಿದೆ ಎಂದು ತಿಳಿಸಿ. ಸಂಗ್ರಹ ತಂಡವು ಅದನ್ನು ಭವನದಿಂದ ಸಂಗ್ರಹಿಸುತ್ತದೆ.', 'Coordinate volunteers, teams and pickup assignments.':'ಸ್ವಯಂಸೇವಕರು, ತಂಡಗಳು ಮತ್ತು ಸಂಗ್ರಹ ನಿಯೋಜನೆಗಳನ್ನು ಸಂಯೋಜಿಸಿ.',
  'Vehicles':'ವಾಹನಗಳು', 'vehicles':'ವಾಹನಗಳು', 'Vehicle Details & Fleet':'ವಾಹನ ವಿವರಗಳು ಮತ್ತು ಫ್ಲೀಟ್', 'FLEET & LOGISTICS':'ಫ್ಲೀಟ್ ಮತ್ತು ಲಾಜಿಸ್ಟಿಕ್ಸ್',
  'Maintain canonical vehicle inventory, payload capacity, and service history.':'ವಾಹನ ಸಂಗ್ರಹ, ಸಾಗಣೆ ಸಾಮರ್ಥ್ಯ ಮತ್ತು ನಿರ್ವಹಣಾ ಇತಿಹಾಸವನ್ನು ನಿರ್ವಹಿಸಿ.',
  'Fleet Registry':'ಫ್ಲೀಟ್ ನೋಂದಣಿ', 'Maintenance Logs':'ನಿರ್ವಹಣಾ ದಾಖಲೆಗಳು', 'Total Fleet':'ಒಟ್ಟು ಫ್ಲೀಟ್', 'Registered vehicles':'ನೋಂದಾಯಿತ ವಾಹನಗಳು',
  'Ready for dispatch':'ರವಾನೆಗೆ ಸಿದ್ಧ', 'Under service or repair':'ಸೇವೆ ಅಥವಾ ದುರಸ್ತಿಯಲ್ಲಿದೆ',
  'Track transport capacity, size specs, indicative vessels, and maintenance readiness.':'ಸಾರಿಗೆ ಸಾಮರ್ಥ್ಯ, ಗಾತ್ರ, ಪಾತ್ರೆಗಳ ಅಂದಾಜು ಮತ್ತು ನಿರ್ವಹಣಾ ಸ್ಥಿತಿಯನ್ನು ಗಮನಿಸಿ.',
  'Add Vehicle':'ವಾಹನ ಸೇರಿಸಿ', 'Edit Vehicle':'ವಾಹನ ತಿದ್ದುಪಡಿ ಮಾಡಿ', 'Register a new transport vehicle for food recovery dispatches.':'ಆಹಾರ ಸಂಗ್ರಹ ರವಾನೆಗಾಗಿ ಹೊಸ ಸಾರಿಗೆ ವಾಹನವನ್ನು ನೋಂದಾಯಿಸಿ.',
  'Update specifications and status for this vehicle.':'ಈ ವಾಹನದ ವಿಶೇಷಣಗಳು ಮತ್ತು ಸ್ಥಿತಿಯನ್ನು ನವೀಕರಿಸಿ.', 'Registration Number':'ನೋಂದಣಿ ಸಂಖ್ಯೆ',
  'e.g. KA-01-AB-1234':'ಉದಾ. KA-01-AB-1234', 'e.g. 250':'ಉದಾ. 250', 'e.g. 12':'ಉದಾ. 12', 'Vehicle Type':'ವಾಹನದ ಪ್ರಕಾರ',
  'Size Category':'ಗಾತ್ರದ ವರ್ಗ', 'Payload Capacity (kg)':'ಸಾಗಣೆ ಸಾಮರ್ಥ್ಯ (ಕೆಜಿ)', 'Payload Capacity':'ಸಾಗಣೆ ಸಾಮರ್ಥ್ಯ',
  'Indicative Vessel Capacity':'ಪಾತ್ರೆಗಳ ಸೂಚಕ ಸಾಮರ್ಥ್ಯ', 'Indicative Vessels':'ಸೂಚಕ ಪಾತ್ರೆಗಳು', 'Assigned Driver':'ನಿಯೋಜಿತ ಚಾಲಕ',
  'Save Vehicle':'ವಾಹನ ಉಳಿಸಿ', 'All Vehicle Types':'ಎಲ್ಲ ವಾಹನ ಪ್ರಕಾರಗಳು', 'All Statuses':'ಎಲ್ಲ ಸ್ಥಿತಿಗಳು', 'Any Capacity':'ಯಾವುದೇ ಸಾಮರ್ಥ್ಯ',
  'Small (up to 250 kg)':'ಸಣ್ಣ (250 ಕೆಜಿ ವರೆಗೆ)', 'Medium (251–500 kg)':'ಮಧ್ಯಮ (251–500 ಕೆಜಿ)', 'Large (above 500 kg)':'ದೊಡ್ಡ (500 ಕೆಜಿ ಮೇಲ್ಪಟ್ಟು)',
  'Any Maintenance':'ಯಾವುದೇ ನಿರ್ವಹಣೆ', 'Overdue for service':'ಸೇವೆಯ ಅವಧಿ ಮೀರಿದೆ', 'Due in 14 days':'14 ದಿನಗಳಲ್ಲಿ ಬಾಕಿ',
  'Search registration, driver…':'ನೋಂದಣಿ, ಚಾಲಕರನ್ನು ಹುಡುಕಿ…', 'Van':'ವ್ಯಾನ್', 'Mini Truck':'ಮಿನಿ ಟ್ರಕ್', 'Tempo':'ಟೆಂಪೋ', 'Truck':'ಟ್ರಕ್', 'Auto Rickshaw':'ಆಟೋ ರಿಕ್ಷಾ',
  'Type & Size':'ಪ್ರಕಾರ ಮತ್ತು ಗಾತ್ರ', 'Capacity (kg)':'ಸಾಮರ್ಥ್ಯ (ಕೆಜಿ)', 'Next Service':'ಮುಂದಿನ ಸೇವೆ', 'View Details':'ವಿವರಗಳನ್ನು ವೀಕ್ಷಿಸಿ',
  'Edit Specs':'ವಿಶೇಷಣಗಳನ್ನು ತಿದ್ದುಪಡಿ ಮಾಡಿ', 'No vehicles match the filter criteria':'ಯಾವುದೇ ವಾಹನಗಳು ಫಿಲ್ಟರ್‌ಗೆ ಹೊಂದುತ್ತಿಲ್ಲ',
  'Adjust your search query or reset the filters to view the fleet register.':'ಫ್ಲೀಟ್ ನೋಂದಣಿಯನ್ನು ವೀಕ್ಷಿಸಲು ಹುಡುಕಾಟ ಅಥವಾ ಫಿಲ್ಟರ್‌ಗಳನ್ನು ಸರಿಹೊಂದಿಸಿ.',
  'Track inspection history, scheduled maintenance, and safety alerts.':'ತಪಾಸಣೆ ಇತಿಹಾಸ, ನಿಗದಿತ ನಿರ್ವಹಣೆ ಮತ್ತು ಸುರಕ್ಷತಾ ಎಚ್ಚರಿಕೆಗಳನ್ನು ಗಮನಿಸಿ.',
  'Log Service':'ಸೇವೆ ದಾಖಲಿಸಿ', 'Log Vehicle Maintenance':'ವಾಹನ ನಿರ್ವಹಣೆಯನ್ನು ದಾಖಲಿಸಿ',
  'Record inspection, repairs, fitness checks, and next due schedule.':'ತಪಾಸಣೆ, ದುರಸ್ತಿ, ಫಿಟ್ನೆಸ್ ಪರಿಶೀಲನೆ ಮತ್ತು ಮುಂದಿನ ದಿನಾಂಕವನ್ನು ದಾಖಲಿಸಿ.',
  'Recording an UNSAFE condition will automatically take this vehicle out of service.':'ಅಸುರಕ್ಷಿತ ಸ್ಥಿತಿಯನ್ನು ದಾಖಲಿಸುವುದರಿಂದ ಈ ವಾಹನವನ್ನು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸೇವೆಯಿಂದ ಹಿಂಪಡೆಯಲಾಗುತ್ತದೆ.',
  'Save Record':'ದಾಖಲೆ ಉಳಿಸಿ', 'Service Date':'ಸೇವಾ ದಿನಾಂಕ', 'Service Type':'ಸೇವಾ ಪ್ರಕಾರ', 'Vehicle Condition After Service':'ಸೇವೆಯ ನಂತರ ವಾಹನದ ಸ್ಥಿತಿ',
  'Good · Safe for operational dispatch':'ಉತ್ತಮ · ಕಾರ್ಯಾಚರಣೆಯ ರವಾನೆಗೆ ಸುರಕ್ಷಿತ', 'Needs Attention · Service required soon':'ಗಮನ ಅಗತ್ಯ · ಶೀಘ್ರದಲ್ಲೇ ಸೇವೆ ಅಗತ್ಯ',
  'Unsafe · Immediate fault, vehicle set to Maintenance':'ಅಸುರಕ್ಷಿತ · ತಕ್ಷಣದ ದೋಷ, ವಾಹನ ನಿರ್ವಹಣೆಗೆ ನಿಗದಿ',
  'Service Summary & Notes':'ಸೇವಾ ಸಾರಾಂಶ ಮತ್ತು ಟಿಪ್ಪಣಿಗಳು', 'Details of service performed, parts replaced, or fitness test notes.':'ನಿರ್ವಹಿಸಿದ ಸೇವೆ, ಬದಲಾಯಿಸಿದ ಭಾಗಗಳು ಅಥವಾ ಫಿಟ್ನೆಸ್ ಟಿಪ್ಪಣಿಗಳ ವಿವರಗಳು.',
  'Next Service Due Date':'ಮುಂದಿನ ಸೇವಾ ದಿನಾಂಕ', 'Search service logs, summary…':'ಸೇವಾ ದಾಖಲೆಗಳು, ಸಾರಾಂಶ ಹುಡುಕಿ…', 'All Vehicles':'ಎಲ್ಲ ವಾಹನಗಳು',
  'All Conditions':'ಎಲ್ಲ ಸ್ಥಿತಿಗಳು', 'Condition':'ಸ್ಥಿತಿ', 'Good (Operational)':'ಉತ್ತಮ (ಕಾರ್ಯಾಚರಣೆಯಲ್ಲಿದೆ)', 'Needs Service':'ಸೇವೆ ಅಗತ್ಯವಿದೆ',
  'Unsafe (Critical Fault)':'ಅಸುರಕ್ಷಿತ (ಗಂಭೀರ ದೋಷ)', 'Summary & Work Done':'ಸಾರಾಂಶ ಮತ್ತು ಮಾಡಿದ ಕೆಲಸ', 'Next Due Date':'ಮುಂದಿನ ಬಾಕಿ ದಿನಾಂಕ',
  'Recorded By':'ದಾಖಲಿಸಿದವರು', 'service records':'ನಿರ್ವಹಣಾ ದಾಖಲೆಗಳು', 'No maintenance records found':'ಯಾವುದೇ ನಿರ್ವಹಣಾ ದಾಖಲೆಗಳು ಕಂಡುಬಂದಿಲ್ಲ',
  'Try adjusting your filter options or log a new maintenance event.':'ಫಿಲ್ಟರ್ ಆಯ್ಕೆಗಳನ್ನು ಬದಲಾಯಿಸಿ ಅಥವಾ ಹೊಸ ನಿರ್ವಹಣಾ ದಾಖಲೆಯನ್ನು ಸೇರಿಸಿ.',
  'Primary Assigned Driver':'ಮುಖ್ಯ ನಿಯೋಜಿತ ಚಾಲಕ', 'No driver assigned to this vehicle currently.':'ಈ ವಾಹನಕ್ಕೆ ಪ್ರಸ್ತುತ ಯಾವುದೇ ಚಾಲಕರನ್ನು ನಿಯೋಜಿಸಲಾಗಿಲ್ಲ.',
  'Current Trips & Assignments':'ಪ್ರಸ್ತುತ ಪ್ರಯಾಣಗಳು ಮತ್ತು ನಿಯೋಜನೆಗಳು', 'Module 3 Projection':'ಮಾಡ್ಯೂಲ್ 3 ಪ್ರೊಜೆಕ್ಷನ್',
  'Read-only projection derived from central Pickup & Logistics assignments.':'ಕೇಂದ್ರ ಪಿಕಪ್ ಮತ್ತು ಲಾಜಿಸ್ಟಿಕ್ಸ್ ನಿಯೋಜನೆಗಳಿಂದ ಪಡೆದ ಓದಲು-ಮಾತ್ರ ಪ್ರೊಜೆಕ್ಷನ್.',
  'No active or scheduled assignments for this vehicle.':'ಈ ವಾಹನಕ್ಕೆ ಯಾವುದೇ ಸಕ್ರಿಯ ಅಥವಾ ನಿಗದಿತ ನಿಯೋಜನೆಗಳಿಲ್ಲ.', 'Maintenance Records':'ನಿರ್ವಹಣಾ ದಾಖಲೆಗಳು',
  'No service logs recorded yet.':'ಇನ್ನೂ ಯಾವುದೇ ಸೇವಾ ದಾಖಲೆಗಳು ದಾಖಲಾಗಿಲ್ಲ.', 'Overdue':'ಅವಧಿ ಮೀರಿದೆ', 'vessels':'ಪಾತ್ರೆಗಳು',
  'Indicative Max Vessels':'ಅಂದಾಜು ಗರಿಷ್ಠ ಪಾತ್ರೆಗಳು', 'Vehicle ID':'ವಾಹನ ಐಡಿ',
  'Food Pickup Vehicle':'ಆಹಾರ ಸಂಗ್ರಹ ವಾಹನ', 'KA 01 AB 1234':'KA 01 AB 1234',
  'Live Vehicle Location':'ಲೈವ್ ವಾಹನ ಸ್ಥಳ',
  'Location sharing requires the driver\'s permission.':'ಸ್ಥಳ ಹಂಚಿಕೆಗೆ ಚಾಲಕರ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ.',
  'Rahul Kumar':'Rahul Kumar', 'Real-time location monitoring for food pickup vehicles':'ಆಹಾರ ಸಂಗ್ರಹ ವಾಹನಗಳ ನೈಜ-ಸಮಯದ ಸ್ಥಳ ಮೇಲ್ವಿಚಾರಣೆ',
  'Start Tracking':'ಟ್ರ್ಯಾಕಿಂಗ್ ಪ್ರಾರಂಭಿಸಿ', 'Start tracking to display the vehicle location':'ವಾಹನದ ಸ್ಥಳವನ್ನು ಪ್ರದರ್ಶಿಸಲು ಟ್ರ್ಯಾಕಿಂಗ್ ಪ್ರಾರಂಭಿಸಿ',
  'Stop Tracking':'ಟ್ರ್ಯಾಕಿಂಗ್ ನಿಲ್ಲಿಸಿ', 'Vehicle location map':'ವಾಹನ ಸ್ಥಳದ ನಕ್ಷೆ',
  'Food & Donors':'ಆಹಾರ ಮತ್ತು ದಾನಿಗಳು', 'FOOD & DONOR MANAGEMENT':'ಆಹಾರ ಮತ್ತು ದಾನಿಗಳ ನಿರ್ವಹಣೆ',
  'Vehicle Tracking':'ವಾಹನ ಟ್ರ್ಯಾಕಿಂಗ್', 'Vehicle Details':'ವಾಹನ ವಿವರಗಳು',
  'Donor requests and food details belong to the shared Food & Donor module.':'ದಾನಿಗಳ ವಿನಂತಿಗಳು ಮತ್ತು ಆಹಾರದ ವಿವರಗಳು ಹಂಚಿಕೆಯ ಆಹಾರ ಮತ್ತು ದಾನಿಗಳ ಘಟಕಕ್ಕೆ ಸೇರಿವೆ.',
  'Admin food requests are not connected yet':'ನಿರ್ವಾಹಕರ ಆಹಾರ ವಿನಂತಿಗಳು ಇನ್ನೂ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ',
  'The donor form is available as a local prototype. Its submissions stay in this browser; they do not create server records.':'ದಾನಿಗಳ ಅರ್ಜಿ ಸ್ಥಳೀಯ ಮಾದರಿಯಾಗಿ ಲಭ್ಯವಿದೆ. ಅದರ ಸಲ್ಲಿಕೆಗಳು ಈ ಬ್ರೌಸರ್‌ನಲ್ಲೇ ಉಳಿಯುತ್ತವೆ; ಸರ್ವರ್‌ನಲ್ಲಿ ದಾಖಲೆಗಳನ್ನು ರಚಿಸುವುದಿಲ್ಲ.',
  'Open donor prototype':'ದಾನಿಗಳ ಮಾದರಿ ತೆರೆಯಿರಿ',
  'Live pickup records':'ನೇರ ಸಂಗ್ರಹ ದಾಖಲೆಗಳು', 'Window starts':'ಸಮಯ ಆರಂಭ', 'Window ends':'ಸಮಯ ಅಂತ್ಯ', 'Refresh':'ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ',
  'Load live pickups':'ನೇರ ಸಂಗ್ರಹಗಳನ್ನು ಲೋಡ್ ಮಾಡಿ', 'Select Load live pickups to view shared API records.':'ಹಂಚಿಕೆಯ API ದಾಖಲೆಗಳನ್ನು ನೋಡಲು ನೇರ ಸಂಗ್ರಹಗಳನ್ನು ಲೋಡ್ ಮಾಡಿ ಆಯ್ಕೆಮಾಡಿ.',
  'Read-only records from the shared API. The assignment table below uses demo data.':'ಹಂಚಿಕೆಯ API ಯಿಂದ ಓದಲು ಮಾತ್ರ ಇರುವ ದಾಖಲೆಗಳು. ಕೆಳಗಿನ ನಿಯೋಜನೆ ಪಟ್ಟಿಯಲ್ಲಿ ಮಾದರಿ ದತ್ತಾಂಶವಿದೆ.',
  'No live pickups found.':'ನೇರ ಸಂಗ್ರಹ ದಾಖಲೆಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',
  'Live API access is not configured for this deployment.':'ಈ ನಿಯೋಜನೆಗೆ ನೇರ API ಪ್ರವೇಶವನ್ನು ಹೊಂದಿಸಲಾಗಿಲ್ಲ.',
  'Sign in as an administrator under Settings to view live pickups.':'ನೇರ ಸಂಗ್ರಹಗಳನ್ನು ನೋಡಲು ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ನಿರ್ವಾಹಕರಾಗಿ ಸೈನ್ ಇನ್ ಮಾಡಿ.',
  'Your account does not have administrator access to pickups.':'ನಿಮ್ಮ ಖಾತೆಗೆ ಸಂಗ್ರಹಗಳ ನಿರ್ವಾಹಕ ಪ್ರವೇಶವಿಲ್ಲ.',
  'Could not load live pickups. Check the API connection and try again.':'ನೇರ ಸಂಗ್ರಹಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. API ಸಂಪರ್ಕವನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  'Preview this device\'s location. Vehicle trip history is not available in the admin API yet.':'ಈ ಸಾಧನದ ಸ್ಥಳವನ್ನು ಪೂರ್ವವೀಕ್ಷಿಸಿ. ವಾಹನ ಪ್ರಯಾಣದ ಇತಿಹಾಸ ಇನ್ನೂ ನಿರ್ವಾಹಕರ API ಯಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ.',
  'Location source':'ಸ್ಥಳದ ಮೂಲ', 'This browser':'ಈ ಬ್ರೌಸರ್', 'This preview is not linked to a vehicle or driver.':'ಈ ಪೂರ್ವವೀಕ್ಷಣೆ ವಾಹನ ಅಥವಾ ಚಾಲಕರಿಗೆ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ.',
  'Preview status':'ಪೂರ್ವವೀಕ್ಷಣೆ ಸ್ಥಿತಿ', 'This device location':'ಈ ಸಾಧನದ ಸ್ಥಳ', 'This device location map':'ಈ ಸಾಧನದ ಸ್ಥಳ ನಕ್ಷೆ',
  'Start preview to display this device location':'ಈ ಸಾಧನದ ಸ್ಥಳವನ್ನು ನೋಡಲು ಪೂರ್ವವೀಕ್ಷಣೆ ಆರಂಭಿಸಿ',
  'Location Details':'ಸ್ಥಳದ ವಿವರಗಳು', 'Latitude':'ಅಕ್ಷಾಂಶ', 'Longitude':'ರೇಖಾಂಶ', 'Accuracy':'ನಿಖರತೆ',
  'Your browser will ask for location permission. This preview does not report a vehicle location to the API.':'ನಿಮ್ಮ ಬ್ರೌಸರ್ ಸ್ಥಳದ ಅನುಮತಿ ಕೇಳುತ್ತದೆ. ಈ ಪೂರ್ವವೀಕ್ಷಣೆ ವಾಹನದ ಸ್ಥಳವನ್ನು API ಗೆ ಕಳುಹಿಸುವುದಿಲ್ಲ.',
  'Start Preview':'ಪೂರ್ವವೀಕ್ಷಣೆ ಆರಂಭಿಸಿ', 'Stop Preview':'ಪೂರ್ವವೀಕ್ಷಣೆ ನಿಲ್ಲಿಸಿ',
  'Geolocation is not supported by this browser.':'ಈ ಬ್ರೌಸರ್ ಸ್ಥಳಸೇವೆಯನ್ನು ಬೆಂಬಲಿಸುವುದಿಲ್ಲ.',
  'Location permission was denied. Please allow location access.':'ಸ್ಥಳದ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಸ್ಥಳ ಪ್ರವೇಶವನ್ನು ಅನುಮತಿಸಿ.',
  '● Active':'● ಸಕ್ರಿಯ', '○ Stopped':'○ ನಿಲ್ಲಿಸಲಾಗಿದೆ', 'Reading this device location':'ಈ ಸಾಧನದ ಸ್ಥಳವನ್ನು ಓದಲಾಗುತ್ತಿದೆ', 'Location preview inactive':'ಸ್ಥಳದ ಪೂರ್ವವೀಕ್ಷಣೆ ನಿಷ್ಕ್ರಿಯವಾಗಿದೆ',
  'PLANNED':'ಯೋಜಿಸಲಾಗಿದೆ', 'ASSIGNED':'ನಿಯೋಜಿಸಲಾಗಿದೆ', 'EN ROUTE':'ಮಾರ್ಗದಲ್ಲಿದೆ', 'ARRIVED AT DONOR':'ದಾನಿಗಳ ಸ್ಥಳಕ್ಕೆ ತಲುಪಿದೆ',
  'FOOD COLLECTED':'ಆಹಾರ ಸಂಗ್ರಹಿಸಲಾಗಿದೆ', 'DELIVERED':'ವಿತರಿಸಲಾಗಿದೆ', 'CANCELLED':'ರದ್ದಾಗಿದೆ', 'FAILED':'ವಿಫಲವಾಗಿದೆ',
}

function translateDynamic(value: string): string | undefined {
  let match: RegExpMatchArray | null
  if ((match = value.match(/^Showing (\d+) of (\d+) volunteers$/))) return `${match[1]} / ${match[2]} ಸ್ವಯಂಸೇವಕರು`
  if ((match = value.match(/^(\d+) profiles$/))) return `${match[1]} ಪ್ರೊಫೈಲ್‌ಗಳು`
  if ((match = value.match(/^(\d+) active teams$/))) return `${match[1]} ಸಕ್ರಿಯ ತಂಡಗಳು`
  if ((match = value.match(/^(\d+) members · (\d+) currently available$/))) return `${match[1]} ಸದಸ್ಯರು · ${match[2]} ಈಗ ಲಭ್ಯ`
  if ((match = value.match(/^(\d+) members$/))) return `${match[1]} ಸದಸ್ಯರು`
  if ((match = value.match(/^(\d+) results?$/))) return `${match[1]} ಫಲಿತಾಂಶಗಳು`
  if ((match = value.match(/^(\d+) shown$/))) return `${match[1]} ತೋರಿಸಲಾಗಿದೆ`
  if ((match = value.match(/^Step (\d+) of (\d+)$/))) return `ಹಂತ ${match[1]} / ${match[2]}`
  if ((match = value.match(/^STEP (\d+) \/ (\d+)$/))) return `ಹಂತ ${match[1]} / ${match[2]}`
  if ((match = value.match(/^Approximately (\d+) meals$/))) return `ಸುಮಾರು ${match[1]} ಊಟಗಳು`
  if ((match = value.match(/^(\d+) meals$/))) return `${match[1]} ಊಟಗಳು`
  if ((match = value.match(/^(\d+) team members$/))) return `${match[1]} ತಂಡದ ಸದಸ್ಯರು`
  if ((match = value.match(/^(\d+) kg$/))) return `${match[1]} ಕೆಜಿ`
  if ((match = value.match(/^Leader: (.+)$/))) return `ನಾಯಕ: ${match[1]}`
  if ((match = value.match(/^Choose a team for (.+)\.$/))) return `${match[1]} ಅವರನ್ನು ಸೇರಿಸಲು ತಂಡ ಆಯ್ಕೆಮಾಡಿ.`
  if ((match = value.match(/^Select an available team or an individual volunteer for (.+)\.$/))) return `${match[1]} ಗಾಗಿ ಲಭ್ಯ ತಂಡ ಅಥವಾ ಸ್ವಯಂಸೇವಕರನ್ನು ಆಯ್ಕೆಮಾಡಿ.`
  if ((match = value.match(/^Assignment marked (.+)\.$/))) return `ನಿಯೋಜನೆಯ ಸ್ಥಿತಿ ${kannada[match[1].replace(/\b\w/g, c => c.toUpperCase())] ?? match[1]} ಆಗಿದೆ.`
  if ((match = value.match(/^Remove (.+)$/))) return `${match[1]} ಅವರನ್ನು ತೆಗೆದುಹಾಕಿ`
  if ((match = value.match(/^Actions for (.+)$/))) return `${match[1]} ಅವರ ಕ್ರಿಯೆಗಳು`
  if ((match = value.match(/^([A-Za-z ]+) · Move from another team$/))) return `${match[1]} · ಬೇರೆ ತಂಡದಿಂದ ಸ್ಥಳಾಂತರಿಸಿ`
  if ((match = value.match(/^([A-Za-z ]+) · Unassigned$/))) return `${match[1]} · ತಂಡವಿಲ್ಲ`
  if ((match = value.match(/^([A-Za-z ]+) · (\d+) kg$/))) return `${match[1]} · ${match[2]} ಕೆಜಿ`
  return undefined
}

export function localize(value: string, language: Language): string {
  if (language === 'en') return value
  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  const clean = value.trim()
  if (!clean) return value
  const pieces = clean.split(', ')
  const listTranslation = pieces.length > 1 && pieces.every(piece => !!kannada[piece]) ? pieces.map(piece => kannada[piece]).join(', ') : undefined
  const titleCase = clean.replace(/\b\w/g, character => character.toUpperCase()).replace(/\B\w/g, character => character.toLowerCase())
  const statusTranslation = clean === clean.toUpperCase() && ['AVAILABLE','ASSIGNED','ON DUTY','OFF DUTY','UNAVAILABLE','PENDING','ACCEPTED','IN PROGRESS','COMPLETED','REJECTED','CANCELLED'].includes(clean) ? kannada[titleCase] : undefined
  return leading + (kannada[clean] ?? listTranslation ?? statusTranslation ?? translateDynamic(clean) ?? clean) + trailing
}

const textMemory = new WeakMap<Text, { original: string; rendered: string }>()
const attributeMemory = new WeakMap<Element, Map<string, { original: string; rendered: string }>>()

function syncText(node: Text, language: Language) {
  const current = node.nodeValue ?? ''
  let record = textMemory.get(node)
  if (!record || current !== record.rendered) { record = { original: current, rendered: current }; textMemory.set(node, record) }
  const next = localize(record.original, language)
  if (current !== next) node.nodeValue = next
  record.rendered = next
}

function syncAttributes(element: Element, language: Language) {
  let records = attributeMemory.get(element)
  if (!records) { records = new Map(); attributeMemory.set(element, records) }
  for (const name of ['placeholder', 'title', 'aria-label']) {
    const current = element.getAttribute(name)
    if (current === null) continue
    let record = records.get(name)
    if (!record || current !== record.rendered) { record = { original: current, rendered: current }; records.set(name, record) }
    const next = localize(record.original, language)
    if (current !== next) element.setAttribute(name, next)
    record.rendered = next
  }
}

function syncNode(node: Node, language: Language) {
  if (node.nodeType === Node.TEXT_NODE) { syncText(node as Text, language); return }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  if (element.closest('[data-no-localize]') || ['SCRIPT', 'STYLE'].includes(element.tagName)) return
  syncAttributes(element, language)
  element.childNodes.forEach(child => syncNode(child, language))
}

export function useRenderedLanguage(language: Language) {
  useEffect(() => {
    document.documentElement.lang = language
    document.body.classList.toggle('lang-kn', language === 'kn')
    syncNode(document.body, language)
    const observer = new MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === 'characterData') syncNode(change.target, language)
        else if (change.type === 'attributes') syncNode(change.target, language)
        else change.addedNodes.forEach(node => syncNode(node, language))
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] })
    return () => observer.disconnect()
  }, [language])
}
