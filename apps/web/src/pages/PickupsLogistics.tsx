import { Plus, Search, Sparkles } from 'lucide-react'
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { EmptyState, formatDate, formatTime, StatusBadge } from '../components/common/UI'
import { AssignWizard } from '../features/pickups/AssignWizard'
import { CreatePickupDialog } from '../features/pickups/CreatePickupDialog'
import { usePickups } from '../features/pickups/hooks'
import { PickupDrawer } from '../features/pickups/PickupDrawer'
import type { LiveAssignment, Pickup } from '../features/pickups/types'
import type { Assignment, Volunteer, VolunteerTeam } from '../types'
import Assignments from './Assignments'

interface Props {
  assignments: Assignment[]
  setAssignments: Dispatch<SetStateAction<Assignment[]>>
  volunteers: Volunteer[]
  teams: VolunteerTeam[]
  onCreateAssignment: () => void
  notify: (message: string, kind?: 'success' | 'error') => void
}

type TabType = 'Pickups' | 'Assignments'

const friendlyNames: Record<string, string> = {
  PLANNED: 'Planned',
  ASSIGNED: 'Assigned',
  EN_ROUTE: 'En Route',
  ARRIVED_AT_DONOR: 'Arrived At Donor',
  FOOD_COLLECTED: 'Food Collected',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
}

export default function PickupsLogistics({
  assignments,
  setAssignments,
  volunteers,
  teams,
  onCreateAssignment,
  notify,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('Pickups')
  const [searchQuery, setSearchQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedPickup, setSelectedPickup] = useState<Pickup | null>(null)
  const [assignPickup, setAssignPickup] = useState<Pickup | null>(null)
  const [liveAssignmentsMap, setLiveAssignmentsMap] = useState<Record<string, LiveAssignment>>({})

  const {
    pickups,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reload,
  } = usePickups()

  const filteredPickups = useMemo(() => {
    if (!searchQuery.trim()) return pickups
    const q = searchQuery.toLowerCase().trim()
    return pickups.filter(
      p =>
        p.id.toLowerCase().includes(q) ||
        p.deliveryAddress.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        (p.donorName && p.donorName.toLowerCase().includes(q)) ||
        (p.aiAssessment?.vehicle.vehicleType &&
          p.aiAssessment.vehicle.vehicleType.toLowerCase().includes(q))
    )
  }, [pickups, searchQuery])

  const handlePickupCreated = (_newPickup: Pickup) => {
    void reload()
    notify('Pickup scheduled successfully.')
  }

  const handleAssignmentCreated = (newAssignment: LiveAssignment) => {
    setLiveAssignmentsMap(prev => ({
      ...prev,
      [newAssignment.pickupId]: newAssignment,
    }))
    void reload()
    notify('Crew assigned to pickup.')
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FOOD RESCUE LOGISTICS</span>
          <h1>Pickup & Logistics</h1>
          <p>Plan pickups, assign crews and vehicles, and follow every delivery.</p>
        </div>
        {activeTab === 'Pickups' && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={18} /> Schedule Pickup
          </button>
        )}
      </div>

      <div className="status-tabs" role="tablist" aria-label="Pickup sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'Pickups'}
          className={activeTab === 'Pickups' ? 'active' : ''}
          onClick={() => setActiveTab('Pickups')}
        >
          Pickups
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'Assignments'}
          className={activeTab === 'Assignments' ? 'active' : ''}
          onClick={() => setActiveTab('Assignments')}
        >
          Assignments
        </button>
      </div>

      {activeTab === 'Assignments' ? (
        <Assignments
          assignments={assignments}
          setAssignments={setAssignments}
          volunteers={volunteers}
          teams={teams}
          onCreateAssignment={onCreateAssignment}
          notify={notify}
        />
      ) : (
        <section className="panel" style={{ marginTop: '1.25rem' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>Loading pickups…</p>
            </div>
          ) : error ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
              <p>{error}</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void reload()}
                style={{ marginTop: '0.75rem' }}
              >
                Retry
              </button>
            </div>
          ) : filteredPickups.length === 0 ? (
            <EmptyState
              title="No pickups yet"
              description="Approved food requests will appear here once the live connection is ready."
              action={
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setCreateOpen(true)}
                >
                  Schedule Pickup
                </button>
              }
            />
          ) : (
            <>
              <div className="assignment-toolbar">
                <div className="search-wrap compact">
                  <Search size={18} />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search pickups"
                    aria-label="Search pickups"
                  />
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void reload()}
                >
                  Sync Donor Requests
                </button>
              </div>

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pickup ID</th>
                      <th>Pickup & Delivery Route</th>
                      <th>Window Time</th>
                      <th>Status</th>
                      <th>AI Logistics</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPickups.map(p => {
                      const vCount = p.aiAssessment?.vessels.reduce((a, v) => a + v.count, 0) || 2
                      const vCat =
                        p.aiAssessment?.vehicle.category === 'two_wheeler'
                          ? 'Two-Wheeler'
                          : p.aiAssessment?.vehicle.category === 'three_wheeler'
                          ? '3-Wheeler'
                          : 'Truck'
                      return (
                        <tr key={p.id}>
                          <td>
                            <button
                              type="button"
                              className="id-link"
                              onClick={() => setSelectedPickup(p)}
                            >
                              {p.id.slice(0, 8)}…
                            </button>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                                {p.donorName || 'Food Donor'}
                              </strong>
                              {p.donorLocation && (
                                <small style={{ display: 'block', color: '#475569' }}>
                                  📍 Pickup from: {p.donorLocation}
                                </small>
                              )}
                              <small style={{ display: 'block', color: '#047857', fontWeight: 500 }}>
                                ➔ Deliver to NGO: {p.deliveryAddress}
                              </small>
                              {p.foods && p.foods.length > 0 && (
                                <small style={{ display: 'block', color: '#b45309', fontWeight: 600, marginTop: '2px' }}>
                                  🥘 Food to collect: {p.foods.map(f => `${f.name} (${f.quantity} ${f.unit})`).join(', ')}
                                </small>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="time-cell">
                              <strong>{formatTime(p.windowStartsAt)}</strong>
                              <small>{formatDate(p.windowStartsAt)}</small>
                            </div>
                          </td>
                          <td>
                            <StatusBadge status={friendlyNames[p.status] || p.status} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: '12px',
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  border: '1px solid #a7f3d0',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap',
                                  width: 'fit-content',
                                }}
                              >
                                <Sparkles size={12} />
                                {p.aiAssessment
                                  ? `${p.aiAssessment.vehicle.vehicleType} · ${vCount} vessels`
                                  : `${vCat} · ${vCount} vessels`}
                              </span>
                              {p.aiAssessment && p.aiAssessment.vessels.length > 0 && (
                                <small style={{ color: '#64748b', fontSize: '0.72rem' }}>
                                  {p.aiAssessment.vessels.map(v => `${v.count}× ${v.containerType}`).join(', ')}
                                </small>
                              )}
                            </div>
                          </td>
                          <td className="actions-cell">
                            {p.status === 'PLANNED' && (
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() => setAssignPickup(p)}
                              >
                                Assign Crew
                              </button>
                            )}
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => setSelectedPickup(p)}
                            >
                              View details
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                <span>Pickups records · Bengaluru chapter</span>
                {hasMore && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {createOpen && (
        <CreatePickupDialog
          onClose={() => setCreateOpen(false)}
          onSuccess={handlePickupCreated}
          notify={notify}
        />
      )}

      {selectedPickup && (
        <PickupDrawer
          pickup={selectedPickup}
          assignment={liveAssignmentsMap[selectedPickup.id]}
          onClose={() => setSelectedPickup(null)}
          onOpenAssign={() => {
            setAssignPickup(selectedPickup)
            setSelectedPickup(null)
          }}
          onAssignmentUpdated={updated => {
            setLiveAssignmentsMap(prev => ({
              ...prev,
              [updated.pickupId]: updated,
            }))
            void reload()
          }}
          notify={notify}
        />
      )}

      {assignPickup && (
        <AssignWizard
          pickup={assignPickup}
          onClose={() => setAssignPickup(null)}
          onSuccess={handleAssignmentCreated}
          notify={notify}
        />
      )}
    </>
  )
}
