import { ArrowRight, CalendarClock, CheckCircle2, Clock3, MapPin, PackageCheck, Plus, Users, UsersRound } from 'lucide-react'
import { events } from '../data/mockData'
import type { Assignment, Volunteer, VolunteerTeam } from '../types'
import { Avatar, formatDate, formatTime, SectionHeading, StatusBadge } from '../components/common/UI'

type Props = {
  volunteers: Volunteer[]
  teams: VolunteerTeam[]
  assignments: Assignment[]
  onCreateAssignment: () => void
  onViewAssignments: () => void
  onViewVolunteers: () => void
  onViewPickups?: () => void
}

export default function Dashboard({ volunteers, teams, assignments, onCreateAssignment, onViewAssignments, onViewVolunteers, onViewPickups }: Props) {
  const stats = [
    { label: 'Total Volunteers', value: 48 + Math.max(0, volunteers.length - 12), icon: Users, color: 'green' },
    { label: 'Available Volunteers', value: 21 + Math.max(0, volunteers.filter(v => v.status === 'AVAILABLE').length - 7), icon: CheckCircle2, color: 'blue' },
    { label: 'On Assignment', value: 8, icon: CalendarClock, color: 'orange' },
    { label: 'Active Teams', value: teams.length, icon: UsersRound, color: 'mint' },
  ]
  const availability = [
    { label: 'Available', count: 21, width: '44%', color: 'available' },
    { label: 'Assigned', count: 10, width: '21%', color: 'assigned' },
    { label: 'On Duty', count: 8, width: '17%', color: 'on-duty' },
    { label: 'Unavailable', count: 9, width: '18%', color: 'unavailable' },
  ]
  const pickup = events[0]

  return <>
    <div className="page-heading dashboard-heading">
      <div><h1>Volunteer Management</h1><p>Coordinate volunteers, teams and food-rescue assignments.</p></div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        {onViewPickups && <button className="button button-secondary" onClick={onViewPickups}><PackageCheck size={18}/> Pickup & Logistics</button>}
        <button className="button button-primary" onClick={onCreateAssignment}><Plus size={19}/> Create Assignment</button>
      </div>
    </div>

    <div className="stat-grid">{stats.map(stat => <div className="stat-card" key={stat.label}>
      <div className="stat-top"><span>{stat.label}</span><span className={`stat-icon ${stat.color}`}><stat.icon size={21}/></span></div>
      <strong>{stat.value}</strong>
    </div>)}</div>

    <div className="dashboard-workspace">
      <section className="panel operations-panel">
        <div className="operations-head"><div><SectionHeading title="Today’s Volunteer Operations" aside="View all" onClick={onViewAssignments}/><p className="card-subtitle">The next pickups your crews are coordinating.</p></div></div>
        <div className="table-scroll"><table className="data-table operations-table"><thead><tr><th>Volunteer / Team</th><th>Assignment</th><th>Role</th><th>Pickup Time</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {assignments.slice(0, 4).map(assignment => {
            const event = events.find(item => item.eventId === assignment.eventId)!
            const team = teams.find(item => item.teamId === assignment.teamId)
            const volunteer = volunteers.find(item => item.volunteerId === assignment.volunteerId)
            const person = volunteer ?? volunteers.find(item => item.volunteerId === team?.leaderId)
            return <tr key={assignment.assignmentId}>
              <td><div className="operation-person">{person && <Avatar name={person.name} size="sm"/>}<span><strong>{person?.name ?? team?.teamName}</strong><small>{team?.teamName ?? 'Individual volunteer'}</small></span></div></td>
              <td><div className="event-cell"><strong>{event.title}</strong><small>{event.location}</small></div></td>
              <td>{assignment.role}</td><td className="time-strong">{formatTime(event.dateTime)}</td><td><StatusBadge status={assignment.status}/></td>
              <td><button className="table-action" onClick={onViewAssignments}>View <ArrowRight size={16}/></button></td>
            </tr>
          })}
        </tbody></table></div>
      </section>

      <div className="dashboard-side">
        <section className="panel availability-card">
          <SectionHeading title="Volunteer Availability Overview" aside="View roster" onClick={onViewVolunteers}/>
          <p className="card-subtitle">Current roster state.</p>
          <div className="availability-rows">{availability.map(item => <div className="availability-row" key={item.label}>
            <span className={`availability-key ${item.color}`}><i/>{item.label}</span>
            <span className="availability-track"><i className={item.color} style={{ width: item.width }}/></span>
            <strong>{item.count}</strong>
          </div>)}</div>
        </section>
        <section className="next-pickup-card">
          <div className="next-pickup-label"><CalendarClock size={19}/> Next pickup window</div>
          <strong>{formatTime(pickup.dateTime)}</strong>
          <p>{pickup.title} · {pickup.location}</p>
          <div className="next-pickup-meta"><span><Clock3 size={15}/>{formatDate(pickup.dateTime)}</span><span><MapPin size={15}/>{pickup.location}</span></div>
          <button onClick={onCreateAssignment}>Create Assignment <ArrowRight size={16}/></button>
          {onViewPickups && <button className="button button-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={onViewPickups}><PackageCheck size={16}/> Pickup & Logistics</button>}
        </section>
      </div>
    </div>
  </>
}
