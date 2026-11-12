import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, Header, Icon, InfoRow, Screen, Sheet, T, dateLabel } from '../../../components/common/UI';
import { C } from '../../../constants/theme';
import { useApp } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import LiveAssignments from '../../../components/volunteer/LiveAssignments';
export default function AssignmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const app = useApp(); const { language, t } = useLanguage();
  const [rejectOpen, setRejectOpen] = useState(false); const [reason, setReason] = useState('');
  if (app.role !== 'volunteer') return <Redirect href="/" />;
  if (app.mode === 'live') return <LiveAssignments assignmentId={id} />;
  const item = app.assignments.find(assignment => assignment.id === id);
  if (!item) return <Screen><Header title="Not found" back /></Screen>;
  const next = item.status === 'Pending' ? { title: 'Accept assignment', status: 'Accepted' as const } : item.status === 'Accepted' ? { title: 'Start pickup', status: 'In Progress' as const } : item.status === 'In Progress' ? { title: 'Check in at pickup', status: 'Checked In' as const } : item.status === 'Checked In' ? { title: 'Mark completed', status: 'Completed' as const } : null;
  return <Screen><Header title="Assignment details" back /><Card style={{ marginBottom: 16 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1 }}><T size={23} weight="800" color={C.ink} translate={false}>{item.event}</T><T size={13} color={C.muted} translate={false}>{item.id}</T></View><Badge value={item.status} /></View>
    <View style={{ height: 1, backgroundColor: C.line, marginVertical: 16 }} />
    <InfoRow icon="calendar" label="Pickup time" value={`${dateLabel(item.date, language)} · ${item.time}`} />
    <InfoRow icon="pin" label="Location" value={`${item.address} · ${item.distance}`} />
    <InfoRow icon="person" label="Your role" value={t(item.role)} />
  </Card>
  <T size={20} weight="700" color={C.ink} style={{ marginBottom: 11 }}>Team</T>
  <Card style={{ marginBottom: 16 }}><InfoRow icon="team" label="Team" value={item.team} /><InfoRow icon="person" label="Team leader" value={item.leader} />
    <T size={13} color={C.muted} style={{ marginTop: 8, marginBottom: 6 }}>Team members</T>{item.members.map(member => <T key={member} weight="600" style={{ marginBottom: 4 }} translate={false}>• {member}</T>)}</Card>
  <T size={20} weight="700" color={C.ink} style={{ marginBottom: 11 }}>Driver & vehicle</T>
  <Card style={{ marginBottom: 16 }}><InfoRow icon="person" label="Driver" value={`${item.driver} · ${item.driverPhone}`} /><InfoRow icon="truck" label="Vehicle" value={`${item.vehicle} · ${item.vehicleNumber}`} /><InfoRow icon="food" label="Capacity" value={item.capacity} /></Card>
  {!!item.notes && <Card style={{ marginBottom: 18 }}><T weight="700" color={C.ink}>Notes</T><T color={C.muted} style={{ marginTop: 5 }} translate={false}>{item.notes}</T></Card>}
  {next && <Button title={next.title} onPress={() => app.updateAssignment(item.id, next.status)} style={{ marginBottom: 9 }} />}
  {item.status === 'Pending' && <Button title="Reject assignment" variant="outline" onPress={() => setRejectOpen(true)} />}
  {item.status === 'Rejected' && !!item.rejectionReason && <Card><T weight="700">Rejected</T><T translate={false}>{item.rejectionReason}</T></Card>}
  <Sheet visible={rejectOpen} onClose={() => setRejectOpen(false)} title="Why are you declining?">
    {['Schedule conflict', 'Too far away', 'Not available', 'Other reason'].map(option => <Pressable key={option} accessibilityRole="button" onPress={() => setReason(option)} style={{ borderWidth: 1, borderColor: reason === option ? C.green : C.line, borderRadius: 12, minHeight: 50, paddingHorizontal: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: reason === option ? C.greenSoft : C.white }}><T weight="600">{option}</T>{reason === option && <Icon name="check" size={19} />}</Pressable>)}
    <Button title="Confirm rejection" variant="danger" disabled={!reason} onPress={() => { app.updateAssignment(item.id, 'Rejected', reason); setRejectOpen(false); }} />
    <Button title="Cancel" variant="quiet" onPress={() => setRejectOpen(false)} style={{ marginTop: 6 }} />
  </Sheet>
  </Screen>;
}
