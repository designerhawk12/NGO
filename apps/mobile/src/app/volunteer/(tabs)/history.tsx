import React from 'react';
import LiveAssignments from '../../../components/volunteer/LiveAssignments';
import { AssignmentCard } from '../../../components/volunteer/AssignmentCard';
import { Empty, Header, Screen } from '../../../components/common/UI';
import { useApp } from '../../../context/AppContext';
export default function History() {
  const { assignments, mode } = useApp();
  if (mode === 'live') return <LiveAssignments historyOnly />;
  const items = assignments.filter(item => item.status === 'Completed' || item.status === 'Rejected');
  return <Screen><Header title="History" subtitle="Your impact so far." />
    {items.length ? items.map(item => <AssignmentCard key={item.id} item={item} />) : <Empty title="No past assignments yet" detail="Completed and closed assignments will appear here." icon="history" />}
  </Screen>;
}
